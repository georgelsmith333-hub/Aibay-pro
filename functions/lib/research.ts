import { canonicalizeUrl, deduplicate, identityFingerprint } from './dedup'

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
  conflicts: string[]
}

function clean(value: unknown) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
}

function numeric(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export { canonicalizeUrl as canonicalUrl }

function normalizedTitle(title: string) {
  return clean(title).toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function conflictLabels(kept: NormalizedCandidate, duplicate: NormalizedCandidate): string[] {
  const conflicts: string[] = []
  if (kept.brand && duplicate.brand && kept.brand !== duplicate.brand) conflicts.push('brand')
  if (kept.model && duplicate.model && kept.model !== duplicate.model) conflicts.push('model')
  if (kept.price != null && duplicate.price != null && kept.price !== duplicate.price) conflicts.push('price')
  if (kept.currency && duplicate.currency && kept.currency !== duplicate.currency) conflicts.push('currency')
  return conflicts
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
  const accepted: NormalizedCandidate[] = []
  const truncated = input.length > max
  for (const raw of input.slice(0, max)) {
    const title = clean(raw.title)
    const sourceUrl = clean(raw.sourceUrl)
    if (!title || !sourceUrl) continue
    let canonical: string
    try { canonical = canonicalizeUrl(sourceUrl) } catch { continue }
    const missing = [!raw.brand && 'brand', !raw.model && 'model', numeric(raw.price) === null && 'price', !raw.currency && 'currency'].filter(Boolean) as string[]
    const warnings = [!raw.evidence?.length && 'No field-level evidence list was supplied.'].filter(Boolean) as string[]
    accepted.push({ ...raw, sourceUrl, title, brand: clean(raw.brand) || undefined, model: clean(raw.model) || undefined, sku: clean(raw.sku) || undefined, price: numeric(raw.price), currency: clean(raw.currency) || null, shipping: numeric(raw.shipping), rating: numeric(raw.rating), reviewCount: numeric(raw.reviewCount), canonicalUrl: canonical, fingerprint: identityFingerprint({ sku: raw.sku, brand: raw.brand, model: raw.model, title, canonicalUrl: canonical }), normalizedTitle: normalizedTitle(title), validation: { validSource: true, missing, warnings }, score: scoreCandidate(raw, missing, warnings), conflicts: [] })
  }
  const outcome = deduplicate(accepted, {
    fingerprintOf: (candidate) => candidate.fingerprint,
    prefer: (a, b) => a.score.total - b.score.total,
    conflictingValues: conflictLabels,
    identityOf: (candidate) => candidate.canonicalUrl,
  })
  const normalized = outcome.records.map((record) => ({ ...record.entry, duplicateOf: record.duplicateOf, conflicts: record.conflicts }))
  normalized.sort((a, b) => b.score.total - a.score.total)
  return {
    candidates: normalized,
    dropped: (input.length - accepted.length) + outcome.dropped,
    duplicateCount: outcome.duplicateCount,
    conflictCount: outcome.conflictCount,
    truncated,
    dedup: { method: outcome.method, fingerprintVersion: outcome.fingerprintVersion, mode: 'local_deterministic' },
  }
}
