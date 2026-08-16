# AiBay Pro Live Capability Matrix

Test date: 2026-08-16. Tests used safe public targets and did not attack protected sites.

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
| Loopback route input | SSRF guard | `unsafe_destination` | Immediate rejection | None | Not retryable |
| Unsupported task input | Route endpoint validation | `unsupported_task` | Immediate rejection | None | Allowed task list returned |

## Interpretation

A `ready` local capability means the route is implemented and executable in the current Pages runtime. It does not mean every marketplace is publicly extractable. A provider listed as `not_configured` is intentionally not selected automatically. A `session_required`, `access_controlled`, or `unsupported` result is a successful safety decision, not a failed attempt to bypass a target.

## Regression suite

The local regression suite passed on 2026-08-16. It covered loopback rejection, private IPv4 rejection, unsupported task rejection, document/search/listing classification, source-bound 404 handling, automatic local route selection, provider-health inventory, Research Lab deduplication and scoring, CSV export provenance, and the exact AliExpress session-dependent diagnostic. Unsafe destinations were classified as non-retryable.
