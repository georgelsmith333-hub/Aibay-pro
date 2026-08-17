import { assertSafePublicUrl, getContext, json } from '../../lib/security'

type Env = Record<string, unknown>
type RequestContext = { request: Request; env: Env }

const MAX_IMAGE_BYTES = 8_000_000

export const onRequestGet = async ({ request }: RequestContext): Promise<Response> => {
  const context = getContext(request, {})
  const sourceValue = new URL(request.url).searchParams.get('url') || ''
  if (!sourceValue) return json({ error: 'source_url_required', message: 'An image source URL is required.' }, { status: 400 }, context.requestId)
  try {
    const sourceUrl = assertSafePublicUrl(sourceValue)
    const upstream = await fetch(sourceUrl, {
      redirect: 'follow',
      headers: { accept: 'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8', 'user-agent': 'AiBayMediaPreview/1.0 (+https://aibay-pro-george-live.pages.dev/source-policy)' },
    })
    if (!upstream.ok) return json({ error: 'media_source_unavailable', message: `The image source returned HTTP ${upstream.status}.`, sourceUrl: sourceUrl.toString() }, { status: 409 }, context.requestId)
    const contentType = (upstream.headers.get('content-type') || '').split(';')[0].toLowerCase()
    if (!contentType.startsWith('image/')) return json({ error: 'media_type_not_supported', message: 'The source did not return an image.', contentType, sourceUrl: sourceUrl.toString() }, { status: 415 }, context.requestId)
    const declaredSize = Number(upstream.headers.get('content-length') || 0)
    if (declaredSize > MAX_IMAGE_BYTES) return json({ error: 'media_too_large', message: 'The source image exceeds AiBay’s bounded preview limit.', maxBytes: MAX_IMAGE_BYTES }, { status: 413 }, context.requestId)
    const body = await upstream.arrayBuffer()
    if (body.byteLength > MAX_IMAGE_BYTES) return json({ error: 'media_too_large', message: 'The source image exceeds AiBay’s bounded preview limit.', maxBytes: MAX_IMAGE_BYTES }, { status: 413 }, context.requestId)
    return new Response(body, { status: 200, headers: { 'content-type': contentType, 'cache-control': 'public, max-age=900, stale-while-revalidate=3600', 'x-content-type-options': 'nosniff', 'x-aibay-source-host': sourceUrl.hostname.replace(/^www\./, '') } })
  } catch (error) {
    return json({ error: 'media_preview_failed', message: error instanceof Error ? error.message : 'The image source could not be previewed.' }, { status: 422 }, context.requestId)
  }
}
