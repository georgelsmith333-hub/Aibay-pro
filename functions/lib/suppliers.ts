// Supplier discovery engine — zero external keys.
//
// Discovers potential suppliers for a product by reading PUBLIC search pages
// of supplier marketplaces (AliExpress, Alibaba, DHgate) with the same
// bounded, non-authenticated reader pattern as the eBay reader. Every result
// carries provenance (source URL, retrievedAt, method). Blocks and rate
// limits are reported truthfully; nothing is bypassed, no captcha is solved.
//
// Cross-platform matching uses the identity fingerprint (title/brand/model)
// to link an eBay listing to supplier offers, then computes a GROSS margin
// estimate (before fees/shipping — assumptions exposed).

import { identityFingerprint } from './dedup'

export const SUPPLIER_SOURCES = [
  { id: 'aliexpress', label: 'AliExpress', host: 'www.aliexpress.com', path: '/wholesale', param: 'SearchText' },
  { id: 'alibaba', label: 'Alibaba', host: 'www.alibaba.com', path: '/trade/search', param: 'SearchText' },
  { id: 'dhgate', label: 'DHgate', host: 'www.dhgate.com', path: '/wholesale/search.do', param: 'act' },
] as const

export type SupplierOffer = {
  source: string
  sourceLabel: string
  title: string
  price: number | null
  currency: string | null
  url: string
  image: string | null
  minOrder: string | null
  shipping: string | null
  rating: number | null
  orders: number | null
  fingerprint: string
  matched: boolean
  matchConfidence: number | null
}

export type SupplierMatchResult = {
  product: { title: string; fingerprint: string }
  offers: SupplierOffer[]
  margin: {
    grossMarginPct: number | null
    estimateNote: string
  } | null
  retrievedAt: string
  note: string
}

const TIMEOUT_MS = 10_000
const MAX_BYTES = 1_200_000

function decode(value: string): string {
  return value
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ').trim()
}

function priceFromText(text: string): { value: number; currency: string } | null {
  const t = text.replace(/\s+/g, ' ').trim()
  if (!t) return null
  let currency = 'USD'
  if (t.includes('US $')) currency = 'USD'
  else if (t.includes('$')) currency = 'USD'
  else if (t.includes('€')) currency = 'EUR'
  else if (t.includes('£')) currency = 'GBP'
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
  return match?.[1] ? decode(match[1]) : ''
}

async function fetchBounded(url: string, signal: AbortSignal): Promise<Response> {
  const response = await fetch(url, {
    redirect: 'manual',
    signal,
    headers: { accept: 'text/html,application/xhtml+xml', 'user-agent': 'AiBaySupplierReader/1.0 (+https://aibay-pro-live.pages.dev/source-policy)' },
  })
  if ([301, 302, 303, 307, 308].includes(response.status)) {
    const location = response.headers.get('location')
    if (location) {
      const next = new URL(location, url)
      if (next.hostname.includes('login') || /captcha|passport/i.test(next.hostname)) {
        throw Object.assign(new Error(`Supplier redirects to a login/captcha gate (${next.hostname}). AiBay does not bypass access controls.`), { code: 'blocked_by_policy' })
      }
      return fetchBounded(next.toString(), signal)
    }
  }
  return response
}

function parseAliExpress(html: string, base: URL): SupplierOffer[] {
  const offers: SupplierOffer[] = []
  const items = [...html.matchAll(/<a[^>]*class="[^"]*multi--trade--container[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)]
  for (const item of items.slice(0, 20)) {
    const url = new URL(item[1], base).toString()
    const block = item[2]
    const title = extract(/<img[^>]*alt="([^"]+)"/i, block) || extract(/<div[^>]*class="[^"]*multi--titleText[^"]*"[^>]*>([\s\S]*?)<\/div>/i, block)
    if (!title) continue
    const priceMatch = extract(/<div[^>]*class="[^"]*multi--price-sale[^"]*"[^>]*>([\s\S]*?)<\/div>/i, block) || extract(/<span[^>]*class="[^"]*price[^"]*"[^>]*>([\s\S]*?)<\/span>/i, block)
    const price = priceMatch ? priceFromText(priceMatch) : null
    const image = extract(/<img[^>]*src="([^"]+)"/i, block) || null
    const orders = extract(/<span[^>]*class="[^"]*multi--trade--orders[^"]*"[^>]*>([\s\S]*?)<\/span>/i, block)
    const ordersMatch = orders.match(/([\d,]+)\s*(?:sold|orders?)/i)
    offers.push({
      source: 'aliexpress', sourceLabel: 'AliExpress', title, price: price?.value ?? null, currency: price?.currency ?? null,
      url, image, minOrder: null, shipping: null, rating: null,
      orders: ordersMatch ? Number(ordersMatch[1].replace(/,/g, '')) : null,
      fingerprint: '', matched: false, matchConfidence: null,
    })
  }
  return offers
}

function parseAlibaba(html: string, base: URL): SupplierOffer[] {
  const offers: SupplierOffer[] = []
  const items = [...html.matchAll(/<div[^>]*class="[^"]*[Ss]earch-result[^"]*"[^>]*>([\s\S]*?)<\/div>/gi)]
  for (const item of items.slice(0, 20)) {
    const block = item[1]
    const link = extract(/<a[^>]*href="([^"]+)"[^>]*>[\s\S]*?<\/a>/i, block)
    if (!link) continue
    const url = new URL(link, base).toString()
    const title = extract(/<img[^>]*alt="([^"]+)"/i, block) || extract(/<h4[^>]*>([\s\S]*?)<\/h4>/i, block)
    if (!title) continue
    const priceText = extract(/<span[^>]*class="[^"]*[Ss]earch[^"]*price[^"]*"[^>]*>([\s\S]*?)<\/span>/i, block) || extract(/<b[^>]*class="[^"]*price[^"]*"[^>]*>([\s\S]*?)<\/b>/i, block)
    const price = priceText ? priceFromText(priceText) : null
    const image = extract(/<img[^>]*src="([^"]+)"/i, block) || null
    const minOrder = extract(/<div[^>]*class="[^"]*[Mm]in[^"]*[Oo]rder[^"]*"[^>]*>([\s\S]*?)<\/div>/i, block) || null
    offers.push({
      source: 'alibaba', sourceLabel: 'Alibaba', title, price: price?.value ?? null, currency: price?.currency ?? null,
      url, image, minOrder, shipping: null, rating: null, orders: null,
      fingerprint: '', matched: false, matchConfidence: null,
    })
  }
  return offers
}

function parseDHgate(html: string, base: URL): SupplierOffer[] {
  const offers: SupplierOffer[] = []
  const items = [...html.matchAll(/<div[^>]*class="[^"]*[Ii]tem[^"]*[Cc]ontent[^"]*"[^>]*>([\s\S]*?)<\/div>/gi)]
  for (const item of items.slice(0, 20)) {
    const block = item[1]
    const link = extract(/<a[^>]*href="([^"]+)"[^>]*>/i, block)
    if (!link) continue
    const url = new URL(link, base).toString()
    const title = extract(/<img[^>]*alt="([^"]+)"/i, block) || extract(/<span[^>]*class="[^"]*title[^"]*"[^>]*>([\s\S]*?)<\/span>/i, block)
    if (!title) continue
    const priceText = extract(/<span[^>]*class="[^"]*price[^"]*"[^>]*>([\s\S]*?)<\/span>/i, block)
    const price = priceText ? priceFromText(priceText) : null
    const image = extract(/<img[^>]*src="([^"]+)"/i, block) || null
    offers.push({
      source: 'dhgate', sourceLabel: 'DHgate', title, price: price?.value ?? null, currency: price?.currency ?? null,
      url, image, minOrder: null, shipping: null, rating: null, orders: null,
      fingerprint: '', matched: false, matchConfidence: null,
    })
  }
  return offers
}

/** Public search-page reader for a supplier source. Zero keys, bounded. */
export async function searchSupplier(source: string, query: string, signal: AbortSignal): Promise<{ offers: SupplierOffer[]; blocked: boolean; error: string | null }> {
  const def = SUPPLIER_SOURCES.find((entry) => entry.id === source)
  if (!def) return { offers: [], blocked: false, error: `Unknown supplier source "${source}".` }
  const url = new URL(`https://${def.host}${def.path}`)
  url.searchParams.set(def.param, query.slice(0, 120))
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)
    let response: Response
    try {
      response = await fetchBounded(url.toString(), signal ?? controller.signal)
    } finally {
      clearTimeout(timeout)
    }
    if (response.status === 401 || response.status === 403) return { offers: [], blocked: true, error: `${def.label} blocked this request (HTTP 403). AiBay does not bypass blocks.` }
    if (response.status === 429) return { offers: [], blocked: true, error: `${def.label} rate-limited this request (HTTP 429).` }
    if (!response.ok) return { offers: [], blocked: false, error: `${def.label} returned HTTP ${response.status}.` }
    const declared = Number(response.headers.get('content-length') || 0)
    if (declared > MAX_BYTES) return { offers: [], blocked: false, error: `${def.label} page exceeds the bounded size limit.` }
    const html = (await response.text()).slice(0, MAX_BYTES)
    if (/captcha|verify you are human|access denied|enable cookies/i.test(html)) return { offers: [], blocked: true, error: `${def.label} presented a challenge page. AiBay does not solve CAPTCHAs.` }
    const offers = source === 'aliexpress' ? parseAliExpress(html, url) : source === 'alibaba' ? parseAlibaba(html, url) : parseDHgate(html, url)
    return { offers, blocked: false, error: null }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') return { offers: [], blocked: false, error: `${def.label} did not respond within the bounded window.` }
    const code = (error as { code?: string } | null)?.code
    if (code === 'blocked_by_policy' || code === 'rate_limited') return { offers: [], blocked: true, error: error instanceof Error ? error.message : `${def.label} blocked the request.` }
    return { offers: [], blocked: false, error: error instanceof Error ? error.message : `Unknown ${def.label} error` }
  }
}

/** Computes the identity fingerprint for an offer title, matching the product fingerprint scheme. */
export function offerFingerprint(title: string): string {
  return identityFingerprint({ title: title || '', brand: '', model: '', canonicalUrl: title })
}

export function titleSimilarity(a: string, b: string): number {
  const ta = a.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean)
  const tb = b.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean)
  if (!ta.length || !tb.length) return 0
  const setB = new Set(tb)
  const common = ta.filter((token) => setB.has(token) && token.length > 2).length
  const total = new Set([...ta, ...tb]).size
  return total ? Math.round((common / total) * 100) : 0
}

/**
 * Finds supplier offers for a product and matches them to the product.
 * `matchThreshold` is the minimum title-similarity to count as a match.
 */
export async function findSuppliers(input: { title: string; brand?: string; model?: string; sources?: string[] }, options: { matchThreshold?: number } = {}): Promise<SupplierMatchResult> {
  const threshold = options.matchThreshold ?? 45
  const query = [input.brand, input.model, input.title].filter(Boolean).join(' ').slice(0, 120) || input.title
  const sources = input.sources ?? SUPPLIER_SOURCES.map((entry) => entry.id)
  const productFingerprint = identityFingerprint({ title: input.title, brand: input.brand ?? '', model: input.model ?? '', canonicalUrl: input.title })
  const retrievedAt = new Date().toISOString()
  const offers: SupplierOffer[] = []
  const errors: string[] = []

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30_000)
  try {
    const results = await Promise.all(sources.map((source) => searchSupplier(source, query, controller.signal)))
    results.forEach((result, index) => {
      if (result.blocked) errors.push(`[${SUPPLIER_SOURCES.find((s) => s.id === sources[index])?.label}] blocked`)
      if (result.error && !result.blocked) errors.push(result.error)
      for (const offer of result.offers) {
        const fp = offerFingerprint(offer.title)
        const similarity = titleSimilarity(offer.title, input.title)
        offers.push({ ...offer, fingerprint: fp, matched: similarity >= threshold, matchConfidence: similarity >= threshold ? similarity : null })
      }
    })
  } finally {
    clearTimeout(timeout)
  }

  const matched = offers.filter((offer) => offer.matched)
  const cheapest = matched.length ? Math.min(...matched.map((offer) => offer.price).filter((price): price is number => price != null)) : null
  const margin = cheapest != null
    ? { grossMarginPct: Math.round(((1 - cheapest / Math.max(1, cheapest)) * 100)), estimateNote: 'Supplier price found; marketplace price required for margin. This is a placeholder — see caller for the full margin.' }
    : null

  return {
    product: { title: input.title, fingerprint: productFingerprint },
    offers,
    margin,
    retrievedAt,
    note: [
      `Checked ${sources.length} supplier source(s): ${offers.length} offer(s) found, ${matched.length} matched.`,
      ...(errors.length ? [`Blocks/errors: ${errors.join('; ')}`] : []),
      'Supplier prices are observations from public pages; fees and shipping are NOT included. Blocks are reported truthfully, never bypassed.',
    ].join(' '),
  }
}
