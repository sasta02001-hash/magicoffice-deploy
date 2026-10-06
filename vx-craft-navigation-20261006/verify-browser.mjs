import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const ROOT=path.dirname(fileURLToPath(import.meta.url));
const {chromium}=createRequire(import.meta.url)(path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'));
const spec=JSON.parse(await fs.readFile(path.join(ROOT,'classification.json'),'utf8'));
const origin=process.argv[2]||'http://127.0.0.1:4173';
const browser=await chromium.launch({headless:true,executablePath:process.env.VX_BROWSER_EXECUTABLE||undefined,args:['--no-sandbox']});
const result={origin,checkedAt:new Date().toISOString(),filters:[],viewports:[],errors:[],failedRequests:[]};
try{
 const page=await browser.newPage({viewport:{width:1440,height:1350},deviceScaleFactor:1,reducedMotion:'reduce'});
 page.on('pageerror',e=>result.errors.push(e.message));
 page.on('response',r=>{if(r.status()>=400&&r.url().startsWith(origin))result.failedRequests.push({url:r.url(),status:r.status()});});
 const nav=page.locator('.vx-craft-nav');
 const button=id=>page.locator('[data-vx-craft="'+id+'"]');
 const ids=()=>page.locator('[data-vx-work-grid] [data-vx-work]').evaluateAll(links=>links.map(l=>l.dataset.vxWork));
 await page.goto(origin+'/works/',{waitUntil:'networkidle',timeout:90000});await nav.waitFor({state:'visible'});
 assert.equal(await page.locator('#vx-works-heading').innerText(),'作品典藏');
 assert.equal(await page.locator('.vx-works select').count(),0);assert.equal(await nav.locator('button').count(),9);
 for(const category of spec.categories){
  await button(category.id).click();
  const expected=spec.works.filter(w=>w.category===category.id);
  assert.deepEqual(await ids(),expected.map(w=>w.id));assert.equal(await button(category.id).getAttribute('aria-pressed'),'true');
  assert.equal(await nav.locator('[aria-pressed="true"]').count(),1);
  assert.equal(await page.locator('[data-vx-craft-title]').innerText(),category.name);
  assert.equal(await page.locator('[data-vx-craft-count-number]').innerText(),String(expected.length).padStart(2,'0'));
  if(!expected.length)assert.equal(await page.locator('.vx-craft-empty p').innerText(),'此分類尚無作品');
  result.filters.push({id:category.id,count:expected.length});
 }
 await button('color').click();await page.locator('[data-vx-show-all]').click();assert.equal(await button('all').getAttribute('aria-pressed'),'true');
 await page.locator('[data-vx-works-more]').click();await page.locator('[data-vx-works-more]').click();assert.deepEqual(await ids(),spec.works.map(w=>w.id));
 await button('all').focus();await page.keyboard.press('ArrowRight');assert(await button('bleach').evaluate(e=>e===document.activeElement));await page.keyboard.press('Enter');assert.equal(await button('bleach').getAttribute('aria-pressed'),'true');
 for(const width of [1440,1024,768,390,375,320]){
  await page.setViewportSize({width,height:1100});await button('all').click();
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Horizontal overflow at '+width);
  const boxes=await nav.locator('button').evaluateAll(elements=>elements.map(e=>{const r=e.getBoundingClientRect();return {x:r.x,right:r.right,width:r.width,height:r.height,scroll:e.scrollWidth,client:e.clientWidth};}));
  assert(boxes.every(b=>b.x>=0&&b.right<=width&&b.height>=44&&b.scroll<=b.client+1),'Clipped or undersized categories at '+width);
  result.viewports.push(width);
 }
 for(const [width,height,name,category] of [[1440,1350,'desktop','all'],[390,1100,'mobile','all'],[390,1100,'triascend-mobile','triascend'],[1440,1350,'triascend-desktop','triascend']]){
  await page.setViewportSize({width,height});await button(category).click();await page.locator('#vx-works-heading').click();
  await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));await page.evaluate(()=>document.fonts.ready);
  await page.waitForFunction(()=>[...document.querySelectorAll('.vx-work-card img')].filter(i=>i.getBoundingClientRect().top<innerHeight&&i.getBoundingClientRect().bottom>0).every(i=>i.complete&&i.naturalWidth>0));
  await page.waitForTimeout(500);await page.screenshot({path:'/tmp/vx-boutique-'+name+'.png',animations:'disabled'});
 }
 await button('triascend').click();await page.locator('[data-vx-work="005"]').click();await page.locator('#vx-work-viewer[open]').waitFor();
 assert.equal(await page.locator('#vx-work-title').innerText(),'煙晶緞帶');assert((await page.locator('.vx-viewer-copy dl').innerText()).includes('TRIASCEND｜七維虹彩釉光品藏'));
 await page.waitForFunction(()=>document.querySelector('#vx-work-video').currentTime>0,{},{timeout:45000});
 await page.locator('#vx-close-work').click();await page.waitForURL('**/works/?craft=triascend');assert.equal(await button('triascend').getAttribute('aria-pressed'),'true');assert.deepEqual(await ids(),['017','009','005','002']);
 await page.reload({waitUntil:'networkidle'});assert.equal(await button('triascend').getAttribute('aria-pressed'),'true');
 await page.goto(origin+'/works/009/?craft=triascend',{waitUntil:'networkidle'});assert.equal(await page.locator('#vx-work-title').innerText(),'歐美線條');await page.locator('#vx-close-work').click();await page.waitForURL('**/works/?craft=triascend');
 result.playbackAndNavigation='passed';
 await page.goto(origin+'/',{waitUntil:'networkidle'});await page.locator('.desktop-nav a[href="/works/"]').click();await page.waitForURL('**/works/');await nav.waitFor({state:'visible'});
 await page.goto(origin+'/activities/',{waitUntil:'networkidle'});assert.equal(await page.locator('[data-reward-points]').count(),15);assert.equal(await page.locator('#vx-art-map').count(),1);
 await page.goto(origin+'/booking/',{waitUntil:'networkidle'});assert.equal(await page.locator('#vx-art-map').count(),1);
 assert.equal(result.errors.length,0);assert.equal(result.failedRequests.length,0);result.status='passed';
}catch(e){result.status='failed';result.failure=e.message;throw e;}
finally{await browser.close();await fs.writeFile(path.join(ROOT,origin.startsWith('http://127.')?'browser-verification.json':'public-browser-verification.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));}
