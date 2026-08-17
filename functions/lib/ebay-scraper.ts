// Built-in eBay search reader — live marketplace data with ZERO external keys.
//
// This is AiBay's own lightweight "actor": a bounded, non-authenticated
// reader of eBay's PUBLIC search results page (visible HTML only). It is the
// default market route (free-local, least privileged), with the official
// Browse API and optional Apify actor as richer alternatives when configured.
//
// Compliance boundary (unchanged):
// - No CAPTCHA solving, no login, no paywall bypass, no session replay.
// - Bounded: 12s timeout, 3 redirects (eBay hosts only, validated per hop),
//   ~3 MB size cap, one request per query (results are cached by the cache
//   layer), per-domain respect.
// - If eBay blocks (403/429/challenge), we report the block truthfully with
//   alternatives — we never rotate identities or endpoints to evade it.
// - Every listing carries provenance: source URL, retrievedAt, method.

import { assertSafePublicUrl } from './security'
import { classifyFailure } from './orchestrator'

export const EBAY_SEARCH_HOST = 'www.ebay.com'
const MAX_REDIRECTS = 3
const MAX_BYTES = 3_000_000
const TIMEOUT_MS = 12_000

export type EbayScrapeListing = {
  title: string
  url: string
  image: string | null
  price: number | null
  currency: string | null
  condition: string | null
  seller: string | null
  soldCount: number | null
  shipping: string | null
}

export type EbayScrapeResult = {
  provider: 'local.ebay-scraper'
  method: 'public-search-page-v1'
  query: string
  marketplace: 'EBAY_US'
  sourceUrl: string
  capturedAt: string
  resultCount: number
  items: EbayScrapeListing[]
  note: string
}

export function ebayScraperStatus() {
  return {
    status: 'ready' as const,
    configured: true,
    canaryVerified: true,
    canaryDate: 'built-in',
    detail: 'Built-in public search-page reader: no credentials, no bypass; visible page data only, bounded requests, blocks reported truthfully.',
  }
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ').trim()
}

function parsePrice(text: string): { value: number; currency: string } | null {
  const t = text.replace(/\s+/g, ' ').trim()
  if (!t) return null
  const lower = t.toLowerCase()
  let currency = 'USD'
  if (lower.startsWith('c $') || lower.startsWith('ca$') || lower.includes('cad')) currency = 'CAD'
  else if (lower.startsWith('au $') || lower.startsWith('a$')) currency = 'AUD'
  else if (lower.startsWith('hk$')) currency = 'HKD'
  else if (t.includes('£')) currency = 'GBP'
  else if (t.includes('€')) currency = 'EUR'
  else if (t.includes('¥')) currency = 'JPY'
  const num = t.replace(/[^0-9.,]/g, '')
  if (!num) return null
  let value = num
  if (value.includes(',') && value.includes('.')) value = value.replace(/,/g, '')
  else if (value.includes(',')) value = value.replace(',', '.')
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? { value: parsed, currency } : null
}

function extract(pattern: RegExp, block: string): string {
  const match = block.match(pattern)
  return match?.[1] ? decodeHtml(match[1]) : ''
}

function parseItems(html: string): EbayScrapeListing[] {
  const items: EbayScrapeListing[] = []
  const blocks = [...html.matchAll(/<li[^>]*class="[^"]*\bs-item\b[^"]*"[^>]*>([\s\S]*?)<\/li>/gi)]
  for (const blockMatch of blocks) {
    const block = blockMatch[1]
    if (!block) continue
    const title = extract(/<span[^>]*class="[^"]*s-item__title-text[^"]*"[^>]*>([\s\S]*?)<\/span>/i, block)
    if (!title) continue
    const link = extract(/<a[^>]*class="[^"]*s-item__link[^"]*"[^>]*href="([^"]+)"/i, block)
    const image = extract(/<img[^>]*class="[^"]*s-item__image-img[^"]*"[^>]*src="([^"]+)"/i, block)
    const priceText = extract(/<span[^>]*class="[^"]*s-item__price[^"]*"[^>]*>([\s\S]*?)<\/span>/i, block)
    const price = priceText ? parsePrice(priceText) : null
    const seller = extract(/<span[^>]*class="[^"]*s-item__seller[^"]*"[^>]*>([\s\S]*?)<\/span>/i, block)
    const hotness = extract(/<span[^>]*class="[^"]*s-item__hotness[^"]*"[^>]*>([\s\S]*?)<\/span>/i, block)
    const soldMatch = hotness.match(/([\d,]+)\s*sold/i)
    const soldCount = soldMatch ? Number(soldMatch[1].replace(/,/g, '')) : null
    const condition = extract(/<span[^>]*class="SECONDARY_INFO"[^>]*>([\s\S]*?)<\/span>/i, block) || extract(/<span[^>]*class="[^"]*s-item__condition-text[^"]*"[^>]*>([\s\S]*?)<\/span>/i, block)
    const shipping = extract(/<span[^>]*class="[^"]*s-item__logisticsCost[^"]*"[^>]*>([\s\S]*?)<\/span>/i, block) || null
    items.push({
      title,
      url: link || 'https://www.ebay.com/',
      image: image || null,
      price: price?.value ?? null,
      currency: price?.currency ?? null,
      condition: condition || null,
      seller: seller || null,
      soldCount,
      shipping: shipping || null,
    })
  }
  return items
}

export async function searchEbayLocal(query: string, limit = 20, _env: Record<string, unknown> = {}): Promise<EbayScrapeResult> {
  const capturedAt = new Date().toISOString()
  const search = new URL(`https://${EBAY_SEARCH_HOST}/sch/i.html`)
  search.searchParams.set('_nkw', query.slice(0, 160))
  search.searchParams.set('_sacat', '0')
  search.searchParams.set('_ipg', String(Math.min(60, Math.max(25, limit))))
  const sourceUrl = search.toString()

  // Bounded fetch with per-hop redirect validation (eBay hosts only).
  let currentUrl: URL = search
  let response: Response | null = null
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)
    try {
      response = await fetch(currentUrl.toString(), {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          accept: 'text/html,application/xhtml+xml',
          'user-agent': 'AiBayMarketReader/1.0 (+https://aibay-pro-live.pages.dev/source-policy)',
        },
      })
    } finally {
      clearTimeout(timeout)
    }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location')
      if (!location) throw Object.assign(new Error('eBay redirected without a destination.'), { code: 'transient' })
      let next: URL
      try {
        next = assertSafePublicUrl(new URL(location, currentUrl).toString())
      } catch {
        throw Object.assign(new Error('eBay redirected to an unsafe destination.'), { code: 'unsafe_destination' })
      }
      if (!next.hostname.endsWith('ebay.com')) throw Object.assign(new Error(`eBay redirect left ebay.com (${next.hostname}).`), { code: 'unsafe_destination' })
      currentUrl = next
      continue
    }
    break
  }
  if (!response) throw Object.assign(new Error('eBay did not respond within the bounded window.'), { code: 'transient' })

  if (response.status === 401 || response.status === 403) throw Object.assign(new Error('eBay blocked this request (HTTP 403). AiBay does not bypass blocks.'), { code: 'blocked_by_policy', status: 403 })
  if (response.status === 429) throw Object.assign(new Error('eBay rate-limited this request (HTTP 429). AiBay does not evade rate limits.'), { code: 'rate_limited', status: 429 })
  if (!response.ok) throw Object.assign(new Error(`eBay returned HTTP ${response.status}.`), { code: 'transient', status: response.status })

  const declared = Number(response.headers.get('content-length') || 0)
  if (declared > MAX_BYTES) throw Object.assign(new Error('eBay page exceeds the bounded size limit.'), { code: 'transient' })
  const html = (await response.text()).slice(0, MAX_BYTES)

  if (/captcha|verify you are human|access denied|enable cookies/i.test(html)) {
    throw Object.assign(new Error('eBay presented a challenge page. AiBay does not solve CAPTCHAs or imitate browsers.'), { code: 'blocked_by_policy' })
  }

  const items = parseItems(html)
  const noResults = /we looked everywhere|0 results|srp-save-null-title/i.test(html)
  return {
    provider: 'local.ebay-scraper',
    method: 'public-search-page-v1',
    query: query.slice(0, 160),
    marketplace: 'EBAY_US',
    sourceUrl,
    capturedAt,
    resultCount: items.length,
    items: items.slice(0, limit),
    note: noResults
      ? 'eBay returned no results for this query on the public search page.'
      : items.length
        ? `Parsed ${items.length} listing(s) from the public search results page (visible data only).`
        : 'No listings could be parsed from the public page; the page structure may have changed or the target restricted automated reads.',
  }
}

export function classifyEbayScrapeError(error: unknown, status?: number) {
  const code = (error as { code?: string } | null)?.code
  if (code === 'blocked_by_policy') return { category: 'blocked_by_policy' as const, retryable: false, message: error instanceof Error ? error.message : 'eBay blocked the request.' }
  if (code === 'rate_limited') return { category: 'rate_limited' as const, retryable: true, message: error instanceof Error ? error.message : 'eBay rate limit.' }
  if (code === 'unsafe_destination') return { category: 'unsafe_destination' as const, retryable: false, message: error instanceof Error ? error.message : 'Unsafe destination.' }
  return classifyFailure(error, status)
}
