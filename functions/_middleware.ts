import { json } from './lib/security'

type Env = Record<string, string | undefined>
type MiddlewareContext = { request: Request; next: () => Promise<Response>; env: Env }

export const onRequest = async ({ request, next }: MiddlewareContext): Promise<Response> => {
  const origin = request.headers.get('Origin')
  if (request.method === 'OPTIONS') {
    const headers = new Headers()
    headers.set('access-control-allow-methods', 'GET, POST, OPTIONS')
    headers.set('access-control-allow-headers', 'content-type, authorization, x-idempotency-key')
    if (origin && new URL(request.url).origin === origin) {
      headers.set('access-control-allow-origin', origin)
      headers.set('access-control-allow-credentials', 'true')
    }
    return json({ ok: true }, { status: 204, headers })
  }

  const response = await next()
  const headers = new Headers(response.headers)
  headers.set('x-content-type-options', 'nosniff')
  headers.set('x-frame-options', 'DENY')
  headers.set('referrer-policy', 'strict-origin-when-cross-origin')
  headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=()')
  headers.set('x-aibay-request-id', request.headers.get('cf-ray') || crypto.randomUUID())
  if (origin && new URL(request.url).origin === origin) {
    headers.set('access-control-allow-origin', origin)
    headers.set('access-control-allow-credentials', 'true')
  }
  headers.set('access-control-allow-headers', 'content-type, authorization, x-idempotency-key')
  headers.set('access-control-allow-methods', 'GET, POST, OPTIONS')
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}
