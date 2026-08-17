# AiBay Pro Live Capability Matrix

Test date: 2026-08-17. Tests used safe public targets and did not attack protected sites.

| Target/task | Route/provider | Result | Latency/behavior | Fallback | Notes |
| --- | --- | --- | --- | --- | --- |
| `https://www.aliexpress.us/item/3256812076709783.html` product import | `aliexpress-public-metadata` via local bounded HTTP | `session_required` | One redirect observed | Manual evidence/public manufacturer source | Anonymous request entered cookie synchronization; no session replay was attempted |
| `https://example.com/file.pdf` import | Local source-kind classifier | `unsupported` | Immediate bounded response | Manual evidence/document provider | PDF parsing is not configured in the Pages runtime |
| `https://example.com/search?q=shoes` import | Local source-kind classifier | `unsupported` | Immediate bounded response | Search provider or manual evidence | Search pages are not treated as product detail pages |
| `https://example.com/category/shoes` import | Local source-kind classifier | `unsupported` | Immediate bounded response | Crawl/search provider or manual evidence | Listing pages require a listing/crawl adapter |
| `https://example.com/products/sample` import | Local HTTP extraction | `incomplete` | HTTP 404 converted to source-specific result | Manual evidence | No unrelated fixture was substituted |
| Registry and provider health | Local registry | `ready` for local/manual; `not_configured` for optional external routes | Bounded metadata response | Local route | No external credentials are active in production |
| Route planning for public product import | Local deterministic planner | `planned` | Immediate request-scoped response | Registered provider fallback list | Reports request-only persistence until a queue/store binding exists |
| Product candidate normalization | Local research pipeline | `completed` | Deterministic in-process scoring | None required for supplied candidates | Canonical URL, fingerprint deduplication, missing-field validation, score explanation |
| Product candidate deduplication | `dedup.identity_fingerprint` v1 | `completed` | Deterministic in-process collapse | None required for supplied candidates | Duplicate candidates collapsed to the preferred entry with `duplicateOf` provenance link; conflicting values (e.g. price) reported as conflict labels, never merged silently |
| Cache status without bindings | Cache interface (`cache.ts`) | `edge` mode in Pages runtime; `request_only` fallback in runtimes without Cache API | Per-request metadata | Direct re-extraction | Reports mode/backend/durable/binding; cached values carry storedAt/expiresAt and are never authoritative |
| Extraction cache hit | Edge cache on repeated identical source URL | `hit: true` | No second source fetch | Re-extraction after TTL | Best-effort only; TTL enforced by envelope timestamp |
| Adapter contract inventory | `adapterRegistrySnapshot` | `local.evidence:ready`, `optional.apify.actors:not_configured` | Per-request metadata | — | Exposed in `/api/capabilities`, `/api/providers`, `/api/execute`; no credential values |
| Router execution (`/api/execute`) | Route → adapter → normalize → validate → cache | `completed` with observations/provenance | Attempt trail per provider | Re-run | Mocked e2e verified; sandbox has no outbound network so real fetch is blocked |
| Controlled fallback | Provider A transient failure | Provider B selected, `fallbackUsed: true` | A×2 `retryable_failure`, B `success` | — | Fallback events visible in attempt trail and provenance |
| Policy gate | `blocked_by_policy` | `blocked`, no fallback | Terminal | None | No retry or fallback around a policy gate |
| Unconfigured provider | `public_search` / Apify scaffold | `not_configured` (`skipped_unconfigured`) | No execution, nothing faked | — | UNCONFIGURED is reported, never `failed` |
| AI multi-route failover | Groq 429 → Gemini success (mocked) | `aiRouting.used = gemini` | Attempt trail `[rate_limited, success]` | Deterministic engine if all fail | No credential value ever returned; invented titles rejected |
| Provider inventory | `/api/providers` | `aiRoutes` + adapter limits/fallback | Per-request metadata | — | Names/models/hosts only; keys never exposed |
| Loopback route input | SSRF guard | `unsafe_destination` | Immediate rejection | None | Not retryable |
| Unsupported task input | Route endpoint validation | `unsupported_task` | Immediate rejection | None | Allowed task list returned |

## Interpretation

A `ready` local capability means the route is implemented and executable in the current Pages runtime. It does not mean every marketplace is publicly extractable. A provider listed as `not_configured` is intentionally not selected automatically. A `session_required`, `access_controlled`, or `unsupported` result is a successful safety decision, not a failed attempt to bypass a target.

## Regression suite

The local regression suite passed on 2026-08-17. It covered loopback rejection, private IPv4 rejection, unsupported task rejection, document/search/listing classification, source-bound 404 handling, automatic local route selection, provider-health inventory, Research Lab deduplication and scoring, CSV export provenance, the exact AliExpress session-dependent diagnostic, cache-interface write/hit/expiry behavior with the request-only fallback, versioned fingerprint deduplication with conflict labels, and the extraction cache-hit path. Unsafe destinations were classified as non-retryable.
