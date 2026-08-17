// Adapter registry (migration step 5).
//
// This module is the single source of adapter instances. It currently
// implements ONE production-capable adapter — `local.evidence` — which
// executes bounded public metadata extraction in the Pages runtime without
// any credential. The `optional.apify.actors` adapter is a scaffold that
// truthfully reports `not_configured` and refuses to execute until a
// server-side token AND a validated actor contract are configured. No other
// providers are hard-coded; adding one means implementing the ProviderAdapter
// contract and registering it here.
//
// Registry entries expose provider id, version, contract version, capability
// ids, configuration requirements, cost class, health, limits, and fallback
// priority — never credential values.

import { extractPublicProduct, type ProductExtraction } from './extraction'
import { classifyFailure } from './orchestrator'
import type { TaskKind } from './orchestrator'
import {
  notConfiguredError,
  type AdapterEstimate,
  type AdapterHealth,
  type ClassifiedFailure,
  type NormalizedObservation,
  type ObservationField,
  type ProviderAdapter,
  type ProviderContext,
  type RawProviderResult,
} from './adapter'
import { ADAPTER_CONTRACT_VERSION } from './adapter'
import { browserRunStatus, cloudflareBrowserRunAdapter } from './browser'

export type AdapterRegistryEntry = {
  providerId: string
  label: string
  version: string
  contractVersion: typeof ADAPTER_CONTRACT_VERSION
  capabilityIds: string[]
  supportedTasks: TaskKind[]
  configKeys: string[]
  auth: 'none' | 'server-secret' | 'binding'
  costClass: 'free-local' | 'free-limited' | 'byok' | 'usage-based'
  health: AdapterHealth
  limits: { timeoutMs: number; maxRedirects: number; maxBytes: number; maxRetryAttempts: number }
  fallbackPriority: string[]
}

// ---------------------------------------------------------------------------
// local.evidence — the real, production-capable adapter. No credentials.
// Bounded HTTP + structured/visible metadata extraction with per-redirect
// SSRF checks, redirect limits, size caps, and a 12s acquisition timeout
// (all enforced by extractPublicProduct).
// ---------------------------------------------------------------------------

const LOCAL_VERSION = '1.0.0'
const LOCAL_LIMITS = { timeoutMs: 12_000, maxRedirects: 3, maxBytes: 1_500_000, maxRetryAttempts: 2 }

const localEvidenceAdapter: ProviderAdapter = {
  metadata: {
    id: 'local.evidence',
    label: 'Local evidence engine',
    version: LOCAL_VERSION,
    contractVersion: ADAPTER_CONTRACT_VERSION,
    category: 'local',
    costClass: 'free-local',
    expectedLatency: 'low',
    auth: 'none',
    configKeys: [],
    capabilityIds: ['web.extract.public_metadata', 'web.extract.structured', 'web.scrape.static', 'ecommerce.product', 'source.health'],
    supportedTasks: ['product_import', 'public_scrape'],
    limits: LOCAL_LIMITS,
    fallbackPriority: ['manual.evidence'],
    description: 'Bounded HTTP, JSON-LD, Open Graph, visible metadata extraction in the Pages runtime.',
    policy: 'No authentication replay, CAPTCHA bypass, or private-source access.',
  },

  capabilities() {
    return this.metadata.capabilityIds
  },

  canHandle(task: TaskKind, capabilityId?: string) {
    if (!this.metadata.supportedTasks.includes(task)) return false
    if (capabilityId && !this.metadata.capabilityIds.includes(capabilityId)) return false
    return true
  },

  async health() {
    return this.staticHealth({})
  },

  staticHealth(): AdapterHealth {
    return { status: 'ready', checkedAt: new Date().toISOString(), version: LOCAL_VERSION, configured: true, detail: 'Local bounded extraction is available without external credentials.' }
  },

  estimate(task: TaskKind, capabilityId: string): AdapterEstimate {
    return {
      providerId: this.metadata.id,
      task,
      capabilityId,
      latencyClass: 'low',
      costClass: 'free-local',
      confidence: 95,
      reason: 'Local bounded HTTP + structured metadata is the least privileged route and requires no external provider.',
    }
  },

  async execute(ctx: ProviderContext): Promise<RawProviderResult> {
    if (!ctx.sourceUrl) throw new Error('A source URL is required for this task.')
    const startedAt = new Date().toISOString()
    const extraction = await extractPublicProduct(ctx.sourceUrl)
    return { raw: extraction, meta: { providerId: this.metadata.id, providerVersion: this.metadata.version, routeId: ctx.routeId, method: 'bounded-public-http-v1', startedAt, endedAt: new Date().toISOString() } }
  },

  normalize(raw: unknown, ctx: ProviderContext): NormalizedObservation {
    const extraction = raw as ProductExtraction
    const fields: ObservationField[] = extraction.fields.length
      ? extraction.fields.map((field) => ({ label: field.label, value: field.value, state: field.state, method: field.method, sourcePath: field.sourcePath, confidence: field.confidence }))
      : []
    if (extraction.title && !fields.some((field) => field.label === 'Title')) {
      fields.unshift({ label: 'Title', value: extraction.title, state: 'verified', method: 'Structured product metadata', sourcePath: 'JSON-LD Product.name', confidence: 98 })
    }
    if (extraction.description && !fields.some((field) => field.label === 'Description')) {
      fields.push({ label: 'Description', value: extraction.description, state: 'verified', method: 'Structured product metadata', sourcePath: 'JSON-LD Product.description', confidence: 90 })
    }
    if (extraction.price.value != null) {
      fields.push({ label: 'Source price', value: `${extraction.price.value} ${extraction.price.currency || 'currency unknown'}`, state: 'verified', method: 'Structured product metadata', sourcePath: 'JSON-LD Product.offers', confidence: 92 })
    }
    return {
      task: ctx.task,
      capabilityId: ctx.capabilityId,
      providerId: this.metadata.id,
      providerVersion: this.metadata.version,
      routeId: ctx.routeId,
      method: 'bounded-public-http-v1',
      retrievedAt: extraction.retrievedAt,
      sourceUrl: extraction.sourceUrl,
      canonicalUrl: extraction.canonicalUrl,
      sourceHost: extraction.sourceHost,
      fields,
      media: extraction.media,
      variants: extraction.variants,
      validation: {
        valid: extraction.sourceHealth === 'healthy',
        missing: extraction.sourceHealth === 'healthy' ? [] : extraction.warnings,
        warnings: extraction.warnings,
      },
      sourceHealth: extraction.sourceHealth,
    }
  },

  classifyError(error: unknown, status?: number): ClassifiedFailure {
    return classifyFailure(error, status)
  },
}

// ---------------------------------------------------------------------------
// optional.apify.actors — scaffold only. UNCONFIGURED unless a server-side
// token AND a validated actor contract are present. Never fakes a run.
// ---------------------------------------------------------------------------

const APIFY_VERSION = '0.1.0'
const APIFY_LIMITS = { timeoutMs: 30_000, maxRedirects: 0, maxBytes: 0, maxRetryAttempts: 1 }

function apifyHealth(env: Record<string, unknown>): AdapterHealth {
  const token = typeof env.APIFY_API_TOKEN === 'string' && env.APIFY_API_TOKEN.trim().length > 0
  const actorId = typeof env.APIFY_ACTOR_ID === 'string' && env.APIFY_ACTOR_ID.trim().length > 0
  const validated = env.APIFY_ACTOR_CONTRACT === 'validated'
  if (token && actorId && validated) {
    return { status: 'ready', checkedAt: new Date().toISOString(), version: APIFY_VERSION, configured: true, detail: 'Apify token and a validated actor contract are configured server-side. Only documented actors and permitted public targets are eligible.' }
  }
  if (!token) return { status: 'not_configured', checkedAt: new Date().toISOString(), version: APIFY_VERSION, configured: false, detail: 'Requires server-side APIFY_API_TOKEN. No client credential is requested; the adapter never executes without it.' }
  if (!actorId) return { status: 'not_configured', checkedAt: new Date().toISOString(), version: APIFY_VERSION, configured: false, detail: 'APIFY_API_TOKEN is set but no APIFY_ACTOR_ID is pinned. Actor/version compatibility must be validated before promotion.' }
  return { status: 'not_configured', checkedAt: new Date().toISOString(), version: APIFY_VERSION, configured: false, detail: 'APIFY_ACTOR_CONTRACT is not "validated". Discover -> compatibility check -> health check -> promote is required before execution.' }
}

const apifyAdapter: ProviderAdapter = {
  metadata: {
    id: 'optional.apify.actors',
    label: 'Apify Actors',
    version: APIFY_VERSION,
    contractVersion: ADAPTER_CONTRACT_VERSION,
    category: 'byok-external',
    costClass: 'byok',
    expectedLatency: 'variable',
    auth: 'server-secret',
    configKeys: ['APIFY_API_TOKEN', 'APIFY_ACTOR_ID', 'APIFY_ACTOR_CONTRACT'],
    capabilityIds: ['web.scrape.browser', 'web.crawl', 'web.search'],
    supportedTasks: ['public_scrape', 'public_search'],
    limits: APIFY_LIMITS,
    fallbackPriority: ['local.evidence', 'manual.evidence'],
    description: 'Documented Apify Actor API adapter for permitted public targets; bounded runs and dataset provenance.',
    policy: 'Documented API and permitted public targets only; no CAPTCHA, login, paywall, or anti-bot bypass.',
  },

  capabilities() {
    return this.metadata.capabilityIds
  },

  canHandle(task: TaskKind, capabilityId?: string) {
    if (!this.metadata.supportedTasks.includes(task)) return false
    if (capabilityId && !this.metadata.capabilityIds.includes(capabilityId)) return false
    return true
  },

  async health(env: Record<string, unknown>) {
    return apifyHealth(env)
  },

  staticHealth(env: Record<string, unknown>): AdapterHealth {
    return apifyHealth(env)
  },

  estimate(task: TaskKind, capabilityId: string): AdapterEstimate {
    return {
      providerId: this.metadata.id,
      task,
      capabilityId,
      latencyClass: 'variable',
      costClass: 'byok',
      confidence: 0,
      reason: 'Apify is not selected automatically while unconfigured; execution requires a validated actor contract.',
    }
  },

  async execute(): Promise<RawProviderResult> {
    throw notConfiguredError('Apify Actors are not configured or not validated. AiBay never fabricates a provider run; configure APIFY_API_TOKEN, APIFY_ACTOR_ID, and APIFY_ACTOR_CONTRACT=validated server-side first.')
  },

  normalize(_raw: unknown, _ctx: ProviderContext): NormalizedObservation {
    throw notConfiguredError('Apify has no normalized observations because it never executes while unconfigured.')
  },

  classifyError(error: unknown): ClassifiedFailure {
    if (error && typeof error === 'object' && (error as { kind?: string }).kind === 'not_configured') {
      return { category: 'not_configured', retryable: false, message: error instanceof Error ? error.message : 'Provider is not configured.' }
    }
    return classifyFailure(error)
  },
}

// ---------------------------------------------------------------------------
// Registry assembly
// ---------------------------------------------------------------------------

export function createAdapterRegistry(_env: Record<string, unknown>): Map<string, ProviderAdapter> {
  return new Map([
    [localEvidenceAdapter.metadata.id, localEvidenceAdapter],
    [apifyAdapter.metadata.id, apifyAdapter],
    [cloudflareBrowserRunAdapter.metadata.id, cloudflareBrowserRunAdapter],
  ])
}

export { browserRunStatus }

export function adapterRegistrySnapshot(env: Record<string, unknown>): AdapterRegistryEntry[] {
  return [...createAdapterRegistry(env).values()].map((adapter) => ({
    providerId: adapter.metadata.id,
    label: adapter.metadata.label,
    version: adapter.metadata.version,
    contractVersion: adapter.metadata.contractVersion,
    capabilityIds: adapter.metadata.capabilityIds,
    supportedTasks: adapter.metadata.supportedTasks,
    configKeys: adapter.metadata.configKeys,
    auth: adapter.metadata.auth,
    costClass: adapter.metadata.costClass,
    health: adapter.staticHealth(env),
    limits: adapter.metadata.limits,
    fallbackPriority: adapter.metadata.fallbackPriority,
  }))
}
