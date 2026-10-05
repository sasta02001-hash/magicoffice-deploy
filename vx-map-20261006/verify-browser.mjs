import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const ROOT=path.dirname(fileURLToPath(import.meta.url));
const {chromium}=createRequire(import.meta.url)(path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'));
const origin=process.argv[2]||'http://127.0.0.1:4173';
const browser=await chromium.launch({headless:true,executablePath:process.env.VX_BROWSER_EXECUTABLE||undefined,args:['--no-sandbox']});
const result={origin,checkedAt:new Date().toISOString(),pages:[],errors:[],failedRequests:[]};
try{
 const page=await browser.newPage({viewport:{width:1440,height:1100},deviceScaleFactor:1,reducedMotion:'reduce'});
 page.on('pageerror',e=>result.errors.push(e.message));
 page.on('response',r=>{if(r.status()>=400&&r.url().startsWith(origin))result.failedRequests.push({url:r.url(),status:r.status()});});
 for(const route of ['booking','activities']){
  await page.goto(origin+'/'+route+'/',{waitUntil:'networkidle',timeout:90000});
  await page.locator('#vx-art-map').waitFor();assert.equal(await page.locator('#vx-art-map').count(),1);
  const record={route,viewports:[]};
  const navigate=page.locator('[data-vx-map-navigation]');
  const url=new URL(await navigate.getAttribute('href'));assert.equal(url.hostname,'www.google.com');assert.equal(url.searchParams.get('query'),'台北市松山區南京東路三段303巷14弄6-1號');
  assert.equal(await navigate.getAttribute('target'),'_blank');
  if(route==='booking'){
   await page.locator('.page-hero a[href="#vx-art-map"]').click();assert(page.url().endsWith('#vx-art-map'));
   assert.equal(await page.locator('.location-card').count(),3);
  }else{
   assert.equal(await page.locator('[data-reward-points]').count(),15);
   await page.locator('[data-campaign-filter="ended"]').click();await page.locator('[data-campaign-filter="current"]').click();
   assert.equal(await page.locator('#vx-art-map').count(),1);
   await page.locator('[data-reward-filter="35"]').click();assert.equal(await page.locator('[data-reward-points]:visible').count(),2);
   await page.locator('[data-reward-filter="all"]').click();
  }
  const photo=page.locator('.vx-map-enlarge img');
  await photo.scrollIntoViewIfNeeded();
  await page.waitForFunction(()=>{const i=document.querySelector('.vx-map-enlarge img');return i.complete&&i.naturalWidth===1254&&i.naturalHeight===1254;});
  for(const width of [1440,768,390,375,320]){
   await page.setViewportSize({width,height:1000});
   const dimensions=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,map:document.querySelector('.vx-map-enlarge img').getBoundingClientRect().toJSON()}));
   assert(dimensions.scroll<=width,'Horizontal overflow');assert(Math.abs(dimensions.map.width-dimensions.map.height)<1,'Map was stretched or cropped');record.viewports.push(width);
  }
  for(const [width,name] of [[1440,'desktop'],[390,'mobile']]){
   await page.setViewportSize({width,height:name==='mobile'?1100:1000});
   await page.evaluate(()=>scrollTo({top:document.querySelector('#vx-art-map').getBoundingClientRect().top+scrollY-100,behavior:'instant'}));
   await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(700);
   await page.screenshot({path:'/tmp/vx-map-'+route+'-'+name+'.png',animations:'disabled'});
  }
  const popupEvent=page.waitForEvent('popup');await page.locator('.vx-map-enlarge').click();const popup=await popupEvent;
  await popup.waitForLoadState('load');assert(popup.url().endsWith('/activities/vx-art-neighborhood-map.jpeg'));
  await popup.waitForFunction(()=>document.images[0]?.naturalWidth===1254);await popup.close();
  record.enlargement='passed';record.navigationAddress='verified';result.pages.push(record);
 }
 // The site's client navigation must retain the shared map stylesheet.
 await page.setViewportSize({width:1440,height:1000});
 await page.locator('.desktop-nav a[href="/booking/"]').click();await page.waitForURL('**/booking/');
 assert.equal(await page.locator('#vx-art-map').count(),1);
  assert.equal(await page.locator('#vx-art-map').evaluate(e=>getComputedStyle(e).display),'grid');
 await page.goto(origin+'/',{waitUntil:'networkidle',timeout:90000});
 await page.locator('.desktop-nav a[href="/booking/"]').click();await page.waitForURL('**/booking/');
 assert.equal(await page.locator('#vx-art-map').count(),1);
 assert.equal(await page.locator('#vx-art-map').evaluate(e=>getComputedStyle(e).display),'grid');
 assert.equal(result.errors.length,0);assert.equal(result.failedRequests.length,0);result.status='passed';
}catch(e){result.status='failed';result.failure=e.message;throw e;}
finally{await browser.close();await fs.writeFile(path.join(ROOT,origin.startsWith('http://127.')?'browser-verification.json':'public-browser-verification.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));}
