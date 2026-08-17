import { apifyEbaySearch, apifyEbayStatus } from '../../lib/apify'
import { classifyEbayScrapeError, ebayScraperStatus, searchEbayLocal } from '../../lib/ebay-scraper'
import { getContext, json, normalizeInputString } from '../../lib/security'

type Env = Record<string, string | undefined>
type RequestContext = { request: Request; env: Env }
type ResearchBody = { query?: unknown; gtin?: unknown; mpn?: unknown; limit?: unknown }

type EbayItemSummary = {
  itemId?: string
  title?: string
  itemWebUrl?: string
  image?: { imageUrl?: string }
  price?: { value?: string; currency?: string }
  shippingOptions?: Array<{ shippingCost?: { value?: string } }>
  condition?: string
  seller?: { username?: string; feedbackPercentage?: string }
}

async function getToken(env: Env) {
  if (!env.EBAY_CLIENT_ID || !env.EBAY_CLIENT_SECRET) return null
  const credentials = btoa(`${env.EBAY_CLIENT_ID}:${env.EBAY_CLIENT_SECRET}`)
  const response = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: { authorization: `Basic ${credentials}`, 'content-type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope',
  })
  if (!response.ok) throw new Error(`eBay token request failed with ${response.status}`)
  const data = await response.json<{ access_token?: string }>()
  if (!data.access_token) throw new Error('eBay token response did not include an access token.')
  return data.access_token
}

export const onRequestPost = async ({ request, env }: RequestContext): Promise<Response> => {
  const context = getContext(request, env)
  let body: ResearchBody
  try { body = await request.json() as ResearchBody } catch { return json({ error: 'invalid_json' }, { status: 400 }, context.requestId) }
  const query = normalizeInputString(body.query, 160)
  if (!query) return json({ error: 'query_required', message: 'A product or market query is required.' }, { status: 400 }, context.requestId)
  const limit = Math.min(Math.max(Number(body.limit || 20), 1), 50)

  if (env.APP_ENV !== 'production' && (!env.EBAY_CLIENT_ID || !env.EBAY_CLIENT_SECRET)) {
    return json({ status: 'demo', marketplace: 'EBAY_US', query, capturedAt: new Date().toISOString(), resultCount: 0, listings: [], note: 'Demo mode: connect credentials or use production to read live public eBay data.' }, {}, context.requestId)
  }

  // Tier 1 — official Browse API (richest fields, requires an eBay Developer app)
  try {
    const token = await getToken(env)
    if (token) {
      const url = new URL('https://api.ebay.com/buy/browse/v1/item_summary/search')
      url.searchParams.set('q', query)
      url.searchParams.set('limit', String(limit))
      const response = await fetch(url, { headers: { authorization: `Bearer ${token}`, 'x-ebay-c-marketplace-id': 'EBAY_US', accept: 'application/json' } })
      if (!response.ok) return json({ error: 'ebay_browse_failed', status: response.status, message: 'The official eBay Browse API did not return a usable response.' }, { status: 502 }, context.requestId)
      const data = await response.json<{ total?: number; itemSummaries?: EbayItemSummary[] }>()
      const listings = (data.itemSummaries || []).map((item, index) => ({
        id: item.itemId || `ebay_${index}`,
        title: item.title || 'Untitled listing',
        url: item.itemWebUrl || 'https://www.ebay.com/',
        image: item.image?.imageUrl || '',
        price: Number(item.price?.value || 0),
        shipping: Number(item.shippingOptions?.[0]?.shippingCost?.value || 0),
        currency: item.price?.currency || 'USD',
        condition: item.condition || 'Not supplied',
        seller: item.seller?.username || 'Not supplied',
        feedback: Number(item.seller?.feedbackPercentage || 0),
      }))
      return json({ status: 'live', provider: 'ebay-browse-official', marketplace: 'EBAY_US', query, capturedAt: new Date().toISOString(), resultCount: data.total || listings.length, listings, note: 'Live data from the official eBay Browse API.' }, {}, context.requestId)
    }
  } catch (error) {
    // Official path failed (e.g. expired/invalid creds) — fall through to the built-in reader.
    if (env.EBAY_CLIENT_ID && env.EBAY_CLIENT_SECRET) {
      return json({ error: 'ebay_research_unavailable', message: error instanceof Error ? error.message : 'Unable to query eBay right now.' }, { status: 503 }, context.requestId)
    }
  }

  // Tier 2 — built-in public search-page reader (ZERO keys, free-local, bounded)
  try {
    const result = await searchEbayLocal(query, limit, env)
    const listings = result.items.map((item, index) => ({
      id: `scrape_${index}_${Date.now().toString(36)}`,
      title: item.title || 'Untitled listing',
      url: item.url,
      image: item.image || '',
      price: item.price ?? 0,
      shipping: 0,
      currency: item.currency || 'USD',
      condition: item.condition || 'Not supplied',
      seller: item.seller || 'Not supplied',
      feedback: 0,
      soldCount: item.soldCount,
    }))
    return json({
      status: 'live',
      provider: 'local.ebay-scraper',
      marketplace: 'EBAY_US',
      query,
      capturedAt: result.capturedAt,
      resultCount: result.resultCount,
      listings,
      provenance: { method: result.method, sourceUrl: result.sourceUrl, retrievedAt: result.capturedAt },
      note: 'Live eBay listings parsed from the public search results page (bounded, non-authenticated, visible data only, no CAPTCHA/login bypass). Field coverage reflects visible page data; the official Browse API (EBAY_CLIENT_ID/EBAY_CLIENT_SECRET) or a verified actor provider adds richer fields when configured.',
    }, { status: 200 }, context.requestId)
  } catch (error) {
    const failure = classifyEbayScrapeError(error)
    if (failure.category === 'blocked_by_policy') {
      return json({
        error: 'ebay_blocked',
        status: 'blocked',
        message: failure.message,
        alternatives: ['Retry later from a different network.', 'Use the official eBay Browse API by configuring EBAY_CLIENT_ID/EBAY_CLIENT_SECRET.', 'Continue with user-provided evidence.'],
      }, { status: 409 }, context.requestId)
    }
    if (failure.category === 'rate_limited') {
      return json({ error: 'ebay_rate_limited', message: failure.message }, { status: 429 }, context.requestId)
    }
    // Tier 3 — optional Apify actor (only when the operator configured it)
    const apify = apifyEbayStatus(env)
    if (apify.status === 'ready') {
      try {
        const result = await apifyEbaySearch(env, query, limit)
        const listings = result.items.map((item, index) => ({
          id: `apify_${result.runId.slice(0, 8)}_${index}`,
          title: item.title || 'Untitled listing',
          url: item.url || 'https://www.ebay.com/',
          image: item.image || '',
          price: item.price ?? 0,
          shipping: 0,
          currency: item.currency || 'USD',
          condition: item.condition || 'Not supplied',
          seller: item.seller || 'Not supplied',
          feedback: 0,
        }))
        return json({
          status: 'live',
          provider: 'apify-ebay-scraper',
          marketplace: 'EBAY_US',
          query,
          capturedAt: result.capturedAt,
          resultCount: result.items.length,
          listings,
          provenance: { actorId: result.actorId, runId: result.runId, datasetId: result.datasetId, method: 'apify-documented-actor' },
          note: 'Live eBay data via the documented Apify eBay actor (dataset-backed).',
        }, {}, context.requestId)
      } catch (apifyError) {
        return json({ error: 'ebay_research_unavailable', message: apifyError instanceof Error ? apifyError.message : 'Unable to query eBay right now.' }, { status: 503 }, context.requestId)
      }
    }
    return json({ error: 'ebay_research_unavailable', message: failure.message, hint: 'Built-in reader failed and no approved provider is configured. Configure EBAY_CLIENT_ID/EBAY_CLIENT_SECRET or APIFY_API_TOKEN for a richer live route.', scraperStatus: ebayScraperStatus() }, { status: 503 }, context.requestId)
  }
}
