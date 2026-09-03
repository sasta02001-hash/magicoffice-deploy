import json,os,time
from pathlib import Path
from playwright.sync_api import sync_playwright
from offline_render import generate
html=generate()
out=Path(__file__).resolve().parent.parent/'verification';out.mkdir(exist_ok=True)
report={'attempted':True,'environment':'Offline inline-asset rendering in Linux Chromium (navigation restricted); original JS forced to published-snapshot/poster-only mode. No live-site, network, or native-device verification.','cases':[]}
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=os.environ.get('CHROME_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 for width,height in json.loads(os.environ.get("CASES","[[1440,900],[390,844],[320,568],[430,932],[768,1024],[1920,1080]]")):
  page=browser.new_page(viewport={'width':width,'height':height},device_scale_factor=1,has_touch=width<961)
  page.set_default_timeout(5000);page.emulate_media(reduced_motion='reduce')
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.set_content(html,wait_until='load',timeout=25000);page.wait_for_timeout(100)
  # Trigger all lazy-loaded images without changing the natural layout.
  page.evaluate('''async()=>{await Promise.all([...document.images].map(i=>{i.loading='eager';return i.decode().catch(()=>{});}));}''')
  page.screenshot(path=str(out/f'{width}-hero.png'))
  state=page.evaluate('''()=>({overflow:document.documentElement.scrollWidth-innerWidth,menuTabs:[...document.querySelectorAll('[data-menu-tab]')].map(x=>x.textContent),items:document.querySelectorAll('[data-menu-item-id]').length,filters:document.querySelectorAll('[data-menu-group-filter]').length,refresh:document.querySelectorAll('[data-schedule-refresh],[data-menu-refresh]').length,videoConsole:document.querySelectorAll('.mo-media-console').length,quick:[...document.querySelector('.mo-mobile-bar').children].map(x=>({text:x.textContent,visible:!!x.getClientRects().length,w:x.getBoundingClientRect().width})),broken:[...document.images].filter(x=>x.complete&&!x.naturalWidth).map(x=>x.src),titleRects:[...document.querySelectorAll('h1,h2,h3,h4')].filter(x=>x.getClientRects().length).map(x=>{let r=document.createRange();r.selectNodeContents(x);let b=r.getBoundingClientRect();return {text:x.textContent,left:b.left,right:b.right,parentWidth:x.clientWidth};}).filter(x=>x.left<-.5||x.right>innerWidth+.5),logoCenter:document.querySelector('.mo-hero-logo').getBoundingClientRect().x+document.querySelector('.mo-hero-logo').getBoundingClientRect().width/2,heroCenter:document.querySelector('h1').getBoundingClientRect().x+document.querySelector('h1').getBoundingClientRect().width/2})''')
  page.locator('[data-profile-id]').nth(6).click();page.wait_for_timeout(100)
  state['profile']=page.evaluate('''()=>({open:document.querySelector('#profile-dialog').open,cols:getComputedStyle(document.querySelector('.mo-profile-layout')).gridTemplateColumns,fields:[...document.querySelectorAll('.mo-profile-field dt')].map(x=>x.textContent),overflow:document.querySelector('#profile-dialog').scrollWidth-document.querySelector('#profile-dialog').clientWidth})''')
  page.screenshot(path=str(out/f'{width}-profile.png'))
  page.locator('#profile-dialog [data-dialog-close]').click()
  page.locator('[data-menu-tab="BAR"]').click();page.wait_for_timeout(80)
  state['night']=page.locator('[data-menu-world="BAR"]').is_visible()
  page.locator('#menu').scroll_into_view_if_needed();page.screenshot(path=str(out/f'{width}-night-menu.png'))
  page.locator('[data-menu-tab="CAFE"]').click();page.wait_for_timeout(80)
  state['day']=page.locator('[data-menu-world="CAFE"]').is_visible()
  page.locator('#menu').scroll_into_view_if_needed();page.screenshot(path=str(out/f'{width}-day-menu.png'))
  # Check headings again with night menu visible (including long multi-language dish headers).
  page.locator('[data-menu-tab="BAR"]').click()
  state['nightTitleOverflow']=page.evaluate('''()=>[...document.querySelectorAll('h1,h2,h3,h4')].filter(x=>x.getClientRects().length).map(x=>{let r=document.createRange();r.selectNodeContents(x);let b=r.getBoundingClientRect();return {text:x.textContent,left:b.left,right:b.right};}).filter(x=>x.left<-.5||x.right>innerWidth+.5)''')
  state['pageErrors']=errors
  report['cases'].append({'width':width,'height':height,**state});(out/f'report-{width}.json').write_text(json.dumps(report['cases'][-1],ensure_ascii=False,indent=2));page.close()
 browser.close()
(out/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
for r in report['cases']:print(r['width'],{k:r[k] for k in ['overflow','titleRects','nightTitleOverflow','items','refresh','filters','profile','pageErrors']})
