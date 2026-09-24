"""Download only the hash-approved original films needed for refinement."""
import concurrent.futures
import hashlib
import json
from pathlib import Path
import time
import urllib.request

root = Path(__file__).resolve().parents[1]
plan = json.loads((root / 'vx-maintenance/privacy-plan.json').read_text())

def get_original(wid):
    expected = plan['works'][wid]['source']['originalSha256']
    path = root / 'work/sources/assets/works' / wid / 'film.mp4'
    if path.exists() and hashlib.sha256(path.read_bytes()).hexdigest() == expected:
        return {'id': wid, 'status': 'cached', 'bytes': path.stat().st_size}
    host = 'vxsagittarius-media-20260917.vercel.app' if int(wid) <= 10 else 'vxsagittarius-media-011-032.vercel.app'
    url = f'https://{host}/assets/works/{wid}/film.mp4'
    for attempt in range(3):
        try:
            with urllib.request.urlopen(url, timeout=90) as response:
                if 'video/mp4' not in response.headers.get('Content-Type', ''):
                    raise RuntimeError('non-video source')
                data = response.read(64 * 1024 * 1024 + 1)
            if hashlib.sha256(data).hexdigest() != expected:
                raise RuntimeError(f'{wid}: original source hash mismatch')
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
            return {'id': wid, 'status': 'verified-original', 'bytes': len(data)}
        except Exception:
            if attempt == 2:
                raise
            time.sleep(2)

if __name__ == '__main__':
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        for result in pool.map(get_original, sorted(plan['works'])):
            print(json.dumps(result), flush=True)
