type RequestContext = { request: Request }

type ExportRow = { title?: unknown; sourceUrl?: unknown; canonicalUrl?: unknown; fingerprint?: unknown; score?: unknown; brand?: unknown; model?: unknown; price?: unknown; currency?: unknown; missing?: unknown; warnings?: unknown }

function text(value: unknown) { return typeof value === 'string' ? value.replace(/[\r\n]+/g, ' ').trim() : value == null ? '' : String(value) }
function csvCell(value: unknown) { return `"${text(value).replaceAll('"', '""')}"` }
function json(payload: unknown, init: ResponseInit = {}) { return new Response(JSON.stringify(payload), { ...init, headers: { 'content-type': 'application/json; charset=utf-8', ...(init.headers || {}) } }) }

export const onRequestPost = async ({ request }: RequestContext): Promise<Response> => {
  let body: { format?: unknown; results?: unknown }
  try { body = await request.json() as { format?: unknown; results?: unknown } } catch { return json({ error: 'invalid_json' }, { status: 400 }) }
  const format = body.format === 'csv' || body.format === 'markdown' || body.format === 'json' ? body.format : 'json'
  if (!Array.isArray(body.results)) return json({ error: 'results_required' }, { status: 400 })
  const rows = body.results.slice(0, 100).filter((item): item is ExportRow => Boolean(item && typeof item === 'object'))
  const provenanceNote = 'AiBay research export; scores reflect supplied evidence and are not live sales predictions.'
  if (format === 'csv') {
    const header = ['title', 'sourceUrl', 'canonicalUrl', 'fingerprint', 'score', 'brand', 'model', 'price', 'currency', 'missing', 'warnings']
    const lines = [header.join(','), ...rows.map((row) => [row.title, row.sourceUrl, row.canonicalUrl, row.fingerprint, row.score, row.brand, row.model, row.price, row.currency, Array.isArray(row.missing) ? row.missing.join('; ') : row.missing, Array.isArray(row.warnings) ? row.warnings.join('; ') : row.warnings].map(csvCell).join(','))]
    return new Response(`${lines.join('\n')}\n`, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="aibay-research.csv"' } })
  }
  if (format === 'markdown') {
    const lines = [`# AiBay Research Export`, '', `> ${provenanceNote}`, '', '| Product | Source | Score | Missing fields |', '| --- | --- | ---: | --- |', ...rows.map((row) => `| ${text(row.title).replaceAll('|', '\\|')} | ${text(row.sourceUrl).replaceAll('|', '\\|')} | ${text(row.score)} | ${text(Array.isArray(row.missing) ? row.missing.join(', ') : row.missing).replaceAll('|', '\\|')} |`), '']
    return new Response(lines.join('\n'), { headers: { 'content-type': 'text/markdown; charset=utf-8', 'content-disposition': 'attachment; filename="aibay-research.md"' } })
  }
  return json({ status: 'exported', format, generatedAt: new Date().toISOString(), note: provenanceNote, results: rows }, { headers: { 'content-disposition': 'attachment; filename="aibay-research.json"' } })
}
