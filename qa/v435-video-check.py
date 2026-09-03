import json, os
from pathlib import Path
from urllib.parse import urlsplit
import requests
from playwright.sync_api import sync_playwright

URL = os.environ['CHECK_URL']
EXPECTED_RELEASE = 'magicoffice-v4.3.5-full-video-filename-caption-2026-09-03'
FILENAME = 'MagicOffice_FINAL_LARGE_SLOW_SUBTITLES_720p48_UNDER300MB.mp4'
EXPECTED_BYTES = 241646148
EXPECTED_DURATION = 228.208333
OUT = Path('v435-video-evidence')
OUT.mkdir(exist_ok=True)

session = requests.Session()
root_response = session.get(URL, timeout=60)
root_response.raise_for_status()
assert EXPECTED_RELEASE in root_response.text, 'Expected Preview release is not accessible'
origin = f"{urlsplit(root_response.url).scheme}://{urlsplit(root_response.url).netloc}"
video_url = f'{origin}/assets/video/{FILENAME}'

head = session.head(video_url, timeout=60, allow_redirects=True)
head.raise_for_status()
content_length = int(head.headers.get('content-length', '0'))
assert content_length == EXPECTED_BYTES, f'Unexpected video length: {content_length}'
assert (head.headers.get('content-type') or '').startswith('video/mp4'), head.headers.get('content-type')

range_response = session.get(video_url, headers={'Range':'bytes=0-4095'}, timeout=60)
assert range_response.status_code == 206, f'Range request returned {range_response.status_code}'
assert range_response.headers.get('content-range') == f'bytes 0-4095/{EXPECTED_BYTES}', range_response.headers.get('content-range')
assert len(range_response.content) == 4096
assert b'ftyp' in range_response.content[:64]
assert b'moov' in range_response.content[:4096]

report = {
    'attempted': True,
    'url': origin,
    'release': EXPECTED_RELEASE,
    'filename': FILENAME,
    'http': {
        'headStatus': head.status_code,
        'contentType': head.headers.get('content-type'),
        'contentLength': content_length,
        'acceptRanges': head.headers.get('accept-ranges'),
        'rangeStatus': range_response.status_code,
        'contentRange': range_response.headers.get('content-range'),
        'fastStartAtomsInFirst4KB': {'ftyp': True, 'moov': True},
    },
    'environment': 'GitHub Actions Ubuntu; actual protected Vercel Preview in Chrome stable and Linux WebKit. This is not a physical iPhone, Android phone, LINE, or Instagram in-app browser.',
    'cases': [],
    'failures': [],
}

with sync_playwright() as p:
    engines = [
        ('chrome', lambda: p.chromium.launch(channel='chrome', headless=True)),
        ('webkit', lambda: p.webkit.launch(headless=True)),
    ]
    for engine, launch in engines:
        browser = launch()
        sizes = [(1440,900),(390,844)]
        for width, height in sizes:
            label = f'{engine}-{width}'
            row = {'engine':engine,'browserVersion':browser.version,'width':width,'height':height,'checks':{}}
            context = browser.new_context(
                viewport={'width':width,'height':height},
                device_scale_factor=2 if width<961 else 1,
                is_mobile=width<961,
                has_touch=width<961,
                reduced_motion='no-preference',
            )
            page = context.new_page()
            page.set_default_timeout(30000)
            errors=[]; bad=[]
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.on('response', lambda response: bad.append({'url':response.url,'status':response.status}) if response.status>=400 else None)
            try:
                page.goto(URL, wait_until='domcontentloaded', timeout=90000)
                page.wait_for_selector('[data-video-caption]')
                page.wait_for_function("document.documentElement.dataset.release === 'magicoffice-v4.3.5-full-video-filename-caption-2026-09-03'")
                page.wait_for_function("document.querySelector('video').readyState >= 1", timeout=90000)
                page.wait_for_timeout(800)
                state = page.evaluate("""(expected) => {
                    const video=document.querySelector('.mo-cinema video');
                    const caption=document.querySelector('[data-video-caption]');
                    const rect=caption.getBoundingClientRect();
                    return {
                        release:document.documentElement.dataset.release,
                        src:new URL(video.currentSrc || video.src,location.href).pathname,
                        sourceFilename:video.dataset.sourceFilename,
                        caption:caption.textContent,
                        duration:video.duration,
                        width:video.videoWidth,
                        height:video.videoHeight,
                        controls:video.controls,
                        captionBounds:{left:rect.left,right:rect.right,width:rect.width},
                        pageOverflow:document.documentElement.scrollWidth-innerWidth,
                        oldVideoPresent:document.documentElement.innerHTML.includes('home-trial-12s-with-audio.mp4'),
                        oldCaptionPresent:document.documentElement.innerHTML.includes('MagicOffice 世界觀試播'),
                    };
                }""", FILENAME)
                row['state']=state
                checks=row['checks']
                checks['release']=state['release']==EXPECTED_RELEASE
                checks['sourcePath']=state['src'].endswith('/assets/video/'+FILENAME)
                checks['sourceFilename']=state['sourceFilename']==FILENAME
                checks['captionExact']=state['caption']==FILENAME
                checks['metadata']=abs(state['duration']-EXPECTED_DURATION)<0.2 and state['width']==1280 and state['height']==720
                checks['nativeControls']=state['controls'] is True
                checks['captionInsideViewport']=state['captionBounds']['left']>=-0.5 and state['captionBounds']['right']<=width+0.5
                checks['noHorizontalOverflow']=state['pageOverflow']<=1
                checks['oldSourceRemoved']=not state['oldVideoPresent'] and not state['oldCaptionPresent']
                if engine=='chrome':
                    page.locator('[data-video-start]').click()
                    page.wait_for_function("(()=>{const v=document.querySelector('video');return !v.paused&&v.currentTime>.15})()",timeout=30000)
                    checks['playback']=True
                    page.locator('[data-video-sound]').click()
                    page.wait_for_function("!document.querySelector('video').muted",timeout=10000)
                    checks['soundOption']=not page.locator('video').evaluate('(v)=>v.muted')
                    page.locator('video').evaluate('(v)=>v.pause()')
                page.locator('.mo-cinema-wrap').screenshot(path=str(OUT/f'{label}-video-and-caption.png'))
                checks['noScriptErrors']=not errors
                checks['noHttpErrors']=not bad
            except Exception as error:
                row['exception']=str(error)
                report['failures'].append(label+': test exception')
            row['pageErrors']=errors
            row['badResponses']=bad
            report['failures'].extend(label+': '+name for name,ok in row['checks'].items() if not ok)
            report['cases'].append(row)
            context.close()
            (OUT/'browser-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
        browser.close()

print(json.dumps({'cases':len(report['cases']),'failures':report['failures'],'http':report['http']},ensure_ascii=False,indent=2))
if report['failures']:
    raise SystemExit(1)
