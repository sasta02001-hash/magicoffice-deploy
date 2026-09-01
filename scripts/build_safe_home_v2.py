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


def attr(tag: str, name: str, label: str) -> str:
    match = re.search(rf'\b{name}=["\']([^"\']+)["\']', tag, re.I)
    if not match:
        raise SystemExit(f'Missing {label} {name}')
    return match.group(1)


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    html = SOURCE.read_text(encoding='utf-8')
    preview = APPROVED.read_text(encoding='utf-8')

    release = os.environ['RELEASE']
    poster_url = os.environ['POSTER_URL']
    desktop_bg_url = os.environ['DESKTOP_BG_URL']
    mobile_bg_url = os.environ['MOBILE_BG_URL']
    video_url = os.environ['VIDEO_URL']

    # Use the exact decorated wordmark already approved in the v3 Preview.
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
    wordmark_style = wordmark_style.replace(
        '.homepage-cinema-stage[data-video-ready="true"] .home-video-wordmark,.homepage-cinema-stage[data-video-playable="true"] .home-video-wordmark',
        '.homepage-cinema-stage[data-video-ready="true"] .home-video-wordmark',
    )

    old_hero = require(
        r'<section\s+class=["\']hero["\']\s+id=["\']top["\'][^>]*>[\s\S]*?</section>',
        html,
        'restored standalone hero',
    )
    hero_logo_tag = require(
        r'<img\b(?=[^>]*\bclass=["\'][^"\']*\bhero-logo\b[^"\']*["\'])[^>]*>',
        old_hero,
        'current hero logo',
    )
    logo_url = attr(hero_logo_tag, 'src', 'current hero logo')

    # Remove only earlier versions of this incremental hero injection.
    html = re.sub(r'<meta\s+name=["\']x-magicoffice-home-video-wordmark["\'][^>]*>', '', html, flags=re.I)
    html = re.sub(r'<meta\s+name=["\']x-magicoffice-production-hero-trial["\'][^>]*>', '', html, flags=re.I)
    html = re.sub(r'<style\s+id=["\']magicoffice-home-video-wordmark-v1["\']>[\s\S]*?</style>', '', html, flags=re.I)
    html = re.sub(r'<style\s+id=["\']magicoffice-home-video-safe-v2["\']>[\s\S]*?</style>', '', html, flags=re.I)
    html = re.sub(r'<script\s+id=["\']magicoffice-home-video-safe-v2-js["\']>[\s\S]*?</script>', '', html, flags=re.I)

    head_patch = f'''<meta name="x-magicoffice-production-hero-trial" content="{release}"/>
<link rel="preload" as="image" href="{poster_url}" fetchpriority="high"/>
<link rel="preload" as="image" href="{desktop_bg_url}" media="(min-width:961px)"/>
<link rel="preload" as="image" href="{mobile_bg_url}" media="(max-width:960px)"/>
<style id="magicoffice-home-video-safe-v2">
.homepage-hero-v2{{position:relative;isolation:isolate;overflow:hidden;background:#080609;color:#f4f0ea;min-height:min(900px,100svh);padding:calc(68px + clamp(20px,2.4vw,38px)) 0 clamp(36px,4vw,68px);display:flex;align-items:center}}
.mo-home-static-bg{{position:absolute;inset:0;z-index:0;overflow:hidden;pointer-events:none;background:#080609 url("{desktop_bg_url}") center/cover no-repeat}}
.mo-home-static-bg-image{{position:absolute;inset:-1%;width:102%;height:102%;max-width:none;display:block;object-fit:cover;object-position:50% 48%;opacity:0;visibility:hidden;filter:saturate(.98) brightness(.91) contrast(1.025)}}
.mo-home-static-bg-shade{{position:absolute;inset:0;background:linear-gradient(90deg,rgba(5,4,6,.54) 0%,rgba(7,5,7,.25) 37%,rgba(7,5,7,.06) 72%,rgba(5,4,6,.18) 100%),linear-gradient(to top,rgba(6,4,6,.44),rgba(6,4,6,.06) 40%,transparent 67%)}}
.mo-home-motion-bg{{position:absolute;inset:0;z-index:2;overflow:hidden;pointer-events:none}}
.mo-home-petal{{position:absolute;left:var(--left);top:var(--top);width:18px;height:10px;border-radius:92% 5% 92% 5%;background:linear-gradient(145deg,rgba(255,229,238,.94),rgba(215,119,149,.90) 53%,rgba(120,31,61,.84));box-shadow:0 0 5px rgba(255,190,211,.20);opacity:var(--alpha,.42);filter:blur(var(--blur,0));will-change:transform,opacity;animation:mo-safe-petal-fall var(--duration,12s) linear var(--delay,0s) infinite}}
@keyframes mo-safe-petal-fall{{0%{{transform:translate3d(0,-100px,0) rotate(0) scale(var(--scale,1));opacity:0}}8%{{opacity:var(--alpha,.42)}}86%{{opacity:var(--alpha,.42)}}100%{{transform:translate3d(var(--drift,60px),940px,0) rotate(var(--spin,560deg)) scale(var(--scale,1));opacity:0}}}}
.home-hero-shell{{position:relative;z-index:4;width:min(1540px,calc(100vw - 64px));margin:0 auto;display:grid;grid-template-columns:minmax(320px,36fr) minmax(0,64fr);gap:clamp(32px,4vw,64px);align-items:center}}
.home-hero-brand{{position:relative;isolation:isolate;min-width:0;padding:clamp(8px,1.5vw,22px) 0;display:flex;flex-direction:column;align-items:flex-start;justify-content:center}}
.home-hero-brand::before{{content:"";position:absolute;inset:-8% -10%;z-index:-1;background:radial-gradient(ellipse at 42% 46%,rgba(7,4,6,.64),rgba(7,4,6,.22) 57%,transparent 78%);filter:blur(12px);pointer-events:none}}
.home-hero-logo{{display:block;width:min(100%,310px);height:auto;object-fit:contain;margin:0 0 12px;filter:drop-shadow(0 2px 11px rgba(0,0,0,.44))}}
.home-hero-brand h1{{margin:0;color:#f3eee7;font-size:clamp(2rem,3.1vw,3.7rem);line-height:1.04;letter-spacing:.055em;font-weight:600}}
.home-hero-tagline{{margin:16px 0 22px;color:#d0c7c2;font-size:clamp(.92rem,1vw,1.08rem);line-height:1.65;text-shadow:0 2px 9px rgba(0,0,0,.75)}}
.home-hero-actions{{display:flex;gap:10px;flex-wrap:wrap;align-items:center}}
.home-hero-actions .button{{min-width:132px;justify-content:center}}
.home-hero-media{{min-width:0;width:100%;padding:0}}
.homepage-cinema-stage.home-hero-stage{{position:relative;width:100%;aspect-ratio:16/9;min-height:0;background:#170b10;border:1px solid rgba(237,208,217,.26);border-radius:16px;overflow:hidden;box-shadow:0 18px 46px rgba(0,0,0,.26);isolation:isolate}}
.homepage-cinema-stage.home-hero-stage::before,.homepage-cinema-stage.home-hero-stage::after{{content:none;display:none}}
.home-video-poster{{position:absolute;inset:0;width:100%;height:100%;max-width:none;display:block;object-fit:cover;object-position:center;opacity:1;visibility:visible;z-index:1;transition:opacity .32s ease,visibility .32s ease;background:#170b10;pointer-events:none}}
.homepage-cinema-stage [data-home-video-mount]{{position:absolute;inset:0;z-index:2;display:block;opacity:0;visibility:hidden;transition:opacity .32s ease,visibility .32s ease;background:transparent}}
.homepage-cinema-stage [data-home-video-mount] video{{position:absolute;inset:0;display:block;width:100%;height:100%;object-fit:cover;object-position:center;background:#000;opacity:1}}
.homepage-cinema-stage[data-video-ready="true"] .home-video-poster{{opacity:0;visibility:hidden}}
.homepage-cinema-stage[data-video-ready="true"] [data-home-video-mount]{{opacity:1;visibility:visible}}
.homepage-cinema-stage[data-video-playable="true"][data-video-ready="false"] .home-video-wordmark{{opacity:1!important;visibility:visible!important}}
.homepage-cinema-stage[data-video-ready="true"] .home-video-wordmark{{opacity:0!important;visibility:hidden!important}}
.homepage-cinema-stage[data-video-playable="true"]{{cursor:pointer}}
.cinema-fullscreen-button{{position:absolute;right:14px;bottom:14px;z-index:6;width:42px;height:42px;border-radius:50%;border:1px solid rgba(245,226,218,.56);background:rgba(12,6,9,.62);color:#fff;display:grid;place-items:center;font-size:1.25rem;line-height:1;cursor:pointer;opacity:0;pointer-events:none;transition:opacity .2s ease,background .2s ease}}
.homepage-cinema-stage[data-video-playable="true"] .cinema-fullscreen-button{{opacity:.88;pointer-events:auto}}
.cinema-fullscreen-button:hover,.cinema-fullscreen-button:focus-visible{{opacity:1;background:rgba(12,6,9,.84);outline:none}}
.mobile-bar{{grid-template-columns:repeat(4,minmax(0,1fr))!important;transition:transform .24s ease,opacity .24s ease!important;will-change:transform,opacity!important}}
.mobile-bar>.mobile-bottom-link{{min-width:0!important;display:flex!important;align-items:center!important;justify-content:center!important;text-align:center!important;text-decoration:none!important;white-space:nowrap!important}}
.mobile-bar>.mobile-bottom-link--primary{{font-weight:800!important;color:#fff4f6!important;background:linear-gradient(180deg,rgba(139,35,61,.95),rgba(92,18,40,.97))!important}}
.mobile-bar.is-scrolled-hidden{{transform:translateY(calc(100% + env(safe-area-inset-bottom,0px) + 6px))!important;opacity:0!important;pointer-events:none!important}}
@media(max-width:960px){{
  .homepage-hero-v2{{min-height:auto;padding:calc(68px + env(safe-area-inset-top,0px) + 14px) 0 34px;display:block}}
  .mo-home-static-bg{{background-image:none}}
  .mo-home-static-bg-image{{opacity:1;visibility:visible}}
  .mo-home-static-bg-shade{{background:linear-gradient(to top,rgba(5,4,6,.56) 1%,rgba(7,5,7,.18) 50%,rgba(7,5,7,.08) 100%),linear-gradient(90deg,rgba(5,4,6,.16),transparent 75%)}}
  .mo-home-motion-bg{{opacity:.84}}
  .mo-home-petal{{width:14px;height:8px}}
  .home-hero-shell{{width:min(calc(100% - 28px),720px);display:flex;flex-direction:column;gap:16px}}
  .home-hero-brand{{width:100%;align-items:center;text-align:center;padding:2px 0 0}}
  .home-hero-brand::before{{inset:-4% -5%;filter:blur(9px)}}
  .home-hero-logo{{width:min(52vw,220px);margin-bottom:4px}}
  .home-hero-brand h1{{font-size:clamp(1.65rem,7vw,2.35rem);letter-spacing:.04em}}
  .home-hero-tagline{{margin:7px 0 12px;font-size:.82rem;line-height:1.4}}
  .home-hero-actions{{justify-content:center;width:100%}}
  .home-hero-actions .button{{min-width:138px}}
  .home-hero-media{{width:100%}}
  .homepage-cinema-stage.home-hero-stage{{border-radius:12px;aspect-ratio:16/9}}
  .cinema-fullscreen-button{{right:10px;bottom:10px;width:40px;height:40px}}
  .mobile-bar{{min-height:58px!important}}
  .mobile-bar>.mobile-bottom-link{{padding:10px 4px!important;font-size:clamp(11px,3vw,13px)!important;line-height:1.2!important}}
}}
@media(max-width:430px){{.homepage-hero-v2{{padding-top:calc(68px + env(safe-area-inset-top,0px) + 10px)}}.home-hero-shell{{width:calc(100% - 24px);gap:11px}}.home-hero-logo{{width:min(50vw,200px)}}.homepage-cinema-stage.home-hero-stage{{border-radius:8px}}}}
@media(prefers-reduced-motion:reduce){{.mo-home-motion-bg{{display:none}}.home-video-poster,[data-home-video-mount],.home-video-wordmark,.mobile-bar{{transition:none!important}}}}
</style>'''

    if '</head>' not in html:
        raise SystemExit('Missing </head>')
    html = html.replace('</head>', wordmark_meta + wordmark_style + head_patch + '</head>', 1)

    petals = ''.join([
        '<i class="mo-home-petal" style="--left:7%;--top:-15%;--delay:-1.1s;--duration:11.8s;--drift:64px;--scale:.92;--alpha:.47;--spin:570deg"></i>',
        '<i class="mo-home-petal" style="--left:22%;--top:-23%;--delay:-6.4s;--duration:13.9s;--drift:-48px;--scale:.70;--alpha:.31;--spin:-530deg;--blur:.2px"></i>',
        '<i class="mo-home-petal" style="--left:39%;--top:-10%;--delay:-3.3s;--duration:10.8s;--drift:82px;--scale:1.05;--alpha:.51;--spin:640deg"></i>',
        '<i class="mo-home-petal" style="--left:56%;--top:-26%;--delay:-9.0s;--duration:14.6s;--drift:-62px;--scale:.66;--alpha:.28;--spin:-590deg;--blur:.3px"></i>',
        '<i class="mo-home-petal" style="--left:72%;--top:-11%;--delay:-5.1s;--duration:12.3s;--drift:52px;--scale:.88;--alpha:.42;--spin:550deg"></i>',
        '<i class="mo-home-petal" style="--left:86%;--top:-19%;--delay:-11.0s;--duration:15s;--drift:-72px;--scale:.62;--alpha:.27;--spin:-620deg;--blur:.35px"></i>',
        '<i class="mo-home-petal" style="--left:96%;--top:-7%;--delay:-7.4s;--duration:11.2s;--drift:-38px;--scale:.80;--alpha:.37;--spin:590deg"></i>',
    ])

    hero = f'''<section class="homepage-hero-v2" id="top" aria-label="MagicOffice 首頁主視覺">
<div class="mo-home-static-bg" aria-hidden="true"><img class="mo-home-static-bg-image" src="{mobile_bg_url}" width="1000" height="1333" alt="" decoding="async" fetchpriority="high" loading="eager"/><span class="mo-home-static-bg-shade"></span></div>
<div class="mo-home-motion-bg" aria-hidden="true">{petals}</div>
<div class="home-hero-shell">
  <div class="home-hero-brand">
    <img class="home-hero-logo" src="{logo_url}" alt="MagicOffice 正式商標" decoding="async" fetchpriority="high" loading="eager"/>
    <h1>魔幻姶仕社</h1>
    <p class="home-hero-tagline">白天讓人安定，夜晚讓情緒流動。</p>
    <div class="home-hero-actions"><a class="button primary" href="https://gforms.app/r/71hSwQR" rel="noopener noreferrer" target="_blank">立即訂位</a><a class="button ghost" href="#schedule">本週出勤</a></div>
  </div>
  <div class="home-hero-media" aria-label="MagicOffice 首頁影片">
    <div class="homepage-cinema-stage home-hero-stage" data-video-ready="false" data-video-playable="false" data-home-video-runtime="{release}">
      <img class="home-video-poster" src="{poster_url}" width="1280" height="720" alt="MagicOffice 影片封面" decoding="async" fetchpriority="high" loading="eager"/>
      {wordmark_div}
      <div class="homepage-cinema-video-mount" data-home-video-mount data-home-trial-video="{release}" aria-hidden="false"><video class="home-trial-video" muted autoplay loop playsinline webkit-playsinline preload="metadata" disablepictureinpicture poster="{poster_url}"><source src="{video_url}" type="video/mp4"/></video></div>
      <button class="cinema-fullscreen-button" type="button" aria-label="全螢幕觀看影片" title="全螢幕觀看影片"><span aria-hidden="true">⛶</span></button>
    </div>
  </div>
</div>
</section>'''
    html = html.replace(old_hero, hero, 1)

    mobile = (
        '<div aria-label="手機版便捷選單" class="mobile-bar" data-home-mobile-nav="four-core-links">'
        '<a class="mobile-bottom-link" href="#roster">姶仕名錄</a>'
        '<a class="mobile-bottom-link" href="#schedule">本週出勤</a>'
        '<a class="mobile-bottom-link" href="#mid-autumn">活動快報</a>'
        '<a class="mobile-bottom-link mobile-bottom-link--primary" href="https://gforms.app/r/71hSwQR" target="_blank" rel="noopener noreferrer">立即訂位</a>'
        '</div>'
    )
    mobile_re = re.compile(
        r'<div\s+aria-label=["\']手機版便捷選單["\']\s+class=["\']mobile-bar["\'][^>]*>[\s\S]*?</div>',
        re.I,
    )
    if not mobile_re.search(html):
        raise SystemExit('Mobile bar not found')
    html = mobile_re.sub(mobile, html, count=1)

    runtime = f'''<script id="magicoffice-home-video-safe-v2-js">(()=>{{
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
async function fullscreen(){{attempt();try{{if(typeof video.webkitEnterFullscreen==='function'&&/iPhone|iPad|iPod/i.test(navigator.userAgent)){{video.webkitEnterFullscreen();return}}if(video.requestFullscreen){{await video.requestFullscreen();return}}if(video.webkitRequestFullscreen){{video.webkitRequestFullscreen();return}}if(stage.requestFullscreen)await stage.requestFullscreen()}}catch(e){{}}}}
if(button)button.addEventListener('click',e=>{{e.stopPropagation();fullscreen()}});
setReady(false);setPlayable(video.readyState>=2&&!video.error);setTimeout(attempt,0);setTimeout(attempt,700);
let lastY=Math.max(0,window.scrollY),ticking=false;
if(bar)window.addEventListener('scroll',()=>{{if(innerWidth>960||ticking)return;ticking=true;requestAnimationFrame(()=>{{const y=Math.max(0,window.scrollY),d=y-lastY;if(y<72||d<-9)bar.classList.remove('is-scrolled-hidden');else if(y>150&&d>9)bar.classList.add('is-scrolled-hidden');lastY=y;ticking=false}})}},{{passive:true}});
document.documentElement.dataset.homeVideoRelease=RELEASE;
window.MagicOfficeHomeVideo={{video,stage,play:attempt,fullscreen}};
}})();</script>'''
    if '</body>' not in html:
        raise SystemExit('Missing </body>')
    html = html.replace('</body>', runtime + '</body>', 1)

    required_sections = ('roster', 'schedule', 'mid-autumn', 'yuzu-birthday', 'summer-navy', 'menu', 'first-visit', 'location', 'recruitment')
    checks = {
        'releaseMarkers': html.count(release) >= 3,
        'newHeroOnce': html.count('class="homepage-hero-v2"') == 1,
        'oldHeroRemoved': '<section class="hero" id="top">' not in html,
        'wordmarkOnce': html.count('class="home-video-wordmark"') == 1,
        'posterOnce': html.count('class="home-video-poster"') == 1,
        'videoSourceOnce': html.count(video_url) == 1,
        'actualPlayingGuard': "addEventListener('playing',playing" in html,
        'errorFallback': "addEventListener('error',failed" in html,
        'grid3664': '36fr' in html and '64fr' in html,
        'desktopBackground': desktop_bg_url in html,
        'mobileBackground': mobile_bg_url in html,
        'fourMobileLinks': 'data-home-mobile-nav="four-core-links"' in html,
        'indexable': 'index,follow' in html,
        'sections': all(f'id="{section}"' in html for section in required_sections),
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
    (OUTPUT_DIR / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print('SAFE_CANDIDATE_BUILT', json.dumps(manifest, ensure_ascii=False))


if __name__ == '__main__':
    main()
