@echo off
REM ============================================================
REM  AiBay Pro GO-LIVE — double-click to deploy (Windows)
REM  Clones-or-updates the repo, asks for your Cloudflare token,
REM  then runs the full deploy (no Node 22 / no wrangler needed).
REM ============================================================
setlocal enabledelayedexpansion

echo.
echo  ==============================================
echo   AiBay Pro GO-LIVE
echo  ==============================================
echo.

set "REPO=%USERPROFILE%\Aibay-pro"
set "ACCOUNT=d016ca182921e04d445bb9238703f336"

if not exist "%REPO%\.git" (
  echo  Cloning repository for the first time...
  git clone https://github.com/georgelsmith333-hub/Aibay-pro.git "%REPO%" || goto :error
) else (
  echo  Repository found at %REPO%
)

cd /d "%REPO%"
echo  Updating to the latest build...
git fetch origin || goto :error
git reset --hard origin/arena/01a00d12-aibay-pro 2>nul || git reset --hard origin/main || goto :error

echo.
set /p TOKEN=  Paste your Cloudflare API token here and press Enter: 
if "%TOKEN%"=="" goto :error

set "CLOUDFLARE_API_TOKEN=%TOKEN%"
set "CLOUDFLARE_ACCOUNT_ID=%ACCOUNT%"

echo.
echo  Running deploy (this takes a few minutes - please wait)...
bash scripts/deploy.sh
if errorlevel 1 goto :error

echo.
echo  ==============================================
echo   DONE. Your site: https://aibay-pro-live.pages.dev
echo  ==============================================
pause
exit /b 0

:error
echo.
echo  Something failed - please take a screenshot of this window
echo  and send it over. 
pause
exit /b 1
