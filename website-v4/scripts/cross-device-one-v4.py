import asyncio, importlib.util, json, os, sys
from pathlib import Path
from playwright.async_api import async_playwright

ROOT=Path(__file__).resolve().parents[1]
MODPATH=ROOT/'scripts/cross-device-test-v4.py'
specmod=importlib.util.spec_from_file_location('v4test',MODPATH)
mod=importlib.util.module_from_spec(specmod); specmod.loader.exec_module(mod)
name=os.environ.get('V4_CASE')
case=next((x for x in mod.CASES if x['name']==name),None)
if not case: raise SystemExit(f'Unknown V4_CASE {name!r}')
OUT=ROOT/'verification/v4-cross-device/cases'; OUT.mkdir(parents=True,exist_ok=True)

async def run():
    async with async_playwright() as p:
        browser=await p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--autoplay-policy=no-user-gesture-required','--disable-dev-shm-usage','--disable-gpu'])
        context=await browser.new_context(viewport={'width':case['width'],'height':case['height']},is_mobile=case.get('mobile',False),has_touch=case.get('touch',False),device_scale_factor=case.get('dpr',1),user_agent=case.get('ua') or None,locale='zh-TW',timezone_id='Asia/Taipei',color_scheme='light')
        page=await context.new_page()
        logs={'pageErrors':[],'consoleErrors':[],'badResponses':[],'failedRequests':[]}
        page.on('pageerror',lambda e:logs['pageErrors'].append(str(e)))
        page.on('console',lambda m:logs['consoleErrors'].append(m.text) if m.type=='error' else None)
        page.on('response',lambda r:logs['badResponses'].append({'status':r.status,'url':r.url}) if r.status>=400 else None)
        page.on('requestfailed',lambda r:logs['failedRequests'].append({'url':r.url,'failure':str(r.failure)}))
        try:
            await mod.install(page,case.get('fallback',False))
            if case.get('css_zoom'):
                await page.evaluate('z=>document.documentElement.style.zoom=String(z)',case['css_zoom']); await page.wait_for_timeout(80)
            layout=await mod.layout_snapshot(page)
            media=await mod.check_media(page,case.get('fallback',False)) if case.get('media') or case.get('fallback') else None
            menu=await mod.check_menu(page)
            interactions={} if case.get('fallback') else await mod.check_interactions(page,case.get('mobile',False))
            images=await mod.exhaustive_images(page) if case.get('exhaustive') else None
            data={'spec':case,'layout':layout,'menu':menu,'interactions':interactions,'media':media,'images':images,**logs}
            failures=mod.validate(name,data)
            payload={'name':name,'data':data,'failures':failures}
        except Exception as exc:
            payload={'name':name,'data':{'spec':case,'exception':repr(exc),**logs},'failures':[f'{name}: exception {exc!r}']}
        (OUT/f'{name}.json').write_text(json.dumps(payload,ensure_ascii=False,indent=2),encoding='utf-8')
        print(json.dumps({'name':name,'failures':payload['failures']},ensure_ascii=False),flush=True)
        try:
            await asyncio.wait_for(browser.close(), timeout=5)
        except Exception:
            pass
        return 1 if payload['failures'] else 0

code=asyncio.run(run())
sys.stdout.flush(); sys.stderr.flush(); os._exit(code)
