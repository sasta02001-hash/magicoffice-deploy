import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {chromium} from '/tmp/qingwen-browser/node_modules/playwright/index.mjs';

const [target,label='preview']=process.argv.slice(2);
const reportDir=new URL('./verification/',import.meta.url);
await fs.mkdir(reportDir,{recursive:true});
let server;
let url=target;
if(!target.startsWith('https://')) {
  const root=path.resolve(target);
  server=http.createServer(async(req,res)=>{
    try {
      const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
      const file=path.resolve(root,'.'+pathname+(pathname.endsWith('/')?'index.html':''));
      assert.ok(file.startsWith(root+path.sep));
      const bytes=await fs.readFile(file);
      const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.jpg':'image/jpeg'};
      res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});res.end(bytes);
    }catch{res.writeHead(404);res.end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  url=`http://127.0.0.1:${server.address().port}/`;
}
const browser=await chromium.launch();
const errors=[];const failures=[];const checks=[];
try {
  for(const width of [320,390,1280]) {
    const page=await browser.newPage({viewport:{width,height:900},deviceScaleFactor:1});
    page.on('pageerror',error=>errors.push(error.message));
    page.on('response',response=>{if(response.status()>=400)failures.push({url:response.url(),status:response.status()});});
    await page.goto(url,{waitUntil:'networkidle'});
    assert.equal(await page.locator('#sets').isVisible(),true,'DEFAULT_SET_TAB');
    assert.deepEqual(await page.locator('.set-prices dd').allTextContents(),['$160','$170','$200','$200','$210','$240','$250','$260','$290']);
    assert.ok((await page.locator('.set-upgrade').innerText()).includes('＋$20'),'SALMON_PRICE');
    assert.equal(await page.locator('.downloads').count(),0,'STALE_DOWNLOADS');
    const pageText=await page.locator('body').innerText();
    assert.ok(pageText.includes('壺裝與其他飲品不適用'));
    assert.ok(pageText.includes('不與其他優惠併用'));
    assert.ok(!pageText.includes('只有披薩可享飲品加購'));
    await page.screenshot({path:new URL(`${label}-${width}-sets.png`,reportDir).pathname,fullPage:true});
    for(const id of ['coffee','drinks','food','pizza','story','sets']) {
      await page.locator(`#tab-${id}`).click();
      assert.equal(await page.locator(`#${id}`).isVisible(),true,`TAB_${id}`);
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
      assert.equal(overflow,false,`HORIZONTAL_OVERFLOW_${width}_${id}`);
      if(id==='food'||id==='pizza') {
        const broken=await page.locator(`#${id} img`).evaluateAll(imgs=>imgs.filter(img=>!img.complete||img.naturalWidth===0).length);
        assert.equal(broken,0,`BROKEN_${id}_IMAGES`);
        await page.locator(`#${id} .menu-set-link`).click();
        await page.waitForFunction(()=>!document.getElementById('sets').hidden);
      }
    }
    await page.locator('#sets .set-link').first().click();
    await page.waitForFunction(()=>!document.getElementById('food').hidden);
    await page.goBack();
    await page.waitForFunction(()=>!document.getElementById('sets').hidden);
    checks.push({width,pricing:'pass',tabs:'pass',links:'pass',overflow:'none',images:'pass'});
    await page.close();
  }
  assert.deepEqual(errors,[],'PAGE_ERRORS');assert.deepEqual(failures,[],'HTTP_ERRORS');
  await fs.writeFile(new URL(`${label}-checks.json`,reportDir),JSON.stringify({status:'passed',url,checks,errors,failures},null,2));
  console.log(JSON.stringify({browserCheck:label,status:'passed',widths:[320,390,1280]}));
}finally {await browser.close();if(server)await new Promise(resolve=>server.close(resolve));}
