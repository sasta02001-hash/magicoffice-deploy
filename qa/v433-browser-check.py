import json, os, hashlib
from pathlib import Path
from urllib.parse import urlsplit
import requests
from playwright.sync_api import sync_playwright

URL=os.environ['CHECK_URL']
ORIGIN=f'{urlsplit(URL).scheme}://{urlsplit(URL).netloc}'
RELEASE='magicoffice-v4.3.3-responsive-feedback-2026-09-03'
OUT=Path('v433-browser-evidence');OUT.mkdir(exist_ok=True)
report={'attempted':True,'url':ORIGIN,'environment':'GitHub Actions Ubuntu. Real Chrome stable and Linux WebKit engine against the deployed site. Not physical Android, iPhone, macOS, LINE or Instagram.','cases':[],'failures':[]}
s=requests.Session();r=s.get(URL,timeout=50);r.raise_for_status()
assert RELEASE in r.text,'Expected deployment is not accessible'
report['http']={'status':r.status_code,'releaseHeader':r.headers.get('x-magicoffice-release'),'htmlSha256':hashlib.sha256(r.content).hexdigest()}
image_path='/assets/images/events/heartbeat/heartbeat-original-v7-228cfbf6.png'
img=s.get(ORIGIN+image_path,timeout=30);img.raise_for_status()
report['heartbeat']={'path':image_path,'sha256':hashlib.sha256(img.content).hexdigest(),'bytes':len(img.content)}
assert report['heartbeat']['sha256']=='228cfbf667e636dc95bb3b3195f8c9d43e168c573e6e10b463b306dfbfb1f6e3','Not the verified original campaign image'
cookies=[{'name':c.name,'value':c.value,'domain':c.domain,'path':c.path,'secure':c.secure} for c in s.cookies]
with sync_playwright() as p:
 for engine in ['chrome','webkit']:
  browser=p.chromium.launch(channel='chrome',headless=True) if engine=='chrome' else p.webkit.launch(headless=True)
  for width,height in ([(1440,900),(320,568),(390,844),(430,932)] if engine=='chrome' else [(1440,900),(390,844)]):
   label=f'{engine}-{width}';row={'engine':engine,'browserVersion':browser.version,'width':width,'height':height,'checks':{}}
   ctx=browser.new_context(viewport={'width':width,'height':height},device_scale_factor=2 if width<961 else 1,is_mobile=width<961,has_touch=width<961,reduced_motion='reduce')
   ctx.add_cookies(cookies);page=ctx.new_page();page.set_default_timeout(15000)
   errors=[];bad=[]
   page.on('pageerror',lambda e:errors.append(str(e)))
   page.on('response',lambda x:bad.append({'url':x.url,'status':x.status}) if x.status>=400 else None)
   try:
    page.goto(URL,wait_until='domcontentloaded',timeout=60000)
    page.wait_for_selector('[data-profile-id]');page.wait_for_selector('[data-menu-tab="BAR"]')
    page.wait_for_timeout(1500)
    page.evaluate('''async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>{i.loading='eager';return i.decode().catch(()=>{});}));}''')
    page.screenshot(path=str(OUT/f'{label}-hero.png'))
    st=page.evaluate('''()=>({release:document.documentElement.dataset.release,overflow:document.documentElement.scrollWidth-innerWidth,headings:[...document.querySelectorAll('h1,h2,h3,h4')].filter(x=>x.getClientRects().length).map(x=>{let r=document.createRange();r.selectNodeContents(x);let b=r.getBoundingClientRect();return {text:x.textContent,left:b.left,right:b.right};}).filter(x=>x.left<-.5||x.right>innerWidth+.5),refresh:document.querySelectorAll('[data-schedule-refresh],[data-menu-refresh]').length,extraPlayerBox:document.querySelectorAll('.mo-media-console').length,nativeControls:document.querySelector('video').controls,quick:[...document.querySelector('.mo-mobile-bar').children].map(x=>x.textContent.trim()),tabs:[...document.querySelectorAll('[data-menu-tab]')].map(x=>x.textContent.trim()),filters:document.querySelectorAll('[data-menu-group-filter]').length,itemIds:[...document.querySelectorAll('[data-menu-item-id]')].map(x=>x.dataset.menuItemId),broken:[...document.images].filter(x=>!x.naturalWidth).map(x=>x.currentSrc||x.src),logoCenter:(()=>{let r=document.querySelector('.mo-hero-logo').getBoundingClientRect();return r.left+r.width/2})(),titleCenter:(()=>{let r=document.querySelector('h1').getBoundingClientRect();return r.left+r.width/2})(),events:[...document.querySelectorAll('[data-event-grid] [data-event-id]')].filter(e=>!e.hidden).map(e=>e.dataset.eventId)})''')
    row['state']=st;checks=row['checks']
    checks['release']=st['release']==RELEASE
    checks['layout']=st['overflow']<=1 and not st['headings']
    checks['refreshRemoved']=st['refresh']==0
    checks['oneVideoBox']=st['extraPlayerBox']==0 and st['nativeControls']
    checks['sixShortcuts']=st['quick']==['姶仕名錄','本週出勤','線上購拍','活動快報','服務價目','立即訂位']
    checks['periodMenus']=st['tabs']==['午後咖啡','魔幻夜晚'] and st['filters']==0 and len(st['itemIds'])==88 and len(set(st['itemIds']))==88
    checks['images']=not st['broken']
    checks['onlyCurrentEvents']=set(st['events'])=={'heartbeat-support','mid-autumn','yuzu-birthday'}
    checks['mobileBrandCentered']=width>=961 or (abs(st['logoCenter']-width/2)<1 and abs(st['titleCenter']-width/2)<1)
    try:
     if page.locator('[data-video-start]').is_visible():page.locator('[data-video-start]').click()
     page.wait_for_function("(()=>{let v=document.querySelector('video');return !v.paused&&v.currentTime>.15})()",timeout=15000)
     checks['videoPlayback']=True
     if page.locator('video').evaluate('(v)=>v.muted'):
      page.locator('[data-video-sound]').click();page.wait_for_function('!document.querySelector("video").muted')
     checks['videoUnmute']=not page.locator('video').evaluate('(v)=>v.muted')
     page.locator('[data-video-sound]').click();page.wait_for_function('document.querySelector("video").muted')
     checks['videoMute']=page.locator('video').evaluate('(v)=>v.muted')
     page.locator('video').evaluate('(v)=>v.pause()')
    except Exception as exc:
     row['videoException']=str(exc)
     row['videoDetail']=page.locator('video').evaluate('(v)=>({canPlay:v.canPlayType("video/mp4"),ready:v.readyState,error:v.error?{code:v.error.code,message:v.error.message}:null})')
     checks['videoPlayback']=False
    profile_details=[]
    for index in range(16):
     card=page.locator('[data-profile-id]').nth(index);pid=card.get_attribute('data-profile-id');card.click()
     page.wait_for_function('document.querySelector("#profile-dialog").open')
     page.locator('.mo-profile-portrait img').evaluate('(i)=>i.decode()')
     x=page.evaluate('''()=>({fields:[...document.querySelectorAll('.mo-profile-field dt')].map(x=>x.textContent),grid:getComputedStyle(document.querySelector('.mo-profile-layout')).display,overflow:document.querySelector('#profile-dialog').scrollWidth-document.querySelector('#profile-dialog').clientWidth,photo:document.querySelector('.mo-profile-portrait img').naturalWidth})''')
     x['id']=pid;profile_details.append(x)
     if index==0:page.screenshot(path=str(OUT/f'{label}-profile.png'))
     page.locator('#profile-dialog [data-dialog-close]').first.click()
     page.wait_for_function('!document.querySelector("#profile-dialog").open && !document.documentElement.classList.contains("mo-dialog-open")')
    row['profiles']=profile_details
    checks['allProfilesFormatted']=all(x['grid']=='grid' and x['overflow']<=1 and len(x['fields'])>=3 and x['photo']>=600 for x in profile_details)
    checks['dialogScrollRestored']=not page.evaluate('document.documentElement.classList.contains("mo-dialog-open")')
    for period in ['BAR','CAFE']:
     page.locator(f'[data-menu-tab="{period}"]').click()
     checks['menu'+period]=page.locator(f'[data-menu-world="{period}"]').is_visible()
     page.locator('#menu').scroll_into_view_if_needed();page.screenshot(path=str(OUT/f'{label}-menu-{period}.png'))
    page.locator('#heartbeat').scroll_into_view_if_needed();page.screenshot(path=str(OUT/f'{label}-heartbeat.png'))
    if width<961:
     page.evaluate('window.scrollTo(0,0)');page.wait_for_timeout(400)
     page.locator('.mo-mobile-bar [data-open-purchase]').click()
     checks['purchaseShortcut']=page.locator('#purchase-dialog').evaluate('(d)=>d.open')
     page.locator('#purchase-dialog [data-dialog-close]').first.click()
     page.wait_for_function('!document.querySelector("#purchase-dialog").open && !document.documentElement.classList.contains("mo-dialog-open")')
    checks['noScriptErrors']=not errors
    checks['noHttpErrors']=not bad
   except Exception as exc:
    row['exception']=str(exc);report['failures'].append(label+': test exception')
   row['pageErrors']=errors;row['badResponses']=bad
   report['failures'].extend(label+': '+name for name,ok in row['checks'].items() if not ok)
   report['cases'].append(row);ctx.close()
   (OUT/'browser-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
  browser.close()
print(json.dumps({'attempted':True,'cases':len(report['cases']),'failures':report['failures'],'heartbeat':report['heartbeat']},ensure_ascii=False,indent=2))
if report['failures']:raise SystemExit(1)
