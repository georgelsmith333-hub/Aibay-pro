export type ListingEvidence = {
  label: string
  value: string
  state: 'verified' | 'derived' | 'needs_review' | 'unknown'
  source?: string
}

export type MarketObservation = {
  title: string
  price: number
  shipping?: number
  condition?: string
  matched?: 'direct' | 'comparable'
  seller?: string
  url?: string
  image?: string
  capturedAt?: string
  dataScope?: 'active_listing_observation' | 'sold_observation'
}

export type ListingMediaInput = {
  id: string
  alt?: string
  source?: string
  width?: number
  height?: number
  enhanced?: boolean
  derivativeStatus?: string
}

export type ListingInput = {
  productTitle: string
  description: string
  brand?: string
  model?: string
  gtin?: string
  currency?: string
  selectedVariant?: { label: string; sku?: string; attributes?: Record<string, string> }
  evidence: ListingEvidence[]
  market: MarketObservation[]
  media?: ListingMediaInput[]
  descriptionTargetWords?: number
}

export type ListingPackage = {
  source: 'deterministic' | 'ai_structured'
  titleCandidates: string[]
  description: string
  itemSpecifics: Array<{ label: string; value: string; state: ListingEvidence['state'] }>
  priceBand: { low: number | null; target: number | null; high: number | null; currency: string }
  strategy: string[]
  validation: Array<{ label: string; passed: boolean; note: string }>
  keywordOpportunities: Array<{ term: string; source: string; confidence: number }>
  imagePlan: Array<{ mediaId: string; role: string; reason: string; status: string }>
  bannerRecommendation: { mediaId: string | null; status: 'recommended' | 'needs_source' | 'review_only'; reason: string }
  descriptionWordCount: number
  descriptionTargetWords: number
  reviewRequired: true
  automaticPublishing: false
}

const fillerWords = new Set(['best', 'amazing', 'cheap', 'sale', 'wow', 'must', 'have', 'hot'])
const restrictedTerms = [/guaranteed/i, /cure/i, /authenticity guaranteed/i, /officially licensed/i, /#1/i, /best seller/i]

function clean(value: string) {
  return value.replace(/[|•]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function unique(values: string[]) { return [...new Set(values.filter(Boolean))] }

function titleFromTerms(parts: string[]) {
  const seen = new Set<string>()
  const words: string[] = []
  for (const part of parts) {
    for (const word of clean(part).split(' ')) {
      const key = word.toLowerCase()
      if (word && !seen.has(key)) {
        seen.add(key)
        words.push(word)
      }
    }
  }
  return capTitle(words.join(' '))
}

function capTitle(value: string) {
  const words = clean(value).split(' ')
  const accepted: string[] = []
  for (const word of words) {
    const next = [...accepted, word].join(' ')
    if (next.length > 70) break
    accepted.push(word)
  }
  return accepted.join(' ')
}

function factualEvidence(input: ListingInput) {
  return input.evidence.filter((field) => field.state === 'verified' || field.state === 'derived').filter((field) => field.value && !/^unknown$/i.test(field.value))
}

function keywordOpportunities(input: ListingInput) {
  const source = input.market.length ? 'Observed active listing titles and supplied product evidence' : 'Supplied product evidence only'
  const counts = new Map<string, number>()
  const values = [input.productTitle, input.brand, input.model, ...variantTokens(input), ...input.evidence.map((field) => field.value), ...input.market.map((item) => item.title)]
  for (const value of values) for (const token of clean(value || '').toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 2 && !fillerWords.has(word))) counts.set(token, (counts.get(token) || 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 18).map(([term, count]) => ({ term, source, confidence: Math.min(96, 55 + count * 8) }))
}

function mediaPlan(input: ListingInput) {
  const media = input.media || []
  const roles = ['Hero product image', 'Alternate product angle', 'Detail/evidence image', 'Variation image', 'Packaging/accessory image', 'Context image']
  return media.slice(0, 12).map((item, index) => ({ mediaId: item.id, role: roles[index] || 'Supporting gallery image', reason: index === 0 ? 'Lead with the clearest exact-product view.' : 'Use only if the image preserves and supports the supplied product evidence.', status: item.enhanced ? 'derivative_available' : item.derivativeStatus || 'source_review' }))
}

function valueFor(input: ListingInput, label: string) {
  return factualEvidence(input).find((field) => field.label.toLowerCase() === label.toLowerCase())?.value || ''
}

function variantTokens(input: ListingInput) {
  const variant = input.selectedVariant
  if (!variant) return []
  return unique([variant.label, ...Object.values(variant.attributes || {})].flatMap((value) => clean(value).split(/[,|/]/).map((item) => item.trim())))
}

function relevantTokens(input: ListingInput) {
  const candidates = [input.brand || valueFor(input, 'Brand'), input.model || valueFor(input, 'Model'), input.productTitle, ...variantTokens(input)]
  return unique(candidates.flatMap((value) => clean(value).split(' ')).filter((word) => word && word.length > 1 && !fillerWords.has(word.toLowerCase())))
}

export function validateTitle(title: string) {
  const issues: string[] = []
  if (!title.trim()) issues.push('Title is empty.')
  if (title.length > 80) issues.push(`Title is ${title.length} characters; eBay title maximum is 80.`)
  if (restrictedTerms.some((pattern) => pattern.test(title))) issues.push('Title includes a restricted or unsupported promotional claim.')
  const normalized = title.toLowerCase().split(/\s+/).filter(Boolean)
  if (normalized.some((word, index) => normalized.indexOf(word) !== index && normalized.filter((candidate) => candidate === word).length > 2)) issues.push('Title appears to repeat a keyword excessively.')
  return { passed: issues.length === 0, issues }
}

export function validatePackage(input: ListingInput, packageResult: ListingPackage) {
  const validation = packageResult.titleCandidates.map((title, index) => {
    const titleValidation = validateTitle(title)
    return { label: `Title candidate ${index + 1}`, passed: titleValidation.passed, note: titleValidation.passed ? `${title.length}/80 characters; relevance and repetition check passed.` : titleValidation.issues.join(' ') }
  })
  const unsupportedSpecifics = packageResult.itemSpecifics.filter((specific) => specific.state === 'unknown' || specific.state === 'needs_review')
  validation.push({ label: 'Evidence-backed claims', passed: true, note: 'Description generation is restricted to verified and derived source fields.' })
  validation.push({ label: 'Review fields', passed: unsupportedSpecifics.length === 0, note: unsupportedSpecifics.length ? `${unsupportedSpecifics.map((field) => field.label).join(', ')} require a human decision before export.` : 'No item-specific fields are marked for review.' })
  return validation
}

export function buildDeterministicListing(input: ListingInput): ListingPackage {
  const brand = input.brand || valueFor(input, 'Brand') || ''
  const model = input.model || valueFor(input, 'Model') || valueFor(input, 'MPN') || ''
  const titleSource = input.productTitle || [brand, model].filter(Boolean).join(' ')
  const variant = variantTokens(input)
  const tokens = relevantTokens(input)
  const base = titleFromTerms([brand, model, ...variant, ...tokens]) || capTitle(titleSource)
  const titleCandidates = unique([
    base,
    titleFromTerms([brand, model, ...variant, ...tokens.slice(0, 4)]),
    titleFromTerms([brand, ...variant, model, ...tokens.slice(0, 3)]),
  ]).filter((title) => validateTitle(title).passed).slice(0, 3)

  const sourceFacts = factualEvidence(input).filter((field) => !['Title', 'Source price', 'GTIN', 'SKU', 'MPN'].includes(field.label))
  const detailFacts = sourceFacts.slice(0, 20).map((field) => `• ${field.label}: ${field.value}`).join('\n')
  const selectedText = input.selectedVariant?.label ? `The selected variation is ${input.selectedVariant.label}.` : 'Confirm the selected variation before purchase.'
  const sourceDescription = clean(input.description || '')
  const description = [
    `${brand || 'Product'}${model ? ` ${model}` : ''}${input.productTitle ? ` — ${clean(input.productTitle)}` : ''}`.trim(),
    '',
    'Product overview',
    sourceDescription || 'Review the source evidence and gallery before adding unsupported product claims.',
    '',
    'Condition and selection',
    'Review source photos and product facts before purchase. Revise this draft if condition, included items, or selected variation differs from the source evidence.',
    selectedText,
    '',
    'Verified product details',
    detailFacts || 'No additional source-backed specifications were supplied.',
    '',
    'Gallery and package contents',
    'Use the gallery to confirm product identity, visible construction, included accessories, labels, and packaging. Only include accessories or packaging that are visibly confirmed in source evidence or entered by the seller.',
    '',
    'Buyer guidance',
    'Please use the selected variation, gallery, item specifics, and source-backed description to confirm suitability before ordering. If a requested fact is not shown in the evidence, it remains a review item rather than a claim.',
  ].join('\n')

  const directPrices = input.market.filter((item) => item.matched === 'direct').map((item) => item.price + (item.shipping || 0)).filter((value) => Number.isFinite(value) && value > 0)
  const observed = directPrices.length ? directPrices : input.market.map((item) => item.price + (item.shipping || 0)).filter((value) => Number.isFinite(value) && value > 0)
  const sorted = [...observed].sort((a, b) => a - b)
  const low = sorted.length ? sorted[0] : null
  const high = sorted.length ? sorted[sorted.length - 1] : null
  const target = sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)] : null
  const itemSpecifics = input.evidence.filter((field) => ['Brand', 'Model', 'MPN', 'GTIN', 'Style', 'Department', 'Upper material', 'Colour', 'US shoe size', 'Material'].includes(field.label)).map((field) => ({ label: field.label, value: field.value, state: field.state }))
  const packageResult: ListingPackage = {
    source: 'deterministic',
    titleCandidates: titleCandidates.length ? titleCandidates : [capTitle(titleSource)],
    description,
    itemSpecifics,
    priceBand: { low, target, high, currency: input.currency || 'USD' },
    strategy: [
      'Use the clearest verified product identity and selected variant in the title; avoid duplicate generic keywords.',
      'Complete all verified item specifics and leave unknown or conflicting fields for human review.',
      'Position against a fresh direct-match snapshot only after checking cost, shipping, returns, and required margin.',
      'Lead with an original or rights-cleared product image; include supporting views that substantiate listing claims.',
    ],
    validation: [],
    keywordOpportunities: keywordOpportunities(input),
    imagePlan: mediaPlan(input),
    bannerRecommendation: input.media?.length ? { mediaId: input.media[0]?.id || null, status: 'recommended', reason: 'Use the clearest exact-product source image as the hero/banner base; any design treatment remains reviewable.' } : { mediaId: null, status: 'needs_source', reason: 'Add a rights-cleared source image before creating an eBay hero/banner asset.' },
    descriptionWordCount: description.split(/\s+/).filter(Boolean).length,
    descriptionTargetWords: Math.min(1800, Math.max(250, input.descriptionTargetWords || 1800)),
    reviewRequired: true,
    automaticPublishing: false,
  }
  packageResult.validation = validatePackage(input, packageResult)
  return packageResult
}
