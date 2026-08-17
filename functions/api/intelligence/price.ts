import { classifyTrend, priceStats } from '../../lib/intelligence'
import { getContext, json } from '../../lib/security'

type RequestContext = { request: Request }

export const onRequestPost = async ({ request }: RequestContext): Promise<Response> => {
  const context = getContext(request, {})
  let body: { prices?: unknown; values?: unknown; thresholdPct?: unknown }
  try { body = await request.json() as typeof body } catch { return json({ error: 'invalid_json' }, { status: 400 }, context.requestId) }
  const points = Array.isArray(body.prices) ? body.prices.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const record = item as Record<string, unknown>
    const price = typeof record.price === 'number' ? record.price : Number(record.price)
    const at = typeof record.at === 'string' ? record.at : ''
    if (!Number.isFinite(price) || !at) return []
    return [{ at, price }]
  }) : []
  const values = Array.isArray(body.values) ? body.values.map(Number).filter((value) => Number.isFinite(value)) : points.map((point) => point.price)
  const threshold = typeof body.thresholdPct === 'number' && Number.isFinite(body.thresholdPct) ? Math.max(1, Math.min(50, body.thresholdPct)) : 5
  const stats = priceStats(values)
  const trend = classifyTrend(points, threshold)
  return json({ status: 'completed', stats, trend, note: 'Price statistics are computed from supplied observations only. Trend classification requires repeated dated observations; otherwise INSUFFICIENT_DATA is returned.' }, { status: 200 }, context.requestId)
}
