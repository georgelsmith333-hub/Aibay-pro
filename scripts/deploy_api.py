#!/usr/bin/env python3
"""Direct-API Cloudflare Pages deploy — no wrangler, no Node version requirement.

Uploads dist/ to Cloudflare Pages using the Pages Direct Upload API:
  1. ensure project
  2. POST .../upload-token            -> JWT (with the API token)
  3. POST .../upload-file  (per file) -> authorized with the JWT
  4. POST .../deployments             -> manifest deploy (with the API token)
  5. POST /d1/database/{id}/query     -> apply schema

Requires env: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, plus a built dist/.
Optional env: PROJECT_NAME (default aibay-pro-live), D1_ID.
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
D1_ID = os.environ.get("D1_ID", "")

if not TOKEN or not ACCOUNT:
    print("ERROR: set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID")
    sys.exit(1)

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
if not (DIST / "index.html").exists():
    print("ERROR: dist/ not built. Run: npm run build")
    sys.exit(1)

API = f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT}"
AUTH = {"Authorization": f"Bearer {TOKEN}"}


def request(path, method="GET", body=None, content_type="application/json", headers=None, binary=None, timeout=120):
    url = f"{API}{path}"
    h = dict(AUTH)
    if headers:
        h.update(headers)
    data = binary
    if data is None and body is not None:
        data = json.dumps(body).encode()
    if content_type and data is not None:
        h["Content-Type"] = content_type
    req = urllib.request.Request(url, data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read()
            try:
                return json.loads(raw.decode())
            except Exception:
                return {"_raw": raw.decode(errors="replace")}
    except urllib.error.HTTPError as e:
        text = e.read().decode(errors="replace")
        print(f"    API {method} {path} -> HTTP {e.code}: {text[:400]}")
        raise


def ensure_project():
    print(f"==> 1/5 Ensuring Pages project '{PROJECT}'")
    try:
        request(f"/pages/projects/{PROJECT}")
        print("    project exists")
    except urllib.error.HTTPError as e:
        if e.code != 404:
            raise
        request(f"/pages/projects", "POST", {"name": PROJECT, "production_branch": "main"})
        print(f"    created project {PROJECT}")


def get_upload_token():
    print("==> 2/5 Getting upload token (JWT)")
    result = request(f"/pages/projects/{PROJECT}/upload-token", "POST")
    jwt = result.get("result", {}).get("jwt")
    if not jwt:
        print("    ERROR: upload-token response had no jwt:", json.dumps(result)[:300])
        sys.exit(1)
    print("    got upload token")
    return jwt


def upload_files(jwt):
    print("==> 3/5 Uploading files (direct upload API, JWT-authorized)")
    files = sorted(p for p in DIST.rglob("*") if p.is_file())
    manifest = {}
    for f in files:
        rel = f.relative_to(DIST).as_posix()
        data = f.read_bytes()
        manifest[rel] = {"hash": hashlib.sha256(data).hexdigest(), "size": len(data)}

    for f in files:
        rel = f.relative_to(DIST).as_posix()
        data = f.read_bytes()
        mime = mimetypes.guess_type(rel)[0] or "application/octet-stream"
        request(
            f"/pages/projects/{PROJECT}/upload-file",
            "POST",
            binary=data,
            content_type="application/octet-stream",
            headers={
                "Authorization": f"Bearer {jwt}",
                "x-content-sha256": manifest[rel]["hash"],
                "x-content-type": mime,
            },
        )
        print(f"    uploaded {rel}")

    return manifest


def create_deployment(manifest):
    print("==> 4/5 Creating deployment")
    result = request(f"/pages/projects/{PROJECT}/deployments", "POST", {"manifest": manifest})
    d = result.get("result", {})
    print(f"    deployment {d.get('id')} -> {d.get('url', '')}")
    return d


def apply_schema():
    print("==> 5/5 Applying D1 schema (if D1_ID is set)")
    schema = (ROOT / "infra" / "schema.d1.sql").read_text()
    if D1_ID:
        try:
            request(f"/d1/database/{D1_ID}/query", "POST", {"sql": schema})
            print("    D1 schema applied")
        except urllib.error.HTTPError as e:
            print(f"    (D1 query failed HTTP {e.code} — check token has D1 edit permission)")
    else:
        print("    (D1_ID not set; run scripts/ensure-infra.mjs first to populate .infra.env)")


if __name__ == "__main__":
    ensure_project()
    jwt = get_upload_token()
    manifest = upload_files(jwt)
    create_deployment(manifest)
    apply_schema()
    print("")
    print(f"==> Done. Your site: https://{PROJECT}.pages.dev")
