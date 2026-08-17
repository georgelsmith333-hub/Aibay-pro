import { createCacheStore } from '../../lib/cache'
import { FINGERPRINT_VERSION } from '../../lib/dedup'
import { readJob, type Env } from '../../lib/storage'
import { getContext, json } from '../../lib/security'

type RequestContext = { request: Request; env: Env; params: Record<string, string | undefined> }

export const onRequestGet = async ({ request, env, params }: RequestContext): Promise<Response> => {
  const context = getContext(request, env as never)
  const id = String(params.id || '').trim()
  if (!id) return json({ error: 'job_id_required' }, { status: 400 }, context.requestId)
  const cache = createCacheStore(env, 'jobs').health
  const job = await readJob(env, id)
  if (!job) {
    return json({
      jobId: id,
      status: 'unavailable',
      persistence: env.DB ? 'durable' : 'request_only',
      cache: { mode: cache.mode, backend: cache.backend, durable: cache.durable, binding: cache.binding },
      dedup: { mode: 'local_deterministic', fingerprintVersion: FINGERPRINT_VERSION },
      message: env.DB ? 'No research job exists with this id.' : 'D1 is not configured, so this job cannot be polled durably.',
      events: [],
      updatedAt: new Date().toISOString(),
      retryable: !env.DB,
    }, { status: env.DB ? 404 : 503 }, context.requestId)
  }
  return json({ ...job, cache: { mode: cache.mode, backend: cache.backend, durable: cache.durable, binding: cache.binding }, dedup: { mode: 'local_deterministic', fingerprintVersion: FINGERPRINT_VERSION }, pollUrl: `/api/jobs/${job.id}` }, {}, context.requestId)
}
