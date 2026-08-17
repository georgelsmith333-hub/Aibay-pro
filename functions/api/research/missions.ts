import { planMission } from '../../lib/intelligence'
import { getContext, json, normalizeInputString } from '../../lib/security'

type RequestContext = { request: Request }

export const onRequestPost = async ({ request }: RequestContext): Promise<Response> => {
  const context = getContext(request, {})
  let body: { mission?: unknown; inputs?: unknown }
  try { body = await request.json() as typeof body } catch { return json({ error: 'invalid_json' }, { status: 400 }, context.requestId) }
  const mission = normalizeInputString(body.mission, 60)
  if (!mission) return json({ error: 'mission_required', message: 'A mission id is required.', missions: ['winning_products', 'competitor_deep_dive', 'supplier_match', 'product_arbitrage', 'price_gap', 'trend_hunter', 'new_seller_analysis', 'listing_audit', 'store_audit', 'category_opportunity', 'marketplace_comparison', 'low_competition_products', 'high_margin_products', 'dropshipping_candidates'] }, { status: 400 }, context.requestId)
  const rawInputs = body.inputs && typeof body.inputs === 'object' ? body.inputs as Record<string, unknown> : {}
  const inputs: Record<string, string | undefined> = {
    url: normalizeInputString(rawInputs.url, 2000),
    keyword: normalizeInputString(rawInputs.keyword, 200),
  }
  try {
    const plan = planMission(mission, inputs)
    return json({ status: 'planned', plan, note: 'Planning is live and request-scoped. Execution of URL steps can run through the bounded router; search steps require a configured provider.' }, { status: 200 }, context.requestId)
  } catch (error) {
    return json({ error: 'unknown_mission', message: error instanceof Error ? error.message : 'Unknown mission.' }, { status: 404 }, context.requestId)
  }
}
