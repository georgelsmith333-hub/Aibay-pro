import { detectConflicts, evidenceGraph, sourceQualityScore } from '../../lib/intelligence'
import { getContext, json, normalizeInputString } from '../../lib/security'

type RequestContext = { request: Request }

function numeric(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export const onRequestPost = async ({ request }: RequestContext): Promise<Response> => {
  const context = getContext(request, {})
  let body: { observations?: unknown }
  try { body = await request.json() as typeof body } catch { return json({ error: 'invalid_json' }, { status: 400 }, context.requestId) }
  const observations = Array.isArray(body.observations) ? body.observations.slice(0, 500).flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const record = item as Record<string, unknown>
    const field = normalizeInputString(record.field, 60)
    const value = typeof record.value === 'string' ? normalizeInputString(record.value, 500) : numeric(record.value) ?? null
    if (!field || value == null) return []
    return [{ field, value, sourceUrl: normalizeInputString(record.sourceUrl, 2000) || undefined, sourceHost: normalizeInputString(record.sourceHost, 120) || undefined, retrievedAt: typeof record.retrievedAt === 'string' ? record.retrievedAt : undefined, method: normalizeInputString(record.method, 120) || undefined, confidence: numeric(record.confidence) ?? undefined }]
  }) : []
  const graph = evidenceGraph(observations)
  const { conflicts, conflictCount } = detectConflicts(observations)
  const sources = [...new Set(observations.map((observation) => observation.sourceHost).filter((host): host is string => Boolean(host)))].map((host) => ({ host, ...sourceQualityScore({ host, retrievedAt: observations.find((observation) => observation.sourceHost === host)?.retrievedAt ?? null, fieldCount: observations.filter((observation) => observation.sourceHost === host).length }) }))
  return json({ status: 'completed', observationCount: observations.length, graph, conflicts, conflictCount, sources, note: 'Every graph relationship and conflict entry retains provenance. Conflicts are never resolved silently.' }, { status: 200 }, context.requestId)
}
