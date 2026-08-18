import { classifySoldError, searchSoldLocal } from '../../lib/sold'
import { getContext, json, normalizeInputString } from '../../lib/security'

type RequestContext = { request: Request }

export const onRequestPost = async ({ request }: RequestContext): Promise<Response> => {
  const context = getContext(request, {})
  let body: { query?: unknown; limit?: unknown }
  try { body = await request.json() as typeof body } catch { return json({ error: 'invalid_json' }, { status: 400 }, context.requestId) }
  const query = normalizeInputString(body.query, 160)
  if (!query) return json({ error: 'query_required', message: 'A product or market query is required.' }, { status: 400 }, context.requestId)
  const limit = Math.min(Math.max(Number(body.limit || 40), 1), 60)
  try {
    const result = await searchSoldLocal(query, limit)
    return json({ status: 'completed', ...result, note: `${result.note} Zero-key public completed-items reader; blocks are reported truthfully.` }, { status: 200 }, context.requestId)
  } catch (error) {
    const failure = classifySoldError(error)
    if (failure.category === 'blocked_by_policy') {
      return json({ error: 'ebay_sold_blocked', status: 'blocked', message: failure.message, alternatives: ['Retry later from a different network.', 'Configure the official eBay Browse API for richer sold data when available.', 'Continue with user-provided evidence.'] }, { status: 409 }, context.requestId)
    }
    if (failure.category === 'rate_limited') return json({ error: 'ebay_sold_rate_limited', message: failure.message }, { status: 429 }, context.requestId)
    return json({ error: 'sold_research_unavailable', message: failure.message }, { status: 503 }, context.requestId)
  }
}
