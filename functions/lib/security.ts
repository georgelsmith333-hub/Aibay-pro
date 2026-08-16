export type AiBayEnv = {
  APP_ENV?: string
  DEFAULT_MARKETPLACE?: string
  PUBLIC_API_VERSION?: string
  EBAY_CLIENT_ID?: string
  EBAY_CLIENT_SECRET?: string
  AI_PROVIDER_API_KEY?: string
}

export type AiBayContext = {
  requestId: string
  env: AiBayEnv
}

export function getContext(request: Request, env: AiBayEnv): AiBayContext {
  return {
    requestId: request.headers.get('cf-ray') || crypto.randomUUID(),
    env,
  }
}

export function json<T>(payload: T, init: ResponseInit = {}, requestId?: string) {
  const headers = new Headers(init.headers)
  headers.set('content-type', 'application/json; charset=utf-8')
  headers.set('cache-control', 'no-store')
  if (requestId) headers.set('x-aibay-request-id', requestId)
  return new Response(JSON.stringify(payload), { ...init, headers })
}

function isPrivateIpLiteral(hostname: string) {
  const host = hostname.replace(/^\\[|\\]$/g, '').toLowerCase()
  if (host === '::1' || host === '::' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80:') || host.startsWith('::ffff:127.') || host.startsWith('::ffff:10.') || host.startsWith('::ffff:192.168.')) return true
  const octets = host.split('.').map((part) => Number(part))
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false
  const [a, b] = octets
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || (a === 198 && b >= 18 && b <= 19) || a >= 224
}

export function assertSafePublicUrl(rawUrl: string) {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    throw new Error('Enter a complete public http(s) URL.')
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Only http(s) URLs are supported.')
  if (parsed.username || parsed.password) throw new Error('Credential-bearing URLs are not accepted.')
  const hostname = parsed.hostname.toLowerCase()
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname === '0.0.0.0' || hostname === '127.0.0.1' || hostname === '::1') {
    throw new Error('Local-network URLs are not accepted.')
  }
  if (isPrivateIpLiteral(hostname)) throw new Error('Private or reserved IP destinations are not accepted.')
  if (hostname.endsWith('.internal') || hostname.endsWith('.local')) throw new Error('Private-network hostnames are not accepted.')
  return parsed
}

export function safeHost(rawUrl: string) {
  try { return assertSafePublicUrl(rawUrl).hostname.replace(/^www\./, '') } catch { return 'unknown-source' }
}

export function normalizeInputString(value: unknown, maxLength = 2000) {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, maxLength)
}

export function requireMethod(request: Request, method: string) {
  if (request.method !== method) return json({ error: 'method_not_allowed' }, { status: 405 }, request.headers.get('cf-ray') || undefined)
  return null
}
