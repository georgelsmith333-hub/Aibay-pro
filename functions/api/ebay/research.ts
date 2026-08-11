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
    return json({ status: 'demo', marketplace: 'EBAY_US', query, capturedAt: new Date().toISOString(), resultCount: 0, listings: [], note: 'Connect an approved eBay Developer application to activate live Browse API research.' }, {}, context.requestId)
  }

  try {
    const token = await getToken(env)
    if (!token) return json({ error: 'ebay_credentials_required', message: 'Configure an approved eBay Developer application before live research.' }, { status: 412 }, context.requestId)
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
    return json({ status: 'live', marketplace: 'EBAY_US', query, capturedAt: new Date().toISOString(), resultCount: data.total || listings.length, listings }, {}, context.requestId)
  } catch (error) {
    return json({ error: 'ebay_research_unavailable', message: error instanceof Error ? error.message : 'Unable to query eBay right now.' }, { status: 503 }, context.requestId)
  }
}
