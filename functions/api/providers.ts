import { aiRouteStatuses } from '../lib/ai'
import { adapterRegistrySnapshot } from '../lib/adapters'
import { buildRegistry } from '../lib/registry'

type PagesContext = { env: Record<string, unknown> }

export const onRequestGet = async ({ env }: PagesContext): Promise<Response> => {
  const registry = buildRegistry(env)
  return new Response(JSON.stringify({
    status: 'ok',
    checkedAt: registry.checkedAt,
    providers: registry.providers,
    adapters: adapterRegistrySnapshot(env),
    aiRoutes: aiRouteStatuses(env),
    note: 'AI route metadata lists configured endpoints only (names, models, hosts). Credential values are never returned.',
  }), {
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=60, s-maxage=60' },
  })
}
