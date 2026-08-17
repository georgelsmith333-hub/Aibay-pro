import { assertSafePublicUrl } from './security'

import { adapterFor, normalizePublicSource, redirectDiagnostic, sessionRedirectDiagnostic, unsupportedDiagnostic, type SourceDiagnostic, type SourceKind } from './source-adapters'

export type ExtractedEvidence = {
  label: string
  value: string
  state: 'verified' | 'derived' | 'needs_review' | 'unknown'
  method: string
  sourcePath: string
  confidence: number
}

/**
 * Canonical cache key for a source URL: SSRF-validated and normalized with the
 * source adapter (tracking parameters stripped) so equivalent URLs share one
 * cache entry. Used by every cache namespace that keys on a source URL so no
 * two layers derive different keys for the same source.
 */
export function extractionCacheKey(sourceUrl: string): string {
  const parsed = assertSafePublicUrl(sourceUrl)
  const { url } = normalizePublicSource(parsed)
  return url.toString()
}

export type ExtractedVariant = {
  label: string
  attributes: Record<string, string>
  sourcePath: string
}

export type ProductExtraction = {
  sourceUrl: string
  canonicalUrl: string
  sourceHost: string
  sourceKind: SourceKind
  title: string
  description: string
  price: { value: number | null; currency: string | null }
  media: Array<{ url: string; previewUrl?: string; alt: string; sourcePath: string }>
  fields: ExtractedEvidence[]
  variants: ExtractedVariant[]
  sourceHealth: 'healthy' | 'blocked' | 'incomplete'
  warnings: string[]
  sourceDiagnostic: SourceDiagnostic
  retrievedAt: string
}

type JsonRecord = Record<string, unknown>

function decode(value: string) {
  return value.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim()
}

function absoluteUrl(value: string | undefined, base: URL) {
  if (!value) return ''
  try {
    const parsed = new URL(value, base)
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString() : ''
  } catch { return '' }
}

function emptyExtraction(sourceUrl: URL, canonicalUrl: string, diagnostic: SourceDiagnostic): ProductExtraction {
  const { kind } = normalizePublicSource(sourceUrl)
  return {
    sourceUrl: sourceUrl.toString(), canonicalUrl, sourceHost: sourceUrl.hostname.replace(/^www\\./, ''), sourceKind: kind, title: '', description: '',
    price: { value: null, currency: null }, media: [], fields: [], variants: [], sourceHealth: 'blocked',
    warnings: [diagnostic.reason], sourceDiagnostic: diagnostic, retrievedAt: new Date().toISOString(),
  }
}

export function incompleteExtractionFromError(sourceUrl: string, errorMessage: string): ProductExtraction {
  const sourceRoot = assertSafePublicUrl(sourceUrl)
  const { adapter, url: attemptedUrl, kind } = normalizePublicSource(sourceRoot)
  const reason = `The exact public source returned no usable product record: ${errorMessage}`
  return {
    sourceUrl: sourceRoot.toString(), canonicalUrl: attemptedUrl.toString(), sourceHost: sourceRoot.hostname.replace(/^www\\./, ''), sourceKind: kind, title: '', description: '',
    price: { value: null, currency: null }, media: [], fields: [], variants: [], sourceHealth: 'incomplete',
    warnings: [reason], sourceDiagnostic: { status: 'incomplete', reason, sourceHost: sourceRoot.hostname.replace(/^www\\./, ''), adapter: adapter.id, attemptedUrl: attemptedUrl.toString(), redirectCount: 0, redirectHosts: [sourceRoot.hostname.replace(/^www\\./, '')] }, retrievedAt: new Date().toISOString(),
  }
}

async function fetchPublicHtml(url: URL, timeoutMs = 12_000) {
  let timeout: ReturnType<typeof setTimeout> | undefined
  const request = fetch(url, {
    redirect: 'manual',
    headers: {
      accept: 'text/html,application/xhtml+xml',
      'user-agent': 'AiBayEvidenceImporter/1.1 (+https://aibay-pro.pages.dev/source-policy)',
    },
  })
  const deadline = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error('The public source did not respond within the bounded 12-second acquisition window.')), timeoutMs)
  })
  try {
    return await Promise.race([request, deadline])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

function metaContent(html: string, selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const expressions = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`, 'i'),
  ]
  for (const expression of expressions) {
    const match = html.match(expression)
    if (match?.[1]) return decode(match[1])
  }
  return ''
}

function linkHref(html: string, rel: string) {
  const expressions = [
    new RegExp(`<link[^>]+rel=["']${rel}["'][^>]+href=["']([^"']+)["'][^>]*>`, 'i'),
    new RegExp(`<link[^>]+href=["']([^"']+)["'][^>]+rel=["']${rel}["'][^>]*>`, 'i'),
  ]
  for (const expression of expressions) {
    const match = html.match(expression)
    if (match?.[1]) return decode(match[1])
  }
  return ''
}

function flattenJsonLd(value: unknown): JsonRecord[] {
  if (Array.isArray(value)) return value.flatMap(flattenJsonLd)
  if (!value || typeof value !== 'object') return []
  const record = value as JsonRecord
  const graph = Array.isArray(record['@graph']) ? record['@graph'].flatMap(flattenJsonLd) : []
  return [record, ...graph]
}

function jsonLdObjects(html: string): JsonRecord[] {
  const scripts = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
  return scripts.flatMap((match) => {
    const raw = match[1]?.trim() || ''
    try { return flattenJsonLd(JSON.parse(raw)) } catch { return [] }
  })
}

function findEmbeddedProduct(value: unknown, depth = 0): JsonRecord | null {
  if (depth > 6 || !value || typeof value !== 'object') return null
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 120)) { const found = findEmbeddedProduct(item, depth + 1); if (found) return found }
    return null
  }
  const record = value as JsonRecord
  const name = stringValue(record.name) || stringValue(record.title)
  const hasProductSignals = Boolean(record.description || record.image || record.images || record.offers || record.brand || record.sku || record.mpn)
  if (name && hasProductSignals) return record
  for (const child of Object.values(record).slice(0, 120)) { const found = findEmbeddedProduct(child, depth + 1); if (found) return found }
  return null
}

function embeddedProductRecord(html: string): JsonRecord | null {
  const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)]
  for (const match of scripts.slice(0, 80)) {
    const raw = match[1]?.trim() || ''
    if (!raw || raw.length > 700_000 || !/name|title|description|offers|image|sku|mpn/i.test(raw)) continue
    try { const found = findEmbeddedProduct(JSON.parse(raw)); if (found) return found } catch { /* non-JSON script */ }
  }
  return null
}

function hasType(record: JsonRecord, type: string) {
  const candidate = record['@type']
  return Array.isArray(candidate) ? candidate.includes(type) : candidate === type
}

function stringValue(value: unknown) {
  if (typeof value === 'string' || typeof value === 'number') return String(value).trim()
  return ''
}

function imageUrls(value: unknown, base: URL): string[] {
  const values = Array.isArray(value) ? value : [value]
  return values.flatMap((raw) => {
    if (typeof raw === 'string') return [absoluteUrl(raw, base)].filter(Boolean)
    if (raw && typeof raw === 'object') return [absoluteUrl(stringValue((raw as JsonRecord).url) || stringValue((raw as JsonRecord).contentUrl), base)].filter(Boolean)
    return []
  })
}

function visibleImageUrls(html: string, base: URL) {
  const found: string[] = []
  const seen = new Set<string>()
  const add = (value: string) => { const url = absoluteUrl(decode(value), base); if (url && !seen.has(url)) { seen.add(url); found.push(url) } }
  for (const tag of html.matchAll(/<img[^>]*>/gi)) {
    const source = tag[0] || ''
    const attributes = [...source.matchAll(/(?:src|data-src|data-original|data-lazy-src|data-image-url)=['"]([^'"]+)['"]/gi)]
    attributes.forEach((attribute) => add(attribute[1] || ''))
    const srcset = source.match(/(?:srcset|data-srcset)=['"]([^'"]+)['"]/i)?.[1] || ''
    srcset.split(',').map((candidate) => candidate.trim().split(/\s+/)[0]).filter(Boolean).forEach(add)
  }
  return found.slice(0, 60)
}

function stripTags(value: string) { return decode(value.replace(/<[^>]+>/g, ' ')) }

function extractTableEvidence(html: string): ExtractedEvidence[] {
  const fields: ExtractedEvidence[] = []
  for (const table of html.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/gi)) {
    for (const row of (table[1] || '').matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const cells = [...(row[1] || '').matchAll(/<(?:th|td)[^>]*>([\s\S]*?)<\/(?:th|td)>/gi)].map((cell) => stripTags(cell[1] || '')).filter(Boolean)
      if (cells.length >= 2 && cells[0].length <= 100 && cells[1].length <= 500) fields.push({ label: cells[0], value: cells.slice(1).join(' · '), state: 'verified', method: 'Visible specification table', sourcePath: 'visible-table', confidence: 78 })
    }
  }
  return fields.slice(0, 40)
}

function offerFromProduct(product: JsonRecord) {
  const offer = Array.isArray(product.offers) ? product.offers[0] : product.offers
  return offer && typeof offer === 'object' ? offer as JsonRecord : {}
}

function extractOptionPairs(html: string) {
  const variants: ExtractedVariant[] = []
  const selectBlocks = [...html.matchAll(/<select[^>]*(?:name|id)=["']([^"']+)["'][^>]*>([\s\S]*?)<\/select>/gi)]
  for (const block of selectBlocks.slice(0, 5)) {
    const key = decode(block[1] || '').replace(/[-_]/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
    const values = [...(block[2] || '').matchAll(/<option[^>]*value=["']?([^"' >]+)["']?[^>]*>([\s\S]*?)<\/option>/gi)]
      .map((option) => decode(option[2] || option[1] || ''))
      .filter((value) => value && !/select|choose|please/i.test(value))
      .slice(0, 25)
    for (const value of values) variants.push({ label: `${key}: ${value}`, attributes: { [key]: value }, sourcePath: `visible-select:${key}` })
  }
  return variants
}

export function sourceLooksBlocked(html: string, status: number) {
  return status === 401 || status === 403 || status === 429 || /captcha|recaptcha|hcaptcha|cf-chl-|verify you are human|access denied|enable cookies/i.test(html)
}

function resourceLabel(url: URL) {
  const last = decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() || '').replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ').trim()
  return last ? last.replace(/\b\w/g, (letter) => letter.toUpperCase()) : `${url.hostname} resource`
}

function directResourceExtraction(sourceRoot: URL, fetchUrl: URL, adapter: { id: string }, kind: ExtractedResourceKind): ProductExtraction {
  const label = resourceLabel(fetchUrl)
  const retrievedAt = new Date().toISOString()
  const isImage = kind === 'image'
  return {
    sourceUrl: sourceRoot.toString(), canonicalUrl: fetchUrl.toString(), sourceHost: sourceRoot.hostname.replace(/^www\\./, ''), sourceKind: kind, title: label,
    description: isImage ? 'Direct image source. Add product facts manually or import a product page to build a complete listing record.' : 'Direct document source. Review the document and add product facts before exporting a listing draft.',
    price: { value: null, currency: null },
    media: isImage ? [{ url: fetchUrl.toString(), previewUrl: `/api/media/preview?url=${encodeURIComponent(fetchUrl.toString())}`, alt: `${label} source image`, sourcePath: 'Direct image URL' }] : [],
    fields: [
      { label: isImage ? 'Source image' : 'Source document', value: fetchUrl.toString(), state: 'verified', method: isImage ? 'Direct public image URL' : 'Direct public document URL', sourcePath: 'source-url', confidence: 90 },
      { label: isImage ? 'Image host' : 'Document type', value: isImage ? sourceRoot.hostname.replace(/^www\\./, '') : (fetchUrl.pathname.match(/\\.([a-z0-9]+)$/i)?.[1]?.toUpperCase() || 'Document'), state: 'verified', method: 'URL resource classification', sourcePath: 'source-kind', confidence: 88 },
    ],
    variants: [], sourceHealth: 'incomplete', warnings: [isImage ? 'Only an image resource was supplied. Add product identity, specifications, and variants before export.' : 'Only a document resource was supplied. Review its contents and add product identity before export.'],
    sourceDiagnostic: { status: 'incomplete', reason: isImage ? 'The image URL is attributable and previewable, but it does not contain a complete product record by itself.' : 'The document URL is attributable, but document contents require review before product facts can be claimed.', sourceHost: sourceRoot.hostname.replace(/^www\\./, ''), adapter: adapter.id, attemptedUrl: fetchUrl.toString(), redirectCount: 0, redirectHosts: [sourceRoot.hostname.replace(/^www\\./, '')] }, retrievedAt,
  }
}

type ExtractedResourceKind = Extract<SourceKind, 'image' | 'document'>

export async function extractPublicProduct(sourceUrl: string, redirectCount = 0, visited = new Set<string>(), redirectHosts: string[] = []): Promise<ProductExtraction> {
  const sourceRoot = assertSafePublicUrl(sourceUrl)
  const { adapter, url: fetchUrl, kind } = normalizePublicSource(sourceRoot)
  const redirectTrail = redirectHosts.length ? redirectHosts : [fetchUrl.hostname.replace(/^www\./, '')]
  if (redirectCount === 0 && (kind === 'image' || kind === 'document')) return directResourceExtraction(sourceRoot, fetchUrl, adapter, kind)
  if (redirectCount === 0 && ['search', 'listing', 'article'].includes(kind)) return emptyExtraction(sourceRoot, fetchUrl.toString(), unsupportedDiagnostic(sourceRoot, fetchUrl, adapter, kind))
  if (redirectCount >= 3) return emptyExtraction(sourceRoot, fetchUrl.toString(), redirectDiagnostic('redirect_limit', sourceRoot, fetchUrl, adapter, redirectCount, redirectTrail))
  if (visited.has(fetchUrl.toString())) return emptyExtraction(sourceRoot, fetchUrl.toString(), redirectDiagnostic('redirect_loop', sourceRoot, fetchUrl, adapter, redirectCount, redirectTrail))
  visited.add(fetchUrl.toString())
  const response = await fetchPublicHtml(fetchUrl)
  if ([301, 302, 303, 307, 308].includes(response.status)) {
    const location = response.headers.get('location')
    if (!location) throw new Error('The source redirected without a usable destination.')
    const redirectedValue = absoluteUrl(location, fetchUrl)
    if (!redirectedValue) throw new Error('The source redirected to an unsupported destination.')
    const redirectedUrl = assertSafePublicUrl(redirectedValue)
    const redirectedAdapter = adapterFor(redirectedUrl)
    const nextHosts = [...redirectTrail, redirectedUrl.hostname.replace(/^www\./, '')]
    if (redirectedAdapter.requiresSessionForRedirect?.(redirectedUrl)) {
      return emptyExtraction(sourceRoot, fetchUrl.toString(), sessionRedirectDiagnostic(sourceRoot, redirectedUrl, adapter, redirectCount + 1, nextHosts))
    }
    return extractPublicProduct(redirectedValue, redirectCount + 1, visited, nextHosts)
  }
  const declaredSize = Number(response.headers.get('content-length') || 0)
  if (declaredSize > 1_500_000) throw new Error('The source page is too large for bounded extraction.')
  const html = (await response.text()).slice(0, 1_500_000)
  const canonicalUrl = absoluteUrl(linkHref(html, 'canonical'), fetchUrl) || fetchUrl.toString()
  const health = sourceLooksBlocked(html, response.status) ? 'blocked' : response.ok ? 'healthy' : 'incomplete'
  if (health === 'blocked') {
    return {
      sourceUrl: sourceRoot.toString(), canonicalUrl, sourceHost: sourceRoot.hostname.replace(/^www\./, ''), sourceKind: kind, title: '', description: '', price: { value: null, currency: null }, media: [], fields: [], variants: [], sourceHealth: 'blocked', warnings: ['The source requires a permitted fallback. AiBay does not bypass CAPTCHA, login, or access controls.'], sourceDiagnostic: { status: 'access_controlled', reason: 'The public source signalled access controls or anti-bot verification. AiBay does not bypass these controls.', sourceHost: sourceRoot.hostname.replace(/^www\./, ''), adapter: adapter.id, attemptedUrl: fetchUrl.toString(), redirectCount, redirectHosts: redirectTrail }, retrievedAt: new Date().toISOString(),
    }
  }
  if (!response.ok) throw new Error(`The source returned HTTP ${response.status}.`)

  const jsonLdProduct = jsonLdObjects(html).find((record) => hasType(record, 'Product')) || null
  const embeddedProduct = jsonLdProduct ? null : embeddedProductRecord(html)
  const product = jsonLdProduct || embeddedProduct || {}
  const metadataMethod = jsonLdProduct ? 'Structured product metadata' : embeddedProduct ? 'Embedded page state' : 'Page metadata'
  const offer = offerFromProduct(product)
  const title = stringValue(product.name) || metaContent(html, 'og:title') || decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '')
  const description = stringValue(product.description) || metaContent(html, 'og:description') || metaContent(html, 'description')
  const priceText = stringValue(offer.price) || metaContent(html, 'product:price:amount')
  const currency = stringValue(offer.priceCurrency) || metaContent(html, 'product:price:currency') || ''
  const priceValue = Number(priceText.replace(/[^0-9.]/g, ''))
  const mediaUrls = [...new Set([...imageUrls(product.image, fetchUrl), ...[absoluteUrl(metaContent(html, 'og:image'), fetchUrl)].filter(Boolean), ...visibleImageUrls(html, fetchUrl)])].slice(0, 60)
  const rawImage = mediaUrls[0] || ''
  const brand = typeof product.brand === 'object' && product.brand ? stringValue((product.brand as JsonRecord).name) : stringValue(product.brand)
  const sku = stringValue(product.sku)
  const gtin = stringValue(product.gtin13) || stringValue(product.gtin14) || stringValue(product.gtin12) || stringValue(product.gtin8)
  const mpn = stringValue(product.mpn)
  const fields: ExtractedEvidence[] = []
  const add = (label: string, value: string, path: string, confidence = 95) => { if (value) fields.push({ label, value, state: 'verified', method: metadataMethod, sourcePath: path, confidence }) }
  add('Title', title, 'JSON-LD Product.name', 98)
  add('Brand', brand, 'JSON-LD Product.brand', 95)
  add('SKU', sku, 'JSON-LD Product.sku', 95)
  add('GTIN', gtin, 'JSON-LD Product.gtin*', 98)
  add('MPN', mpn, 'JSON-LD Product.mpn', 95)
  if (priceValue && Number.isFinite(priceValue)) add('Source price', `${priceValue} ${currency || 'currency unknown'}`, 'JSON-LD Product.offers', 92)
  fields.push(...extractTableEvidence(html).filter((field) => !fields.some((existing) => existing.label.toLowerCase() === field.label.toLowerCase())))
  if (!fields.find((field) => field.label === 'Title') && title) fields.push({ label: 'Title', value: title, state: 'verified', method: 'Open Graph or page title', sourcePath: 'meta/title', confidence: 78 })
  const variants = extractOptionPairs(html)
  const warnings = [
    ...(title ? [] : ['No usable product title was found. Add a source-backed title manually.']),
    ...(description ? [] : ['No description was recovered from public metadata.']),
    ...(variants.length ? [] : ['No supported selectable variants were detected from public selects.']),
  ]
  return {
    sourceUrl: sourceRoot.toString(), canonicalUrl, sourceHost: sourceRoot.hostname.replace(/^www\./, ''), sourceKind: kind, title, description,
    price: { value: Number.isFinite(priceValue) && priceValue ? priceValue : null, currency: currency || null },
    media: mediaUrls.map((url, index) => ({ url, alt: `${title || 'Product'} source image ${index + 1}`, sourcePath: index < imageUrls(product.image, fetchUrl).length ? 'JSON-LD Product.image' : index === 0 && rawImage === absoluteUrl(metaContent(html, 'og:image'), fetchUrl) ? 'Open Graph og:image' : 'Visible image gallery' })),
    fields, variants, sourceHealth: warnings.length > 0 ? 'incomplete' : 'healthy', warnings,
    sourceDiagnostic: { status: warnings.length > 0 ? 'incomplete' : 'public_evidence', reason: warnings.length > 0 ? 'The public page was retrieved, but some expected product evidence was absent.' : 'Public structured or visible product evidence was recovered.', sourceHost: sourceRoot.hostname.replace(/^www\./, ''), adapter: adapter.id, attemptedUrl: fetchUrl.toString(), redirectCount, redirectHosts: redirectTrail }, retrievedAt: new Date().toISOString(),
  }
}
