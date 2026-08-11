# Provider Routing Contract

## Decision summary

AiBay uses **manual, on-demand capability checks** rather than background polling. This keeps the browser responsive, avoids spending provider quota while the operator is idle, and gives a truthful status at the time a route is checked. The **local evidence engine** remains the default route and is selected automatically because it is always available without external authentication.

## Available options

| Approach | Trade-offs | Cost | Setup complexity |
| --- | --- | --- | --- |
| Local-first only | Reliable evidence review and deterministic drafts, but no external AI enrichment. | No external provider cost. | None. |
| Curated public Gradio allowlist | Can show the health of explicitly approved public Spaces and discover whether they are running; every Space has its own API schema, queue, and usage conditions. | Depends on each provider; public access is not unlimited. | Set `PUBLIC_GRADIO_SPACES` as a server-side non-secret environment variable. |
| User-owned provider adapter | Supports a stable, documented provider contract and authenticated access when the user elects to connect one. | Provider-dependent. | Add credentials only as encrypted server-side deployment secrets. |

## Selected route

The implementation supports the first two options. It does **not** send inference requests to a public Space automatically. The capability endpoint reads a small, explicitly configured allowlist from `PUBLIC_GRADIO_SPACES`, validates the identifier format, limits the list to three entries, and checks only public Hugging Face Space metadata with a four-second timeout.

## Response contract

```json
{
  "status": "ok",
  "checkedAt": "ISO-8601 timestamp",
  "recommendation": {
    "id": "local-evidence-engine",
    "label": "Local evidence engine",
    "reason": "Local evidence work is available immediately and is the only route selected automatically."
  },
  "providers": [
    {
      "id": "local-evidence-engine",
      "status": "ready",
      "capabilities": ["source evidence review", "deterministic listing draft"]
    }
  ],
  "policy": {
    "automaticInference": false,
    "externalRequests": "metadata-only",
    "rateLimitBehavior": "respect-provider-response"
  }
}
```

## Routing rules

| Event | AiBay behavior |
| --- | --- |
| Local route available | Use local evidence route by default. |
| Approved Space running | Display its readiness and schema-discovery capability. Do not infer its task compatibility or invoke it automatically. |
| Space sleeping or building | Display the provider state; do not wake, duplicate, or retry it. |
| Provider returns HTTP 429 | Display a rate-limited state and do not rotate keys, identities, proxies, or endpoints. |
| Provider unavailable or private | Display unavailable or unsupported; continue with local mode. |

This design intentionally excludes CAPTCHA bypassing, proxy rotation, token sharing, paid-tier evasion, automatic account creation, hidden retries, and unapproved community endpoint discovery.
