# Browser Validation Notes

## 2026-08-11 — First-run dashboard

The temporary preview renders successfully at the cache-busted browser URL after the Vite development host allowlist was set to the validation domain. The first-run workspace presents the dark navigation rail, clear AiBay identity, evidence-backed research message, product-source URL field, rights confirmation, safe-acquisition statement, and the three explanatory cards as designed.

The visible import action is keyboard-accessible and offers the expected example URL, rights checkbox, and inspect action. The page content correctly explains that CAPTCHA, login, and blocked sources stop with a manual-evidence fallback. No marketplace credentials or live data are implied by the initial view.

A stale proxy page initially displayed the pre-update host error. The active local Vite listener was confirmed to return HTTP 200 for the exact generated host header, and navigating with a cache-busting query loaded the actual application. The temporary configuration is only for local validation and does not affect the Cloudflare Pages production deployment contract.

## 2026-08-11 — Import progression

The demonstration URL was accepted and the interface transitioned to the job-progress view. The user can see five explicit stages: source validation, evidence extraction, normalization, eBay-US research preparation, and ready-for-review. At the observed point, the first two stages were complete and product normalization was visibly active. This confirms that the interface communicates asynchronous work rather than presenting unverified data as instantaneous.

## 2026-08-11 — Workspace and optimization review flow

The completed workspace visibly presents a selected variant, evidence completeness score, source image gallery, evidence table, eBay-US active-listing panel, direct-versus-comparable labels, and a prominent **Optimize item** action. The market card remains explicitly labelled as demo data until eBay credentials are connected and includes a non-guarantee statement.

Selecting **Optimize item** starts a separate staged package workflow. The user can see the snapshot lock, title candidate validation against the 80-character constraint, draft composition, media-plan review, and completion gate. The progress view reinforces that the result is a reviewable draft, not an automatic listing action.

## 2026-08-11 — Final preview reload

After the Media Studio enhancements, the cache-busted preview still renders the intended first-run dashboard and accepts the example URL through keyboard submission. The staged import view remains legible and shows the extraction sequence without exposing any provider secret or implying that a restricted source will be bypassed.

## 2026-08-11 — Media Studio

The final Media Studio renders with the source image preview, review-gate status, source dimensions and origin, selectable gallery assets, an **Add image** upload control, explicit rights confirmation, and the 2,000 × 2,000 derivative action. The interface states that product identity, labels, colour, material, and proportions must be preserved, and that the derivative is never published automatically.

## Cloudflare authorization handoff

The Cloudflare Pages project and GitHub source are configured through the account connection. The browser dashboard encountered a CAPTCHA before a direct deployment credential could be created. A separate dashboard tab was opened for the user to complete Cloudflare authorization directly. No API token, account password, or CAPTCHA solution has been stored in the repository or application.

## Production deployment verification — 2026-08-11

The Cloudflare Pages production deployment at `https://74493211.aibay.pages.dev` renders the AiBay workspace successfully. The deployed health endpoint responds with HTTP 200 and a valid API payload. At this stage, provider readiness correctly remains false for eBay, AI, and database services because no corresponding production integration credentials have been configured. The Pages Functions bundle is therefore active, while external-provider access remains deliberately disabled.

## Isolated aibay-pro deployment verification — 2026-08-11

The new, isolated Cloudflare Pages project is available at `https://aibay-pro.pages.dev`. The public site rendered successfully after initial edge propagation, and the original `aibay` project was not used for this final deployment. The deployment contains the AiBay frontend and Pages Functions bundle; external eBay, AI, and database credentials remain intentionally unconfigured.

## Final production health check — 2026-08-11

The isolated production endpoint `https://aibay-pro.pages.dev/api/health` returned a healthy response with `environment: production`. The Pages Functions bundle is active. External eBay, AI, and database providers remain disabled until their own server-side credentials are explicitly configured.

## Local-first UI validation — 2026-08-11

The revised workspace renders without a Settings navigation item or a disconnected-credentials warning. The sidebar now displays `Local workspace ready`, and the import view presents a local-first capability panel with no-account setup language. The visible example-source control still populates the controlled import input successfully.

## Local-first workspace flow validation — 2026-08-11

The staged import completed into the product workspace. Variant selection, evidence display, local optimization entry, and the market comparison area rendered successfully. The market area now uses `Comparison workspace`, `Example comparison workspace — not live market data`, and `Displayed price band`, preserving a clear distinction between local fixtures and verified provider results.

## Local-first production deployment validation — 2026-08-11

The isolated production deployment at `https://aibay-pro.pages.dev` displays the revised local-first interface. The settings item and disconnected-credentials notice are absent from the visible navigation. The health endpoint returned `ok: true` with `environment: production`; provider readiness remains false until separate, authorized external service credentials are configured.

## Capability panel validation — 2026-08-11

The responsive capability panel rendered in the local browser preview. Its `Check routes` control invoked a real request and, because the static Vite preview does not serve Pages Functions, displayed the truthful local-mode fallback toast rather than a false provider-ready result. The Pages runtime endpoint itself returned the expected local evidence-engine capability response in a direct API test.

## Responsive capability-routing production validation — 2026-08-11

The production deployment at `https://74fa4201.aibay-pro.pages.dev` rendered the responsive capability panel. Selecting `Check routes` returned the deployed Pages Function response: the local evidence engine reported `ready`, listed its supported local capabilities, and confirmed that it is the only automatically selected route. The on-screen confirmation matched the API contract and did not claim that an external provider was connected.

## Source-bound import validation — 2026-08-11

The supplied AliExpress URL was tested in production. The import view now displayed a four-stage live progress bar—URL validation, public-evidence recovery, source-bound workspace creation, and evidence review. The source redirected repeatedly before yielding a stable public product page, so AiBay showed a manual-evidence outcome rather than loading unrelated example shoes, images, fields, variants, or market listings. Redirect traversal is now bounded to prevent edge subrequest exhaustion.

## Final source-bound outcome validation — 2026-08-11

The final deployment at `https://29db2eda.aibay-pro.pages.dev` was tested with the supplied canonical AliExpress URL. The production interface showed the live progress bar, completed URL validation, flagged public-evidence recovery as unavailable, and reported `No source record`; it did not revert to `Working`. The workspace never displayed an unrelated product or fixture. The source response indicated repeated redirects before a stable public product page was available, which AiBay now reports without attempting an access-control bypass.

## Session-dependent source diagnostic and evidence continuation — 2026-08-11

The local Pages runtime received the supplied AliExpress URL and returned HTTP 409 with a structured `session_required` diagnostic. The browser UI showed the source adapter (`aliexpress-public-metadata`), one inspected redirect, and the path from `aliexpress.us` to `login.aliexpress.com`. It clearly stated that AiBay will not replay session cookies or emulate a logged-in browser. The recovery screen rendered a working manual-evidence form whose fields are explicitly described as user-provided and review-gated.

## Manual-evidence workspace validation — 2026-08-11

The continuation form created a workspace from the entered title, brand, part number, price, and specification notes. All fields displayed `User-provided field · Manual evidence intake`, were marked `Needs review`, contained no public source image, and left optimization disabled. During this test, the inherited example market fixture was detected as inappropriate for user-provided records. The market state was then corrected so such records show no product-relevant snapshot until an approved provider returns one.

## Updated session diagnostic screen — 2026-08-11

After the market-state correction, the local recovery screen again rendered the session-dependent diagnosis, route diagnostics, safe alternatives, and responsive manual-evidence form. The import was stopped at the public-evidence stage and did not attempt session replay or any CAPTCHA/access-control bypass.

## Manual-evidence market isolation validation — 2026-08-11

The updated manual-evidence record rendered with all unsupplied facts as `Unknown`, supplied facts as `Needs review`, and optimization disabled. Its market panel displayed `No approved market snapshot for this record`, no listings, no price band, and a clear statement that unrelated examples will not be used as comparisons. This confirms that a user-provided workspace is isolated from the inherited example market fixture.

## Production source-adapter validation — 2026-08-11

The isolated production extractor at `https://aibay-pro.pages.dev/api/products/extract` was tested with the supplied AliExpress URL. It returned HTTP 409 and a structured `session_required` diagnostic from the `aliexpress-public-metadata` adapter, identifying the public redirect path `aliexpress.us → login.aliexpress.com`. The response documented that the source requires cookie synchronization to expose metadata and that AiBay will not replay session cookies or emulate a logged-in browser. The isolated production health endpoint remained healthy.

## Production recovery-interface validation — 2026-08-11

The deployed `https://aibay-pro.pages.dev` interface was tested with the supplied AliExpress URL. It rendered the session-dependent source explanation, the adapter and redirect-path diagnostic, safe alternatives, the manual-evidence continuation form, and a visibly paused import timeline. No unrelated product, image, variant, or market data was displayed.

## Research Lab browser validation — 2026-08-16

The local workspace now exposes a `Research lab` navigation item. The responsive surface rendered candidate source URL, product title, brand, model/SKU, price inputs, an Add row control, and a Normalize and rank action. The page explains that scoring is evidence-aware and does not claim live demand from incomplete data.

## Research Lab end-to-end validation — 2026-08-16

A candidate with source URL, title, brand, model, and price was submitted through the browser. The UI returned a completed evidence-aware ranking, preserved the exact source URL, displayed a score, and explicitly stated that the score is not a sales prediction or live demand claim.
