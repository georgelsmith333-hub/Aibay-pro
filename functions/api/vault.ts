import { addVaultItem, bindingReport, readVault, removeVaultItem } from '../lib/storage'
import { getContext, json, normalizeInputString } from '../lib/security'

type Env = Record<string, unknown>
type RequestContext = { request: Request; env: Env }

export const onRequestGet = async ({ request, env }: RequestContext): Promise<Response> => {
  const context = getContext(request, env)
  const vault = await readVault(env)
  return json({ status: 'ok', ...vault }, {}, context.requestId)
}

export const onRequestPost = async ({ request, env }: RequestContext): Promise<Response> => {
  const context = getContext(request, env)
  let body: { action?: unknown; kind?: unknown; title?: unknown; url?: unknown; targetPrice?: unknown; note?: unknown; id?: unknown }
  try { body = await request.json() as typeof body } catch { return json({ error: 'invalid_json' }, { status: 400 }, context.requestId) }
  const action = body.action === 'remove' ? 'remove' : 'add'
  if (action === 'remove') {
    const id = normalizeInputString(body.id, 120)
    if (!id) return json({ error: 'id_required' }, { status: 400 }, context.requestId)
    const result = await removeVaultItem(env, id)
    if (!result.ok) return json({ error: 'vault_unavailable', message: result.error ?? 'Vault is not configured with durable storage.', persistence: result.persistence }, { status: 409 }, context.requestId)
    const vault = await readVault(env)
    return json({ status: 'ok', removed: id, ...vault }, { status: 200 }, context.requestId)
  }
  const kind = body.kind === 'seller' ? 'seller' : 'watch'
  const title = normalizeInputString(body.title, 300)
  const url = normalizeInputString(body.url, 2000)
  if (!title || !url) return json({ error: 'title_and_url_required' }, { status: 400 }, context.requestId)
  const result = await addVaultItem(env, { kind, title, url, targetPrice: normalizeInputString(body.targetPrice, 40), note: normalizeInputString(body.note, 500) })
  if (!result.ok) return json({ error: 'vault_unavailable', message: result.error ?? 'Vault is not configured with durable storage.', persistence: result.persistence }, { status: 409 }, context.requestId)
  const vault = await readVault(env)
  return json({ status: 'ok', added: result.id, ...vault }, { status: 201 }, context.requestId)
}

export const onRequestOptions = async ({ request }: RequestContext): Promise<Response> => {
  const context = getContext(request, {})
  return json({ ok: true }, { status: 204, headers: { 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type' } }, context.requestId)
}

export { bindingReport as reportInfra }
