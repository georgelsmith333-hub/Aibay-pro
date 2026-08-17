import { detectConflicts, evidenceGraph, planMission, priceStats, scoreOpportunity, type OpportunityInput } from '../../../lib/intelligence'
import { executeTask } from '../../../lib/execution'
import { assertSafePublicUrl, getContext, json, normalizeInputString } from '../../../lib/security'
import type { TaskKind } from '../../../lib/orchestrator'

type RequestContext = { request: Request; env: Record<string, unknown> }

export const onRequestPost = async ({ request, env }: RequestContext): Promise<Response> => {
  const context = getContext(request, env)
  let body: { mission?: unknown; inputs?: unknown; consent?: unknown }
  try { body = await request.json() as typeof body } catch { return json({ error: 'invalid_json' }, { status: 400 }, context.requestId) }
  const mission = normalizeInputString(body.mission, 60)
  const consent = body.consent === true
  if (!mission) return json({ error: 'mission_required' }, { status: 400 }, context.requestId)
  const rawInputs = body.inputs && typeof body.inputs === 'object' ? body.inputs as Record<string, unknown> : {}
  const inputs: Record<string, string | undefined> = { url: normalizeInputString(rawInputs.url, 2000), keyword: normalizeInputString(rawInputs.keyword, 200) }

  let plan
  try { plan = planMission(mission, inputs) } catch (error) { return json({ error: 'unknown_mission', message: error instanceof Error ? error.message : 'Unknown mission.' }, { status: 404 }, context.requestId) }

  const executable = plan.steps.filter((step) => step.task === 'product_import' && step.input === 'url')
  if (!executable.length) {
    return json({ status: 'planned_only', plan, note: 'This mission has no URL execution steps with the current inputs. Provide a URL or run analysis steps directly.' }, { status: 200 }, context.requestId)
  }
  if (!consent) return json({ error: 'rights_confirmation_required', message: 'Confirm that you are permitted to use the source information and assets.' }, { status: 400 }, context.requestId)

  // Hard limits (§31): bounded steps, one attempt per URL, adapter timeouts enforced by the executor.
  const maxUrls = 5
  const urls = [...new Set(executable.map(() => inputs.url).filter((url): url is string => Boolean(url)))].slice(0, maxUrls)
  const steps: Array<{ step: number; task: string; url: string; execution: { status: string; routeProvider: string | null; observations: unknown[]; attempts: unknown[]; error: unknown } | { status: string; error: string } }> = []
  const allObservations: Array<{ field: string; value: string | number | null; sourceUrl?: string; sourceHost?: string; retrievedAt?: string; method?: string; confidence?: number }> = []

  for (let index = 0; index < urls.length; index += 1) {
    const url = urls[index]
    let validated: string
    try { validated = assertSafePublicUrl(url).toString() } catch (error) {
      steps.push({ step: index + 1, task: 'product_import', url, execution: { status: 'blocked', error: error instanceof Error ? error.message : 'Unsafe source URL.' } })
      continue
    }
    const result = await executeTask(env, 'product_import' as TaskKind, validated, { maxAttempts: 1, skipCacheRead: false, skipCacheWrite: false })
    steps.push({
      step: index + 1,
      task: 'product_import',
      url: validated,
      execution: {
        status: result.status,
        routeProvider: result.route.providerId,
        observations: result.observations,
        attempts: result.attempts,
        error: result.error ?? null,
      },
    })
    for (const observation of result.observations) {
      for (const field of observation.fields) {
        allObservations.push({ field: field.label, value: field.value, sourceUrl: observation.sourceUrl, sourceHost: observation.sourceHost, retrievedAt: observation.retrievedAt, method: field.method, confidence: field.confidence })
      }
      if (observation.sourceHealth === 'healthy' || observation.sourceHealth === 'incomplete') {
        allObservations.push({ field: 'Source price', value: observation.fields.find((field) => field.label === 'Source price')?.value ?? '', sourceUrl: observation.sourceUrl, sourceHost: observation.sourceHost, retrievedAt: observation.retrievedAt, method: 'mission-run', confidence: 90 })
      }
    }
  }

  // Analysis layer
  const prices = allObservations.filter((observation) => observation.field === 'Source price' || observation.field === 'price').map((observation) => Number(String(observation.value).replace(/[^0-9.]/g, ''))).filter((value) => Number.isFinite(value))
  const stats = priceStats(prices)
  const { conflicts, conflictCount } = detectConflicts(allObservations)
  const graph = evidenceGraph(allObservations)
  const opportunityInput: OpportunityInput = {
    productTitle: allObservations.find((observation) => observation.field === 'Title')?.value ? String(allObservations.find((observation) => observation.field === 'Title')?.value) : null,
    observedPrice: prices.length ? Math.max(...prices) : null,
    supplierPrice: null,
    listings: prices.map((price) => ({ price })),
    sources: Math.max(1, new Set(allObservations.map((observation) => observation.sourceHost).filter(Boolean)).size),
  }
  const opportunity = scoreOpportunity(opportunityInput)

  const reportLines = [
    `# AiBay research mission: ${plan.label}`,
    '',
    `> ${plan.description}`,
    '',
    `**Status:** ${steps.some((step) => step.execution.status === 'completed') ? 'PARTIAL (some steps completed)' : 'BLOCKED (no step completed; sandbox/network or source limits)'}`,
    `**Executed:** ${steps.filter((step) => step.execution.status === 'completed').length}/${steps.length} URL steps`,
    `**Observations:** ${allObservations.length}`,
    `**Evidence graph:** ${graph.nodeCount} entities, ${graph.edgeCount} relationships`,
    `**Conflicts:** ${conflictCount}`,
    '',
    '## Steps',
    ...steps.map((step) => `- Step ${step.step}: ${step.url} → \`${step.execution.status}\` (${'routeProvider' in step.execution && step.execution.routeProvider ? step.execution.routeProvider : 'n/a'})`),
    '',
    '## Price observations',
    stats.count ? `- ${stats.count} observation(s): min ${stats.min}, max ${stats.max}, median ${stats.median}, average ${stats.average}` : '- No usable price observations.',
    '',
    '## Opportunity',
    opportunity.overall != null ? `- Overall ${opportunity.overall}/100 (${opportunity.verdict})` : '- INSUFFICIENT EVIDENCE: opportunity cannot be claimed.',
    ...opportunity.explanation.map((line) => `- ${line}`),
    '',
    '> Generated by AiBay bounded research agent. Values are observations or estimates, never guarantees. Provenance is attached to every observation.',
  ]
  const report = reportLines.join('\n')

  return json({
    status: 'completed',
    mission: plan.mission,
    label: plan.label,
    plan,
    steps,
    observations: allObservations,
    analysis: { priceStats: stats, conflicts, conflictCount, graph, opportunity },
    report,
    limits: { maxUrls, attemptsPerUrl: 1 },
    note: 'Mission execution is bounded and request-scoped. Durable history and alerting require configured infrastructure.',
  }, { status: 200 }, context.requestId)
}
