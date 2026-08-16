import { getContext, json } from '../../lib/security'

type Env = Record<string, string | undefined>
type RequestContext = { request: Request; env: Env }

export const onRequestGet = async ({ request, env }: RequestContext): Promise<Response> => {
  const context = getContext(request, env)
  const durable = Boolean(env.DATABASE_URL || env.JOB_QUEUE || env.R2_MEDIA_BUCKET)
  return json({
    status: 'ok',
    persistence: durable ? 'configured' : 'request_only',
    queue: env.JOB_QUEUE ? 'configured' : 'not_configured',
    store: env.DATABASE_URL ? 'configured' : 'not_configured',
    activeJobs: [],
    message: durable ? 'Durable job infrastructure is configured; individual task adapters report their own execution status.' : 'No durable queue or job store is configured in this Pages deployment. Import responses remain authoritative for request-scoped planning and execution state.',
    checkedAt: new Date().toISOString(),
  }, {}, context.requestId)
}
