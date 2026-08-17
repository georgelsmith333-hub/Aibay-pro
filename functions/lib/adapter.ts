// Provider adapter contract (migration step 5).
//
// Every execution provider in AiBay implements this common abstraction so the
// router depends on the contract, never on provider-specific code. Adapters
// declare capabilities and metadata, report health, estimate cost, execute
// bounded tasks, normalize results into evidence observations with provenance,
// and classify failures with the shared failure taxonomy.
//
// Hard rules enforced by the contract:
// - An adapter NEVER runs when its credentials/capability are not configured;
//   it reports `not_configured` (never a fake run, never `failed`).
// - Adapters never bypass the policy gate: URL safety, SSRF protection,
//   redirect validation, and authentication boundaries are applied by the
//   router and by the adapter's own bounded execution path.
// - Provider versions are fixed metadata. There is no "always use latest":
//   promotion follows discover -> compatibility check -> health check ->
//   explicit promote.

import type { FailureCategory, TaskKind } from './orchestrator'
import type { RegistryStatus } from './registry'

export const ADAPTER_CONTRACT_VERSION = 'v1' as const

export type ProviderCategory = 'local' | 'official-api' | 'public-provider' | 'byok-external' | 'browser'
export type CostClass = 'free-local' | 'free-limited' | 'byok' | 'usage-based'
export type LatencyClass = 'low' | 'medium' | 'high' | 'variable'

export type ProviderLimits = {
  timeoutMs: number
  maxRedirects: number
  maxBytes: number
  /** Bounded retries for transient failures (first attempt excluded). */
  maxRetryAttempts: number
}

export type ProviderMetadata = {
  id: string
  label: string
  version: string
  contractVersion: typeof ADAPTER_CONTRACT_VERSION
  category: ProviderCategory
  costClass: CostClass
  expectedLatency: LatencyClass
  auth: 'none' | 'server-secret' | 'binding'
  /** Names of the server-side configuration keys (never their values). */
  configKeys: string[]
  capabilityIds: string[]
  supportedTasks: TaskKind[]
  limits: ProviderLimits
  /** Ordered fallback providers; only healthy, compatible adapters are tried. */
  fallbackPriority: string[]
  description: string
  policy: string
}

export type AdapterHealth = {
  status: RegistryStatus
  checkedAt: string
  version: string
  detail: string
  configured: boolean
}

export type AdapterEstimate = {
  providerId: string
  task: TaskKind
  capabilityId: string
  latencyClass: LatencyClass
  costClass: CostClass
  confidence: number
  reason: string
}

export type ProviderContext = {
  task: TaskKind
  capabilityId: string
  sourceUrl?: string
  env: Record<string, unknown>
  requestId?: string
  routeId: string
  attempt: number
  maxAttempts: number
  signal: AbortSignal
}

export type RawProviderResult = {
  raw: unknown
  meta: {
    providerId: string
    providerVersion: string
    routeId: string
    method: string
    startedAt: string
    endedAt: string
  }
}

export type ObservationField = {
  label: string
  value: string
  state: 'verified' | 'derived' | 'needs_review' | 'unknown'
  method: string
  sourcePath?: string
  confidence: number
}

export type NormalizedObservation = {
  task: TaskKind
  capabilityId: string
  providerId: string
  providerVersion: string
  routeId: string
  method: string
  retrievedAt: string
  sourceUrl: string
  canonicalUrl?: string
  sourceHost?: string
  fields: ObservationField[]
  media?: Array<{ url: string; alt?: string; sourcePath?: string }>
  variants?: Array<{ label: string; attributes: Record<string, string>; sourcePath?: string }>
  validation: { valid: boolean; missing: string[]; warnings: string[] }
  sourceHealth?: 'healthy' | 'blocked' | 'incomplete'
}

export type ClassifiedFailure = {
  category: FailureCategory
  retryable: boolean
  message: string
}

export type NotConfiguredError = Error & { readonly kind: 'not_configured' }

export function notConfiguredError(detail: string): NotConfiguredError {
  const error = new Error(detail) as NotConfiguredError
  Object.defineProperty(error, 'kind', { value: 'not_configured', enumerable: false })
  return error
}

export interface ProviderAdapter {
  readonly metadata: ProviderMetadata
  /** Static capability IDs this adapter can serve (subset of the registry). */
  capabilities(): string[]
  /** Whether this adapter can serve the task (and, when given, the capability). */
  canHandle(task: TaskKind, capabilityId?: string): boolean
  /** Live health of the adapter in the given environment. */
  health(env: Record<string, unknown>): Promise<AdapterHealth>
  /** Synchronous health status used for registry snapshots. */
  staticHealth(env: Record<string, unknown>): AdapterHealth
  /** Cost/latency estimate for a task. */
  estimate(task: TaskKind, capabilityId: string): AdapterEstimate
  /** Bounded execution. Must throw on failure; must respect ctx.signal. */
  execute(ctx: ProviderContext): Promise<RawProviderResult>
  /** Normalizes a successful raw result into evidence observations with provenance. */
  normalize(raw: unknown, ctx: ProviderContext): NormalizedObservation
  /** Maps an execution error to the shared failure taxonomy. */
  classifyError(error: unknown, status?: number): ClassifiedFailure
}
