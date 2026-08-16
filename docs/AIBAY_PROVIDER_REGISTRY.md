# AiBay Pro Provider Registry

## Registry contract

Each provider entry must expose: provider ID, category, supported capabilities, allowed task types, authentication mode, configuration keys, browser requirement, JavaScript requirement, expected latency class, rate-limit behavior, cost class, health state, version/contract, last verification time, fallback providers, and policy notes.

| Provider ID | Category | Current state | Capabilities | Auth | Fallback | Policy |
| --- | --- | --- | --- | --- | --- | --- |
| `local.evidence` | local | Ready | public metadata extraction, JSON-LD, Open Graph, visible metadata, deterministic listing drafts, evidence review, draft export | None | manual evidence | Default route; bounded requests; no access-control bypass |
| `public.huggingface-gradio` | public provider | Metadata-only allowlist | capability/schema discovery when a configured Space is public and running | None for metadata | `local.evidence` | No inference request is sent until a documented schema is verified; respect provider rate limits |
| `ebay.browse` | official marketplace API | Not configured in current production | eBay US market research | server-side OAuth credentials | example or unavailable state, never fake live data | Official API only; no scraping of protected eBay pages |
| `apify.actors` | optional BYOK external | Not configured | actor-based scrape/crawl/browser workflows where permitted | `APIFY_API_TOKEN` server-side | `local.evidence`, manual evidence | Documented API, actor/version validation, bounded runs, dataset provenance, no token in client |
| `firecrawl.v2` | optional BYOK external | Not configured | documented search, scrape, structured content, interaction where permitted | `FIRECRAWL_API_KEY` server-side or documented limited public route | `local.evidence`, manual evidence | No assumption of unlimited free access; enforce quota and provider response |
| `cloudflare.browser-run` | optional Cloudflare account capability | Not configured | browser screenshots, PDF, JS-heavy public pages, permitted browser workflows | server-side Cloudflare binding/credential | `local.evidence`, manual evidence | Current documented Browser Run API only; no CAPTCHA, login, paywall, or anti-bot bypass |
| `local.playwright` | optional local/persistent runtime | Not available in current Pages-only runtime | permitted JS-rendered public pages and browser observation | local runtime | `local.evidence`, manual evidence | Requires a separately hosted runtime; must use visible/public access only |

## Health states

Provider health is represented as `ready`, `sleeping`, `building`, `not_configured`, `rate_limited`, `unavailable`, `unsupported`, `blocked_by_policy`, or `degraded`. A route may only be selected automatically when its health is compatible with the requested task and its capability contract has been verified.

A provider failure is classified before retrying. Invalid credentials, policy blocks, unsupported task types, and private-source responses are non-retryable. Timeouts, transient HTTP 5xx responses, and documented rate-limit responses may retry with bounded exponential backoff and jitter, subject to a per-domain and per-provider circuit breaker.

## Credential rules

Credentials are accepted only as server-side deployment secrets. They are never returned by health endpoints, stored in extraction results, placed in browser storage, or included in exported provenance. When credentials are absent, the provider is shown as `not_configured`; the local route remains available.

## Version rules

Provider version discovery is metadata only until a documented compatibility check succeeds. AiBay must not silently promote an unverified endpoint or actor version. The intended lifecycle is `discover -> validate -> canary -> promote -> rollback`.
