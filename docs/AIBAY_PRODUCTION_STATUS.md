# AiBay Pro Production Status

## Deployment

| Item | Current value |
| --- | --- |
| Production project | `aibay-pro` Cloudflare Pages |
| Production URL | `https://aibay-pro.pages.dev` |
| Repository | `georgelsmith333-hub/Aibay-pro` |
| Branch | `main` |
| Deployment method | Direct Wrangler Pages upload; GitHub webhook builds remain unreliable |
| Existing `aibay` project | Not modified by the autonomous-platform release |
| Current provider credentials | eBay, AI, database, Apify, Firecrawl, and Browser Run are not configured in the isolated project |
| Durable queue/store | Not configured; job persistence is request-only and explicitly labelled |

## Active production surfaces

The production app includes source-bound product import with live staged progress, source-specific session/redirect/access diagnostics, manual-evidence continuation, variant and evidence review, rights-gated media workflow, eBay draft-only export, capability routing, provider-health metadata, and the new Research Lab for candidate normalization, deduplication, scoring, and JSON/CSV/Markdown export.

The orchestration interface layer now includes a formal cache contract (`functions/lib/cache.ts`) that reports its mode, backend, durable state, and binding truthfully per request (best-effort edge cache in the Pages runtime, explicit `request_only` fallback otherwise), and a versioned identity-fingerprint deduplication contract (`functions/lib/dedup.ts`, fingerprint v1) that keeps the preferred entry per identity, links collapsed duplicates via `duplicateOf`, and preserves conflicting field labels for review instead of merging silently. Cache and dedup status is surfaced in `/api/capabilities`, `/api/providers`, `/api/route`, `/api/jobs`, `/api/jobs/:id`, `/api/products/extract`, and `/api/products/research`.

The Pages Functions surface includes `/api/health`, `/api/capabilities`, `/api/providers`, `/api/providers/health`, `/api/route`, `/api/jobs`, `/api/jobs/:id`, `/api/imports`, `/api/products/extract`, `/api/products/research`, `/api/products/optimize`, `/api/ebay/research`, `/api/media/enhance`, `/api/exports/research`, and `/api/exports/ebay-draft`.

## Honest limitations

The platform is not an unlimited scraper and does not include CAPTCHA bypass, anti-bot evasion, unauthorized API use, session-cookie replay, private-account access, or paywall bypass. External adapters are registry entries until their server-side credentials and documented capabilities are configured. Durable background jobs require a queue and job-store binding; the current Pages deployment does not pretend to have one. Caching is request-scoped and best-effort: the edge cache is an optimization, not a durable store, cached values retain their original `storedAt`/`expiresAt`, and every request falls back to direct source execution and validation when no cache backend exists.

## Release checks

The release must pass function type checking, frontend production build, lint, diff checks, local endpoint smoke tests, source-kind tests, SSRF rejection tests, Research Lab browser validation, production health validation, production capability validation, and exact-source extraction validation before it is promoted.
