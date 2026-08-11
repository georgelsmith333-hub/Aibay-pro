import { getContext, json } from '../../lib/security'

type Env = Record<string, string | undefined>
type RequestContext = { request: Request; env: Env; params: Record<string, string | undefined> }

export const onRequestGet = async ({ request, env, params }: RequestContext): Promise<Response> => {
  const context = getContext(request, env)
  const id = String(params.id || '')
  if (!id) return json({ error: 'job_id_required' }, { status: 400 }, context.requestId)

  return json({
    jobId: id,
    status: env.APP_ENV === 'production' ? 'queued' : 'demo_ready',
    source: 'server-job-store',
    events: [
      { id: 'validate', label: 'Validate source', state: 'complete' },
      { id: 'extract', label: 'Extract evidence', state: 'complete' },
      { id: 'normalize', label: 'Normalize product', state: 'active' },
      { id: 'research', label: 'Research eBay US', state: 'pending' },
      { id: 'ready', label: 'Ready for review', state: 'pending' },
    ],
    updatedAt: new Date().toISOString(),
  }, {}, context.requestId)
}
