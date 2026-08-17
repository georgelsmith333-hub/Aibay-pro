import { rankListingTitlesWithAi } from '../../lib/ai'
import { buildDeterministicListing, type ListingEvidence, type ListingInput, type ListingMediaInput, type MarketObservation } from '../../lib/listing'
import { getContext, json, normalizeInputString } from '../../lib/security'

type Env = Record<string, string | undefined>
type RequestContext = { request: Request; env: Env }
type OptimizeBody = {
  productTitle?: unknown
  description?: unknown
  brand?: unknown
  model?: unknown
  gtin?: unknown
  currency?: unknown
  selectedVariant?: unknown
  evidence?: unknown
  market?: unknown
  media?: unknown
  descriptionTargetWords?: unknown
  sourceSnapshotId?: unknown
}

function parseEvidence(value: unknown): ListingEvidence[] {
  if (!Array.isArray(value)) return []
  return value.slice(0, 75).flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const record = item as Record<string, unknown>
    const state = record.state
    if (!['verified', 'derived', 'needs_review', 'unknown'].includes(String(state))) return []
    return [{
      label: normalizeInputString(record.label, 80),
      value: normalizeInputString(record.value, 500),
      state: state as ListingEvidence['state'],
      source: normalizeInputString(record.source, 500),
    }]
  }).filter((field) => field.label)
}

function parseMarket(value: unknown): MarketObservation[] {
  if (!Array.isArray(value)) return []
  return value.slice(0, 100).flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const record = item as Record<string, unknown>
    const matched = record.matched === 'direct' ? 'direct' : 'comparable'
    const price = Number(record.price)
    if (!Number.isFinite(price) || price < 0) return []
    return [{
      title: normalizeInputString(record.title, 160),
      price,
      shipping: Number.isFinite(Number(record.shipping)) ? Number(record.shipping) : 0,
      condition: normalizeInputString(record.condition, 80),
      matched,
      seller: normalizeInputString(record.seller, 120),
      url: normalizeInputString(record.url, 2000),
      image: normalizeInputString(record.image, 2000),
      capturedAt: normalizeInputString(record.capturedAt, 60),
      dataScope: record.dataScope === 'sold_observation' ? 'sold_observation' : 'active_listing_observation',
    }]
  })
}

function parseMedia(value: unknown): ListingMediaInput[] {
  if (!Array.isArray(value)) return []
  return value.slice(0, 20).flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const record = item as Record<string, unknown>
    const id = normalizeInputString(record.id, 120)
    if (!id) return []
    return [{ id, alt: normalizeInputString(record.alt, 300), source: normalizeInputString(record.source, 500), width: Number(record.width) || 0, height: Number(record.height) || 0, enhanced: record.enhanced === true, derivativeStatus: normalizeInputString(record.derivativeStatus, 40) }]
  })
}

export const onRequestPost = async ({ request, env }: RequestContext): Promise<Response> => {
  const context = getContext(request, env)
  let body: OptimizeBody
  try { body = await request.json() as OptimizeBody } catch { return json({ error: 'invalid_json' }, { status: 400 }, context.requestId) }
  const productTitle = normalizeInputString(body.productTitle, 300)
  const evidence = parseEvidence(body.evidence)
  if (!productTitle && !evidence.length) return json({ error: 'product_evidence_required', message: 'A product title or evidence set is required.' }, { status: 400 }, context.requestId)
  const variantRecord = body.selectedVariant && typeof body.selectedVariant === 'object' ? body.selectedVariant as Record<string, unknown> : null
  const attributes = variantRecord?.attributes && typeof variantRecord.attributes === 'object' ? Object.fromEntries(Object.entries(variantRecord.attributes as Record<string, unknown>).map(([key, value]) => [key, normalizeInputString(value, 80)])) : {}
  const input: ListingInput = {
    productTitle,
    description: normalizeInputString(body.description, 10_000),
    brand: normalizeInputString(body.brand, 120),
    model: normalizeInputString(body.model, 160),
    gtin: normalizeInputString(body.gtin, 50),
    currency: normalizeInputString(body.currency, 3) || 'USD',
    selectedVariant: variantRecord ? { label: normalizeInputString(variantRecord.label, 180), sku: normalizeInputString(variantRecord.sku, 120), attributes } : undefined,
    evidence,
    market: parseMarket(body.market),
    media: parseMedia(body.media),
    descriptionTargetWords: Math.min(1800, Math.max(250, Number(body.descriptionTargetWords) || 1800)),
  }
  const deterministicPackage = buildDeterministicListing(input)
  const { listingPackage, aiRouting } = await rankListingTitlesWithAi(input, deterministicPackage, env)
  return json({
    status: 'review_ready',
    optimizationId: `opt_${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`,
    sourceSnapshotId: normalizeInputString(body.sourceSnapshotId, 120) || null,
    listingPackage,
    aiRouting,
    aiProviderConfigured: aiRouting.enabled && aiRouting.routes.some((route) => route.configured),
    note: 'This package is evidence-grounded and draft-only. Human review is required before export; no marketplace action has been performed.',
  }, { status: 201 }, context.requestId)
}
