export type ResearchCandidate = {
  sourceUrl: string
  title: string
  brand?: string
  model?: string
  sku?: string
  price?: number | null
  currency?: string | null
  shipping?: number | null
  rating?: number | null
  reviewCount?: number | null
  availability?: string
  sourceReliability?: number
  evidence?: Array<{ label: string; value: string; source?: string; confidence?: number }>
}

export type NormalizedCandidate = ResearchCandidate & {
  canonicalUrl: string
  fingerprint: string
  normalizedTitle: string
  validation: { validSource: boolean; missing: string[]; warnings: string[] }
  score: { total: number; dimensions: Record<string, number>; explanation: string[] }
  duplicateOf?: string
}

function clean(value: unknown) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
}

function numeric(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function canonicalUrl(value: string) {
  const url = new URL(value)
  url.hash = ''
  for (const key of [...url.searchParams.keys()]) if (/^(?:utm_|gclid|fbclid|msclkid|spm|pvid|scm|_t|ref)/i.test(key)) url.searchParams.delete(key)
  return url.toString()
}

function normalizedTitle(title: string) {
  return clean(title).toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function fingerprint(candidate: ResearchCandidate, canonical: string) {
  const identity = clean(candidate.sku) || [clean(candidate.brand), clean(candidate.model), normalizedTitle(candidate.title)].filter(Boolean).join('|') || canonical
  return identity.toLowerCase().replace(/[^a-z0-9]+/g, ':')
}

function scoreCandidate(candidate: ResearchCandidate, missing: string[], warnings: string[]) {
  const price = numeric(candidate.price)
  const shipping = numeric(candidate.shipping) || 0
  const rating = numeric(candidate.rating)
  const reviewCount = numeric(candidate.reviewCount)
  const reliability = Math.max(0, Math.min(100, numeric(candidate.sourceReliability) ?? 60))
  const dimensions = {
    sourceReliability: reliability,
    evidenceCompleteness: Math.max(0, 100 - missing.length * 18 - warnings.length * 8),
    priceClarity: price !== null ? (candidate.currency ? 100 : 70) : 0,
    demandSignals: rating !== null ? Math.min(100, rating * 20 + Math.log10((reviewCount || 0) + 1) * 8) : 0,
    shippingClarity: candidate.shipping !== undefined ? (shipping >= 0 ? 100 : 0) : 25,
  }
  const total = Math.round(Object.values(dimensions).reduce((sum, value) => sum + value, 0) / Object.keys(dimensions).length)
  const explanation = [
    `Source reliability contributed ${Math.round(dimensions.sourceReliability)}/100.`,
    `Evidence completeness contributed ${Math.round(dimensions.evidenceCompleteness)}/100.`,
    price === null ? 'Price is missing and cannot support margin analysis.' : `Price is ${candidate.currency || 'currency unspecified'} ${price.toFixed(2)} before shipping.`,
    rating === null ? 'No rating signal was supplied.' : `Rating signal is ${rating.toFixed(1)} with ${reviewCount ?? 0} review count supplied.`,
  ]
  return { total, dimensions, explanation }
}

export function normalizeAndDeduplicate(input: ResearchCandidate[], max = 100) {
  const normalized: NormalizedCandidate[] = []
  const byFingerprint = new Map<string, NormalizedCandidate>()
  for (const raw of input.slice(0, max)) {
    const title = clean(raw.title)
    const sourceUrl = clean(raw.sourceUrl)
    if (!title || !sourceUrl) continue
    let canonical: string
    try { canonical = canonicalUrl(sourceUrl) } catch { continue }
    const missing = [!raw.brand && 'brand', !raw.model && 'model', numeric(raw.price) === null && 'price', !raw.currency && 'currency'].filter(Boolean) as string[]
    const warnings = [!raw.evidence?.length && 'No field-level evidence list was supplied.'].filter(Boolean) as string[]
    const candidate: NormalizedCandidate = { ...raw, sourceUrl, title, brand: clean(raw.brand) || undefined, model: clean(raw.model) || undefined, sku: clean(raw.sku) || undefined, price: numeric(raw.price), currency: clean(raw.currency) || null, shipping: numeric(raw.shipping), rating: numeric(raw.rating), reviewCount: numeric(raw.reviewCount), canonicalUrl: canonical, fingerprint: fingerprint(raw, canonical), normalizedTitle: normalizedTitle(title), validation: { validSource: true, missing, warnings }, score: scoreCandidate(raw, missing, warnings) }
    const duplicate = byFingerprint.get(candidate.fingerprint)
    if (duplicate) {
      const candidateScore = candidate.score.total
      if (candidateScore > duplicate.score.total) { candidate.duplicateOf = duplicate.canonicalUrl; byFingerprint.set(candidate.fingerprint, candidate); normalized.push(candidate) }
      else { candidate.duplicateOf = duplicate.canonicalUrl }
      continue
    }
    byFingerprint.set(candidate.fingerprint, candidate)
    normalized.push(candidate)
  }
  normalized.sort((a, b) => b.score.total - a.score.total)
  return { candidates: normalized, dropped: input.length - normalized.length, duplicateCount: input.length - normalized.length - Math.max(0, input.length - max), truncated: input.length > max }
}
