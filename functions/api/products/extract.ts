import { extractPublicProduct, incompleteExtractionFromError } from '../../lib/extraction'
import { assertSafePublicUrl, getContext, json, normalizeInputString } from '../../lib/security'

type Env = Record<string, string | undefined>
type RequestContext = { request: Request; env: Env }

function cacheKey(sourceUrl: string) {
  return new Request(`https://cache.aibay.invalid/v1/public-extraction?source=${encodeURIComponent(sourceUrl)}`)
}

function edgeCache(): Cache | undefined {
  return (globalThis.caches as unknown as { default?: Cache } | undefined)?.default
}

async function readCached(sourceUrl: string) {
  try {
    const cache = edgeCache()
    const response = cache ? await cache.match(cacheKey(sourceUrl)) : undefined
    return response ? await response.json() as Record<string, unknown> : null
  } catch { return null }
}

async function writeCached(sourceUrl: string, payload: Record<string, unknown>) {
  try {
    const cache = edgeCache()
    if (!cache) return
    await cache.put(cacheKey(sourceUrl), new Response(JSON.stringify(payload), { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=300' } }))
  } catch { /* Cache is an optimization; extraction remains authoritative. */ }
}

type ExtractBody = { sourceUrl?: unknown; consent?: unknown }

export const onRequestPost = async ({ request, env }: RequestContext): Promise<Response> => {
  const context = getContext(request, env)
  let body: ExtractBody
  try { body = await request.json() as ExtractBody } catch { return json({ error: 'invalid_json' }, { status: 400 }, context.requestId) }
  const sourceUrl = normalizeInputString(body.sourceUrl)
  if (!sourceUrl) return json({ error: 'source_url_required', message: 'A product URL is required.' }, { status: 400 }, context.requestId)
  if (body.consent !== true) return json({ error: 'rights_confirmation_required', message: 'Confirm rights to use the supplied source information.' }, { status: 400 }, context.requestId)

  try {
    const parsedSource = assertSafePublicUrl(sourceUrl).toString()
    const cached = await readCached(parsedSource)
    if (cached) return json({ ...cached, cache: { hit: true, source: 'Cloudflare Cache API', freshnessSeconds: 300 } }, {}, context.requestId)
    const extraction = await extractPublicProduct(parsedSource)
    if (extraction.sourceHealth === 'blocked') {
      return json({
        status: 'blocked',
        extraction,
        alternatives: ['Use a public manufacturer source.', 'Upload a document or image you are entitled to use.', 'Enter fields manually with provenance.', 'Connect an approved source API.'],
      }, { status: 409 }, context.requestId)
    }
    const payload = { status: extraction.sourceHealth, extraction, aiRepairUsed: false, note: 'Only public structured/visible metadata was parsed. No unsupported claims were inferred.', cache: { hit: false, source: 'Cloudflare Cache API', freshnessSeconds: 300 } }
    await writeCached(parsedSource, payload)
    return json(payload, { status: 200 }, context.requestId)
  } catch (error) {
    try {
      const extraction = incompleteExtractionFromError(sourceUrl, error instanceof Error ? error.message : 'Unable to extract a public product record.')
      return json({ status: extraction.sourceHealth, extraction, alternatives: ['Try the clean public URL.', 'Use a public manufacturer source.', 'Continue with user-provided evidence.'], note: 'No unrelated product or fixture was substituted.' }, { status: 200 }, context.requestId)
    } catch {
      return json({ error: 'product_extraction_failed', message: error instanceof Error ? error.message : 'Unable to extract a public product record.' }, { status: 422 }, context.requestId)
    }
  }
}
