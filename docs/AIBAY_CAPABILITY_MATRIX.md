# AiBay Pro — Live Capability Matrix and Operator Runbook

**Status date:** 17 August 2026

**Production URL:** [aibay-pro-george-live.pages.dev](https://aibay-pro-george-live.pages.dev)

**Deployment target:** Georgelsmith Cloudflare account, Pages project `aibay-pro-george-live`

**Source branch:** `arena/01a00d12-aibay-pro`

**Latest verified commit:** `157c790`

## Executive status

AiBay Pro is now a live, Cloudflare-native evidence workspace rather than a local-only demo. The deployed application preserves exact source URLs, refuses unauthorized or session-dependent acquisition, exposes the real provider state, stores research-job results in D1 when available, uses the configured Queue only when an explicit consumer is enabled, and falls back synchronously rather than placing work into an unprocessed queue.

The production contract remains deliberately honest. eBay research currently returns a truthful blocked state from the public reader because the production edge request receives HTTP 403, and no eBay Browse credentials are configured. The application does not insert substitute listings, images, sold numbers, or unrelated products. This is a capability boundary, not a hidden failure.

> **Safety rule:** Active-listing observations are never relabeled as sold history. CAPTCHA solving, session-cookie replay, login emulation, identity rotation, and anti-bot evasion are not implemented.

## Live capability matrix

| Capability | Production state | Evidence of implementation | User-visible behavior | Required provider or credential |
|---|---|---|---|---|
| Public product extraction | Live and bounded | `functions/lib/extraction.ts`, `/api/products/extract` | Structured metadata, Open Graph fields, variants, media, confidence, and diagnostics are retained when the public page exposes them. | None for public sources |
| Blocked-source continuation | Live | `BlockedSource`, `ManualEvidenceForm`, exact-source preservation | Protected sources show a safe research handoff, an **Open exact source** action, manual evidence fields, and no replacement product. | None |
| AliExpress/session-dependent handling | Live and policy-correct | Adapter detects cookie-sync/login redirects | Returns `409 session_required`; the original URL is preserved and the user can continue manually. | None; bypass is intentionally unavailable |
| eBay listing URL classification | Live | `sourceKind: listing` and `marketResearch` response contract | An eBay item URL is identified as a listing resource and offers an eBay market-search continuation. | None |
| eBay official Browse API | Ready only when configured | Server-side OAuth path in `/api/ebay/research` | Uses `gtin` directly or keyword/MPN shaping, returns active listing observations and provenance. | `EBAY_CLIENT_ID` and `EBAY_CLIENT_SECRET` |
| eBay public search reader | Implemented, currently blocked in production | Bounded public reader with GTIN/MPN fallback, visible sold/watchers parsing, per-item provenance | Returns `status: blocked` with provider status and actionable guidance when eBay blocks the request. | None, but availability is controlled by eBay’s response |
| Approved actor provider | Optional | Apify adapter path | Can be used only when an approved actor token is present; results remain provider-attributed. | `APIFY_API_TOKEN` |
| eBay seller observations | Live and bounded | `/api/research/seller` | Returns public active-listing count, observed price band, category distribution, and active items when the seller page is readable. | None; eBay may block the page |
| Evidence normalization | Live | `functions/lib/evidence-normalizer.ts` | Deduplicates labels, prefers higher-confidence observations, classifies verified/derived/review/unknown, and computes price statistics. | None |
| Price-band analytics | Live | `priceBandStatistics` | Returns count, minimum, quartiles, median, average, maximum, and currency from supplied listing observations. | Real provider observations or user-supplied data |
| Sell-through calculation | Live but evidence-gated | `sellThroughRate` | Computes only when sold and active volumes are explicitly supplied; otherwise returns unknown. | Sold and active observations from an approved source |
| Durable D1 job state | Live | `research_jobs` table, `createJob`, `updateJob`, `readJob` | Research job IDs can be polled and retain the actual result or blocked state. | Georgelsmith D1 binding `DB` |
| Queue producer | Live with explicit-consumer guard | `functions/lib/queue.ts`, `/api/jobs/research` | Publishes only when `JOB_QUEUE` is bound and `JOB_CONSUMER_ENABLED=true`; otherwise executes synchronously and reports why. | Queue binding plus deployed consumer Worker |
| Job polling | Live | `/api/jobs/:id` | Distinguishes queued, running, complete, blocked, unavailable, and failed states. | D1 for durable polling |
| R2 source media upload | Live and rights-gated | `/api/media/upload` | Multipart uploads are stored under `sources/` only after `rightsConfirmed=true`; unavailable storage is not presented as durable. | `MEDIA_BUCKET` R2 binding |
| R2 object reads | Live and constrained | `/api/media/object` | Only `sources/` and `derivatives/` object prefixes are readable. | `MEDIA_BUCKET` R2 binding |
| Media derivative request | Review-only unless provider exists | `/api/media/enhance` | Does not mark a derivative ready when the provider is unavailable; the original remains unchanged. | Approved derivative provider, if enabled |
| Draft-only eBay listing optimization | Live | `/api/products/optimize` and workspace controls | Generates a reviewable title, description, item-specific draft, strategy, and validation package. | None for deterministic route; optional AI routes may rank supplied candidates |
| Automatic eBay publishing | Disabled by design | Export controls and UI policy | No marketplace account is modified and no listing is published automatically. | Not enabled |
| Responsive workspace | Live | React workspace, mobile CSS, persistent sidebar, progress rail | Works across compact and large screens with source, evidence, market, media, and draft views. | None |

## Provider and credential matrix

| Secret or binding | Current production state | Purpose | Safe handling |
|---|---|---|---|
| `DB` | Configured | D1 relational truth for jobs, vault, provider runs, and observations | Keep the binding in Cloudflare; never expose database credentials to the browser. |
| `CACHE_KV` | Configured | Durable cache and response reuse | Cache keys are versioned when response contracts change. |
| `MEDIA_BUCKET` | Configured as `aibay-george-media` | Rights-gated source and derivative media | The Trynex bucket is intentionally untouched. |
| `JOB_QUEUE` | Configured as `aibay-george-research` | Queue envelope delivery | No consumer is claimed until a consumer Worker is actually deployed and `JOB_CONSUMER_ENABLED` is explicitly enabled. |
| `EBAY_CLIENT_ID` | Not configured | Official eBay Browse API OAuth | Add only as a server-side Cloudflare secret. |
| `EBAY_CLIENT_SECRET` | Not configured | Official eBay Browse API OAuth | Add only as a server-side Cloudflare secret. |
| `APIFY_API_TOKEN` | Not configured | Optional documented actor route | Add only if the operator approves the external provider and its terms. |
| Browser Run credentials | Not configured | Optional browser-rendered public acquisition | No browser capability is claimed without a configured, verified route. |
| Workers AI credentials | Not configured | Optional Cloudflare-hosted AI route | No AI route is presented as active without server-side configuration. |

The official Browse API supports keyword and GTIN search through `item_summary/search`; its reference explicitly states that a GTIN should not be combined with a keyword query, so AiBay uses GTIN directly and uses MPN as a keyword refinement when no GTIN is present.[1]

## Durable resources and account isolation

| Resource | Value |
|---|---|
| Cloudflare account | Georgelsmith account `060a0f28c7f62affa5ac09be3b1dd1a9` |
| Pages project | `aibay-pro-george-live` |
| Pages project ID | `032a86ff-2f83-45f1-a3cf-f70e4b188d51` |
| D1 database | `aibay-george-db` / `3267a266-8716-45dc-9e61-13bf8e285962` |
| KV namespace | `aibay-george-cache` / `d16729d9dea5429f92a0c27f05c25757` |
| R2 bucket | `aibay-george-media` |
| Queue | `aibay-george-research` / `06915c8200c646c8a2843481af7e8b53` |
| GitHub source | `georgelsmith333-hub/Aibay-pro-live` |
| Production branch | `arena/01a00d12-aibay-pro` |

The older `aibay-pro-live` project in the Ahmedamityt account and the existing Georgelsmith `aibay-pro` project are outside this deployment. The `trynex` R2 bucket is outside this deployment and must remain untouched.

## Production regression results

The following checks were executed against the live production URL after the latest deployment. The results below intentionally report blocked states rather than converting them into apparent successes.

| Test | Observed result | Interpretation |
|---|---|---|
| `/api/infra` | HTTP 200; persistence durable; D1, KV, R2, Queue configured | The isolated Georgelsmith binding foundation is active. |
| Malformed product URL | HTTP 422 `product_extraction_failed` | Validation rejects incomplete URLs clearly. |
| AliExpress item URL | HTTP 409; `status: blocked`; `sourceDiagnostic.status: session_required` | Cookie-sync/session boundary is detected and the exact source is preserved. |
| eBay item URL | HTTP 409; `sourceKind: listing`; `marketResearch.available: true` | Listing URLs no longer end in a generic dead end; they offer market continuation. |
| eBay research job | HTTP 409; durable `jobId`; `execution: synchronous-fallback`; Queue `consumer_not_enabled` | The job is stored in D1 and reports the real eBay block. No unprocessed queue job is claimed as running. |
| Job polling | HTTP 200; job status `blocked`; actual provider result retained | D1 polling returns the truthful terminal state. |
| Seller research with public username | HTTP 409 `seller_page_blocked` | Seller observation is bounded and does not bypass eBay access controls. |
| Seller request with no username or URL | HTTP 400 `seller_required` | Input validation is explicit. |
| R2 read with unauthorized prefix | HTTP 400 `invalid_media_key` | Object reads are constrained to approved prefixes. |
| R2 upload without rights confirmation | HTTP 400 `rights_confirmation_required` | Media persistence is rights-gated. |
| Public manufacturer sample | HTTP 409 `access_controlled` from the selected public page | The route reported the actual access-control response; no manufacturer data was invented. |

## Cost and free-tier boundaries

AiBay’s deterministic extraction, normalization, job lifecycle, draft generation, exports, and policy checks do not require an eBay Developer account. The free public eBay reader is implemented as a bounded route, but it is not guaranteed to succeed because marketplace access controls can block production edge requests.

The official Browse API requires user-owned eBay application credentials. The optional actor route requires its own provider token and may have provider-specific usage limits. Cloudflare D1, KV, R2, and Queue availability and any account-level charges depend on the operator’s Cloudflare plan and usage; this runbook does not claim unlimited capacity or zero cost for those services.

## Operator checklist

Before enabling richer live research, add eBay credentials as encrypted server-side secrets and verify the `/api/ebay/research` response reports `provider: ebay-browse-official`. Do not put the client ID, client secret, actor token, Cloudflare API token, or any other secret in Git, the React bundle, browser local storage, or chat-visible source files.

Before enabling Queue execution, deploy and verify a consumer Worker that handles the `ResearchJobEnvelope` contract, updates D1 through the shared job lifecycle, and is scoped to the Georgelsmith Queue. Only then set `JOB_CONSUMER_ENABLED=true`. Until that point, the synchronous fallback is the correct behavior.

The Cloudflare API token previously shared during setup should be rotated by the operator after deployment. Rotation is especially important because the token was exposed in conversational setup history. After rotation, re-verify only the Georgelsmith Pages project and its dedicated resources; do not use the new token against the Trynex bucket or unrelated AiBay projects.

## Safety boundaries that must not be removed

AiBay must not solve CAPTCHAs, replay session cookies, imitate logged-in browsers, rotate identities to evade blocks, scrape private seller data, infer revenue from active listings, label active listings as sold, publish eBay listings automatically, or silently replace a blocked source with a different product. Any provider response that is blocked, incomplete, unauthorized, rate-limited, or unavailable must remain visible in the job timeline and source diagnostic.

## References

[1]: https://developer.ebay.com/api-docs/buy/browse/resources/item_summary/methods/search "eBay Browse API — item_summary search"
[2]: https://developers.cloudflare.com/d1/ "Cloudflare D1 documentation"
[3]: https://developers.cloudflare.com/queues/ "Cloudflare Queues documentation"
