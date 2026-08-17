// Router-integrated execution (migration step 5).
//
// A real request follows:
//   task -> capability registry -> route scorer -> selected adapter ->
//   bounded execution -> normalized observation -> provenance -> validation
//   -> cache -> result
//
// The executor depends only on the ProviderAdapter contract. It never selects
// an adapter that is unhealthy, unconfigured, or incompatible with the task;
// unconfigured providers are reported as `not_configured` (never `failed`,
// never faked). Transient failures retry with bounded backoff and may fall
// back to the next healthy compatible adapter; fallback events are recorded
// in the attempt trail, never hidden. Policy blocks and unsafe destinations
// are terminal — no fallback is attempted around a policy gate.

import { extractionCacheKey } from './extraction'
import { planRoute, validateSourceForTask, type RouteDecision, type TaskKind } from './orchestrator'
import type { ProviderAdapter, AdapterHealth, NormalizedObservation, ClassifiedFailure } from './adapter'
import { createAdapterRegistry } from './adapters'
import { createCacheStore, type CacheHealth } from './cache'

export type AttemptRecord = {
  attempt: number
  providerId: string
  providerVersion: string
  routeId: string
  startedAt: string
  endedAt: string
  outcome: 'success' | 'retryable_failure' | 'terminal_failure' | 'skipped_unconfigured' | 'skipped_unsupported'
  error?: ClassifiedFailure
}

export type ExecutionStatus = 'completed' | 'incomplete' | 'fallback' | 'failed' | 'blocked' | 'not_configured' | 'unsupported'

export type ExecutionResult = {
  jobId: string
  task: TaskKind
  status: ExecutionStatus
  route: RouteDecision
  attempts: AttemptRecord[]
  observations: NormalizedObservation[]
  fallbackUsed: boolean
  error?: ClassifiedFailure
  cache: { hit: boolean; mode: CacheHealth['mode']; backend: CacheHealth['backend']; durable: boolean; binding: string | null }
  note: string
  startedAt: string
  endedAt: string
}

export type ExecutionOptions = {
  /** Override adapter registry (tests). */
  adapters?: Map<string, ProviderAdapter>
  /** Override cache store (tests). */
  cacheStore?: ReturnType<typeof createCacheStore>
  /** Max attempts per provider, first attempt included. Default: policy + 1. */
  maxAttempts?: number
  /** Backoff in ms for attempt n (1-based retries). Default: 200 * 2^(n-1) + jitter. */
  backoffMs?: (retryIndex: number) => number
  /** Skip cache read (fresh execution). */
  skipCacheRead?: boolean
  /** Skip cache write. */
  skipCacheWrite?: boolean
}

const CACHE_NAMESPACE = 'public-extraction'
const CACHE_TTL_SECONDS = 300

type CacheEnvelope = {
  status: ExecutionStatus
  task: TaskKind
  observations: NormalizedObservation[]
  note: string
  storedAt: string
  expiresAt: string
}

function jobId() {
  return `job_${crypto.randomUUID().replaceAll('-', '').slice(0, 20)}`
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function defaultBackoff(retryIndex: number) {
  const base = 200 * 2 ** (retryIndex - 1)
  return base + Math.floor(Math.random() * Math.min(base, 100))
}

function cacheMeta(health: CacheHealth, hit: boolean) {
  return { hit, mode: health.mode, backend: health.backend, durable: health.durable, binding: health.binding }
}

function isPolicyTerminal(failure: ClassifiedFailure): boolean {
  return failure.category === 'unsafe_destination' || failure.category === 'blocked_by_policy' || failure.category === 'invalid_credentials'
}

export async function executeTask(env: Record<string, unknown>, task: TaskKind, sourceUrl: string, options: ExecutionOptions = {}): Promise<ExecutionResult> {
  const startedAt = new Date().toISOString()
  validateSourceForTask(task, sourceUrl)
  const route: RouteDecision = planRoute(env, task, sourceUrl)
  const adapters = options.adapters ?? createAdapterRegistry(env)
  const cache = options.cacheStore ?? createCacheStore(env, CACHE_NAMESPACE)
  const attempts: AttemptRecord[] = []

  // --- cache read (request-only fallback yields a miss, never a fake hit) ---
  const cacheKey = extractionCacheKey(sourceUrl)
  if (!options.skipCacheRead) {
    const cached = await cache.read<CacheEnvelope>(cacheKey)
    if (cached.hit && cached.value && cached.value.task === task) {
      return {
        jobId: jobId(), task, status: cached.value.status, route, attempts: [], observations: cached.value.observations,
        fallbackUsed: false, cache: cacheMeta(cache.health, true), note: `${cached.value.note} Served from cache; storedAt ${cached.value.storedAt}.`,
        startedAt, endedAt: new Date().toISOString(),
      }
    }
  }

  // --- resolve provider candidates: primary route first, then adapters' declared fallback order, then route fallbacks ---
  const candidateIds: string[] = []
  const push = (id: string | undefined) => { if (id && !candidateIds.includes(id)) candidateIds.push(id) }
  push(route.providerId)
  const primaryAdapter = adapters.get(route.providerId)
  for (const fallback of primaryAdapter?.metadata.fallbackPriority ?? []) push(fallback)
  for (const fallback of route.fallbackProviderIds) push(fallback)

  const maxAttempts = Math.max(1, options.maxAttempts ?? 3) // registry policy.maxRetryAttempts (2) + first attempt

  let lastFailure: ClassifiedFailure | undefined
  let blockedByPolicy = false

  for (const providerId of candidateIds) {
    const adapter = adapters.get(providerId)
    if (!adapter) {
      attempts.push({ attempt: attempts.length + 1, providerId, providerVersion: 'unknown', routeId: route.routeId, startedAt: new Date().toISOString(), endedAt: new Date().toISOString(), outcome: 'skipped_unconfigured', error: { category: 'not_configured', retryable: false, message: `No adapter is registered for provider ${providerId} in this deployment.` } })
      continue
    }
    if (!adapter.canHandle(task, route.capabilityId)) {
      attempts.push({ attempt: attempts.length + 1, providerId, providerVersion: adapter.metadata.version, routeId: route.routeId, startedAt: new Date().toISOString(), endedAt: new Date().toISOString(), outcome: 'skipped_unsupported', error: { category: 'unsupported', retryable: false, message: `Adapter ${providerId} cannot handle ${task}.` } })
      continue
    }
    const health: AdapterHealth = await adapter.health(env)
    if (health.status !== 'ready') {
      attempts.push({ attempt: attempts.length + 1, providerId, providerVersion: adapter.metadata.version, routeId: route.routeId, startedAt: new Date().toISOString(), endedAt: new Date().toISOString(), outcome: 'skipped_unconfigured', error: { category: 'not_configured', retryable: false, message: health.detail } })
      continue
    }

    // --- bounded attempts with retry only for transient failures ---
    let success: { raw: unknown; meta: { providerId: string; providerVersion: string; routeId: string; method: string; startedAt: string; endedAt: string } } | undefined
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const attemptStartedAt = new Date().toISOString()
      const signal = AbortSignal.timeout(adapter.metadata.limits.timeoutMs)
      try {
        const result = await adapter.execute({ task, capabilityId: route.capabilityId, sourceUrl, env, routeId: route.routeId, attempt, maxAttempts, signal })
        success = result
        attempts.push({ attempt, providerId, providerVersion: adapter.metadata.version, routeId: route.routeId, startedAt: attemptStartedAt, endedAt: result.meta.endedAt, outcome: 'success' })
        break
      } catch (error) {
        const failure = adapter.classifyError(error)
        lastFailure = failure
        attempts.push({ attempt, providerId, providerVersion: adapter.metadata.version, routeId: route.routeId, startedAt: attemptStartedAt, endedAt: new Date().toISOString(), outcome: failure.retryable ? 'retryable_failure' : 'terminal_failure', error: failure })
        if (isPolicyTerminal(failure)) { blockedByPolicy = true; break }
        if (failure.retryable && attempt < maxAttempts) {
          await sleep(options.backoffMs ? options.backoffMs(attempt) : defaultBackoff(attempt))
        } else if (!failure.retryable) {
          break
        }
      }
    }

    if (success) {
      const observation = adapter.normalize(success.raw, { task, capabilityId: route.capabilityId, sourceUrl, env, routeId: route.routeId, attempt: 1, maxAttempts, signal: AbortSignal.timeout(adapter.metadata.limits.timeoutMs) })
      const fallbackUsed = adapter.metadata.id !== route.providerId
      const status: ExecutionStatus = observation.validation.valid ? 'completed' : 'incomplete'
      const note = status === 'completed'
        ? `Executed ${task} via ${adapter.metadata.label} (v${adapter.metadata.version}) through route ${route.routeId}.`
        : `Executed ${task} via ${adapter.metadata.label}, but validation is incomplete: ${observation.validation.warnings.join('; ') || 'source returned partial evidence'}.`
      const result: ExecutionResult = {
        jobId: jobId(), task, status, route, attempts, observations: [observation], fallbackUsed,
        cache: cacheMeta(cache.health, false), note, startedAt, endedAt: new Date().toISOString(),
      }
      if (!options.skipCacheWrite && observation.validation.valid) {
        const envelope: CacheEnvelope = { status, task, observations: [observation], note, storedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + CACHE_TTL_SECONDS * 1000).toISOString() }
        await cache.write(cacheKey, envelope, CACHE_TTL_SECONDS)
      }
      return result
    }

    // Transient failures exhausted on this provider: fall through to the next candidate.
    if (blockedByPolicy) break
    if (lastFailure && !lastFailure.retryable) break
  }

  const realFailures = attempts.filter((attempt) => attempt.outcome === 'retryable_failure' || attempt.outcome === 'terminal_failure')
  const status: ExecutionStatus = blockedByPolicy ? 'blocked' : realFailures.length > 0 ? 'failed' : 'not_configured'
  const error = lastFailure ?? realFailures[realFailures.length - 1]?.error ?? attempts[attempts.length - 1]?.error
  const fallbackUsed = attempts.some((a) => a.outcome === 'retryable_failure' || a.outcome === 'terminal_failure') && attempts.some((a) => a.outcome === 'success')
  const note = status === 'blocked'
    ? 'The task was stopped at a policy gate. AiBay does not bypass access controls; no fallback was attempted around the gate.'
    : status === 'not_configured'
      ? 'No ready adapter was available for this task. Providers report not_configured, not failure; nothing was executed or faked.'
      : `All bounded attempts failed (${attempts.length} attempt(s)). Manual evidence continuation remains available.`
  return { jobId: jobId(), task, status, route, attempts, observations: [], fallbackUsed, error, cache: cacheMeta(cache.health, false), note, startedAt, endedAt: new Date().toISOString() }
}
