#!/usr/bin/env bash
# One-shot production deploy for AiBay Pro (run from your machine with the Cloudflare token).
# Usage:  CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=d016ca182921e04d445bb9238703f336 ./scripts/deploy.sh
set -euo pipefail

: "${CLOUDFLARE_API_TOKEN:?Set CLOUDFLARE_API_TOKEN (Cloudflare API token, full permissions)}"
: "${CLOUDFLARE_ACCOUNT_ID:?Set CLOUDFLARE_ACCOUNT_ID}"
PROJECT_NAME="${PROJECT_NAME:-aibay-pro-live}"
cd "$(dirname "$0")/.."

if [ ! -f scripts/ensure-infra.mjs ]; then
  echo "ERROR: run this script from inside the AiBay repo (cd into the checkout first)." >&2
  exit 1
fi

if ! command -v pnpm >/dev/null 2>&1; then
  echo "    pnpm not found — installing via npm..."
  npm install -g pnpm
  export PATH="$PATH:$(npm prefix -g)"
fi
command -v pnpm >/dev/null 2>&1 || { echo "ERROR: pnpm still not found after install. Run: npm install -g pnpm  then re-run this script."; exit 1; }

echo "==> 1/7 Verifying Cloudflare token"
curl -fsS "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/tokens/verify" -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" | head -c 200
echo

echo "==> 2/7 Ensuring infrastructure (D1, KV, R2, Queue)"
node scripts/ensure-infra.mjs

echo "==> 3/7 Building production bundle"
corepack enable 2>/dev/null || true
pnpm install --frozen-lockfile
pnpm check:functions
pnpm lint
pnpm build

echo "==> 4/7 Deploying to Cloudflare Pages (project: $PROJECT_NAME)"
pnpm exec wrangler pages deploy dist --project-name "$PROJECT_NAME" --branch main --commit-dirty=true

echo "==> 5/7 Applying D1 schema"
set -a; source .infra.env; set +a
if [ -n "${D1_ID:-}" ]; then
  pnpm exec wrangler d1 execute aibay-db --remote --file infra/schema.d1.sql
else
  echo "    (D1 not available; schema skipped)"
fi

echo "==> 6/7 Setting runtime secrets"
echo "$CLOUDFLARE_API_TOKEN" | pnpm exec wrangler pages secret put CLOUDFLARE_API_TOKEN --project-name "$PROJECT_NAME"
echo "$CLOUDFLARE_ACCOUNT_ID" | pnpm exec wrangler pages secret put CLOUDFLARE_ACCOUNT_ID --project-name "$PROJECT_NAME"

echo "==> 7/7 Browser Run canary (real quick action against example.com)"
CANARY=$(curl -sS -X POST "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/browser-rendering/content" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" -H "Content-Type: application/json" \
  -d '{"url":"https://example.com/"}' -w "\n%{http_code}")
CODE=$(echo "$CANARY" | tail -1)
BODY=$(echo "$CANARY" | head -n -1)
if [ "$CODE" = "200" ] && echo "$BODY" | grep -qi "example"; then
  echo "canary-verified-$(date -u +%F)" | pnpm exec wrangler pages secret put BROWSER_RUN_CANARY --project-name "$PROJECT_NAME"
  echo "    Browser Run canary PASSED — adapter will report ready."
else
  echo "    Browser Run canary failed (HTTP $CODE). Adapter stays not_configured."
fi

echo "==> 8/8 Apify eBay actor canary (only when APIFY_API_TOKEN is set)"
if [ -n "${APIFY_API_TOKEN:-}" ]; then
  RUN=$(curl -sS -X POST "https://api.apify.com/v2/acts/dtrungtin%2Febay-scraper/runs" \
    -H "Authorization: Bearer $APIFY_API_TOKEN" -H "Content-Type: application/json" \
    -d '{"search":"test","country":"US","maxItems":1}' -w "\n%{http_code}")
  CODE=$(echo "$RUN" | tail -1)
  if [ "$CODE" = "201" ] || [ "$CODE" = "200" ]; then
    echo "canary-apify-verified-$(date -u +%F)" | pnpm exec wrangler pages secret put APIFY_EBay_CANARY --project-name "$PROJECT_NAME"
    echo "    Apify eBay canary started — set APIFY_EBay_CANARY after a successful run, then live eBay research works without an eBay dev app."
  else
    echo "    Apify canary failed (HTTP $CODE). Add APIFY_API_TOKEN as a Pages secret and re-run."
  fi
else
  echo "    APIFY_API_TOKEN not set — skip. (Live eBay research without an eBay dev app needs this token.)"
fi

echo "==> Done. Your site: https://$PROJECT_NAME.pages.dev  |  Verify: https://$PROJECT_NAME.pages.dev/api/infra"
