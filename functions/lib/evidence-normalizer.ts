export type NormalizationState = 'verified' | 'derived' | 'needs_review' | 'unknown'

export type EvidenceInput = {
  label: string
  value: unknown
  state?: NormalizationState
  method?: string
  source?: string
  confidence?: number
  capturedAt?: string
}

export type NormalizedEvidenceField = {
  label: string
  value: string
  state: NormalizationState
  method: string
  source: string
  confidence: number
  capturedAt?: string
}

export type PriceObservation = {
  price?: number | null
  currency?: string | null
  shipping?: number | null
}

export type PriceBandStatistics = {
  count: number
  currency: string | null
  min: number | null
  p25: number | null
  median: number | null
  p75: number | null
  max: number | null
  average: number | null
}

function asText(value: unknown) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try { return JSON.stringify(value) } catch { return '' }
}

function canonicalLabel(label: string) {
  return label.trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, ' ')
}

function methodScore(method: string) {
  const value = method.toLocaleLowerCase()
  if (/official|browse-api|api/.test(value)) return 1
  if (/json-ld|schema|microdata|visible|public-search|manufacturer/.test(value)) return 0.85
  if (/manual|user|seller-provided/.test(value)) return 0.7
  if (/derived|computed|inferred/.test(value)) return 0.55
  return 0.35
}

function normalizeState(input: EvidenceInput, confidence: number, text: string): NormalizationState {
  if (!text) return 'unknown'
  if (input.state === 'needs_review') return 'needs_review'
  if (input.state === 'derived') return 'derived'
  if (input.state === 'verified') return confidence >= 0.7 ? 'verified' : 'needs_review'
  if (input.state === 'unknown') return 'unknown'
  if (/derived|computed|inferred/i.test(input.method || '')) return 'derived'
  if (/manual|user|seller-provided/i.test(input.method || '')) return 'needs_review'
  return confidence >= 0.7 ? 'verified' : 'needs_review'
}

function candidateScore(input: EvidenceInput, text: string) {
  const confidence = Math.min(1, Math.max(0, Number(input.confidence ?? methodScore(input.method || 'unknown')) || 0))
  return (text ? 1 : 0) * 2 + confidence + methodScore(input.method || '')
}

export function normalizeEvidenceFields(inputs: EvidenceInput[]): NormalizedEvidenceField[] {
  const selected = new Map<string, { input: EvidenceInput; text: string; score: number }>()
  for (const input of inputs) {
    const label = input.label.trim()
    if (!label) continue
    const text = asText(input.value)
    const key = canonicalLabel(label)
    const score = candidateScore(input, text)
    const previous = selected.get(key)
    if (!previous || score > previous.score) selected.set(key, { input, text, score })
  }
  return [...selected.values()].map(({ input, text }) => {
    const confidence = Math.min(1, Math.max(0, Number(input.confidence ?? methodScore(input.method || 'unknown')) || 0))
    return {
      label: input.label.trim(),
      value: text,
      state: normalizeState(input, confidence, text),
      method: input.method?.trim() || 'unknown',
      source: input.source?.trim() || 'unknown-source',
      confidence,
      ...(input.capturedAt ? { capturedAt: input.capturedAt } : {}),
    }
  })
}

function percentile(values: number[], fraction: number) {
  if (!values.length) return null
  const index = (values.length - 1) * fraction
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  if (lower === upper) return values[lower] ?? null
  const lowerValue = values[lower] ?? values[0]
  const upperValue = values[upper] ?? values[values.length - 1]
  return lowerValue + (upperValue - lowerValue) * (index - lower)
}

export function priceBandStatistics(observations: PriceObservation[]): PriceBandStatistics {
  const priced = observations
    .map((observation) => {
      const price = Number(observation.price)
      const shipping = Number(observation.shipping || 0)
      return Number.isFinite(price) && price > 0 ? price + (Number.isFinite(shipping) && shipping > 0 ? shipping : 0) : null
    })
    .filter((price): price is number => price !== null)
    .sort((a, b) => a - b)
  const currencies = observations.map((observation) => observation.currency).filter((currency): currency is string => Boolean(currency))
  const currency = currencies.length ? currencies.sort((a, b) => currencies.filter((value) => value === b).length - currencies.filter((value) => value === a).length)[0] || null : null
  const average = priced.length ? priced.reduce((sum, value) => sum + value, 0) / priced.length : null
  return {
    count: priced.length,
    currency,
    min: priced[0] ?? null,
    p25: percentile(priced, 0.25),
    median: percentile(priced, 0.5),
    p75: percentile(priced, 0.75),
    max: priced[priced.length - 1] ?? null,
    average,
  }
}

export function sellThroughRate(soldVolume: number | null | undefined, activeVolume: number | null | undefined) {
  const sold = Number(soldVolume)
  const active = Number(activeVolume)
  if (!Number.isFinite(sold) || sold < 0 || !Number.isFinite(active) || active < 0 || sold + active <= 0) return null
  return sold / (sold + active)
}

export function summarizeSoldObservations(listings: Array<{ soldCount?: number | null; price?: number | null; currency?: string | null; shipping?: number | null }>) {
  const soldVolume = listings.reduce((sum, listing) => sum + (Number.isFinite(Number(listing.soldCount)) ? Math.max(0, Number(listing.soldCount)) : 0), 0)
  const observedSoldSignals = listings.filter((listing) => Number.isFinite(Number(listing.soldCount))).length
  return {
    soldVolume,
    observedSoldSignals,
    priceBand: priceBandStatistics(listings),
    note: observedSoldSignals ? 'Sold counts are visible listing-level signals where supplied by the provider; they are not a complete marketplace sold-history census.' : 'No sold-count signal was supplied by the provider.',
  }
}
