import { dedupeScanUrls, SCANNER_LIMITS } from '../../lib/tools'
import { priceStats } from '../../lib/intelligence'
import { deduplicate, identityFingerprint } from '../../lib/dedup'
import { executeTask } from '../../lib/execution'
import { recordVaultScan } from '../../lib/storage'
import { assertSafePublicUrl, getContext, json, normalizeInputString } from '../../lib/security'
import type { TaskKind } from '../../lib/orchestrator'

type RequestContext = { request: Request; env: Record<string, unknown> }

export const onRequestPost = async ({ request, env }: RequestContext): Promise<Response> => {
  const context = getContext(request, env)
  let body: { urls?: unknown; consent?: unknown }
  try { body = await request.json() as typeof body } catch { return json({ error: 'invalid_json' }, { status: 400 }, context.requestId) }
  if (!Array.isArray(body.urls)) return json({ error: 'urls_required', message: 'A list of source URLs is required.' }, { status: 400 }, context.requestId)
  if (body.consent !== true) return json({ error: 'rights_confirmation_required', message: 'Confirm that you are permitted to use the source information and assets.' }, { status: 400 }, context.requestId)

  const cleaned = body.urls.map((value) => normalizeInputString(value, 2000)).filter(Boolean)
  if (!cleaned.length) return json({ error: 'urls_required', message: 'At least one valid URL is required.' }, { status: 400 }, context.requestId)
  const { urls, dropped } = dedupeScanUrls(cleaned)

  const startedAt = new Date().toISOString()
  const results: Array<{
    url: string
    host: string
    status: string
    routeProvider: string | null
    title: string | null
    price: number | null
    currency: string | null
    fields: number
    sourceHealth: string | null
    error: string | null
    retrievedAt: string | null
  }> = []
  const observations: Array<{ field: string; value: string | number | null; sourceUrl: string; sourceHost: string }> = []

  // Bounded concurrency, per-domain cap, 1 attempt per URL.
  const perDomain = new Map<string, number>()
  const queue = [...urls]
  const workers = Array.from({ length: Math.min(SCANNER_LIMITS.concurrency, queue.length) }, async () => {
    while (queue.length) {
      const url = queue.shift()
      if (!url) return
      let host = ''
      try { host = new URL(url).hostname.replace(/^www\./, '') } catch { host = 'invalid' }
      const current = perDomain.get(host) ?? 0
      if (current >= SCANNER_LIMITS.perDomainCap) {
        results.push({ url, host, status: 'domain_capped', routeProvider: null, title: null, price: null, currency: null, fields: 0, sourceHealth: null, error: `Per-domain cap of ${SCANNER_LIMITS.perDomainCap} reached for ${host}.`, retrievedAt: null })
        continue
      }
      perDomain.set(host, current + 1)
      try {
        const validated = assertSafePublicUrl(url).toString()
        const execution = await executeTask(env, 'product_import' as TaskKind, validated, { maxAttempts: SCANNER_LIMITS.attemptsPerUrl })
        const observation = execution.observations[0]
        const priceField = observation?.fields.find((field) => field.label === 'Source price')
        const price = priceField ? Number(priceField.value.replace(/[^0-9.]/g, '')) : null
        results.push({
          url: validated,
          host,
          status: execution.status,
          routeProvider: execution.route.providerId,
          title: observation?.fields.find((field) => field.label === 'Title')?.value ?? null,
          price: Number.isFinite(price) && price ? price : null,
          currency: observation?.fields.find((field) => field.label === 'Source price')?.value.match(/[A-Z]{3}/)?.[0] ?? null,
          fields: observation?.fields.length ?? 0,
          sourceHealth: observation?.sourceHealth ?? null,
          error: execution.error?.message ?? null,
          retrievedAt: observation?.retrievedAt ?? null,
        })
        for (const field of observation?.fields ?? []) {
          observations.push({ field: field.label, value: field.value, sourceUrl: observation.sourceUrl, sourceHost: observation.sourceHost ?? '' })
        }
      } catch (error) {
        results.push({ url, host, status: 'blocked', routeProvider: null, title: null, price: null, currency: null, fields: 0, sourceHealth: null, error: error instanceof Error ? error.message : 'Unsafe or invalid source URL.', retrievedAt: null })
      }
    }
  })
  await Promise.all(workers)

  const prices = results.map((result) => result.price).filter((price): price is number => price != null)
  const stats = priceStats(prices)
  const deduped = deduplicate(results.filter((result) => result.title), {
    fingerprintOf: (result) => identityFingerprint({ title: result.title ?? '', brand: '', model: '', canonicalUrl: result.url }),
    prefer: (a, b) => (a.price ?? 0) - (b.price ?? 0),
    identityOf: (result) => result.url,
  })

  await recordVaultScan(env, urls.length, prices.length)
  return json({
    status: 'completed',
    limits: SCANNER_LIMITS,
    requested: cleaned.length,
    accepted: urls.length,
    droppedDuplicates: dropped,
    results,
    dedup: { duplicateCount: deduped.duplicateCount, kept: deduped.records.length, conflictCount: deduped.conflictCount },
    priceStats: stats,
    observationCount: observations.length,
    startedAt,
    endedAt: new Date().toISOString(),
    note: 'Scanner is bounded (max URLs, per-domain cap, bounded concurrency). Results are observations from permitted public sources; blocked/domain-capped entries are reported, never hidden.',
  }, { status: 200 }, context.requestId)
}
