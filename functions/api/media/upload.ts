import { bindingReport } from '../../lib/storage'
import { getContext, json, normalizeInputString } from '../../lib/security'

type Env = Record<string, unknown>
type RequestContext = { request: Request; env: Env }

const MAX_BYTES = 12 * 1024 * 1024

function safeFileName(value: string) {
  const cleaned = value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
  return cleaned.slice(0, 120) || 'upload'
}

export const onRequestPost = async ({ request, env }: RequestContext): Promise<Response> => {
  const context = getContext(request, env)
  const bindings = bindingReport(env)
  if (bindings.r2 !== 'configured') {
    return json({ error: 'media_storage_unavailable', status: 'request_only', storage: 'request_only', message: 'No R2 media bucket is configured. Keep the source in the local review flow or configure the dedicated media binding.' }, { status: 503 }, context.requestId)
  }

  let form: FormData
  try { form = await request.formData() } catch { return json({ error: 'multipart_required', message: 'Upload a multipart form with a file and rightsConfirmed=true.' }, { status: 400 }, context.requestId) }
  if (form.get('rightsConfirmed') !== 'true') return json({ error: 'rights_confirmation_required', message: 'Confirm that you have the right to store and use this image.' }, { status: 400 }, context.requestId)
  const file = form.get('file')
  if (!(file instanceof File)) return json({ error: 'file_required', message: 'An image file is required.' }, { status: 400 }, context.requestId)
  if (!file.type.startsWith('image/')) return json({ error: 'image_required', message: 'Only image uploads are accepted by this endpoint.' }, { status: 415 }, context.requestId)
  if (file.size <= 0 || file.size > MAX_BYTES) return json({ error: 'image_too_large', message: `Images must be between 1 byte and ${MAX_BYTES} bytes.` }, { status: 413 }, context.requestId)

  const sourceUrl = normalizeInputString(form.get('sourceUrl'), 2000)
  const key = `sources/${crypto.randomUUID().replaceAll('-', '')}-${safeFileName(file.name)}`
  const bucket = env.MEDIA_BUCKET as R2Bucket
  await bucket.put(key, file.stream(), {
    httpMetadata: { contentType: file.type },
    customMetadata: { rightsConfirmed: 'true', sourceUrl: sourceUrl || '', originalName: file.name.slice(0, 180), byteLength: String(file.size), uploadedAt: new Date().toISOString() },
  })
  return json({ status: 'stored', storage: 'r2', objectKey: key, sourceUrl: sourceUrl || null, objectUrl: `/api/media/object?key=${encodeURIComponent(key)}`, bytes: file.size, contentType: file.type, reviewRequired: true }, { status: 201 }, context.requestId)
}
