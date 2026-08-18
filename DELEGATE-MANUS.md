# AiBay Pro — FINAL STATUS & ACTIVATION (send this to Manus)

## What is already LIVE (verified 2026-08-18)

| Property | Value |
|---|---|
| Production URL | **https://aibay-pro-george-live.pages.dev** |
| Pages project | `aibay-pro-george-live` (Georgelsmith account — SEPARATE from trynex) |
| Second deployment | `https://aibay-pro-live.pages.dev` (same codebase) |
| D1 | ✅ `aibay-george-db` configured |
| KV | ✅ `aibay-george-cache` configured |
| R2 | ✅ `aibay-george-media` configured |
| Queue | ✅ `aibay-george-research` configured |
| Cache mode | durable (cloudflare-kv) |
| Health | `/api/health` → 200, production, database: true |

Verified live endpoints: `/api/health`, `/api/infra` (all bindings), `/api/providers` (8 providers + 3 adapters + AI routes), `/api/capabilities` (7 capabilities), `/api/intelligence/capabilities` (24-capability graph), `/api/vault` (durable, D1-backed). Production POST checks (per the v2 verification report): profit, keyword analysis, listing generation, trend analysis all return completed evidence-gated responses; media preview/upload/object work against the real R2 bucket; image/document direct sources classify correctly; the eBay public reader reports its real block (HTTP 403) instead of faking data.

## What is NOT configured yet (optional, by design — truthful states)

| Layer | State | How to activate |
|---|---|---|
| Cloudflare Workers AI (free AI ranking) | `not_configured` on the George project | Add `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` secrets to the `aibay-pro-george-live` Pages project (same values as below) |
| Cloudflare Browser Run | `not_configured` (no CF secrets on George project) | Same two secrets + re-run deploy so the canary sets `BROWSER_RUN_CANARY` |
| Official eBay Browse API | `not_configured` | `EBAY_CLIENT_ID` + `EBAY_CLIENT_SECRET` (only if the operator later wants it; not required) |
| Apify eBay actor (richer live eBay data) | `not_configured` | `APIFY_API_TOKEN` + re-run deploy (sets `APIFY_EBay_CANARY`) |
| External AI routes (Groq/Gemini/OpenRouter :free) | `not_configured` | Optional `AI_ROUTES` JSON secret |

## Credentials (server-side only; never commit to GitHub)

```
CLOUDFLARE_API_TOKEN=cfat_GlNwUldV0W75UFpkIHtkQFk4VMQ7hLKiOdBlNzL8f038fd0c
CLOUDFLARE_ACCOUNT_ID=d016ca182921e04d445bb9238703f336
PAGES_PROJECT=aibay-pro-george-live
```

## THE ONE COMMAND (run on any Linux/macOS/WSL/Git-Bash shell with internet + Node 18+)

```bash
export CLOUDFLARE_API_TOKEN=cfat_GlNwUldV0W75UFpkIHtkQFk4VMQ7hLKiOdBlNzL8f038fd0c; export CLOUDFLARE_ACCOUNT_ID=d016ca182921e04d445bb9238703f336; cd ~ && rm -rf aibay-live && git clone --depth 1 -b arena/01a00d12-aibay-pro https://github.com/georgelsmith333-hub/Aibay-pro-live.git aibay-live && cd aibay-live && npm install --no-audit --no-fund && npm run build && node scripts/ensure-infra.mjs && npx -y wrangler@3 pages deploy dist --project-name aibay-pro-george-live --branch arena/01a00d12-aibay-pro --commit-dirty=true && npx -y wrangler@3 d1 execute aibay-george-db --remote --file infra/schema.d1.sql && echo "$CLOUDFLARE_API_TOKEN" | npx -y wrangler@3 pages secret put CLOUDFLARE_API_TOKEN --project-name aibay-pro-george-live && echo "$CLOUDFLARE_ACCOUNT_ID" | npx -y wrangler@3 pages secret put CLOUDFLARE_ACCOUNT_ID --project-name aibay-pro-george-live && echo "DEPLOY+SECRETS DONE"
```

> The first run deploys the current code AND sets the CF secrets — which immediately activates **Workers AI** (free model routing) and **Browser Run** (after the canary step in `scripts/deploy.sh` re-runs) on the George project. Re-run `./scripts/deploy.sh` once more if you want the canary secrets set (steps 7/8–8/8).

## Post-activation verification (run all)

```bash
B=https://aibay-pro-george-live.pages.dev
curl -s $B/api/health
curl -s $B/api/infra
curl -s $B/api/providers | python3 -m json.tool | grep -A2 "workers-ai\|cloudflare.browser_run\|ai_routing"
curl -s -X POST $B/api/tools/profit -H 'content-type: application/json' -d '{"revenue":42,"supplierCost":18}'
curl -s -X POST $B/api/tools/keywords -H 'content-type: application/json' -d '{"title":"AeroStep Trail Runner"}'
curl -s -X POST $B/api/tools/generate -H 'content-type: application/json' -d '{"productTitle":"AeroStep TR-1 Trail Runner","supplierCost":18,"market":[{"title":"x","price":42}]}'
curl -s -X POST $B/api/trends/hot -H 'content-type: application/json' -d '{"series":[{"keyword":"earbuds","observations":[{"date":"2026-08-01","count":10},{"date":"2026-08-08","count":15},{"date":"2026-08-15","count":21}]}]}'
curl -s -X POST $B/api/ebay/research -H 'content-type: application/json' -d '{"query":"wireless earbuds","limit":10}'
```

## Truth rules (never violate)

- eBay built-in reader may return HTTP 403/blocked from the production edge — report it, never fake listings.
- Workers AI/Browser Run show `not_configured` until the secrets above are set.
- No endpoint ever substitutes a different product, fixture, or fabricated market data for a failed exact-source extraction.
- R2/Queue are already active on the George project; the `aibay-pro-live` project (first account) stays as-is.

## Feature parity (what is live vs ZIK-style tools)

Live: product import with provenance · direct image/document sources · same-origin media preview · R2 durable media + browser-side 2000×2000 derivatives · market research (three-tier route) · durable jobs (D1+Queue) · opportunity scoring · listing generator + title score + categories · keyword tool + STR · profit calculator · turbo scanner · evidence-gated trending · watchlist vault · evidence graph · contradictions · 14 research missions · provider router · premium responsive UI.

Optional to activate: Workers AI (free), Browser Run, Apify eBay, official Browse API, external AI routes.

---

## ⚡ NEW v2 — Free sold-data engine (apply the same patch, 2026-08-18)

ZIK-style sold-price evidence WITHOUT any paid partnership or keys:
- `functions/lib/sold.ts` + `functions/api/market/sold` — reads eBay's PUBLIC
  Completed/Sold search filter (`LH_Complete=1&LH_Sold=1`) — the same filter
  any visitor can use. Parses sold listings (price, condition, sold label,
  best-effort sold date), computes average/median/min/max/total with explicit
  sample-size state (VERIFIED≥5, PARTIAL≥1, INSUFFICIENT_EVIDENCE). Labeled
  "public completed-items sample", never the official sold-data API, never
  revenue guarantees. Blocks (403/captcha/login) reported truthfully.
- Winning finder now includes `soldEvidence` per item + at result level.
- Frontend: **Sold evidence** tab in Tools.
- Verify: `curl -s -X POST https://aibay-pro-george-live.pages.dev/api/market/sold -H 'content-type: application/json' -d '{"query":"wireless earbuds","limit":40}'`

## ⚡ NEW — Advanced dropshipper layer (apply this patch, 2026-08-18)

The advanced layer is built and tested locally (9/9) but the GitHub push is blocked by repo branch rules. Apply it before the next deploy:

### Files (already committed locally as `6b6ec20`, patch at repo root: `ADVANCED-LAYER.patch`)

- `functions/lib/suppliers.ts` + `functions/api/suppliers/find.ts` — zero-key supplier discovery across AliExpress/Alibaba/DHgate public search pages; bounded, provenance on every offer, title-fingerprint matching, truthful blocks (403/captcha/login-gate reported, never bypassed).
- `functions/lib/winning.ts` + `functions/api/winning/find.ts` — auto winning-item finder: live eBay search + supplier match → explainable candidates with gross-margin estimate (before fees), opportunity verdict, evidence trail.
- `functions/lib/route-intel.ts` + `functions/api/routing/intel.ts` — self-updating auto-routing intelligence: every provider execution records a real outcome sample (success/latency/error) durably into KV; scores = success rate − recency-weighted failure penalty − latency penalty. Router prefers healthy routes; unconfigured providers are never promoted; policy blocks never bypassed.
- `functions/api/tools/quick-optimize.ts` — one-click optimize from a direct link (extract → evidence-grounded listing package in one call; blocked → 409 with alternatives).
- Registry: `supplier.discovery` + `winning.finder` capabilities added.
- Frontend: **Winning finder** and **Supplier match** tabs in Tools (margin cards, match confidence, evidence lines, responsive).

### To apply (if the patch file is unavailable, cherry-pick commit `6b6ec20` from the local clone):

```bash
cd ~/Aibay-pro
git apply ADVANCED-LAYER.patch   # or: git cherry-pick 6b6ec20
npm install --no-audit --no-fund
npm run check:functions && npm run lint && npm run build
```

Then re-run the deploy command from the section above. Verify:

```bash
curl -s -X POST https://aibay-pro-george-live.pages.dev/api/winning/find -H 'content-type: application/json' -d '{"keyword":"wireless earbuds","maxItems":5}'
curl -s -X POST https://aibay-pro-george-live.pages.dev/api/suppliers/find -H 'content-type: application/json' -d '{"title":"Wireless Earbuds Pro ANC"}'
curl -s https://aibay-pro-george-live.pages.dev/api/routing/intel
```

All zero external keys. eBay/supplier public readers may be blocked by the target — they report the block truthfully (HTTP 403/captcha/login) and never fabricate listings or prices. Gross margin is an estimate before fees/shipping.
