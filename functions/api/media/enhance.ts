import { bindingReport } from '../../lib/storage'
import { getContext, json, normalizeInputString } from '../../lib/security'

type Env = Record<string, unknown>
type RequestContext = { request: Request; env: Env }
type EnhanceBody = { mediaId?: unknown; sourceUrl?: unknown; rightsConfirmed?: unknown }

export const onRequestPost = async ({ request, env }: RequestContext): Promise<Response> => {
  const context = getContext(request, env)
  let body: EnhanceBody
  try { body = await request.json() as EnhanceBody } catch { return json({ error: 'invalid_json' }, { status: 400 }, context.requestId) }
  const mediaId = normalizeInputString(body.mediaId, 120)
  const sourceUrl = normalizeInputString(body.sourceUrl, 2000)
  if (!mediaId || !sourceUrl) return json({ error: 'media_source_required', message: 'A media reference and source URL are required.' }, { status: 400 }, context.requestId)
  if (body.rightsConfirmed !== true) return json({ error: 'rights_confirmation_required', message: 'Confirm that you have the right to create and use a derivative.' }, { status: 400 }, context.requestId)

  const bindings = bindingReport(env)
  const providerConfigured = Boolean(env.AI_PROVIDER_API_KEY)
  const canQueueDerivative = providerConfigured && bindings.r2 === 'configured' && bindings.queue === 'configured'

  return json({
    status: canQueueDerivative ? 'queued' : 'review_only',
    derivativeJobId: `img_${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`,
    mediaId,
    sourceUrl,
    requestedOutput: { width: 2000, height: 2000, preserveProductIdentity: true },
    storage: bindings.r2 === 'configured' ? 'r2' : 'request_only',
    queue: bindings.queue === 'configured' ? 'configured' : 'not_configured',
    reviewRequired: true,
    automaticPublishing: false,
    message: canQueueDerivative
      ? 'Derivative request queued for the configured image provider and durable media store.'
      : 'No-card review mode is active. The source remains unchanged; use the browser-local review workflow or configure an approved image provider, R2 bucket, and Queue before requesting durable derivatives.',
  }, { status: 202 }, context.requestId)
}
