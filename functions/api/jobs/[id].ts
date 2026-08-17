import { createCacheStore } from '../../lib/cache'
import { FINGERPRINT_VERSION } from '../../lib/dedup'
import { getContext, json } from '../../lib/security'

type Env = Record<string, string | undefined>
type RequestContext = { request: Request; env: Env; params: Record<string, string | undefined> }

export const onRequestGet = async ({ request, env, params }: RequestContext): Promise<Response> => {
  const context = getContext(request, env)
  const id = String(params.id || '')
  if (!id) return json({ error: 'job_id_required' }, { status: 400 }, context.requestId)
  const cache = createCacheStore(env, 'jobs').health
  return json({
    jobId: id,
    status: 'not_persisted',
    persistence: 'request_only',
    cache: { mode: cache.mode, backend: cache.backend, durable: cache.durable, binding: cache.binding },
    dedup: { mode: 'local_deterministic', fingerprintVersion: FINGERPRINT_VERSION },
    message: 'This Pages deployment does not have a durable queue or job-store binding. The original request response contains the authoritative planning and execution snapshot.',
    events: [],
    updatedAt: new Date().toISOString(),
    retryable: false,
    requiredInfrastructure: ['durable job store', 'queue or background worker'],
  }, {}, context.requestId)
}
