import { priceBandStatistics } from '../../lib/evidence-normalizer'
import { assertSafePublicUrl, getContext, json, normalizeInputString } from '../../lib/security'

type Env = Record<string, unknown>
type RequestContext = { request: Request; env: Env }
type SellerBody = { username?: unknown; storeUrl?: unknown; limit?: unknown }

const MAX_BYTES = 3_000_000
const TIMEOUT_MS = 12_000
const MAX_REDIRECTS = 3

function decodeHtml(value: string) {
  return value.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
}

function extract(pattern: RegExp, block: string) {
  const match = block.match(pattern)
  return match?.[1] ? decodeHtml(match[1]) : ''
}

function parsePrice(text: string) {
  const value = text.replace(/[^0-9.,]/g, '').replace(/,(?=\d{3}(?:\D|$))/g, '')
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function normalizeUsername(value: string) {
  return value.trim().replace(/^@/, '').replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 80)
}

function buildSellerUrl(username: string) {
  const url = new URL('https://www.ebay.com/sch/i.html')
  url.searchParams.set('_ssn', username)
  url.searchParams.set('_sacat', '0')
  url.searchParams.set('_ipg', '60')
  return url
}

async function fetchPublicPage(start: URL) {
  let current = start
  let response: Response | null = null
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)
    try {
      response = await fetch(current.toString(), { redirect: 'manual', signal: controller.signal, headers: { accept: 'text/html,application/xhtml+xml', 'user-agent': 'AiBaySellerReader/1.0 (+https://aibay-pro-george-live.pages.dev/source-policy)' } })
    } finally { clearTimeout(timeout) }
    if (![301, 302, 303, 307, 308].includes(response.status)) break
    const location = response.headers.get('location')
    if (!location) throw Object.assign(new Error('Seller page redirected without a destination.'), { code: 'transient' })
    const next = assertSafePublicUrl(new URL(location, current).toString())
    if (!next.hostname.endsWith('ebay.com')) throw Object.assign(new Error('Seller page redirected outside ebay.com.'), { code: 'unsafe_destination' })
    current = next
  }
  if (!response) throw Object.assign(new Error('Seller page did not respond within the bounded window.'), { code: 'transient' })
  if (response.status === 401 || response.status === 403) throw Object.assign(new Error('eBay blocked the seller page request (HTTP 403).'), { code: 'blocked_by_policy', status: response.status })
  if (response.status === 429) throw Object.assign(new Error('eBay rate-limited the seller page request (HTTP 429).'), { code: 'rate_limited', status: response.status })
  if (!response.ok) throw Object.assign(new Error(`eBay seller page returned HTTP ${response.status}.`), { code: 'transient', status: response.status })
  if (Number(response.headers.get('content-length') || 0) > MAX_BYTES) throw Object.assign(new Error('Seller page exceeds the bounded size limit.'), { code: 'transient' })
  const html = (await response.text()).slice(0, MAX_BYTES)
  if (/captcha|verify you are human|access denied|enable cookies/i.test(html)) throw Object.assign(new Error('eBay presented a challenge page for this seller. AiBay does not solve CAPTCHAs.'), { code: 'blocked_by_policy' })
  return { html, sourceUrl: current.toString() }
}

function parseItems(html: string, sourceUrl: string, capturedAt: string, limit: number) {
  const blocks = [...html.matchAll(/<li[^>]*class="[^"]*\bs-item\b[^"]*"[^>]*>([\s\S]*?)<\/li>/gi)]
  return blocks.map((match, index) => {
    const block = match[1] || ''
    const title = extract(/<span[^>]*class="[^"]*s-item__title-text[^"]*"[^>]*>([\s\S]*?)<\/span>/i, block)
    if (!title) return null
    const url = extract(/<a[^>]*class="[^"]*s-item__link[^"]*"[^>]*href="([^"]+)"/i, block) || 'https://www.ebay.com/'
    const priceText = extract(/<span[^>]*class="[^"]*s-item__price[^"]*"[^>]*>([\s\S]*?)<\/span>/i, block)
    const category = extract(/(?:class|data-testid)="[^"]*(?:category|store-category)[^"]*"[^>]*>([\s\S]*?)<\//i, block) || 'Unclassified from public page'
    return { id: `seller_${index}_${Date.now().toString(36)}`, title, url, price: parsePrice(priceText), currency: priceText.includes('€') ? 'EUR' : priceText.includes('£') ? 'GBP' : 'USD', category, sourceUrl, capturedAt, method: 'public-seller-page-v1' }
  }).filter((item): item is NonNullable<typeof item> => Boolean(item)).slice(0, limit)
}

function parseReportedCount(html: string) {
  const text = decodeHtml(html.replace(/<[^>]+>/g, ' '))
  const match = text.match(/([\d,]+)\s+(?:results|items|listings)/i)
  const count = match?.[1] ? Number(match[1].replace(/,/g, '')) : NaN
  return Number.isFinite(count) ? count : null
}

export const onRequestPost = async ({ request, env }: RequestContext): Promise<Response> => {
  const context = getContext(request, env as never)
  let body: SellerBody
  try { body = await request.json() as SellerBody } catch { return json({ error: 'invalid_json' }, { status: 400 }, context.requestId) }
  const username = normalizeUsername(normalizeInputString(body.username, 80))
  const suppliedStoreUrl = normalizeInputString(body.storeUrl, 500)
  let start: URL
  try {
    if (suppliedStoreUrl) {
      const parsed = assertSafePublicUrl(suppliedStoreUrl)
      if (!parsed.hostname.endsWith('ebay.com')) return json({ error: 'unsupported_store_host', message: 'Only public eBay store URLs are supported.' }, { status: 400 }, context.requestId)
      start = parsed
    } else if (username) start = buildSellerUrl(username)
    else return json({ error: 'seller_required', message: 'Provide an eBay seller username or public store URL.' }, { status: 400 }, context.requestId)
  } catch (error) { return json({ error: 'invalid_store_url', message: error instanceof Error ? error.message : 'The store URL is not valid.' }, { status: 400 }, context.requestId) }

  const limit = Math.min(Math.max(Number(body.limit || 30), 1), 60)
  const capturedAt = new Date().toISOString()
  try {
    const page = await fetchPublicPage(start)
    const items = parseItems(page.html, page.sourceUrl, capturedAt, limit)
    const categoryDistribution = Object.entries(items.reduce<Record<string, number>>((counts, item) => { counts[item.category] = (counts[item.category] || 0) + 1; return counts }, {})).sort((a, b) => b[1] - a[1]).map(([category, count]) => ({ category, observedCount: count }))
    const priceBand = priceBandStatistics(items)
    return json({
      status: 'live',
      provider: 'local.ebay-seller-reader',
      seller: username || 'resolved-from-store-url',
      storeUrl: page.sourceUrl,
      capturedAt,
      listingCount: parseReportedCount(page.html) ?? items.length,
      observedListingCount: items.length,
      priceBand,
      categoryDistribution,
      activeItems: items,
      dataScope: 'active_listing_observations',
      soldDataStatus: 'not_collected',
      provenance: { sourceUrl: page.sourceUrl, capturedAt, method: 'public-seller-page-v1' },
      note: 'This endpoint reports only active listings visible on the public seller page. It does not infer sales volume, sell-through, revenue, or sold history.',
    }, {}, context.requestId)
  } catch (error) {
    const code = (error as { code?: string } | null)?.code
    if (code === 'blocked_by_policy') return json({ error: 'seller_page_blocked', status: 'blocked', message: error instanceof Error ? error.message : 'The seller page was blocked.', seller: username || null, sourceUrl: start.toString(), dataScope: 'active_listing_observations_only', soldDataStatus: 'not_collected', guidance: ['No CAPTCHA or access-control bypass is attempted.', 'Use a public seller page later or provide an approved data source.'] }, { status: 409 }, context.requestId)
    if (code === 'rate_limited') return json({ error: 'seller_page_rate_limited', status: 'unavailable', message: error instanceof Error ? error.message : 'The seller page was rate-limited.', seller: username || null }, { status: 429 }, context.requestId)
    return json({ error: 'seller_research_unavailable', status: 'unavailable', message: error instanceof Error ? error.message : 'The seller page could not be read.', seller: username || null }, { status: 503 }, context.requestId)
  }
}
