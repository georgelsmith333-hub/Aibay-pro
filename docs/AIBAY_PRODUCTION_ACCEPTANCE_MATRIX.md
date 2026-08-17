# AiBay Pro Production Acceptance Matrix

A capability is `VERIFIED COMPLETE` only when all five gates pass: IMPLEMENTED → CONNECTED → TESTED → PREVIEW VERIFIED → PRODUCTION VERIFIED. State as of 2026-08-17. Production (`https://aibay-pro.pages.dev`) still runs commit `307e54a`; the work described below is on `arena/01a00d12-aibay-pro` (commits `6fcdcfc`, `796361c`, `f0da5ef`, and the intelligence-layer commit). No preview deployment exists yet; deployment is an operator action (`pnpm deploy:pages`).

| Capability | IMPLEMENTED | CONNECTED | TESTED | PREVIEW VERIFIED | PRODUCTION VERIFIED | STATUS |
| --- | --- | --- | --- | --- | --- | --- |
| Policy gate + SSRF + consent | ✅ | ✅ | ✅ (unit + runtime) | ⛔ (no preview deployed) | ⛔ (prod on old commit) | IMPLEMENTED/TESTED |
| Deterministic routing + failure classification | ✅ | ✅ | ✅ | ⛔ | ⛔ | IMPLEMENTED/TESTED |
| Cache interface + request-only fallback | ✅ | ✅ | ✅ (16/16) | ⛔ | ⛔ | IMPLEMENTED/TESTED |
| Dedup (identity fingerprint v1) | ✅ | ✅ | ✅ (16/16 incl.) | ⛔ | ⛔ | IMPLEMENTED/TESTED |
| Provider adapter contract v1 | ✅ | ✅ | ✅ (7/7) | ⛔ | ⛔ | IMPLEMENTED/TESTED |
| `local.evidence` adapter through router | ✅ | ✅ | ✅ (7/7 + runtime smoke) | ⛔ | ⛔ | IMPLEMENTED/TESTED |
| Fallback + attempt trail + policy-stop | ✅ | ✅ | ✅ (7/7) | ⛔ | ⛔ | IMPLEMENTED/TESTED |
| UNCONFIGURED truthfulness (Apify, search) | ✅ | ✅ | ✅ (7/7) | ⛔ | ⛔ | IMPLEMENTED/TESTED |
| Free multi-route AI (AI_ROUTES) | ✅ | ✅ | ✅ (7/7 + optimize e2e) | ⛔ | ⛔ | IMPLEMENTED/TESTED |
| Capability graph (24 capabilities, 24 categories) | ✅ | ✅ | ✅ (18/18) | ⛔ | ⛔ | IMPLEMENTED/TESTED |
| Opportunity scoring (9 components, evidence-gated) | ✅ | ✅ | ✅ (18/18) | ⛔ | ⛔ | IMPLEMENTED/TESTED |
| Price stats + trend classification | ✅ | ✅ | ✅ (18/18) | ⛔ | ⛔ | IMPLEMENTED/TESTED |
| Listing quality score | ✅ | ✅ | ✅ (18/18) | ⛔ | ⛔ | IMPLEMENTED/TESTED |
| Source quality scoring | ✅ | ✅ | ✅ (18/18) | ⛔ | ⛔ | IMPLEMENTED/TESTED |
| Contradiction detection | ✅ | ✅ | ✅ (18/18) | ⛔ | ⛔ | IMPLEMENTED/TESTED |
| Change detection + alert types | ✅ | ✅ | ✅ (18/18) | ⛔ | ⛔ | IMPLEMENTED/TESTED |
| Evidence graph | ✅ | ✅ | ✅ (18/18) | ⛔ | ⛔ | IMPLEMENTED/TESTED |
| Research missions (14) + bounded run | ✅ | ✅ | ✅ (18/18) | ⛔ | ⛔ | IMPLEMENTED/TESTED |
| Mission control UI | ✅ | ✅ (live dev smoke) | ✅ (build) | ⛔ | ⛔ | IMPLEMENTED/TESTED |
| Tool suite (profit, keywords, scanner, generate, trends, watchlist vault) | ✅ | ✅ | ✅ (13/13) | ⛔ | ⛔ | IMPLEMENTED/TESTED |
| Render-competitor teardown | ✅ | ✅ (live probes) | ✅ | ⛔ | ⛔ | IMPLEMENTED/TESTED |
| Provider center UI + free-tier guide | ✅ | ✅ | ✅ (build + smoke) | ⛔ | ⛔ | IMPLEMENTED/TESTED |
| eBay official Browse adapter | ✅ | ✅ (contract) | ✅ (demo + 412 paths) | ⛔ | ⛔ | UNCONFIGURED in prod (needs credentials) |
| Browser/Apify/Firecrawl execution | ⚠️ adapter framework only | ❌ no credentials | ✅ (UNCONFIGURED paths) | ⛔ | ⛔ | UNCONFIGURED |
| Durable jobs / watchlists / alerts delivery | ❌ (design documented) | ❌ | ⚠️ (change detection logic) | ⛔ | ⛔ | UNCONFIGURED (infra migration) |

## Release gates

1. Operator deploys `arena/01a00d12-aibay-pro` to Pages (`pnpm deploy:pages`).
2. Verify `/api/health`, `/api/capabilities` (24-capability graph + adapters + aiRoutes), `/api/intelligence/*`, `/api/research/missions*` live.
3. Re-run this matrix with PREVIEW VERIFIED / PRODUCTION VERIFIED checked.
4. Only then mark capabilities VERIFIED COMPLETE.

Real-external smoke is BLOCKED in the development sandbox (no outbound network). Production verification therefore cannot be performed from this environment — this is stated, not hidden.
