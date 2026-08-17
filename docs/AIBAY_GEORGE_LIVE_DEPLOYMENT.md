# AiBay Georgelsmith Live Deployment

This document records the separately authorized Georgelsmith Cloudflare deployment for AiBay. It is intentionally isolated from the existing Trynex site and from the pre-existing `aibay-pro` Pages project.

## Project

- Pages project: `aibay-pro-george-live`
- Production URL: `https://aibay-pro-george-live.pages.dev`
- Production branch: `arena/01a00d12-aibay-pro`
- GitHub repository: `georgelsmith333-hub/Aibay-pro-live` (the repository formerly referenced as `Aibay-pro`)
- Account: Georgelsmith333 Cloudflare account

## Dedicated bindings

| Binding | Resource |
|---|---|
| `DB` | D1 database `aibay-george-db` (`3267a266-8716-45dc-9e61-13bf8e285962`) |
| `CACHE_KV` | KV namespace `aibay-george-cache` (`d16729d9dea5429f92a0c27f05c25757`) |
| `MEDIA_BUCKET` | R2 bucket `aibay-george-media` |
| `JOB_QUEUE` | Queue `aibay-george-research` (`06915c8200c646c8a2843481af7e8b53`) |

The existing `trynex` R2 bucket and the existing `aibay-pro` Pages project are not used by this deployment.

## Deployment behavior

The application keeps provider and infrastructure states truthful. R2 media derivatives are only marked queued when an approved provider and the dedicated R2 and Queue bindings are available. Job state is durable only when the dedicated D1 and Queue bindings are present; otherwise the application uses request-scoped state and reports that limitation.

R2 billing remains account-level usage-based. The dedicated AiBay bucket is separate from the existing Trynex bucket so usage and data remain logically isolated.
