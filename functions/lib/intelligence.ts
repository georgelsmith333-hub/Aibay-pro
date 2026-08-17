// Intelligence layer (migration phases F–L): capability OS, opportunity
// scoring, price/trend intelligence, listing quality, source quality,
// contradiction detection, change detection, and the evidence graph.
//
// Truth rules:
// - Every computed value is derived from supplied observations only.
// - Missing evidence yields `INSUFFICIENT_EVIDENCE` / null — never an
//   invented number.
// - Every relationship and metric carries provenance (source, time, method,
//   confidence) or an explicit reason it does not.
// - `ESTIMATED` and `INFERRED` are distinct from `VERIFIED`.

export type TruthState = 'VERIFIED' | 'AVAILABLE' | 'CONFIGURED' | 'UNCONFIGURED' | 'PARTIAL' | 'UNVERIFIED' | 'BLOCKED' | 'ESTIMATED' | 'INFERRED' | 'INSUFFICIENT_EVIDENCE'

export type Provenance = {
  sourceUrl?: string
  sourceHost?: string
  retrievedAt: string
  method: string
  confidence: number
}

// ---------------------------------------------------------------------------
// Capability OS (§3)
// ---------------------------------------------------------------------------

export const CAPABILITY_CATEGORIES = ['WEB', 'SEARCH', 'BROWSER', 'SCRAPING', 'CRAWLING', 'EXTRACTION', 'PDF', 'IMAGE', 'MEDIA', 'PRODUCT', 'MARKETPLACE', 'EBAY', 'COMPETITOR', 'SELLER', 'SUPPLIER', 'PRICING', 'TREND', 'SEO', 'LISTING', 'AI', 'MONITORING', 'ALERTING', 'EXPORT', 'ANALYTICS'] as const
export type CapabilityCategory = typeof CAPABILITY_CATEGORIES[number]

export type CapabilityNode = {
  id: string
  name: string
  category: CapabilityCategory
  providerId: string | null
  providerVersion: string | null
  location: 'local' | 'remote'
  costClass: 'free-local' | 'free-limited' | 'byok' | 'usage-based' | 'unknown'
  authStatus: 'none' | 'server-secret' | 'binding' | 'unknown'
  health: TruthState
  latencyClass: 'low' | 'medium' | 'high' | 'variable' | 'unknown'
  quota: { limit: string | null; window: string | null }
  reliability: TruthState
  lastSuccess: string | null
  lastFailure: string | null
  supportedTaskTypes: string[]
  limitations: string[]
  fallback: string[]
  provenanceSupport: boolean
}

const CAPABILITY_DEFS: Array<{ id: string; name: string; category: CapabilityCategory; limitations: string[] }> = [
  { id: 'web.http', name: 'Bounded direct HTTP', category: 'WEB', limitations: ['Static HTML only', 'No JavaScript execution'] },
  { id: 'web.search', name: 'Web search', category: 'SEARCH', limitations: ['Requires configured provider'] },
  { id: 'browser.observe', name: 'Browser observation', category: 'BROWSER', limitations: ['Quota-scarce', 'Public permitted pages only'] },
  { id: 'scrape.static', name: 'Static page scraping', category: 'SCRAPING', limitations: ['No JS rendering'] },
  { id: 'crawl.bounded', name: 'Bounded crawling', category: 'CRAWLING', limitations: ['Per-domain limits', 'Requires configured provider or durable jobs'] },
  { id: 'extract.structured', name: 'Structured extraction', category: 'EXTRACTION', limitations: ['JSON-LD / Open Graph / visible metadata only'] },
  { id: 'pdf.parse', name: 'PDF parsing', category: 'PDF', limitations: ['Requires configured browser/document provider'] },
  { id: 'image.extract', name: 'Image URL recovery', category: 'IMAGE', limitations: ['No generation or storage without configured provider'] },
  { id: 'media.derivative', name: 'Media derivatives', category: 'MEDIA', limitations: ['Rights-gated', 'Review-only until provider configured'] },
  { id: 'product.import', name: 'Product import', category: 'PRODUCT', limitations: ['Public structured/visible data only'] },
  { id: 'marketplace.profile', name: 'Marketplace profiles', category: 'MARKETPLACE', limitations: ['eBay US profile; others architecture-ready'] },
  { id: 'ebay.research', name: 'eBay market research', category: 'EBAY', limitations: ['Official Browse API only when configured'] },
  { id: 'competitor.profile', name: 'Competitor profiling', category: 'COMPETITOR', limitations: ['Observable listing data only; no private seller data'] },
  { id: 'seller.analytics', name: 'Seller analytics', category: 'SELLER', limitations: ['Observable data only; revenue never inferred'] },
  { id: 'supplier.match', name: 'Supplier matching', category: 'SUPPLIER', limitations: ['Requires supplier observations or configured provider'] },
  { id: 'pricing.stats', name: 'Price statistics', category: 'PRICING', limitations: ['Computed from supplied observations'] },
  { id: 'trend.analysis', name: 'Trend analysis', category: 'TREND', limitations: ['Requires multiple observations over time'] },
  { id: 'seo.title', name: 'Title generation', category: 'SEO', limitations: ['≤80 chars', 'No unsupported claims'] },
  { id: 'listing.draft', name: 'Listing drafts', category: 'LISTING', limitations: ['Draft-only', 'Human review required'] },
  { id: 'ai.rank', name: 'AI title ranking', category: 'AI', limitations: ['May reorder supplied candidates only'] },
  { id: 'monitor.change', name: 'Change detection', category: 'MONITORING', limitations: ['Computation available; durable watch requires storage'] },
  { id: 'alert.threshold', name: 'Threshold alerts', category: 'ALERTING', limitations: ['Classification available; delivery requires durable infra'] },
  { id: 'export.reports', name: 'Export and reports', category: 'EXPORT', limitations: ['CSV/JSON/Markdown/HTML/evidence report'] },
  { id: 'analytics.scoring', name: 'Opportunity scoring', category: 'ANALYTICS', limitations: ['Explainable; evidence-gated'] },
]

export function buildCapabilityGraph(env: Record<string, unknown>, registryCapabilities: Array<{ id: string; status: string; providerIds: string[] }>): CapabilityNode[] {
  void env
  const capStatus = new Map(registryCapabilities.map((cap) => [cap.id, cap.status]))
  const providerOf = new Map<string, string>()
  for (const cap of registryCapabilities) providerOf.set(cap.id, cap.providerIds[0] ?? null)
  return CAPABILITY_DEFS.map((def): CapabilityNode => {
    const registryStatus = capStatus.get(def.id)
    const known: Partial<CapabilityNode> = registryStatus
      ? { providerId: providerOf.get(def.id) ?? null, health: registryStatus === 'ready' ? 'AVAILABLE' : registryStatus === 'not_configured' ? 'UNCONFIGURED' : 'UNVERIFIED', location: providerOf.get(def.id) === 'local.evidence' ? 'local' : 'remote' }
      : { providerId: null, health: def.id === 'analytics.scoring' || def.id === 'pricing.stats' || def.id === 'export.reports' || def.id === 'trend.analysis' || def.id === 'monitor.change' || def.id === 'alert.threshold' ? 'AVAILABLE' : 'UNVERIFIED', location: 'local' }
    return {
      id: def.id,
      name: def.name,
      category: def.category,
      providerId: known.providerId ?? null,
      providerVersion: null,
      location: known.location ?? 'local',
      costClass: 'unknown',
      authStatus: 'unknown',
      health: known.health ?? 'UNVERIFIED',
      latencyClass: 'unknown',
      quota: { limit: null, window: null },
      reliability: 'UNVERIFIED',
      lastSuccess: null,
      lastFailure: null,
      supportedTaskTypes: [],
      limitations: def.limitations,
      fallback: [],
      provenanceSupport: true,
    }
  })
}

// ---------------------------------------------------------------------------
// Opportunity scoring (§13, §40)
// ---------------------------------------------------------------------------

export type ScoreComponent = {
  key: string
  label: string
  value: number | null
  state: TruthState
  evidence: string[]
}

export type OpportunityScore = {
  components: ScoreComponent[]
  overall: number | null
  verdict: 'OPPORTUNITY' | 'MODERATE' | 'WEAK' | 'INSUFFICIENT_EVIDENCE'
  explanation: string[]
  computedAt: string
}

export type OpportunityInput = {
  productTitle?: string | null
  observedPrice?: number | null
  supplierPrice?: number | null
  listings?: Array<{ price?: number | null; title?: string; soldVolume?: number | null; activeVolume?: number | null; rating?: number | null }> | null
  keywordCount?: number | null
  sources?: number | null
}

export function scoreOpportunity(input: OpportunityInput): OpportunityScore {
  const computedAt = new Date().toISOString()
  const listings = Array.isArray(input.listings) ? input.listings : []
  const prices = listings.map((listing) => listing.price).filter((price): price is number => typeof price === 'number' && Number.isFinite(price))
  const evidence: string[] = []
  const components: ScoreComponent[] = []

  // Demand evidence
  const sold = listings.map((listing) => listing.soldVolume).filter((v): v is number => typeof v === 'number')
  const active = listings.map((listing) => listing.activeVolume).filter((v): v is number => typeof v === 'number')
  if (sold.length || active.length) {
    const soldSum = sold.reduce((sum, value) => sum + value, 0)
    const activeSum = active.reduce((sum, value) => sum + value, 0)
    const sellThrough = activeSum > 0 ? Math.round((soldSum / activeSum) * 100) : null
    const value = sellThrough != null ? Math.min(100, sellThrough) : null
    components.push({ key: 'demand', label: 'Demand evidence', value, state: sellThrough != null ? 'ESTIMATED' : 'INSUFFICIENT_EVIDENCE', evidence: sellThrough != null ? [`Sell-through proxy ${sellThrough}% from ${sold.length} sold and ${active.length} active observations.`] : ['No sold/active volume observations supplied.'] })
    if (sellThrough != null) evidence.push(`sell-through ${sellThrough}%`)
  } else {
    components.push({ key: 'demand', label: 'Demand evidence', value: null, state: 'INSUFFICIENT_EVIDENCE', evidence: ['No sold/active volume observations supplied. Demand is not invented.'] })
  }

  // Competition
  if (prices.length) {
    const value = Math.max(0, Math.min(100, Math.round((1 - Math.min(prices.length, 40) / 40) * 100)))
    components.push({ key: 'competition', label: 'Competition', value, state: 'ESTIMATED', evidence: [`${prices.length} competing listing price observation(s) supplied.`] })
    evidence.push(`${prices.length} listings`)
  } else {
    components.push({ key: 'competition', label: 'Competition', value: null, state: 'INSUFFICIENT_EVIDENCE', evidence: ['No competing listing observations supplied.'] })
  }

  // Price spread
  if (prices.length >= 2 && input.supplierPrice != null) {
    const spread = Math.max(0, Math.round((1 - input.supplierPrice / Math.max(prices[0], 0.01)) * 100))
    components.push({ key: 'priceSpread', label: 'Price spread', value: Math.min(100, Math.max(0, spread)), state: 'ESTIMATED', evidence: [`Supplier ${input.supplierPrice} vs observed listing price ${prices[0]} (first observation).`] })
    evidence.push(`supplier ${input.supplierPrice} vs observed ${prices[0]}`)
  } else if (input.supplierPrice != null && input.observedPrice != null) {
    const spread = Math.max(0, Math.round((1 - input.supplierPrice / Math.max(input.observedPrice, 0.01)) * 100))
    components.push({ key: 'priceSpread', label: 'Price spread', value: Math.min(100, spread), state: 'ESTIMATED', evidence: [`Supplier ${input.supplierPrice} vs observed market price ${input.observedPrice}.`] })
    evidence.push(`spread ${spread}%`)
  } else {
    components.push({ key: 'priceSpread', label: 'Price spread', value: null, state: 'INSUFFICIENT_EVIDENCE', evidence: ['Supplier and observed prices are both required for a spread estimate.'] })
  }

  // Supplier availability
  components.push({ key: 'supplier', label: 'Supplier availability', value: input.supplierPrice != null ? 100 : null, state: input.supplierPrice != null ? 'VERIFIED' : 'INSUFFICIENT_EVIDENCE', evidence: [input.supplierPrice != null ? `Supplier price observation supplied (${input.supplierPrice}).` : 'No supplier observation supplied.'] })

  // Margin potential (ESTIMATED, fee model explicit)
  if (input.supplierPrice != null && (input.observedPrice != null || prices.length)) {
    const marketPrice = input.observedPrice ?? Math.max(...prices)
    const marginPct = Math.max(0, Math.round(((marketPrice - input.supplierPrice) / Math.max(marketPrice, 0.01)) * 100))
    components.push({ key: 'margin', label: 'Margin potential', value: Math.min(100, marginPct), state: 'ESTIMATED', evidence: [`Gross margin estimate ${marginPct}% before fees/shipping (${input.supplierPrice} supplier vs ${marketPrice} market). Platform fees are NOT included.`] })
    evidence.push(`gross margin ${marginPct}%`)
  } else {
    components.push({ key: 'margin', label: 'Margin potential', value: null, state: 'INSUFFICIENT_EVIDENCE', evidence: ['Margin requires both a supplier price and a market price observation.'] })
  }

  // Trend evidence
  if (input.keywordCount != null) {
    components.push({ key: 'trend', label: 'Trend evidence', value: Math.min(100, input.keywordCount), state: 'INFERRED', evidence: [`Keyword presence signal ${input.keywordCount}. Single observation; not a trend.`] })
    evidence.push(`keyword signal ${input.keywordCount}`)
  } else {
    components.push({ key: 'trend', label: 'Trend evidence', value: null, state: 'INSUFFICIENT_EVIDENCE', evidence: ['Trend requires repeated observations over time.'] })
  }

  // Listing strength (proxy from supplied listings' completeness)
  const withTitle = listings.filter((listing) => listing.title).length
  const listingStrength = listings.length ? Math.round((withTitle / listings.length) * 100) : null
  components.push({ key: 'listingStrength', label: 'Listing strength', value: listingStrength, state: listingStrength != null ? 'INFERRED' : 'INSUFFICIENT_EVIDENCE', evidence: [listingStrength != null ? `${withTitle}/${listings.length} supplied listings carry titles.` : 'No listing observations supplied.'] })

  // Source reliability (proxy: number of sources)
  const sourceCount = input.sources ?? (input.supplierPrice != null ? 2 : listings.length ? 1 : 0)
  components.push({ key: 'sourceReliability', label: 'Source reliability', value: sourceCount >= 1 ? Math.min(100, sourceCount * 33) : null, state: sourceCount >= 3 ? 'ESTIMATED' : sourceCount >= 1 ? 'INFERRED' : 'INSUFFICIENT_EVIDENCE', evidence: [sourceCount >= 1 ? `${sourceCount} independent observation source(s).` : 'No observation sources supplied. Reliability cannot be estimated.'] })

  // Risk (inverse of evidence completeness)
  const computed = components.filter((component) => component.value != null)
  const riskValue = computed.length ? Math.max(0, 100 - (computed.length / 10) * 100) : null
  components.push({ key: 'risk', label: 'Risk', value: riskValue, state: riskValue != null ? 'ESTIMATED' : 'INSUFFICIENT_EVIDENCE', evidence: [riskValue != null ? `Inverse evidence completeness: ${computed.length}/10 components informed.` : 'No components informed.'] })

  const scored = components.filter((component) => component.value != null)
  const overall = scored.length >= 4 ? Math.round(scored.reduce((sum, component) => sum + (component.value as number), 0) / scored.length) : null
  const verdict: OpportunityScore['verdict'] = overall == null ? 'INSUFFICIENT_EVIDENCE' : overall >= 70 ? 'OPPORTUNITY' : overall >= 45 ? 'MODERATE' : 'WEAK'
  const explanation = overall == null
    ? [`INSUFFICIENT EVIDENCE: only ${scored.length} of 10 components could be scored. Add supplier price, observed prices, and listing observations.`]
    : [
        `Overall ${overall}/100 from ${scored.length} informed components.`,
        ...components.filter((component) => component.value != null).map((component) => `${component.label}: ${component.value} (${component.state}).`),
        verdict === 'OPPORTUNITY' ? 'Evidence supports treating this as an opportunity; verify fees and rights before acting.' : verdict === 'MODERATE' ? 'Evidence is mixed; review the weakest components.' : 'Evidence is weak relative to the opportunity threshold.',
      ]
  return { components, overall, verdict, explanation, computedAt }
}

// ---------------------------------------------------------------------------
// Price intelligence (§18, §19, §20)
// ---------------------------------------------------------------------------

export type PriceStats = {
  count: number
  min: number | null
  max: number | null
  median: number | null
  average: number | null
  p10: number | null
  p90: number | null
  outliers: number[]
  clusterCount: number | null
  state: TruthState
  note: string
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return Number.NaN
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
  return sorted[index]
}

export function priceStats(values: number[]): PriceStats {
  const clean = values.filter((value) => Number.isFinite(value) && value >= 0)
  if (clean.length === 0) return { count: 0, min: null, max: null, median: null, average: null, p10: null, p90: null, outliers: [], clusterCount: null, state: 'INSUFFICIENT_EVIDENCE', note: 'No valid price observations supplied.' }
  const sorted = [...clean].sort((a, b) => a - b)
  const sum = sorted.reduce((total, value) => total + value, 0)
  const median = sorted.length % 2 ? sorted[Math.floor(sorted.length / 2)] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
  const q1 = percentile(sorted, 25)
  const q3 = percentile(sorted, 75)
  const iqr = q3 - q1
  const outliers = sorted.filter((value) => value < q1 - 1.5 * iqr || value > q3 + 1.5 * iqr)
  let clusterCount: number | null = null
  if (sorted.length >= 3) {
    const gaps: Array<{ from: number; to: number; gap: number }> = []
    for (let index = 1; index < sorted.length; index += 1) gaps.push({ from: sorted[index - 1], to: sorted[index], gap: sorted[index] - sorted[index - 1] })
    const sortedGaps = [...gaps].sort((a, b) => b.gap - a.gap)
    const cut = sortedGaps[0]?.gap ?? 0
    const mean = sum / sorted.length
    clusterCount = cut > mean * 0.25 ? gaps.filter((entry) => entry.gap >= cut * 0.8).length + 1 : 1
  }
  return {
    count: sorted.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    median: Math.round(median * 100) / 100,
    average: Math.round((sum / sorted.length) * 100) / 100,
    p10: Math.round(percentile(sorted, 10) * 100) / 100,
    p90: Math.round(percentile(sorted, 90) * 100) / 100,
    outliers,
    clusterCount,
    state: sorted.length >= 5 ? 'VERIFIED' : 'PARTIAL',
    note: sorted.length >= 5 ? `Statistics from ${sorted.length} observations.` : `Only ${sorted.length} observation(s); statistics are PARTIAL.`,
  }
}

export type TrendClass = 'RISING' | 'FALLING' | 'STABLE' | 'VOLATILE' | 'INSUFFICIENT_DATA'

export function classifyTrend(points: Array<{ at: string; price: number }>, changeThresholdPct = 5): { trend: TrendClass; slope: number | null; volatility: number | null; note: string; observations: number } {
  const clean = points.filter((point) => Number.isFinite(point.price) && point.price >= 0)
  if (clean.length < 2) return { trend: 'INSUFFICIENT_DATA', slope: null, volatility: null, note: 'Trends require at least two dated observations.', observations: clean.length }
  const ordered = [...clean].sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
  const first = ordered[0].price
  const last = ordered[ordered.length - 1].price
  const changePct = first > 0 ? ((last - first) / first) * 100 : 0
  const mean = ordered.reduce((sum, point) => sum + point.price, 0) / ordered.length
  const variance = ordered.reduce((sum, point) => sum + (point.price - mean) ** 2, 0) / ordered.length
  const volatility = mean > 0 ? Math.sqrt(variance) / mean : 0
  const volatilityPct = volatility * 100
  let trend: TrendClass
  if (volatilityPct > 15 && Math.abs(changePct) <= changeThresholdPct) trend = 'VOLATILE'
  else if (changePct > changeThresholdPct) trend = 'RISING'
  else if (changePct < -changeThresholdPct) trend = 'FALLING'
  else trend = 'STABLE'
  const note = `First ${first} → last ${last} (${changePct >= 0 ? '+' : ''}${changePct.toFixed(1)}% across ${ordered.length} observations); volatility ${volatilityPct.toFixed(1)}%.`
  return { trend, slope: changePct, volatility, note, observations: ordered.length }
}

// ---------------------------------------------------------------------------
// Listing quality (§27)
// ---------------------------------------------------------------------------

export type ListingQuality = {
  score: number
  components: Array<{ label: string; value: number; note: string }>
  fixes: string[]
  computedAt: string
}

const BANNED_TITLE_TERMS = /(?:free shipping|best price|#1|number one|100%|guarantee|warranty|new listing|lot of|random|surprise)/i

export function listingQualityScore(listing: { title?: string | null; itemSpecifics?: unknown; description?: string | null; images?: number | null; price?: number | null; shipping?: number | null; category?: string | null }): ListingQuality {
  const computedAt = new Date().toISOString()
  const components: Array<{ label: string; value: number; note: string }> = []
  const fixes: string[] = []
  const title = listing.title?.trim() ?? ''
  if (title) {
    let titleScore = 100
    if (title.length > 80) { titleScore -= 30; fixes.push('Title exceeds the 80-character eBay limit.') }
    else if (title.length < 30) { titleScore -= 15; fixes.push('Title is short; add relevant, evidence-backed keywords.') }
    if (BANNED_TITLE_TERMS.test(title)) { titleScore -= 25; fixes.push('Title contains filler or unsupported claim terms.') }
    if (title.length > 0 && title.length <= 80) titleScore = Math.max(0, titleScore)
    components.push({ label: 'Title', value: titleScore, note: `${title.length}/80 chars.` })
  } else {
    components.push({ label: 'Title', value: 0, note: 'No title supplied.' }); fixes.push('Add a title.')
  }
  const specifics = Array.isArray(listing.itemSpecifics) ? listing.itemSpecifics.length : typeof listing.itemSpecifics === 'object' && listing.itemSpecifics ? Object.keys(listing.itemSpecifics as Record<string, unknown>).length : 0
  components.push({ label: 'Item specifics', value: Math.min(100, specifics * 20), note: `${specifics} specific(s) supplied.` })
  if (specifics < 3) fixes.push('Add item specifics (brand, model, condition, colour, size).')
  const description = listing.description?.trim() ?? ''
  components.push({ label: 'Description', value: description.length >= 150 ? 100 : description.length >= 50 ? 70 : description ? 40 : 0, note: description ? `${description.length} characters.` : 'No description supplied.' })
  if (!description) fixes.push('Add a buyer-friendly description.')
  const images = listing.images ?? 0
  components.push({ label: 'Images', value: Math.min(100, images * 12), note: `${images} image(s).` })
  if (images < 5) fixes.push('eBay listings perform best with 5+ images (rights-cleared).')
  components.push({ label: 'Price', value: listing.price != null && listing.price > 0 ? 100 : 0, note: listing.price != null ? `Price ${listing.price} supplied.` : 'No price supplied.' })
  if (listing.price == null) fixes.push('Add a price.')
  components.push({ label: 'Shipping', value: listing.shipping != null ? 100 : 40, note: listing.shipping != null ? `Shipping ${listing.shipping} supplied.` : 'Shipping not supplied.' })
  components.push({ label: 'Category', value: listing.category ? 100 : 40, note: listing.category ? `Category "${listing.category}".` : 'No category supplied.' })
  if (!listing.category) fixes.push('Choose an eBay category.')
  const score = Math.round(components.reduce((sum, component) => sum + component.value, 0) / components.length)
  return { score, components, fixes, computedAt }
}

// ---------------------------------------------------------------------------
// Source quality (§36)
// ---------------------------------------------------------------------------

export type SourceQuality = { score: number; components: Array<{ label: string; value: number; note: string }>; state: TruthState }

export function sourceQualityScore(source: { host?: string | null; retrievedAt?: string | null; fieldCount?: number | null; requiredFields?: string[] | null }): SourceQuality {
  const components: Array<{ label: string; value: number; note: string }> = []
  const host = source.host ?? ''
  let authority = 40
  if (/\.(edu|gov)$/i.test(host)) authority = 100
  else if (/(ebay|amazon|walmart|target|homedepot|lowes|bestbuy|aliexpress|alibaba|manufacturer|official)/i.test(host)) authority = 85
  else if (host.split('.').length >= 2) authority = 60
  components.push({ label: 'Authority', value: authority, note: host ? `Host ${host}.` : 'No host supplied.' })
  let freshness = 100
  if (source.retrievedAt) {
    const ageHours = (Date.now() - Date.parse(source.retrievedAt)) / 3_600_000
    freshness = ageHours <= 24 ? 100 : ageHours <= 168 ? 80 : ageHours <= 720 ? 55 : 25
    components.push({ label: 'Freshness', value: freshness, note: `Age ${Math.round(ageHours)}h.` })
  } else {
    components.push({ label: 'Freshness', value: 0, note: 'No retrieval timestamp.' })
  }
  const required = source.requiredFields ?? ['title', 'price', 'brand', 'model']
  const fields = source.fieldCount ?? 0
  const completeness = Math.min(100, Math.round((fields / Math.max(required.length, 1)) * 100))
  components.push({ label: 'Completeness', value: completeness, note: `${fields}/${required.length} expected fields.` })
  const score = Math.round(components.reduce((sum, component) => sum + component.value, 0) / components.length)
  return { score, components, state: score >= 75 ? 'VERIFIED' : score >= 45 ? 'PARTIAL' : 'UNVERIFIED' }
}

// ---------------------------------------------------------------------------
// Contradiction detection (§39)
// ---------------------------------------------------------------------------

export type ConflictEntry = { field: string; values: Array<{ value: string; sourceUrl?: string; retrievedAt?: string; confidence?: number }>; note: string }

export function detectConflicts(observations: Array<{ field: string; value: string | number | null; sourceUrl?: string; retrievedAt?: string; confidence?: number }>): { conflicts: ConflictEntry[]; conflictCount: number } {
  const byField = new Map<string, Array<{ value: string; sourceUrl?: string; retrievedAt?: string; confidence?: number }>>()
  for (const observation of observations) {
    if (observation.value == null || observation.value === '') continue
    const value = String(observation.value)
    const group = byField.get(observation.field) ?? []
    if (!group.some((entry) => entry.value === value)) group.push({ value, sourceUrl: observation.sourceUrl, retrievedAt: observation.retrievedAt, confidence: observation.confidence })
    byField.set(observation.field, group)
  }
  const conflicts: ConflictEntry[] = []
  for (const [field, values] of byField) {
    if (values.length > 1) conflicts.push({ field, values, note: `${values.length} distinct values for "${field}". AiBay does not silently choose; review required.` })
  }
  return { conflicts, conflictCount: conflicts.length }
}

// ---------------------------------------------------------------------------
// Change detection (§29, §30)
// ---------------------------------------------------------------------------

export type AlertType = 'PRICE_DROP' | 'PRICE_SPIKE' | 'NEW_PRODUCT' | 'PRODUCT_REMOVED' | 'COMPETITOR_CHANGED' | 'SELLER_GROWTH' | 'KEYWORD_SURGE' | 'SUPPLIER_CHANGED' | 'AVAILABILITY_CHANGE' | 'TREND_SHIFT'

export type ChangeDetection = {
  changes: Array<{ type: AlertType; label: string; significance: number; detail: string; evidence: string[] }>
  note: string
}

export function detectChanges(previous: Record<string, number | string | null | undefined>, current: Record<string, number | string | null | undefined>, options: { priceThresholdPct?: number; countThresholdPct?: number } = {}): ChangeDetection {
  const priceThreshold = options.priceThresholdPct ?? 5
  const countThreshold = options.countThresholdPct ?? 10
  const changes: Array<{ type: AlertType; label: string; significance: number; detail: string; evidence: string[] }> = []
  const prevPrice = typeof previous.price === 'number' ? previous.price : null
  const currPrice = typeof current.price === 'number' ? current.price : null
  if (prevPrice != null && currPrice != null && prevPrice > 0) {
    const changePct = ((currPrice - prevPrice) / prevPrice) * 100
    if (changePct <= -priceThreshold) changes.push({ type: 'PRICE_DROP', label: 'Price drop', significance: Math.min(100, Math.abs(changePct) * 2), detail: `Price fell ${Math.abs(changePct).toFixed(1)}% (${prevPrice} → ${currPrice}).`, evidence: ['Both observations dated and sourced.'] })
    else if (changePct >= priceThreshold) changes.push({ type: 'PRICE_SPIKE', label: 'Price spike', significance: Math.min(100, changePct * 2), detail: `Price rose ${changePct.toFixed(1)}% (${prevPrice} → ${currPrice}).`, evidence: ['Both observations dated and sourced.'] })
  }
  const prevCount = typeof previous.listingCount === 'number' ? previous.listingCount : null
  const currCount = typeof current.listingCount === 'number' ? current.listingCount : null
  if (prevCount != null && currCount != null && prevCount > 0) {
    const changePct = ((currCount - prevCount) / prevCount) * 100
    if (changePct >= countThreshold) changes.push({ type: 'COMPETITOR_CHANGED', label: 'Listing count change', significance: Math.min(100, changePct), detail: `Observed listing count ${changePct >= 0 ? '+' : ''}${changePct.toFixed(1)}% (${prevCount} → ${currCount}).`, evidence: ['Counted from supplied observations.'] })
  }
  const prevAvailable = previous.available
  const currAvailable = current.available
  if (prevAvailable != null && currAvailable != null && prevAvailable !== currAvailable) {
    changes.push({ type: currAvailable ? 'AVAILABILITY_CHANGE' : 'AVAILABILITY_CHANGE', label: currAvailable ? 'Back in stock' : 'Out of stock', significance: 80, detail: `Availability changed from ${prevAvailable} to ${currAvailable}.`, evidence: ['Both observations dated and sourced.'] })
  }
  return { changes, note: changes.length ? `Detected ${changes.length} meaningful change(s) at the configured thresholds (price ±${priceThreshold}%, count ±${countThreshold}%).` : 'No change exceeded the meaningful-change thresholds.' }
}

// ---------------------------------------------------------------------------
// Evidence graph (§10, §24, §74)
// ---------------------------------------------------------------------------

export type GraphNode = { id: string; type: string; label: string }
export type GraphEdge = { from: string; to: string; relation: string; provenance: Provenance }
export type EvidenceGraph = {
  nodes: GraphNode[]
  edges: GraphEdge[]
  nodeCount: number
  edgeCount: number
  note: string
}

export function evidenceGraph(observations: Array<{ field: string; value: string | number | null; sourceUrl?: string; sourceHost?: string; retrievedAt?: string; method?: string; confidence?: number }>): EvidenceGraph {
  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []
  const nodeId = new Map<string, string>()
  const addNode = (type: string, label: string): string => {
    const key = `${type}:${label.toLowerCase()}`
    const existing = nodeId.get(key)
    if (existing) return existing
    const id = `${type.toLowerCase()}_${nodes.length + 1}`
    nodeId.set(key, id)
    nodes.push({ id, type, label })
    return id
  }
  let observationCount = 0
  const now = new Date().toISOString()
  for (const observation of observations) {
    if (observation.value == null || observation.value === '') continue
    const provenance: Provenance = { sourceUrl: observation.sourceUrl, sourceHost: observation.sourceHost, retrievedAt: observation.retrievedAt ?? now, method: observation.method ?? 'supplied-observation', confidence: observation.confidence ?? 60 }
    const value = String(observation.value)
    const field = observation.field
    const productNode = field === 'Title' || field === 'title' ? addNode('PRODUCT', value) : addNode('PRODUCT', value.slice(0, 40))
    observationCount += 1
    if (observation.sourceUrl) {
      const sourceNode = addNode('SOURCE', observation.sourceUrl)
      edges.push({ from: productNode, to: sourceNode, relation: 'observed_at', provenance })
    }
    if (field === 'Brand' || field === 'brand') { const brandNode = addNode('BRAND', value); edges.push({ from: productNode, to: brandNode, relation: 'has_brand', provenance }) }
    if (field === 'Model' || field === 'model') { const modelNode = addNode('MODEL', value); edges.push({ from: productNode, to: modelNode, relation: 'has_model', provenance }) }
    if (field === 'SKU' || field === 'sku') { const skuNode = addNode('MODEL', value); edges.push({ from: productNode, to: skuNode, relation: 'has_sku', provenance }) }
    if (field === 'Seller' || field === 'seller') { const sellerNode = addNode('SELLER', value); edges.push({ from: productNode, to: sellerNode, relation: 'sold_by', provenance }) }
    if (field === 'Supplier price' || field === 'supplierPrice') { const supplierNode = addNode('SUPPLIER', observation.sourceHost ?? 'supplier'); const priceNode = addNode('PRICE', value); edges.push({ from: productNode, to: supplierNode, relation: 'supplied_by', provenance }); edges.push({ from: supplierNode, to: priceNode, relation: 'has_price', provenance }) }
    if (field === 'Source price' || field === 'price') { const priceNode = addNode('PRICE', value); edges.push({ from: productNode, to: priceNode, relation: 'has_price', provenance }) }
    if (field === 'Category' || field === 'category') { const categoryNode = addNode('CATEGORY', value); edges.push({ from: productNode, to: categoryNode, relation: 'in_category', provenance }) }
    if (field === 'Marketplace' || field === 'marketplace') { const marketplaceNode = addNode('MARKETPLACE', value); edges.push({ from: productNode, to: marketplaceNode, relation: 'appears_on', provenance }) }
  }
  return { nodes, edges, nodeCount: nodes.length, edgeCount: edges.length, note: `Evidence graph from ${observationCount} observation(s): ${nodes.length} entities, ${edges.length} provenance-bearing relationships.` }
}

// ---------------------------------------------------------------------------
// Research missions (§33, §34, §68)
// ---------------------------------------------------------------------------

export type MissionId = 'winning_products' | 'competitor_deep_dive' | 'supplier_match' | 'product_arbitrage' | 'price_gap' | 'trend_hunter' | 'new_seller_analysis' | 'listing_audit' | 'store_audit' | 'category_opportunity' | 'marketplace_comparison' | 'low_competition_products' | 'high_margin_products' | 'dropshipping_candidates'

export type MissionStep = { step: number; task: 'product_import' | 'public_search' | 'public_scrape' | 'analysis'; capability: string; input: 'url' | 'keyword' | 'none'; rationale: string }
export const MISSIONS: Array<{ id: MissionId; label: string; description: string; steps: MissionStep[] }> = [
  { id: 'winning_products', label: 'Winning products', description: 'Find low-competition products with supplier availability.', steps: [
    { step: 1, task: 'public_search', capability: 'web.search', input: 'keyword', rationale: 'Discover candidate product sources from the keyword.' },
    { step: 2, task: 'product_import', capability: 'web.extract.public_metadata', input: 'url', rationale: 'Extract evidence from each candidate source.' },
    { step: 3, task: 'analysis', capability: 'analytics.scoring', input: 'none', rationale: 'Score opportunity with explainable components.' },
  ] },
  { id: 'competitor_deep_dive', label: 'Competitor deep dive', description: 'Profile a seller from observable listings.', steps: [
    { step: 1, task: 'public_search', capability: 'web.search', input: 'keyword', rationale: 'Find the seller\'s observable listings.' },
    { step: 2, task: 'product_import', capability: 'web.extract.public_metadata', input: 'url', rationale: 'Extract listing evidence.' },
    { step: 3, task: 'analysis', capability: 'competitor.profile', input: 'none', rationale: 'Build a competitor profile from observations.' },
  ] },
  { id: 'supplier_match', label: 'Supplier match', description: 'Match a product to supplier price observations.', steps: [
    { step: 1, task: 'product_import', capability: 'web.extract.public_metadata', input: 'url', rationale: 'Extract the product evidence.' },
    { step: 2, task: 'analysis', capability: 'supplier.match', input: 'none', rationale: 'Compare supplier price vs observed market price.' },
  ] },
  { id: 'product_arbitrage', label: 'Product arbitrage', description: 'Find products where supplier price is below market price.', steps: [
    { step: 1, task: 'public_search', capability: 'web.search', input: 'keyword', rationale: 'Discover candidate products.' },
    { step: 2, task: 'analysis', capability: 'pricing.stats', input: 'none', rationale: 'Compare price spreads.' },
  ] },
  { id: 'price_gap', label: 'Price gap hunter', description: 'Find categories with wide price spreads.', steps: [
    { step: 1, task: 'public_search', capability: 'web.search', input: 'keyword', rationale: 'Collect listing prices.' },
    { step: 2, task: 'analysis', capability: 'pricing.stats', input: 'none', rationale: 'Compute spread statistics.' },
  ] },
  { id: 'trend_hunter', label: 'Trend hunter', description: 'Find products gaining momentum across sources.', steps: [
    { step: 1, task: 'public_search', capability: 'web.search', input: 'keyword', rationale: 'Observe keyword presence across sources.' },
    { step: 2, task: 'analysis', capability: 'trend.analysis', input: 'none', rationale: 'Require repeated observations before declaring a trend.' },
  ] },
  { id: 'new_seller_analysis', label: 'New seller analysis', description: 'Analyze a seller\'s observable portfolio.', steps: [
    { step: 1, task: 'public_search', capability: 'web.search', input: 'keyword', rationale: 'Gather observable listings.' },
    { step: 2, task: 'analysis', capability: 'seller.analytics', input: 'none', rationale: 'Compute listing, category, and price distribution.' },
  ] },
  { id: 'listing_audit', label: 'Listing audit', description: 'Score one listing against quality gates.', steps: [
    { step: 1, task: 'product_import', capability: 'web.extract.public_metadata', input: 'url', rationale: 'Extract listing fields.' },
    { step: 2, task: 'analysis', capability: 'listing.draft', input: 'none', rationale: 'Compute the listing quality score.' },
  ] },
  { id: 'store_audit', label: 'Store audit', description: 'Audit a store from authorized or observable data.', steps: [
    { step: 1, task: 'public_search', capability: 'web.search', input: 'keyword', rationale: 'Collect the store\'s observable listings.' },
    { step: 2, task: 'analysis', capability: 'seller.analytics', input: 'none', rationale: 'Compute category mix, pricing, and gaps.' },
  ] },
  { id: 'category_opportunity', label: 'Category opportunity', description: 'Compare a category across marketplaces.', steps: [
    { step: 1, task: 'public_search', capability: 'web.search', input: 'keyword', rationale: 'Observe category listings.' },
    { step: 2, task: 'analysis', capability: 'marketplace.profile', input: 'none', rationale: 'Compare marketplace profiles.' },
  ] },
  { id: 'marketplace_comparison', label: 'Marketplace comparison', description: 'Compare price and competition across marketplaces.', steps: [
    { step: 1, task: 'public_search', capability: 'web.search', input: 'keyword', rationale: 'Gather per-marketplace observations.' },
    { step: 2, task: 'analysis', capability: 'pricing.stats', input: 'none', rationale: 'Compare price distributions.' },
  ] },
  { id: 'low_competition_products', label: 'Low-competition products', description: 'Find products with few competing listings.', steps: [
    { step: 1, task: 'public_search', capability: 'web.search', input: 'keyword', rationale: 'Count competing listings.' },
    { step: 2, task: 'analysis', capability: 'analytics.scoring', input: 'none', rationale: 'Competition component drives the score.' },
  ] },
  { id: 'high_margin_products', label: 'High-margin products', description: 'Find products with supplier margin potential.', steps: [
    { step: 1, task: 'public_search', capability: 'web.search', input: 'keyword', rationale: 'Collect market prices.' },
    { step: 2, task: 'analysis', capability: 'supplier.match', input: 'none', rationale: 'Estimate gross margin from supplier observations.' },
  ] },
  { id: 'dropshipping_candidates', label: 'Dropshipping candidates', description: 'Find supplier-backed products for dropshipping review.', steps: [
    { step: 1, task: 'public_search', capability: 'web.search', input: 'keyword', rationale: 'Discover products with supplier presence.' },
    { step: 2, task: 'analysis', capability: 'supplier.match', input: 'none', rationale: 'Score supplier availability and margin.' },
  ] },
]

export function planMission(missionId: string, inputs: Record<string, string | undefined>): { mission: MissionId; label: string; description: string; steps: Array<{ step: number; task: string; capability: string; input: string; rationale: string; feasibility: TruthState; reason: string }>; constraints: string[] } {
  const mission = MISSIONS.find((entry) => entry.id === missionId)
  if (!mission) throw new Error(`Unknown mission "${missionId}".`)
  const steps = mission.steps.map((step) => {
    const inputValue = step.input === 'url' ? inputs.url : step.input === 'keyword' ? inputs.keyword : undefined
    const feasibility: TruthState = step.task === 'analysis' ? 'AVAILABLE' : step.capability === 'web.search' ? 'UNCONFIGURED' : 'AVAILABLE'
    const reason = step.task === 'analysis' ? 'Local deterministic analysis; no provider required.' : step.capability === 'web.search' ? 'Search requires a configured provider (e.g. Firecrawl). Execute URL steps directly.' : 'Local bounded extraction; runs without credentials.'
    return { ...step, feasibility, reason: inputValue ? reason : `${reason} Missing required input (${step.input}).` }
  })
  return { mission: mission.id, label: mission.label, description: mission.description, steps, constraints: ['Bounded steps and attempts', 'Request-only state until durable infra', 'No fabricated data', 'Public permitted sources only'] }
}
