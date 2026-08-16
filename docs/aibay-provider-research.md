# AiBay Provider Research Notes

## Apify

Source: [Apify API documentation](https://docs.apify.com/api/v2), accessed 2026-08-16.

Apify’s documented API uses bearer-token authentication, recommends keeping the token in the Authorization header, and exposes Actor execution through versioned API endpoints. Actor runs can be asynchronous with explicit run-status polling and log retrieval, or synchronous with a documented timeout. Results can be retrieved from the run’s default dataset, and Actor versions are managed through dedicated endpoints. AiBay should therefore implement Apify as an optional BYOK adapter with actor metadata/version discovery, input validation, asynchronous run state, dataset retrieval, timeout, and no client-side token exposure. A missing token must produce a truthful `not_configured` state rather than a simulated success.

## Firecrawl

Source: [Firecrawl Introduction](https://docs.firecrawl.dev/introduction), accessed 2026-08-16.

Firecrawl documents API operations for search, scrape, and interaction. Its examples show `/v2/scrape` returning markdown or HTML and describe API keys as optional for initial limited requests but required for higher limits and authenticated access. AiBay should treat Firecrawl as an optional provider adapter, not as an unrestricted free route: use documented endpoints only, enforce bounded timeouts and per-provider limits, preserve response provenance, and mark missing or exhausted access as `not_configured`, `rate_limited`, or `unavailable`.

## Cloudflare Browser Run

Source: [Cloudflare Browser Run documentation](https://developers.cloudflare.com/browser-run/), discovered from the official provider search on 2026-08-16.

Browser Run is a documented headless-browser capability for tasks such as screenshots, PDFs, and browser automation. The adapter should be optional and server-side, use the current documented API rather than outdated Browser Rendering assumptions, and never be used to defeat CAPTCHA, authentication, paywalls, or anti-bot controls. Browser-required tasks should be classified honestly when the feature is not configured.

## Architecture consequence

The current Pages deployment has no active queue, durable job store, R2 binding, Apify token, Firecrawl token, or Browser Run binding. The first implementation slice will create provider and capability metadata contracts, local deterministic routes, failure classification, and safe route selection. Optional external adapters will be added behind server-side environment variables and explicit health states. No provider will be advertised as live or unlimited solely because its public documentation exists.
