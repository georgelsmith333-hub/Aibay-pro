import { calculateProfit, type ProfitInput } from '../../lib/tools'
import { getContext, json } from '../../lib/security'

type RequestContext = { request: Request }

function numeric(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export const onRequestPost = async ({ request }: RequestContext): Promise<Response> => {
  const context = getContext(request, {})
  let body: ProfitInput & { currency?: unknown }
  try { body = await request.json() as typeof body } catch { return json({ error: 'invalid_json' }, { status: 400 }, context.requestId) }
  const revenue = numeric(body.revenue)
  const supplierCost = numeric(body.supplierCost)
  if (revenue == null || supplierCost == null) return json({ error: 'revenue_and_cost_required', message: 'Revenue and supplier cost are required.' }, { status: 400 }, context.requestId)
  const result = calculateProfit({
    revenue,
    supplierCost,
    shippingCost: numeric(body.shippingCost) ?? 0,
    platformFeePct: numeric(body.platformFeePct) ?? undefined,
    fixedFee: numeric(body.fixedFee) ?? undefined,
    paymentFeePct: numeric(body.paymentFeePct) ?? undefined,
    adFeePct: numeric(body.adFeePct) ?? undefined,
    otherCost: numeric(body.otherCost) ?? undefined,
    currency: typeof body.currency === 'string' ? body.currency : 'USD',
  })
  return json({ status: 'completed', ...result, note: 'ESTIMATED profit: fees and costs are assumptions you control; never a guarantee.' }, { status: 200 }, context.requestId)
}
