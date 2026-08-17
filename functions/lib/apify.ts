// Apify eBay actor adapter — the no-eBay-dev-app marketplace path.
//
// Instead of requiring an eBay Developer application, AiBay can retrieve live
// eBay search/product data through a DOCUMENTED third-party provider: an
// Apify Actor (`dtrungtin/ebay-scraper` by default, overridable via
// APIFY_EBay_ACTOR) run on the operator's own Apify account with their own
// token. This is the compliant alternative the architecture allows:
// "optional documented provider adapters behind server-side credentials".
//
// Hard rules:
// - The adapter NEVER runs without APIFY_API_TOKEN; it reports not_configured.
// - It is only `ready` after runtime verification: an actual bounded canary
//   run that succeeded (APIFY_EBay_CANARY set by the deploy pipeline).
//   An actor is only advertised after runtime verification.
// - Runs are bounded (timeout, poll budget), provenance includes actor id,
//   run id, dataset id, and retrieval time. Dataset output is mapped
//   defensively (documented fields with fallbacks) and confidence reflects
//   the mapping.
// - We do NOT bypass anything: this is the provider's documented API.

import type { NormalizedObservation, ProviderContext } from './adapter'
import { classifyFailure } from './orchestrator'

export type ApifyEbayItem = {
  title?: unknown
  price?: unknown
  priceCurrency?: unknown
  currency?: unknown
  url?: unknown
  link?: unknown
  image?: unknown
  condition?: unknown
  sellerName?: unknown
  seller?: unknown
  soldCount?: unknown
  reviewsCount?: unknown
  [key: string]: unknown
}

export type ApifyEbayResult = {
  provider: 'apify-ebay-scraper'
  actorId: string
  runId: string
  datasetId: string
  query: string
  marketplace: string
  capturedAt: string
  items: Array<{
    title: string
    price: number | null
    currency: string | null
    url: string
    image: string | null
    condition: string | null
    seller: string | null
    soldCount: number | null
  }>
  runStatus: string
}

export type ApifyEbayStatus = {
  status: 'ready' | 'not_configured'
  configured: boolean
  canaryVerified: boolean
  canaryDate: string | null
  actorId: string | null
  detail: string
}

export function apifyEbayStatus(env: Record<string, unknown>): ApifyEbayStatus {
  const token = typeof env.APIFY_API_TOKEN === 'string' && env.APIFY_API_TOKEN.trim().length > 0
  const actorId = typeof env.APIFY_EBay_ACTOR === 'string' && env.APIFY_EBay_ACTOR.trim().length > 0 ? env.APIFY_EBay_ACTOR.trim() : 'dtrungtin/ebay-scraper'
  const canary = typeof env.APIFY_EBay_CANARY === 'string' ? env.APIFY_EBay_CANARY.trim() : ''
  if (!token) return { status: 'not_configured', configured: false, canaryVerified: false, canaryDate: null, actorId: null, detail: 'Requires APIFY_API_TOKEN (server-side). No Apify run is ever faked; add the token to activate the documented eBay actor path.' }
  if (!canary) return { status: 'not_configured', configured: true, canaryVerified: false, canaryDate: null, actorId, detail: 'APIFY_API_TOKEN is set but the eBay actor has not passed runtime verification. The deploy pipeline runs a bounded canary before this route reports ready.' }
  return { status: 'ready', configured: true, canaryVerified: true, canaryDate: canary, actorId, detail: `Apify eBay actor verified (${canary}) via actor "${actorId}". Documented API only; dataset provenance is attached to every result.` }
}

const POLL_INTERVAL_MS = 2_000
const POLL_BUDGET_MS = 90_000

function string(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function number(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[^0-9.]/g, ''))
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function normalizeItem(item: ApifyEbayItem): ApifyEbayResult['items'][number] {
  const title = string(item.title) || string(item.name)
  const url = string(item.url) || string(item.link)
  const price = number(item.price)
  const currency = string(item.priceCurrency) || string(item.currency) || null
  const image = string(item.image) || null
  const condition = string(item.condition) || null
  const seller = string(item.sellerName) || string(item.seller) || string(item.sellerUsername) || null
  const soldCount = number(item.soldCount) ?? number(item.sold) ?? number(item.sales) ?? null
  return { title, price, currency, url, image, condition, seller, soldCount }
}

export async function apifyEbaySearch(env: Record<string, unknown>, query: string, limit = 20, signal?: AbortSignal): Promise<ApifyEbayResult> {
  const token = string(env.APIFY_API_TOKEN)
  const actorId = string(env.APIFY_EBay_ACTOR) || 'dtrungtin/ebay-scraper'
  if (!token) throw Object.assign(new Error('APIFY_API_TOKEN is not configured. The Apify eBay route is not available.'), { code: 'not_configured' })
  const status = apifyEbayStatus(env)
  if (status.status !== 'ready') throw Object.assign(new Error(`Apify eBay actor is not runtime-verified (${status.detail}).`), { code: 'not_configured' })

  const capturedAt = new Date().toISOString()
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' }

  // 1) Start a bounded run
  const startUrl = `https://api.apify.com/v2/acts/${encodeURIComponent(actorId)}/runs`
  const startResponse = await fetch(startUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({ search: query.slice(0, 120), country: string(env.DEFAULT_MARKETPLACE) === 'EBAY_US' ? 'US' : 'US', maxItems: Math.min(50, Math.max(1, limit)) }),
    signal,
  })
  if (startResponse.status === 401 || startResponse.status === 403) throw Object.assign(new Error('Apify rejected the token (HTTP 401/403).'), { code: 'invalid_credentials', status: startResponse.status })
  if (startResponse.status === 429) throw Object.assign(new Error('Apify is rate-limited (HTTP 429). AiBay does not evade rate limits.'), { code: 'rate_limited', status: 429 })
  if (!startResponse.ok) throw Object.assign(new Error(`Apify run start failed (HTTP ${startResponse.status}).`), { code: 'transient', status: startResponse.status })
  const started = await startResponse.json() as { data?: { id?: string; status?: string; defaultDatasetId?: string } }
  const runId = started.data?.id
  const datasetId = started.data?.defaultDatasetId
  if (!runId) throw Object.assign(new Error('Apify run start did not return a run id.'), { code: 'transient' })

  // 2) Poll until SUCCEEDED / FAILED / budget
  const deadline = Date.now() + POLL_BUDGET_MS
  let runStatus = started.data?.status ?? 'RUNNING'
  let finalDatasetId = datasetId ?? ''
  while (runStatus === 'RUNNING' || runStatus === 'READY' || runStatus === 'STARTING') {
    if (Date.now() > deadline) throw Object.assign(new Error('Apify run exceeded the bounded poll budget.'), { code: 'timeout' })
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
    const runResponse = await fetch(`https://api.apify.com/v2/actor-runs/${runId}`, { headers, signal })
    if (!runResponse.ok) throw Object.assign(new Error(`Apify run status failed (HTTP ${runResponse.status}).`), { code: 'transient' })
    const run = await runResponse.json() as { data?: { status?: string; defaultDatasetId?: string } }
    runStatus = run.data?.status ?? 'FAILED'
    finalDatasetId = run.data?.defaultDatasetId ?? finalDatasetId
  }
  if (runStatus !== 'SUCCEEDED') throw Object.assign(new Error(`Apify actor run ended with status ${runStatus}.`), { code: 'provider_failed' })
  if (!finalDatasetId) throw Object.assign(new Error('Apify run succeeded but returned no dataset id.'), { code: 'provider_failed' })

  // 3) Fetch the dataset
  const itemsResponse = await fetch(`https://api.apify.com/v2/datasets/${finalDatasetId}/items?format=json&limit=${Math.min(50, Math.max(1, limit))}`, { headers, signal })
  if (!itemsResponse.ok) throw Object.assign(new Error(`Apify dataset fetch failed (HTTP ${itemsResponse.status}).`), { code: 'transient' })
  const items = await itemsResponse.json() as ApifyEbayItem[]
  if (!Array.isArray(items)) throw Object.assign(new Error('Apify dataset is not an array.'), { code: 'invalid_response' })

  return {
    provider: 'apify-ebay-scraper',
    actorId,
    runId,
    datasetId: finalDatasetId,
    query: query.slice(0, 120),
    marketplace: 'EBAY_US',
    capturedAt,
    items: items.map(normalizeItem).filter((item) => item.title || item.url),
    runStatus: 'SUCCEEDED',
  }
}

export function apifyEbayObservations(result: ApifyEbayResult, ctx: ProviderContext): NormalizedObservation[] {
  return result.items.map((item) => ({
    task: ctx.task,
    capabilityId: ctx.capabilityId,
    providerId: 'apify.ebay-scraper',
    providerVersion: result.actorId,
    routeId: ctx.routeId,
    method: `apify-run-${result.runId.slice(0, 8)}`,
    retrievedAt: result.capturedAt,
    sourceUrl: item.url,
    canonicalUrl: item.url,
    sourceHost: item.url ? new URL(item.url).hostname.replace(/^www\./, '') : 'ebay.com',
    fields: [
      ...(item.title ? [{ label: 'Title', value: item.title, state: 'verified' as const, method: `apify-${result.actorId}`, confidence: 90 }] : []),
      ...(item.price != null ? [{ label: 'Source price', value: `${item.price} ${item.currency ?? 'USD'}`, state: 'verified' as const, method: `apify-${result.actorId}`, confidence: 88 }] : []),
      ...(item.seller ? [{ label: 'Seller', value: item.seller, state: 'verified' as const, method: `apify-${result.actorId}`, confidence: 85 }] : []),
      ...(item.condition ? [{ label: 'Condition', value: item.condition, state: 'verified' as const, method: `apify-${result.actorId}`, confidence: 80 }] : []),
      ...(item.soldCount != null ? [{ label: 'Sold count', value: String(item.soldCount), state: 'verified' as const, method: `apify-${result.actorId}`, confidence: 75 }] : []),
    ],
    validation: { valid: Boolean(item.title), missing: item.title ? [] : ['Title'], warnings: item.title ? [] : ['Actor returned an item without a title.'] },
    sourceHealth: item.title ? 'healthy' : 'incomplete',
  }))
}

export function classifyApifyError(error: unknown, status?: number) {
  const code = (error as { code?: string } | null)?.code
  if (code === 'not_configured') return { category: 'not_configured' as const, retryable: false, message: error instanceof Error ? error.message : 'Apify not configured.' }
  if (code === 'invalid_credentials') return { category: 'invalid_credentials' as const, retryable: false, message: error instanceof Error ? error.message : 'Apify credentials rejected.' }
  if (code === 'rate_limited') return { category: 'rate_limited' as const, retryable: true, message: error instanceof Error ? error.message : 'Apify rate limit.' }
  if (code === 'timeout') return { category: 'transient' as const, retryable: true, message: error instanceof Error ? error.message : 'Apify run timeout.' }
  return classifyFailure(error, status)
}
