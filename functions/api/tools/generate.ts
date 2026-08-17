import { generateListingPackage, type GenerateInput } from '../../lib/tools'
import { recordVaultGenerated } from '../../lib/storage'
import { getContext, json, normalizeInputString } from '../../lib/security'

type RequestContext = { request: Request; env: Record<string, unknown> }

function numeric(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export const onRequestPost = async ({ request, env }: RequestContext): Promise<Response> => {
  const context = getContext(request, {})
  let body: { productTitle?: unknown; description?: unknown; brand?: unknown; model?: unknown; gtin?: unknown; currency?: unknown; evidence?: unknown; market?: unknown; supplierCost?: unknown }
  try { body = await request.json() as typeof body } catch { return json({ error: 'invalid_json' }, { status: 400 }, context.requestId) }
  const productTitle = normalizeInputString(body.productTitle, 300)
  if (!productTitle) return json({ error: 'title_required', message: 'A product title is required.' }, { status: 400 }, context.requestId)
  const input: GenerateInput = {
    productTitle,
    description: normalizeInputString(body.description, 20_000),
    brand: normalizeInputString(body.brand, 120),
    model: normalizeInputString(body.model, 160),
    gtin: normalizeInputString(body.gtin, 50),
    currency: normalizeInputString(body.currency, 3) || 'USD',
    supplierCost: numeric(body.supplierCost) ?? undefined,
    evidence: Array.isArray(body.evidence) ? body.evidence.slice(0, 75).flatMap((item) => {
      if (!item || typeof item !== 'object') return []
      const record = item as Record<string, unknown>
      const label = normalizeInputString(record.label, 80)
      const value = normalizeInputString(record.value, 500)
      const state = ['verified', 'derived', 'needs_review', 'unknown'].includes(String(record.state)) ? String(record.state) : 'needs_review'
      if (!label || !value) return []
      return [{ label, value, state, source: normalizeInputString(record.source, 500) || undefined }]
    }) : [],
    market: Array.isArray(body.market) ? body.market.slice(0, 100).flatMap((item) => {
      if (!item || typeof item !== 'object') return []
      const record = item as Record<string, unknown>
      const price = numeric(record.price)
      if (price == null) return []
      return [{ title: normalizeInputString(record.title, 160) || 'Untitled', price, shipping: numeric(record.shipping) ?? 0, condition: normalizeInputString(record.condition, 80) || undefined }]
    }) : [],
  }
  const result = generateListingPackage(input)
  await recordVaultGenerated(env, result.listingPackage.titleCandidates[0] ?? productTitle)
  return json({ status: 'review_ready', ...result, note: 'Deterministic, evidence-grounded listing package. AI ranking may reorder supplied candidates only when configured; nothing is auto-published.' }, { status: 201 }, context.requestId)
}
