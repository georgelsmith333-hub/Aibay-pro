// Cache interface layer (migration step 4).
//
// AiBay has no durable cache binding (KV/R2) in the current Pages project, so
// this module exposes a formal CacheStore contract with an explicit
// request-only fallback. The best-effort Cloudflare edge Cache API may be used
// as an optimization when the runtime exposes it, but cached values are never
// authoritative evidence: every cache hit retains its original storedAt and
// expiresAt, and extraction/validation always remains the source of truth.
//
// Durable cache backends (KV/R2) are intentionally not implemented here. They
// belong to the separate infrastructure migration that requires binding
// validation, retention rules, and invalidation semantics.

export type CacheMode = 'durable' | 'edge' | 'request_only'
export type CacheBackend = 'none' | 'cloudflare-cache-api' | 'cloudflare-kv' | 'r2'
export type CacheHealth = {
  mode: CacheMode
  backend: CacheBackend
  durable: boolean
  configured: boolean
  binding: string | null
  note: string
}

export type CacheRead<T> = {
  hit: boolean
  value?: T
  storedAt?: string
  expiresAt?: string
  backend: CacheBackend
}

export type CacheWrite = {
  stored: boolean
  reason?: string
}

export interface CacheStore {
  readonly health: CacheHealth
  read<T>(key: string): Promise<CacheRead<T>>
  write(key: string, value: unknown, ttlSeconds?: number): Promise<CacheWrite>
  remove(key: string): Promise<void>
}

const CACHE_ORIGIN = 'https://cache.aibay.invalid'
const MAX_ENTRY_BYTES = 262_144 // 256 KiB bound; cache is an optimization, not a store.
const DEFAULT_TTL_SECONDS = 300

type Envelope = { v: 1; value: unknown; storedAt: string; expiresAt: string }

function cacheRequest(namespace: string, key: string): Request {
  return new Request(`${CACHE_ORIGIN}/v1/${encodeURIComponent(namespace)}?k=${encodeURIComponent(key)}`)
}

function edgeCache(): Cache | undefined {
  try {
    const runtime = globalThis as unknown as { caches?: { default?: Cache } }
    return runtime.caches?.default
  } catch {
    return undefined
  }
}

function envelopeBytes(envelope: Envelope): number {
  try {
    return new TextEncoder().encode(JSON.stringify(envelope)).byteLength
  } catch {
    return MAX_ENTRY_BYTES + 1
  }
}

/**
 * Explicit request-only fallback. It never persists, never hits, and never
 * pretends a durable cache exists. Every request is executed and validated
 * from source.
 */
export class RequestOnlyCache implements CacheStore {
  readonly health: CacheHealth

  constructor(namespace: string) {
    this.health = {
      mode: 'request_only',
      backend: 'none',
      durable: false,
      configured: false,
      binding: null,
      note: `No durable or edge cache binding is available for namespace "${namespace}". Every request is executed and validated from source; this is the explicit request-only fallback.`,
    }
  }

  async read<T>(): Promise<CacheRead<T>> {
    return { hit: false, backend: 'none' }
  }

  async write(): Promise<CacheWrite> {
    return { stored: false, reason: 'request_only_fallback' }
  }

  async remove(): Promise<void> {
    // Nothing is stored, so there is nothing to remove.
  }
}

/**
 * Best-effort Cloudflare edge Cache API backend. Available in the Pages
 * runtime without any binding, but it is not durable and must never be
 * treated as authoritative. TTL is enforced by an envelope timestamp in
 * addition to cache-control, so stale entries are treated as misses.
 */
export class EdgeCacheStore implements CacheStore {
  readonly health: CacheHealth
  private readonly cache: Cache
  private readonly namespace: string
  private readonly defaultTtlSeconds: number

  constructor(cache: Cache, namespace: string, defaultTtlSeconds = DEFAULT_TTL_SECONDS, binding: string | null = null) {
    this.cache = cache
    this.namespace = namespace
    this.defaultTtlSeconds = defaultTtlSeconds
    this.health = {
      mode: 'edge',
      backend: 'cloudflare-cache-api',
      durable: false,
      configured: true,
      binding,
      note: binding
        ? `Best-effort edge cache active for namespace "${namespace}". A durable binding (${binding}) is present but is not yet wired into this request-scoped layer; cached values remain optimizations, never authoritative evidence.`
        : `Best-effort edge cache active for namespace "${namespace}". Cached values are request-scoped optimizations with freshness metadata; they are never authoritative evidence and are not a durable store.`,
    }
  }

  async read<T>(key: string): Promise<CacheRead<T>> {
    try {
      const response = await this.cache.match(cacheRequest(this.namespace, key))
      if (!response) return { hit: false, backend: this.health.backend }
      const envelope = await response.json() as Envelope
      if (!envelope || envelope.v !== 1 || !envelope.storedAt || !envelope.expiresAt) return { hit: false, backend: this.health.backend }
      if (Date.parse(envelope.expiresAt) <= Date.now()) {
        await this.remove(key)
        return { hit: false, backend: this.health.backend }
      }
      return { hit: true, value: envelope.value as T, storedAt: envelope.storedAt, expiresAt: envelope.expiresAt, backend: this.health.backend }
    } catch {
      return { hit: false, backend: this.health.backend }
    }
  }

  async write(key: string, value: unknown, ttlSeconds = this.defaultTtlSeconds): Promise<CacheWrite> {
    try {
      const ttl = Math.max(1, Math.min(86_400, Math.floor(ttlSeconds)))
      const storedAt = new Date().toISOString()
      const expiresAt = new Date(Date.now() + ttl * 1000).toISOString()
      const envelope: Envelope = { v: 1, value, storedAt, expiresAt }
      if (envelopeBytes(envelope) > MAX_ENTRY_BYTES) return { stored: false, reason: 'value_too_large' }
      const response = new Response(JSON.stringify(envelope), {
        headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': `public, max-age=${ttl}` },
      })
      await this.cache.put(cacheRequest(this.namespace, key), response)
      return { stored: true }
    } catch {
      return { stored: false, reason: 'cache_write_failed' }
    }
  }

  async remove(key: string): Promise<void> {
    try {
      await this.cache.delete(cacheRequest(this.namespace, key))
    } catch {
      // Removal is best-effort; a failed delete only risks a stale miss.
    }
  }
}

/**
 * Durable KV-backed cache. Used when a CACHE_KV binding is configured
 * (migration step 6). TTL is enforced by envelope timestamps; values remain
 * optimizations with freshness metadata, never authoritative evidence.
 */
export class KvCacheStore implements CacheStore {
  readonly health: CacheHealth
  private readonly kv: KVNamespace
  private readonly namespace: string
  private readonly defaultTtlSeconds: number

  constructor(kv: KVNamespace, namespace: string, defaultTtlSeconds = DEFAULT_TTL_SECONDS) {
    this.kv = kv
    this.namespace = namespace
    this.defaultTtlSeconds = defaultTtlSeconds
    this.health = {
      mode: 'durable',
      backend: 'cloudflare-kv',
      durable: true,
      configured: true,
      binding: 'CACHE_KV',
      note: `Durable KV cache active for namespace "${namespace}". Values carry storedAt/expiresAt and remain optimizations, never authoritative evidence.`,
    }
  }

  private key(key: string) {
    return `${this.namespace}:${key}`
  }

  async read<T>(key: string): Promise<CacheRead<T>> {
    try {
      const raw = await this.kv.get(this.key(key))
      if (!raw) return { hit: false, backend: 'cloudflare-kv' }
      const envelope = JSON.parse(raw) as Envelope
      if (!envelope || envelope.v !== 1 || !envelope.storedAt || !envelope.expiresAt) return { hit: false, backend: 'cloudflare-kv' }
      if (Date.parse(envelope.expiresAt) <= Date.now()) {
        await this.remove(key)
        return { hit: false, backend: 'cloudflare-kv' }
      }
      return { hit: true, value: envelope.value as T, storedAt: envelope.storedAt, expiresAt: envelope.expiresAt, backend: 'cloudflare-kv' }
    } catch {
      return { hit: false, backend: 'cloudflare-kv' }
    }
  }

  async write(key: string, value: unknown, ttlSeconds = this.defaultTtlSeconds): Promise<CacheWrite> {
    try {
      const ttl = Math.max(1, Math.min(86_400, Math.floor(ttlSeconds)))
      const storedAt = new Date().toISOString()
      const expiresAt = new Date(Date.now() + ttl * 1000).toISOString()
      const envelope: Envelope = { v: 1, value, storedAt, expiresAt }
      if (envelopeBytes(envelope) > MAX_ENTRY_BYTES) return { stored: false, reason: 'value_too_large' }
      await this.kv.put(this.key(key), JSON.stringify(envelope), { expirationTtl: ttl })
      return { stored: true }
    } catch {
      return { stored: false, reason: 'cache_write_failed' }
    }
  }

  async remove(key: string): Promise<void> {
    try {
      await this.kv.delete(this.key(key))
    } catch {
      // Best-effort.
    }
  }
}

/**
 * Selects the cache backend for a namespace:
 * - a durable KV binding (CACHE_KV) is used when configured;
 * - otherwise the edge Cache API is used as a best-effort optimization;
 * - otherwise the explicit request-only fallback is returned.
 */
export function createCacheStore(env: Record<string, unknown>, namespace = 'default'): CacheStore {
  const kv = env.CACHE_KV as KVNamespace | undefined
  if (kv) return new KvCacheStore(kv, namespace, DEFAULT_TTL_SECONDS)
  const cache = edgeCache()
  if (cache) return new EdgeCacheStore(cache, namespace, DEFAULT_TTL_SECONDS, null)
  return new RequestOnlyCache(namespace)
}
