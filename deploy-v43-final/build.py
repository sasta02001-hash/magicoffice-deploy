#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import importlib.util
import json
import subprocess
from pathlib import Path

from PIL import Image

MODULE_PATH = Path('rebuild-v43/build_site_v3.py')
spec = importlib.util.spec_from_file_location('mo_builder_base', MODULE_PATH)
if spec is None or spec.loader is None:
    raise RuntimeError('Unable to load base builder')
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)

SITE_ROOT = base.SITE_ROOT
RELEASE = 'magicoffice-v4.3-clean-replacement-2026-09-03'


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def image_record(path: Path) -> dict:
    with Image.open(path) as image:
        image.load()
        width, height = image.size
    return {
        'path': str(path.relative_to(SITE_ROOT)),
        'bytes': path.stat().st_size,
        'sha256': digest(path),
        'width': width,
        'height': height,
    }


def add_assets() -> tuple[list[dict], dict]:
    records: list[dict] = []

    records.append(base.save_image(
        [f'{base.RAW_MAIN}/assets/home-hero-preview-v3/magicoffice-home-video-poster-v1.webp'],
        SITE_ROOT / 'assets/images/hero/poster.webp', min_bytes=40_000,
    ))
    records.append(base.save_image(
        [f'{base.RAW_MAIN}/assets/home-clean-scene-desktop-v1/magicoffice-home-clean-scene-desktop-v1.webp'],
        SITE_ROOT / 'assets/images/hero/background-desktop.webp', min_bytes=100_000,
    ))
    records.append(base.make_mobile_background(
        SITE_ROOT / 'assets/images/hero/background-desktop.webp',
        SITE_ROOT / 'assets/images/hero/background-mobile.webp',
    ))
    records.append(base.save_image(base.v207_candidates('05f19666ed49f368.png'), SITE_ROOT / 'assets/images/logo/logo-gold.png', min_bytes=3_000))

    roster_map = {
        'mibao':'46a75e190baad8e8.webp','yuzu':'e22350b8ec2d748a.webp','jubi':'9cf5f3c7c8e43450.webp','cc':'815c2fdfd2a254ce.webp',
        'lele':'1d6e303714642bf6.webp','cara':'6abf49f3aab3c507.webp','medamayaki':'3241306c93000ad3.webp','sakuri':'8f1e2635714effb9.webp',
        'hekiru':'617f58b1207050e6.webp','rumei':'2d5ed350d26c050b.webp','naya':'4fd4c223e064c15d.webp','sakuma':'f2097a926bdf48b3.webp',
        'nana':'e404ebb20f7273f8.webp','mona':'59f9acb8861a6595.webp','kokoro':'4bf65583e3739d3f.webp','mika':'d9800fa21c1b6e2e.webp',
    }
    for slug, filename in roster_map.items():
        records.append(base.save_image(base.v207_candidates(filename), SITE_ROOT / f'assets/images/roster/{slug}.webp', min_bytes=1_500))

    records.append(base.make_heartbeat_poster(SITE_ROOT / 'assets/images/events/heartbeat.webp'))
    for slug, filename in {
        'mid-autumn':'aa7f2899b9a883f5.webp','yuzu':'a1b97912e03ddf75.webp','summer':'38f7487b4a48705b.webp','jubi':'3760e1f1d1df1182.webp',
    }.items():
        records.append(base.save_image(base.v207_candidates(filename), SITE_ROOT / f'assets/images/events/{slug}.webp', min_bytes=2_000))

    for slug, filename in {
        'cafe':'441b778dda048206.webp','bar':'f12cf40a97634cc9.webp','collection':'d9961b8b48fdb587.webp',
    }.items():
        records.append(base.save_image(base.v207_candidates(filename), SITE_ROOT / f'assets/images/menu/{slug}.webp', min_bytes=2_000))

    for slug, filename in {
        'sakura-throne':'d878f9472706fdbe.webp','cafe-corner':'49acafbeb1e4b6bb.webp','night-bar':'4739c5c2017c4c0e.webp',
    }.items():
        records.append(base.save_image(base.v207_candidates(filename), SITE_ROOT / f'assets/images/venue/{slug}.webp', min_bytes=2_000))

    video = base.build_video()
    return records, video


def validate(records: list[dict], video: dict) -> dict:
    html = (SITE_ROOT / 'index.html').read_text(encoding='utf-8')
    css = (SITE_ROOT / 'assets/site.css').read_text(encoding='utf-8')
    js = (SITE_ROOT / 'assets/app.js').read_text(encoding='utf-8')
    roster = json.loads((SITE_ROOT / 'content/roster.json').read_text(encoding='utf-8'))
    events = json.loads((SITE_ROOT / 'content/events.json').read_text(encoding='utf-8'))
    menu = json.loads((SITE_ROOT / 'content/menu-snapshot.json').read_text(encoding='utf-8'))

    images = [image_record(path) for path in sorted((SITE_ROOT / 'assets/images').rglob('*')) if path.is_file() and path.suffix.lower() in {'.png','.jpg','.jpeg','.webp'}]
    groups = {
        'roster':[item for item in images if '/roster/' in item['path']],
        'events':[item for item in images if '/events/' in item['path']],
        'menu':[item for item in images if '/menu/' in item['path']],
    }
    menu_items = sum(len(category.get('items', [])) for world in menu.get('worlds', []) for category in world.get('categories', []))
    event_sections = sum(len(event.get('sections', [])) for event in events.get('events', []))
    active_people = [person for person in roster.get('people', []) if person.get('active', True)]

    probe = json.loads(subprocess.check_output([
        'ffprobe','-v','error','-show_entries','stream=codec_type,codec_name,width,height,r_frame_rate,sample_rate,channels',
        '-show_entries','format=duration,size','-of','json',str(SITE_ROOT / 'assets/video/hero-trial-12s-with-audio.mp4')
    ], text=True))
    stream_types = {stream.get('codec_type') for stream in probe.get('streams', [])}

    checks = {
        'releaseMarker': RELEASE in html,
        'cleanSource': 'site-v2.0.6.css' not in html and 'magic-core-js.js' not in html,
        'borderlessHeroLogo': 'class="hero-logo"' in html and 'brand-plaque' not in html,
        'videoPosterFallback': 'class="video-poster"' in html and 'data-video-state="poster"' in html,
        'videoControls': all(token in html for token in ['video-play','video-sound','video-volume','video-fullscreen']),
        'menuTabsRuntime': 'id="menu-tabs"' in html and 'data-menu-world' in js,
        'menuThemes': all(token in css for token in ['menu-theme-cafe','menu-theme-bar','menu-theme-collection']),
        'softContours': 'border-radius:34px' in css and 'border-radius:999px' in css,
        'eventsComplete': len(events.get('events', [])) == 5 and event_sections >= 13,
        'rosterComplete': len(active_people) == 16,
        'menuComplete': len(menu.get('worlds', [])) == 3 and menu_items >= 88,
        'imageCounts': len(groups['roster']) == 16 and len(groups['events']) == 5 and len(groups['menu']) == 3,
        'uniqueRosterImages': len({item['sha256'] for item in groups['roster']}) == 16,
        'uniqueEventImages': len({item['sha256'] for item in groups['events']}) == 5,
        'uniqueMenuImages': len({item['sha256'] for item in groups['menu']}) == 3,
        'videoAudio': {'video','audio'}.issubset(stream_types),
        'localPrimaryAssets': 'magicoffice-hwpboy' not in html and 'raw.githubusercontent.com' not in html,
    }

    manifest = {
        'release': RELEASE,
        'siteRoot': str(SITE_ROOT),
        'checks': checks,
        'counts': {'roster':len(active_people),'events':len(events.get('events', [])),'eventSections':event_sections,'menuWorlds':len(menu.get('worlds', [])),'menuItems':menu_items},
        'groups': {name: len(items) for name, items in groups.items()},
        'images': images,
        'downloaded': records,
        'video': video,
        'ffprobe': probe,
    }
    (SITE_ROOT / 'build-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    failed = [name for name, passed in checks.items() if not passed]
    if failed:
        raise RuntimeError('Final v4.3 validation failed: ' + ', '.join(failed))
    return manifest


def main() -> None:
    base.clean_copy()
    records, video = add_assets()
    manifest = validate(records, video)
    print(json.dumps({'release':RELEASE,'checks':manifest['checks'],'counts':manifest['counts'],'groups':manifest['groups'],'videoBytes':video['bytes']}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
