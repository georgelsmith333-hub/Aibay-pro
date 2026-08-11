export type SourceDiagnosticStatus = 'public_evidence' | 'session_required' | 'access_controlled' | 'redirect_loop' | 'redirect_limit' | 'incomplete'

export type SourceDiagnostic = {
  status: SourceDiagnosticStatus
  reason: string
  sourceHost: string
  adapter: string
  attemptedUrl: string
  redirectCount: number
  redirectHosts: string[]
}

type SourceAdapter = {
  id: string
  matches: (url: URL) => boolean
  normalize: (url: URL) => URL
  requiresSessionForRedirect?: (url: URL) => boolean
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
    return new URL(`https://www.aliexpress.us/item/${match[1]}.html`)
  },
  requiresSessionForRedirect: (url) => /(^|\.)login\.aliexpress\.(com|us)$/i.test(url.hostname) || /\/sync_cookie_(?:read|write)\.htm$/i.test(url.pathname),
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
  return { adapter, url: adapter.normalize(url) }
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
