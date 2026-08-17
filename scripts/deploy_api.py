#!/usr/bin/env python3
"""Direct-API Cloudflare Pages deploy — single multipart upload, NO JWT needed.

Uses the official Pages Deployments API with a multipart 'file' field:
  POST /accounts/{account}/pages/projects/{project}/deployments
  Content-Type: multipart/form-data; file=<dist tarball>
This is exactly what the dashboard's "Direct Upload" does, and it works
with a plain Pages:Edit API token — no upload-token JWT endpoint required.

Requires env: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, built dist/.
Optional env: PROJECT_NAME (default aibay-pro-live), D1_ID.
"""
import io
import json
import mimetypes
import os
import sys
import tarfile
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


def api_json(path, method="GET", body=None, timeout=120):
    url = f"{API}{path}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, headers={**AUTH, "Content-Type": "application/json"}, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        text = e.read().decode(errors="replace")
        print(f"    API {method} {path} -> HTTP {e.code}: {text[:400]}")
        raise


def ensure_project():
    print(f"==> 1/5 Ensuring Pages project '{PROJECT}'")
    try:
        api_json(f"/pages/projects/{PROJECT}")
        print("    project exists")
    except urllib.error.HTTPError as e:
        if e.code != 404:
            raise
        api_json(f"/pages/projects", "POST", {"name": PROJECT, "production_branch": "main"})
        print(f"    created project {PROJECT}")


def build_tarball():
    print("==> 2/5 Building deployment tarball (dist/ -> tar.gz)")
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tar:
        for f in sorted(DIST.rglob("*")):
            if f.is_file():
                rel = f.relative_to(DIST).as_posix()
                tar.add(f, arcname=rel)
    data = buf.getvalue()
    print(f"    tarball: {len(data)} bytes")
    return data


def multipart_body(tarball: bytes) -> tuple[bytes, str]:
    boundary = "----aibayDeployBoundary7MA4YWxkTrZu0gW"
    CRLF = b"\r\n"
    parts = []
    parts.append(b"--" + boundary.encode() + CRLF)
    parts.append(b'Content-Disposition: form-data; name="file"; filename="dist.tar.gz"' + CRLF)
    parts.append(b"Content-Type: application/gzip" + CRLF + CRLF)
    parts.append(tarball)
    parts.append(CRLF + b"--" + boundary.encode() + b"--" + CRLF)
    body = b"".join(parts)
    return body, f"multipart/form-data; boundary={boundary}"


def create_deployment(tarball: bytes):
    print("==> 3/5 Creating deployment (single multipart upload)")
    body, ctype = multipart_body(tarball)
    req = urllib.request.Request(
        f"{API}/pages/projects/{PROJECT}/deployments",
        data=body,
        headers={**AUTH, "Content-Type": ctype},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=300) as resp:
            result = json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        text = e.read().decode(errors="replace")
        print(f"    API POST deployments -> HTTP {e.code}: {text[:500]}")
        raise
    d = result.get("result", {})
    print(f"    deployment {d.get('id')} status={d.get('status')} url={d.get('url', '')}")
    return d


def apply_schema():
    print("==> 4/5 Applying D1 schema (if D1_ID is set)")
    schema = (ROOT / "infra" / "schema.d1.sql").read_text()
    if D1_ID:
        try:
            api_json(f"/d1/database/{D1_ID}/query", "POST", {"sql": schema})
            print("    D1 schema applied")
        except urllib.error.HTTPError as e:
            print(f"    (D1 query failed HTTP {e.code} — check token has D1 edit permission)")
    else:
        print("    (D1_ID not set; run scripts/ensure-infra.mjs first)")


def verify():
    print("==> 5/5 Verifying deployment")
    try:
        result = api_json(f"/pages/projects/{PROJECT}/deployments")
        deploys = result.get("result", [])
        latest = deploys[0] if deploys else {}
        print(f"    latest deployment: {latest.get('id')} status={latest.get('status')} env={latest.get('environment')}")
        if latest.get("status") != "success":
            print("    WARNING: latest deployment is not 'success' — check output above.")
    except Exception:
        print("    (could not verify deployment status)")


if __name__ == "__main__":
    ensure_project()
    tarball = build_tarball()
    create_deployment(tarball)
    apply_schema()
    verify()
    print("")
    print(f"==> Done. Your site: https://{PROJECT}.pages.dev")
