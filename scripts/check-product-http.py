"""Bounded, unauthenticated HTTP acceptance checks against a loopback preview."""
import argparse
import json
from pathlib import Path
import re
import urllib.error
import urllib.parse
import urllib.request

parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://127.0.0.1:5173')
parser.add_argument('--direct-worker-log', type=Path, help='Local Wrangler debug log; bypass its preview proxy for diagnosis only')
args = parser.parse_args()
base = args.url.rstrip('/')
if urllib.parse.urlparse(base).hostname not in ['127.0.0.1', 'localhost']:
    raise SystemExit('Use a local loopback preview only')
upstream = base
worker_headers = {}
if args.direct_worker_log:
    root = Path(__file__).resolve().parents[1]
    log_path = args.direct_worker_log.resolve()
    if not log_path.is_relative_to(root / 'outputs/product-qa'):
        raise SystemExit('Use a project-local QA log only')
    records = [line for line in log_path.read_text(encoding='utf-8-sig').splitlines() if '"type":"reloadComplete","proxyData"' in line]
    proxy = json.loads(records[-1][records[-1].index('{'):])['proxyData']
    port = int(proxy['userWorkerUrl']['port'])
    if proxy['userWorkerUrl']['hostname'] != '127.0.0.1' or not 1 <= port <= 65535:
        raise SystemExit('The worker must use local loopback')
    upstream = f'http://127.0.0.1:{port}'
    worker_headers = proxy['headers']
results = []
preview_restarts = []


def request(path, expected=200, method='GET', data=None, headers=None, retry_preview_restart=True):
    body = None if data is None else json.dumps(data).encode()
    combined = {**worker_headers, **(headers or {})}
    if args.direct_worker_log:
        combined['MF-Original-URL'] = base + path
    if body is not None:
        combined['Content-Type'] = 'application/json'
    req = urllib.request.Request(upstream + path, data=body, method=method, headers=combined)
    try:
        response = urllib.request.urlopen(req, timeout=45)
    except urllib.error.HTTPError as error:
        response = error
    content = response.read().decode('utf-8')
    # Only this suite's unauthenticated rejection probes are safe to repeat.
    # Expose the infrastructure restart separately; never retry an app error.
    if response.status == 503 and content.startswith('Your worker restarted mid-request.') and retry_preview_restart and path in ['/api/reports', '/api/profile', '/api/account']:
        preview_restarts.append(dict(path=path, method=method))
        return request(path, expected, method, data, headers, retry_preview_restart=False)
    results.append(dict(path=path, method=method, status=response.status, passed=response.status == expected))
    if response.status != expected:
        raise AssertionError(f'{method} {path}: expected {expected}, got {response.status}: {content[:300]}')
    return content


home = request('/')
assert 'Choose your feed' in home and 'Selected stories' in home
search = request('/?q=postgresql')
assert 'Search results' in search and 'Sequences and other volatiles' in search
manual = request('/?company=linkedin')
assert 'Automatic collection is unavailable' in manual and 'Selected stories' not in manual
request('/trending?period=week')
request('/companies')
request('/privacy')
request('/settings')
health = json.loads(request('/api/health'))
assert health['status'] in ['healthy', 'degraded'] and health['articles'] > 0
directory = json.loads(request('/api/companies'))
assert next(company for company in directory['companies'] if company['id'] == 'linkedin')['sourceMode'] == 'manual'
first = json.loads(request('/api/articles?mode=latest&period=today&q=postgresql&pageSize=12'))
second = json.loads(request('/api/articles?' + urllib.parse.urlencode(dict(mode='latest', period='today', q='postgresql', pageSize=12, page=2, edition=first['edition']))))
ids = [article['id'] for article in first['articles'] + second['articles']]
assert len(set(ids)) == len(ids)
article = first['articles'][0]
detail = request('/articles/' + article['id'] + '?' + urllib.parse.urlencode(dict(return_to='/?q=postgresql')))
assert 'Back to reading' in detail and 'Report a story issue' in detail
request('/articles/missing-product-acceptance-story', expected=404)
request('/api/profile', expected=401)
request('/api/account', expected=401)
request('/api/account', expected=401, method='DELETE', data={'confirmation': 'DELETE MY READING DATA'})
request('/api/reports', expected=401, method='POST', data={})
request('/api/profile', expected=403, method='POST', data={}, headers={'Origin': 'https://untrusted.example'})
request('/api/account', expected=403, method='DELETE', data={}, headers={'Origin': 'https://untrusted.example'})
request('/api/articles?pageSize=101', expected=400)
for asset in list(dict.fromkeys(re.findall(r'(?:src|href)="(/(?:assets|_next/static)/[^"?#]+\.(?:css|js))', home)))[:4]:
    request(asset)
output = Path(__file__).resolve().parents[1] / 'outputs/product-qa'
output.mkdir(parents=True, exist_ok=True)
mode = 'direct-worker' if args.direct_worker_log else 'preview-proxy'
report = dict(base=base, mode=mode, passed=True, checks=results, previewRestarts=preview_restarts, paginationUnique=True, authenticatedFlowsTested=False)
suffix = '-direct' if args.direct_worker_log else ''
(output / f'http-{urllib.parse.urlparse(base).port}{suffix}.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
print(json.dumps(dict(base=base, mode=mode, checks=len(results), passed=True, previewRestarts=preview_restarts, archiveArticles=health['articles'], paginationUnique=True)))
