// Idempotent Cloudflare infrastructure bootstrap (used by CI and operators).
// Creates-or-finds: D1 database, KV namespace, R2 bucket, Queue.
// Then materializes the real IDs into wrangler.toml (uncommenting bindings).
// Requires env: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID.
// Writes .infra.env with D1_ID / KV_ID / R2_BUCKET / QUEUE_NAME for later steps.
// Cross-platform: paths are resolved with fileURLToPath (Windows-safe).
import { writeFileSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const TOKEN = process.env.CLOUDFLARE_API_TOKEN
const ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID
if (!TOKEN || !ACCOUNT) {
  console.error('Missing CLOUDFLARE_API_TOKEN or CLOUDFLARE_ACCOUNT_ID')
  process.exit(1)
}

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const WRANGLER_PATH = fileURLToPath(new URL('../wrangler.toml', import.meta.url))
const INFRA_ENV_PATH = fileURLToPath(new URL('../.infra.env', import.meta.url))

const API = 'https://api.cloudflare.com/client/v4'
const headers = { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' }

async function cf(path, init = {}) {
  const response = await fetch(`${API}${path}`, { ...init, headers: { ...headers, ...(init.headers ?? {}) } })
  const text = await response.text()
  let json = null
  try { json = JSON.parse(text) } catch { json = { raw: text } }
  if (!response.ok && !json.success) {
    return { ok: false, status: response.status, json }
  }
  return { ok: true, status: response.status, json }
}

const out = {}
const failures = []

// D1
{
  const list = await cf(`/accounts/${ACCOUNT}/d1/database`)
  let id = list.ok ? list.json.result?.find((db) => db.name === 'aibay-db')?.uuid : null
  if (!id) {
    const created = await cf(`/accounts/${ACCOUNT}/d1/database`, { method: 'POST', body: JSON.stringify({ name: 'aibay-db' }) })
    id = created.ok ? created.json.result?.uuid : null
    if (!id) failures.push(`D1 create: ${created.status} ${JSON.stringify(created.json).slice(0, 200)}`)
  }
  out.D1_ID = id ?? ''
  console.log(`D1 aibay-db: ${id ? `ready (${id.slice(0, 8)}…)` : 'FAILED'}`)
}

// KV
{
  const list = await cf(`/accounts/${ACCOUNT}/storage/kv/namespaces`)
  let id = list.ok ? list.json.result?.find((ns) => ns.title === 'aibay-cache')?.id : null
  if (!id) {
    const created = await cf(`/accounts/${ACCOUNT}/storage/kv/namespaces`, { method: 'POST', body: JSON.stringify({ title: 'aibay-cache' }) })
    id = created.ok ? created.json.result?.id : null
    if (!id) failures.push(`KV create: ${created.status} ${JSON.stringify(created.json).slice(0, 200)}`)
  }
  out.KV_ID = id ?? ''
  console.log(`KV aibay-cache: ${id ? `ready (${id.slice(0, 8)}…)` : 'FAILED'}`)
}

// R2
{
  const list = await cf(`/accounts/${ACCOUNT}/r2/buckets`)
  let exists = list.ok ? list.json.result?.buckets?.some((bucket) => bucket.name === 'aibay-media') : false
  if (!exists) {
    const created = await cf(`/accounts/${ACCOUNT}/r2/buckets`, { method: 'POST', body: JSON.stringify({ name: 'aibay-media' }) })
    // Re-list to confirm (create may 400 if the bucket already exists in another view)
    const relist = await cf(`/accounts/${ACCOUNT}/r2/buckets`)
    exists = relist.ok ? relist.json.result?.buckets?.some((bucket) => bucket.name === 'aibay-media') : false
    if (!exists) failures.push(`R2 create: ${created.status} ${JSON.stringify(created.json).slice(0, 200)}`)
  }
  out.R2_BUCKET = exists ? 'aibay-media' : ''
  console.log(`R2 aibay-media: ${exists ? 'ready' : 'FAILED'}`)
}

// Queue (optional — may require a paid plan)
{
  const created = await cf(`/accounts/${ACCOUNT}/queues/aibay-jobs`, { method: 'PUT', body: JSON.stringify({}) })
  if (created.ok) {
    out.QUEUE_NAME = 'aibay-jobs'
    console.log('Queue aibay-jobs: ready')
  } else {
    out.QUEUE_NAME = ''
    console.log(`Queue aibay-jobs: not available (${created.status}) — optional, producer binding left disabled. ${JSON.stringify(created.json).slice(0, 160)}`)
  }
}

// Materialize wrangler.toml (Windows-safe path)
{
  let toml = readFileSync(WRANGLER_PATH, 'utf8')
  const d1Block = out.D1_ID ? `[[d1_databases]]\nbinding = "DB"\ndatabase_name = "aibay-db"\ndatabase_id = "${out.D1_ID}"\n` : ''
  const kvBlock = out.KV_ID ? `[[kv_namespaces]]\nbinding = "CACHE_KV"\nid = "${out.KV_ID}"\n` : ''
  const r2Block = out.R2_BUCKET ? `[[r2_buckets]]\nbinding = "MEDIA_BUCKET"\nbucket_name = "${out.R2_BUCKET}"\n` : ''
  const queueBlock = out.QUEUE_NAME ? `[[queues.producers]]\nbinding = "JOB_QUEUE"\nqueue = "${out.QUEUE_NAME}"\n` : ''
  toml = toml.replace(/\n# --- generated bindings ---[\s\S]*$/, '')
  toml = toml.trimEnd() + '\n\n# --- generated bindings ---\n' + [d1Block, kvBlock, r2Block, queueBlock].filter(Boolean).join('')
  writeFileSync(WRANGLER_PATH, toml)
  console.log(`wrangler.toml materialized at ${WRANGLER_PATH}`)
}

// Write .infra.env even if some resources failed, so later steps can proceed
writeFileSync(INFRA_ENV_PATH, Object.entries(out).map(([key, value]) => `${key}=${value}`).join('\n') + '\n')
console.log(`Wrote ${INFRA_ENV_PATH}`)

if (failures.length) {
  console.error(`\n⚠️  ${failures.length} resource(s) could not be created:`)
  for (const failure of failures) console.error(`  - ${failure}`)
  console.error('This is non-fatal for deploy when D1 is available; check your plan permissions.')
}
