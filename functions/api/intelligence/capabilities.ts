import { buildCapabilityGraph } from '../../lib/intelligence'
import { buildRegistry } from '../../lib/registry'
import { getContext, json } from '../../lib/security'

type RequestContext = { request: Request; env: Record<string, unknown> }

export const onRequestGet = async ({ request, env }: RequestContext): Promise<Response> => {
  const context = getContext(request, env)
  const registry = buildRegistry(env)
  const capabilities = buildCapabilityGraph(env, registry.capabilities.map((capability) => ({ id: capability.id, status: capability.status, providerIds: capability.providerIds })))
  return json({
    status: 'ok',
    checkedAt: new Date().toISOString(),
    capabilities,
    categories: [...new Set(capabilities.map((capability) => capability.category))],
    note: 'Capability graph reflects configured state truthfully. UNCONFIGURED capabilities never pretend to be available.',
  }, {}, context.requestId)
}
