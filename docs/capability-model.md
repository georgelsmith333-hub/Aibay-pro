# AiBay Capability Model

## Purpose

AiBay should be useful immediately without asking the operator to configure a marketplace developer account, an AI account, or a database. The interface must distinguish **local deterministic work** from **credential-backed external research** so it never labels sample data as live market data or suggests that authentication is being bypassed.

## Capability routes

| Approach | What works | Trade-offs | Cost | Setup complexity |
| --- | --- | --- | --- | --- |
| Local-first workspace | Public-page evidence review, variant selection, deterministic title and listing-draft structure, local comparison notes, draft export, and review-gated media workflow. | Does not claim live eBay inventory or sold-price data. | No provider account required. | None. |
| Optional approved research adapter | Adds authenticated eBay or other approved marketplace research, timestamped source attribution, and bounded rate handling when a legitimate account is configured. | Requires a user-owned provider account and obeys source policies. | Provider-dependent. | One-time server-side configuration. |

## Selected implementation

The application defaults to the local-first route. Its navigation does not expose a settings or "credentials not connected" page. It instead displays a **Local workspace ready** state with clear language: product evidence, deterministic optimization, draft export, and manual comparison work are available immediately. If an optional provider is absent, the market area remains available as a labelled example or user-supplied comparison workspace, not as a live claim.

## Provider-routing rules

1. Product extraction accepts only permitted public pages and preserves field-level source evidence.
2. A provider adapter is selected only when its required server-side credential is configured and the request is within its documented limits.
3. If no approved adapter is available, the request returns a local-mode response; it does not use proxies, access-control evasion, shared keys, or fake live results.
4. Every market result declares its provenance as **official provider**, **user-supplied comparison**, or **example snapshot**.
5. Optional providers are server-side only. Keys never appear in browser code, repository files, exports, or user-visible logs.

## User experience changes

The sidebar will use **Local workspace ready** rather than a disconnected-credentials warning. The settings route and configuration cards are removed. The market screen will retain an actionable local comparison view and will use a dedicated label for example data. The visual system will add a brighter gradient palette, animated signals, and a more expressive capability panel while preserving responsive layout and readable contrast.
