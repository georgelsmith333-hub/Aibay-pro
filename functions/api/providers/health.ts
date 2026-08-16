import { buildRegistry } from '../../lib/registry'

type PagesContext = { env: Record<string, unknown> }

export const onRequestGet = async ({ env }: PagesContext): Promise<Response> => {
  const registry = buildRegistry(env)
  return new Response(JSON.stringify({
    status: 'ok',
    checkedAt: registry.checkedAt,
    providers: registry.providers.map((provider) => ({
      id: provider.id,
      label: provider.label,
      status: provider.status,
      capabilities: provider.capabilities,
      expectedLatency: provider.expectedLatency,
      costClass: provider.costClass,
      auth: provider.auth,
      configured: provider.status === 'ready',
      lastVerified: provider.lastVerified,
      details: provider.details,
    })),
  }), { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=30, s-maxage=30' } })
}
