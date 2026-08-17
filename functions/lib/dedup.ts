// Deduplication interface layer (migration step 4).
//
// AiBay canonicalizes candidate source URLs and fingerprints product identity
// with a versioned, deterministic scheme so the same product is not counted
// twice across discovery, extraction, and research. The interface is provider
// agnostic: any adapter (local, official API, or future provider) submits
// candidates and receives kept records plus a truthful dedup report.
//
// Conflicting duplicates are never silently merged. When two entries share a
// fingerprint but disagree on identity fields, the conflict labels are
// preserved on the kept record and reported in conflictCount so reviewers can
// decide. The dedup layer is local and deterministic; it requires no durable
// binding and no external provider.

export const DEDUP_METHOD = 'identity_fingerprint' as const
export const FINGERPRINT_VERSION = 1

export type DedupOptions<T> = {
  /** Returns the identity fingerprint for an entry. */
  fingerprintOf: (item: T) => string
  /** Positive when `a` is preferred over `b` (e.g. higher score). Default: first seen. */
  prefer?: (a: T, b: T) => number
  /** Labels of fields that conflict between the kept entry and a duplicate (e.g. 'brand', 'price'). */
  conflictingValues?: (kept: T, duplicate: T) => string[]
  /** Stable identity string for the kept entry (e.g. canonical URL) used for duplicateOf provenance links. */
  identityOf?: (item: T) => string
}

export type DedupRecord<T> = {
  entry: T
  fingerprint: string
  /** Identity of the first duplicate collapsed into this record, when any. */
  duplicateOf?: string
  /** Field labels that conflict between the kept entry and at least one duplicate. */
  conflicts: string[]
}

export type DedupOutcome<T> = {
  method: typeof DEDUP_METHOD
  fingerprintVersion: number
  records: DedupRecord<T>[]
  /** Number of entries removed as duplicates (or invalid, when the caller pre-filters). */
  dropped: number
  /** Number of duplicate entries collapsed into kept records. */
  duplicateCount: number
  /** Number of distinct conflicting field labels found across collapsed duplicates. */
  conflictCount: number
  note: string
}

function compact(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ':').replace(/^:+|:+$/g, '')
}

function clean(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
}

/**
 * Canonicalizes a candidate URL: strips the fragment and common tracking
 * parameters while preserving the resource identity. Throws on invalid URLs.
 */
export function canonicalizeUrl(input: string): string {
  const url = new URL(input)
  url.hash = ''
  const tracking = /^(?:utm_|gclid|fbclid|msclkid|spm|pvid|scm|_t|ref|ref_)/i
  for (const key of [...url.searchParams.keys()]) {
    if (tracking.test(key)) url.searchParams.delete(key)
  }
  return url.toString()
}

export type IdentityInput = {
  sku?: string | null
  brand?: string | null
  model?: string | null
  title: string
  canonicalUrl: string
}

/**
 * Deterministic, versioned identity fingerprint. Prefers SKU when present,
 * then brand|model|title, then the canonical URL. Compacted to lowercase
 * alphanumeric segments so equivalent spellings collapse to one identity.
 */
export function identityFingerprint(input: IdentityInput): string {
  const sku = compact(clean(input.sku))
  if (sku) return `sku:${sku}`
  const identity = [clean(input.brand), clean(input.model), clean(input.title)]
    .filter(Boolean)
    .join('|')
  if (identity) return `identity:${compact(identity)}`
  return `url:${compact(input.canonicalUrl)}`
}

/**
 * Collapses entries that share an identity fingerprint into a single kept
 * record (the preferred entry), preserving conflict labels and provenance
 * links. Kept records preserve the first-seen order of their groups.
 */
export function deduplicate<T>(items: readonly T[], options: DedupOptions<T>): DedupOutcome<T> {
  const groups = new Map<string, T[]>()
  for (const item of items) {
    const fingerprint = options.fingerprintOf(item)
    const group = groups.get(fingerprint)
    if (group) group.push(item)
    else groups.set(fingerprint, [item])
  }

  const records: DedupRecord<T>[] = []
  let duplicateCount = 0
  let conflictCount = 0
  for (const [fingerprint, group] of groups) {
    let kept = group[0]
    for (const candidate of group.slice(1)) {
      if (options.prefer && options.prefer(candidate, kept) > 0) kept = candidate
    }
    const conflicts = new Set<string>()
    let firstDuplicate: T | undefined
    for (const member of group) {
      if (member === kept) continue
      duplicateCount += 1
      if (!firstDuplicate) firstDuplicate = member
      if (options.conflictingValues) {
        for (const label of options.conflictingValues(kept, member)) conflicts.add(label)
      }
    }
    conflictCount += conflicts.size
    records.push({
      entry: kept,
      fingerprint,
      duplicateOf: firstDuplicate && options.identityOf ? options.identityOf(firstDuplicate) : undefined,
      conflicts: [...conflicts],
    })
  }

  return {
    method: DEDUP_METHOD,
    fingerprintVersion: FINGERPRINT_VERSION,
    records,
    dropped: items.length - records.length,
    duplicateCount,
    conflictCount,
    note: `Collapsed ${duplicateCount} duplicate entr${duplicateCount === 1 ? 'y' : 'ies'} by identity fingerprint v${FINGERPRINT_VERSION}. Conflicts remain visible for review; nothing was merged silently.`,
  }
}
