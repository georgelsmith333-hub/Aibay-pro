param(
    [Parameter(Mandatory = $true)]
    [string]$Token,
    [string]$AccountId = "d016ca182921e04d445bb9238703f336"
)
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

Write-Host "==> 1/7 Verifying Cloudflare token"
$headers = @{ Authorization = "Bearer $Token" }
$verify = Invoke-RestMethod -Uri "https://api.cloudflare.com/client/v4/accounts/$AccountId/tokens/verify" -Headers $headers -Method Get
if (-not $verify.success) { throw "Token verification failed: $($verify | ConvertTo-Json -Compress)" }

Write-Host "==> 2/7 Ensuring infrastructure (D1, KV, R2, Queue)"
$env:CLOUDFLARE_API_TOKEN = $Token
$env:CLOUDFLARE_ACCOUNT_ID = $AccountId
node scripts/ensure-infra.mjs

Write-Host "==> 3/7 Building production bundle"
pnpm install --frozen-lockfile
pnpm check:functions
pnpm lint
pnpm build

Write-Host "==> 4/7 Deploying to Cloudflare Pages (project: aibay-pro)"
pnpm exec wrangler pages deploy dist --project-name aibay-pro --branch main --commit-dirty=true

Write-Host "==> 5/7 Applying D1 schema"
if (Test-Path .infra.env) {
    Get-Content .infra.env | ForEach-Object {
        if ($_ -match "^([^=]+)=(.*)$") { Set-Item -Path "Env:$($matches[1])" -Value $matches[2] }
    }
    if ($env:D1_ID) {
        pnpm exec wrangler d1 execute aibay-db --remote --file infra/schema.d1.sql
    } else {
        Write-Host "    (D1 not available; schema skipped)"
    }
}

Write-Host "==> 6/7 Setting runtime secrets"
$Token | pnpm exec wrangler pages secret put CLOUDFLARE_API_TOKEN --project-name aibay-pro
$AccountId | pnpm exec wrangler pages secret put CLOUDFLARE_ACCOUNT_ID --project-name aibay-pro

Write-Host "==> 7/7 Browser Run canary"
try {
    $canary = Invoke-WebRequest -Uri "https://api.cloudflare.com/client/v4/accounts/$AccountId/browser-rendering/content" -Headers $headers -Method Post -ContentType "application/json" -Body '{"url":"https://example.com/"}'
    if ($canary.StatusCode -eq 200 -and $canary.Content -match "example") {
        "canary-verified-$(Get-Date -Format yyyy-MM-dd)" | pnpm exec wrangler pages secret put BROWSER_RUN_CANARY --project-name aibay-pro
        Write-Host "    Browser Run canary PASSED - adapter will report ready."
    } else {
        Write-Host "    Browser Run canary returned HTTP $($canary.StatusCode); adapter stays not_configured."
    }
} catch {
    Write-Host "    Browser Run canary failed: $($_.Exception.Message). Adapter stays not_configured."
}

Write-Host "==> Done. Verify: https://aibay-pro.pages.dev/api/infra"
