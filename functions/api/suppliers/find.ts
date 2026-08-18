import { findSuppliers } from '../../lib/suppliers'
import { getContext, json, normalizeInputString } from '../../lib/security'

type RequestContext = { request: Request }

export const onRequestPost = async ({ request }: RequestContext): Promise<Response> => {
  const context = getContext(request, {})
  let body: { title?: unknown; brand?: unknown; model?: unknown; sources?: unknown }
  try { body = await request.json() as typeof body } catch { return json({ error: 'invalid_json' }, { status: 400 }, context.requestId) }
  const title = normalizeInputString(body.title, 300)
  if (!title) return json({ error: 'title_required', message: 'A product title is required.' }, { status: 400 }, context.requestId)
  const sources = Array.isArray(body.sources) ? body.sources.map((value) => normalizeInputString(value, 40)).filter(Boolean).slice(0, 3) : undefined
  const result = await findSuppliers({ title, brand: normalizeInputString(body.brand, 120), model: normalizeInputString(body.model, 160), sources })
  return json({ status: 'completed', ...result, note: 'Supplier discovery uses public marketplace pages only (bounded, zero keys). Prices are observations; fees/shipping not included. Blocks are reported truthfully.' }, { status: 200 }, context.requestId)
}
