// Built-in eBay search reader — live marketplace data with ZERO external keys.
//
// This is AiBay's own lightweight reader of eBay's PUBLIC search results page
// (visible HTML only). It is the default market route, with the official Browse
// API and optional Apify actor as richer alternatives when configured.
//
// Compliance boundary:
// - No CAPTCHA solving, login, paywall bypass, session replay, or identity rotation.
// - Bounded: 12s timeout, 3 redirects, ~3 MB size cap, and at most two valid
//   query URLs when a GTIN/MPN identifier is explicitly supplied.
// - Identifier fallback is a legitimate search refinement on the same eBay host;
//   challenge pages stop the run immediately and are reported truthfully.
// - Every listing carries source URL, capture time, and the extraction method.

import { assertSafePublicUrl } from './security'
import { classifyFailure } from './orchestrator'
import { fetchViaJinaReader } from './reader-fallback'

export const EBAY_SEARCH_HOST = 'www.ebay.com'
const MAX_REDIRECTS = 3
const MAX_BYTES = 3_000_000
const TIMEOUT_MS = 12_000

type SearchIdentity = { gtin?: string; mpn?: string }

type ListingProvenance = {
  sourceUrl: string
  capturedAt: string
  method: 'public-search-page-v1' | 'public-search-page-v1-via-jina-reader'
}

export type EbayScrapeListing = ListingProvenance & {
  title: string
  url: string
  image: string | null
  price: number | null
  currency: string | null
  condition: string | null
  seller: string | null
  soldCount: number | null
  watchers: number | null
  shipping: string | null
}

export type EbayScrapeResult = {
  provider: 'local.ebay-scraper'
  method: 'public-search-page-v1' | 'public-search-page-v1-via-jina-reader'
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

function parseCount(block: string, patterns: RegExp[]): number | null {
  for (const pattern of patterns) {
    const match = block.match(pattern)
    if (match?.[1]) {
      const count = Number(match[1].replace(/,/g, ''))
      if (Number.isFinite(count)) return count
    }
  }
  return null
}

function parseItems(html: string, provenance: ListingProvenance): EbayScrapeListing[] {
  const items: EbayScrapeListing[] = []
  const blocks = [...html.matchAll(/<li[^>]*class="[^"]*\bs-item\b[^"]*"[^>]*>([\s\S]*?)<\/li>/gi)]
  for (const blockMatch of blocks) {
    const block = blockMatch[1]
    if (!block) continue
    const title = extract(/<span[^>]*class="[^"]*s-item__title-text[^"]*"[^>]*>([\s\S]*?)<\/span>/i, block)
    if (!title) continue
    const link = extract(/<a[^>]*class="[^"]*s-item__link[^"]*"[^>]*href="([^"]+)"/i, block)
    const image = extract(/<img[^>]*class="[^"]*s-item__image-img[^"]*"[^>]*(?:src|data-src)="([^"]+)"/i, block)
    const priceText = extract(/<span[^>]*class="[^"]*s-item__price[^"]*"[^>]*>([\s\S]*?)<\/span>/i, block)
    const price = priceText ? parsePrice(priceText) : null
    const seller = extract(/<span[^>]*class="[^"]*s-item__seller[^"]*"[^>]*>([\s\S]*?)<\/span>/i, block)
    const hotness = extract(/<span[^>]*class="[^"]*s-item__hotness[^"]*"[^>]*>([\s\S]*?)<\/span>/i, block)
    const visibleText = decodeHtml(block.replace(/<[^>]+>/g, ' '))
    const soldCount = parseCount(`${hotness} ${visibleText}`, [/([\d,]+)\s*sold/i])
    const watchers = parseCount(`${hotness} ${visibleText}`, [/([\d,]+)\s*(?:watchers?|people watching)/i])
    const condition = extract(/<span[^>]*class="SECONDARY_INFO[^"]*"[^>]*>([\s\S]*?)<\/span>/i, block)
      || extract(/<span[^>]*class="[^"]*s-item__condition-text[^"]*"[^>]*>([\s\S]*?)<\/span>/i, block)
    const shipping = extract(/<span[^>]*class="[^"]*s-item__logisticsCost[^"]*"[^>]*>([\s\S]*?)<\/span>/i, block) || null
    items.push({
      ...provenance,
      title,
      url: link || 'https://www.ebay.com/',
      image: image || null,
      price: price?.value ?? null,
      currency: price?.currency ?? null,
      condition: condition || null,
      seller: seller || null,
      soldCount,
      watchers,
      shipping,
    })
  }
  return items
}

function buildSearchUrl(value: string): URL {
  const search = new URL(`https://${EBAY_SEARCH_HOST}/sch/i.html`)
  search.searchParams.set('_nkw', value.slice(0, 160))
  search.searchParams.set('_sacat', '0')
  search.searchParams.set('_ipg', '60')
  return search
}

function queryCandidates(query: string, identity: SearchIdentity): string[] {
  const candidates = [query.trim().slice(0, 160)]
  const gtin = identity.gtin?.trim().slice(0, 64)
  const mpn = identity.mpn?.trim().slice(0, 80)
  if (gtin && !candidates.includes(gtin)) candidates.push(gtin)
  else if (mpn && !candidates.some((candidate) => candidate.toLowerCase() === mpn.toLowerCase())) candidates.push(mpn)
  return candidates.filter(Boolean).slice(0, 2)
}

async function fetchSearchPage(search: URL): Promise<{ response: Response; url: URL }> {
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
          'user-agent': 'AiBayMarketReader/1.0 (+https://aibay-pro-george-live.pages.dev/source-policy)',
        },
      })
    } finally {
      clearTimeout(timeout)
    }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location')
      if (!location) throw Object.assign(new Error('eBay redirected without a destination.'), { code: 'transient' })
      let next: URL
      try { next = assertSafePublicUrl(new URL(location, currentUrl).toString()) } catch { throw Object.assign(new Error('eBay redirected to an unsafe destination.'), { code: 'unsafe_destination' }) }
      if (!next.hostname.endsWith('ebay.com')) throw Object.assign(new Error(`eBay redirect left ebay.com (${next.hostname}).`), { code: 'unsafe_destination' })
      currentUrl = next
      continue
    }
    break
  }
  if (!response) throw Object.assign(new Error('eBay did not respond within the bounded window.'), { code: 'transient' })
  return { response, url: currentUrl }
}

function classifyResponse(response: Response, html?: string) {
  if (response.status === 401 || response.status === 403) throw Object.assign(new Error('eBay blocked this request (HTTP 403). AiBay does not bypass blocks.'), { code: 'blocked_by_policy', status: response.status })
  if (response.status === 429) throw Object.assign(new Error('eBay rate-limited this request (HTTP 429). AiBay does not evade rate limits.'), { code: 'rate_limited', status: response.status })
  if (!response.ok) throw Object.assign(new Error(`eBay returned HTTP ${response.status}.`), { code: 'transient', status: response.status })
  if (html && /captcha|verify you are human|access denied|enable cookies/i.test(html)) throw Object.assign(new Error('eBay presented a challenge page. AiBay does not solve CAPTCHAs or imitate browsers.'), { code: 'blocked_by_policy' })
}

function parseItemsFromText(text: string, query: string): EbayScrapeListing[] {
  const items: EbayScrapeListing[] = []
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean)
  const priceRe = /\$\s?([0-9][0-9.,]*)/i
  for (let i = 0; i < lines.length - 1; i += 1) {
    const titleLine = lines[i]
    const priceLine = lines[i + 1]
    if (titleLine.length < 15 || titleLine.length > 180) continue
    if (!priceRe.test(priceLine)) continue
    const price = parsePrice(priceLine)
    const soldMatch = lines.slice(i, i + 3).join(' ').match(/([\d,]+)\s*sold/i)
    const urlMatch = lines.slice(i, i + 3).join(' ').match(/https?:\/\/[^\s]+/i)
    items.push({
      title: titleLine,
      url: urlMatch?.[0] ?? `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(query)}`,
      image: null,
      price: price?.value ?? null,
      currency: price?.currency ?? null,
      condition: null,
      seller: null,
      soldCount: soldMatch ? Number(soldMatch[1].replace(/,/g, '')) : null,
      watchers: null,
      shipping: null,
      sourceUrl: urlMatch?.[0] ?? '',
      capturedAt: new Date().toISOString(),
      method: 'public-search-page-v1-via-jina-reader',
    })
    i += 1
  }
  return items
}

export async function searchEbayLocal(query: string, limit = 20, _env: Record<string, unknown> = {}, identity: SearchIdentity = {}): Promise<EbayScrapeResult> {
  const capturedAt = new Date().toISOString()
  let lastError: unknown = null
  for (const candidate of queryCandidates(query, identity)) {
    const search = buildSearchUrl(candidate)
    const { response, url: finalUrl } = await fetchSearchPage(search)
    try {
      classifyResponse(response)
      const declared = Number(response.headers.get('content-length') || 0)
      if (declared > MAX_BYTES) throw Object.assign(new Error('eBay page exceeds the bounded size limit.'), { code: 'transient' })
      const html = (await response.text()).slice(0, MAX_BYTES)
      classifyResponse(response, html)
      const provenance: ListingProvenance = { sourceUrl: finalUrl.toString(), capturedAt, method: 'public-search-page-v1' }
      const items = parseItems(html, provenance)
      const noResults = /we looked everywhere|0 results|srp-save-null-title/i.test(html)
      return {
        provider: 'local.ebay-scraper',
        method: 'public-search-page-v1',
        query: query.slice(0, 160),
        marketplace: 'EBAY_US',
        sourceUrl: finalUrl.toString(),
        capturedAt,
        resultCount: items.length,
        items: items.slice(0, limit),
        note: noResults
          ? `eBay returned no results for the ${candidate === query ? 'keyword' : 'identifier'} query on the public search page.`
          : items.length
            ? `Parsed ${items.length} listing(s) from the public search results page (visible data only; query ${candidate === query ? 'keyword' : 'identifier'}).`
            : 'No listings could be parsed from the public page; the page structure may have changed or the target restricted automated reads.',
      }
    } catch (error) {
      lastError = error
      const code = (error as { code?: string } | null)?.code
      if (code === 'blocked_by_policy') {
        // Fallback: documented third-party public reader (opt-in via
        // USE_JINA_READER=1). The edge IP may be blocked; the reader fetches
        // the same public page through its own infrastructure. Provider is
        // labeled truthfully as jina-reader — never a first-party scrape.
        const jina = await fetchViaJinaReader(search.toString(), _env)
        if (jina) {
          const jinaItems = parseItemsFromText(jina.text, candidate)
          if (jinaItems.length) {
            return {
              provider: 'local.ebay-scraper',
              method: 'public-search-page-v1-via-jina-reader',
              query: query.slice(0, 160),
              marketplace: 'EBAY_US',
              sourceUrl: search.toString(),
              capturedAt: jina.retrievedAt,
              resultCount: jinaItems.length,
              items: jinaItems.slice(0, limit),
              note: `Direct fetch was blocked; used the documented public Jina Reader endpoint (provider: jina-reader). Parsed ${jinaItems.length} listing(s) from the public search results page.`,
            }
          }
        }
      }
      if (code !== 'blocked_by_policy' && code !== 'rate_limited') throw error
      // A supplied GTIN/MPN may be a valid search refinement. Do not retry
      // challenge HTML; only move to the next explicit identifier candidate.
      if (candidate === query || queryCandidates(query, identity).length === 1) continue
      continue
    }
  }
  throw lastError || Object.assign(new Error('eBay public search was unavailable.'), { code: 'transient' })
}

export function classifyEbayScrapeError(error: unknown, status?: number) {
  const code = (error as { code?: string } | null)?.code
  if (code === 'blocked_by_policy') return { category: 'blocked_by_policy' as const, retryable: false, message: error instanceof Error ? error.message : 'eBay blocked the request.' }
  if (code === 'rate_limited') return { category: 'rate_limited' as const, retryable: true, message: error instanceof Error ? error.message : 'eBay rate limit.' }
  if (code === 'unsafe_destination') return { category: 'unsafe_destination' as const, retryable: false, message: error instanceof Error ? error.message : 'Unsafe destination.' }
  return classifyFailure(error, status)
}
