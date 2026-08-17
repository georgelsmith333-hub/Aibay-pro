# AiBay

AiBay is an evidence-backed eBay-US product research and listing-draft workspace. It turns a user-supplied product URL into a reviewable product record, explicit variants, a timestamped market snapshot, policy-aware optimization suggestions, and rights-gated media derivatives.

The repository contains a polished, mobile-responsive frontend with a clearly labelled demo mode plus a Cloudflare Pages Functions API foundation. Demo fixtures make the full review flow usable before production credentials are configured. Live eBay calls, durable data, AI generation, and image derivatives are intentionally server-side and opt-in. AI title ranking uses a free multi-route router: configure any OpenAI-compatible endpoint (Groq, Gemini free tier, OpenRouter `:free` models, Workers AI, local Ollama) as server-side `AI_ROUTES`, and AiBay fails over between routes automatically — the routing layer itself costs nothing.

## Product boundary

AiBay uses official APIs first and public structured/visible page data second. It does not bypass CAPTCHA, login, robots/access controls, or marketplace anti-bot systems. It does not use stealth browsing, fingerprint spoofing, proxy rotation for evasion, credential sharing, or automatic publishing. A blocked source returns a safe manual-evidence fallback rather than a partial or fabricated product record.

The first release is draft-only. The application never publishes a listing or changes an eBay account from the browser demo. Titles are validated at the eBay 80-character limit. Active listings are labelled as active observations and are not represented as sold-price or conversion guarantees.

## Local development

```bash
pnpm install
pnpm dev
```

The frontend starts with a demo workspace. To exercise the import flow, paste a public-looking URL or select **Use example**. URLs containing `captcha`, `login`, `signin`, or `blocked` intentionally exercise the compliant fallback path.

Build the production frontend with:

```bash
pnpm build
```

The output is written to `dist/` and is suitable for Cloudflare Pages.

## Cloudflare Pages deployment

Production deployment is automated: `.github/workflows/deploy-pages.yml` runs on push to `arena/01a00d12-aibay-pro` (or manual dispatch). It verifies the Cloudflare token, creates-or-finds the durable infrastructure (D1 `aibay-db`, KV `aibay-cache`, R2 `aibay-media`, Queue `aibay-jobs`) via `scripts/ensure-infra.mjs`, builds, deploys to the `aibay-pro` Pages project, applies `infra/schema.d1.sql`, sets runtime secrets, and runs a real Browser Run canary against example.com — the browser adapter only reports `ready` after that canary passes.

Required GitHub secret: `CLOUDFLARE_API_TOKEN` (account `d016ca182921e04d445bb9238703f336`). Optional secrets for live marketplace/AI features: `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`, `AI_ROUTES`. Local development runs without bindings: every feature falls back to request-only behavior and reports it truthfully.

The current API routes include `GET /api/health`, `POST /api/imports`, `GET /api/jobs/:id`, `POST /api/ebay/research`, `POST /api/media/enhance`, `POST /api/exports/ebay-draft`, `POST /api/execute` (bounded route → adapter execution with provenance, attempt trail, and truthful cache/status reporting), and `POST /api/products/optimize` (deterministic draft engine with free multi-route AI title ranking and failover). `GET /api/providers` reports adapter inventory and configured AI routes (names/models/hosts only — never credentials). The frontend includes a Provider center that shows live routing state and a free-tier connect guide. Pages Functions middleware applies baseline security headers, request correlation, same-origin CORS, and preflight handling.

## Production credentials

Live deployment requires user-owned credentials and provider terms that permit the intended use. Enable the system in this order:

| Capability | Required setup | Current behavior without setup |
| --- | --- | --- |
| eBay-US market research | eBay Developer application with approved client ID and secret, configured as encrypted Cloudflare secrets. | The UI keeps its market card clearly labelled as demo data. The API returns a provider-readiness response instead of pretending to have live data. |
| Durable product/job data | Neon PostgreSQL connection string and a server-side query layer or Worker-compatible database client. | The frontend remains usable with local state and deterministic fixtures. |
| AI listing generation | User-owned AI provider account, structured-output support, and a per-job/monthly budget. | The UI exposes the review flow, but production workers must not claim a generated result without a provider response. |
| Image derivatives | User-owned image provider account or approved image transformation service with rights confirmation. | Originals remain untouched; the endpoint returns a review-only status. |
| R2 media storage and Queues | Cloudflare R2 bucket and queue bindings. | Media stays in the current source/demo path; production uploads should not be placed in the browser bundle. |

## Source adapter admission

Every named marketplace adapter must document its permitted access mode, returned fields, rate limits, cache policy, health check, redacted fixtures, and manual fallback. Field values retain source URL, extraction method, timestamp, and confidence. Unknown and conflicting values remain visible and are not converted into listing claims by an AI model.

## eBay research behavior

The production adapter uses the official Browse API with server-side OAuth and the `EBAY_US` marketplace header. It should issue separate exact and comparable queries, persist a market snapshot, and show the query, timestamp, currency, result count, and data completeness to the user. Historical sold-item intelligence is optional and must not be represented as available unless the user has the necessary approved eBay access.

## API request examples

```bash
curl https://YOUR_PAGES_DOMAIN/api/health

curl -X POST https://YOUR_PAGES_DOMAIN/api/imports \
  -H 'content-type: application/json' \
  -H 'x-idempotency-key: example-import-001' \
  -d '{"sourceUrl":"https://example.com/products/item","consent":true}'

curl -X POST https://YOUR_PAGES_DOMAIN/api/ebay/research \
  -H 'content-type: application/json' \
  -d '{"query":"AeroStep Trail Runner lightweight knit sneaker","limit":20}'
```

## Repository map

The UI lives in `src/`, domain types in `src/types/`, deterministic demo fixtures and formatting helpers in `src/lib/demo.ts`, and the responsive visual system in `src/App.css`. Cloudflare Pages Functions are under `functions/`; the orchestration interface layer (`functions/lib/orchestrator.ts`, `registry.ts`, `cache.ts`, `dedup.ts`) exposes route planning, provider health, and cache/deduplication contracts that are truthful about their request-only state until durable bindings are configured. Source policy and adapter admission rules are in `docs/source-support-matrix.md`. `infra/` is reserved for deployment declarations and future database migrations. No provider secret belongs in GitHub, client code, browser storage, or demo fixtures.

## Later APK

The planned Android client should be a separate Expo/React Native application that consumes the same versioned API, job state machine, canonical product schemas, and media store. It should not reimplement scraping or AI logic inside the APK. Android signing and store distribution require the operator’s own signing ownership and release decision.
