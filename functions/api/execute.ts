import { executeTask } from '../lib/execution'
import { adapterRegistrySnapshot } from '../lib/adapters'
import { assertSafePublicUrl, getContext, json, normalizeInputString } from '../lib/security'
import type { TaskKind } from '../lib/orchestrator'

type Env = Record<string, string | undefined>
type RequestContext = { request: Request; env: Env }

const EXECUTABLE_TASKS = new Set<TaskKind>(['product_import', 'public_scrape', 'public_search'])

export const onRequestPost = async ({ request, env }: RequestContext): Promise<Response> => {
  const context = getContext(request, env)
  let body: { task?: unknown; sourceUrl?: unknown; consent?: unknown }
  try { body = await request.json() as typeof body } catch { return json({ error: 'invalid_json' }, { status: 400 }, context.requestId) }

  const task = typeof body.task === 'string' && EXECUTABLE_TASKS.has(body.task as TaskKind) ? body.task as TaskKind : null
  if (!task) return json({ error: 'unsupported_task', message: 'This endpoint executes bounded public acquisition tasks.', allowedTasks: [...EXECUTABLE_TASKS] }, { status: 422 }, context.requestId)

  const sourceUrl = normalizeInputString(body.sourceUrl, 2000)
  if (!sourceUrl) return json({ error: 'source_url_required', message: 'A public source URL is required.' }, { status: 400 }, context.requestId)
  if (body.consent !== true) return json({ error: 'rights_confirmation_required', message: 'Confirm that you are permitted to use the source information and assets.' }, { status: 400 }, context.requestId)

  let validated: string
  try {
    validated = assertSafePublicUrl(sourceUrl).toString()
  } catch (error) {
    return json({ error: 'unsafe_source_url', message: error instanceof Error ? error.message : 'The source URL is not accepted.' }, { status: 422 }, context.requestId)
  }

  const result = await executeTask(env, task, validated)
  return json({
    status: result.status,
    jobId: result.jobId,
    task: result.task,
    route: result.route,
    attempts: result.attempts,
    observations: result.observations,
    fallbackUsed: result.fallbackUsed,
    error: result.error,
    cache: result.cache,
    adapters: adapterRegistrySnapshot(env),
    note: result.note,
    startedAt: result.startedAt,
    endedAt: result.endedAt,
  }, { status: result.status === 'blocked' ? 409 : result.status === 'failed' ? 502 : 200 }, context.requestId)
}
