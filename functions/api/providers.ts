import { buildRegistry } from '../lib/registry'

type PagesContext = { env: Record<string, unknown> }

export const onRequestGet = async ({ env }: PagesContext): Promise<Response> => {
  const registry = buildRegistry(env)
  return new Response(JSON.stringify({ status: 'ok', checkedAt: registry.checkedAt, providers: registry.providers }), {
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=60, s-maxage=60' },
  })
}
