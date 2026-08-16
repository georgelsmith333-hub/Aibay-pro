# AiBay Pro Routing Policy

## Decision order

For every task, AiBay evaluates the normalized target, task type, source access tier, required capability, provider health, configuration, latency class, quota state, and prior failure history. It then selects the lowest-cost and lowest-privilege healthy route that satisfies the task.

| Situation | First route | Fallback | Terminal outcome |
| --- | --- | --- | --- |
| Public static product page | Local bounded HTTP + structured metadata | Approved provider if configured | Source-bound evidence or incomplete evidence |
| Public page with JSON-LD/Open Graph | Local structured extractor | Approved structured provider | Evidence with field provenance |
| JS-rendered public page | Configured Browser Run/Playwright/Apify route | Manual evidence or public alternate source | `browser_required` or evidence |
| Large permitted crawl | Configured crawl provider plus durable job state | Bounded smaller task or manual source list | Job result, partial result, or blocked |
| Official eBay market research | eBay Browse API | Clearly labelled example or unavailable state | Live only if API returns live data |
| Cookie/session-dependent marketplace page | No automatic session replay | User-provided evidence, public manufacturer source, approved API | `session_required` |
| CAPTCHA, login, private account, paywall, anti-bot challenge | Stop | Safe alternatives | `blocked_by_policy` |
| Provider timeout/5xx | One or more bounded retries with backoff | Next healthy provider | `retrying`, `fallback`, or failure |
| Invalid credential/permission | No repeated retry | Other configured provider or local route | `not_configured` or `invalid_credentials` |
| Duplicate result | Normalize and fingerprint | Preserve conflicting evidence if not equivalent | Deduplicated or conflict state |

## Retry and fallback

Retry is permitted only for transient failures. Each attempt receives an attempt number, start/end time, provider ID, route ID, request ID, and error category. Retry count, total time, per-domain concurrency, and per-provider quota are bounded. A circuit breaker temporarily downgrades providers after repeated transient failures and restores them only after a bounded health check.

Fallback is not silent. The user-facing interface shows a simple progress summary, while an advanced inspection surface may show route, provider, attempts, fallback count, latency, and evidence method. A fallback result must pass the same validation contract as the primary result.

## Safety gates

The router must reject unsafe destinations before the first request and after every redirect. It must not send cookies or credentials to user-supplied hosts. It must not infer permission from a URL. If a provider is not configured or its documented capability is not verified, it cannot be selected automatically.

## Source truth

The router never converts a sample, cached unrelated product, or example comparison into live evidence. Cached values retain their original source and freshness. Stale or source-mismatched data is excluded from product-specific comparison and optimization.
