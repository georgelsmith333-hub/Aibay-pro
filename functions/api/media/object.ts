import { bindingReport } from '../../lib/storage'
import { getContext, json } from '../../lib/security'

type Env = Record<string, unknown>
type RequestContext = { request: Request; env: Env }

export const onRequestGet = async ({ request, env }: RequestContext): Promise<Response> => {
  const context = getContext(request, env)
  if (bindingReport(env).r2 !== 'configured') return json({ error: 'media_storage_unavailable', message: 'No R2 media bucket is configured.' }, { status: 503 }, context.requestId)
  const key = new URL(request.url).searchParams.get('key') || ''
  if (!key || (!key.startsWith('sources/') && !key.startsWith('derivatives/')) || key.includes('..')) return json({ error: 'invalid_media_key', message: 'Only AiBay media object keys are readable.' }, { status: 400 }, context.requestId)
  const bucket = env.MEDIA_BUCKET as R2Bucket
  const object = await bucket.get(key)
  if (!object) return json({ error: 'media_not_found' }, { status: 404 }, context.requestId)
  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set('etag', object.httpEtag)
  headers.set('cache-control', 'private, max-age=300')
  return new Response(object.body, { status: 200, headers })
}
