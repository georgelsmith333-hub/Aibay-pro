import { type ListingInput, type ListingPackage, validateTitle } from './listing'

export type AiProviderEnv = {
  AI_PROVIDER_API_KEY?: string
  AI_PROVIDER_BASE_URL?: string
  AI_PROVIDER_MODEL?: string
}

type RankedTitleResponse = { titleCandidates?: unknown; strategyNote?: unknown }

function extractJson(content: unknown): RankedTitleResponse | null {
  if (typeof content !== 'string') return null
  try { return JSON.parse(content) as RankedTitleResponse } catch { return null }
}

export async function rankListingTitlesWithAi(input: ListingInput, deterministicPackage: ListingPackage, env: AiProviderEnv): Promise<ListingPackage> {
  if (!env.AI_PROVIDER_API_KEY || !env.AI_PROVIDER_BASE_URL || !env.AI_PROVIDER_MODEL) return deterministicPackage
  const knownCandidates = deterministicPackage.titleCandidates
  const endpoint = `${env.AI_PROVIDER_BASE_URL.replace(/\/$/, '')}/chat/completions`
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { authorization: `Bearer ${env.AI_PROVIDER_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: env.AI_PROVIDER_MODEL,
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'You are a conservative eBay title editor. You may only rank or remove the supplied candidate titles. You must not write a new title, add claims, add keywords, or change product facts. Return JSON with titleCandidates as an ordered subset of the supplied exact strings and strategyNote as one short readability note.' },
          { role: 'user', content: JSON.stringify({ productTitle: input.productTitle, selectedVariant: input.selectedVariant?.label || null, candidates: knownCandidates }) },
        ],
      }),
    })
    if (!response.ok) return deterministicPackage
    const data = await response.json<{ choices?: Array<{ message?: { content?: unknown } }> }>()
    const ranked = extractJson(data.choices?.[0]?.message?.content)
    const requested = Array.isArray(ranked?.titleCandidates) ? ranked.titleCandidates.filter((value): value is string => typeof value === 'string') : []
    const approved = requested.filter((title) => knownCandidates.includes(title) && validateTitle(title).passed)
    if (!approved.length) return deterministicPackage
    return {
      ...deterministicPackage,
      source: 'ai_structured',
      titleCandidates: [...approved, ...knownCandidates.filter((candidate) => !approved.includes(candidate))],
      strategy: typeof ranked?.strategyNote === 'string' && ranked.strategyNote.length <= 240
        ? [ranked.strategyNote, ...deterministicPackage.strategy]
        : deterministicPackage.strategy,
    }
  } catch {
    return deterministicPackage
  }
}
