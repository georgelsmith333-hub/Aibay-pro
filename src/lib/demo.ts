import type { JobEvent, MarketSnapshot, OptimizationRun, ProductWorkspace, SourceDiagnostic } from '../types/aibay'

export const imageLibrary = {
  product: 'https://images.unsplash.com/photo-1612817288484-6f916006741a?auto=format&fit=crop&w=1200&q=85',
  detail: 'https://images.unsplash.com/photo-1585386959984-a4155224a1ad?auto=format&fit=crop&w=1200&q=85',
  lifestyle: 'https://images.unsplash.com/photo-1612817288484-6f916006741a?auto=format&fit=crop&w=1200&q=85',
  market1: 'https://images.unsplash.com/photo-1600185365483-26d7a4cc7519?auto=format&fit=crop&w=600&q=80',
  market2: 'https://images.unsplash.com/photo-1560343090-f0409e92791a?auto=format&fit=crop&w=600&q=80',
  market3: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=600&q=80',
}

export const demoWorkspace = (sourceUrl: string): ProductWorkspace => ({
  id: 'prd_athena_01',
  sourceUrl,
  canonicalUrl: sourceUrl,
  sourceHost: safeHost(sourceUrl),
  importedAt: new Date().toISOString(),
  title: 'AeroStep Trail Runner — Lightweight Knit Sneaker',
  brand: 'AeroStep',
  model: 'Trail Runner 02',
  gtin: '00850123456789',
  price: 84.0,
  currency: 'USD',
  description: 'Lightweight knit trail runner with a responsive foam midsole, grippy rubber outsole, and breathable upper. Source evidence includes selectable colour and size options.',
  completeness: 88,
  fields: [
    { label: 'Brand', value: 'AeroStep', state: 'verified', method: 'JSON-LD product.brand', source: 'Product page', confidence: 98 },
    { label: 'Model', value: 'Trail Runner 02', state: 'verified', method: 'Visible product title', source: 'Product page', confidence: 94 },
    { label: 'GTIN', value: '00850123456789', state: 'verified', method: 'Structured attribute', source: 'Product page', confidence: 99 },
    { label: 'Upper material', value: 'Knit textile', state: 'verified', method: 'Specification table', source: 'Product page', confidence: 93 },
    { label: 'Closure', value: 'Lace-up', state: 'derived', method: 'Normalized from feature copy', source: 'Product page', confidence: 87 },
    { label: 'Heel-to-toe drop', value: 'Unknown', state: 'unknown', method: 'No evidence found', source: '—', confidence: 0 },
  ],
  variants: [
    { id: 'v1', label: 'Black / US 9', sku: 'ATR02-BLK-09', price: 84, stock: 6, active: true, attributes: { Colour: 'Black', 'US shoe size': '9', Width: 'Standard' } },
    { id: 'v2', label: 'Black / US 10', sku: 'ATR02-BLK-10', price: 84, stock: 4, active: true, attributes: { Colour: 'Black', 'US shoe size': '10', Width: 'Standard' } },
    { id: 'v3', label: 'Sand / US 9', sku: 'ATR02-SND-09', price: 84, stock: 8, active: true, attributes: { Colour: 'Sand', 'US shoe size': '9', Width: 'Standard' } },
    { id: 'v4', label: 'Sand / US 10', sku: 'ATR02-SND-10', price: 84, stock: 2, active: true, attributes: { Colour: 'Sand', 'US shoe size': '10', Width: 'Standard' } },
  ],
  media: [
    { id: 'm1', url: imageLibrary.product, alt: 'AeroStep trail runner pair, source original', width: 1440, height: 1440, source: 'Product page' },
    { id: 'm2', url: imageLibrary.detail, alt: 'Trail runner upper detail, source original', width: 1440, height: 1440, source: 'Product page' },
    { id: 'm3', url: imageLibrary.lifestyle, alt: 'Trail runner alternate view, source original', width: 1440, height: 1440, source: 'Product page' },
  ],
  documents: [
    { name: 'Product specifications', type: 'Source structured data', status: 'Verified' },
    { name: 'Size chart', type: 'PDF / source document', status: 'Available for review' },
  ],
})

export const demoMarketSnapshot = (): MarketSnapshot => ({
  id: 'mkt_2026_01',
  query: 'AeroStep Trail Runner lightweight knit sneaker',
  capturedAt: new Date().toISOString(),
  marketplace: 'EBAY_US',
  currency: 'USD',
  resultCount: 42,
  directMatchCount: 9,
  commonTerms: ['lightweight', 'running', 'trail', 'knit', 'men’s', 'breathable'],
  itemSpecificGaps: ['US shoe size', 'Colour', 'Department', 'Style', 'Upper material'],
  listings: [
    { id: 'l1', title: 'AeroStep Trail Runner Knit Sneaker Black Mens Size 10', price: 79.99, shipping: 0, condition: 'New with box', image: imageLibrary.market1, seller: 'run-ready', feedback: 99.6, imageCount: 8, matched: 'direct', url: 'https://www.ebay.com/' },
    { id: 'l2', title: 'AeroStep Trail Running Shoes Lightweight Foam Size 9', price: 76.5, shipping: 7.99, condition: 'New without box', image: imageLibrary.market2, seller: 'outdoorstock', feedback: 98.9, imageCount: 5, matched: 'direct', url: 'https://www.ebay.com/' },
    { id: 'l3', title: 'Men’s Knit Trail Runner Athletic Sneaker Black Size 10', price: 68.0, shipping: 0, condition: 'New with box', image: imageLibrary.market3, seller: 'everyday-fit', feedback: 99.2, imageCount: 6, matched: 'comparable', url: 'https://www.ebay.com/' },
  ],
})

export const demoOptimization = (): OptimizationRun => ({
  id: 'opt_2026_01',
  createdAt: new Date().toISOString(),
  titleCandidates: [
    'AeroStep Trail Runner Knit Sneaker Black Mens US 10 Lightweight',
    'AeroStep Trail Runner 02 Mens Black Knit Running Shoes US 10',
    'AeroStep Mens Trail Runner Black Knit Lace Up Sneaker US 10 New',
  ],
  chosenTitle: 'AeroStep Trail Runner Knit Sneaker Black Mens US 10 Lightweight',
  description: `AeroStep Trail Runner 02 in Black, US men’s size 10. This lightweight lace-up sneaker features a breathable knit textile upper and a grippy rubber outsole designed for everyday trail and active use.\n\nCondition\nNew product. Please review the photos and selected variation before purchase.\n\nHighlights\n• Breathable knit textile upper\n• Lightweight foam midsole\n• Lace-up closure\n• Rubber outsole\n• Black colourway\n\nWhat is included\nOne pair of AeroStep Trail Runner 02 sneakers in the selected size and colour.\n\nSizing and variations\nChoose the exact size and colour from the available variation menu. If a size is not shown, it is not currently available.\n\nPlease use the product facts and gallery to confirm suitability before ordering.`,
  specifics: [
    { label: 'Brand', value: 'AeroStep', state: 'verified' },
    { label: 'Model', value: 'Trail Runner 02', state: 'verified' },
    { label: 'Department', value: 'Men', state: 'needs_review' },
    { label: 'Style', value: 'Sneaker', state: 'derived' },
    { label: 'Upper Material', value: 'Knit textile', state: 'verified' },
  ],
  priceBand: { low: 76, target: 82, high: 88, currency: 'USD' },
  strategy: [
    'Position the selected variation near the direct-match delivered-price median, then reassess after a fresh market snapshot.',
    'Use all verified item specifics, especially size, colour, upper material, department, and style.',
    'Lead the gallery with a square front-quarter product image; include outsole, label, and size-tag evidence next.',
    'Keep the title readable and specific rather than repeating generic running keywords.',
  ],
  policyChecks: [
    { label: 'Title length', passed: true, note: '68 / 80 characters' },
    { label: 'Evidence-backed claims', passed: true, note: 'All factual product claims map to source fields.' },
    { label: 'Competitor copying', passed: true, note: 'No competitor title or description is reproduced.' },
    { label: 'Fields requiring review', passed: false, note: 'Confirm Department before exporting the draft.' },
  ],
  mediaPlan: [
    { mediaId: 'm1', action: 'Primary image', reason: 'Clear product identity and strongest crop potential.' },
    { mediaId: 'm2', action: 'Detail image', reason: 'Supports knit upper and construction claims.' },
    { mediaId: 'm3', action: 'Gallery image', reason: 'Provides an additional angle without changing the product.' },
  ],
})

export const buildImportEvents = (): JobEvent[] => [
  { id: 'validate', label: 'Validate source URL', detail: 'Checking that this is a permitted public HTTP(S) product URL.', state: 'pending' },
  { id: 'extract', label: 'Recover public evidence', detail: 'Reading only public HTML, structured metadata, and visible product facts from this exact source.', state: 'pending' },
  { id: 'normalize', label: 'Build source-bound workspace', detail: 'Mapping recovered facts, variants, and media without guessing missing product details.', state: 'pending' },
  { id: 'review', label: 'Ready for evidence review', detail: 'The record is available for human review; market research is requested separately.', state: 'pending' },
]

export const buildOptimizationEvents = (): JobEvent[] => [
  { id: 'snapshot', label: 'Lock evidence snapshot', detail: 'Preserving selected product fields and market context.', state: 'pending' },
  { id: 'titles', label: 'Build title candidates', detail: 'Validating relevance and the 80-character marketplace limit.', state: 'pending' },
  { id: 'description', label: 'Create listing draft', detail: 'Writing a reviewable, evidence-backed description.', state: 'pending' },
  { id: 'media', label: 'Review media plan', detail: 'Ordering source images without altering product identity.', state: 'pending' },
  { id: 'complete', label: 'Optimization ready', detail: 'The package is ready for review and export.', state: 'pending' },
]

export function safeHost(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./, '')
  } catch {
    return 'source.example'
  }
}

export function money(value: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(value)
}

export function relativeTime(value: string) {
  const minutes = Math.max(1, Math.round((Date.now() - new Date(value).getTime()) / 60000))
  return minutes < 60 ? `${minutes} min ago` : `${Math.floor(minutes / 60)} hr ago`
}

export type PublicExtraction = {
  sourceUrl: string
  canonicalUrl: string
  sourceHost: string
  title: string
  description: string
  price: { value: number | null; currency: string | null }
  sourceKind?: 'product' | 'listing' | 'search' | 'document' | 'image' | 'article' | 'unknown'
  media: Array<{ url: string; previewUrl?: string; alt: string; sourcePath: string }>
  fields: Array<{ label: string; value: string; state: 'verified' | 'derived' | 'needs_review' | 'unknown'; method: string; sourcePath: string; confidence: number }>
  variants: Array<{ label: string; attributes: Record<string, string>; sourcePath: string }>
  sourceHealth: 'healthy' | 'blocked' | 'incomplete'
  warnings: string[]
  sourceDiagnostic?: SourceDiagnostic
  retrievedAt: string
}

export function workspaceFromExtraction(extraction: PublicExtraction): ProductWorkspace {
  const sourcePrice = extraction.price.value ?? 0
  const sourceCurrency = extraction.price.currency || 'USD'
  const evidence = extraction.fields.map((field) => ({
    label: field.label,
    value: field.value,
    state: field.state,
    method: field.method,
    source: field.sourcePath,
    confidence: field.confidence,
  }))
  if (extraction.warnings.length) {
    extraction.warnings.forEach((warning, index) => evidence.push({
      label: `Review note ${index + 1}`,
      value: warning,
      state: 'needs_review',
      method: 'Extraction validation',
      source: extraction.sourceUrl,
      confidence: 0,
    }))
  }
  const variants = extraction.variants.length
    ? extraction.variants.map((variant, index) => ({ id: `live-v${index + 1}`, label: variant.label, sku: `SOURCE-${index + 1}`, price: sourcePrice, stock: 0, active: true, attributes: variant.attributes }))
    : [{ id: 'live-default', label: 'Source product / confirmation required', sku: 'SOURCE-DEFAULT', price: sourcePrice, stock: 0, active: true, attributes: {} }]
  const media = extraction.media.length
    ? extraction.media.map((item, index) => ({ id: `live-m${index + 1}`, url: item.url, previewUrl: item.previewUrl, alt: item.alt, width: 0, height: 0, source: item.sourcePath, derivativeStatus: 'not_requested' as const }))
    : []
  const verified = evidence.filter((field) => field.state === 'verified' || field.state === 'derived').length
  const reviewPenalty = evidence.filter((field) => field.state === 'needs_review' || field.state === 'unknown').length * 7
  return {
    id: `prd_${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`,
    sourceUrl: extraction.sourceUrl,
    canonicalUrl: extraction.canonicalUrl,
    sourceHost: extraction.sourceHost,
    importedAt: extraction.retrievedAt,
    title: extraction.title || 'Untitled source product',
    brand: evidence.find((field) => field.label === 'Brand')?.value || 'Brand not supplied',
    model: evidence.find((field) => field.label === 'MPN')?.value || evidence.find((field) => field.label === 'SKU')?.value || 'Model needs review',
    gtin: evidence.find((field) => field.label === 'GTIN')?.value || 'GTIN not supplied',
    price: sourcePrice,
    currency: sourceCurrency,
    description: extraction.description || 'No public source description was recovered. Add evidence before using factual listing claims.',
    completeness: Math.max(35, Math.min(95, verified * 13 - reviewPenalty + (extraction.title ? 15 : 0))),
    fields: evidence,
    variants,
    media,
    documents: [],
  }
}

export type ManualEvidenceInput = {
  sourceUrl: string
  title: string
  brand: string
  model: string
  price: string
  currency: string
  description: string
}

export function workspaceFromManualEvidence(input: ManualEvidenceInput): ProductWorkspace {
  const value = Number(input.price.replace(/[^0-9.]/g, ''))
  const addField = (label: string, fieldValue: string) => ({
    label,
    value: fieldValue || 'Not supplied',
    state: fieldValue ? 'needs_review' as const : 'unknown' as const,
    method: fieldValue ? 'User-provided field' : 'No evidence supplied',
    source: fieldValue ? 'Manual evidence intake' : '—',
    confidence: 0,
  })
  const fields = [
    addField('Title', input.title),
    addField('Brand', input.brand),
    addField('Model', input.model),
    addField('Source price', input.price ? `${value || input.price} ${input.currency || 'USD'}` : ''),
    addField('Description', input.description),
  ]
  return {
    id: `manual_${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`,
    sourceUrl: input.sourceUrl,
    canonicalUrl: input.sourceUrl,
    sourceHost: safeHost(input.sourceUrl),
    importedAt: new Date().toISOString(),
    title: input.title || 'User-provided product record',
    brand: input.brand || 'Brand needs review',
    model: input.model || 'Model needs review',
    gtin: 'GTIN not supplied',
    price: Number.isFinite(value) ? value : 0,
    currency: input.currency || 'USD',
    description: input.description || 'User-provided description. Add a source document or product images before using factual listing claims.',
    completeness: Math.max(30, Math.min(70, fields.filter((field) => field.state === 'needs_review').length * 14)),
    fields,
    variants: [{ id: 'manual-default', label: 'Single item / confirmation required', sku: 'USER-EVIDENCE', price: Number.isFinite(value) ? value : 0, stock: 0, active: true, attributes: {} }],
    media: [],
    documents: [{ name: 'Manual evidence intake', type: 'User-provided fields', status: 'Needs review' }],
  }
}
