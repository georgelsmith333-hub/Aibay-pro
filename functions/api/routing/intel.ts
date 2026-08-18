import { routeScores } from '../../lib/route-intel'
import { getContext, json } from '../../lib/security'

type RequestContext = { request: Request; env: Record<string, unknown> }

export const onRequestGet = async ({ request, env }: RequestContext): Promise<Response> => {
  const context = getContext(request, env)
  const scores = await routeScores(env)
  return json({
    status: 'ok',
    checkedAt: new Date().toISOString(),
    autoRouting: true,
    scores,
    note: 'Route health is learned from real execution outcomes (success rate, recency-weighted failures, latency). Unconfigured providers are never promoted; policy blocks are never bypassed.',
  }, {}, context.requestId)
}
