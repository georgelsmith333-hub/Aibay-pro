// Free multi-route AI adapter (migration step 5, AI routing slice).
//
// AiBay routes AI title-ranking requests across MULTIPLE user-owned,
// OpenAI-compatible endpoints and fails over between them. The routing layer
// itself is free and open; every endpoint is a documented provider the
// operator has configured with their own credential (free tiers included:
// Groq, Google Gemini free tier, OpenRouter :free models, Cloudflare Workers
// AI, local Ollama, etc.).
//
// Compliance rules (same boundary as the rest of the platform):
// - Routes are read only from server-side environment/secrets, never from the
//   client. Credential values never appear in responses or logs.
// - A route is only used when it is configured AND its documented capability
//   matches the task. There is no discovery of undocumented endpoints.
// - If every route fails or none is configured, the deterministic package is
//   returned unchanged — never a fabricated AI result.
// - The AI may only reorder/trim the supplied candidate titles; it must not
//   invent facts, keywords, or claims.

import { type ListingInput, type ListingPackage, validateTitle } from './listing'

export type AiRoute = {
  id: string
  label: string
  baseUrl: string
  apiKey: string
  model: string
  freeTier: boolean
  costClass: 'free' | 'byok' | 'usage-based'
}

export type AiRouteStatus = {
  id: string
  label: string
  configured: boolean
  freeTier: boolean
  costClass: AiRoute['costClass'] | 'unknown'
  model: string | null
  host: string | null
  reason: string
}

export type AiAttempt = {
  routeId: string
  label: string
  outcome: 'success' | 'invalid_credentials' | 'rate_limited' | 'transient' | 'invalid_response' | 'blocked'
  errorCategory?: string
}

export type AiRoutingReport = {
  enabled: boolean
  routes: AiRouteStatus[]
  attempts: AiAttempt[]
  used: string | null
  note: string
}

type RankedTitleResponse = { titleCandidates?: unknown; strategyNote?: unknown }

const ROUTE_TIMEOUT_MS = 12_000
const MAX_ROUTES = 5

function configured(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function safeHost(baseUrl: string): string | null {
  try {
    const url = new URL(baseUrl)
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && url.hostname === '127.0.0.1')) return null
    return url.hostname
  } catch {
    return null
  }
}

/** Parses the multi-route configuration from the environment (AI_ROUTES JSON), plus legacy single-provider vars. */
export function parseAiRoutes(env: Record<string, unknown>): AiRoute[] {
  const routes: AiRoute[] = []
  const rawRoutes = typeof env.AI_ROUTES === 'string' ? env.AI_ROUTES : ''
  if (rawRoutes) {
    try {
      const parsed = JSON.parse(rawRoutes) as Array<Record<string, unknown>>
      for (const entry of Array.isArray(parsed) ? parsed.slice(0, MAX_ROUTES) : []) {
        const baseUrl = configured(entry.baseUrl)
        const apiKey = configured(entry.apiKey)
        const model = configured(entry.model)
        const id = configured(entry.id) || `ai_route_${routes.length + 1}`
        if (!baseUrl || !apiKey || !model) continue
        if (!safeHost(baseUrl)) continue
        routes.push({
          id,
          label: configured(entry.label) || id,
          baseUrl: baseUrl.replace(/\/+$/, ''),
          apiKey,
          model,
          freeTier: entry.freeTier === true,
          costClass: entry.costClass === 'free' || entry.costClass === 'byok' || entry.costClass === 'usage-based' ? entry.costClass : 'byok',
        })
      }
    } catch {
      // Malformed AI_ROUTES is reported as unconfigured; never crashes requests.
    }
  }
  const legacyKey = configured(env.AI_PROVIDER_API_KEY)
  const legacyBase = configured(env.AI_PROVIDER_BASE_URL)
  const legacyModel = configured(env.AI_PROVIDER_MODEL)
  if (legacyKey && legacyBase && legacyModel && safeHost(legacyBase)) {
    routes.push({ id: 'ai_route_legacy', label: configured(env.AI_PROVIDER_LABEL) || 'Legacy AI provider', baseUrl: legacyBase.replace(/\/+$/, ''), apiKey: legacyKey, model: legacyModel, freeTier: false, costClass: 'byok' })
  }
  // Cloudflare Workers AI auto-route: real free-tier models via the user's own
  // Cloudflare account (OpenAI-compatible endpoint). No client credential.
  const cfToken = configured(env.CLOUDFLARE_API_TOKEN)
  const cfAccount = configured(env.CLOUDFLARE_ACCOUNT_ID)
  if (cfToken && cfAccount) {
    routes.push({
      id: 'cloudflare.workers-ai',
      label: 'Cloudflare Workers AI (auto)',
      baseUrl: `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(cfAccount)}/ai/v1`,
      apiKey: cfToken,
      model: configured(env.WORKERS_AI_MODEL) || '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
      freeTier: true,
      costClass: 'free',
    })
  }
  return routes.slice(0, MAX_ROUTES)
}

/** Status metadata for every configured route — names, models, hosts only, never keys. */
export function aiRouteStatuses(env: Record<string, unknown>): AiRouteStatus[] {
  const routes = parseAiRoutes(env)
  if (!routes.length) return [{ id: 'ai_routing', label: 'AI routing', configured: false, freeTier: false, costClass: 'unknown', model: null, host: null, reason: 'No AI route is configured. Configure server-side AI_ROUTES (OpenAI-compatible endpoints, free tiers included) or the legacy AI_PROVIDER_* secrets.' }]
  return routes.map((route) => ({ id: route.id, label: route.label, configured: true, freeTier: route.freeTier, costClass: route.costClass, model: route.model, host: safeHost(route.baseUrl), reason: 'Configured server-side. Requests are bounded and route-specific.' }))
}

function extractJson(content: unknown): RankedTitleResponse | null {
  if (typeof content !== 'string') return null
  try { return JSON.parse(content) as RankedTitleResponse } catch { return null }
}

async function callRoute(route: AiRoute, input: ListingInput, knownCandidates: string[]): Promise<RankedTitleResponse> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), ROUTE_TIMEOUT_MS)
  try {
    const response = await fetch(`${route.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${route.apiKey}`, 'content-type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: route.model,
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'You are a conservative eBay title editor. You may only rank or remove the supplied candidate titles. You must not write a new title, add claims, add keywords, or change product facts. Return JSON with titleCandidates as an ordered subset of the supplied exact strings and strategyNote as one short readability note.' },
          { role: 'user', content: JSON.stringify({ productTitle: input.productTitle, selectedVariant: input.selectedVariant?.label || null, candidates: knownCandidates }) },
        ],
      }),
    })
    if (response.status === 401 || response.status === 403) throw Object.assign(new Error(`Route ${route.id} rejected credentials (HTTP ${response.status}).`), { code: 'invalid_credentials' })
    if (response.status === 429) throw Object.assign(new Error(`Route ${route.id} is rate-limited (HTTP 429). AiBay does not evade rate limits.`), { code: 'rate_limited' })
    if (!response.ok) throw Object.assign(new Error(`Route ${route.id} returned HTTP ${response.status}.`), { code: 'transient' })
    const data = await response.json<{ choices?: Array<{ message?: { content?: unknown } }> }>()
    const ranked = extractJson(data.choices?.[0]?.message?.content)
    if (!ranked) throw Object.assign(new Error(`Route ${route.id} returned an unusable response.`), { code: 'invalid_response' })
    return ranked
  } finally {
    clearTimeout(timeout)
  }
}

function outcomeFor(error: unknown): AiAttempt['outcome'] {
  const code = (error as { code?: string } | null)?.code
  if (code === 'invalid_credentials') return 'invalid_credentials'
  if (code === 'rate_limited') return 'rate_limited'
  if (code === 'invalid_response') return 'invalid_response'
  if (error instanceof Error && error.name === 'AbortError') return 'transient'
  return 'transient'
}

export type AiRankingResult = {
  listingPackage: ListingPackage
  aiRouting: AiRoutingReport
}

/**
 * Ranks the deterministic title candidates using the first healthy configured
 * route, failing over to the next route on bounded errors. Returns the
 * deterministic package unchanged (with an honest routing report) when no
 * route succeeds.
 */
export async function rankListingTitlesWithAi(input: ListingInput, deterministicPackage: ListingPackage, env: Record<string, unknown>): Promise<AiRankingResult> {
  const routes = parseAiRoutes(env)
  if (!routes.length) {
    return { listingPackage: deterministicPackage, aiRouting: { enabled: false, routes: aiRouteStatuses(env), attempts: [], used: null, note: 'No AI route is configured. The deterministic draft engine produced this package without AI.' } }
  }

  const knownCandidates = deterministicPackage.titleCandidates
  const attempts: AiAttempt[] = []
  let used: string | null = null

  for (const route of routes) {
    try {
      const ranked = await callRoute(route, input, knownCandidates)
      const requested = Array.isArray(ranked?.titleCandidates) ? ranked.titleCandidates.filter((value): value is string => typeof value === 'string') : []
      const approved = requested.filter((title) => knownCandidates.includes(title) && validateTitle(title).passed)
      if (!approved.length) {
        attempts.push({ routeId: route.id, label: route.label, outcome: 'invalid_response', errorCategory: 'No supplied candidate was preserved by the model.' })
        continue
      }
      attempts.push({ routeId: route.id, label: route.label, outcome: 'success' })
      used = route.id
      const rankedPackage: ListingPackage = {
        ...deterministicPackage,
        source: 'ai_structured',
        titleCandidates: [...approved, ...knownCandidates.filter((candidate) => !approved.includes(candidate))],
        strategy: typeof ranked?.strategyNote === 'string' && ranked.strategyNote.length <= 240
          ? [ranked.strategyNote, ...deterministicPackage.strategy]
          : deterministicPackage.strategy,
      }
      return { listingPackage: rankedPackage, aiRouting: { enabled: true, routes: aiRouteStatuses(env), attempts, used, note: `AI title ranking used route ${route.label} (${route.model}). Only supplied candidates were reordered; no facts were added.` } }
    } catch (error) {
      attempts.push({ routeId: route.id, label: route.label, outcome: outcomeFor(error), errorCategory: error instanceof Error ? error.message : 'Unknown route error' })
      // invalid credentials / policy blocks are not retried on the same route; fall through to the next.
    }
  }

  return {
    listingPackage: deterministicPackage,
    aiRouting: {
      enabled: true,
      routes: aiRouteStatuses(env),
      attempts,
      used: null,
      note: `All ${attempts.length} configured AI route(s) failed or returned unusable results (${attempts.map((attempt) => attempt.outcome).join(', ')}). The deterministic draft engine produced this package without AI.`,
    },
  }
}
