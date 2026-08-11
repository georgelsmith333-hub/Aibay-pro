import { getContext, json, normalizeInputString } from '../../lib/security'

type Env = Record<string, string | undefined>
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

  return json({
    status: env.AI_PROVIDER_API_KEY ? 'queued' : 'review_only',
    derivativeJobId: `img_${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`,
    mediaId,
    sourceUrl,
    requestedOutput: { width: 2000, height: 2000, preserveProductIdentity: true },
    reviewRequired: true,
    automaticPublishing: false,
    message: env.AI_PROVIDER_API_KEY ? 'Derivative request queued for the configured image provider.' : 'Configure an approved image provider to create the derivative; the source remains unchanged.',
  }, { status: 202 }, context.requestId)
}
