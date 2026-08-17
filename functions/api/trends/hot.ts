import { hotTrending, type TrendSeries } from '../../lib/tools'
import { getContext, json, normalizeInputString } from '../../lib/security'

type RequestContext = { request: Request }

export const onRequestGet = async ({ request }: RequestContext): Promise<Response> => {
  const context = getContext(request, {})
  return json({
    status: 'insufficient_evidence',
    items: [],
    note: 'No trend observation series is stored in this deployment. Trending requires repeated dated observations (≥3 per keyword, ≥20% delta). Submit observation series via POST to compute evidence-gated risers.',
    guidance: 'POST {"series":[{"keyword":"wireless earbuds","observations":[{"date":"2026-08-01","count":10},...]}]}',
  }, {}, context.requestId)
}

export const onRequestPost = async ({ request }: RequestContext): Promise<Response> => {
  const context = getContext(request, {})
  let body: { series?: unknown; minObservations?: unknown; deltaThresholdPct?: unknown }
  try { body = await request.json() as typeof body } catch { return json({ error: 'invalid_json' }, { status: 400 }, context.requestId) }
  if (!Array.isArray(body.series)) return json({ error: 'series_required', message: 'A series array is required.' }, { status: 400 }, context.requestId)
  const series: TrendSeries[] = body.series.slice(0, 50).flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const record = item as Record<string, unknown>
    const keyword = normalizeInputString(record.keyword, 120)
    const observations = Array.isArray(record.observations) ? record.observations.flatMap((observation) => {
      if (!observation || typeof observation !== 'object') return []
      const entry = observation as Record<string, unknown>
      const date = typeof entry.date === 'string' ? entry.date : ''
      const count = typeof entry.count === 'number' ? entry.count : Number(entry.count)
      if (!date || !Number.isFinite(count)) return []
      return [{ date, count }]
    }) : []
    if (!keyword || !observations.length) return []
    return [{ keyword, observations }]
  })
  const minObservations = typeof body.minObservations === 'number' ? Math.max(2, Math.min(20, Math.floor(body.minObservations))) : 3
  const deltaThresholdPct = typeof body.deltaThresholdPct === 'number' ? Math.max(1, Math.min(200, body.deltaThresholdPct)) : 20
  const result = hotTrending(series, { minObservations, deltaThresholdPct })
  const hotCount = result.items.filter((item) => item.state === 'HOT').length
  return json({ status: hotCount ? 'completed' : 'insufficient_evidence', ...result, hotCount, note: `Trending computed from supplied observation series (min ${minObservations} observations, ${deltaThresholdPct}% delta threshold). HOT is only declared with that evidence.` }, { status: 200 }, context.requestId)
}
