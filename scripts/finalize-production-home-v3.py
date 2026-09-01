from __future__ import annotations

from pathlib import Path
from urllib.parse import urljoin, urlparse
import base64
import hashlib
import json
import os
import re
import shutil

import requests
from PIL import Image

ROOT = Path.cwd()
OUT = ROOT / 'assets' / 'home-hero-production-safe-v2'
HTML = OUT / 'index.html'
SOURCE_ORIGIN = os.environ.get('SOURCE_ORIGIN', 'https://magicoffice-hwpboyvf0-magicoffice.vercel.app/').rstrip('/') + '/'
RELEASE = os.environ.get('RELEASE', 'home-hero-video-wordmark-production-2026-09-01-v3')
VIDEO_SHA = '2251aa3eb1d386a4d3a889ab147f7a212838e7f1c56bcac018e92fb44bc5f7b1'

MEDIA = OUT / 'assets' / 'media'
POSTER_SRC = ROOT / 'assets' / 'home-hero-preview-v3' / 'magicoffice-home-video-poster-v1.webp'
DESKTOP_SRC = ROOT / 'assets' / 'home-clean-scene-desktop-v1' / 'magicoffice-home-clean-scene-desktop-v1.webp'
VIDEO_SRC = ROOT / 'assets' / 'production-trial-video' / 'MagicOffice_home_trial_720p_12s_v1.mp4'
POSTER_PATH = '/assets/media/magicoffice-home-video-poster-v1.webp'
DESKTOP_PATH = '/assets/media/magicoffice-home-clean-scene-desktop-v1.webp'
MOBILE_PATH = '/assets/media/magicoffice-home-clean-scene-mobile-v1.webp'
VIDEO_PATH = '/assets/media/MagicOffice_home_trial_720p_12s_v1.mp4'


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def attr(tag: str, name: str) -> str | None:
    match = re.search(rf'\b{name}\s*=\s*(["\'])(.*?)\1', tag, re.I | re.S)
    return match.group(2) if match else None


def validate_binary(data: bytes, url: str) -> None:
    ext = Path(urlparse(url).path).suffix.lower()
    head = data[:180].lstrip().lower()
    if ext in {'.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.otf', '.mp4', '.webm', '.mp3', '.wav'}:
        if head.startswith(b'<!doctype html') or head.startswith(b'<html'):
            raise RuntimeError('binary resource resolved to HTML')
    if not data:
        raise RuntimeError('zero-byte resource')


def reconstruct_mobile_background() -> tuple[Path, dict]:
    candidates: list[tuple[int, int, int, bytes, str]] = []
    source_root = ROOT / 'source-assets'
    for directory in sorted(source_root.glob('clean-scene-*')):
        if not directory.is_dir():
            continue
        files = sorted(path for path in directory.rglob('*') if path.is_file())
        for file in files:
            try:
                data = file.read_bytes()
                with Image.open(file) as image:
                    image.load()
                    if image.width < image.height:
                        candidates.append((image.width * image.height, image.width, image.height, data, str(file.relative_to(ROOT))))
            except Exception:
                pass
        chunks: list[str] = []
        names: list[str] = []
        for file in files:
            try:
                text = file.read_text(encoding='utf-8').strip()
            except Exception:
                continue
            compact = re.sub(r'\s+', '', text)
            if len(compact) >= 100 and re.fullmatch(r'[A-Za-z0-9+/=]+', compact):
                chunks.append(compact)
                names.append(str(file.relative_to(ROOT)))
        if chunks:
            try:
                data = base64.b64decode(''.join(chunks), validate=False)
                from io import BytesIO
                with Image.open(BytesIO(data)) as image:
                    image.load()
                    if image.width < image.height:
                        candidates.append((image.width * image.height, image.width, image.height, data, '+'.join(names)))
            except Exception:
                pass
    if not candidates:
        raise RuntimeError('Could not reconstruct an approved portrait clean-scene background')
    _, width, height, data, source = max(candidates, key=lambda item: (item[0], len(item[3])))
    destination = MEDIA / MOBILE_PATH.split('/')[-1]
    destination.write_bytes(data)
    return destination, {'source': source, 'width': width, 'height': height, 'bytes': len(data), 'sha256': digest(data)}


def choose_embedded_logo(html: str) -> str | None:
    header = re.search(r'<header\b[\s\S]*?</header>', html, re.I)
    if header:
        for tag in re.findall(r'<img\b[^>]*>', header.group(0), re.I):
            src = attr(tag, 'src')
            if src and (src.startswith('data:image/') or src.startswith('/')):
                return src
    for tag in re.findall(r'<img\b[^>]*>', html, re.I):
        classes = (attr(tag, 'class') or '').lower()
        src = attr(tag, 'src')
        if src and src.startswith('data:image/') and ('logo' in classes or 'brand' in classes):
            return src
    return None


def is_resource(tag: str, name: str, attrs: str) -> bool:
    tag = tag.lower()
    name = name.lower()
    if tag in {'img', 'script', 'source', 'video', 'audio', 'track', 'iframe', 'embed', 'object'}:
        return name in {'src', 'srcset', 'poster', 'data'}
    if tag == 'link' and name == 'href':
        rel = (attr(attrs, 'rel') or '').lower()
        return any(value in rel for value in ['stylesheet', 'icon', 'manifest', 'preload', 'modulepreload'])
    return False


def mirror_resources(html: str) -> tuple[str, list[dict], list[dict]]:
    session = requests.Session()
    session.headers.update({
        'User-Agent': 'Mozilla/5.0 (compatible; MagicOfficeProductionFinalizer/3.0)',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
    })
    queue: list[tuple[str, str]] = []
    seen: set[str] = set()
    mapping: dict[str, str] = {}
    mirrored: list[dict] = []
    skipped: list[dict] = []

    tag_pattern = re.compile(r'<(?P<tag>img|script|source|video|audio|track|iframe|embed|object|link)\b(?P<attrs>[^>]*)>', re.I)
    candidates: list[str] = []
    for tag_match in tag_pattern.finditer(html):
        tag = tag_match.group('tag')
        attrs = tag_match.group('attrs')
        for value_match in re.finditer(r'\b(src|href|poster|data|srcset)\s*=\s*(["\'])(.*?)\2', attrs, re.I | re.S):
            name = value_match.group(1)
            raw = value_match.group(3).strip()
            if not is_resource(tag, name, attrs):
                continue
            if name.lower() == 'srcset':
                candidates.extend(part.strip().split()[0] for part in raw.split(','))
            else:
                candidates.append(raw)
    for match in re.finditer(r'url\(\s*(["\']?)([^"\')]+)\1\s*\)', html, re.I):
        candidates.append(match.group(2).strip())

    local_host = urlparse(SOURCE_ORIGIN).netloc
    for raw in candidates:
        if not raw or re.match(r'^(?:#|data:|blob:|javascript:|mailto:|tel:)', raw, re.I):
            continue
        full = urljoin(SOURCE_ORIGIN, raw)
        parsed = urlparse(full)
        if parsed.scheme not in {'http', 'https'}:
            continue
        if parsed.netloc == local_host and parsed.path.startswith('/assets/media/') and (OUT / parsed.path.lstrip('/')).exists():
            continue
        if full not in seen:
            seen.add(full)
            queue.append((raw, full))

    index = 0
    while index < len(queue):
        raw, full = queue[index]
        index += 1
        parsed = urlparse(full)
        if parsed.netloc == local_host:
            local_path = parsed.path
        else:
            extension = Path(parsed.path).suffix or '.bin'
            local_path = f'/assets/external/{hashlib.sha256(full.encode()).hexdigest()[:20]}{extension}'
        target = OUT / local_path.lstrip('/')
        local_reference = local_path + (f'?{parsed.query}' if parsed.query else '')
        if target.exists():
            mapping[raw] = local_reference
            mapping[full] = local_reference
            continue
        try:
            response = session.get(full, timeout=45, allow_redirects=True)
            response.raise_for_status()
            data = response.content
            validate_binary(data, full)
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
            mapping[raw] = local_reference
            mapping[full] = local_reference
            mirrored.append({
                'source': full,
                'path': local_path,
                'bytes': len(data),
                'sha256': digest(data),
                'contentType': response.headers.get('content-type', ''),
            })
            if target.suffix.lower() == '.css':
                text = data.decode('utf-8', 'replace')
                for css_match in re.finditer(r'url\(\s*(["\']?)([^"\')]+)\1\s*\)', text, re.I):
                    child = css_match.group(2).strip()
                    if child and not re.match(r'^(?:data:|#)', child, re.I):
                        child_full = urljoin(response.url, child)
                        if child_full not in seen:
                            seen.add(child_full)
                            queue.append((child, child_full))
        except Exception as error:
            skipped.append({'source': full, 'raw': raw, 'error': str(error)})

    for old, new in sorted(mapping.items(), key=lambda pair: len(pair[0]), reverse=True):
        html = html.replace(old, new)

    for item in mirrored:
        if not item['path'].lower().endswith('.css'):
            continue
        css_path = OUT / item['path'].lstrip('/')
        text = css_path.read_text(encoding='utf-8', errors='replace')
        source = item['source']
        def replace_css(match: re.Match) -> str:
            quote = match.group(1) or ''
            child = match.group(2).strip()
            if re.match(r'^(?:data:|#)', child, re.I):
                return match.group(0)
            full = urljoin(source, child)
            new = mapping.get(full) or mapping.get(child)
            return f'url({quote}{new}{quote})' if new else match.group(0)
        text = re.sub(r'url\(\s*(["\']?)([^"\')]+)\1\s*\)', replace_css, text, flags=re.I)
        css_path.write_text(text, encoding='utf-8')

    return html, mirrored, skipped


def main() -> None:
    if not HTML.exists():
        raise RuntimeError(f'Missing built candidate {HTML}')
    MEDIA.mkdir(parents=True, exist_ok=True)
    for source, destination in [
        (POSTER_SRC, MEDIA / POSTER_PATH.split('/')[-1]),
        (DESKTOP_SRC, MEDIA / DESKTOP_PATH.split('/')[-1]),
        (VIDEO_SRC, MEDIA / VIDEO_PATH.split('/')[-1]),
    ]:
        if not source.exists():
            raise RuntimeError(f'Missing repository asset {source}')
        shutil.copy2(source, destination)

    video = MEDIA / VIDEO_PATH.split('/')[-1]
    if video.stat().st_size != 3016896 or digest(video.read_bytes()) != VIDEO_SHA:
        raise RuntimeError('The 12-second trial video failed checksum verification')

    mobile, mobile_info = reconstruct_mobile_background()
    html = HTML.read_text(encoding='utf-8', errors='replace')

    # Convert all approved hero assets to same-deployment URLs.
    replacements = {
        os.environ.get('POSTER_URL', ''): POSTER_PATH,
        os.environ.get('DESKTOP_BG_URL', ''): DESKTOP_PATH,
        os.environ.get('MOBILE_BG_URL', ''): MOBILE_PATH,
        os.environ.get('VIDEO_URL', ''): VIDEO_PATH,
    }
    for old, new in replacements.items():
        if old:
            html = html.replace(old, new)

    # Do not inherit the obsolete protected preview logo URL. Reuse an embedded current header mark.
    logo = choose_embedded_logo(html)
    hero_logo_pattern = re.compile(r'(<img\b(?=[^>]*\bclass=["\'][^"\']*\bhome-hero-logo\b[^"\']*["\'])[^>]*\bsrc=)(["\'])(.*?)(\2)', re.I | re.S)
    if logo and hero_logo_pattern.search(html):
        html = hero_logo_pattern.sub(lambda match: match.group(1) + '"' + logo + '"', html, count=1)
    elif hero_logo_pattern.search(html):
        html = hero_logo_pattern.sub('<div class="home-hero-logo-text" aria-label="MagicOffice"><span>MAGIC</span><span>OFFICE</span></div>', html, count=1)

    # Update the release marker to the production identifier.
    html = re.sub(
        r'(<meta\s+name=["\']x-magicoffice-production-hero-trial["\']\s+content=)(["\']).*?\2',
        lambda match: match.group(1) + '"' + RELEASE + '"',
        html,
        flags=re.I,
    )
    if 'x-magicoffice-home-hero-production' not in html:
        html = html.replace('</head>', f'<meta name="x-magicoffice-home-hero-production" content="{RELEASE}"/></head>', 1)

    html, mirrored, skipped = mirror_resources(html)
    HTML.write_text(html, encoding='utf-8')

    critical_extensions = {'.css', '.js', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.ico', '.woff', '.woff2', '.mp4', '.webm', '.json', '.webmanifest'}
    critical = [item for item in skipped if Path(urlparse(item['source']).path).suffix.lower() in critical_extensions]

    checks = {
        'release': RELEASE in html,
        'poster': (MEDIA / POSTER_PATH.split('/')[-1]).exists(),
        'desktopBackground': (MEDIA / DESKTOP_PATH.split('/')[-1]).exists(),
        'mobileBackground': mobile.exists(),
        'video': video.exists(),
        'videoSha256': digest(video.read_bytes()) == VIDEO_SHA,
        'videoLocalReference': VIDEO_PATH in html,
        'posterLocalReference': POSTER_PATH in html,
        'mobileLocalReference': MOBILE_PATH in html,
        'desktopLocalReference': DESKTOP_PATH in html,
        'wordmark': html.count('class="home-video-wordmark"') == 1,
        'posterElement': html.count('class="home-video-poster"') == 1,
        'mobileLinks': html.count('class="mobile-bottom-link') == 4,
        'playingGuard': "video.addEventListener('playing'" in html,
        'fallbackGuard': "video.addEventListener('error'" in html,
        'sections': all(value in html for value in ['id="roster"', 'id="schedule"', 'id="menu"', 'id="location"']),
        'noCriticalSkippedAssets': not critical,
    }
    failed = [name for name, value in checks.items() if not value]
    report = {
        'release': RELEASE,
        'sourceOrigin': SOURCE_ORIGIN,
        'checks': checks,
        'failed': failed,
        'mobileBackground': mobile_info,
        'mirroredCount': len(mirrored),
        'mirrored': mirrored,
        'skipped': skipped,
        'criticalSkipped': critical,
        'outputBytes': HTML.stat().st_size,
        'outputSha256': digest(HTML.read_bytes()),
    }
    (OUT / 'production-finalize-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    (OUT / 'vercel.json').write_text(json.dumps({
        'cleanUrls': True,
        'trailingSlash': False,
        'headers': [
            {'source': '/assets/media/(.*).mp4', 'headers': [
                {'key': 'Cache-Control', 'value': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800'},
                {'key': 'Accept-Ranges', 'value': 'bytes'},
            ]},
            {'source': '/assets/(.*)', 'headers': [
                {'key': 'Cache-Control', 'value': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800'},
            ]},
        ],
    }, ensure_ascii=False, indent=2), encoding='utf-8')
    if failed:
        raise RuntimeError('Production finalization failed: ' + ', '.join(failed))
    print('MAGICOFFICE_PRODUCTION_HOME_V3_FINALIZED', json.dumps({'checks': checks, 'mirrored': len(mirrored)}, ensure_ascii=False))


if __name__ == '__main__':
    main()
