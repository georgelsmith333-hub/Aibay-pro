import { apifyEbaySearch, apifyEbayStatus } from '../../lib/apify'
import { classifyEbayScrapeError, ebayScraperStatus, searchEbayLocal } from '../../lib/ebay-scraper'
import { priceBandStatistics, summarizeSoldObservations } from '../../lib/evidence-normalizer'
import { getContext, json, normalizeInputString } from '../../lib/security'

type Env = Record<string, string | undefined>
type RequestContext = { request: Request; env: Env }
type ResearchBody = { query?: unknown; gtin?: unknown; mpn?: unknown; limit?: unknown }

type EbayItemSummary = {
  itemId?: string
  title?: string
  itemWebUrl?: string
  itemAffiliateWebUrl?: string
  image?: { imageUrl?: string }
  price?: { value?: string; currency?: string }
  shippingOptions?: Array<{ shippingCost?: { value?: string } }>
  condition?: string
  seller?: { username?: string; feedbackPercentage?: string }
}

type ProviderStatus = {
  id: string
  label: string
  status: 'ready' | 'not_configured' | 'blocked' | 'failed'
  configured: boolean
  detail: string
}

function getProviderStatus(env: Env): ProviderStatus[] {
  const apify = apifyEbayStatus(env)
  return [
    {
      id: 'ebay-browse-official',
      label: 'eBay Browse API',
      status: env.EBAY_CLIENT_ID && env.EBAY_CLIENT_SECRET ? 'ready' : 'not_configured',
      configured: Boolean(env.EBAY_CLIENT_ID && env.EBAY_CLIENT_SECRET),
      detail: env.EBAY_CLIENT_ID && env.EBAY_CLIENT_SECRET ? 'Server-side OAuth credentials are present; the official route can search active eBay listings.' : 'Add EBAY_CLIENT_ID and EBAY_CLIENT_SECRET as server-side secrets to enable the official route.',
    },
    {
      id: 'local.ebay-scraper',
      label: 'Public eBay reader',
      status: 'ready',
      configured: true,
      detail: ebayScraperStatus().detail,
    },
    {
      id: 'apify-ebay-scraper',
      label: 'Approved actor provider',
      status: apify.status === 'ready' ? 'ready' : 'not_configured',
      configured: apify.status === 'ready',
      detail: apify.detail,
    },
  ]
}

function configuredRoutes(env: Env) {
  return getProviderStatus(env).filter((provider) => provider.configured).map((provider) => provider.id)
}

function guidance(env: Env) {
  return [
    'No CAPTCHA, login, session-cookie replay, or anti-bot evasion is attempted.',
    ...(env.EBAY_CLIENT_ID && env.EBAY_CLIENT_SECRET ? [] : ['For the richest supported route, configure EBAY_CLIENT_ID and EBAY_CLIENT_SECRET as server-side secrets.']),
    ...(apifyEbayStatus(env).status === 'ready' ? [] : ['An approved actor provider can be enabled with APIFY_API_TOKEN if the operator chooses that route.']),
    'You can continue with active-listing observations or attach user-provided evidence; active listings are never relabeled as sold history.',
  ]
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

function normalizeListing(item: EbayItemSummary, index: number, capturedAt: string) {
  return {
    id: item.itemId || `ebay_${index}`,
    title: item.title || 'Untitled listing',
    url: item.itemWebUrl || item.itemAffiliateWebUrl || 'https://www.ebay.com/',
    image: item.image?.imageUrl || '',
    price: Number(item.price?.value || 0),
    shipping: Number(item.shippingOptions?.[0]?.shippingCost?.value || 0),
    currency: item.price?.currency || 'USD',
    condition: item.condition || 'Not supplied',
    seller: item.seller?.username || 'Not supplied',
    feedback: Number(item.seller?.feedbackPercentage || 0),
    capturedAt,
    sourceUrl: 'https://api.ebay.com/buy/browse/v1/item_summary/search',
    method: 'ebay-browse-official',
  }
}

function researchMeta(env: Env, query: string, gtin: string, mpn: string) {
  return {
    providerStatus: getProviderStatus(env),
    configuredRoutes: configuredRoutes(env),
    searchParameters: { query, gtin: gtin || null, mpn: mpn || null, marketplace: 'EBAY_US' },
    guidance: guidance(env),
  }
}

export const onRequestPost = async ({ request, env }: RequestContext): Promise<Response> => {
  const context = getContext(request, env)
  let body: ResearchBody
  try { body = await request.json() as ResearchBody } catch { return json({ error: 'invalid_json' }, { status: 400 }, context.requestId) }
  const query = normalizeInputString(body.query, 160)
  const gtin = normalizeInputString(body.gtin, 64).replace(/[^0-9A-Za-z-]/g, '')
  const mpn = normalizeInputString(body.mpn, 80)
  if (!query && !gtin && !mpn) return json({ error: 'query_required', message: 'A product keyword, GTIN, or MPN is required.' }, { status: 400 }, context.requestId)
  const resolvedQuery = query || gtin || mpn
  const limit = Math.min(Math.max(Number(body.limit || 20), 1), 50)
  const meta = researchMeta(env, resolvedQuery, gtin, mpn)

  if (env.APP_ENV !== 'production' && (!env.EBAY_CLIENT_ID || !env.EBAY_CLIENT_SECRET)) {
    return json({ status: 'demo', marketplace: 'EBAY_US', query: resolvedQuery, capturedAt: new Date().toISOString(), resultCount: 0, listings: [], ...meta, note: 'Non-production mode has no live fallback claim. Configure credentials or use the deployed production project for live route status.' }, {}, context.requestId)
  }

  // Tier 1 — official Browse API. eBay supports GTIN directly; MPN is used
  // as a keyword refinement because Browse search has no MPN query parameter.
  try {
    const token = await getToken(env)
    if (token) {
      const url = new URL('https://api.ebay.com/buy/browse/v1/item_summary/search')
      if (gtin) url.searchParams.set('gtin', gtin)
      else url.searchParams.set('q', (mpn ? `${mpn} ${query}` : query).slice(0, 100))
      url.searchParams.set('limit', String(limit))
      url.searchParams.set('fieldgroups', 'EXTENDED')
      const response = await fetch(url, { headers: { authorization: `Bearer ${token}`, 'x-ebay-c-marketplace-id': 'EBAY_US', accept: 'application/json' } })
      if (!response.ok) throw new Error(`eBay Browse API returned HTTP ${response.status}.`)
      const data = await response.json<{ total?: number; itemSummaries?: EbayItemSummary[] }>()
      const capturedAt = new Date().toISOString()
      const listings = (data.itemSummaries || []).map((item, index) => normalizeListing(item, index, capturedAt))
      return json({ status: 'live', provider: 'ebay-browse-official', marketplace: 'EBAY_US', query: resolvedQuery, capturedAt, resultCount: data.total || listings.length, listings, listingPriceBand: priceBandStatistics(listings), soldDataStatus: 'not_available_from_browse_active_listing_search', ...meta, note: 'Live active-listing data from the official eBay Browse API. This route does not provide a sold-history census.' }, {}, context.requestId)
    }
  } catch (error) {
    // An invalid or expired official credential is reported, then the free
    // public route still gets a chance when the failure is not a hard policy stop.
    if (env.EBAY_CLIENT_ID && env.EBAY_CLIENT_SECRET) {
      const detail = error instanceof Error ? error.message : 'The official eBay route failed.'
      meta.providerStatus = meta.providerStatus.map((provider) => provider.id === 'ebay-browse-official' ? { ...provider, status: 'failed' as const, detail } : provider)
    }
  }

  // Tier 2 — bounded public search-page reader.
  try {
    const result = await searchEbayLocal(resolvedQuery, limit, env, { gtin, mpn })
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
      watchers: item.watchers,
      capturedAt: item.capturedAt,
      sourceUrl: item.sourceUrl,
      method: item.method,
    }))
    return json({
      status: 'live',
      provider: 'local.ebay-scraper',
      marketplace: 'EBAY_US',
      query: resolvedQuery,
      capturedAt: result.capturedAt,
      resultCount: result.resultCount,
      listings,
      listingPriceBand: priceBandStatistics(listings),
      soldSignalSummary: summarizeSoldObservations(listings),
      soldDataStatus: 'listing_level_signals_only_not_sold_history',
      provenance: { method: result.method, sourceUrl: result.sourceUrl, retrievedAt: result.capturedAt },
      ...meta,
      note: 'Live active eBay listings parsed from the public search results page (bounded, non-authenticated, visible data only, no CAPTCHA/login bypass). Sold counts and watchers are only reported when visibly present on individual listings and never represent complete sold-history data.',
    }, { status: 200 }, context.requestId)
  } catch (error) {
    const failure = classifyEbayScrapeError(error)
    const apify = apifyEbayStatus(env)

    // Tier 3 — optional documented actor provider. This is tried after a
    // public-page block and remains explicitly attributed in the response.
    if (apify.status === 'ready') {
      try {
        const result = await apifyEbaySearch(env, resolvedQuery, limit)
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
          sourceUrl: `https://api.apify.com/v2/actor-runs/${result.runId}`,
          capturedAt: result.capturedAt,
          method: 'apify-documented-actor',
        }))
        return json({ status: 'live', provider: 'apify-ebay-scraper', marketplace: 'EBAY_US', query: resolvedQuery, capturedAt: result.capturedAt, resultCount: result.items.length, listings, listingPriceBand: priceBandStatistics(listings), soldDataStatus: 'provider_fields_are_not_assumed_to_be_sold_history', provenance: { actorId: result.actorId, runId: result.runId, datasetId: result.datasetId, method: 'apify-documented-actor' }, ...meta, note: 'Live eBay data via the documented actor provider. Field meanings remain provider-attributed; active listings are not labeled as sold data.' }, {}, context.requestId)
      } catch (apifyError) {
        meta.providerStatus = meta.providerStatus.map((provider) => provider.id === 'apify-ebay-scraper' ? { ...provider, status: 'failed' as const, detail: apifyError instanceof Error ? apifyError.message : 'The actor provider failed.' } : provider)
      }
    }

    if (failure.category === 'blocked_by_policy') {
      return json({ error: 'ebay_blocked', status: 'blocked', message: failure.message, blockedProvider: 'local.ebay-scraper', ...meta, actionableGuidance: ['The public reader was blocked or challenged by eBay.', 'The exact query and identifiers were preserved; no substitute product or image was inserted.', ...guidance(env)] }, { status: 409 }, context.requestId)
    }
    if (failure.category === 'rate_limited') return json({ error: 'ebay_rate_limited', status: 'unavailable', message: failure.message, ...meta, actionableGuidance: ['Wait and retry later, or configure the official Browse API for a separate approved route.'] }, { status: 429 }, context.requestId)
    return json({ error: 'ebay_research_unavailable', status: 'unavailable', message: failure.message, ...meta, hint: 'Every configured route was attempted without claiming data that was not returned.', scraperStatus: ebayScraperStatus() }, { status: 503 }, context.requestId)
  }
}
