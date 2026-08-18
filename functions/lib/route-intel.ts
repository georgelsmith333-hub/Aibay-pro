// Auto-routing intelligence — self-updating route health, zero keys.
//
// Every provider execution records a health sample (success/failure, latency,
// error category) into the durable KV store. The router consults these scores
// to prefer historically-healthy routes among the ELIGIBLE (configured +
// compatible) providers — it never promotes an unconfigured provider, and it
// never bypasses a policy block. This is the "auto-updating, no manual
// checks" layer: the system learns which routes work from real outcomes.
//
// Scoring is simple and transparent:
//   score = success_rate*100 - failure_penalty(recency) - latency_penalty
// Samples are bounded (ring buffer per provider+task, max 50), TTL 7 days.

import { createCacheStore, type CacheStore } from './cache'

export type RouteSample = {
  providerId: string
  task: string
  ok: boolean
  latencyMs?: number
  errorCategory?: string
  at: string
}

export type RouteScore = {
  providerId: string
  task: string
  samples: number
  successRate: number | null
  avgLatencyMs: number | null
  score: number | null
  lastSuccessAt: string | null
  lastFailureAt: string | null
  lastErrorCategory: string | null
}

const MAX_SAMPLES = 50
const TTL_SECONDS = 7 * 86_400
const NAMESPACE = 'route-intel'

function sampleKey(providerId: string, task: string) {
  return `${providerId}:${task}`
}

export async function recordRouteSample(env: Record<string, unknown>, sample: RouteSample): Promise<void> {
  const cache: CacheStore = createCacheStore(env, NAMESPACE)
  const key = sampleKey(sample.providerId, sample.task)
  const existing = await cache.read<RouteSample[]>(key)
  const samples = [...(existing.value ?? []), sample].slice(-MAX_SAMPLES)
  await cache.write(key, samples, TTL_SECONDS)
  // Self-contained: any recorded sample is discoverable via the index.
  const index = await cache.read<string[]>(`index`)
  const keys = index.value ?? []
  if (!keys.includes(key)) await cache.write(`index`, [...keys, key], TTL_SECONDS)
}

export function scoreRoute(samples: RouteSample[]): RouteScore {
  if (!samples.length) return { providerId: '', task: '', samples: 0, successRate: null, avgLatencyMs: null, score: null, lastSuccessAt: null, lastFailureAt: null, lastErrorCategory: null }
  const ok = samples.filter((sample) => sample.ok)
  const fails = samples.filter((sample) => !sample.ok)
  const successRate = Math.round((ok.length / samples.length) * 100)
  const latencies = samples.map((sample) => sample.latencyMs).filter((ms): ms is number => ms != null)
  const avgLatencyMs = latencies.length ? Math.round(latencies.reduce((sum, ms) => sum + ms, 0) / latencies.length) : null
  // Recency-weighted failure penalty: recent failures hurt more.
  const now = Date.now()
  let penalty = 0
  for (const fail of fails) {
    const ageHours = (now - Date.parse(fail.at)) / 3_600_000
    penalty += ageHours < 1 ? 30 : ageHours < 24 ? 20 : ageHours < 168 ? 10 : 5
  }
  const latencyPenalty = avgLatencyMs != null && avgLatencyMs > 15_000 ? 10 : avgLatencyMs != null && avgLatencyMs > 8_000 ? 5 : 0
  const score = Math.max(0, Math.min(100, Math.round(successRate - penalty - latencyPenalty)))
  const last = samples[samples.length - 1]
  return {
    providerId: last.providerId,
    task: last.task,
    samples: samples.length,
    successRate,
    avgLatencyMs,
    score,
    lastSuccessAt: ok.length ? ok[ok.length - 1].at : null,
    lastFailureAt: fails.length ? fails[fails.length - 1].at : null,
    lastErrorCategory: fails.length ? fails[fails.length - 1].errorCategory ?? null : null,
  }
}

export async function routeScores(env: Record<string, unknown>): Promise<RouteScore[]> {
  // We only read the samples we have stored per known provider+task keys.
  // Without a list endpoint, we read the cache for the providers that have
  // recorded samples by probing a small index — stored under 'index'.
  const cache: CacheStore = createCacheStore(env, NAMESPACE)
  const index = await cache.read<string[]>(`index`)
  const keys = index.value ?? []
  const scores: RouteScore[] = []
  for (const key of keys.slice(-100)) {
    const samples = await cache.read<RouteSample[]>(key)
    if (samples.value?.length) scores.push(scoreRoute(samples.value))
  }
  return scores.sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
}

export async function recordRouteIndex(env: Record<string, unknown>, providerId: string, task: string): Promise<void> {
  const cache: CacheStore = createCacheStore(env, NAMESPACE)
  const key = sampleKey(providerId, task)
  const index = await cache.read<string[]>(`index`)
  const keys = index.value ?? []
  if (!keys.includes(key)) await cache.write(`index`, [...keys, key], TTL_SECONDS)
}
