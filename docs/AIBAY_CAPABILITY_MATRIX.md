# AiBay Pro Capability Matrix

| Capability | Local now | Optional configured route | Current production truth | Output contract |
| --- | --- | --- | --- | --- |
| `web.extract.public_metadata` | Yes | Firecrawl/Apify/Browser Run where configured | Ready | Attributable structured fields with provenance |
| `web.scrape.static` | Yes, bounded HTTP | Firecrawl/Apify | Ready for permitted public pages | HTML/metadata/evidence or explicit blocked result |
| `web.scrape.browser` | No in Pages runtime | Browser Run, Playwright runtime, Apify actor | Not configured | Browser observation only when permitted |
| `web.search` | No general search provider configured | Firecrawl search or approved provider | Not configured | Search results with source URLs and timestamps |
| `web.crawl` | No durable crawler configured | Apify/Firecrawl or future queue worker | Not configured | Bounded crawl job with per-domain limits |
| `web.extract.structured` | Yes for JSON-LD/Open Graph/visible metadata | Provider structured extraction | Ready | Typed fields with field-level confidence |
| `document.pdf` | No durable document pipeline | Browser Run/Firecrawl or future document adapter | Not configured | Extracted text/pages with source and review state |
| `image.extract` | Source image URL recovery only | Rights-cleared media processing provider | Partial | Media URL, source path, rights state |
| `product.discover` | No general discovery search | Approved search/provider adapters | Not configured | Candidate products with evidence and dedupe fingerprint |
| `ecommerce.product` | Yes for supported public metadata | Provider-specific adapters | Partial | Product workspace with variants and provenance |
| `price.monitor` | No durable scheduler/store | Configured scheduled backend | Not configured | Freshness-aware snapshots and alerts |
| `market.ebay_us` | Official Browse API adapter | eBay credentials | Not configured in production | Live snapshot only when official API returns it |
| `ebay.listing_draft` | Yes | Optional AI title reordering | Ready | Draft-only package; title <= 80 chars; human review required |
| `media.derivative` | Rights-gated request contract | Configured image provider/storage | Partial | Review-only derivative request; never auto-published |
| `source.health` | Local route and allowlisted metadata checks | Provider adapters | Ready | Capability/provider state with timestamp |
| `job.orchestration` | Bounded request state | Durable queue/store when bound | Transitional | Explicit job state; no fake durable queue |
| `cache.result` | Best-effort edge cache + explicit request-only fallback | Durable KV/R2 cache when bound | Active (request-scoped, not durable) | Freshness, hit/miss, mode, and backend metadata; cached values are never authoritative |
| `dedup.identity_fingerprint` | Versioned local fingerprint deduplication | Any provider adapter (unchanged contract) | Ready | Kept records with `duplicateOf` links and conflict labels; nothing merged silently |
| `adapter.contract_v1` | Generic provider adapter contract (`capabilities`, `canHandle`, `health`, `estimate`, `execute`, `normalize`, `classifyError`) | Any documented provider behind server-side credentials | Ready (contract); `local.evidence` adapter wired through router | Adapter metadata (id/version/config/health/limits/fallback) in capability responses; unconfigured providers report `not_configured` |
| `route.execute` | Bounded router execution with attempt trail, retry, fallback | Durable queue/store when bound | Active (request-scoped) | `POST /api/execute`: observations with provenance, attempts, fallbackUsed, cache status |

## Selection policy

The router chooses the least-privileged route that can meet the task. A public static page uses local metadata extraction first. A JS-heavy but permitted public page requires a configured browser-capable provider. Large crawls require a configured crawl provider and a durable job store. A blocked or session-dependent source is not retried through unauthorized browser behavior; the route becomes `blocked_by_policy` or `session_required` with alternatives.

## Evidence quality

A result is not complete merely because a provider responded. The result must include source URL, canonical URL where available, host, retrieval time, method, provider ID, provider contract/version, confidence, validation state, and warnings. Conflicting values remain visible as conflicting evidence until resolved by review or a stronger permitted source.
