# AiBay Pro Release Status

Verification labels (2026-08-17):

- **VERIFIED LOCAL** — exercised in this repository's runtime with no external network (unit/integration).
- **VERIFIED MOCKED E2E** — exercised end-to-end through the real handler/router with mocked fetch/cache primitives.
- **VERIFIED REAL EXTERNAL** — exercised against a real external endpoint (production or public target).
- **UNVERIFIED** — implemented but not yet exercised.
- **UNCONFIGURED** — requires server-side credentials/bindings that are not present; truthful non-live state.
- **BLOCKED** — could not be exercised in the current environment (e.g. sandbox has no outbound network).

## Deployment state

| Item | State |
| --- | --- |
| Production (`https://aibay-pro.pages.dev`) | Live, but running commit `307e54a` (pre-Step-4 build: no cache/dedup metadata, no `/api/execute`) |
| Preview for `arena/01a00d12-aibay-pro` | **Not deployed** — no Cloudflare Pages preview exists for the branch or commit `6fcdcfc` |
| Local dev server (`wrangler pages dev`) | Running commit `6fcdcfc` + Step-5 working tree |
| Deployment method | Direct Wrangler upload by the operator; GitHub webhook builds unreliable (no GitHub deployment records exist) |

Step-4 (`6fcdcfc`) and the Step-5 foundation in this working tree are **not deployed anywhere yet** — deployment is an operator action (`pnpm deploy:pages` or `wrangler pages deploy dist`). Nothing in this document claims otherwise.

## Step 4 — cache and deduplication interfaces

| Component | Verification |
| --- | --- |
| `functions/lib/cache.ts` — `CacheStore` contract, `EdgeCacheStore`, `RequestOnlyCache` | VERIFIED LOCAL (16/16 audit checks: roundtrip, TTL expiry + clamp, oversize rejection, deterministic keys, truthful health, request-only fallback) + VERIFIED MOCKED E2E (extraction cache hit with zero refetch; blocked sources never cached; cache read/write failures never destroy extraction results) |
| `functions/lib/dedup.ts` — canonical URL, SKU/identity/URL fingerprints v1, `duplicateOf`, conflict labels | VERIFIED LOCAL (canonicalization, all fingerprint modes, prefer-by-score, determinism, conflict preservation, no silent merging) |
| `functions/lib/research.ts` — pipeline integration | VERIFIED LOCAL (deterministic repeated execution, conflictCount, dedup report) + VERIFIED MOCKED E2E (`/api/products/research`) |
| `/api/products/extract` cache integration | VERIFIED LOCAL + VERIFIED MOCKED E2E; REAL EXTERNAL BLOCKED (sandbox has no outbound network) |
| `/api/capabilities`, `/api/route`, `/api/jobs`, `/api/jobs/:id` cache/dedup metadata | VERIFIED LOCAL (runtime responses include mode/backend/durable/binding + fingerprint version) |
| Durable infrastructure wiring (D1, KV, R2, Queue) | VERIFIED LOCAL (6/6 wiring checks) + live fallback smoke (`/api/infra`, `/api/vault` truthful request_only). PRODUCTION state: PENDING operator deploy via `scripts/deploy.sh` (sandbox cannot reach api.cloudflare.com; bot cannot push workflow files or set Actions secrets) |
| Cloudflare Workers AI auto-route | VERIFIED LOCAL (auto-route appears only with CLOUDFLARE_* secrets; keys never leak). PRODUCTION: activates once deploy.sh sets the Pages secrets |
| Apify eBay actor (no-eBay-dev-app live market path) | VERIFIED MOCKED E2E (6/6: status truth table, run→poll→dataset→normalize with provenance, rate-limit classification, `/api/ebay/research` fallback contract, 412-when-nothing, demo branch intact). PRODUCTION: activates when APIFY_API_TOKEN + APIFY_EBay_CANARY are set |
| Premium design layer (aurora background, glass surfaces, gradient glows, motion) | VERIFIED LOCAL (production build; no layout regressions in smoke) |

## Step 5 — provider-adapter foundation

| Component | Verification |
| --- | --- |
| `functions/lib/adapter.ts` — generic adapter contract (`capabilities`, `canHandle`, `health`, `estimate`, `execute`, `normalize`, `classifyError`) + metadata/limits/fallback/versioning | VERIFIED LOCAL (type-checked; exercised by all adapters) |
| `functions/lib/adapters.ts` — adapter registry + registry snapshot | VERIFIED LOCAL (7/7 checks: snapshot shape, limits, fallback priority, no credential leakage with a real token in env) |
| `local.evidence` adapter (real execution path) | VERIFIED MOCKED E2E through the router (route selection -> execute -> normalize -> provenance -> validation -> cache write -> cache hit with zero refetch) |
| Router integration `functions/lib/execution.ts` + `POST /api/execute` | VERIFIED MOCKED E2E (7/7 checks) + VERIFIED LOCAL (runtime smoke: attempt trail, bounded retries, error classification, adapter inventory in response) |
| Fallback: provider A transient failure -> provider B success | VERIFIED MOCKED E2E (controlled failure: A×2 retryable_failure, B success, `fallbackUsed: true`, provenance shows B, failed attempt carries classified error) |
| Policy gate: `blocked_by_policy` is terminal, no fallback | VERIFIED MOCKED E2E (no retry, no fallback around the gate) |
| UNCONFIGURED truthfulness (Apify scaffold, `public_search` -> Firecrawl) | VERIFIED MOCKED E2E + VERIFIED LOCAL (runtime: `not_configured`, `skipped_unconfigured`, never `failed`, nothing faked) |
| Existing eBay research contract | VERIFIED LOCAL (demo branch returns labelled demo; production without credentials returns 412 `ebay_credentials_required` — unchanged) |
| Existing endpoints compatibility (`extract`, `research`, `route`, `jobs`, `capabilities`, `providers`) | VERIFIED LOCAL (runtime matrix, valid + invalid inputs) |
| REAL EXTERNAL web extraction (example.com etc.) | BLOCKED — sandbox has no outbound network (verified: shell `curl` returns 000; workerd fetch fails). Requires the operator's environment or a deployed preview |
| Free multi-route AI router (`functions/lib/ai.ts`) | VERIFIED MOCKED E2E (7/7: route parsing, no-key deterministic fallback, 429 failover, all-fail fallback, credential classification without retry, invented-title rejection, malformed env safety) + VERIFIED MOCKED E2E at the `/api/products/optimize` handler (failover report, no key leakage) |
| Frontend upgrade (Provider center, free-engine framing, memoized views, chunk-split bundle) | VERIFIED LOCAL (production build, live dev-server smoke: `/api/providers` aiRoutes, `/api/products/optimize` aiRouting, chunk-split assets served) |
| Provider credentials | VERIFIED — no credential values anywhere in code, responses, metadata, or docs (leak test with a real token in env passed) |
| Intelligence layer (`functions/lib/intelligence.ts`: capability graph, opportunity scoring, price/trend, listing quality, source quality, contradictions, change detection, evidence graph, 14 research missions) | VERIFIED LOCAL (18/18 checks) + VERIFIED MOCKED E2E (opportunity/price/evidence/missions/capabilities endpoints) |
| Intelligence endpoints (`/api/intelligence/*`, `/api/research/missions`, `/api/research/missions/run`) | VERIFIED MOCKED E2E + VERIFIED LOCAL (live dev-server smoke) |
| Mission control UI (missions, opportunity scorer, price analyzer, evidence panel) | VERIFIED LOCAL (production build; live dev-server smoke) |
| Competitive + acceptance matrices | VERIFIED — written from documented public knowledge and repository truth; no invented competitor features |
| Tool suite (`/api/tools/profit|keywords|scanner|generate`, `/api/trends/hot`, browser-local vault) | VERIFIED MOCKED E2E (13/13) + VERIFIED LOCAL (live dev-server smoke) |
| Render competitor teardown (`docs/AIBAY_RENDER_COMPETITOR_TEARDOWN.md`) | VERIFIED — every claim traced to the live deployment's own responses (price=0, template boilerplate, placeholder watchlist row) |

## Step-4 risk register (inspected 2026-08-17)

| Risk | Finding | Status |
| --- | --- | --- |
| Stale inline cache logic | None — single `caches` accessor in `cache.ts`; no `readCached`/`writeCached` leftovers | Closed |
| Duplicate dedup logic | None — single fingerprint implementation in `dedup.ts` | Closed |
| Inconsistent cache keys | Found: extract used raw asserted URL; source-adapters and dedup strip different tracking-param sets. Fixed: `extractionCacheKey()` (SSRF-validated + adapter-normalized) is now the single key derivation used by extract and executor | Closed in Step 5 |
| Inconsistent fingerprint algorithms | Single versioned implementation (`identityFingerprint` v1) | Closed |
| Cache poisoning | Keys are URL-derived; entries are envelope-versioned, size-bounded, TTL-enforced; blocked/failed results are never cached. Residual: URL-equivalent keys (canonicalization) — accepted, documented | Accepted residual |
| Stale response reuse | TTL 300 s default enforced by envelope `expiresAt` (not only cache-control); `freshnessSeconds` reported | Closed |
| Incorrect TTL | Clamped 1..86400 s; expired entries removed on read | Closed |
| Cross-source collisions | Per-concern namespaces (`public-extraction`, `registry`, `route`, `jobs`, `capabilities`); keys are full canonical URLs | Closed |
| Conflict info lost downstream | Preserved through `normalizeAndDeduplicate` (conflicts + conflictCount) and JSON export. CSV/Markdown export columns do not include `conflicts` (fixed column set) — noted, not changed to avoid altering the export contract | Accepted residual |
| `web.scrape.static` / `web.search` absent from registry while documented | Added both capabilities with truthful statuses; `public_scrape` now routes to `local.evidence`, `public_search` to `not_configured` Firecrawl | Closed in Step 5 |
