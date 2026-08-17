# AiBay Rebuild Plan

## Executive decision

AiBay should remain a Cloudflare-native application, but the current synchronous Pages-only prototype must be rebuilt around a provider-neutral research job model. The user experience should always show the real state of each stage: queued, running, completed, blocked, unavailable, or needs review. It must never replace a failed exact-source extraction with a different product, image set, fixture, or fabricated market data.

The reported AliExpress failure is reproducible. `POST /api/products/extract` for the supplied product path returns HTTP 409 with `status: blocked`, `sourceDiagnostic.status: session_required`, and a cookie-synchronization redirect to `login.aliexpress.com`. The current stop is policy-correct, but the product experience is too narrow: it makes the safe stop feel like the entire application has failed instead of converting the source into a guided multi-route research job with clear next actions.

## Competitive capability target

Public Zik Analytics positioning emphasizes live sold-listing data, competitor research, supplier matching, category and keyword research, trend discovery, multi-marketplace coverage, bulk scanning, title and price analytics, and automated product discovery.[1] AiBay should target the same user outcomes through a more transparent evidence model: every number must carry a source, capture time, method, and confidence state; every unavailable provider must be visible; and every listing output remains draft-only until human approval.

| Capability family | AiBay target behavior | Evidence requirement |
|---|---|---|
| Product import | Accept public product pages, structured metadata, permitted documents, images, pasted evidence, and supported marketplace URLs | Exact source URL, canonical URL, source kind, retrieval state, fields, variants, images, timestamps |
| Marketplace research | Search active eBay listings through the official Browse API when configured; use public-reader fallback only when the source permits it | Provider, marketplace, query, filters, item IDs, observed prices, shipping, condition, seller, capture time |
| Sold/demand analytics | Use official or user-supplied historical sales evidence; do not label active listings as sold data | Sold source, period, sample size, confidence, API eligibility state |
| Competitor research | Analyze supplied seller/store URLs or permitted API results; summarize listings, prices, categories, and changes | Seller/source URL, observation window, listing IDs, deduplication and conflict trail |
| Supplier matching | Match by GTIN/MPN/title/image only where a permitted source or API returns evidence | Supplier source, match key, match confidence, cost, shipping, availability timestamp |
| Trends and keywords | Compute trend deltas, sell-through, title terms, and gaps only from supplied or retrieved observations | Observation series, thresholds, sample size, methodology, insufficient-evidence state |
| Listing optimization | Generate reviewable titles, specifics, descriptions, pricing band, margin, and quality gates | Product evidence, market snapshot, assumptions, policy checks, human-review requirement |
| Media | Store rights-cleared originals and reviewable derivatives separately; never silently alter product identity | Original hash, rights confirmation, transformation request, derivative metadata, operator review |

## Architecture options

| Approach | Tradeoffs | Cost | Setup complexity |
|---|---|---:|---:|
| **Cloudflare-native AiBay**: Pages frontend/Functions, D1, KV, R2, Queues, official eBay APIs, optional AI routes | Lowest operational surface and best fit for the current deployment. Strong for durable jobs, caching, evidence storage, and realtime progress via polling or Server-Sent Events. It cannot make protected marketplace pages public or unlock restricted sold-data APIs. | Lowest incremental cost; R2 and Queue remain usage-metered and official API credentials are user-owned | Moderate; requires binding validation, schema migrations, provider secrets, and queue consumer behavior |
| **Cloudflare frontend plus separate rendering/research service**: Pages remains the UI while a user-owned backend handles permitted JavaScript rendering, document parsing, and provider fan-out | More capable for public JS-heavy pages and heavier parsing, but adds an additional service, secret boundary, monitoring, and cost. It still cannot bypass login, CAPTCHA, paywalls, or target controls. | Higher; depends on the chosen service and runtime | High; requires API contracts, retries, observability, and cross-service auth |

The recommended route is the **Cloudflare-native AiBay path first**, with a clean adapter contract so a rendering service can be added later for permitted public pages. A separate service should be introduced only after the native route is measured against real public sources and a concrete capability gap remains.

## Real-time job model

Every import or research action becomes an idempotent job with a durable record in D1 and progress events in KV or a short-lived event stream. The frontend subscribes to progress and can recover by requesting a job snapshot. Queue messages must contain only a job ID and bounded task metadata; raw credentials and large source payloads remain in server-side storage.

```text
User action
  -> validate URL/consent/task
  -> create idempotent job
  -> plan permitted routes
  -> run public/API adapters with bounded retries
  -> emit progress event for each stage
  -> normalize evidence and media references
  -> deduplicate and validate conflicts
  -> compute analytics with explicit assumptions
  -> persist snapshot and exportable report
  -> present review gates and next action
```

The job UI must show the source-specific reason when a route stops. For a session-dependent AliExpress page, the user should see a completed safety decision, a clear manual-evidence route, a public-manufacturer alternative, and the ability to continue researching the same product by GTIN/MPN/title if the user supplies those facts. It should not simply show an error card with an empty workspace.

## Provider routing

The provider registry will distinguish `ready`, `configured`, `degraded`, `rate_limited`, `blocked`, `session_required`, `unsupported`, and `not_configured`. The planner selects the least privileged route that satisfies the task, records every attempted route, and never treats a blocked or missing provider as a success.

The official eBay Browse API can search listings by keyword, category, GTIN, product, and image, and can retrieve item details; it requires an application access token obtained through the client-credentials flow.[2] The Buy APIs support eBay US and several other marketplaces, but not every Buy API is available in every marketplace. The Marketplace Insights API is restricted and not open to new users, so AiBay must not promise unrestricted historical sold-data coverage.[3]

## Acceptance criteria for the rebuild

1. Pasting the supplied AliExpress URL produces a real job timeline, a source-specific `session_required` state, and a guided continuation workspace instead of an opaque error. No unrelated product or image may appear.
2. Public product pages with JSON-LD, Open Graph, canonical links, visible price, images, and selectable options produce a source-bound record with field-level provenance.
3. Document and image URLs are classified and routed to permitted parsers or upload/review flows rather than rejected by the product extractor with no useful next action.
4. eBay Browse API credentials, when supplied server-side, produce live item summaries and item details with a marketplace and capture timestamp. When unavailable or blocked, the UI says so explicitly.
5. Active listings, sold evidence, supplied observations, and inferred estimates are distinct data classes. No active-listing snapshot is labeled sold data.
6. Queue-backed jobs survive a page refresh; progress can be resumed from the job ID; duplicate submissions collapse through idempotency keys.
7. R2 stores source artifacts and derivatives under an AiBay-specific namespace/bucket. Original and derivative hashes remain linked.
8. The responsive UI has a single research command center, a source/evidence drawer, a live progress rail, market analytics, competitor/supplier tabs, a draft optimizer, and export controls that preserve provenance.
9. All public endpoints have adversarial tests for SSRF, redirects, oversized content, blocked pages, malformed evidence, stale jobs, and provider timeouts.
10. Production verification is run against the authorized Georgelsmith project only. Trynex and the existing `aibay-pro` project remain outside the deployment scope.

## References

[1]: [ZIK Analytics eBay product research features](https://www.zikanalytics.com/ebay/product-research)
[2]: [eBay Browse API](https://developer.ebay.com/develop/api/buy/browse_api)
[3]: [eBay Buy API support by marketplace](https://developer.ebay.com/api-docs/buy/static/ref-marketplace-supported.html)
