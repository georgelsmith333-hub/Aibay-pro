import { bindingReport } from '../lib/storage'
import { createCacheStore } from '../lib/cache'
import { getContext, json } from '../lib/security'
import { browserRunStatus } from '../lib/adapters'

type RequestContext = { request: Request; env: Record<string, unknown> }

export const onRequestGet = async ({ request, env }: RequestContext): Promise<Response> => {
  const context = getContext(request, env)
  const report = bindingReport(env)
  const cache = createCacheStore(env, 'infra').health
  const browser = browserRunStatus(env)
  return json({
    status: 'ok',
    checkedAt: new Date().toISOString(),
    persistence: report.persistence,
    bindings: { d1: report.d1, kv: report.kv, r2: report.r2, queue: report.queue },
    cache: { mode: cache.mode, backend: cache.backend, durable: cache.durable },
    browserRun: browser,
    workersAi: { configured: Boolean(env.CLOUDFLARE_API_TOKEN && env.CLOUDFLARE_ACCOUNT_ID), note: 'Workers AI route is auto-configured when the Cloudflare token and account id are set as server-side secrets.' },
    note: report.note,
  }, {}, context.requestId)
}
