import asyncio
import json
import mimetypes
import re
import time
from pathlib import Path
from urllib.parse import urlparse, unquote
from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeoutError

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / 'dist'
OUT = ROOT / 'verification' / 'v4-cross-device'
OUT.mkdir(parents=True, exist_ok=True)
HTML = (DIST / 'index.html').read_text(encoding='utf-8')
BASE = 'https://mo.local/'

MIME = {
    '.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8',
    '.json':'application/json; charset=utf-8','.svg':'image/svg+xml; charset=utf-8','.webp':'image/webp',
    '.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.mp4':'video/mp4','.webmanifest':'application/manifest+json',
    '.xml':'application/xml; charset=utf-8','.txt':'text/plain; charset=utf-8'
}

CASES = [
    dict(name='chromium-desktop-1440x900', width=1440, height=900, mobile=False, touch=False, dpr=1, exhaustive=True, media=True, shots=False),
    dict(name='chromium-desktop-1366x768', width=1366, height=768, mobile=False, touch=False, dpr=1, media=False, shots=False),
    dict(name='chromium-desktop-1920x1080', width=1920, height=1080, mobile=False, touch=False, dpr=1, media=False, shots=False),
    dict(name='chromium-desktop-csszoom125', width=1440, height=900, mobile=False, touch=False, dpr=1, media=False, css_zoom=1.25, shots=False),
    dict(name='chromium-iphone-like-390x844', width=390, height=844, mobile=True, touch=True, dpr=1, media=True, shots=False,
         ua='Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1'),
    dict(name='chromium-iphone-small-320x568', width=320, height=568, mobile=True, touch=True, dpr=1, media=False, shots=False,
         ua='Mozilla/5.0 (iPhone; CPU iPhone OS 16_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1'),
    dict(name='chromium-android-360x800', width=360, height=800, mobile=True, touch=True, dpr=1, media=True, shots=False,
         ua='Mozilla/5.0 (Linux; Android 15; Pixel 8 Build/AP3A.241105.008) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Mobile Safari/537.36'),
    dict(name='chromium-android-large-430x932', width=430, height=932, mobile=True, touch=True, dpr=1, media=False, shots=False,
         ua='Mozilla/5.0 (Linux; Android 15; SM-S9280) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Mobile Safari/537.36'),
    dict(name='chromium-tablet-768x1024', width=768, height=1024, mobile=True, touch=True, dpr=1, media=False, shots=False,
         ua='Mozilla/5.0 (iPad; CPU OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1'),
    dict(name='chromium-mobile-landscape-844x390', width=844, height=390, mobile=True, touch=True, dpr=1, media=False, shots=False,
         ua='Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Mobile Safari/537.36'),
    dict(name='chromium-poster-fallback-390x844', width=390, height=844, mobile=True, touch=True, dpr=1, media=False, fallback=True, shots=False,
         ua='Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1'),
]

async def route_asset(route):
    req = route.request
    parsed = urlparse(req.url)
    rel = unquote(parsed.path).lstrip('/') or 'index.html'
    if parsed.path == '/api/schedule':
        payload = json.loads((DIST/'content/schedule-fallback.json').read_text())
        payload.update({'source':'Cross-device test fixture','stale':False})
        await route.fulfill(status=200, content_type='application/json', body=json.dumps(payload, ensure_ascii=False))
        return
    if parsed.path == '/api/menu':
        payload = json.loads((DIST/'content/menu-fallback.json').read_text())
        payload.update({'source':'Cross-device test fixture','stale':False})
        await route.fulfill(status=200, content_type='application/json', body=json.dumps(payload, ensure_ascii=False))
        return
    file = (DIST/rel).resolve()
    if not str(file).startswith(str(DIST.resolve())) or not file.exists() or file.is_dir():
        await route.fulfill(status=404, content_type='text/plain', body='Not found')
        return
    data = file.read_bytes()
    ctype = MIME.get(file.suffix.lower(), mimetypes.guess_type(file.name)[0] or 'application/octet-stream')
    rh = req.headers.get('range')
    if file.suffix.lower() == '.mp4' and rh:
        m = re.match(r'bytes=(\d*)-(\d*)', rh)
        if not m:
            await route.fulfill(status=416, headers={'Content-Range':f'bytes */{len(data)}'}, body=b'')
            return
        start = int(m.group(1) or 0)
        end = min(int(m.group(2) or len(data)-1), len(data)-1)
        if start > end or start >= len(data):
            await route.fulfill(status=416, headers={'Content-Range':f'bytes */{len(data)}'}, body=b'')
            return
        await route.fulfill(status=206, headers={
            'Content-Type':ctype,'Accept-Ranges':'bytes','Content-Range':f'bytes {start}-{end}/{len(data)}',
            'Content-Length':str(end-start+1),'Cache-Control':'public, max-age=31536000, immutable'
        }, body=data[start:end+1])
        return
    await route.fulfill(status=200, headers={
        'Content-Type':ctype,'Content-Length':str(len(data)),
        'Accept-Ranges':'bytes' if file.suffix.lower()=='.mp4' else 'none',
        'Cache-Control':'public, max-age=60'
    }, body=data)

async def install(page, fallback=False):
    html = HTML.replace('<head>', '<head><base href="https://mo.local/">', 1)
    if fallback:
        html = html.replace('<html ', '<html data-poster-only="true" ', 1)
    await page.route('https://mo.local/**', route_asset)
    await page.set_content(html, wait_until='domcontentloaded', timeout=120000)
    await page.wait_for_selector('[data-menu-tab="CAFE"]', state='attached', timeout=30000)
    await page.wait_for_selector('.mo-cinema video', state='attached', timeout=30000)
    await page.wait_for_timeout(900)

async def layout_snapshot(page):
    return await page.evaluate("""() => {
      const $ = s => document.querySelector(s);
      const rect = s => { const e=$(s); if(!e)return null; const r=e.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}; };
      const visible = e => { const s=getComputedStyle(e); const r=e.getBoundingClientRect(); return s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity)>0&&r.width>0&&r.height>0; };
      const title=$('.mo-title-lock'), tr=title?.getBoundingClientRect(), tp=title?.parentElement?.getBoundingClientRect();
      const header=$('.mo-header')||$('.site-header');
      const hero=$('.mo-hero');
      const taps=[...document.querySelectorAll('.mo-hero-actions a,.mo-menu-toggle,.mo-media-button,.mo-cinema-start button,.mo-mobile-bar a')].filter(visible).map(e=>{const r=e.getBoundingClientRect();return {label:(e.textContent||e.getAttribute('aria-label')||'').trim().replace(/\s+/g,' ').slice(0,45),w:r.width,h:r.height};});
      const tabbar=$('.mo-menu-tabs');
      return {
        viewport:{w:innerWidth,h:innerHeight,dpr:devicePixelRatio},
        overflowX:document.documentElement.scrollWidth-document.documentElement.clientWidth,
        bodyOverflowX:document.body.scrollWidth-document.body.clientWidth,
        title:{text:title?.textContent.trim(),width:tr?.width,parentWidth:tp?.width,scrollWidth:title?.scrollWidth,whiteSpace:title?getComputedStyle(title).whiteSpace:null,font:title?getComputedStyle(title).fontFamily:null},
        header:rect('.mo-header'), hero:rect('.mo-hero'), heroCopy:rect('.mo-hero-copy'), cinema:rect('.mo-cinema'),
        menuTabs:{count:document.querySelectorAll('[data-menu-tab]').length,width:tabbar?.clientWidth,scrollWidth:tabbar?.scrollWidth},
        heroVisual:{
          copyBorder:getComputedStyle($('.mo-hero-copy')).borderStyle,
          copyBackground:getComputedStyle($('.mo-hero-copy')).backgroundImage,
          copyBackgroundColor:getComputedStyle($('.mo-hero-copy')).backgroundColor,
          logoBorder:getComputedStyle($('.mo-hero-logo')).borderStyle,
          logoBackground:getComputedStyle($('.mo-hero-logo')).backgroundImage,
          logoBackgroundColor:getComputedStyle($('.mo-hero-logo')).backgroundColor
        },
        counts:{roster:document.querySelectorAll('.mo-cast-card').length,schedule:document.querySelectorAll('.mo-day-card').length,eventCards:document.querySelectorAll('.mo-event-card').length,eventDetails:document.querySelectorAll('[data-event-detail]').length,accordions:document.querySelectorAll('[data-event-detail] .mo-accordion').length,menuItems:document.querySelectorAll('[data-menu-item-id]').length,mobileLinks:document.querySelectorAll('.mo-mobile-bar a').length,menuWorldHeaders:document.querySelectorAll('.mo-menu-world-header').length,menuCategoryButtons:document.querySelectorAll('[data-menu-group-filter]').length},
        mobileBar: (()=>{const e=$('.mo-mobile-bar'); if(!e)return null; const s=getComputedStyle(e),r=e.getBoundingClientRect();return {display:s.display,position:s.position,bottom:s.bottom,paddingBottom:s.paddingBottom,height:r.height,visible:visible(e)}})(),
        taps,
        meta:{release:$('meta[name="x-magicoffice-release"]')?.content||$('meta[name="site-version"]')?.content||'',theme:$('meta[name="theme-color"]')?.content||''}
      };
    }""")

async def check_menu(page):
    states=[]
    for code in ['CAFE','BAR','COLLECTION']:
        await page.locator(f'[data-menu-tab="{code}"]').evaluate('e=>e.click()')
        pane_locator = page.locator(f'[data-menu-world="{code}"]')
        await pane_locator.scroll_into_view_if_needed()
        await page.wait_for_function(
            """code => {
              const image=document.querySelector(`[data-menu-world="${code}"] .mo-menu-world-photo img`);
              return image && image.complete && image.naturalWidth > 0;
            }""",
            arg=code,
            timeout=10000,
        )
        await page.wait_for_timeout(60)
        state = await page.evaluate("""code => {
          const panes=[...document.querySelectorAll('[data-menu-world]')];
          const active=panes.filter(p=>!p.hidden&&getComputedStyle(p).display!=='none').map(p=>p.dataset.menuWorld);
          const pane=document.querySelector(`[data-menu-world="${code}"]`), tab=document.querySelector(`[data-menu-tab="${code}"]`);
          const scene=pane?.querySelector('.mo-menu-world-photo img');
          const categoryButtons=[...pane?.querySelectorAll('[data-menu-group-filter]')||[]];
          return {code,active,selected:tab?.getAttribute('aria-selected'),hidden:pane?.hidden,theme:pane?getComputedStyle(pane,'::before').backgroundImage:null,scene:{src:scene?.currentSrc||scene?.src,w:scene?.naturalWidth,h:scene?.naturalHeight},categoryButtonCount:categoryButtons.length,headerExists:Boolean(pane?.querySelector('.mo-menu-world-header'))};
        }""", code)
        # Verify the first non-"all" category filter actually narrows the visible groups.
        filter_state = await page.evaluate("""code => {
          const pane=document.querySelector(`[data-menu-world="${code}"]`);
          const button=pane?.querySelector('[data-menu-group-filter]:not([data-menu-group-filter="all"])');
          if(!button)return {available:false};
          button.click();
          const groups=[...pane.querySelectorAll('[data-menu-group-id]')];
          const visible=groups.filter(group=>!group.hidden).map(group=>group.dataset.menuGroupId);
          return {available:true,pressed:button.getAttribute('aria-pressed'),filter:button.dataset.menuGroupFilter,visible};
        }""", code)
        state['categoryFilter']=filter_state
        # Restore "all" so subsequent screenshots and tests see the complete menu.
        await page.evaluate("""code => document.querySelector(`[data-menu-world="${code}"] [data-menu-group-filter="all"]`)?.click()""", code)
        states.append(state)
    return states

async def check_interactions(page, mobile):
    result={}
    if mobile:
        toggle=page.locator('.mo-menu-toggle')
        await toggle.evaluate('e=>e.click()'); await page.wait_for_timeout(40)
        result['mobileNavOpen']=await page.locator('.mo-nav').evaluate("e=>e.classList.contains('is-open')")
        result['mobileToggleExpanded']=await toggle.get_attribute('aria-expanded')
        await toggle.evaluate('e=>e.click()'); await page.wait_for_timeout(40)
    first=page.locator('.mo-cast-card').first
    await first.evaluate('e=>e.click()'); await page.wait_for_timeout(50)
    result['profileDialogOpen']=await page.locator('#profile-dialog').evaluate("d=>d.open")
    await page.locator('#profile-dialog [data-dialog-close]').evaluate('e=>e.click()'); await page.wait_for_timeout(35)
    result['profileDialogClosed']=not await page.locator('#profile-dialog').evaluate("d=>d.open")
    accordion=page.locator('[data-event-detail] .mo-accordion').first
    if not await accordion.evaluate('e=>e.open'):
        await accordion.locator('summary').evaluate('e=>e.click()'); await page.wait_for_timeout(35)
    result['accordionOpen']=await accordion.evaluate("e=>e.open")
    return result

async def check_media(page, fallback=False):
    if fallback:
        await page.wait_for_timeout(400)
        return await page.evaluate("""() => {const c=document.querySelector('.mo-cinema'),v=c.querySelector('video'),p=c.querySelector('.mo-poster'),s=c.querySelector('.mo-cinema-start');return {state:c.dataset.state,paused:v.paused,readyState:v.readyState,posterOpacity:getComputedStyle(p).opacity,posterVisibility:getComputedStyle(p).visibility,startVisibility:getComputedStyle(s).visibility};}""")
    playing = await page.locator('.mo-cinema video').evaluate('v=>!v.paused&&v.readyState>=2&&v.currentTime>.05')
    if not playing:
        start = page.locator('[data-video-start]')
        if await start.is_visible():
            await start.click()
        else:
            await page.click('[data-video-toggle]')
    await page.wait_for_function("""() => {const v=document.querySelector('.mo-cinema video'); return v&&!v.paused&&v.readyState>=2&&v.currentTime>.2;}""", timeout=30000)
    t1=await page.locator('.mo-cinema video').evaluate('v=>v.currentTime')
    await page.wait_for_timeout(500)
    t2=await page.locator('.mo-cinema video').evaluate('v=>v.currentTime')
    muted=await page.locator('.mo-cinema video').evaluate('v=>v.muted')
    if muted:
        await page.click('[data-video-sound]'); await page.wait_for_timeout(180)
    audible=await page.locator('.mo-cinema video').evaluate('v=>({muted:v.muted,volume:v.volume,paused:v.paused,currentTime:v.currentTime,readyState:v.readyState,duration:v.duration})')
    await page.click('[data-video-toggle]'); await page.wait_for_timeout(100)
    paused=await page.locator('.mo-cinema video').evaluate('v=>v.paused')
    await page.click('[data-video-toggle]'); await page.wait_for_timeout(150)
    resumed=await page.locator('.mo-cinema video').evaluate('v=>!v.paused')
    return {'t1':t1,'t2':t2,'advanced':t2>t1+.35,'audible':audible,'pauseWorked':paused,'resumeWorked':resumed,'state':await page.locator('.mo-cinema').get_attribute('data-state')}

async def exhaustive_images(page):
    await page.evaluate("""async()=>{
      document.querySelectorAll('img').forEach(i=>i.loading='eager');
      const sections=[...document.querySelectorAll('main section')];
      for(const section of sections){section.scrollIntoView({block:'center'}); await new Promise(r=>setTimeout(r,35));}
      scrollTo(0,0);
    }""")
    await page.wait_for_timeout(800)
    return await page.evaluate("""() => ({
      total:document.images.length,
      broken:[...document.images].filter(i=>i.complete&&i.naturalWidth===0).map(i=>({alt:i.alt,src:(i.currentSrc||i.src).slice(0,180)})),
      eventCardSources:[...document.querySelectorAll('.mo-event-card img')].map(i=>i.currentSrc||i.src),
      eventPosterSources:[...document.querySelectorAll('.mo-event-poster img')].map(i=>i.currentSrc||i.src),
      yuzuImages:document.querySelectorAll('[data-event-id="yuzu-birthday"] img').length,
      jubiImages:document.querySelectorAll('[data-event-id="jubi-birthday"] img').length
    })""")

async def take_shots(page, name):
    targets=[('hero','.mo-hero'),('events','#events'),('menu','#menu')]
    for suffix,selector in targets:
        await page.evaluate("window.scrollTo(0,0)")
        await page.locator(selector).scroll_into_view_if_needed(); await page.wait_for_timeout(170)
        await page.screenshot(path=str(OUT/f'{name}-{suffix}.png'), full_page=False)

async def run_case(browser, spec):
    context=await browser.new_context(
        viewport={'width':spec['width'],'height':spec['height']},
        is_mobile=spec.get('mobile',False), has_touch=spec.get('touch',False),
        device_scale_factor=spec.get('dpr',1), user_agent=spec.get('ua') or None,
        locale='zh-TW', timezone_id='Asia/Taipei', color_scheme='light'
    )
    page=await context.new_page()
    logs={'pageErrors':[],'consoleErrors':[],'badResponses':[],'failedRequests':[]}
    page.on('pageerror',lambda e:logs['pageErrors'].append(str(e)))
    page.on('console',lambda m:logs['consoleErrors'].append(m.text) if m.type=='error' else None)
    page.on('response',lambda r:logs['badResponses'].append({'status':r.status,'url':r.url}) if r.status>=400 else None)
    page.on('requestfailed',lambda r:logs['failedRequests'].append({'url':r.url,'failure':str(r.failure)}))
    try:
        t0=time.monotonic(); await install(page, spec.get('fallback',False)); print(spec['name'],'install',round(time.monotonic()-t0,2),flush=True)
        if spec.get('css_zoom'):
            await page.evaluate("z=>document.documentElement.style.zoom=String(z)", spec['css_zoom'])
            await page.wait_for_timeout(80)
        t=time.monotonic(); layout=await layout_snapshot(page); print(spec['name'],'layout',round(time.monotonic()-t,2),flush=True)
        t=time.monotonic(); media=await check_media(page,spec.get('fallback',False)) if spec.get('media') or spec.get('fallback') else None; print(spec['name'],'media',round(time.monotonic()-t,2),flush=True)
        t=time.monotonic(); menu=await check_menu(page); print(spec['name'],'menu',round(time.monotonic()-t,2),flush=True)
        t=time.monotonic(); interactions={} if spec.get('fallback') else await check_interactions(page, spec.get('mobile',False)); print(spec['name'],'interactions',round(time.monotonic()-t,2),flush=True)
        t=time.monotonic(); images=await exhaustive_images(page) if spec.get('exhaustive') else None; print(spec['name'],'images',round(time.monotonic()-t,2),flush=True)
        if spec.get('shots'):
            t=time.monotonic(); await take_shots(page,spec['name']); print(spec['name'],'shots',round(time.monotonic()-t,2),flush=True)
        print(spec['name'],'total',round(time.monotonic()-t0,2),flush=True)
        return {'spec':spec,'layout':layout,'menu':menu,'interactions':interactions,'media':media,'images':images,**logs}
    finally:
        try:
            await asyncio.wait_for(context.close(), timeout=5)
        except Exception:
            pass


def validate(name, data):
    failures=[]
    l=data['layout']; c=l['counts']; spec=data['spec']
    def req(cond,msg):
        if not cond: failures.append(f'{name}: {msg}')
    req(abs(l['overflowX'])<=2 and abs(l['bodyOverflowX'])<=2,f'horizontal overflow html/body {l["overflowX"]}/{l["bodyOverflowX"]}')
    req(l['title']['text']=='魔幻姶仕社','hero title text mismatch')
    req(l['title']['whiteSpace']=='nowrap' or spec['width']<=330,f'title whitespace {l["title"]["whiteSpace"]}')
    req((l['title']['width'] or 0) <= (l['title']['parentWidth'] or 0)+1.5,f'title overflow {l["title"]}')
    req('serif' in (l['title']['font'] or '').lower() or 'mingliu' in (l['title']['font'] or '').lower(),f'hero title not serif-family: {l["title"]["font"]}')
    req(c['roster']==16,f'roster count {c["roster"]}')
    req(c['schedule']==7,f'schedule day count {c["schedule"]}')
    req(c['eventCards']==5 and c['eventDetails']==5,f'event count cards/details {c["eventCards"]}/{c["eventDetails"]}')
    req(c['accordions']>=13,f'event accordion count {c["accordions"]}')
    req(c['menuItems']>=88,f'menu item count {c["menuItems"]}')
    req(c['mobileLinks']==4,f'mobile link count {c["mobileLinks"]}')
    req(c.get('menuWorldHeaders')==3,f'menu world header count {c.get("menuWorldHeaders")}')
    req(c.get('menuCategoryButtons',0)>=6,f'menu category buttons missing {c.get("menuCategoryButtons")}')
    hv=l.get('heroVisual') or {}
    req(hv.get('copyBorder')=='none',f'hero copy still has border {hv}')
    req(hv.get('logoBorder')=='none',f'hero logo still has border {hv}')
    req((hv.get('copyBackground') in ('none','')) and hv.get('copyBackgroundColor') in ('rgba(0, 0, 0, 0)','transparent'),f'hero copy still has boxed background {hv}')
    req((hv.get('logoBackground') in ('none','')) and hv.get('logoBackgroundColor') in ('rgba(0, 0, 0, 0)','transparent'),f'hero logo still has framed background {hv}')
    req(l['menuTabs']['count']==3,f'menu tab count {l["menuTabs"]["count"]}')
    if spec['width']<=680: req((l['menuTabs']['scrollWidth'] or 0) <= (l['menuTabs']['width'] or 0)+2,f'mobile menu tabs clipped {l["menuTabs"]}')
    if not spec.get('fallback'):
        if spec.get('mobile'):
            req(data['interactions'].get('mobileNavOpen') and data['interactions'].get('mobileToggleExpanded')=='true','mobile nav toggle failed')
        req(data['interactions'].get('profileDialogOpen') and data['interactions'].get('profileDialogClosed'),'profile dialog failed')
        req(data['interactions'].get('accordionOpen'),'event accordion failed')
    req(all(s['selected']=='true' and s['active']==[s['code']] and not s['hidden'] for s in data['menu']),f'menu switching failed {data["menu"]}')
    req(len({s['theme'] for s in data['menu']})==3,'menu visual themes not distinct')
    req(all(bool(s['scene']['src']) and s['scene']['w']>0 and s['scene']['h']>0 for s in data['menu']),'menu scene source missing or broken')
    req(all(s.get('headerExists') and s.get('categoryButtonCount',0)>=2 for s in data['menu']),f'menu editorial header/category rail missing {data["menu"]}')
    req(all((not s.get('categoryFilter',{}).get('available')) or (s['categoryFilter'].get('pressed')=='true' and s['categoryFilter'].get('visible')==[s['categoryFilter'].get('filter')]) for s in data['menu']),f'menu category filtering failed {data["menu"]}')
    if spec.get('media'):
        m=data['media']; req(m and m['advanced'],'video time did not advance'); req(m and not m['audible']['muted'] and m['audible']['volume']>0,'sound could not be enabled'); req(m and m['pauseWorked'] and m['resumeWorked'],'pause/resume failed')
    if spec.get('fallback'):
        m=data['media']; req(m and m['paused'] and m['state']=='idle' and m['posterVisibility']=='visible' and float(m['posterOpacity'])>.95,'poster fallback failed')
    if data.get('images'):
        im=data['images']; req(not im['broken'],f'broken images {im["broken"]}'); req(len(set(im['eventCardSources']))==5,'event cards not distinct'); req(len(set(im['eventPosterSources']))==5,'event posters not distinct'); req(im['yuzuImages']>=11 and im['jubiImages']>=4,f'activity imagery incomplete {im}')
    req(not data['pageErrors'],f'page errors {data["pageErrors"]}')
    req(not data['consoleErrors'],f'console errors {data["consoleErrors"]}')
    req(not data['badResponses'],f'bad responses {data["badResponses"]}')
    req(not data['failedRequests'],f'failed requests {data["failedRequests"]}')
    # Minimum target size: navigation links can be long, but interactive controls must be usable.
    small=[t for t in l['taps'] if (t['w']<43 or t['h']<43) and t['label'] not in ('音量','')]
    req(not small,f'undersized visible controls {small[:6]}')
    return failures

async def main():
    report={
        'attempted':True,
        'engine':'Chromium 143 system build via Playwright',
        'method':'set_content with all site/API requests routed to the built dist; MP4 byte-range support enabled',
        'physicalDeviceTesting':False,
        'limitations':['No physical iPhone/iPad or Android hardware in this environment','No Safari/WebKit or Samsung Internet executable available; iOS/Android cases use mobile UA, touch and DPR emulation on Chromium','LINE/Instagram/Facebook in-app browsers require later physical-device acceptance'],
        'cases':{},'failures':[]
    }
    async with async_playwright() as p:
        browser=await p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--autoplay-policy=no-user-gesture-required','--disable-dev-shm-usage','--disable-gpu'])
        for spec in CASES:
            name=spec['name']
            try:
                data=await asyncio.wait_for(run_case(browser,spec),timeout=40)
                report['cases'][name]=data
                report['failures'].extend(validate(name,data))
                print(f'OK {name}',flush=True)
            except Exception as exc:
                report['cases'][name]={'spec':spec,'exception':repr(exc)}
                report['failures'].append(f'{name}: exception {exc!r}')
                print(f'FAIL {name}: {exc!r}',flush=True)
        try:
            await asyncio.wait_for(browser.close(), timeout=5)
        except Exception:
            pass
    report['summary']={'caseCount':len(CASES),'passedCases':sum(1 for n in report['cases'] if not any(f.startswith(n+':') for f in report['failures'])),'failureCount':len(report['failures'])}
    (OUT/'cross-device-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(report['summary'],ensure_ascii=False),flush=True)
    if report['failures']:
        print('\n'.join(report['failures']),flush=True)
        raise SystemExit(1)

if __name__=='__main__':
    asyncio.run(main())
