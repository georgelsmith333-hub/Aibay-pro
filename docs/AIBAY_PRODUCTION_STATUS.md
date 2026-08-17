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

## Deployment API finding — 2026-08-17

The official Cloudflare Pages create-deployment API requires a multipart `manifest` form field mapping deployed file paths to content hashes for direct uploads. The fetched branch’s direct helper currently uploads only `dist.tar.gz`, so it returns HTTP 400 `A "manifest" field was expected`. The branch’s Wrangler 3 fallback also inherited the older account selection from the local Wrangler state; an explicit account-aware upload path is required for `aibay-pro-live`.

## Wrangler asset-upload finding — 2026-08-17

The installed Wrangler 3 Pages implementation returns a manifest shaped as `/{fileName} -> file.hash` and sends `hashes: files.map(({ hash }) => hash)` to the Pages asset upsert endpoint. The deployment helper’s current manifest uses paths without leading slashes and computes its own keys, so the helper still needs to match Wrangler’s leading-slash manifest and hash pipeline before a direct API deployment can serve assets reliably. Source inspected: installed Wrangler 3.114.17 Pages deploy implementation; official API reference remains [Create deployment](https://developers.cloudflare.com/api/resources/pages/subresources/projects/subresources/deployments/methods/create/).

## Binding configuration finding — 2026-08-17

The official Pages Functions bindings guide states that D1 and KV bindings can be configured through the Wrangler configuration file or the Pages dashboard under **Settings → Bindings**, followed by a redeploy. The manifest API deployment served the frontend and Functions successfully but health reported `database:false`, so the project-level binding attachment still needs to be applied through the supported Pages binding configuration path.

## Production verification — 2026-08-17

The corrected BLAKE3/manifest deployment `ab8b6b56` serves the app at both `https://ab8b6b56.aibay-pro-live.pages.dev` and the project root `https://aibay-pro-live.pages.dev`. `GET /api/health` returns HTTP 200 and Pages reports `uses_functions: true`. The runtime health response currently reports `database:false`, confirming that D1/KV binding attachment is a separate Pages project setting and has not been assumed. The Cloudflare dashboard settings route did not render controls in the current browser session, so no unaudited dashboard mutation was performed.
