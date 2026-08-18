import { findWinningItems } from '../../lib/winning'
import { getContext, json, normalizeInputString } from '../../lib/security'

type RequestContext = { request: Request }

export const onRequestPost = async ({ request }: RequestContext): Promise<Response> => {
  const context = getContext(request, {})
  let body: { keyword?: unknown; maxItems?: unknown }
  try { body = await request.json() as typeof body } catch { return json({ error: 'invalid_json' }, { status: 400 }, context.requestId) }
  const keyword = normalizeInputString(body.keyword, 160)
  if (!keyword) return json({ error: 'keyword_required', message: 'A keyword is required to find winning products.' }, { status: 400 }, context.requestId)
  const maxItems = typeof body.maxItems === 'number' && Number.isFinite(body.maxItems) ? Math.max(1, Math.min(10, Math.floor(body.maxItems))) : 8
  const result = await findWinningItems(keyword, { maxItems })
  return json({ ...result, note: `${result.note} Auto-winning-item discovery uses public pages only (zero keys); nothing is fabricated and blocks are reported truthfully.` }, { status: 200 }, context.requestId)
}
