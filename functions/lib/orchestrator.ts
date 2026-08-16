import { assertSafePublicUrl } from './security'
import { buildRegistry, type RegistrySnapshot, type RegistryStatus } from './registry'

export type TaskKind = 'product_import' | 'public_scrape' | 'public_search' | 'market_research' | 'product_research' | 'listing_draft' | 'manual_continuation'
export type FailureCategory = 'invalid_input' | 'unsafe_destination' | 'transient' | 'rate_limited' | 'invalid_credentials' | 'unsupported' | 'blocked_by_policy' | 'not_configured' | 'unknown'

export type RouteDecision = {
  routeId: string
  task: TaskKind
  capabilityId: string
  providerId: string
  providerStatus: RegistryStatus
  selectedAutomatically: boolean
  fallbackProviderIds: string[]
  reason: string
  constraints: string[]
  plannedAt: string
}

export type JobEvent = {
  id: string
  label: string
  state: 'pending' | 'active' | 'complete' | 'blocked' | 'failed'
  detail?: string
  at: string
}

export type JobSnapshot = {
  jobId: string
  task: TaskKind
  sourceUrl?: string
  status: 'queued' | 'planning' | 'running' | 'retrying' | 'fallback' | 'partial' | 'completed' | 'failed' | 'cancelled'
  progress: number
  attempt: number
  route?: RouteDecision
  events: JobEvent[]
  error?: { category: FailureCategory; message: string; retryable: boolean }
  startedAt: string
  updatedAt: string
  endedAt?: string
  persistence: 'durable' | 'request_only'
}

type Env = Record<string, unknown>

function targetKind(sourceUrl: string | undefined): 'static_product' | 'public_dynamic' | 'search_results' | 'ecommerce_product' | 'unknown' {
  if (!sourceUrl) return 'unknown'
  try {
    const parsed = new URL(sourceUrl)
    if (/\/item\/|\/product\/|\/dp\//i.test(parsed.pathname)) return 'ecommerce_product'
    if (/[?&](q|query|search)=/i.test(parsed.search) || /\/search|\/s\//i.test(parsed.pathname)) return 'search_results'
    return 'static_product'
  } catch { return 'unknown' }
}

function capabilityFor(task: TaskKind): string {
  if (task === 'product_import') return 'web.extract.public_metadata'
  if (task === 'public_scrape') return 'web.scrape.static'
  if (task === 'public_search') return 'web.search'
  if (task === 'market_research') return 'market.ebay_us'
  if (task === 'product_research') return 'product.research.pipeline'
  if (task === 'manual_continuation') return 'evidence.manual'
  return 'ebay.listing_draft'
}

export function classifyFailure(error: unknown, status?: number): { category: FailureCategory; retryable: boolean; message: string } {
  const message = error instanceof Error ? error.message : String(error || 'Unknown provider error')
  if (/unsafe|private|loopback|metadata|localhost|local-network|unsupported protocol|credential-bearing/i.test(message)) return { category: 'unsafe_destination', retryable: false, message }
  if (/captcha|login|signin|paywall|access control|anti.?bot|session/i.test(message)) return { category: 'blocked_by_policy', retryable: false, message }
  if (status === 401 || status === 403) return { category: 'invalid_credentials', retryable: false, message: message || `Provider returned HTTP ${status}.` }
  if (status === 429 || /rate.?limit|too many requests/i.test(message)) return { category: 'rate_limited', retryable: true, message }
  if (status === 408 || status === 425 || status === 500 || status === 502 || status === 503 || status === 504 || /timeout|temporar|network|fetch failed/i.test(message)) return { category: 'transient', retryable: true, message }
  if (/not configured|missing credential/i.test(message)) return { category: 'not_configured', retryable: false, message }
  if (/unsupported|not available/i.test(message)) return { category: 'unsupported', retryable: false, message }
  return { category: status && status >= 400 && status < 500 ? 'invalid_input' : 'unknown', retryable: false, message }
}

export function planRoute(env: Env, task: TaskKind, sourceUrl?: string): RouteDecision {
  const registry: RegistrySnapshot = buildRegistry(env)
  const capabilityId = capabilityFor(task)
  const capability = registry.capabilities.find((item) => item.id === capabilityId)
  if (!capability) {
    return { routeId: `route_${crypto.randomUUID()}`, task, capabilityId, providerId: 'manual.evidence', providerStatus: 'unsupported', selectedAutomatically: true, fallbackProviderIds: [], reason: 'No registered capability matched this task.', constraints: ['manual review required'], plannedAt: new Date().toISOString() }
  }
  const target = targetKind(sourceUrl)
  const providerOrder = capability.providerIds
  const candidates = providerOrder.map((id) => registry.providers.find((provider) => provider.id === id)).filter(Boolean)
  const eligible = candidates.find((provider) => provider && provider.status === 'ready')
  const defaultProvider = registry.providers.find((provider) => provider.id === capability.defaultProviderId)
  const selected = eligible || defaultProvider || registry.providers.find((provider) => provider.id === 'manual.evidence')
  const constraints = ['public or user-authorized source only', 'redirect and request limits enforced', 'field provenance required', 'no CAPTCHA, login, paywall, or anti-bot bypass']
  if (selected?.requiresBrowser) constraints.push('browser route requires configured provider and permitted public access')
  if (selected?.status !== 'ready') constraints.push('selected route is not configured; result must remain explicit')
  const reason = selected?.status === 'ready'
    ? `Selected ${selected.label} for ${task} on ${target} using the first healthy registered route.`
    : `No healthy configured provider is available for ${task}; preserving a truthful ${selected?.status || 'unavailable'} state and manual fallback.`
  return { routeId: `route_${crypto.randomUUID()}`, task, capabilityId, providerId: selected?.id || 'manual.evidence', providerStatus: selected?.status || 'unavailable', selectedAutomatically: true, fallbackProviderIds: capability.providerIds.filter((id) => id !== selected?.id), reason, constraints, plannedAt: new Date().toISOString() }
}

export function createJobSnapshot(env: Env, task: TaskKind, sourceUrl?: string, persistence: 'durable' | 'request_only' = 'request_only'): JobSnapshot {
  const now = new Date().toISOString()
  const route = planRoute(env, task, sourceUrl)
  const events: JobEvent[] = [
    { id: 'validate', label: 'Validate task and source', state: 'complete', at: now },
    { id: 'plan', label: 'Plan and select route', state: 'complete', detail: route.reason, at: now },
    { id: 'execute', label: 'Execute selected capability', state: route.providerStatus === 'ready' ? 'active' : 'blocked', detail: route.providerStatus === 'ready' ? `Provider: ${route.providerId}` : `Provider state: ${route.providerStatus}`, at: now },
    { id: 'validate_result', label: 'Validate evidence and provenance', state: 'pending', at: now },
  ]
  const unavailable = route.providerStatus !== 'ready' && route.providerId !== 'local.evidence' && route.providerId !== 'manual.evidence'
  return { jobId: `job_${crypto.randomUUID().replaceAll('-', '').slice(0, 20)}`, task, sourceUrl, status: unavailable ? 'fallback' : 'running', progress: unavailable ? 45 : 55, attempt: 1, route, events, startedAt: now, updatedAt: now, persistence }
}

export function validateSourceForTask(task: TaskKind, sourceUrl?: string) {
  if (!sourceUrl && task !== 'manual_continuation' && task !== 'market_research') throw new Error('A source URL is required for this task.')
  if (sourceUrl) assertSafePublicUrl(sourceUrl)
}
