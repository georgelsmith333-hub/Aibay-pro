import { analyzeKeywords } from '../../lib/tools'
import { getContext, json, normalizeInputString } from '../../lib/security'

type RequestContext = { request: Request }

function numeric(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export const onRequestPost = async ({ request }: RequestContext): Promise<Response> => {
  const context = getContext(request, {})
  let body: { title?: unknown; description?: unknown; extra?: unknown; soldVolume?: unknown; activeVolume?: unknown }
  try { body = await request.json() as typeof body } catch { return json({ error: 'invalid_json' }, { status: 400 }, context.requestId) }
  const title = normalizeInputString(body.title, 300)
  if (!title) return json({ error: 'title_required', message: 'A product title is required.' }, { status: 400 }, context.requestId)
  const result = analyzeKeywords({
    title,
    description: normalizeInputString(body.description, 10_000),
    extra: Array.isArray(body.extra) ? body.extra.map((value) => normalizeInputString(value, 200)).filter(Boolean) : [],
    soldVolume: numeric(body.soldVolume),
    activeVolume: numeric(body.activeVolume),
  })
  return json({ status: 'completed', ...result, note: 'Keywords and title suggestions are deterministic and evidence-based. STR is only reported when sold/active observations are supplied.' }, { status: 200 }, context.requestId)
}
