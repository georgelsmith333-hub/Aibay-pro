import { createCacheStore, type CacheHealth } from './cache'
import { browserRunStatus } from './adapters'
import { FINGERPRINT_VERSION } from './dedup'

export type RegistryStatus = 'ready' | 'not_configured' | 'degraded' | 'unavailable' | 'unsupported' | 'rate_limited' | 'blocked_by_policy'

export type ProviderDefinition = {
  id: string
  label: string
  category: 'local' | 'official-api' | 'public-provider' | 'byok-external' | 'browser'
  status: RegistryStatus
  auth: 'none' | 'server-secret' | 'binding'
  configKeys: string[]
  capabilities: string[]
  supportedTasks: string[]
  requiresBrowser: boolean
  requiresJavaScript: boolean
  costClass: 'free-local' | 'free-limited' | 'byok' | 'usage-based'
  expectedLatency: 'low' | 'medium' | 'high' | 'variable'
  lastVerified: string
  fallbackProviderIds: string[]
  details: string
  policy: string
}

export type CapabilityDefinition = {
  id: string
  label: string
  providerIds: string[]
  defaultProviderId: string
  taskTypes: string[]
  urlTypes: string[]
  browserRequired: boolean
  javascriptRequired: boolean
  status: RegistryStatus
  fallbackCapabilityIds: string[]
  details: string
}

export type DedupStatus = {
  mode: 'local_deterministic'
  fingerprintVersion: number
}

export type RegistrySnapshot = {
  checkedAt: string
  providers: ProviderDefinition[]
  capabilities: CapabilityDefinition[]
  policy: {
    automaticRouteSelection: boolean
    externalRequests: 'metadata-only-unless-configured'
    maxRetryAttempts: number
    maxRedirects: number
    credentials: 'server-only'
    cache: CacheHealth
    dedup: DedupStatus
  }
}

type Env = Record<string, unknown>

function configured(env: Env, key: string) {
  const value = env[key]
  return typeof value === 'string' && value.trim().length > 0
}

function statusForSecret(env: Env, keys: string[], readyDetails: string): { status: RegistryStatus; details: string } {
  if (keys.every((key) => configured(env, key))) return { status: 'ready', details: readyDetails }
  return { status: 'not_configured', details: `Requires server-side configuration: ${keys.join(', ')}. No client credential is requested.` }
}

export function buildRegistry(env: Env): RegistrySnapshot {
  const checkedAt = new Date().toISOString()
  const ebay = statusForSecret(env, ['EBAY_CLIENT_ID', 'EBAY_CLIENT_SECRET'], 'Official eBay Browse API credentials are configured server-side.')
  const ai = statusForSecret(env, ['AI_PROVIDER_API_KEY', 'AI_PROVIDER_BASE_URL'], 'Optional conservative AI title-ranking route is configured server-side.')
  const apify = statusForSecret(env, ['APIFY_API_TOKEN'], 'Apify Actor API access is configured server-side; Actor and version compatibility must still be validated per task.')
  const firecrawl = statusForSecret(env, ['FIRECRAWL_API_KEY'], 'Firecrawl API access is configured server-side; provider limits and documented endpoint compatibility still apply.')
  const browserRun = browserRunStatus(env)
  const providers: ProviderDefinition[] = [
    { id: 'local.evidence', label: 'Local evidence engine', category: 'local', status: 'ready', auth: 'none', configKeys: [], capabilities: ['web.extract.public_metadata', 'web.extract.structured', 'ecommerce.product', 'ebay.listing_draft', 'source.health'], supportedTasks: ['product_import', 'evidence_review', 'listing_draft', 'draft_export'], requiresBrowser: false, requiresJavaScript: false, costClass: 'free-local', expectedLatency: 'low', lastVerified: checkedAt, fallbackProviderIds: ['manual.evidence'], details: 'Bounded HTTP, JSON-LD, Open Graph, visible metadata, deterministic listing drafts, and evidence review.', policy: 'No authentication replay, CAPTCHA bypass, or private-source access.' },
    { id: 'official.ebay.browse', label: 'eBay Browse API', category: 'official-api', status: ebay.status, auth: 'server-secret', configKeys: ['EBAY_CLIENT_ID', 'EBAY_CLIENT_SECRET'], capabilities: ['market.ebay_us'], supportedTasks: ['market_research', 'listing_comparison'], requiresBrowser: false, requiresJavaScript: false, costClass: 'usage-based', expectedLatency: 'medium', lastVerified: checkedAt, fallbackProviderIds: ['example.market', 'unavailable.market'], details: ebay.details, policy: 'Official API only; no protected-page scraping.' },
    { id: 'optional.ai.ranking', label: 'Conservative AI ranking', category: 'byok-external', status: ai.status, auth: 'server-secret', configKeys: ['AI_PROVIDER_API_KEY', 'AI_PROVIDER_BASE_URL'], capabilities: ['listing.title_rank'], supportedTasks: ['title_ranking'], requiresBrowser: false, requiresJavaScript: false, costClass: 'byok', expectedLatency: 'variable', lastVerified: checkedAt, fallbackProviderIds: ['local.evidence'], details: ai.details, policy: 'May reorder supplied candidates only; must not invent unsupported facts.' },
    { id: 'optional.apify.actors', label: 'Apify Actors', category: 'byok-external', status: apify.status, auth: 'server-secret', configKeys: ['APIFY_API_TOKEN'], capabilities: ['web.scrape.browser', 'web.crawl', 'web.search'], supportedTasks: ['public_scrape', 'public_crawl', 'public_search'], requiresBrowser: true, requiresJavaScript: true, costClass: 'byok', expectedLatency: 'variable', lastVerified: checkedAt, fallbackProviderIds: ['local.evidence', 'manual.evidence'], details: apify.details, policy: 'Documented API and permitted public targets only; bounded runs and dataset provenance required.' },
    { id: 'optional.firecrawl.v2', label: 'Firecrawl v2', category: 'byok-external', status: firecrawl.status, auth: 'server-secret', configKeys: ['FIRECRAWL_API_KEY'], capabilities: ['web.search', 'web.scrape.static', 'web.extract.structured'], supportedTasks: ['public_search', 'public_scrape', 'public_extract'], requiresBrowser: false, requiresJavaScript: true, costClass: 'byok', expectedLatency: 'variable', lastVerified: checkedAt, fallbackProviderIds: ['local.evidence', 'manual.evidence'], details: firecrawl.details, policy: 'Documented endpoints only; no unlimited/free-throughput claim and no protected-source bypass.' },
    { id: 'optional.cloudflare.browser_run', label: 'Cloudflare Browser Run', category: 'browser', status: browserRun.status, auth: 'server-secret', configKeys: ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID', 'BROWSER_RUN_CANARY'], capabilities: ['web.scrape.browser', 'web.extract.structured', 'document.pdf', 'image.extract'], supportedTasks: ['public_scrape'], requiresBrowser: true, requiresJavaScript: true, costClass: 'usage-based', expectedLatency: 'high', lastVerified: checkedAt, fallbackProviderIds: ['local.evidence', 'manual.evidence'], details: browserRun.detail, policy: 'Public permitted workflows only; no CAPTCHA, login, paywall, or anti-bot evasion.' },
    { id: 'manual.evidence', label: 'User-provided evidence', category: 'local', status: 'ready', auth: 'none', configKeys: [], capabilities: ['evidence.manual'], supportedTasks: ['manual_continuation', 'source_recovery'], requiresBrowser: false, requiresJavaScript: false, costClass: 'free-local', expectedLatency: 'low', lastVerified: checkedAt, fallbackProviderIds: [], details: 'Creates a reviewable record from facts the user is entitled to provide.', policy: 'Every field is marked user-provided and remains review-gated.' },
  ]
  const providerStatus = (id: string) => providers.find((provider) => provider.id === id)?.status || 'unavailable'
  const capabilities: CapabilityDefinition[] = [
    { id: 'web.extract.public_metadata', label: 'Public structured extraction', providerIds: ['local.evidence', 'optional.firecrawl.v2'], defaultProviderId: 'local.evidence', taskTypes: ['product_import', 'public_extract'], urlTypes: ['static_product', 'public_article', 'public_document'], browserRequired: false, javascriptRequired: false, status: providerStatus('local.evidence'), fallbackCapabilityIds: ['evidence.manual'], details: 'Extracts attributable public metadata and preserves field-level provenance.' },
    { id: 'web.scrape.static', label: 'Bounded static page retrieval', providerIds: ['local.evidence', 'optional.firecrawl.v2'], defaultProviderId: 'local.evidence', taskTypes: ['public_scrape'], urlTypes: ['static_product', 'public_article'], browserRequired: false, javascriptRequired: false, status: providerStatus('local.evidence'), fallbackCapabilityIds: ['web.extract.public_metadata', 'evidence.manual'], details: 'Bounded HTTP retrieval of permitted public pages with redirect and size limits.' },
    { id: 'web.search', label: 'Public web search', providerIds: ['optional.firecrawl.v2'], defaultProviderId: 'optional.firecrawl.v2', taskTypes: ['public_search'], urlTypes: ['search_results'], browserRequired: false, javascriptRequired: true, status: providerStatus('optional.firecrawl.v2'), fallbackCapabilityIds: ['evidence.manual'], details: 'Search is only available through a configured, documented provider. No general search provider is configured in this deployment.' },
    { id: 'web.scrape.browser', label: 'Permitted browser observation', providerIds: ['optional.cloudflare.browser_run', 'optional.apify.actors'], defaultProviderId: 'optional.cloudflare.browser_run', taskTypes: ['public_scrape'], urlTypes: ['public_dynamic'], browserRequired: true, javascriptRequired: true, status: providerStatus('optional.cloudflare.browser_run') === 'ready' || providerStatus('optional.apify.actors') === 'ready' ? 'ready' : 'not_configured', fallbackCapabilityIds: ['web.extract.public_metadata', 'evidence.manual'], details: 'Optional browser-capable public route (canary-verified). It is never an access-control bypass.' },
    { id: 'market.ebay_us', label: 'eBay US market research', providerIds: ['official.ebay.browse'], defaultProviderId: 'official.ebay.browse', taskTypes: ['market_research', 'listing_comparison'], urlTypes: ['ecommerce_product'], browserRequired: false, javascriptRequired: false, status: providerStatus('official.ebay.browse'), fallbackCapabilityIds: [], details: 'Uses the official Browse API when configured; otherwise returns an unavailable or example-labelled state.' },
    { id: 'product.research.pipeline', label: 'Product discovery and scoring', providerIds: ['local.evidence', 'optional.firecrawl.v2', 'optional.apify.actors'], defaultProviderId: 'local.evidence', taskTypes: ['product_discovery', 'product_research'], urlTypes: ['search_results', 'product_listing', 'static_product'], browserRequired: false, javascriptRequired: false, status: 'ready', fallbackCapabilityIds: ['evidence.manual'], details: 'Shared pipeline contract for discovery, extraction, normalization, deduplication, validation, scoring, and evidence-backed export.' },
    { id: 'evidence.manual', label: 'Manual evidence continuation', providerIds: ['manual.evidence'], defaultProviderId: 'manual.evidence', taskTypes: ['manual_continuation', 'source_recovery'], urlTypes: ['any_source'], browserRequired: false, javascriptRequired: false, status: 'ready', fallbackCapabilityIds: [], details: 'Reviewable source recovery without pretending user-provided facts were scraped.' },
  ]
  return {
    checkedAt,
    providers,
    capabilities,
    policy: {
      automaticRouteSelection: true,
      externalRequests: 'metadata-only-unless-configured',
      maxRetryAttempts: 2,
      maxRedirects: 3,
      credentials: 'server-only',
      cache: createCacheStore(env, 'registry').health,
      dedup: { mode: 'local_deterministic', fingerprintVersion: FINGERPRINT_VERSION },
    },
  }
}
