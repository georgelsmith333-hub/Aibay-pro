# AiBay Pro Provider Matrix

Source of truth: `functions/lib/adapter.ts` (contract), `functions/lib/adapters.ts` (registry), `functions/lib/registry.ts` (capability registry). Updated: 2026-08-17.

| Provider | Capability | Configuration | Environment | Health | Version | Fallback | Verification status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `local.evidence` (Local evidence engine) | `web.extract.public_metadata`, `web.extract.structured`, `web.scrape.static`, `ecommerce.product`, `source.health` | None (`auth: none`) | Pages runtime (bounded HTTP; no credential) | `ready` (always, local) | `1.0.0` (contract `v1`) | `manual.evidence` | VERIFIED LOCAL + VERIFIED MOCKED E2E (through router); REAL EXTERNAL blocked in sandbox (no egress) |
| `optional.apify.actors` (Apify Actors) | `web.scrape.browser`, `web.crawl`, `web.search` | `APIFY_API_TOKEN`, `APIFY_ACTOR_ID`, `APIFY_ACTOR_CONTRACT=validated` — all server-side secrets; never in client code | BYOK external (documented API only) | `not_configured` in current production (no token); also `not_configured` with token until actor pinned + contract validated | `0.1.0` (contract `v1`) | `local.evidence`, `manual.evidence` | UNCONFIGURED (scaffold; never executes, never fakes a run) |
| `official.ebay.browse` (eBay Browse API) | `market.ebay_us` | `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET` — server-side | Official API (OAuth client credentials) | `not_configured` in current production; `ready` when both secrets configured | registry entry (Browse API v1 contract) | `example.market`, `unavailable.market` (never fake live data) | UNCONFIGURED; contract unchanged and verified LOCAL (demo + credential-required branches) |
| `optional.firecrawl.v2` (Firecrawl v2) | `web.search`, `web.scrape.static`, `web.extract.structured` | `FIRECRAWL_API_KEY` — server-side | BYOK external (documented endpoints) | `not_configured` in current production | registry entry (contract `v1`) | `local.evidence`, `manual.evidence` | UNCONFIGURED; no adapter registered yet (registry entry only) |
| `optional.cloudflare.browser_run` (Browser Run) | `web.scrape.browser`, `web.extract.structured`, `document.pdf`, `image.extract` | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `BROWSER_RUN_CANARY` — server-side | Cloudflare Browser Run REST quick actions (`/content`, `/markdown`, `/screenshot`, `/scrape`) | `ready` only after a real canary run passes (`BROWSER_RUN_CANARY` set by the deploy pipeline); `not_configured` otherwise | `0.2.0` (contract `v1`) | `local.evidence`, `manual.evidence` | UNCONFIGURED until canary; adapter registered and canary-gated |
| `optional.ai.ranking` (Conservative AI ranking) | `listing.title_rank` | `AI_PROVIDER_API_KEY`, `AI_PROVIDER_BASE_URL`, `AI_PROVIDER_MODEL` — server-side | BYOK external | `not_configured` in current production | registry entry | `local.evidence` | UNCONFIGURED; not routed through the adapter contract (title ranking only) |
| `manual.evidence` (User-provided evidence) | `evidence.manual` | None | Local | `ready` | registry entry | — | VERIFIED LOCAL; not an executable adapter (user input path, never auto-executed) |

## AI routing (free multi-route)

AI title ranking (`functions/lib/ai.ts`) reads `AI_ROUTES` (JSON array, server-side) plus the legacy `AI_PROVIDER_*` secrets. Each entry: `{ id, label, baseUrl, apiKey, model, freeTier?, costClass? }`. Routes are tried in order with bounded per-route timeouts (12 s), and fail over on `invalid_credentials`, `rate_limited`, `transient`, and `invalid_response` outcomes. The model may only reorder/trim supplied candidate titles; invented titles are rejected and the next route (or the deterministic engine) is used. Credential values never appear in responses; `/api/providers` lists only names, models, and hosts.

| Route (example) | Endpoint | Model | Tier | Failover behavior |
| --- | --- | --- | --- | --- |
| Groq | `https://api.groq.com/openai/v1` | `llama-3.3-70b-versatile` | Free tier | 429 → next route |
| Google Gemini | `https://generativelanguage.googleapis.com/v1beta/openai` | `gemini-2.0-flash` | Free tier | 401/403 → next route |
| OpenRouter | `https://openrouter.ai/api/v1` | `meta-llama/llama-3.3-70b-instruct:free` | `:free` models | 429 → next route |
| Cloudflare Workers AI (auto) | `https://api.cloudflare.com/client/v4/accounts/<id>/ai/v1` | `@cf/meta/llama-3.3-70b-instruct-fp8-fast` (override with `WORKERS_AI_MODEL`) | Free allocation (~18-45M tokens/mo on the free tier) | Auto-configured when `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` are set; any failure → next route |
| Local Ollama (dev only) | `http://127.0.0.1:11434/v1` | `llama3.2` | Local | Any failure → next route |

Every route is user-owned and documented. AiBay never bypasses rate limits, auth, or access controls; provider responses are respected and reported truthfully in the `aiRouting` report returned by `/api/products/optimize`.

## Adapter contract

Every adapter implements: `capabilities()`, `canHandle(task, capabilityId?)`, `health(env)`, `staticHealth(env)`, `estimate(task, capabilityId)`, `execute(ctx)`, `normalize(raw, ctx)`, `classifyError(error, status?)`. The router (`functions/lib/execution.ts`) depends only on this abstraction.

Adapter metadata includes: provider ID, capability IDs, configuration requirements (names only), local/free/BYOK/paid classification, health, version, limits (timeout, redirects, bytes, retries), and ordered fallback priority.

## Versioning lifecycle

`discover -> compatibility check -> health check -> promote`. There is no "always use latest": every adapter pins a version in metadata, and external adapters require an explicit promotion signal (e.g. `APIFY_ACTOR_CONTRACT=validated`) before they are considered ready. A known-good production provider is never replaced automatically by an unverified version.

## Limits

| Adapter | Timeout | Max redirects | Max bytes | Max retry attempts |
| --- | --- | --- | --- | --- |
| `local.evidence` | 12 000 ms | 3 | 1 500 000 | 2 |
| `optional.cloudflare.browser_run` | 25 000 ms | 0 (quick actions) | 0 (API JSON) | 1 |
| `optional.apify.actors` | 30 000 ms (when promoted) | 0 (API calls) | 0 (API JSON) | 1 |

## Security

- Adapters never bypass the policy gate: URL safety, SSRF protection (including per-redirect), redirect validation, consent/rights gate, and credential isolation all apply before and during execution.
- Unconfigured adapters report `not_configured`, never `failed`, and never execute.
- Credential values never appear in registry entries, adapter metadata, responses, or logs — only configuration key names.
