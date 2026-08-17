# AiBay Pro — Live Architecture v2

## Product thesis

AiBay is not a scraper with a dashboard. It is a **source-to-decision system**: a source URL becomes an evidence-bearing product record, the product record becomes a live market and supplier research mission, and the resulting evidence becomes a reviewable eBay optimization package. Every layer must preserve source, time, method, confidence, and scope.

## Capability-to-code map

| User outcome | Backend contract | Frontend surface | State truth |
|---|---|---|---|
| Paste any permitted product URL | `SourceRecord`, `ProductExtraction`, adapter router | Import bar and source drawer | `healthy`, `incomplete`, `blocked`, or `unsupported`; no local success fallback |
| Extract title/specs/description/variants | `EvidenceField[]`, `ExtractedVariant[]` | Product evidence panel and preview | Each field has source path, method, timestamp, and confidence |
| Show every product image | `MediaAsset[]` | Gallery with role, dimensions, source, and preview status | Source URL preview is distinct from durable R2 storage |
| Research an eBay listing URL | `sourceKind: listing`, `marketResearch` continuation | Blocked/listing handoff and market command | Listing pages are not mislabeled as product-detail extraction |
| Live eBay research | `ResearchJob`, `MarketObservation[]`, provider attempts | Market panel, live job rail, seller tab | Live, blocked, unavailable, and stale are separate states |
| Competitor/seller research | Seller observation schema | Seller/competitor tab | Active-listing scope only unless sold data is separately sourced |
| Supplier matching | Supplier observation schema and image/data match job | Supplier tab | Candidate matches carry source and match rationale |
| One-click optimize/re-optimize | `OptimizationRun` with evidence/market/media snapshot IDs | Contextual optimization session | Each run is reproducible and draft-only |
| eBay image set | `MediaAsset` lineage and derivative job | Media Studio and listing preview | `source`, `queued`, `created`, `review_required`, `not_created` |
| eBay title/description/item specifics | Structured listing package | Optimization session | Evidence-backed claims or explicit review flags |
| Export | Draft export contract | Export controls | No automatic marketplace publishing |

## Provider truth model

| Status | Meaning | UI treatment |
|---|---|---|
| `ready` | Route is configured and its latest canary/health test passed | May offer the route as available |
| `not_configured` | Route exists in architecture but required secrets/bindings are absent | Show setup requirement; never imply it was attempted |
| `blocked` | Provider was attempted and returned an access, CAPTCHA, login, rate, or policy block | Show provider response and exact continuation |
| `unavailable` | Provider was attempted but failed transiently or timed out | Show retry and retained job state |
| `review_only` | The system accepted a request but cannot create the requested artifact without a provider or review | Show original/source and “not created” state |
| `stale` | Cached result exists but freshness threshold has passed | Show timestamp and refresh action |
| `complete` | Artifact or research result exists and was verified against its contract | Show preview, provenance, and review controls |

## Provider routing order

The zero-key route is bounded public retrieval and structured/visible extraction. A configured browser route is used only for permitted public JavaScript rendering. A configured external provider is used only through its documented API and records its own identity, version, limits, and cost class. User-controlled continuation is the safe route for session-required sources. No route retries a protected source through increasingly aggressive behavior.

## Core data invariants

| Invariant | Enforcement |
|---|---|
| Active listings are not sold data | Separate `dataScope` values and API/UI labels; optimization cannot convert active observations into sold claims. |
| Every field is attributable | Evidence fields require source path, method, captured time, and confidence. |
| Every image is traceable | Media assets store source URL, checksum, dimensions, rights state, and derivative lineage. |
| Every job is observable | D1 job row plus stage events, provider attempts, and terminal state. |
| Every optimization is reproducible | Run stores product/evidence/market/media snapshot references and prompt/version metadata. |
| No automatic publishing | Export endpoint returns draft material only; publishing integrations are not in scope. |
| Blocked source remains exact | Original URL and source kind are retained; no unrelated product or image is substituted. |

## Acceptance gates

The rebuild is not complete until a public structured fixture returns exact identity, description, specs, variants, and all valid gallery images; a session-dependent marketplace returns an exact-source continuation; an eBay listing URL offers market research; a real market success returns source URLs and timestamps; a provider block returns no fabricated rows; rights-confirmed media produces a verifiable derivative or an explicit not-created state; optimize/re-optimize creates contextual draft runs from the current snapshot; and the same flows remain usable on narrow screens.
