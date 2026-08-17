// Durable storage layer (migration step 6, first slice).
//
// AiBay now supports real Cloudflare bindings (D1, KV, R2, Queue) when they
// are configured, with an explicit request-only fallback when they are not.
// Every function reports persistence truthfully. Binding presence is detected
// at runtime from the Pages environment; nothing is assumed from config files.
//
// D1 = relational truth (vault, provider runs, trend observations, jobs)
// KV  = durable cache (envelope-versioned, TTL-enforced)
// R2  = media/artifact store (write path is a separate migration)
// Queue = async job dispatch (consumer is a future Worker migration)

export type BindingReport = {
  persistence: 'durable' | 'request_only'
  d1: 'configured' | 'unconfigured'
  kv: 'configured' | 'unconfigured'
  r2: 'configured' | 'unconfigured'
  queue: 'configured' | 'unconfigured'
  note: string
}

export type Env = Record<string, unknown>

export function bindingReport(env: Env): BindingReport {
  const d1 = Boolean(env.DB)
  const kv = Boolean(env.CACHE_KV)
  const r2 = Boolean(env.MEDIA_BUCKET)
  const queue = Boolean(env.JOB_QUEUE)
  const durable = d1 || kv || r2
  return {
    persistence: durable ? 'durable' : 'request_only',
    d1: d1 ? 'configured' : 'unconfigured',
    kv: kv ? 'configured' : 'unconfigured',
    r2: r2 ? 'configured' : 'unconfigured',
    queue: queue ? 'configured' : 'unconfigured',
    note: durable
      ? `Durable bindings active (D1: ${d1}, KV: ${kv}, R2: ${r2}). Individual features report their own state; request-only fallbacks remain for features without a binding.`
      : 'No durable bindings are configured in this deployment. All state is request-only; nothing is advertised as persisted.',
  }
}

export function d1(env: Env): D1Database | null {
  const db = env.DB as D1Database | undefined
  return db ?? null
}

// ---------------------------------------------------------------------------
// Vault (watchlist + tracked sellers) — D1 when bound, else honest fallback
// ---------------------------------------------------------------------------

export type VaultItem = {
  id: string
  kind: 'watch' | 'seller'
  title: string
  url: string
  targetPrice?: string | null
  note?: string | null
  createdAt: string
}

export type VaultState = {
  persistence: 'durable' | 'request_only'
  items: VaultItem[]
  stats: { watch: number; sellers: number; generated: number; scans: number }
  note: string
}

export async function readVault(env: Env): Promise<VaultState> {
  const db = d1(env)
  if (!db) return { persistence: 'request_only', items: [], stats: { watch: 0, sellers: 0, generated: 0, scans: 0 }, note: 'No D1 binding configured. The browser-local vault remains the active store; this endpoint is request-only.' }
  try {
    const rows = await db.prepare('SELECT id, kind, title, url, target_price, note, created_at FROM vault_items ORDER BY created_at DESC LIMIT 500').all<{ id: string; kind: 'watch' | 'seller'; title: string; url: string; target_price: string | null; note: string | null; created_at: string }>()
    const items: VaultItem[] = rows.results.map((row) => ({ id: row.id, kind: row.kind, title: row.title, url: row.url, targetPrice: row.target_price, note: row.note, createdAt: row.created_at }))
    const watch = items.filter((item) => item.kind === 'watch').length
    const sellers = items.filter((item) => item.kind === 'seller').length
    const generated = await db.prepare('SELECT COUNT(*) AS count FROM vault_generated').first<{ count: number }>()
    const scans = await db.prepare('SELECT COUNT(*) AS count FROM vault_scans').first<{ count: number }>()
    return { persistence: 'durable', items, stats: { watch, sellers, generated: generated?.count ?? 0, scans: scans?.count ?? 0 }, note: `D1 vault: ${items.length} item(s).` }
  } catch (error) {
    return { persistence: 'request_only', items: [], stats: { watch: 0, sellers: 0, generated: 0, scans: 0 }, note: `D1 read failed (${error instanceof Error ? error.message : 'unknown'}); request-only fallback.` }
  }
}

export async function addVaultItem(env: Env, item: { kind: 'watch' | 'seller'; title: string; url: string; targetPrice?: string | null; note?: string | null }): Promise<{ ok: boolean; persistence: 'durable' | 'request_only'; id?: string; error?: string }> {
  const db = d1(env)
  if (!db) return { ok: false, persistence: 'request_only', error: 'No D1 binding configured; vault is browser-local.' }
  const id = `v_${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`
  try {
    await db.prepare('INSERT INTO vault_items (id, kind, title, url, target_price, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(id, item.kind, item.title.slice(0, 300), item.url.slice(0, 2000), item.targetPrice ?? null, item.note ?? null, new Date().toISOString()).run()
    return { ok: true, persistence: 'durable', id }
  } catch (error) {
    return { ok: false, persistence: 'durable', error: error instanceof Error ? error.message : 'Unknown D1 error' }
  }
}

export async function removeVaultItem(env: Env, id: string): Promise<{ ok: boolean; persistence: 'durable' | 'request_only'; error?: string }> {
  const db = d1(env)
  if (!db) return { ok: false, persistence: 'request_only', error: 'No D1 binding configured.' }
  try {
    await db.prepare('DELETE FROM vault_items WHERE id = ?').bind(id).run()
    return { ok: true, persistence: 'durable' }
  } catch (error) {
    return { ok: false, persistence: 'durable', error: error instanceof Error ? error.message : 'Unknown D1 error' }
  }
}

export async function recordVaultGenerated(env: Env, title: string): Promise<void> {
  const db = d1(env)
  if (!db) return
  try { await db.prepare('INSERT INTO vault_generated (id, title, created_at) VALUES (?, ?, ?)').bind(`g_${Date.now()}`, title.slice(0, 300), new Date().toISOString()).run() } catch { /* best-effort */ }
}

export async function recordVaultScan(env: Env, urlCount: number, priceCount: number): Promise<void> {
  const db = d1(env)
  if (!db) return
  try { await db.prepare('INSERT INTO vault_scans (id, url_count, price_count, created_at) VALUES (?, ?, ?, ?)').bind(`s_${Date.now()}`, urlCount, priceCount, new Date().toISOString()).run() } catch { /* best-effort */ }
}

// ---------------------------------------------------------------------------
// Provider runs (observability) — D1 when bound
// ---------------------------------------------------------------------------

export type ProviderRunRecord = {
  id: string
  providerId: string
  task: string
  routeId?: string
  status: string
  errorCategory?: string
  latencyMs?: number
  cachedHit: boolean
  startedAt: string
  endedAt?: string
}

export async function recordProviderRun(env: Env, run: ProviderRunRecord): Promise<void> {
  const db = d1(env)
  if (!db) return
  try {
    await db.prepare('INSERT INTO provider_runs (id, provider_id, task, route_id, status, error_category, latency_ms, cached_hit, started_at, ended_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(run.id, run.providerId, run.task, run.routeId ?? null, run.status, run.errorCategory ?? null, run.latencyMs ?? null, run.cachedHit ? 1 : 0, run.startedAt, run.endedAt ?? null).run()
  } catch { /* best-effort */ }
}

// ---------------------------------------------------------------------------
// Trend observations — D1 when bound
// ---------------------------------------------------------------------------

export async function recordTrendObservation(env: Env, keyword: string, date: string, count: number, source: string): Promise<void> {
  const db = d1(env)
  if (!db) return
  try {
    await db.prepare('INSERT INTO trend_observations (keyword, observed_date, count, source, created_at) VALUES (?, ?, ?, ?, ?)').bind(keyword.slice(0, 120), date, count, source.slice(0, 200), new Date().toISOString()).run()
  } catch { /* best-effort */ }
}

export async function readTrendObservations(env: Env, keyword: string, sinceDays = 90): Promise<Array<{ date: string; count: number; source: string }>> {
  const db = d1(env)
  if (!db) return []
  try {
    const since = new Date(Date.now() - sinceDays * 86_400_000).toISOString().slice(0, 10)
    const rows = await db.prepare('SELECT observed_date, count, source FROM trend_observations WHERE keyword = ? AND observed_date >= ? ORDER BY observed_date ASC LIMIT 500').bind(keyword.slice(0, 120), since).all<{ observed_date: string; count: number; source: string }>()
    return rows.results.map((row) => ({ date: row.observed_date, count: row.count, source: row.source }))
  } catch { return [] }
}
