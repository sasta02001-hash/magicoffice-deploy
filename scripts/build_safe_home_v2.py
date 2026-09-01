from __future__ import annotations

from pathlib import Path
import base64
import gzip
import hashlib
import json
import os
import re

SOURCE = Path('/tmp/mo-safe-v2/current.html')
APPROVED = Path('assets/home-hero-preview-v3/preview.html')
OUTPUT_DIR = Path('assets/home-hero-production-safe-v2')


def require(pattern: str, text: str, label: str, flags: int = re.I | re.S) -> str:
    match = re.search(pattern, text, flags)
    if not match:
        raise SystemExit(f'Missing {label}')
    return match.group(0)


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    html = SOURCE.read_text(encoding='utf-8')
    preview = APPROVED.read_text(encoding='utf-8')

    release = os.environ['RELEASE']
    poster_url = os.environ['POSTER_URL']
    desktop_bg_url = os.environ['DESKTOP_BG_URL']
    video_url = os.environ['VIDEO_URL']

    # Reuse the exact decorated wordmark already approved in v3 Preview.
    wordmark_meta = require(
        r'<meta\s+name=["\']x-magicoffice-home-video-wordmark["\'][^>]*>',
        preview,
        'approved wordmark meta',
    )
    wordmark_style = require(
        r'<style\s+id=["\']magicoffice-home-video-wordmark-v1["\']>[\s\S]*?</style>',
        preview,
        'approved wordmark style',
    )
    wordmark_div = require(
        r'<div\s+class=["\']home-video-wordmark["\'][^>]*>[\s\S]*?</div>',
        preview,
        'approved wordmark overlay',
    )

    # Remove only earlier trial/wordmark injections. The restored Production page remains the base.
    html = re.sub(r'<meta\s+name=["\']x-magicoffice-home-video-wordmark["\'][^>]*>', '', html, flags=re.I)
    html = re.sub(r'<meta\s+name=["\']x-magicoffice-production-hero-trial["\'][^>]*>', '', html, flags=re.I)
    html = re.sub(r'<style\s+id=["\']magicoffice-home-video-wordmark-v1["\']>[\s\S]*?</style>', '', html, flags=re.I)
    html = re.sub(r'<style\s+id=["\']magicoffice-home-video-safe-v2["\']>[\s\S]*?</style>', '', html, flags=re.I)
    html = re.sub(r'<div\s+class=["\']home-video-wordmark["\'][^>]*>[\s\S]*?</div>', '', html, flags=re.I)
    html = re.sub(r'<img\b[^>]*class=["\'][^"\']*\bhome-video-poster\b[^"\']*["\'][^>]*>', '', html, flags=re.I)

    # Keep the approved wordmark visible until the video is actually playing—not merely loadable.
    wordmark_style = wordmark_style.replace(
        '.homepage-cinema-stage[data-video-ready="true"] .home-video-wordmark,.homepage-cinema-stage[data-video-playable="true"] .home-video-wordmark',
        '.homepage-cinema-stage[data-video-ready="true"] .home-video-wordmark',
    )

    safe_style = f'''<meta name="x-magicoffice-production-hero-trial" content="{release}"/>
<style id="magicoffice-home-video-safe-v2">
/* Incremental patch only: exact restored Production remains the complete base. */
.home-hero-shell{{width:min(1540px,calc(100vw - 64px))!important;grid-template-columns:minmax(320px,36fr) minmax(0,64fr)!important;gap:clamp(32px,4vw,64px)!important;align-items:center!important}}
.home-hero-brand{{position:relative!important;isolation:isolate!important;min-width:0!important}}
.home-hero-brand::before{{content:""!important;position:absolute!important;inset:-7% -9%!important;z-index:-1!important;background:radial-gradient(ellipse at 42% 46%,rgba(7,4,6,.60),rgba(7,4,6,.21) 57%,transparent 77%)!important;filter:blur(11px)!important;pointer-events:none!important}}
.home-hero-eyebrow{{display:none!important}}
.home-hero-media{{padding:0!important;min-width:0!important;overflow:visible!important}}
.home-hero-media>.home-hero-ornament,.home-hero-media>[class*="home-hero-ornament"],.home-hero-media>.cinema-ornament{{display:none!important;visibility:hidden!important;opacity:0!important}}
.homepage-cinema-stage.home-hero-stage{{position:relative!important;width:100%!important;aspect-ratio:16/9!important;min-height:0!important;background:#170b10!important;border:1px solid rgba(237,208,217,.26)!important;border-radius:16px!important;overflow:hidden!important;box-shadow:0 18px 46px rgba(0,0,0,.24)!important;isolation:isolate!important}}
.homepage-cinema-stage.home-hero-stage::before,.homepage-cinema-stage.home-hero-stage::after{{content:none!important;display:none!important}}
.home-video-poster{{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;max-width:none!important;display:block!important;object-fit:cover!important;object-position:center!important;opacity:1!important;visibility:visible!important;z-index:1!important;transition:opacity .32s ease,visibility .32s ease!important;background:#170b10!important;pointer-events:none!important}}
.homepage-cinema-stage [data-home-video-mount]{{position:absolute!important;inset:0!important;z-index:2!important;display:block!important;opacity:0!important;visibility:hidden!important;transition:opacity .32s ease,visibility .32s ease!important;background:transparent!important}}
.homepage-cinema-stage [data-home-video-mount] video{{position:absolute!important;inset:0!important;display:block!important;width:100%!important;height:100%!important;object-fit:cover!important;object-position:center!important;background:#000!important;opacity:1!important}}
.homepage-cinema-stage[data-video-ready="true"] .home-video-poster{{opacity:0!important;visibility:hidden!important}}
.homepage-cinema-stage[data-video-ready="true"] [data-home-video-mount]{{opacity:1!important;visibility:visible!important}}
.homepage-cinema-stage[data-video-playable="true"][data-video-ready="false"] .home-video-wordmark{{opacity:1!important;visibility:visible!important}}
.homepage-cinema-stage[data-video-ready="true"] .home-video-wordmark{{opacity:0!important;visibility:hidden!important}}
.homepage-cinema-stage[data-video-playable="true"]{{cursor:pointer}}
.cinema-fullscreen-button{{z-index:6!important;opacity:0!important;pointer-events:none!important}}
.homepage-cinema-stage[data-video-playable="true"] .cinema-fullscreen-button{{opacity:.88!important;pointer-events:auto!important}}
.mo-home-static-bg{{background-image:url("{desktop_bg_url}")!important;background-size:cover!important;background-position:center center!important;background-repeat:no-repeat!important}}
.mo-home-static-bg>.mo-home-static-bg-image{{opacity:0!important;visibility:hidden!important}}
.mobile-bar{{grid-template-columns:repeat(4,minmax(0,1fr))!important;transition:transform .24s ease,opacity .24s ease!important;will-change:transform,opacity!important}}
.mobile-bar>.mobile-bottom-link{{min-width:0!important;display:flex!important;align-items:center!important;justify-content:center!important;text-align:center!important;text-decoration:none!important;white-space:nowrap!important}}
.mobile-bar>.mobile-bottom-link--primary{{font-weight:800!important;color:#fff4f6!important;background:linear-gradient(180deg,rgba(139,35,61,.95),rgba(92,18,40,.97))!important}}
.mobile-bar.is-scrolled-hidden{{transform:translateY(calc(100% + env(safe-area-inset-bottom,0px) + 6px))!important;opacity:0!important;pointer-events:none!important}}
@media(max-width:960px){{
  .mo-home-static-bg{{background-image:none!important}}
  .mo-home-static-bg>.mo-home-static-bg-image{{opacity:1!important;visibility:visible!important}}
  .home-hero-shell{{width:min(calc(100% - 28px),720px)!important;display:flex!important;flex-direction:column!important;gap:18px!important;padding:0!important}}
  .home-hero-brand{{width:100%!important;align-items:center!important;text-align:center!important}}
  .home-hero-brand::before{{inset:-4% -5%!important;filter:blur(9px)!important}}
  .home-hero-logo{{filter:drop-shadow(0 2px 11px rgba(0,0,0,.72))!important}}
  .home-hero-media{{width:100%!important;padding:0!important}}
  .homepage-cinema-stage.home-hero-stage{{border-radius:12px!important;aspect-ratio:16/9!important}}
  .mobile-bar{{min-height:58px!important}}
  .mobile-bar>.mobile-bottom-link{{padding:10px 4px!important;font-size:clamp(11px,3vw,13px)!important;line-height:1.2!important}}
}}
@media(max-width:430px){{.home-hero-shell{{width:calc(100% - 24px)!important;gap:12px!important}}.homepage-cinema-stage.home-hero-stage{{border-radius:8px!important}}}}
@media(prefers-reduced-motion:reduce){{.home-video-poster,[data-home-video-mount],.home-video-wordmark,.mobile-bar{{transition:none!important}}}}
</style>'''

    if '</head>' not in html:
        raise SystemExit('Missing </head>')
    html = html.replace('</head>', wordmark_meta + wordmark_style + safe_style + '</head>', 1)

    # Reset the current stage attributes without replacing any surrounding page content.
    stage_open = re.compile(
        r'<div\s+class=["\']homepage-cinema-stage home-hero-stage["\'](?P<attrs>[^>]*)>',
        re.I,
    )
    stage_match = stage_open.search(html)
    if not stage_match:
        raise SystemExit('Home hero stage not found')
    attrs = stage_match.group('attrs')
    for key in ('data-video-ready', 'data-video-playable', 'data-home-video-runtime'):
        attrs = re.sub(rf'\s{key}=["\'][^"\']*["\']', '', attrs, flags=re.I)
    opening = (
        f'<div class="homepage-cinema-stage home-hero-stage"{attrs}'
        f' data-video-ready="false" data-video-playable="false"'
        f' data-home-video-runtime="{release}">'
    )
    html = html[:stage_match.start()] + opening + html[stage_match.end():]

    mount_re = re.compile(
        r'<div\s+class=["\']homepage-cinema-video-mount["\']\s+data-home-video-mount[^>]*>[\s\S]*?</div>',
        re.I,
    )
    mount_match = mount_re.search(html)
    if not mount_match:
        raise SystemExit('Original video mount not found')

    poster = (
        f'<img class="home-video-poster" src="{poster_url}" width="1280" height="720" '
        'alt="MagicOffice 影片封面" decoding="async" fetchpriority="high" loading="eager"/>'
    )
    video_mount = (
        f'<div class="homepage-cinema-video-mount" data-home-video-mount '
        f'data-home-trial-video="{release}" aria-hidden="false">'
        f'<video class="home-trial-video" muted autoplay loop playsinline webkit-playsinline '
        f'preload="metadata" disablepictureinpicture poster="{poster_url}">'
        f'<source src="{video_url}" type="video/mp4"/></video></div>'
    )
    html = html[:mount_match.start()] + poster + wordmark_div + video_mount + html[mount_match.end():]

    runtime = f'''<script id="homepage-integrated-hero-v1-js">(()=>{{
const RELEASE={json.dumps(release)};
const stage=document.querySelector('.homepage-cinema-stage.home-hero-stage');
if(!stage)return;
const video=stage.querySelector('video.home-trial-video');
const button=stage.querySelector('.cinema-fullscreen-button');
const bar=document.querySelector('.mobile-bar');
if(!video)return;
video.muted=true;video.defaultMuted=true;video.autoplay=true;video.loop=true;video.playsInline=true;
video.setAttribute('muted','');video.setAttribute('playsinline','');video.setAttribute('webkit-playsinline','');
const setPlayable=v=>{{stage.dataset.videoPlayable=v?'true':'false'}};
const setReady=v=>{{stage.dataset.videoReady=v?'true':'false';stage.classList.toggle('is-video-ready',!!v)}};
const attempt=()=>{{try{{const p=video.play();if(p&&p.catch)p.catch(()=>setReady(false))}}catch(e){{setReady(false)}}}};
const can=()=>{{if(!video.error&&video.readyState>=2){{setPlayable(true);attempt()}}}};
const playing=()=>{{setPlayable(true);setReady(true)}};
const failed=()=>{{setReady(false);setPlayable(false)}};
video.addEventListener('loadedmetadata',can,{{passive:true}});
video.addEventListener('loadeddata',can,{{passive:true}});
video.addEventListener('canplay',can,{{passive:true}});
video.addEventListener('playing',playing,{{passive:true}});
video.addEventListener('error',failed,{{passive:true}});
video.addEventListener('abort',failed,{{passive:true}});
video.addEventListener('emptied',failed,{{passive:true}});
video.addEventListener('stalled',()=>{{if(video.readyState<2)failed()}},{{passive:true}});
stage.addEventListener('click',e=>{{if(e.target===button||button?.contains(e.target))return;if(stage.dataset.videoReady!=='true')attempt()}});
async function fullscreen(){{
  attempt();
  try{{
    if(typeof video.webkitEnterFullscreen==='function'&&/iPhone|iPad|iPod/i.test(navigator.userAgent)){{video.webkitEnterFullscreen();return}}
    if(video.requestFullscreen){{await video.requestFullscreen();return}}
    if(video.webkitRequestFullscreen){{video.webkitRequestFullscreen();return}}
    if(stage.requestFullscreen)await stage.requestFullscreen();
  }}catch(e){{}}
}}
if(button)button.addEventListener('click',e=>{{e.stopPropagation();fullscreen()}});
setReady(false);setPlayable(video.readyState>=2&&!video.error);if(video.readyState>=2)attempt();
let lastY=Math.max(0,window.scrollY),ticking=false;
if(bar)window.addEventListener('scroll',()=>{{if(innerWidth>960||ticking)return;ticking=true;requestAnimationFrame(()=>{{const y=Math.max(0,window.scrollY),d=y-lastY;if(y<72||d<-9)bar.classList.remove('is-scrolled-hidden');else if(y>150&&d>9)bar.classList.add('is-scrolled-hidden');lastY=y;ticking=false}})}},{{passive:true}});
document.documentElement.dataset.homeVideoRelease=RELEASE;
window.MagicOfficeHomeVideo={{video,stage,play:attempt,fullscreen}};
}})();</script>'''
    script_re = re.compile(
        r'<script\s+id=["\']homepage-integrated-hero-v1-js["\']>[\s\S]*?</script>',
        re.I,
    )
    if not script_re.search(html):
        raise SystemExit('Original hero script not found')
    html = script_re.sub(runtime, html, count=1)

    # Lock the compact four-action mobile bar approved in v3.
    mobile = (
        '<div aria-label="手機版便捷選單" class="mobile-bar" data-home-mobile-nav="four-core-links">'
        '<a class="mobile-bottom-link" href="#roster">姶仕名錄</a>'
        '<a class="mobile-bottom-link" href="#schedule">本週出勤</a>'
        '<a class="mobile-bottom-link" href="#event-hub">活動快報</a>'
        '<a class="mobile-bottom-link mobile-bottom-link--primary" href="https://gforms.app/r/71hSwQR" '
        'target="_blank" rel="noopener noreferrer">立即訂位</a></div>'
    )
    mobile_re = re.compile(
        r'<div\s+aria-label=["\']手機版便捷選單["\']\s+class=["\']mobile-bar["\'][^>]*>[\s\S]*?</div>',
        re.I,
    )
    if not mobile_re.search(html):
        raise SystemExit('Mobile bar not found')
    html = mobile_re.sub(mobile, html, count=1)

    checks = {
        'releaseMarkers': html.count(release) >= 3,
        'wordmarkOnce': html.count('class="home-video-wordmark"') == 1,
        'posterOnce': html.count('class="home-video-poster"') == 1,
        'videoSourceOnce': html.count(video_url) == 1,
        'actualPlayingGuard': "addEventListener('playing',playing" in html,
        'errorFallback': "addEventListener('error',failed" in html,
        'grid3664': '36fr' in html and '64fr' in html,
        'desktopBackground': desktop_bg_url in html,
        'fourMobileLinks': 'data-home-mobile-nav="four-core-links"' in html,
        'noEmptyMount': not bool(re.search(r'data-home-video-mount[^>]*>\s*</div>', html)),
        'indexable': 'index,follow' in html,
        'sections': all(f'id="{section}"' in html for section in (
            'roster', 'schedule', 'event-hub', 'menu', 'first-visit', 'location', 'recruitment'
        )),
        'actions': all(label in html for label in ('立即訂位', '本週出勤', 'LINE 官方')),
    }
    failures = [name for name, ok in checks.items() if not ok]
    if failures:
        raise SystemExit('Candidate validation failed: ' + ', '.join(failures))

    output = OUTPUT_DIR / 'index.html'
    output.write_text(html, encoding='utf-8')
    raw = html.encode('utf-8')
    compressed = gzip.compress(raw, compresslevel=9, mtime=0)
    (OUTPUT_DIR / 'index.html.gz.b64').write_text(base64.b64encode(compressed).decode('ascii'))

    manifest = {
        'release': release,
        'source': 'exact currently restored Production HTML',
        'sourceBytes': SOURCE.stat().st_size,
        'outputBytes': len(raw),
        'outputSha256': hashlib.sha256(raw).hexdigest(),
        'gzipBytes': len(compressed),
        'video': {
            'url': video_url,
            'bytes': int(os.environ['VIDEO_BYTES']),
            'sha256': os.environ['VIDEO_SHA256'],
            'width': 1280,
            'height': 720,
            'fps': 24,
            'durationSeconds': 229.166667,
            'audio': False,
        },
        'checks': checks,
    }
    (OUTPUT_DIR / 'manifest.json').write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + '\n',
        encoding='utf-8',
    )
    print('SAFE_CANDIDATE_BUILT', json.dumps(manifest, ensure_ascii=False))


if __name__ == '__main__':
    main()
