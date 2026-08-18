export type SourceDiagnosticStatus = 'public_evidence' | 'session_required' | 'access_controlled' | 'redirect_loop' | 'redirect_limit' | 'incomplete' | 'unsupported'

export type SourceDiagnostic = {
  status: SourceDiagnosticStatus
  reason: string
  sourceHost: string
  adapter: string
  attemptedUrl: string
  redirectCount: number
  redirectHosts: string[]
}

export type SourceKind = 'product' | 'listing' | 'search' | 'document' | 'image' | 'article' | 'unknown'

type SourceAdapter = {
  id: string
  matches: (url: URL) => boolean
  normalize: (url: URL) => URL
  requiresSessionForRedirect?: (url: URL) => boolean
  /** Bounded alternate host for the same resource (e.g. .us <-> .com). */
  alternateFor?: (url: URL) => URL | null
}

const documentExtension = /\.(?:pdf|docx?|xlsx?|pptx?)$/i
const imageExtension = /\.(?:png|jpe?g|webp|gif|avif|svg)$/i

export function classifySourceKind(url: URL): SourceKind {
  if (documentExtension.test(url.pathname)) return 'document'
  if (imageExtension.test(url.pathname)) return 'image'
  if (/[?&](q|query|search)=/i.test(url.search) || /\/search(?:\/|$)|\/s(?:\/|$)/i.test(url.pathname)) return 'search'
  if (/\/itm(?:\/|$)|\/category\/|\/collections?\/|\/shop\/|\/browse\//i.test(url.pathname)) return 'listing'
  if (/\/item\/|\/products?(?:\/|$)|\/dp\/|\/gp\/product\/|\/p\//i.test(url.pathname)) return 'product'
  if (/\/blog\/|\/article\/|\/news\//i.test(url.pathname)) return 'article'
  return 'unknown'
}

const trackingParameter = /^(?:utm_[^=]+|gclid|fbclid|msclkid|_t|spm|gps-id|scm|scm_id|scm-url|pvid|pdp_ext_f|pdp_npi|utparam-url|curPageLogUid|browser_id|aff_trace_key|aff_platform|m_page_id|ref|ref_)$/i

function removeTracking(url: URL) {
  const cleaned = new URL(url)
  for (const key of [...cleaned.searchParams.keys()]) {
    if (trackingParameter.test(key)) cleaned.searchParams.delete(key)
  }
  return cleaned
}

const aliExpressAdapter: SourceAdapter = {
  id: 'aliexpress-public-metadata',
  matches: (url) => /(^|\.)aliexpress\.(com|us)$/i.test(url.hostname),
  normalize: (url) => {
    const cleaned = removeTracking(url)
    const match = cleaned.pathname.match(/^\/item\/(\d+)\.html$/i)
    if (!match) return cleaned
    // Preserve the given public locale (.com or .us); the alternate host is
    // only used as a bounded retry when the first locale forces a
    // cookie-sync gate. Never rewrite back — that would ping-pong.
    return new URL(`https://${cleaned.hostname}/item/${match[1]}.html`)
  },
  requiresSessionForRedirect: (url) => /(^|\.)login\.aliexpress\.(com|us)$/i.test(url.hostname) || /\/sync_cookie_(?:read|write)\.htm$/i.test(url.pathname),
  alternateFor: (url) => {
    const match = url.pathname.match(/^\/item\/(\d+)\.html$/i)
    if (!match) return null
    const from = url.hostname.replace(/^www\./, '')
    const alternate = from === 'aliexpress.com' ? 'www.aliexpress.us' : 'www.aliexpress.com'
    if (from === alternate.replace(/^www\./, '')) return null
    return new URL(`https://${alternate}/item/${match[1]}.html`)
  },
}

const genericPublicAdapter: SourceAdapter = {
  id: 'generic-public-metadata',
  matches: () => true,
  normalize: removeTracking,
}

export function adapterFor(url: URL): SourceAdapter {
  return [aliExpressAdapter, genericPublicAdapter].find((adapter) => adapter.matches(url)) || genericPublicAdapter
}

export function normalizePublicSource(url: URL) {
  const adapter = adapterFor(url)
  const normalized = adapter.normalize(url)
  return { adapter, url: normalized, kind: classifySourceKind(normalized) }
}

export function sessionRedirectDiagnostic(sourceUrl: URL, attemptedUrl: URL, adapter: SourceAdapter, redirectCount: number, redirectHosts: string[]): SourceDiagnostic {
  return {
    status: 'session_required',
    reason: 'This marketplace redirects anonymous requests through a cookie-synchronization flow before it exposes product metadata. AiBay does not replay session cookies or emulate a logged-in browser.',
    sourceHost: sourceUrl.hostname.replace(/^www\./, ''),
    adapter: adapter.id,
    attemptedUrl: attemptedUrl.toString(),
    redirectCount,
    redirectHosts,
  }
}

export function unsupportedDiagnostic(sourceUrl: URL, attemptedUrl: URL, adapter: SourceAdapter, kind: SourceKind): SourceDiagnostic {
  return {
    status: 'unsupported',
    reason: `This source was identified as a ${kind} resource, but the current product importer has no safe structured adapter for it. Use a permitted product page or continue with user-provided evidence.`,
    sourceHost: sourceUrl.hostname.replace(/^www\\./, ''),
    adapter: adapter.id,
    attemptedUrl: attemptedUrl.toString(),
    redirectCount: 0,
    redirectHosts: [sourceUrl.hostname.replace(/^www\\./, '')],
  }
}

export function redirectDiagnostic(status: Extract<SourceDiagnosticStatus, 'redirect_loop' | 'redirect_limit'>, sourceUrl: URL, attemptedUrl: URL, adapter: SourceAdapter, redirectCount: number, redirectHosts: string[]): SourceDiagnostic {
  return {
    status,
    reason: status === 'redirect_loop'
      ? 'This public source redirected back to an already inspected URL before exposing a stable product page.'
      : 'This public source exceeded the bounded redirect limit before exposing a stable product page.',
    sourceHost: sourceUrl.hostname.replace(/^www\./, ''),
    adapter: adapter.id,
    attemptedUrl: attemptedUrl.toString(),
    redirectCount,
    redirectHosts,
  }
}
