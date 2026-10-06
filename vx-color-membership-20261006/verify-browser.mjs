import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const ROOT=path.dirname(fileURLToPath(import.meta.url));
const {chromium}=createRequire(import.meta.url)(path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'));
const spec=JSON.parse(await fs.readFile(path.join(ROOT,'classification.json'),'utf8'));
const colorIds=['026','023','022','021','017','015','013','012','009','008','007','005','003','002','001'];
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
 const more=page.locator('[data-vx-works-more]');
 await page.goto(origin+'/works/?craft=color',{waitUntil:'networkidle',timeout:90000});
 await nav.waitFor({state:'visible'});
 assert.equal(await page.locator('.vx-works select').count(),0);assert.equal(await nav.locator('button').count(),9);
 assert.equal(await button('color').getAttribute('aria-pressed'),'true');
 assert.equal(await button('color').locator('.vx-craft-link-number').innerText(),'15');
 assert.equal(await button('color').getAttribute('aria-label'),'COLOR｜染髮作品（含漂染、染燙與漂染燙），15 件作品');
 assert.equal(await page.locator('[data-vx-craft-title]').innerText(),'染髮作品');
 assert.equal(await page.locator('#vx-craft-summary').innerText(),'含單項染髮、漂染、染燙與漂染燙作品。');
 assert.equal(await page.locator('[data-vx-craft-count-number]').innerText(),'15');
 assert.deepEqual(await ids(),colorIds.slice(0,12));assert(await more.isVisible());
 await more.click();assert.deepEqual(await ids(),colorIds);assert(await more.isHidden());
 const shown=await page.locator('.vx-work-card').evaluateAll(cards=>cards.map(card=>({id:card.querySelector('[data-vx-work]').dataset.vxWork,tag:card.querySelector('.vx-craft-tag').textContent})));
 for(const w of shown){const record=spec.works.find(x=>x.id===w.id);assert.equal(w.tag,spec.categories.find(c=>c.id===record.category).code);}
 assert.equal(new Set(await ids()).size,15);result.colorPagination=[12,15];result.colorIds=colorIds;result.originalTags='preserved';
 for(const category of spec.categories){
  await button(category.id).click();
  const expected=category.id==='color'?colorIds:spec.works.filter(w=>w.category===category.id).map(w=>w.id);
  assert.deepEqual(await ids(),expected.slice(0,12));
  assert.equal(await button(category.id).getAttribute('aria-pressed'),'true');assert.equal(await nav.locator('[aria-pressed="true"]').count(),1);
  assert.equal(await button(category.id).locator('.vx-craft-link-number').innerText(),String(expected.length).padStart(2,'0'));
  assert.equal(await page.locator('[data-vx-craft-count-number]').innerText(),String(expected.length).padStart(2,'0'));
  if(!expected.length)assert.equal(await page.locator('.vx-craft-empty p').innerText(),'此分類尚無作品');
  result.filters.push({id:category.id,count:expected.length});
 }
 await button('all').click();await more.click();await more.click();assert.deepEqual(await ids(),spec.works.map(w=>w.id));result.allWorks=32;
 for(const [width,height,name] of [[1440,1350,'desktop'],[390,1100,'mobile'],[320,1000,'small-mobile']]){
  await page.setViewportSize({width,height});await button('color').click();
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Horizontal overflow at '+width);
  const boxes=await nav.locator('button').evaluateAll(elements=>elements.map(e=>{const r=e.getBoundingClientRect();return{x:r.x,right:r.right,height:r.height,scroll:e.scrollWidth,client:e.clientWidth};}));
  assert(boxes.every(b=>b.x>=0&&b.right<=width&&b.height>=44&&b.scroll<=b.client+1),'Clipped or undersized categories at '+width);
  await page.locator('#vx-works-heading').click();await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));await page.evaluate(()=>document.fonts.ready);
  await page.waitForFunction(()=>[...document.querySelectorAll('.vx-work-card img')].filter(i=>i.getBoundingClientRect().top<innerHeight&&i.getBoundingClientRect().bottom>0).every(i=>i.complete&&i.naturalWidth>0));
  await page.waitForTimeout(500);await page.screenshot({path:'/tmp/vx-color-'+name+'.png',animations:'disabled'});result.viewports.push(width);
 }
 await page.setViewportSize({width:1440,height:1350});await button('color').click();
 await page.locator('[data-vx-work="009"]').click();await page.locator('#vx-work-viewer[open]').waitFor();
 assert.equal(await page.locator('#vx-work-title').innerText(),'歐美線條');assert((await page.locator('.vx-viewer-copy dl').innerText()).includes('TRIASCEND｜七維虹彩釉光品藏'));
 await page.locator('#vx-close-work').click();await page.waitForURL('**/works/?craft=color');assert.equal(await button('color').getAttribute('aria-pressed'),'true');
 await page.reload({waitUntil:'networkidle'});assert.equal(await button('color').getAttribute('aria-pressed'),'true');assert.deepEqual(await ids(),colorIds.slice(0,12));
 await page.goto(origin+'/works/009/?craft=color',{waitUntil:'networkidle'});assert.equal(await page.locator('#vx-work-title').innerText(),'歐美線條');await page.locator('#vx-close-work').click();await page.waitForURL('**/works/?craft=color');
 assert.equal(await button('color').getAttribute('aria-pressed'),'true');assert.equal(await page.locator('[data-vx-craft-count-number]').innerText(),'15');
 result.filterNavigation='passed';
 assert.equal(result.errors.length,0);assert.equal(result.failedRequests.length,0);result.status='passed';
}catch(e){result.status='failed';result.failure=e.message;throw e;}
finally{await browser.close();await fs.writeFile(path.join(ROOT,origin.startsWith('http://127.')?'browser-verification.json':'public-browser-verification.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));}
