import { getContext, json } from '../lib/security'

type Env = Record<string, string | undefined>
type RequestContext = { request: Request; env: Env }

export const onRequestGet = async ({ request, env }: RequestContext): Promise<Response> => {
  const context = getContext(request, env)
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
    timestamp: new Date().toISOString(),
  }, {}, context.requestId)
}
