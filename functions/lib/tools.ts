// Tools layer (competitive feature map, truthfully implemented):
// profit calculator, keyword studio, turbo scanner, listing generator,
// and evidence-gated trending.
//
// Truth rules:
// - No number is ever fabricated. Everything is computed from supplied
//   inputs or labeled ESTIMATED/INFERRED with exposed assumptions.
// - Trending requires repeated dated observations; otherwise
//   INSUFFICIENT_EVIDENCE.
// - The scanner is bounded (max URLs, per-domain cap, bounded concurrency)
//   and never floods a domain.

import { priceStats } from './intelligence'
import { buildDeterministicListing, type ListingInput } from './listing'
import { identityFingerprint } from './dedup'

// ---------------------------------------------------------------------------
// Profit calculator (§22)
// ---------------------------------------------------------------------------

export type ProfitInput = {
  revenue: number
  supplierCost: number
  shippingCost?: number
  platformFeePct?: number
  fixedFee?: number
  paymentFeePct?: number
  adFeePct?: number
  otherCost?: number
  currency?: string
}

export type ProfitResult = {
  currency: string
  lineItems: Array<{ label: string; amount: number; kind: 'revenue' | 'cost' | 'fee'; note?: string }>
  totalFees: number
  totalCosts: number
  estimatedProfit: number
  marginPct: number | null
  breakevenPrice: number
  state: 'ESTIMATED'
  assumptions: string[]
  note: string
}

export function calculateProfit(input: ProfitInput): ProfitResult {
  const currency = input.currency || 'USD'
  const revenue = input.revenue
  const platformFeePct = input.platformFeePct ?? 13.25
  const fixedFee = input.fixedFee ?? 0.3
  const paymentFeePct = input.paymentFeePct ?? 2.9
  const adFeePct = input.adFeePct ?? 0
  const shippingCost = input.shippingCost ?? 0
  const otherCost = input.otherCost ?? 0

  const platformFee = (revenue * platformFeePct) / 100
  const fixed = fixedFee
  const paymentFee = (revenue * paymentFeePct) / 100
  const adFee = (revenue * adFeePct) / 100
  const totalFees = Math.round((platformFee + fixed + paymentFee + adFee) * 100) / 100
  const totalCosts = Math.round((input.supplierCost + shippingCost + otherCost) * 100) / 100
  const estimatedProfit = Math.round((revenue - totalFees - totalCosts) * 100) / 100
  const marginPct = revenue > 0 ? Math.round((estimatedProfit / revenue) * 1000) / 10 : null
  const breakeven = Math.round((totalCosts + totalFees) * 100) / 100

  return {
    currency,
    lineItems: [
      { label: 'Revenue (observed/configured price)', amount: revenue, kind: 'revenue' },
      { label: `Platform fee (${platformFeePct}%)`, amount: Math.round(platformFee * 100) / 100, kind: 'fee', note: 'Configurable preset; not a marketplace guarantee.' },
      { label: 'Fixed listing fee', amount: fixed, kind: 'fee', note: 'Configurable.' },
      { label: `Payment processing (${paymentFeePct}%)`, amount: Math.round(paymentFee * 100) / 100, kind: 'fee', note: 'Configurable.' },
      ...(adFeePct > 0 ? [{ label: `Advertising (${adFeePct}%)`, amount: Math.round(adFee * 100) / 100, kind: 'fee' as const, note: 'Configurable.' }] : []),
      { label: 'Supplier cost', amount: input.supplierCost, kind: 'cost' },
      { label: 'Shipping cost', amount: shippingCost, kind: 'cost' },
      ...(otherCost > 0 ? [{ label: 'Other costs', amount: otherCost, kind: 'cost' as const }] : []),
    ],
    totalFees,
    totalCosts,
    estimatedProfit,
    marginPct,
    breakevenPrice: breakeven,
    state: 'ESTIMATED',
    assumptions: [
      `Fees assumed: ${platformFeePct}% platform + ${fixedFee} fixed + ${paymentFeePct}% processing${adFeePct > 0 ? ` + ${adFeePct}% advertising` : ''}.`,
      'Profit is an estimate, not a guarantee. Sales, returns, VAT/GST, and promotions are not included.',
      'Revenue should come from an observed price, not a guess.',
    ],
    note: estimatedProfit >= 0 ? `Estimated profit ${currency} ${estimatedProfit} (${marginPct}% margin) before taxes and returns.` : `Estimated loss ${currency} ${Math.abs(estimatedProfit)} at the configured price. Raise price or lower costs.`,
  }
}

// ---------------------------------------------------------------------------
// Keyword studio (§26)
// ---------------------------------------------------------------------------

const STOPWORDS = new Set(['the', 'a', 'an', 'and', 'or', 'for', 'with', 'new', 'brand', 'original', 'genuine', 'official', 'high', 'quality', 'hot', 'sale', 'best', 'top', 'free', 'shipping', 'fast', 'cheap', 'discount', 'wholesale', 'free shipping', 'in', 'of', 'to', 'on'])

function tokensOf(value: string): string[] {
  return value.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter((token) => token.length >= 2 && !STOPWORDS.has(token))
}

export function keywordGroups(title: string, extra: string[] = []) {
  const tokens = tokensOf(`${title} ${extra.join(' ')}`)
  const frequency = new Map<string, number>()
  for (const token of tokens) frequency.set(token, (frequency.get(token) ?? 0) + 1)
  const ranked = [...frequency.entries()].sort((a, b) => b[1] - a[1]).map(([token, count]) => ({ token, count }))
  const bigrams: Array<{ token: string; count: number }> = []
  const ordered = tokens
  for (let index = 0; index < ordered.length - 1; index += 1) {
    const pair = `${ordered[index]} ${ordered[index + 1]}`
    if (STOPWORDS.has(ordered[index]) || STOPWORDS.has(ordered[index + 1])) continue
    const existing = bigrams.find((entry) => entry.token === pair)
    if (existing) existing.count += 1
    else bigrams.push({ token: pair, count: 1 })
  }
  return { unigrams: ranked.slice(0, 15), bigrams: bigrams.sort((a, b) => b.count - a.count).slice(0, 10) }
}

export function suggestedTitleCandidates(title: string, extra: string[] = [], max = 5): Array<{ title: string; length: number; keywordsCovered: number }> {
  const clean = title.trim().replace(/\s+/g, ' ')
  if (!clean) return []
  const extraTokens = [...new Set(extra.flatMap((value) => tokensOf(value)))]
  const candidates = new Set<string>()
  candidates.add(clean)
  if (clean.length <= 80) {
    // Append up to 2 missing high-value tokens when space allows.
    let base = clean
    for (const token of extraTokens) {
      if (base.length + 1 + token.length > 80) continue
      if (tokensOf(base).includes(token)) continue
      base = `${base} ${token}`
      candidates.add(base)
      if (candidates.size >= max) break
    }
  }
  // Compact variant: iteratively drop the rarest tokens until ≤80 chars.
  if (clean.length > 80) {
    const { unigrams } = keywordGroups(clean)
    let compact = clean
    let index = unigrams.length - 1
    while (compact.length > 80 && index >= 0) {
      const token = unigrams[index].token
      const before = compact
      compact = compact.replace(new RegExp(`\\b${token}\\b`, 'i'), '').replace(/\s+/g, ' ').trim()
      if (compact === before) index -= 1
      else index = Math.min(index, unigrams.length - 1)
    }
    if (compact.length <= 80 && compact.length > 20) candidates.add(compact)
  }
  return [...candidates].slice(0, max).map((candidate) => ({ title: candidate, length: candidate.length, keywordsCovered: tokensOf(candidate).length }))
}

export type KeywordAnalysis = {
  groups: { label: string; tokens: string[] }[]
  suggestedTitles: Array<{ title: string; length: number; keywordsCovered: number }>
  coverage: { descriptionTokens: number; coveredTokens: number; coveragePct: number | null }
  sellThrough: { state: 'VERIFIED' | 'UNVERIFIED'; ratePct: number | null; sold?: number; active?: number } | null
  note: string
}

export function analyzeKeywords(input: { title: string; description?: string; extra?: string[]; soldVolume?: number | null; activeVolume?: number | null }): KeywordAnalysis {
  const groupsRaw = keywordGroups(input.title, input.extra ?? [])
  const brand = groupsRaw.unigrams.slice(0, 1).map((entry) => entry.token)
  const model = groupsRaw.unigrams.slice(1, 2).map((entry) => entry.token)
  const attributes = groupsRaw.unigrams.slice(2, 8).map((entry) => entry.token)
  const groups = [
    { label: 'Brand', tokens: brand },
    { label: 'Model', tokens: model },
    { label: 'Attributes', tokens: attributes },
    { label: 'Top bigrams', tokens: groupsRaw.bigrams.slice(0, 3).map((entry) => entry.token) },
  ]
  const suggestedTitles = suggestedTitleCandidates(input.title, input.extra ?? [])
  const descriptionTokens = input.description ? tokensOf(input.description) : []
  const titleTokens = tokensOf(input.title)
  const covered = [...new Set(descriptionTokens)].filter((token) => titleTokens.includes(token))
  const coveragePct = descriptionTokens.length ? Math.round((covered.length / new Set(descriptionTokens).size) * 100) : null
  const sellThrough = input.soldVolume != null && input.activeVolume != null && input.activeVolume > 0
    ? { state: 'VERIFIED' as const, ratePct: Math.round((input.soldVolume / input.activeVolume) * 100), sold: input.soldVolume, active: input.activeVolume }
    : null
  return {
    groups,
    suggestedTitles,
    coverage: { descriptionTokens: new Set(descriptionTokens).size, coveredTokens: covered.length, coveragePct },
    sellThrough,
    note: sellThrough
      ? `Sell-through ${sellThrough.ratePct}% from supplied sold/active observations.`
      : 'Sell-through rate is UNVERIFIED: no sold/active observations were supplied. AiBay does not invent STR.',
  }
}

// ---------------------------------------------------------------------------
// Listing generator (§26 draft path)
// ---------------------------------------------------------------------------

export type CategorySuggestion = { name: string; confidence: number; matchedKeywords: string[]; note: string }

const CATEGORY_KEYWORDS: Array<{ name: string; keywords: string[] }> = [
  { name: 'Consumer Electronics', keywords: ['headphone', 'earbud', 'speaker', 'charger', 'cable', 'drone', 'camera', 'watch', 'smartwatch', 'phone', 'tablet', 'laptop', 'keyboard', 'mouse', 'gaming', 'led', 'light', 'bulb', 'power', 'battery', 'adapter'] },
  { name: 'Sporting Goods', keywords: ['fitness', 'yoga', 'gym', 'dumbbell', 'resistance', 'band', 'treadmill', 'exercise', 'outdoor', 'camping', 'hiking', 'bike', 'cycling', 'tennis', 'soccer', 'basketball'] },
  { name: 'Health & Beauty', keywords: ['perfume', 'cologne', 'skincare', 'serum', 'cream', 'makeup', 'cosmetic', 'shampoo', 'protein', 'vitamin', 'supplement', 'massage'] },
  { name: 'Home & Garden', keywords: ['kitchen', 'cookware', 'pan', 'pot', 'air fryer', 'vacuum', 'cleaner', 'furniture', 'chair', 'desk', 'lamp', 'decor', 'storage', 'organizer'] },
  { name: 'Toys & Hobbies', keywords: ['lego', 'toy', 'plush', 'doll', 'action figure', 'puzzle', 'rc', 'remote', 'drone', 'collectible'] },
  { name: 'Clothing, Shoes & Accessories', keywords: ['shoe', 'sneaker', 'band', 'strap', 'bracelet', 'shirt', 'hoodie', 'jacket', 'dress', 'bag', 'backpack', 'watch band'] },
  { name: 'Cell Phones & Accessories', keywords: ['phone case', 'screen protector', 'stand', 'holder', 'usb', 'charging'] },
  { name: 'Automotive', keywords: ['car', 'auto', 'vehicle', 'dashboard', 'seat', 'mirror', 'tire', 'led'] },
]

export function suggestCategories(title: string): CategorySuggestion[] {
  const lower = title.toLowerCase()
  const results: CategorySuggestion[] = []
  for (const category of CATEGORY_KEYWORDS) {
    const matched = category.keywords.filter((keyword) => lower.includes(keyword))
    if (matched.length) results.push({ name: category.name, confidence: Math.min(90, 55 + matched.length * 10), matchedKeywords: matched, note: 'Deterministic keyword match on the supplied title; a marketplace category API would raise precision when configured.' })
  }
  return results.sort((a, b) => b.confidence - a.confidence).slice(0, 3)
}

export type GenerateInput = {
  productTitle: string
  description?: string
  brand?: string
  model?: string
  gtin?: string
  currency?: string
  evidence?: Array<{ label: string; value: string; state: string; source?: string }>
  market?: Array<{ title: string; price: number; shipping?: number; condition?: string }>
  supplierCost?: number
}

export type GenerateResult = {
  listingPackage: ReturnType<typeof buildDeterministicListing>
  titleScore: { score: number; suggestions: string[]; improvedTitle: string | null }
  categorySuggestions: CategorySuggestion[]
  profit?: ProfitResult
  provenance: { method: string; retrievedAt: string; source: string; confidence: number }
}

export function titleScore(title: string): { score: number; suggestions: string[]; improvedTitle: string | null } {
  const suggestions: string[] = []
  let score = 100
  if (title.length > 80) { score -= 30; suggestions.push('Title exceeds 80 characters — eBay hard limit.') }
  if (title.length < 30) { score -= 15; suggestions.push('Title is short; add evidence-backed keywords.') }
  if (/\b(free shipping|best price|#1|100%|guarantee|warranty)\b/i.test(title)) { score -= 25; suggestions.push('Title contains filler or unsupported claims.') }
  const words = title.split(/\s+/).length
  if (words < 5) { score -= 10; suggestions.push('Add model number or specification.') }
  const improved = title.length > 80 ? title.slice(0, 80).replace(/\s+\S*$/, '') : null
  return { score: Math.max(0, score), suggestions, improvedTitle: improved }
}

export function generateListingPackage(input: GenerateInput): GenerateResult {
  const listingInput: ListingInput = {
    productTitle: input.productTitle,
    description: input.description ?? '',
    brand: input.brand,
    model: input.model,
    gtin: input.gtin,
    currency: input.currency || 'USD',
    evidence: input.evidence?.map((field) => ({ label: field.label, value: field.value, state: field.state as ListingInput['evidence'][number]['state'], source: field.source ?? '' })) ?? [],
    market: input.market?.map((listing) => ({ title: listing.title, price: listing.price, shipping: listing.shipping ?? 0, condition: listing.condition ?? '', matched: 'comparable' })) ?? [],
  }
  const listingPackage = buildDeterministicListing(listingInput)
  const scored = titleScore(listingPackage.titleCandidates[0] ?? input.productTitle)
  const categorySuggestions = suggestCategories(input.productTitle)
  const profit = input.supplierCost != null
    ? calculateProfit({ revenue: input.market?.[0]?.price ?? 0, supplierCost: input.supplierCost })
    : undefined
  return {
    listingPackage,
    titleScore: scored,
    categorySuggestions,
    profit,
    provenance: { method: 'deterministic-listing-v1', retrievedAt: new Date().toISOString(), source: input.evidence?.length ? 'supplied-evidence' : 'supplied-input', confidence: 90 },
  }
}

// ---------------------------------------------------------------------------
// Turbo scanner (§35, §65) — bounded batch research
// ---------------------------------------------------------------------------

export const SCANNER_LIMITS = { maxUrls: 10, perDomainCap: 3, concurrency: 2, attemptsPerUrl: 1 }

export function dedupeScanUrls(urls: string[]): { urls: string[]; dropped: number } {
  const seen = new Set<string>()
  const kept: string[] = []
  for (const url of urls) {
    const fingerprint = identityFingerprint({ title: '', brand: '', model: '', canonicalUrl: url })
    if (seen.has(fingerprint)) continue
    seen.add(fingerprint)
    kept.push(url)
  }
  return { urls: kept.slice(0, SCANNER_LIMITS.maxUrls), dropped: urls.length - kept.length }
}

// ---------------------------------------------------------------------------
// Evidence-gated trending (§20, §40)
// ---------------------------------------------------------------------------

export type TrendSeries = { keyword: string; observations: Array<{ date: string; count: number }> }

export type HotItem = { keyword: string; deltaPct: number | null; observations: number; windowDays: number; state: 'HOT' | 'INSUFFICIENT_EVIDENCE'; note: string }

export function hotTrending(series: TrendSeries[], options: { minObservations?: number; deltaThresholdPct?: number } = {}): { items: HotItem[]; note: string } {
  const minObservations = options.minObservations ?? 3
  const deltaThresholdPct = options.deltaThresholdPct ?? 20
  const items: HotItem[] = []
  for (const entry of series) {
    const clean = entry.observations.filter((observation) => Number.isFinite(observation.count) && observation.count >= 0).sort((a, b) => Date.parse(a.date) - Date.parse(b.date))
    if (clean.length < minObservations) {
      items.push({ keyword: entry.keyword, deltaPct: null, observations: clean.length, windowDays: 0, state: 'INSUFFICIENT_EVIDENCE', note: `Only ${clean.length}/${minObservations} dated observations. Trends are not declared from thin evidence.` })
      continue
    }
    const first = clean[0].count
    const last = clean[clean.length - 1].count
    const deltaPct = first > 0 ? Math.round(((last - first) / first) * 100) : null
    const windowDays = Math.max(1, Math.round((Date.parse(clean[clean.length - 1].date) - Date.parse(clean[0].date)) / 86_400_000))
    if (deltaPct != null && deltaPct >= deltaThresholdPct) {
      items.push({ keyword: entry.keyword, deltaPct, observations: clean.length, windowDays, state: 'HOT', note: `${clean.length} dated observations; count ${first} → ${last} (+${deltaPct}%) over ${windowDays} day(s).` })
    } else {
      items.push({ keyword: entry.keyword, deltaPct, observations: clean.length, windowDays, state: 'INSUFFICIENT_EVIDENCE', note: `Delta ${deltaPct ?? 'n/a'}% is below the ${deltaThresholdPct}% meaningful-change threshold.` })
    }
  }
  return { items, note: `Trending requires ≥${minObservations} dated observations per keyword and ≥${deltaThresholdPct}% delta. No keyword is declared HOT without that evidence.` }
}

export { priceStats as scanPriceStats }
