import { extractPublicProduct } from '../../lib/extraction'
import { getContext, json, normalizeInputString } from '../../lib/security'

type Env = Record<string, string | undefined>
type RequestContext = { request: Request; env: Env }
type ExtractBody = { sourceUrl?: unknown; consent?: unknown }

export const onRequestPost = async ({ request, env }: RequestContext): Promise<Response> => {
  const context = getContext(request, env)
  let body: ExtractBody
  try { body = await request.json() as ExtractBody } catch { return json({ error: 'invalid_json' }, { status: 400 }, context.requestId) }
  const sourceUrl = normalizeInputString(body.sourceUrl)
  if (!sourceUrl) return json({ error: 'source_url_required', message: 'A product URL is required.' }, { status: 400 }, context.requestId)
  if (body.consent !== true) return json({ error: 'rights_confirmation_required', message: 'Confirm rights to use the supplied source information.' }, { status: 400 }, context.requestId)

  try {
    const extraction = await extractPublicProduct(sourceUrl)
    if (extraction.sourceHealth === 'blocked') {
      return json({
        status: 'blocked',
        extraction,
        alternatives: ['Use a public manufacturer source.', 'Upload a document or image you are entitled to use.', 'Enter fields manually with provenance.', 'Connect an approved source API.'],
      }, { status: 409 }, context.requestId)
    }
    return json({ status: extraction.sourceHealth, extraction, aiRepairUsed: false, note: 'Only public structured/visible metadata was parsed. No unsupported claims were inferred.' }, { status: 200 }, context.requestId)
  } catch (error) {
    return json({ error: 'product_extraction_failed', message: error instanceof Error ? error.message : 'Unable to extract a public product record.' }, { status: 422 }, context.requestId)
  }
}
