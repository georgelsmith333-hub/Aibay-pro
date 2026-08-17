import { listingQualityScore } from '../../lib/intelligence'
import { getContext, json, normalizeInputString } from '../../lib/security'

type RequestContext = { request: Request }

function numeric(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export const onRequestPost = async ({ request }: RequestContext): Promise<Response> => {
  const context = getContext(request, {})
  let body: { listing?: unknown }
  try { body = await request.json() as typeof body } catch { return json({ error: 'invalid_json' }, { status: 400 }, context.requestId) }
  if (!body.listing || typeof body.listing !== 'object') return json({ error: 'listing_required', message: 'A listing object is required.' }, { status: 400 }, context.requestId)
  const listing = body.listing as Record<string, unknown>
  const result = listingQualityScore({
    title: normalizeInputString(listing.title, 300),
    description: normalizeInputString(listing.description, 20_000),
    itemSpecifics: listing.itemSpecifics,
    images: numeric(listing.images),
    price: numeric(listing.price),
    shipping: numeric(listing.shipping),
    category: normalizeInputString(listing.category, 120),
  })
  return json({ status: 'completed', score: result.score, components: result.components, fixes: result.fixes, computedAt: result.computedAt, note: 'The listing quality score is explainable; every fix is actionable.' }, { status: 200 }, context.requestId)
}
