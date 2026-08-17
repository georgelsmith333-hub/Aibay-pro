import { bindingReport } from '../../lib/storage'
import { createCacheStore } from '../../lib/cache'
import { FINGERPRINT_VERSION } from '../../lib/dedup'
import { getContext, json } from '../../lib/security'

type Env = Record<string, unknown>
type RequestContext = { request: Request; env: Env }

export const onRequestGet = async ({ request, env }: RequestContext): Promise<Response> => {
  const context = getContext(request, env)
  const bindings = bindingReport(env)
  const cache = createCacheStore(env, 'jobs').health
  const jobStore = bindings.d1 === 'configured'
  const queue = bindings.queue === 'configured'
  const jobPersistence = jobStore && queue ? 'durable' : 'request_only'
  return json({
    status: 'ok',
    persistence: jobPersistence,
    infrastructurePersistence: bindings.persistence,
    queue: queue ? 'configured' : 'not_configured',
    store: jobStore ? 'configured' : 'not_configured',
    cache: { mode: cache.mode, backend: cache.backend, durable: cache.durable, binding: cache.binding },
    dedup: { mode: 'local_deterministic', fingerprintVersion: FINGERPRINT_VERSION },
    activeJobs: [],
    message: jobPersistence === 'durable'
      ? 'Durable job store and queue are configured; individual task adapters report their execution status.'
      : 'D1/KV infrastructure may be durable, but no Queue-backed background worker is configured. Current job responses remain request-scoped and are not presented as completed background work.',
    checkedAt: new Date().toISOString(),
  }, {}, context.requestId)
}
