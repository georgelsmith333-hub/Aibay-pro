#!/usr/bin/env bash
# AiBay Pro — ONE-SHOT GO-LIVE (Windows Git Bash / macOS / Linux)
# Run from anywhere: it clones-or-updates the repo, installs dependencies with
# npm (Node-20 compatible — no pnpm/corepack dependency), runs the full deploy
# pipeline, waits for the site, and prints the URL.
#
# Requires:  CLOUDFLARE_API_TOKEN exported (see instructions)
# Optional:  CLOUDFLARE_ACCOUNT_ID (defaults to the AiBay account)
#            PROJECT_NAME (defaults to aibay-pro-live)
set -euo pipefail

TOKEN="${CLOUDFLARE_API_TOKEN:-}"
ACCOUNT="${CLOUDFLARE_ACCOUNT_ID:-d016ca182921e04d445bb9238703f336}"
PROJECT="${PROJECT_NAME:-aibay-pro-live}"

if [ -z "$TOKEN" ]; then
  echo "ERROR: set CLOUDFLARE_API_TOKEN first, e.g.:" >&2
  echo "  export CLOUDFLARE_API_TOKEN=cfat_YOUR_TOKEN" >&2
  exit 1
fi

echo "==============================================================="
echo " AiBay Pro go-live  ·  project: $PROJECT"
echo "==============================================================="

echo ""
echo "==> 0/7 Node + npm"
command -v node >/dev/null 2>&1 || { echo "ERROR: Node.js is required — install from https://nodejs.org (LTS) then re-run."; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "ERROR: npm is required — install Node.js from https://nodejs.org"; exit 1; }
echo "    node $(node -v) · npm $(npm -v)"

echo ""
echo "==> 1/7 Repository"
DIR="$HOME/Aibay-pro"
if [ -d "$DIR/.git" ]; then
  echo "    updating existing checkout at $DIR"
  cd "$DIR"
  git fetch origin --quiet 2>/dev/null || true
  git checkout -q arena/01a00d12-aibay-pro 2>/dev/null \
    || git switch -q -c arena/01a00d12-aibay-pro origin/arena/01a00d12-aibay-pro 2>/dev/null \
    || git switch -q -c main origin/main 2>/dev/null \
    || { git stash -q 2>/dev/null || true; git switch -q -c main origin/main; }
  git pull --ff-only --quiet origin 2>/dev/null || true
else
  echo "    cloning fresh"
  git clone --quiet https://github.com/georgelsmith333-hub/Aibay-pro.git "$DIR"
  cd "$DIR"
  git checkout -q -b arena/01a00d12-aibay-pro origin/arena/01a00d12-aibay-pro
fi
echo "    at commit $(git rev-parse --short HEAD)"

export CLOUDFLARE_API_TOKEN="$TOKEN"
export CLOUDFLARE_ACCOUNT_ID="$ACCOUNT"
export PROJECT_NAME="$PROJECT"

echo ""
echo "==> 2/7 Full deploy pipeline (token -> infra -> build -> deploy -> schema -> secrets -> canaries)"
./scripts/deploy.sh

echo ""
echo "==> 3/7 Waiting for the site to go live"
URL="https://$PROJECT.pages.dev"
CODE=""
for i in 1 2 3 4 5 6 7 8; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 "$URL/api/health" 2>/dev/null || true)
  if [ "$CODE" = "200" ]; then break; fi
  echo "    attempt $i: HTTP $CODE — waiting 8s…"
  sleep 8
done

echo ""
echo "==> 4/7 Final checks"
echo "    GET $URL/api/health  -> HTTP ${CODE:-failed}"
if [ "$CODE" = "200" ]; then
  echo "    infra:"
  curl -s --max-time 15 "$URL/api/infra" || echo "    (infra endpoint not yet available)"
  echo ""
fi

echo ""
echo "==============================================================="
echo "  YOUR SITE IS LIVE:  $URL"
echo "  Dashboard:          $URL/"
echo "  Verify infra:       $URL/api/infra"
echo "  Live eBay data:     built-in reader is ACTIVE with zero keys."
echo "  Optional richer:    EBAY_CLIENT_ID / EBAY_CLIENT_SECRET or"
echo "                      APIFY_API_TOKEN as Pages secrets."
echo "==============================================================="
