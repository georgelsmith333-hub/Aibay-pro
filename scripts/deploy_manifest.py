#!/usr/bin/env python3
import base64
import json
from blake3 import blake3
import mimetypes
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

TOKEN = os.environ.get('CLOUDFLARE_API_TOKEN', '')
ACCOUNT = os.environ.get('CLOUDFLARE_ACCOUNT_ID', '')
PROJECT = os.environ.get('PROJECT_NAME', 'aibay-pro-live')
BRANCH = os.environ.get('DEPLOY_BRANCH', 'main')
COMMIT_HASH = os.environ.get('COMMIT_HASH', 'ae51c6f')
COMMIT_MESSAGE = os.environ.get('COMMIT_MESSAGE', 'Deploy latest autonomous AiBay branch')
ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / 'dist'
if not TOKEN or not ACCOUNT:
    raise SystemExit('Missing CLOUDFLARE_API_TOKEN or CLOUDFLARE_ACCOUNT_ID')
if not (DIST / 'index.html').exists():
    raise SystemExit('dist/index.html is missing; build before deploying')
API = f'https://api.cloudflare.com/client/v4/accounts/{ACCOUNT}'
AUTH = {'Authorization': f'Bearer {TOKEN}'}

def api_json(url, method='GET', body=None, headers=None, timeout=180):
    data = json.dumps(body).encode() if body is not None else None
    request_headers = {**AUTH, 'Content-Type': 'application/json', **(headers or {})}
    request = urllib.request.Request(url, data=data, headers=request_headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            payload = json.loads(response.read().decode())
            if not payload.get('success', True):
                raise RuntimeError(f'Cloudflare API returned failure: {payload.get("errors", [])[:2]}')
            return payload
    except urllib.error.HTTPError as error:
        detail = error.read().decode(errors='replace')[:800]
        raise RuntimeError(f'{method} {url} -> HTTP {error.code}: {detail}') from error

def files_and_manifest():
    files = {}
    manifest = {}
    for path in sorted(DIST.rglob('*')):
        if not path.is_file():
            continue
        rel = path.relative_to(DIST).as_posix()
        # Wrangler's Pages hash.ts hashes base64 file contents plus the extension,
        # then truncates the BLAKE3 digest to 32 hex characters.
        if rel in {'index.js', '_routes.json'}:
            continue
        content = path.read_bytes()
        extension = path.suffix[1:]
        key = blake3((base64.b64encode(content).decode() + extension).encode()).hexdigest()[:32]
        files[rel] = (content, key)
        manifest['/' + rel] = key
    return files, manifest

def post_json_url(url, body, bearer):
    request = urllib.request.Request(url, data=json.dumps(body).encode(), headers={'Authorization': f'Bearer {bearer}', 'Content-Type': 'application/json'}, method='POST')
    try:
        with urllib.request.urlopen(request, timeout=240) as response:
            payload = json.loads(response.read().decode())
            if not payload.get('success', True):
                raise RuntimeError(f'Cloudflare asset API failure: {payload.get("errors", [])[:2]}')
            return payload
    except urllib.error.HTTPError as error:
        detail = error.read().decode(errors='replace')[:800]
        raise RuntimeError(f'POST {url} -> HTTP {error.code}: {detail}') from error

def upload_assets(files, upload_jwt):
    items = []
    for rel, (content, key) in files.items():
        content_type = mimetypes.guess_type(rel)[0] or 'application/octet-stream'
        items.append({'key': key, 'value': base64.b64encode(content).decode(), 'metadata': {'contentType': content_type}, 'base64': True})
    # The Pages asset endpoint accepts batches; keep each request below a conservative 45 MiB payload.
    batches, current, current_size = [], [], 0
    for item in items:
        item_size = len(item['value'])
        if current and current_size + item_size > 45 * 1024 * 1024:
            batches.append(current); current, current_size = [], 0
        current.append(item); current_size += item_size
    if current: batches.append(current)
    for index, batch in enumerate(batches, 1):
        post_json_url('https://api.cloudflare.com/client/v4/pages/assets/upload', batch, upload_jwt)
        print(f'asset batch {index}/{len(batches)} uploaded ({len(batch)} files)')
    post_json_url('https://api.cloudflare.com/client/v4/pages/assets/upsert-hashes', {'hashes': [item['key'] for item in items]}, upload_jwt)
    print(f'asset hashes upserted ({len(items)} files)')

def multipart(fields, files):
    boundary = '----aibayManifestBoundary7MA4YWxkTrZu0gW'
    chunks = []
    for name, value in fields.items():
        chunks.extend([f'--{boundary}\r\n'.encode(), f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode(), str(value).encode(), b'\r\n'])
    for name, (content, content_type) in files.items():
        chunks.extend([f'--{boundary}\r\n'.encode(), f'Content-Disposition: form-data; name="{name}"; filename="{name}"\r\n'.encode(), f'Content-Type: {content_type}\r\n\r\n'.encode(), content, b'\r\n'])
    chunks.append(f'--{boundary}--\r\n'.encode())
    return b''.join(chunks), f'multipart/form-data; boundary={boundary}'

def create_deployment(manifest, worker_content, routes_content):
    fields = {
        'branch': BRANCH,
        'commit_dirty': 'false',
        'commit_hash': COMMIT_HASH,
        'commit_message': COMMIT_MESSAGE,
        'manifest': json.dumps(manifest, separators=(',', ':')),
        'pages_build_output_dir': 'dist',
    }
    special_files = {}
    if worker_content:
        special_files['_worker.js'] = (worker_content, 'application/javascript')
    if routes_content:
        special_files['_routes.json'] = (routes_content, 'application/json')
    body, content_type = multipart(fields, special_files)
    request = urllib.request.Request(f'{API}/pages/projects/{PROJECT}/deployments', data=body, headers={**AUTH, 'Content-Type': content_type}, method='POST')
    try:
        with urllib.request.urlopen(request, timeout=300) as response:
            payload = json.loads(response.read().decode())
            if not payload.get('success', True):
                raise RuntimeError(f'Deployment failed: {payload.get("errors", [])[:2]}')
            result = payload.get('result', {})
            print(f'deployment created: {result.get("id")} status={result.get("latest_stage", {}).get("status")} url={result.get("url")}')
            return result
    except urllib.error.HTTPError as error:
        detail = error.read().decode(errors='replace')[:1000]
        raise RuntimeError(f'Pages deployment -> HTTP {error.code}: {detail}') from error

def main():
    token_payload = api_json(f'{API}/pages/projects/{PROJECT}/upload-token')
    upload_jwt = token_payload['result']['jwt']
    files, manifest = files_and_manifest()
    worker_path = DIST / 'index.js'
    routes_path = DIST / '_routes.json'
    worker_content = worker_path.read_bytes() if worker_path.exists() else b''
    routes_content = routes_path.read_bytes() if routes_path.exists() else b''
    print(f'prepared manifest ({len(files)} assets, functions={bool(worker_content)})')
    upload_assets(files, upload_jwt)
    result = create_deployment(manifest, worker_content, routes_content)
    print(json.dumps({'project': PROJECT, 'deployment_id': result.get('id'), 'url': result.get('url'), 'status': result.get('latest_stage', {}).get('status')}, indent=2))

if __name__ == '__main__':
    main()
