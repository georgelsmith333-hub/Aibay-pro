import { scoreOpportunity, type OpportunityInput } from '../../lib/intelligence'
import { getContext, json, normalizeInputString } from '../../lib/security'

type RequestContext = { request: Request }

function numeric(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export const onRequestPost = async ({ request }: RequestContext): Promise<Response> => {
  const context = getContext(request, {})
  let body: { productTitle?: unknown; observedPrice?: unknown; supplierPrice?: unknown; listings?: unknown; keywordCount?: unknown; sources?: unknown }
  try { body = await request.json() as typeof body } catch { return json({ error: 'invalid_json' }, { status: 400 }, context.requestId) }
  const input: OpportunityInput = {
    productTitle: normalizeInputString(body.productTitle, 300) || null,
    observedPrice: numeric(body.observedPrice),
    supplierPrice: numeric(body.supplierPrice),
    keywordCount: numeric(body.keywordCount),
    sources: numeric(body.sources),
    listings: Array.isArray(body.listings) ? body.listings.slice(0, 200).map((item) => {
      if (!item || typeof item !== 'object') return null
      const record = item as Record<string, unknown>
      return { title: typeof record.title === 'string' ? record.title : undefined, price: numeric(record.price), soldVolume: numeric(record.soldVolume), activeVolume: numeric(record.activeVolume), rating: numeric(record.rating) }
    }).filter((item): item is NonNullable<typeof item> => Boolean(item)) : null,
  }
  return json({ status: 'completed', ...scoreOpportunity(input), note: 'Opportunity components are explainable and evidence-gated. ESTIMATED/INFERRED values are never presented as verified.' }, { status: 200 }, context.requestId)
}
