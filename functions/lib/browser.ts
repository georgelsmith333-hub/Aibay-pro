// Cloudflare Browser Run adapter (migration step 5, browser slice).
//
// Uses the documented Browser Run REST API (quick actions):
//   POST /accounts/{account_id}/browser-rendering/content   -> rendered HTML
//   POST /accounts/{account_id}/browser-rendering/markdown  -> markdown
//   POST /accounts/{account_id}/browser-rendering/screenshot -> PNG
//   POST /accounts/{account_id}/browser-rendering/scrape    -> scraped elements
//   POST /accounts/{account_id}/browser-rendering/json      -> AI structured data
//   POST /accounts/{account_id}/browser-rendering/links     -> links
//
// Truth rules:
// - The adapter is only 'ready' after a real canary run has succeeded
//   (BROWSER_RUN_CANARY server secret set by the deployment pipeline).
//   Until then it reports not_configured — never a fake browser.
// - Browser resources are quota-scarce (free tier: 10 min/day, 3 concurrent,
//   5 crawl jobs/day), so the router only selects this route when the task
//   requires it and no cheaper route is healthy.
// - No CAPTCHA, login, paywall, or anti-bot bypass. Ever.

import { classifyFailure } from './orchestrator'
import type { TaskKind } from './orchestrator'
import type { RegistryStatus } from './registry'
import type { AdapterHealth, ClassifiedFailure, NormalizedObservation, ProviderAdapter, ProviderContext, RawProviderResult } from './adapter'
import { ADAPTER_CONTRACT_VERSION } from './adapter'

const BROWSER_VERSION = '0.2.0'
const BROWSER_LIMITS = { timeoutMs: 25_000, maxRedirects: 0, maxBytes: 0, maxRetryAttempts: 1 }

export type BrowserCanaryState = {
  status: RegistryStatus
  configured: boolean
  canaryVerified: boolean
  canaryDate: string | null
  detail: string
}

export function browserRunStatus(env: Record<string, unknown>): BrowserCanaryState {
  const token = typeof env.CLOUDFLARE_API_TOKEN === 'string' && env.CLOUDFLARE_API_TOKEN.trim().length > 0
  const account = typeof env.CLOUDFLARE_ACCOUNT_ID === 'string' && env.CLOUDFLARE_ACCOUNT_ID.trim().length > 0
  const canary = typeof env.BROWSER_RUN_CANARY === 'string' ? env.BROWSER_RUN_CANARY.trim() : ''
  if (!token || !account) return { status: 'not_configured', configured: false, canaryVerified: false, canaryDate: null, detail: 'Requires CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID server-side secrets. No browser capability is claimed without them.' }
  if (!canary) return { status: 'not_configured', configured: true, canaryVerified: false, canaryDate: null, detail: 'Credentials are set but no Browser Run canary has passed. The deployment pipeline runs a real canary before this route becomes ready.' }
  return { status: 'ready', configured: true, canaryVerified: true, canaryDate: canary, detail: `Browser Run canary verified (${canary}). Only permitted public quick actions are used; quota is treated as scarce.` }
}

type BrowserActionResult = { kind: string; body: string; url: string; contentType: string }

async function quickAction(env: Record<string, unknown>, action: 'content' | 'markdown', url: string, signal: AbortSignal): Promise<BrowserActionResult> {
  const account = String(env.CLOUDFLARE_ACCOUNT_ID)
  const token = String(env.CLOUDFLARE_API_TOKEN)
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/browser-rendering/${action}`
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ url }),
    signal,
  })
  if (response.status === 401 || response.status === 403) throw Object.assign(new Error(`Browser Run rejected credentials (HTTP ${response.status}). The token may lack Browser Rendering - Edit permission.`), { code: 'invalid_credentials', status: response.status })
  if (response.status === 429) throw Object.assign(new Error('Browser Run is rate-limited (HTTP 429). AiBay does not evade rate limits.'), { code: 'rate_limited', status: 429 })
  if (!response.ok) throw Object.assign(new Error(`Browser Run returned HTTP ${response.status}.`), { code: 'transient', status: response.status })
  const body = await response.text()
  const contentType = response.headers.get('content-type') ?? 'text/plain'
  return { kind: action, body, url, contentType }
}

function titleFromHtml(html: string): string {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  if (!match?.[1]) return ''
  return match[1].replace(/\s+/g, ' ').trim()
}

function descriptionFromHtml(html: string): string {
  const meta = html.match(/<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([^"']+)["']/i)
  return meta?.[1] ? meta[1].replace(/\s+/g, ' ').trim() : ''
}

export const cloudflareBrowserRunAdapter: ProviderAdapter = {
  metadata: {
    id: 'optional.cloudflare.browser_run',
    label: 'Cloudflare Browser Run',
    version: BROWSER_VERSION,
    contractVersion: ADAPTER_CONTRACT_VERSION,
    category: 'browser',
    costClass: 'usage-based',
    expectedLatency: 'high',
    auth: 'server-secret',
    configKeys: ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID', 'BROWSER_RUN_CANARY'],
    capabilityIds: ['web.scrape.browser', 'web.extract.structured', 'document.pdf', 'image.extract'],
    supportedTasks: ['public_scrape'],
    limits: BROWSER_LIMITS,
    fallbackPriority: ['local.evidence', 'manual.evidence'],
    description: 'Documented Cloudflare Browser Run quick actions for permitted public pages; canary-verified before use.',
    policy: 'Public permitted workflows only; no CAPTCHA, login, paywall, or anti-bot bypass. Browser quota is treated as scarce.',
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
    return this.staticHealth(env)
  },

  staticHealth(env: Record<string, unknown>): AdapterHealth {
    const state = browserRunStatus(env)
    return { status: state.status, checkedAt: new Date().toISOString(), version: BROWSER_VERSION, configured: state.configured, detail: state.detail }
  },

  estimate() {
    return { providerId: this.metadata.id, task: 'public_scrape', capabilityId: 'web.scrape.browser', latencyClass: 'high', costClass: 'usage-based', confidence: 0, reason: 'Browser routes are quota-scarce and only selected when no cheaper route satisfies the task.' }
  },

  async execute(ctx: ProviderContext): Promise<RawProviderResult> {
    if (!ctx.sourceUrl) throw new Error('A source URL is required for this task.')
    const startedAt = new Date().toISOString()
    const action: 'content' | 'markdown' = ctx.capabilityId === 'web.scrape.browser' ? 'content' : 'content'
    const result = await quickAction(ctx.env, action, ctx.sourceUrl, ctx.signal)
    return { raw: result, meta: { providerId: this.metadata.id, providerVersion: this.metadata.version, routeId: ctx.routeId, method: `cloudflare-browser-run-${action}-v1`, startedAt, endedAt: new Date().toISOString() } }
  },

  normalize(raw: unknown, ctx: ProviderContext): NormalizedObservation {
    const result = raw as BrowserActionResult
    const html = result.kind === 'markdown' ? '' : result.body
    const title = html ? titleFromHtml(html) : ''
    const description = html ? descriptionFromHtml(html) : ''
    const fields = []
    if (title) fields.push({ label: 'Title', value: title, state: 'verified' as const, method: 'cloudflare-browser-run-content-v1', sourcePath: 'browser:title', confidence: 85 })
    if (description) fields.push({ label: 'Description', value: description, state: 'verified' as const, method: 'cloudflare-browser-run-content-v1', sourcePath: 'browser:meta', confidence: 80 })
    return {
      task: ctx.task,
      capabilityId: ctx.capabilityId,
      providerId: this.metadata.id,
      providerVersion: this.metadata.version,
      routeId: ctx.routeId,
      method: `cloudflare-browser-run-${result.kind}-v1`,
      retrievedAt: new Date().toISOString(),
      sourceUrl: result.url,
      canonicalUrl: result.url,
      sourceHost: new URL(result.url).hostname.replace(/^www\./, ''),
      fields,
      validation: { valid: fields.length > 0, missing: fields.length ? [] : ['Title'], warnings: fields.length ? [] : ['The browser run returned no usable title/metadata.'] },
      sourceHealth: fields.length ? 'healthy' : 'incomplete',
    }
  },

  classifyError(error: unknown, status?: number): ClassifiedFailure {
    const code = (error as { code?: string } | null)?.code
    if (code === 'invalid_credentials') return { category: 'invalid_credentials', retryable: false, message: error instanceof Error ? error.message : 'Browser Run credentials rejected.' }
    if (code === 'rate_limited') return { category: 'rate_limited', retryable: true, message: error instanceof Error ? error.message : 'Browser Run rate limit.' }
    if (code === 'transient') return { category: status && status >= 500 ? 'transient' : 'transient', retryable: true, message: error instanceof Error ? error.message : 'Browser Run transient failure.' }
    return classifyFailure(error, status)
  },
}
