import { createCacheStore } from '../lib/cache'
import { FINGERPRINT_VERSION } from '../lib/dedup'
import { classifyFailure, planRoute, validateSourceForTask, type TaskKind } from '../lib/orchestrator'

 type RequestContext = { request: Request; env: Record<string, unknown> }

const tasks = new Set<TaskKind>(['product_import', 'public_scrape', 'public_search', 'market_research', 'product_research', 'listing_draft', 'manual_continuation'])

export const onRequestPost = async ({ request, env }: RequestContext): Promise<Response> => {
  let body: { task?: unknown; sourceUrl?: unknown }
  try { body = await request.json() as { task?: unknown; sourceUrl?: unknown } } catch { return Response.json({ error: 'invalid_json' }, { status: 400 }) }
  const task = typeof body.task === 'string' && tasks.has(body.task as TaskKind) ? body.task as TaskKind : null
  const sourceUrl = typeof body.sourceUrl === 'string' ? body.sourceUrl.trim() : undefined
  if (!task) return Response.json({ error: 'unsupported_task', allowedTasks: [...tasks] }, { status: 422 })
  try {
    validateSourceForTask(task, sourceUrl)
    const cache = createCacheStore(env, 'route').health
    return Response.json({
      status: 'planned',
      route: planRoute(env, task, sourceUrl),
      persistence: 'request_only',
      cache: { mode: cache.mode, backend: cache.backend, durable: cache.durable, binding: cache.binding },
      dedup: { mode: 'local_deterministic', fingerprintVersion: FINGERPRINT_VERSION },
      note: 'Planning is live. Durable execution requires a configured queue and job store.',
    }, { status: 200 })
  } catch (error) {
    const failure = classifyFailure(error)
    return Response.json({ status: 'rejected', error: failure.category, retryable: failure.retryable, message: failure.message }, { status: failure.category === 'unsafe_destination' ? 422 : 400 })
  }
}
