# AiBay Pro Master Architecture

## Scope

AiBay Pro is an evidence-backed product-research and eBay draft workspace that is being extended into a bounded web-intelligence orchestration platform. The system may automatically select among permitted execution routes, but it must never bypass authentication, CAPTCHA, paywalls, private sessions, provider restrictions, or target-site controls.

> The platform can be autonomous in **planning, route selection, retries, normalization, validation, and evidence handling** without being autonomous in bypassing access controls or making unsupported claims.

## Current source of truth

| Concern | Current source of truth | Status |
| --- | --- | --- |
| Frontend | `src/App.tsx`, `src/App.css`, `src/types/aibay.ts`, `src/lib/demo.ts` | Active React/Vite workspace |
| Edge backend | `functions/` | Active Cloudflare Pages Functions |
| HTTP safety | `functions/lib/security.ts`, `functions/_middleware.ts` | Active baseline; full DNS/IP validation remains a hardening item |
| Public extraction | `functions/lib/extraction.ts`, `functions/lib/source-adapters.ts` | Active bounded metadata extraction |
| eBay research | `functions/api/ebay/research.ts` | Official Browse API adapter when configured; otherwise explicit non-live state |
| Listing generation | `functions/lib/listing.ts`, `functions/api/products/optimize.ts` | Active deterministic draft engine with optional conservative AI title ranking |
| Media | `functions/api/media/enhance.ts` | Rights-gated review contract; generation/storage not yet durable |
| Cache and dedup | `functions/lib/cache.ts`, `functions/lib/dedup.ts` | Active interface layer: best-effort edge cache with an explicit request-only fallback, plus versioned identity-fingerprint deduplication with conflict labels |
| Provider adapter contract | `functions/lib/adapter.ts`, `functions/lib/adapters.ts` | Active contract (`v1`) with one real adapter (`local.evidence`, wired through the router) and scaffold adapters that report `not_configured` truthfully |
| Router execution | `functions/lib/execution.ts`, `functions/api/execute.ts` | Active bounded execution: route → adapter → normalize → provenance → validate → cache; retries and fallback recorded in an attempt trail |
| Job state | `functions/api/imports.ts`, `functions/api/jobs/[id].ts` | Transitional synchronous/request-contract layer; durable queue/store not active |
| Database/storage/queue | `wrangler.toml`, `infra/schema.sql` | Planned but not bound in the isolated Pages project |
| Production | `https://aibay-pro.pages.dev` | Active isolated project; deployment is direct Wrangler upload because GitHub webhook builds are unreliable |
| Repository | `georgelsmith333-hub/Aibay-pro` | `main` branch |

## Target execution flow

```text
User objective
  -> task validation and policy gate
  -> capability planning
  -> provider/capability health selection
  -> bounded execution route
  -> structured observations and progress events
  -> evidence normalization and provenance
  -> deduplication and validation
  -> result scoring or listing draft generation
  -> human review and export
```

The route planner prefers the least expensive and least privileged route that can satisfy the task. Static public metadata is attempted before browser or external providers. Browser or external adapters are never selected when they are not configured, when the task requires restricted access, or when the provider’s documented capability does not match the requested operation.

## Infrastructure transition

The current production project is Pages-only. It has no active durable job queue, database, R2 bucket, or external provider credentials. Therefore, the first orchestration slice must remain request-safe and truthful. A durable job state implementation requires a Cloudflare binding or another user-owned datastore; until such a binding is explicitly configured, job state is represented as bounded request evidence and must not be advertised as persistent queue execution.

Future durable execution can use a Cloudflare queue plus D1/KV/R2 or a managed backend, but it must be introduced as a separate migration with binding validation, retention rules, cancellation semantics, and replay-safe idempotency. No new production project should be created for that transition without explicit need.

## Compliance boundary

The system rejects unsafe URLs, credential-bearing URLs, private or loopback destinations, and unsafe redirects. It records blocked reasons and alternatives. It does not replay cookies, imitate logged-in browsers, solve CAPTCHAs, evade rate limits, or use undocumented/private endpoints. Every extracted value remains associated with source URL, source host, retrieval time, method, provider, and validation state.

## Migration sequence

1. Stabilize shared capability, provider, route, job, and provenance types. — **done**
2. Replace the placeholder capability response with a formal registry that exposes configured versus local routes truthfully. — **done**
3. Introduce deterministic route selection and failure classification while retaining the current direct extractor. — **done**
4. Add cache and deduplication interfaces with an explicit request-only fallback until durable bindings are available. — **done** (audited 2026-08-17: 16/16 local checks, mocked e2e, risk register in `docs/AIBAY_RELEASE_STATUS.md`)
5. Add optional documented provider adapters behind server-side credentials. — **foundation done**: generic adapter contract `v1`, adapter registry, one real adapter (`local.evidence`) wired through the router via `POST /api/execute`, retry/fallback/attempt-trail semantics, UNCONFIGURED truthfulness for scaffolds (Apify). Remaining: promote additional adapters only when server-side credentials and documented capability checks exist.
6. Add durable queue/store only after infrastructure bindings are configured and verified. — **not started** (binding-gated by design)
7. Expand product discovery and research workflows without coupling them to any single provider. — **not started**
8. Keep the current evidence-backed eBay draft and export safeguards as the stable product surface throughout the migration. — **maintained** (contract checks pass)
