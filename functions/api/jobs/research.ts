import { onRequestPost as runEbayResearch } from '../ebay/research'
import { enqueueResearchJob } from '../../lib/queue'
import { createJob, updateJob, type Env } from '../../lib/storage'
import { getContext, json } from '../../lib/security'

type RequestContext = { request: Request; env: Env }

export const onRequestPost = async ({ request, env }: RequestContext): Promise<Response> => {
  const context = getContext(request, env as never)
  const cloned = request.clone()
  let payload: Record<string, unknown>
  try { payload = await cloned.json() as Record<string, unknown> } catch { return json({ error: 'invalid_json' }, { status: 400 }, context.requestId) }
  const job = await createJob(env, { mission: 'ebay_research', requestId: context.requestId })
  const envelope = { version: 1 as const, jobId: job.id, mission: job.mission, requestId: context.requestId, payload, enqueuedAt: new Date().toISOString() }
  const dispatch = await enqueueResearchJob(env, envelope)
  if (dispatch.status === 'queued') {
    await updateJob(env, job.id, { status: 'queued' })
    return json({ status: 'queued', execution: 'cloudflare-queue', jobId: job.id, persistence: job.persistence, queue: dispatch.detail, pollUrl: `/api/jobs/${job.id}` }, { status: 202 }, context.requestId)
  }

  // No enabled consumer means the request must not get stuck in a queue that
  // nobody processes. Execute the existing research adapter now and persist
  // the actual response for clients that want one uniform job contract.
  await updateJob(env, job.id, { status: 'running' })
  try {
    const response = await runEbayResearch({ request, env: env as never })
    const result = await response.clone().json().catch(() => ({ error: 'research_response_not_json' }))
    const status = response.ok ? 'complete' : response.status === 409 ? 'blocked' : response.status === 429 || response.status >= 500 ? 'unavailable' : 'failed'
    await updateJob(env, job.id, { status, result })
    return json({ status, execution: 'synchronous-fallback', jobId: job.id, persistence: job.persistence, queue: dispatch, result, pollUrl: `/api/jobs/${job.id}` }, { status: response.status }, context.requestId)
  } catch (error) {
    const result = { error: 'job_execution_failed', message: error instanceof Error ? error.message : 'Synchronous research execution failed.' }
    await updateJob(env, job.id, { status: 'failed', result })
    return json({ status: 'failed', execution: 'synchronous-fallback', jobId: job.id, persistence: job.persistence, result, pollUrl: `/api/jobs/${job.id}` }, { status: 503 }, context.requestId)
  }
}
