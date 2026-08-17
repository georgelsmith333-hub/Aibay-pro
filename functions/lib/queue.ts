import type { Env } from './storage'

export type ResearchJobEnvelope = {
  version: 1
  jobId: string
  mission: string
  requestId: string
  payload: Record<string, unknown>
  enqueuedAt: string
}

export type QueueDispatch = {
  status: 'queued' | 'not_configured' | 'consumer_not_enabled' | 'failed'
  detail: string
}

export async function enqueueResearchJob(env: Env, envelope: ResearchJobEnvelope): Promise<QueueDispatch> {
  const queue = env.JOB_QUEUE as Queue<ResearchJobEnvelope> | undefined
  if (!queue) return { status: 'not_configured', detail: 'JOB_QUEUE is not bound in this request environment.' }
  if (env.JOB_CONSUMER_ENABLED !== true && env.JOB_CONSUMER_ENABLED !== 'true') return { status: 'consumer_not_enabled', detail: 'JOB_QUEUE is bound, but no queue consumer is explicitly enabled; synchronous execution remains the honest route.' }
  try {
    await queue.send(envelope)
    return { status: 'queued', detail: 'Research job published to the configured Cloudflare Queue.' }
  } catch (error) {
    return { status: 'failed', detail: error instanceof Error ? error.message : 'Cloudflare Queue rejected the job envelope.' }
  }
}
