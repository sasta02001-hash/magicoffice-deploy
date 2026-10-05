import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const ROOT=path.dirname(fileURLToPath(import.meta.url));
const {chromium}=createRequire(import.meta.url)(path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'));
const origin=process.argv[2]||'http://127.0.0.1:4173';
const browser=await chromium.launch({headless:true,executablePath:process.env.VX_BROWSER_EXECUTABLE||undefined,args:['--no-sandbox']});
const result={origin,checkedAt:new Date().toISOString(),viewports:[],errors:[],failedRequests:[],filters:{}};
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1,reducedMotion:'reduce'});
 const capture=async(selector,name)=>{
  await page.evaluate(sel=>{const el=document.querySelector(sel);scrollTo({top:el.getBoundingClientRect().top+scrollY-100,behavior:'instant'});},selector);
  await page.evaluate(()=>document.fonts.ready);
  await page.waitForTimeout(700);
  await page.screenshot({path:'/tmp/vx-activities-'+name+'.png',animations:'disabled'});
 };
 page.on('pageerror',e=>result.errors.push(e.message));
 page.on('response',r=>{if(r.status()>=400&&r.url().startsWith(origin))result.failedRequests.push({url:r.url(),status:r.status()});});
 await page.goto(origin+'/activities/',{waitUntil:'networkidle',timeout:90000});
 await page.locator('[data-reward-filter="35"]').waitFor();
 assert.equal(await page.locator('[data-reward-points]').count(),15);
 await page.locator('[data-reward-points] img').evaluateAll(images=>images.forEach(i=>i.loading='eager'));
 await page.waitForFunction(()=>Array.from(document.querySelectorAll('[data-reward-points] img')).every(i=>i.complete&&i.naturalWidth>0),{},{timeout:60000});
 assert.equal(await page.locator('h1').innerText(),'最新活動');
 await capture('body','desktop-top');
 await capture('#rewards-2026','desktop-rewards');
 await capture('.vx-reward-grid','desktop-gifts');
 for(const [score,count] of [['10',2],['15',2],['25',2],['35',2],['40',3],['50',4],['all',15]]){
  await page.locator(`[data-reward-filter="${score}"]`).click();
  assert.equal(await page.locator('[data-reward-points]:visible').count(),count);
  result.filters[score]=count;
 }
 await page.locator('#the-money summary').click();
 assert(await page.locator('#the-money details').evaluate(e=>e.open));
 assert((await page.locator('#the-money').innerText()).includes('非現金退款'));
 for(const width of [1440,768,390,375,320]){
  await page.setViewportSize({width,height:900});
  const dims=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
  assert(dims.scroll<=dims.width,`Horizontal overflow at ${width}: ${dims.scroll}`);
  result.viewports.push(dims);
 }
 await page.setViewportSize({width:390,height:844});
 await capture('body','mobile-top');
 await capture('#rewards-2026','mobile-rules');
 await page.locator('[data-reward-filter="35"]').click();
 await capture('.vx-reward-grid','mobile-gifts');
 await page.locator('[data-reward-filter="all"]').click();
 for(const anchor of ['online-booking','the-money','pride-2026','rewards-2026']){
  await page.locator(`.vx-activity-index a[href="#${anchor}"]`).click();assert(page.url().endsWith('#'+anchor));
 }
 await page.locator('[data-campaign-filter="ended"]').click();assert.equal(await page.locator('[data-reward-points]').count(),0);
 await page.locator('[data-campaign-filter="current"]').click();assert.equal(await page.locator('[data-reward-points]').count(),15);
 await page.locator('[data-reward-filter="40"]').click();assert.equal(await page.locator('[data-reward-points]:visible').count(),3);
 await page.locator('[data-menu-toggle]').click();assert.equal(await page.locator('[data-menu-toggle]').getAttribute('aria-expanded'),'true');
 await page.locator('#mobile-navigation a[href="/"]').click();await page.waitForURL(origin+'/');
 await page.locator('[data-campaign-home]').waitFor();assert((await page.locator('[data-campaign-home]').innerText()).includes('15 款積分禮遇'));
 await page.locator('[data-campaign-home] a[href="/activities/#starfield-opening-2026"]').click();await page.waitForURL('**/activities/#starfield-opening-2026');
 const lineLinks=await page.locator('a[href="https://lin.ee/Roebk7r"]').count();assert(lineLinks>=3);
 result.lineLinks=lineLinks;result.loadedRewardImages=15;
 assert.equal(result.errors.length,0,'Browser script errors');assert.equal(result.failedRequests.length,0,'Failed public resources');
 result.status='passed';
}catch(e){result.status='failed';result.failure=e.message;throw e;}
finally{await browser.close();await fs.writeFile(path.join(ROOT,origin.startsWith('http://127.')?'browser-verification.json':'public-browser-verification.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));}
