import { assertSafePublicUrl, getContext, json, normalizeInputString } from '../lib/security'

import { createJobSnapshot, validateSourceForTask } from '../lib/orchestrator'

type Env = Record<string, string | undefined>
type RequestContext = { request: Request; env: Env }
type ImportBody = {

  sourceUrl?: unknown
  consent?: unknown
}

export const onRequestPost = async ({ request, env }: RequestContext): Promise<Response> => {
  const context = getContext(request, env)
  const idempotencyKey = request.headers.get('x-idempotency-key') || crypto.randomUUID()
  let body: ImportBody
  try {
    body = await request.json() as ImportBody
  } catch {
    return json({ error: 'invalid_json', message: 'Send a JSON body.' }, { status: 400 }, context.requestId)
  }

  const sourceUrl = normalizeInputString(body.sourceUrl)
  if (!sourceUrl) return json({ error: 'source_url_required', message: 'A public product URL is required.' }, { status: 400 }, context.requestId)
  if (body.consent !== true) return json({ error: 'rights_confirmation_required', message: 'Confirm that you are permitted to use the source information and assets.' }, { status: 400 }, context.requestId)

  let parsedUrl: URL
  try {
    parsedUrl = assertSafePublicUrl(sourceUrl)
    validateSourceForTask('product_import', parsedUrl.toString())
  } catch (error) {
    return json({ error: 'unsafe_source_url', message: error instanceof Error ? error.message : 'The source URL is not accepted.' }, { status: 422 }, context.requestId)
  }

  if (/captcha|login|signin|blocked/i.test(sourceUrl)) {
    return json({
      error: 'source_requires_manual_fallback',
      status: 'blocked',
      message: 'This source appears to require restricted access. AiBay does not bypass CAPTCHA, login, or anti-bot controls.',
      alternatives: ['Use a public manufacturer page.', 'Upload source evidence you own.', 'Paste product fields manually.', 'Connect an approved provider API.'],
    }, { status: 409 }, context.requestId)
  }

  const job = createJobSnapshot(env, 'product_import', parsedUrl.toString(), 'request_only')
  return json({
    jobId: job.jobId,
    idempotencyKey,
    status: job.status,
    source: { url: parsedUrl.toString(), host: parsedUrl.hostname.replace(/^www\\./, ''), accessTier: 'public_metadata' },
    route: job.route,
    stages: job.events,
    job,
    demoMode: env.APP_ENV !== 'production',
    createdAt: new Date().toISOString(),
    persistence: 'request_only',
  }, { status: 202 }, context.requestId)
}
