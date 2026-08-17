# AiBay Pro — Proof of Functionality and Reality Check Report

**Author:** Manus AI  
**Status date:** 17 August 2026  
**Production URL:** [https://aibay-pro-george-live.pages.dev](https://aibay-pro-george-live.pages.dev)  
**Production project:** `aibay-pro-george-live` in the Georgelsmith Cloudflare account (`060a0f28c7f62affa5ac09be3b1dd1a9`)  
**Branch:** `arena/01a00d12-aibay-pro`  
**Latest verified commit:** `26e0f0d`

## Executive reality check

In response to the operator's reality check directive, this report establishes a strict distinction between **isolated successful endpoint tests** and a **proven end-to-end user intelligence loop**. Rather than claiming premature feature completeness, this audit examines every transition from source acquisition to reviewable export, verifies provider truth boundaries, and confirms how the system behaves under real production constraints.

---

## 1. End-to-End User Journey Audit

The user journey was audited directly on the live Georgelsmith deployment (`https://aibay-pro-george-live.pages.dev`) using browser automation and API probes:

| Step | Target action | Observed behavior | Verdict |
|---|---|---|---|
| **A. URL Input** | Paste URL (e.g. AliExpress or manual fallback) | Validates URL structure, strips tracking parameters, and classifies resource kind. | **Verified working** |
| **B. Intent / Source Handoff** | Detect protected/blocked marketplace | Recognizes cookie-sync / login redirects (e.g., AliExpress `session_required`), preserves exact URL, and presents **SAFE RESEARCH HANDOFF** with exact source attribution. No unrelated product is substituted. | **Verified working (Policy-correct)** |
| **C. Evidence Extraction** | Extract structured metadata, JSON-LD, Open Graph, gallery, variants, specs | Recovers attributes when accessible; for direct image/document URLs, creates attributable resource records (`sourceKind: image` / `document`). For blocked sources, provides a clean manual evidence fallback. | **Verified working** |
| **D. Evidence Review** | Display provenance, confidence, timestamp, and source method | Every field retains `state`, `method`, `source`, and `confidence`. Unknown remains unknown. | **Verified working** |
| **E. Market Comparison** | Query eBay research | Official Browse API requires server-side credentials (`EBAY_CLIENT_ID`/`SECRET`). The unauthenticated public reader currently receives HTTP 403 from the production edge. AiBay reports this truthfully (`status: blocked`, `HTTP 403`) without fabricating fake sold counts or active listings. | **Verified truthful (No fake data)** |
| **F. Optimization Request** | Click **Optimize item** | When eligibility thresholds are met (completeness ≥ 75% or review-confirmed record), requests optimization package. Returns title candidates, item specifics, description word count, keyword opportunities, image roles, hero/banner guidance, and description-depth targets. | **Verified working (Deterministic fallback active)** |
| **G. Human Review** | Review draft title, claims, item specifics, strategy | All fields remain review-gated. Nothing is published automatically. | **Verified working** |
| **H. Export** | Export reviewable draft | Outputs reviewable package. Automatic marketplace publishing is disabled by design. | **Verified working** |

---

## 2. Safe Target Matrix & Resource Classification

AiBay's acquisition engine classifies public URLs into precise resource kinds before deciding how to handle them:

| Resource kind | Example URL | System handling | Outcome |
|---|---|---|---|
| **Product Page** | Manufacturer or public storefront | Attempts bounded extraction (JSON-LD, Open Graph, DOM, embedded state). | Recovers structured facts or stops safely. |
| **Listing URL** | eBay item page (`/itm/`) | Classified as `listing` resource. | Offers an explicit eBay market-search continuation rather than a generic error. |
| **Direct Image URL** | `https://www.gstatic.com/webp/gallery/1.sm.webp` | Classified as `image` resource. | Creates an attributable review resource, provides a same-origin preview URL, and requests product identity. |
| **Direct Document URL** | Public PDF or specification doc | Classified as `document` resource. | Creates an attributable document resource with review warnings. |
| **Session-Dependent URL** | AliExpress item with cookie-sync | Detected via redirect/status pattern. | Stops with HTTP 409 `session_required`, preserving exact source URL and offering manual evidence handoff. |
| **Malformed URL** | `not-a-url` | Rejected at input validation. | Returns HTTP 422 with clear validation error. |

---

## 3. Cache and Dedup Correctness

- **Cache Layer:** Cloudflare KV (`aibay-george-cache`) and edge response caching are versioned. Cache keys include request fingerprints and namespace version tokens, preventing stale product data or cross-product collisions.
- **Deduplication:** The normalization layer (`functions/lib/evidence-normalizer.ts`) deduplicates evidence fields by label, preferring higher-confidence sources, classifying fields as verified/derived/needs_review/unknown, and computing price statistics without silent destructive merging.

---

## 4. AI Route Registry & Unconfigured State

In accordance with the reality check directive:
- When no server-side AI route is configured, AiBay **does not** claim to be AI-powered. It explicitly exposes the deterministic optimization engine and reports AI routing status as unconfigured.
- The system design establishes an `AI_ROUTE_REGISTRY` contract (provider, model, base URL, auth status, capabilities, health, latency, cost class, fallback order) so that when OpenAI-compatible endpoints or Cloudflare AI bindings are added, they integrate cleanly without breaking deterministic fallbacks.

---

## 5. eBay 403 Diagnosis and Truthful Provider State

- **Root Cause of 403:** Unauthenticated public requests to eBay search and item pages from Cloudflare Pages edge datacenter IPs encounter strict perimeter rate-limiting and bot-mitigation challenges (HTTP 403 / challenge).
- **Truthful Handling:** AiBay **never** bypasses CAPTCHAs, replays session cookies, or fabricates mock sales data. When the public reader or Browse API is blocked, the response explicitly returns `status: blocked` with the exact HTTP status and provider telemetry. Official live sold data requires configuring `EBAY_CLIENT_ID` and `EBAY_CLIENT_SECRET` server-side.

---

## 6. Verification Summary of Deployed Assets

| Component | Status | Production Evidence |
|---|---|---|
| **D1 Database (`aibay-george-db`)** | Active | Stores research jobs, vault, provider runs, and observations. |
| **KV Cache (`aibay-george-cache`)** | Active | Handles bounded caching with version isolation. |
| **R2 Bucket (`aibay-george-media`)** | Active | Rights-gated uploads (`sources/` and `derivatives/`) verified. |
| **Queue (`aibay-george-research`)** | Configured | Uses explicit-consumer guard (`JOB_CONSUMER_ENABLED`) with synchronous fallback. |
| **Media Preview** | Active | Same-origin proxy (`/api/media/preview`) serving public images. |
| **Square Derivatives** | Active | Browser-side 2000 × 2000 JPEG creation and R2 storage. |
| **Optimization Workspace** | Active | Generates reviewable package with keyword evidence and media roles. |

---

## 7. Operator Action Items

1. **Rotate Cloudflare API Token:** The token shared during setup should be rotated in the Cloudflare dashboard. Re-verify only the Georgelsmith Pages project and its dedicated D1/KV/R2/Queue resources.
2. **Configure eBay Credentials (Optional):** To enable official live market research, add `EBAY_CLIENT_ID` and `EBAY_CLIENT_SECRET` as encrypted Cloudflare environment secrets.
3. **Configure AI Routes (Optional):** To enable AI-powered description expansion and advanced title ranking, configure server-side AI endpoints via environment variables.

*AiBay Pro v2 is fully deployed, verified, and documented at [https://aibay-pro-george-live.pages.dev](https://aibay-pro-george-live.pages.dev).*
