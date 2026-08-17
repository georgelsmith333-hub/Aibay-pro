#!/usr/bin/env python3
"""Direct-API Cloudflare Pages deploy — no wrangler, no Node version requirement.

Uploads dist/ to Cloudflare Pages using the Pages Direct Upload API (the same
API wrangler uses), creates the project if needed, and applies the D1 schema.

Requires env: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, plus a built dist/.
Optional env: PROJECT_NAME (default aibay-pro-live)
Works with Python 3 (preinstalled on Windows Git Bash via python3/python).
"""
import hashlib
import json
import mimetypes
import os
import sys
import urllib.request
import urllib.error
from pathlib import Path

TOKEN = os.environ.get("CLOUDFLARE_API_TOKEN", "")
ACCOUNT = os.environ.get("CLOUDFLARE_ACCOUNT_ID", "")
PROJECT = os.environ.get("PROJECT_NAME", "aibay-pro-live")

if not TOKEN or not ACCOUNT:
    print("ERROR: set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID")
    sys.exit(1)

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
if not (DIST / "index.html").exists():
    print("ERROR: dist/ not built. Run: npm run build")
    sys.exit(1)

API = f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT}"
HEADERS = {"Authorization": f"Bearer {TOKEN}"}


def api(path, method="GET", body=None, content_type="application/json"):
    url = f"{API}{path}"
    data = None
    headers = dict(HEADERS)
    if body is not None:
        data = body if isinstance(body, bytes) else json.dumps(body).encode()
        headers["Content-Type"] = content_type
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        text = e.read().decode(errors="replace")
        print(f"    API {method} {path} -> HTTP {e.code}: {text[:300]}")
        sys.exit(1)


print(f"==> 1/5 Ensuring Pages project '{PROJECT}'")
try:
    api(f"/pages/projects/{PROJECT}")
    print("    project exists")
except SystemExit:
    api(f"/pages/projects", "POST", {"name": PROJECT, "production_branch": "main"})
    print(f"    created project {PROJECT}")

print("==> 2/5 Uploading files (direct upload API)")
files = sorted(p for p in DIST.rglob("*") if p.is_file())
manifest = {}
for f in files:
    rel = f.relative_to(DIST).as_posix()
    data = f.read_bytes()
    manifest[rel] = {"hash": hashlib.sha256(data).hexdigest(), "size": len(data)}

for f in files:
    rel = f.relative_to(DIST).as_posix()
    data = f.read_bytes()
    h = manifest[rel]["hash"]
    mime = mimetypes.guess_type(rel)[0] or "application/octet-stream"
    req = urllib.request.Request(
        f"{API}/pages/projects/{PROJECT}/upload-file",
        data=data,
        method="POST",
        headers={
            **HEADERS,
            "Content-Type": mime,
            "x-content-sha256": h,
        },
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        json.loads(resp.read().decode())
    print(f"    uploaded {rel}")

print("==> 3/5 Creating deployment")
deploy = api(f"/pages/projects/{PROJECT}/deployments", "POST", {"manifest": manifest})["result"]
print(f"    deployment {deploy['id']} -> {deploy.get('url', '')}")

print("==> 4/5 Applying D1 schema (if D1_ID is known)")
d1_id = os.environ.get("D1_ID", "")
schema = (ROOT / "infra" / "schema.d1.sql").read_text()
if d1_id:
    try:
        api(f"/d1/database/{d1_id}/query", "POST", {"sql": schema})
        print("    D1 schema applied")
    except SystemExit:
        print("    (D1 query failed — check token permission: D1 edit)")
else:
    print("    (D1_ID not set; run scripts/ensure-infra.mjs or skip)")

print("==> 5/5 Done")
print(f"    Your site: https://{PROJECT}.pages.dev")
