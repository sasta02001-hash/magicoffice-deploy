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
 const page=await browser.newPage({viewport:{width:1440,height:1100},deviceScaleFactor:1,reducedMotion:'reduce'});
 page.on('pageerror',e=>result.errors.push(e.message));
 page.on('response',r=>{if(r.status()>=400&&r.url().startsWith(origin))result.failedRequests.push({url:r.url(),status:r.status()});});
 await page.goto(origin+'/works/',{waitUntil:'networkidle',timeout:90000});
 const filter=page.locator('#vx-craft-filter');await filter.waitFor({state:'visible'});
 assert.equal(await filter.locator('option').count(),10);
 const ids=()=>page.locator('[data-vx-work-grid] [data-vx-work]').evaluateAll(links=>links.map(l=>l.dataset.vxWork));
 assert.equal((await ids()).length,12);
 await page.locator('[data-vx-works-more]').click();assert.equal((await ids()).length,24);
 await page.locator('[data-vx-works-more]').click();assert.deepEqual(await ids(),spec.works.map(w=>w.id));
 assert(await page.locator('[data-vx-works-more]').isHidden());
 for(const category of spec.categories){
  await filter.selectOption(category.id);
  const expected=spec.works.filter(w=>w.category===category.id);
  assert.deepEqual(await ids(),expected.map(w=>w.id));
  assert.equal(await page.locator('[data-vx-craft-count]').innerText(),expected.length+' 件作品');
  for(const work of expected){
   const card=page.locator('#work-'+work.id);assert.equal(await card.locator('h2').innerText(),work.title);
   assert.equal(await card.locator('.vx-craft-tag').innerText(),category.code);
  }
  if(!expected.length)assert.equal(await page.locator('.vx-craft-empty p').innerText(),'此分類尚無作品');
  result.filters.push({category:category.id,count:expected.length});
 }
 await filter.selectOption('triform');await page.locator('[data-vx-show-all]').click();assert.equal(await filter.inputValue(),'all');
 for(const width of [1440,768,390,375,320]){
  await page.setViewportSize({width,height:1100});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Horizontal overflow at '+width);
  const box=await filter.boundingBox();assert(box.x>=0&&box.x+box.width<=width);
  result.viewports.push(width);
 }
 for(const [width,name,category] of [[1440,'desktop','all'],[390,'mobile','all'],[390,'pending-mobile','pending'],[1440,'trifusion-desktop','trifusion']]){
  await page.setViewportSize({width,height:1100});await filter.selectOption(category);
  await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));await page.evaluate(()=>document.fonts.ready);
  await page.waitForFunction(()=>[...document.querySelectorAll('.vx-folio-art')].filter(i=>i.getBoundingClientRect().top<innerHeight&&i.getBoundingClientRect().bottom>0).every(i=>i.complete&&i.naturalWidth>0));
  await page.waitForTimeout(500);await page.screenshot({path:'/tmp/vx-classification-'+name+'.png',animations:'disabled'});
 }
 // Filter remains selected while opening a work, closing it and refreshing.
 await filter.selectOption('trifusion');
 await page.locator('[data-vx-work="026"]').click();await page.locator('#vx-work-viewer[open]').waitFor();
 assert.equal(await page.locator('#vx-work-title').innerText(),'霧茶棕 × 柔弧鬆軟燙');
 assert((await page.locator('.vx-viewer-copy dl').innerText()).includes('TRIFUSION｜星雲畫染拓樸藝作'));
 await page.waitForFunction(()=>document.querySelector('#vx-work-video').currentTime>0,{},{timeout:45000});
 await page.locator('#vx-close-work').click();await page.waitForURL('**/works/?craft=trifusion');
 assert.equal(await filter.inputValue(),'trifusion');assert.equal((await ids()).length,10);
 await page.reload({waitUntil:'networkidle'});assert.equal(await filter.inputValue(),'trifusion');assert.equal((await ids()).length,10);
 result.viewerAndPlayback='passed';
 // Verify all 32 directly addressable pages, including non-JavaScript content.
 for(const work of spec.works){
  const response=await page.request.get(origin+'/works/'+work.id+'/');assert.equal(response.status(),200);
  const html=await response.text();assert(html.includes('<title>'+work.title+'｜VX SAGITTARIUS</title>'));
  const cat=spec.categories.find(c=>c.id===work.category);assert(html.includes('<dd>'+(cat.id==='pending'?'待確認':cat.code+'｜'+cat.name)+'</dd>'));
 }
 result.directPages=32;
 await page.goto(origin+'/works/005/?craft=pending',{waitUntil:'networkidle'});
 assert.equal(await page.locator('#vx-work-title').innerText(),'煙晶緞帶');assert((await page.locator('.vx-viewer-copy dl').innerText()).includes('待確認'));
 await page.locator('#vx-close-work').click();await page.waitForURL('**/works/?craft=pending');assert.deepEqual(await ids(),['009','005']);
 await page.goto(origin+'/',{waitUntil:'networkidle'});await page.locator('.desktop-nav a[href="/works/"]').click();await page.waitForURL('**/works/');await filter.waitFor({state:'visible'});
 // Existing activities and map remain reachable from the revised portfolio.
 await page.goto(origin+'/activities/',{waitUntil:'networkidle'});assert.equal(await page.locator('[data-reward-points]').count(),15);assert.equal(await page.locator('#vx-art-map').count(),1);
 await page.goto(origin+'/booking/',{waitUntil:'networkidle'});assert.equal(await page.locator('#vx-art-map').count(),1);
 assert.equal(result.errors.length,0);assert.equal(result.failedRequests.length,0);result.status='passed';
}catch(e){result.status='failed';result.failure=e.message;throw e;}
finally{await browser.close();await fs.writeFile(path.join(ROOT,origin.startsWith('http://127.')?'browser-verification.json':'public-browser-verification.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));}
