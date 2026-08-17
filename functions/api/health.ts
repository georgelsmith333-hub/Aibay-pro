import { getContext, json } from '../lib/security'

import { buildRegistry } from '../lib/registry'
import { bindingReport } from '../lib/storage'

type Env = Record<string, unknown>
type RequestContext = { request: Request; env: Env }

export const onRequestGet = async ({ request, env }: RequestContext): Promise<Response> => {
  const context = getContext(request, env)
  const registry = buildRegistry(env)
  const bindings = bindingReport(env)
  return json({
    ok: true,
    service: 'aibay-api',
    environment: typeof env.APP_ENV === 'string' ? env.APP_ENV : 'unknown',
    apiVersion: typeof env.PUBLIC_API_VERSION === 'string' ? env.PUBLIC_API_VERSION : 'v1',
    providers: {
      ebay: Boolean(env.EBAY_CLIENT_ID && env.EBAY_CLIENT_SECRET),
      ai: Boolean(env.AI_PROVIDER_API_KEY),
      database: bindings.d1 === 'configured',
    },
    registry: { checkedAt: registry.checkedAt, providerCount: registry.providers.length, readyProviderCount: registry.providers.filter((provider) => provider.status === 'ready').length, capabilityCount: registry.capabilities.length, readyCapabilityCount: registry.capabilities.filter((capability) => capability.status === 'ready').length },
    timestamp: registry.checkedAt,
  }, {}, context.requestId)
}
