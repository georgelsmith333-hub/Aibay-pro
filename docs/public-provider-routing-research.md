# Public Provider Routing Research

## Verified findings

Hugging Face documents that Gradio Spaces expose API endpoints, with public Spaces callable through supported clients or HTTP and an OpenAPI document at `https://<space-subdomain>.hf.space/gradio_api/openapi.json`. Private Spaces require a token. The endpoint schema varies by Space and must be inspected before invocation. [1]

Hugging Face also documents platform rate limits, including a 429 response and `RateLimit` / `RateLimit-Policy` headers. Limits are applied in fixed five-minute windows and are subject to account tier and platform conditions. The documented response is to spread requests, respect reset timing, or use an authorized account—not to rotate identities, evade limits, or create artificial request routes. [2]

The Gradio JavaScript client documents that hosted Spaces can be sleeping, running, building, stopped, or in error. These statuses should be shown to operators rather than treated as an implicit fallback opportunity. Public API access depends on the Space and endpoint; private API access requires a Hugging Face token. [3]

## AiBay implementation rules

1. The local deterministic listing workflow is always the first available route.
2. Only a maintained, explicit allowlist of user-approved public Spaces can be probed.
3. The health detector uses small metadata or OpenAPI requests, has a request timeout, and records the status as ready, unavailable, rate-limited, or unsupported.
4. The router selects a route only when it advertises the required capability and is healthy. It does not retry through identity rotation, proxy pools, CAPTCHA handling, or unknown community endpoints.
5. A public provider is optional enrichment; it does not silently replace evidence-backed product facts or create an unlabelled live market claim.
6. Any inference request must use the Space’s documented API name and input schema. AiBay does not guess unknown request shapes or scrape interface traffic.

## References

[1] Hugging Face, *Spaces as API endpoints*: https://huggingface.co/docs/hub/en/spaces-api-endpoints

[2] Hugging Face, *Hub Rate limits*: https://huggingface.co/docs/hub/en/rate-limits

[3] Gradio, *JavaScript Client*: https://www.gradio.app/docs/js-client
