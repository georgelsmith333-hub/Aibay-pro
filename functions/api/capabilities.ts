import { buildRegistry, type RegistryStatus } from '../lib/registry'

type ProviderCapability = {
  id: string
  label: string
  category: 'local' | 'public-gradio'
  status: RegistryStatus
  capabilities: string[]
  details: string
  provenance: string
  checkedAt: string
}

type PagesContext = { request: Request; env: Record<string, unknown> }

const MAX_PUBLIC_SPACES = 3
const SPACE_ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,95}\/[A-Za-z0-9][A-Za-z0-9_.-]{0,95}$/

function json(payload: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers)
  headers.set('content-type', 'application/json; charset=utf-8')
  headers.set('cache-control', 'public, max-age=60, s-maxage=60')
  return new Response(JSON.stringify(payload), { ...init, headers })
}

function configuredSpaces(env: Record<string, unknown>): string[] {
  const value = typeof env.PUBLIC_GRADIO_SPACES === 'string' ? env.PUBLIC_GRADIO_SPACES : ''
  return [...new Set(value.split(',').map((item) => item.trim()).filter((item) => SPACE_ID.test(item)))].slice(0, MAX_PUBLIC_SPACES)
}

async function inspectPublicGradioSpace(spaceId: string): Promise<ProviderCapability> {
  const checkedAt = new Date().toISOString()
  const [owner, name] = spaceId.split('/')
  const url = `https://huggingface.co/api/spaces/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`
  try {
    const response = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(4_000) })
    if (response.status === 429) return { id: `gradio:${spaceId}`, label: spaceId, category: 'public-gradio', status: 'rate_limited', capabilities: [], details: 'Rate-limited by the provider. AiBay will not retry through alternate identities or routes.', provenance: 'Public Hugging Face Space metadata', checkedAt }
    if (!response.ok) return { id: `gradio:${spaceId}`, label: spaceId, category: 'public-gradio', status: 'unavailable', capabilities: [], details: `Provider metadata returned HTTP ${response.status}.`, provenance: 'Public Hugging Face Space metadata', checkedAt }
    const data = await response.json() as { runtime?: { stage?: string }; cardData?: { sdk?: string }; private?: boolean }
    if (data.private || data.cardData?.sdk !== 'gradio') return { id: `gradio:${spaceId}`, label: spaceId, category: 'public-gradio', status: 'unsupported', capabilities: [], details: 'This route is not an approved public Gradio Space.', provenance: 'Public Hugging Face Space metadata', checkedAt }
    const stage = data.runtime?.stage?.toUpperCase() || 'UNKNOWN'
    const status: RegistryStatus = stage === 'RUNNING' ? 'ready' : stage === 'SLEEPING' ? 'degraded' : stage === 'BUILDING' ? 'degraded' : 'unavailable'
    const details = status === 'ready' ? 'Public metadata indicates that the Space is running. Its documented API schema must still match the requested task before use.' : `Public metadata reports ${stage.toLowerCase()}. No inference request was sent.`
    return { id: `gradio:${spaceId}`, label: spaceId, category: 'public-gradio', status, capabilities: status === 'ready' ? ['schema-discovery'] : [], details, provenance: 'Public Hugging Face Space metadata', checkedAt }
  } catch {
    return { id: `gradio:${spaceId}`, label: spaceId, category: 'public-gradio', status: 'unavailable', capabilities: [], details: 'Provider metadata did not respond within the bounded health-check window.', provenance: 'Public Hugging Face Space metadata', checkedAt }
  }
}

export const onRequestGet = async ({ env }: PagesContext): Promise<Response> => {
  const registry = buildRegistry(env)
  const local = registry.providers.find((provider) => provider.id === 'local.evidence')
  const checkedAt = registry.checkedAt
  const publicProviders = await Promise.all(configuredSpaces(env).map(inspectPublicGradioSpace))
  return json({
    status: 'ok',
    checkedAt,
    recommendation: { id: 'local.evidence', label: local?.label || 'Local evidence engine', reason: 'Local evidence work is available immediately and is the only route selected automatically.' },
    providers: [
      { id: 'local-evidence-engine', label: local?.label || 'Local evidence engine', category: 'local', status: 'ready', capabilities: local?.capabilities || [], details: local?.details || '', provenance: 'AiBay local runtime', checkedAt },
      ...publicProviders,
    ],
    registry,
    policy: { automaticInference: false, externalRequests: 'metadata-only-unless-configured', rateLimitBehavior: 'respect-provider-response', maxConfiguredPublicSpaces: MAX_PUBLIC_SPACES, credentials: 'server-only' },
  })
}
