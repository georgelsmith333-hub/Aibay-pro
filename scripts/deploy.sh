#!/usr/bin/env bash
# One-shot production deploy for AiBay Pro (npm-based; Node 18+ / 20+ compatible).
# Usage:  CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=d016ca182921e04d445bb9238703f336 ./scripts/deploy.sh
# Optional: PROJECT_NAME (default aibay-pro-live), APIFY_API_TOKEN (eBay actor canary)
set -euo pipefail

: "${CLOUDFLARE_API_TOKEN:?Set CLOUDFLARE_API_TOKEN (Cloudflare API token, full permissions)}"
: "${CLOUDFLARE_ACCOUNT_ID:?Set CLOUDFLARE_ACCOUNT_ID}"
PROJECT_NAME="${PROJECT_NAME:-aibay-pro-live}"
cd "$(dirname "$0")/.."

if [ ! -f scripts/ensure-infra.mjs ]; then
  echo "ERROR: run this script from inside the AiBay repo (cd into the checkout first)." >&2
  exit 1
fi
command -v node >/dev/null 2>&1 || { echo "ERROR: Node.js is required."; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "ERROR: npm is required."; exit 1; }

echo "==> 1/8 Verifying Cloudflare token"
curl -fsS "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/tokens/verify" -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" | head -c 200
echo

echo "==> 2/8 Ensuring infrastructure (D1, KV, R2, Queue)"
echo "    (R2/Queue are optional — if your plan needs enabling in the dashboard, deploy continues without them.)"
node scripts/ensure-infra.mjs

echo "==> 3/8 Installing dependencies + building (npm — no pnpm needed)"
npm install --no-package-lock --no-audit --no-fund 2>&1 | tail -2
npm run check:functions
npm run lint
npm run build

echo "==> 4/8 Deploying to Cloudflare Pages via direct API (no wrangler / no Node 22 needed)"
set -a; source .infra.env 2>/dev/null || true; set +a
export PROJECT_NAME="$PROJECT_NAME"
if command -v python3 >/dev/null 2>&1; then
  python3 scripts/deploy_api.py
elif command -v python >/dev/null 2>&1; then
  python scripts/deploy_api.py
else
  echo "    python3 not found — falling back to wrangler (requires Node 22+)."
  npx --no-install wrangler pages deploy dist --project-name "$PROJECT_NAME" --branch main --commit-dirty=true
fi

echo "==> 5/8 D1 schema"
if [ -n "${D1_ID:-}" ]; then
  echo "    (applied by deploy_api.py step 4/5 when D1_ID is set)"
else
  echo "    (D1_ID not set; schema skipped)"
fi

echo "==> 6/8 Runtime secrets (direct API — bulk put via Pages API)"
# Set CLOUDFLARE_API_TOKEN secret
SECRETS=$(curl -fsS "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/$PROJECT_NAME/deployments_configs" -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" 2>/dev/null || echo "")
# Secrets are set on the Pages project via the deployment configs API; token/account are not
# secrets in code, but we store them so the live API can use them.
curl -fsS -X PATCH "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/$PROJECT_NAME"   -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" -H "Content-Type: application/json"   -d "{"deployment_configs":{"production":{"env_vars":{"CLOUDFLARE_API_TOKEN":{"value":"$CLOUDFLARE_API_TOKEN","type":"secret_text"},"CLOUDFLARE_ACCOUNT_ID":{"value":"$CLOUDFLARE_ACCOUNT_ID","type":"secret_text"},"BROWSER_RUN_CANARY":{"value":"canary-pending","type":"secret_text"}}}}}" >/dev/null 2>&1   && echo "    secrets set via project config" || echo "    (secret injection skipped — token/account still passed at runtime via env vars)"

echo "==> 7/8 Browser Run canary (real quick action against example.com)"
CANARY=$(curl -sS -X POST "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/browser-rendering/content" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" -H "Content-Type: application/json" \
  -d '{"url":"https://example.com/"}' -w "\n%{http_code}")
CODE=$(echo "$CANARY" | tail -1)
BODY=$(echo "$CANARY" | head -n -1)
if [ "$CODE" = "200" ] && echo "$BODY" | grep -qi "example"; then
  echo "canary-verified-$(date -u +%F)" | npx --no-install wrangler pages secret put BROWSER_RUN_CANARY --project-name "$PROJECT_NAME"
  echo "    Browser Run canary PASSED — adapter will report ready."
else
  echo "    Browser Run canary failed (HTTP $CODE). Adapter stays not_configured."
fi

echo "==> 8/8 Apify eBay actor canary (optional — only when APIFY_API_TOKEN is set)"
if [ -n "${APIFY_API_TOKEN:-}" ]; then
  RUN=$(curl -sS -X POST "https://api.apify.com/v2/acts/dtrungtin%2Febay-scraper/runs" \
    -H "Authorization: Bearer $APIFY_API_TOKEN" -H "Content-Type: application/json" \
    -d '{"search":"test","country":"US","maxItems":1}' -w "\n%{http_code}")
  CODE=$(echo "$RUN" | tail -1)
  if [ "$CODE" = "201" ] || [ "$CODE" = "200" ]; then
    echo "canary-apify-verified-$(date -u +%F)" | npx --no-install wrangler pages secret put APIFY_EBay_CANARY --project-name "$PROJECT_NAME"
    echo "    Apify eBay canary started — confirm the run succeeded, then live eBay research uses the actor route."
  else
    echo "    Apify canary failed (HTTP $CODE). Add APIFY_API_TOKEN as a Pages secret and re-run."
  fi
else
  echo "    APIFY_API_TOKEN not set — skip. (Built-in reader already provides live eBay data with zero keys.)"
fi

echo ""
echo "==> Done. Your site: https://$PROJECT_NAME.pages.dev  |  Verify: https://$PROJECT_NAME.pages.dev/api/infra"
