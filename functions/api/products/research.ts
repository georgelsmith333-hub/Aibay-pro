import { canonicalUrl, normalizeAndDeduplicate, type ResearchCandidate } from '../../lib/research'

type RequestContext = { request: Request }

function json(payload: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers)
  headers.set('content-type', 'application/json; charset=utf-8')
  headers.set('cache-control', 'no-store')
  return new Response(JSON.stringify(payload), { ...init, headers })
}

function toCandidate(value: unknown): ResearchCandidate | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const sourceUrl = typeof record.sourceUrl === 'string' ? record.sourceUrl.trim() : ''
  const title = typeof record.title === 'string' ? record.title.trim() : ''
  if (!sourceUrl || !title) return null
  try { canonicalUrl(sourceUrl) } catch { return null }
  return {
    sourceUrl,
    title,
    brand: typeof record.brand === 'string' ? record.brand : undefined,
    model: typeof record.model === 'string' ? record.model : undefined,
    sku: typeof record.sku === 'string' ? record.sku : undefined,
    price: typeof record.price === 'number' ? record.price : null,
    currency: typeof record.currency === 'string' ? record.currency : null,
    shipping: typeof record.shipping === 'number' ? record.shipping : null,
    rating: typeof record.rating === 'number' ? record.rating : null,
    reviewCount: typeof record.reviewCount === 'number' ? record.reviewCount : null,
    availability: typeof record.availability === 'string' ? record.availability : undefined,
    sourceReliability: typeof record.sourceReliability === 'number' ? record.sourceReliability : undefined,
    evidence: Array.isArray(record.evidence) ? record.evidence.filter((item): item is { label: string; value: string; source?: string; confidence?: number } => Boolean(item && typeof item === 'object' && typeof (item as Record<string, unknown>).label === 'string' && typeof (item as Record<string, unknown>).value === 'string')) : undefined,
  }
}

export const onRequestPost = async ({ request }: RequestContext): Promise<Response> => {
  let body: { candidates?: unknown; max?: unknown }
  try { body = await request.json() as { candidates?: unknown; max?: unknown } } catch { return json({ error: 'invalid_json' }, { status: 400 }) }
  if (!Array.isArray(body.candidates)) return json({ status: 'not_configured', message: 'No candidate list was supplied. Configure an approved search/discovery provider or submit source-backed candidates for normalization.', candidates: [], provenance: [] }, { status: 200 })
  const max = typeof body.max === 'number' && Number.isFinite(body.max) ? Math.max(1, Math.min(100, Math.floor(body.max))) : 100
  const candidates = body.candidates.map(toCandidate).filter((item): item is ResearchCandidate => Boolean(item))
  const result = normalizeAndDeduplicate(candidates, max)
  return json({ status: 'completed', task: 'product_research', inputCount: body.candidates.length, acceptedCount: candidates.length, ...result, provenance: result.candidates.map((candidate) => ({ fingerprint: candidate.fingerprint, sourceUrl: candidate.sourceUrl, canonicalUrl: candidate.canonicalUrl, retrievedAt: new Date().toISOString(), method: 'user-supplied candidate normalization', provider: 'local.research.pipeline' })), note: 'Scores reflect supplied evidence completeness and source reliability. They are not sales predictions or live demand claims.' })
}
