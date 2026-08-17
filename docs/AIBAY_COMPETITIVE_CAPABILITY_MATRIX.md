# AiBay Pro Competitive Capability Matrix

Objective comparison with specialized tools. Competitor capabilities are described only where they are **documented public knowledge** (their own sites/docs as of 2026-08); nothing is invented. AiBay statuses use the platform's truthful labels (VERIFIED / AVAILABLE / CONFIGURED / UNCONFIGURED / PARTIAL / UNVERIFIED / BLOCKED / ESTIMATED / INFERRED). "AiBay status" reflects the **current repository state**, not the not-yet-deployed production build.

Legend: ✅ native/available · ⚠️ partial or conditional · ❌ absent/not configured

| CAPABILITY | AIBAY STATUS | ZIK ANALYTICS | eBay (native) | AutoDS | Sell The Trend | Apify | Firecrawl | EVIDENCE / NOTE |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Evidence-backed product import (public metadata) | ✅ AVAILABLE (local adapter, `web.extract.public_metadata`) | ⚠️ research platform, source-dependent | ❌ not a general importer | ⚠️ via integrations | ⚠️ via integrations | ⚠️ via Actors | ✅ scrape/extract API | AiBay: bounded HTTP + JSON-LD/OG with field-level provenance, no bypass |
| eBay US market research | ⚠️ CONFIGURED-only (official Browse API adapter; UNCONFIGURED without credentials) | ✅ paid core product | ✅ native (Terapeak/Product Research) | ✅ paid core | ✅ paid core | ⚠️ marketplace Actors | ❌ | AiBay uses the same official Browse API when configured; no fake live data |
| Product opportunity scoring | ✅ AVAILABLE (explainable 9-component score, evidence-gated, INSUFFICIENT_EVIDENCE default) | ✅ proprietary "winning product" scores | ⚠️ demand data views | ✅ product scores | ✅ product scores | ❌ | ❌ | AiBay scores are component-explainable (§13, §40); competitors are proprietary/black-box |
| Competitor / seller profiling | ✅ AVAILABLE (from observable listings; revenue never inferred) | ✅ core paid feature | ⚠️ seller pages | ⚠️ | ⚠️ | ⚠️ | ❌ | AiBay marks unavailable metrics unavailable |
| Supplier discovery & matching | ⚠️ PARTIAL (supplier observations + margin estimates; no supplier provider configured) | ⚠️ supplier tools | ❌ | ✅ AliExpress/supplier integrations (paid) | ✅ supplier links (paid) | ⚠️ | ❌ | AiBay: product↔supplier graph structure exists; live supplier discovery needs a configured provider |
| Multi-provider web execution with automatic failover | ✅ AVAILABLE (adapter contract v1 + router + attempt trail) | ❌ | ❌ | ❌ | ❌ | ✅ (single provider, no cross-provider failover) | ✅ (single provider) | AiBay is provider-independent by design (§5, §8) |
| Free multi-route AI (no built-in model cost) | ✅ AVAILABLE (AI_ROUTES: Groq/Gemini/OpenRouter/:free/Workers AI/Ollama, failover, key-safe) | ❌ paid plans | ⚠️ paid AI features | ⚠️ paid | ⚠️ paid | ⚠️ | ⚠️ | Router + user-owned free-tier keys; no fabricated AI results |
| Evidence graph / provenance on every relationship | ✅ AVAILABLE (nodes/edges with source, time, method, confidence) | ❌ proprietary DB, no public provenance model | ❌ | ❌ | ❌ | ❌ | ❌ | Primary moat (§10, §60) |
| Contradiction detection | ✅ AVAILABLE (CONFLICT surfaced, never silently resolved) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | Primary moat (§39) |
| Price statistics + trend classification | ✅ AVAILABLE (percentiles, outliers, clusters; RISING/FALLING/STABLE/VOLATILE/INSUFFICIENT_DATA) | ✅ charts | ✅ demand/price views | ⚠️ | ⚠️ | ⚠️ | ❌ | AiBay requires ≥2 dated observations; never fabricates history |
| Listing quality score with fixes | ✅ AVAILABLE (title/specifics/description/images/price/shipping/category + actionable fixes) | ⚠️ listing analysis | ⚠️ | ⚠️ | ⚠️ | ❌ | ❌ | Explainable and policy-safe |
| Deterministic eBay draft (≤80 chars, no unsupported claims) | ✅ AVAILABLE | ⚠️ | ⚠️ (listing tool) | ✅ listing tools | ✅ listing tools | ❌ | ❌ | Draft-only; human review gate |
| Research missions (one-click plans, bounded run) | ✅ AVAILABLE (14 missions, plan+run, request-scoped) | ⚠️ workflows | ❌ | ❌ | ⚠️ preset searches | ⚠️ | ❌ | §33–34; runs bounded via router |
| Change detection + alert classification | ⚠️ PARTIAL (computation + alert types; durable watch requires infra) | ✅ alerts (paid) | ⚠️ saved searches | ✅ alerts (paid) | ⚠️ | ⚠️ | ❌ | AiBay is truthful: no durable watch is claimed until bindings exist |
| Bulk workflows | ⚠️ PARTIAL (bounded multi-URL missions; durable queue UNCONFIGURED) | ✅ bulk (paid) | ❌ | ✅ bulk (paid) | ⚠️ | ✅ Actors | ⚠️ | Queue/store is a documented future migration |
| Browser execution | ⚠️ UNCONFIGURED (Browser Run/Apify adapters report UNCONFIGURED until credentials + contract validation) | ❌ | ❌ | ❌ | ❌ | ✅ | ⚠️ | Adapter framework ready; no provider is claimed until configured |
| Rate-limit / quota respect | ✅ AVAILABLE (429 → honest rate_limited, no evasion) | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | Core policy (§41) |
| Source quality scoring | ✅ AVAILABLE (authority/freshness/completeness) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | §36 |
| Data freshness / TTL metadata | ✅ AVAILABLE (storedAt/expiresAt on every cached value) | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | §37 |

## Where competitors still lead (honest gaps)

| Area | Who leads | Why | AiBay plan |
| --- | --- | --- | --- |
| Depth of historical eBay sold data | ZIK / eBay Terapeak | Years of accumulated marketplace data | Use official APIs when configured; accumulate observations over time (durable storage migration) |
| Supplier catalog breadth | AutoDS / Sell The Trend | Large supplier integrations and negotiated feeds | Configured supplier adapter + evidence graph; never invent suppliers |
| Managed browser/crawl scale | Apify / Firecrawl | Large Actor ecosystem and crawl infrastructure | Adapter framework + Browser Run/Apify/Firecrawl adapters behind validated credentials |
| One-click polish of a mature SaaS | ZIK / AutoDS | Years of UX iteration | Mission control, progressive disclosure, evidence reviewer (§38, §59) |
| Durable watchlists/alerts at scale | ZIK / AutoDS (paid) | Durable job infra | Documented queue/D1/DO migration (§46) — not claimed until configured |

## Verdict

AiBay does not compete on accumulated data or paid feature count. It competes on: provider-independent execution, evidence provenance on every relationship, contradiction transparency, explainable scoring, free multi-route AI, and a unified eBay workflow — with every claim gated by the truth labels in §0. Gaps are documented, not hidden.
