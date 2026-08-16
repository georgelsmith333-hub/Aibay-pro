export type EvidenceState = 'verified' | 'derived' | 'needs_review' | 'unknown'
export type JobState = 'idle' | 'validating' | 'extracting' | 'normalizing' | 'researching' | 'ready' | 'blocked' | 'unavailable' | 'optimizing' | 'complete'

export interface EvidenceField {
  label: string
  value: string
  state: EvidenceState
  method: string
  source: string
  confidence: number
}

export interface ProductVariant {
  id: string
  label: string
  sku: string
  price: number
  stock: number
  attributes: Record<string, string>
  active: boolean
}

export interface ProductMedia {
  id: string
  url: string
  alt: string
  width: number
  height: number
  source: string
  enhanced?: boolean
  rightsConfirmed?: boolean
}

export interface ProductWorkspace {
  id: string
  sourceUrl: string
  canonicalUrl: string
  sourceHost: string
  importedAt: string
  title: string
  brand: string
  model: string
  gtin: string
  price: number
  currency: string
  description: string
  completeness: number
  fields: EvidenceField[]
  variants: ProductVariant[]
  media: ProductMedia[]
  documents: Array<{ name: string; type: string; status: string }>
}

export interface MarketListing {
  id: string
  title: string
  price: number
  shipping: number
  condition: string
  image: string
  seller: string
  feedback: number
  imageCount: number
  matched: 'direct' | 'comparable'
  url: string
}

export interface MarketSnapshot {
  id: string
  query: string
  capturedAt: string
  marketplace: string
  currency: string
  resultCount: number
  directMatchCount: number
  listings: MarketListing[]
  commonTerms: string[]
  itemSpecificGaps: string[]
}

export interface OptimizationRun {
  id: string
  createdAt: string
  titleCandidates: string[]
  chosenTitle: string
  description: string
  specifics: Array<{ label: string; value: string; state: EvidenceState }>
  priceBand: { low: number; target: number; high: number; currency: string }
  strategy: string[]
  policyChecks: Array<{ label: string; passed: boolean; note: string }>
  mediaPlan: Array<{ mediaId: string; action: string; reason: string }>
}

export type SourceDiagnosticStatus = 'public_evidence' | 'session_required' | 'access_controlled' | 'redirect_loop' | 'redirect_limit' | 'incomplete' | 'unsupported'

export interface SourceDiagnostic {
  status: SourceDiagnosticStatus
  reason: string
  sourceHost: string
  adapter: string
  attemptedUrl: string
  redirectCount: number
  redirectHosts: string[]
}

export interface ImportFailure {
  blocked: boolean
  reason: string
  alternatives: string[]
  sourceUrl: string
  diagnostic?: SourceDiagnostic
}

export interface JobEvent {
  id: string
  label: string
  detail: string
  state: 'pending' | 'active' | 'complete' | 'blocked'
}
