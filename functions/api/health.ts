import { getContext, json } from '../lib/security'

import { buildRegistry } from '../lib/registry'

type Env = Record<string, string | undefined>
type RequestContext = { request: Request; env: Env }

export const onRequestGet = async ({ request, env }: RequestContext): Promise<Response> => {
  const context = getContext(request, env)
  const registry = buildRegistry(env)
  return json({
    ok: true,
    service: 'aibay-api',
    environment: env.APP_ENV || 'unknown',
    apiVersion: env.PUBLIC_API_VERSION || 'v1',
    providers: {
      ebay: Boolean(env.EBAY_CLIENT_ID && env.EBAY_CLIENT_SECRET),
      ai: Boolean(env.AI_PROVIDER_API_KEY),
      database: Boolean(env.DATABASE_URL),
    },
    registry: { checkedAt: registry.checkedAt, providerCount: registry.providers.length, readyProviderCount: registry.providers.filter((provider) => provider.status === 'ready').length, capabilityCount: registry.capabilities.length, readyCapabilityCount: registry.capabilities.filter((capability) => capability.status === 'ready').length },
    timestamp: registry.checkedAt,
  }, {}, context.requestId)
}
