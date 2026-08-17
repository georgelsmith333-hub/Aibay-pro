import { createCacheStore, type CacheHealth } from '../../lib/cache'
import { extractPublicProduct, extractionCacheKey, incompleteExtractionFromError } from '../../lib/extraction'
import { assertSafePublicUrl, getContext, json, normalizeInputString } from '../../lib/security'

type Env = Record<string, string | undefined>
type RequestContext = { request: Request; env: Env }

const CACHE_NAMESPACE = 'public-extraction'
const CACHE_TTL_SECONDS = 300

function cacheMeta(health: CacheHealth, hit: boolean) {
  return { mode: health.mode, backend: health.backend, durable: health.durable, configured: health.configured, binding: health.binding, note: health.note, hit, freshnessSeconds: CACHE_TTL_SECONDS }
}

type ExtractBody = { sourceUrl?: unknown; consent?: unknown }

export const onRequestPost = async ({ request, env }: RequestContext): Promise<Response> => {
  const context = getContext(request, env)
  let body: ExtractBody
  try { body = await request.json() as ExtractBody } catch { return json({ error: 'invalid_json' }, { status: 400 }, context.requestId) }
  const sourceUrl = normalizeInputString(body.sourceUrl)
  if (!sourceUrl) return json({ error: 'source_url_required', message: 'A product URL is required.' }, { status: 400 }, context.requestId)
  if (body.consent !== true) return json({ error: 'rights_confirmation_required', message: 'Confirm rights to use the supplied source information.' }, { status: 400 }, context.requestId)

  const cache = createCacheStore(env, CACHE_NAMESPACE)
  try {
    const parsedSource = assertSafePublicUrl(sourceUrl).toString()
    const cacheKey = extractionCacheKey(parsedSource)
    const cached = await cache.read<Record<string, unknown>>(cacheKey)
    if (cached.hit && cached.value) {
      return json({ ...cached.value, cache: cacheMeta(cache.health, true) }, {}, context.requestId)
    }
    const extraction = await extractPublicProduct(parsedSource)
    if (extraction.sourceHealth === 'blocked') {
      return json({
        status: 'blocked',
        extraction,
        alternatives: ['Use a public manufacturer source.', 'Upload a document or image you are entitled to use.', 'Enter fields manually with provenance.', 'Connect an approved source API.'],
      }, { status: 409 }, context.requestId)
    }
    const payload = { status: extraction.sourceHealth, extraction, aiRepairUsed: false, note: 'Only public structured/visible metadata was parsed. No unsupported claims were inferred.', cache: cacheMeta(cache.health, false) }
    await cache.write(cacheKey, payload, CACHE_TTL_SECONDS)
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
