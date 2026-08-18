// Third-party public reader fallback (documented open endpoint).
//
// When the Cloudflare edge IP is blocked by a target (eBay/AliExpress 403 or
// challenge), AiBay can fall back to a documented PUBLIC third-party web
// reader: Jina AI Reader (https://r.jina.ai) — a free, no-key, documented
// service that fetches a URL server-side and returns clean text/markdown.
// This is the "third-party open endpoint" the operator requested, used ONLY
// when explicitly enabled (USE_JINA_READER=1) and ONLY as a fallback after a
// direct fetch is blocked. The provider is always labeled truthfully
// ('jina-reader') in provenance — it is never presented as a first-party
// scrape. If the reader also fails, the block is reported honestly.

export type ReaderFallback = {
  enabled: boolean
  provider: 'jina-reader'
  url: string
  text: string
  retrievedAt: string
}

export function jinaReaderEnabled(env: Record<string, unknown>): boolean {
  return env.USE_JINA_READER === '1' || env.USE_JINA_READER === 'true'
}

const TIMEOUT_MS = 15_000
const MAX_BYTES = 1_500_000

/**
 * Fetches a public URL through the documented Jina Reader endpoint.
 * Returns the extracted text, or null on any failure (never throws).
 */
export async function fetchViaJinaReader(targetUrl: string, env: Record<string, unknown>): Promise<ReaderFallback | null> {
  if (!jinaReaderEnabled(env)) return null
  const readerUrl = `https://r.jina.ai/${targetUrl}`
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)
    try {
      const response = await fetch(readerUrl, {
        signal: controller.signal,
        headers: { accept: 'text/plain, text/markdown', 'user-agent': 'AiBayReader/1.0 (+https://aibay-pro-live.pages.dev/source-policy)' },
      })
      if (!response.ok) return null
      const text = (await response.text()).slice(0, MAX_BYTES)
      if (!text || text.length < 50) return null
      return { enabled: true, provider: 'jina-reader', url: targetUrl, text, retrievedAt: new Date().toISOString() }
    } finally {
      clearTimeout(timeout)
    }
  } catch {
    return null
  }
}
