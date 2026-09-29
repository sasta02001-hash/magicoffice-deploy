import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const phase=process.argv[2];assert(['local','production'].includes(phase));
await fs.mkdir('evidence',{recursive:true});
let server;
if(phase==='local'){
  const types={'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.json':'application/json'};
  server=http.createServer(async(req,res)=>{try{let p=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(p==='/')p='/index.html';else if(!path.extname(p))p+='.html';assert(!p.includes('..'));const data=await fs.readFile('work/site'+p);res.writeHead(200,{'Content-Type':types[path.extname(p)]??'application/octet-stream'});res.end(data);}catch{res.writeHead(404);res.end('Not found');}});await new Promise(r=>server.listen(4173,'127.0.0.1',r));
}
const origin=phase==='local'?'http://127.0.0.1:4173':'https://moon-tau-sandy.vercel.app';
const result={checkedAt:new Date().toISOString(),phase,origin,status:'running',viewports:[],pageErrors:[],failedSameOrigin:[],unverified:['physical mobile devices','Instagram account editing','sending a LINE message']};
const browser=await chromium.launch({headless:true});
try{
  if(phase==='production'){
    const expected=await fs.readFile('work/site/styles.css');let equal=false;
    for(let i=0;i<7;i++){const r=await fetch(origin+'/styles.css');const bytes=Buffer.from(await r.arrayBuffer());if(r.ok&&bytes.equals(expected)){equal=true;break;}await new Promise(r=>setTimeout(r,10000));}assert(equal,'Original CSS URL still differs from published source');result.publicCssSha1=createHash('sha1').update(expected).digest('hex');
  }
  for(const width of [1366,1024,1020,768,390,320]){
    const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});const page=await context.newPage();
    page.on('pageerror',e=>result.pageErrors.push({width,message:e.message}));
    page.on('response',r=>{if(r.url().startsWith(origin)&&r.status()>=400)result.failedSameOrigin.push({width,url:r.url(),status:r.status()});});
    await page.goto(origin+'/',{waitUntil:'networkidle'});await page.locator('[data-site-header]').waitFor();
    const layout=await page.evaluate(()=>{const h=getComputedStyle(document.querySelector('.site-header'));const a=getComputedStyle(document.querySelector('.desktop-nav a'));return {background:h.backgroundColor,foreground:a.color,viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth,headerHeight:document.querySelector('.site-header').getBoundingClientRect().height};});
    assert(layout.background==='rgba(4, 10, 18, 0.9)','Header must have its dark background before scrolling');assert(layout.scrollWidth<=width+1,'Horizontal overflow at '+width);
    const linear=v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;};const lum=rgb=>rgb.map(linear).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
    const contrast=(lum([245,238,223])+.05)/(lum([4,10,18].map(v=>v*.9+255*.1))+.05);assert(contrast>=4.5);layout.worstCaseContrast=+contrast.toFixed(2);
    const mobile=width<=1020;assert.equal(await page.locator('[data-menu-button]').isVisible(),mobile);
    if(width===1366||width===390)await page.screenshot({path:`evidence/${phase}-home-${width}.png`});
    const nav=mobile?'[data-mobile-nav]':'.desktop-nav';const hrefs=await page.locator(nav+' a[href^="#"]').evaluateAll(xs=>xs.map(x=>x.getAttribute('href')));assert(hrefs.length>=6);
    for(const [n,href] of hrefs.entries()){
      if(mobile){await page.locator('[data-menu-button]').click();assert.equal(await page.locator('[data-menu-button]').getAttribute('aria-expanded'),'true');if(width===390&&n===0)await page.screenshot({path:`evidence/${phase}-menu-390.png`});}
      await page.locator(nav+` a[href="${href}"]`).click();assert.equal(new URL(page.url()).hash,href);
      if(mobile){assert.equal(await page.locator('[data-menu-button]').getAttribute('aria-expanded'),'false');assert.equal(await page.locator('[data-mobile-nav]').isVisible(),false);}
    }
    if(width===1366||width===390){
      const faq=page.locator('.faq-item');assert.equal(await faq.count(),6);for(let n=0;n<6;n++){await faq.nth(n).locator('summary').click();await page.waitForFunction(index=>document.querySelectorAll('.faq-item')[index].open&&document.querySelectorAll('.faq-item[open]').length===1,n);}
      const toggles=page.locator('[data-profile-toggle]');for(let n=0;n<await toggles.count();n++){await toggles.nth(n).click();assert.equal(await toggles.nth(n).getAttribute('aria-expanded'),'true');await toggles.nth(n).click();assert.equal(await toggles.nth(n).getAttribute('aria-expanded'),'false');}
      const imgs=page.locator('img');for(let n=0;n<await imgs.count();n++){if(await imgs.nth(n).isVisible())await imgs.nth(n).scrollIntoViewIfNeeded();}
      await page.waitForFunction(()=>[...document.images].every(i=>i.complete&&i.naturalWidth>0));layout.loadedImages=await imgs.count();
      layout.profileToggles=await toggles.count();
      const links=await page.locator('a[href]').evaluateAll(xs=>xs.map(a=>({text:a.textContent.trim(),href:a.href})));layout.externalLinks=[...new Set(links.filter(x=>!x.href.startsWith(origin)).map(x=>x.href))];
      assert(links.some(x=>x.href==='https://lin.ee/tf6pZ93'));
      const privacy=links.find(x=>/\/privacy(?:\.html)?$/.test(x.href));assert(privacy);await page.goto(privacy.href,{waitUntil:'networkidle'});assert((await page.locator('body').innerText()).includes('隱私'));assert((await page.locator('link[rel="canonical"]').getAttribute('href')).includes('/privacy'));
      layout.faqToggles=6;layout.privacy=true;
    }
    result.viewports.push({width,...layout,navigationLinks:hrefs.length});await context.close();
  }
  assert.equal(result.pageErrors.length,0,'Website JavaScript errors');assert.equal(result.failedSameOrigin.length,0,'Failed same-origin resources');result.status='passed';
}catch(e){result.status='failed';result.error=e.message;result.errorStack=e.stack;process.exitCode=1;}
finally{await browser.close();if(server)server.close();result.completedAt=new Date().toISOString();await fs.writeFile(`evidence/${phase}-browser.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));}
