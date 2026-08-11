import { getContext, json, normalizeInputString } from '../../lib/security'

type DraftBody = { title?: unknown; description?: unknown; itemSpecifics?: unknown; sourceSnapshotId?: unknown; userApproved?: unknown }
type RequestContext = { request: Request }

export const onRequestPost = async ({ request }: RequestContext): Promise<Response> => {
  const context = getContext(request, {})
  let body: DraftBody
  try { body = await request.json() as DraftBody } catch { return json({ error: 'invalid_json' }, { status: 400 }, context.requestId) }
  const title = normalizeInputString(body.title, 80)
  const description = normalizeInputString(body.description, 50000)
  if (!title || !description) return json({ error: 'draft_content_required', message: 'A title and description are required.' }, { status: 400 }, context.requestId)
  if (title.length > 80) return json({ error: 'title_too_long', message: `eBay titles must be 80 characters or fewer. Received ${title.length}.` }, { status: 422 }, context.requestId)
  if (body.userApproved !== true) return json({ error: 'human_approval_required', message: 'Review and approve the draft before export.' }, { status: 409 }, context.requestId)

  return json({
    status: 'draft_exported',
    exportId: `exp_${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`,
    marketplace: 'EBAY_US',
    draftOnly: true,
    published: false,
    sourceSnapshotId: normalizeInputString(body.sourceSnapshotId, 120) || null,
    title,
    description,
    exportedAt: new Date().toISOString(),
  }, { status: 201 }, context.requestId)
}
