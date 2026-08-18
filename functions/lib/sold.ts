// Sold-data engine — the free, legitimate alternative to paid sold-data APIs.
//
// eBay's public website lets ANY visitor filter search results to
// "Completed/Sold items" (LH_Complete=1&LH_Sold=1). Those public pages show
// each listing's sold price and a sold-date label. AiBay reads that PUBLIC
// page with the same bounded, non-authenticated pattern as the eBay reader —
// no API keys, no paid partnership, no bypass. This is the zero-key path to
// sold-price observations that ZIK-type tools charge for.
//
// Truth rules:
// - Observations come from the public completed-items search page only.
// - "Sold" labels are parsed as displayed (e.g. "Sold", "Sold Mar 12").
//   Date parsing is best-effort; when a date can't be parsed we record the
//   observation without a date rather than guessing.
// - Sold volume, average, median, and percentiles are computed ONLY from the
//   observations actually parsed; sample size is always reported.
// - If eBay blocks (403/captcha/login), we report the block truthfully.
// - This is NOT the official sold-data API; labels say "public completed
//   listings observations" and the sample size is always visible.

import { classifyFailure } from './orchestrator'

export const SOLD_SEARCH_HOST = 'www.ebay.com'
const MAX_REDIRECTS = 3
const MAX_BYTES = 3_000_000
const TIMEOUT_MS = 12_000

export type SoldListing = {
  title: string
  url: string
  price: number | null
  currency: string | null
  condition: string | null
  soldLabel: string | null
  soldDate: string | null // ISO date when parseable from the label
  image: string | null
}

export type SoldStats = {
  count: number
  totalSoldValue: number | null
  min: number | null
  max: number | null
  average: number | null
  median: number | null
  p10: number | null
  p90: number | null
  state: 'VERIFIED' | 'PARTIAL' | 'INSUFFICIENT_EVIDENCE'
}

export type SoldResult = {
  provider: 'local.ebay-sold-reader'
  method: 'public-completed-search-v1'
  query: string
  marketplace: 'EBAY_US'
  sourceUrl: string
  capturedAt: string
  count: number
  listings: SoldListing[]
  stats: SoldStats
  note: string
}

function decode(value: string): string {
  return value
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ').trim()
}

function parsePrice(text: string): { value: number; currency: string } | null {
  const t = text.replace(/\s+/g, ' ').trim()
  if (!t) return null
  let currency = 'USD'
  if (t.includes('US $')) currency = 'USD'
  else if (t.includes('£')) currency = 'GBP'
  else if (t.includes('€')) currency = 'EUR'
  const num = t.replace(/[^0-9.,]/g, '')
  if (!num) return null
  let value = num
  if (value.includes(',') && value.includes('.')) value = value.replace(/,/g, '')
  else if (value.includes(',')) value = value.replace(',', '.')
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? { value: parsed, currency } : null
}

function parseSoldDate(label: string): string | null {
  // Labels like "Sold", "Sold Mar 12", "Sold Feb 8, 2026", "Sold Jan 2026"
  const match = label.match(/sold\s*(.*)/i)
  if (!match?.[1]?.trim()) return null
  const raw = match[1].trim()
  const parsed = new Date(`${raw}, ${new Date().getUTCFullYear()}`)
  const full = new Date(raw)
  if (!Number.isNaN(full.getTime()) && raw.includes(',')) return full.toISOString().slice(0, 10)
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10)
  return null
}

function extract(pattern: RegExp, block: string): string {
  const match = block.match(pattern)
  return match?.[1] ? decode(match[1]) : ''
}

function parseSoldItems(html: string): SoldListing[] {
  const items: SoldListing[] = []
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
    const condition = extract(/<span[^>]*class="SECONDARY_INFO"[^>]*>([\s\S]*?)<\/span>/i, block) || extract(/<span[^>]*class="[^"]*s-item__condition-text[^"]*"[^>]*>([\s\S]*?)<\/span>/i, block)
    // Sold label appears in the "hotness" or "caption" area, e.g. "Sold" / "Sold Mar 12"
    const hotness = extract(/<span[^>]*class="[^"]*s-item__hotness[^"]*"[^>]*>([\s\S]*?)<\/span>/i, block)
    const caption = extract(/<span[^>]*class="[^"]*s-item__caption[^"]*"[^>]*>([\s\S]*?)<\/span>/i, block)
    const soldLabel = /sold/i.test(hotness) ? hotness : /sold/i.test(caption) ? caption : null
    items.push({
      title,
      url: link || 'https://www.ebay.com/',
      price: price?.value ?? null,
      currency: price?.currency ?? null,
      condition: condition || null,
      soldLabel,
      soldDate: soldLabel ? parseSoldDate(soldLabel) : null,
      image: image || null,
    })
  }
  return items
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return Number.NaN
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
  return sorted[index]
}

export function soldStats(listings: SoldListing[]): SoldStats {
  const prices = listings.map((listing) => listing.price).filter((price): price is number => price != null)
  if (!prices.length) return { count: listings.length, totalSoldValue: null, min: null, max: null, average: null, median: null, p10: null, p90: null, state: 'INSUFFICIENT_EVIDENCE' }
  const sorted = [...prices].sort((a, b) => a - b)
  const sum = sorted.reduce((total, value) => total + value, 0)
  const median = sorted.length % 2 ? sorted[Math.floor(sorted.length / 2)] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
  return {
    count: prices.length,
    totalSoldValue: Math.round(sum * 100) / 100,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    average: Math.round((sum / sorted.length) * 100) / 100,
    median: Math.round(median * 100) / 100,
    p10: Math.round(percentile(sorted, 10) * 100) / 100,
    p90: Math.round(percentile(sorted, 90) * 100) / 100,
    state: prices.length >= 5 ? 'VERIFIED' : prices.length >= 1 ? 'PARTIAL' : 'INSUFFICIENT_EVIDENCE',
  }
}

export async function searchSoldLocal(query: string, limit = 40): Promise<SoldResult> {
  const capturedAt = new Date().toISOString()
  const search = new URL(`https://${SOLD_SEARCH_HOST}/sch/i.html`)
  search.searchParams.set('_nkw', query.slice(0, 160))
  search.searchParams.set('LH_Complete', '1')
  search.searchParams.set('LH_Sold', '1')
  search.searchParams.set('_ipg', String(Math.min(60, Math.max(25, limit))))
  const sourceUrl = search.toString()

  let currentUrl: URL = search
  let response: Response | null = null
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)
    try {
      response = await fetch(currentUrl.toString(), {
        redirect: 'manual',
        signal: controller.signal,
        headers: { accept: 'text/html,application/xhtml+xml', 'user-agent': 'AiBaySoldReader/1.0 (+https://aibay-pro-live.pages.dev/source-policy)' },
      })
    } finally {
      clearTimeout(timeout)
    }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location')
      if (!location) throw Object.assign(new Error('eBay redirected without a destination.'), { code: 'transient' })
      const next = new URL(location, currentUrl)
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
    throw Object.assign(new Error('eBay presented a challenge page. AiBay does not solve CAPTCHAs.'), { code: 'blocked_by_policy' })
  }

  const listings = parseSoldItems(html)
  const stats = soldStats(listings)
  const withDate = listings.filter((listing) => listing.soldDate).length
  return {
    provider: 'local.ebay-sold-reader',
    method: 'public-completed-search-v1',
    query: query.slice(0, 160),
    marketplace: 'EBAY_US',
    sourceUrl,
    capturedAt,
    count: listings.length,
    listings: listings.slice(0, limit),
    stats,
    note: [
      listings.length
        ? `Parsed ${listings.length} public completed/sold listing observation(s) for "${query}" (${withDate} with parseable sold dates).`
        : 'No sold observations could be parsed from the public completed-items page; the page structure may have changed or the target restricted automated reads.',
      `Stats from ${stats.count} priced observation(s) — this is a sample, not the official sold-data API.`,
      'Sold observations are public-page evidence; they are not guaranteed conversion or revenue data.',
    ].join(' '),
  }
}

export function classifySoldError(error: unknown, status?: number) {
  const code = (error as { code?: string } | null)?.code
  if (code === 'blocked_by_policy') return { category: 'blocked_by_policy' as const, retryable: false, message: error instanceof Error ? error.message : 'eBay blocked the request.' }
  if (code === 'rate_limited') return { category: 'rate_limited' as const, retryable: true, message: error instanceof Error ? error.message : 'eBay rate limit.' }
  if (code === 'unsafe_destination') return { category: 'unsafe_destination' as const, retryable: false, message: error instanceof Error ? error.message : 'Unsafe destination.' }
  return classifyFailure(error, status)
}
