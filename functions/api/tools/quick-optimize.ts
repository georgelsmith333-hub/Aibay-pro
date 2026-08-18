// One-click optimize from a direct link: extract -> generate listing package.
// Bounded: extraction is exact-source only; no fabricated data.

import { extractPublicProduct } from '../../lib/extraction'
import { generateListingPackage } from '../../lib/tools'
import { assertSafePublicUrl, getContext, json, normalizeInputString } from '../../lib/security'

type RequestContext = { request: Request; env: Record<string, unknown> }

export const onRequestPost = async ({ request, env }: RequestContext): Promise<Response> => {
  const context = getContext(request, env)
  let body: { sourceUrl?: unknown; consent?: unknown; supplierCost?: unknown }
  try { body = await request.json() as typeof body } catch { return json({ error: 'invalid_json' }, { status: 400 }, context.requestId) }
  const sourceUrl = normalizeInputString(body.sourceUrl, 2000)
  if (!sourceUrl) return json({ error: 'source_url_required', message: 'A product URL is required.' }, { status: 400 }, context.requestId)
  if (body.consent !== true) return json({ error: 'rights_confirmation_required', message: 'Confirm that you are permitted to use the source information and assets.' }, { status: 400 }, context.requestId)

  let parsed: URL
  try { parsed = assertSafePublicUrl(sourceUrl) } catch (error) {
    return json({ error: 'unsafe_source_url', message: error instanceof Error ? error.message : 'The source URL is not accepted.' }, { status: 422 }, context.requestId)
  }

  const extraction = await extractPublicProduct(parsed.toString())
  if (extraction.sourceHealth === 'blocked') {
    return json({ status: 'blocked', extraction, alternatives: ['Use a public manufacturer source.', 'Enter product facts manually with provenance.'], note: 'The exact source is access-controlled. AiBay does not bypass it; no unrelated product was substituted.' }, { status: 409 }, context.requestId)
  }
  const title = extraction.title || extraction.fields.find((field) => field.label === 'Title')?.value || ''
  if (!title) return json({ status: 'incomplete', extraction, note: 'No title could be recovered; add product facts manually to optimize.' }, { status: 200 }, context.requestId)

  const supplierCost = typeof body.supplierCost === 'number' && Number.isFinite(body.supplierCost) ? body.supplierCost : undefined
  const result = generateListingPackage({
    productTitle: title,
    description: extraction.description || undefined,
    brand: extraction.fields.find((field) => field.label === 'Brand')?.value || undefined,
    model: extraction.fields.find((field) => field.label === 'Model')?.value || undefined,
    gtin: extraction.fields.find((field) => field.label === 'GTIN')?.value || undefined,
    supplierCost,
    evidence: extraction.fields.map((field) => ({ label: field.label, value: field.value, state: field.state, source: extraction.sourceUrl })),
    market: [],
  })
  return json({ status: 'review_ready', extraction, ...result, note: 'One-click optimize produced an evidence-grounded draft from the exact source. AI ranking may reorder supplied candidates only when configured; nothing is auto-published.' }, { status: 201 }, context.requestId)
}
