import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

const ROOT='assets/production-home-video-v4';
const BASE='http://127.0.0.1:4174/';
const browser=await puppeteer.launch({headless:true,executablePath:process.env.CHROME_PATH,args:['--no-sandbox','--disable-setuid-sandbox','--autoplay-policy=no-user-gesture-required','--disable-dev-shm-usage']});
const results={};

async function run(name,viewport,{mobile=false,fallback=false}={}){
 const page=await browser.newPage();
 await page.setViewport({...viewport,deviceScaleFactor:1,isMobile:mobile,hasTouch:mobile});
 if(mobile)await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 Version/18.6 Mobile/15E148 Safari/604.1');
 const pageErrors=[],consoleErrors=[],failedRequests=[],forbiddenRequests=[];
 page.on('pageerror',e=>pageErrors.push(String(e)));
 page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text())});
 page.on('requestfailed',r=>{if(!/^(data:|blob:)/i.test(r.url()))failedRequests.push({url:r.url(),error:r.failure()?.errorText||'unknown'})});
 page.on('request',r=>{const u=r.url();if(/magicoffice\.vercel\.app\/assets\//i.test(u)||/raw\.githubusercontent\.com/i.test(u)||/magicoffice-preview-v2\.vercel\.app/i.test(u))forbiddenRequests.push(u)});
 await page.goto(`${BASE}${fallback?'?moFallback=1':''}`,{waitUntil:'domcontentloaded',timeout:120000});
 await page.waitForSelector('.home-video-poster',{visible:true,timeout:30000});
 await page.waitForSelector('.home-hero-trial-video',{timeout:30000});
 let playbackWaitError=null;
 if(fallback)await new Promise(r=>setTimeout(r,1600));
 else {
  try { await page.waitForFunction(()=>{const s=document.querySelector('.homepage-cinema-stage'),v=s?.querySelector('.home-hero-trial-video');return s?.dataset.videoReady==='true'&&v&&!v.paused&&v.currentTime>.2},{timeout:30000}); }
  catch(error){ playbackWaitError=String(error); }
 }

 if(mobile){const t=await page.$('.menu-toggle');if(t){await t.click();await new Promise(r=>setTimeout(r,180));}}
 await page.evaluate(async()=>{const d=ms=>new Promise(r=>setTimeout(r,ms));for(let y=0;y<document.documentElement.scrollHeight;y+=650){scrollTo(0,y);await d(55)}scrollTo(0,0);await d(250)});
 await new Promise(r=>setTimeout(r,500));

 const state=await page.evaluate(({fallback,mobile})=>{
  const stage=document.querySelector('.homepage-cinema-stage'),video=stage?.querySelector('.home-hero-trial-video'),poster=stage?.querySelector('.home-video-poster'),wordmark=stage?.querySelector('.home-video-wordmark'),mount=stage?.querySelector('[data-home-video-mount]');
  const cs=e=>e?getComputedStyle(e):null,r=stage?.getBoundingClientRect(),brand=document.querySelector('.home-hero-brand')?.getBoundingClientRect(),media=document.querySelector('.home-hero-media')?.getBoundingClientRect();
  const broken=[...document.images].filter(i=>i.complete&&i.naturalWidth===0).map(i=>({alt:i.alt,src:(i.currentSrc||i.src||'').slice(0,120)}));
  const ids=['roster','schedule','event-hub','heartbeat-support','summer-navy','mid-autumn','yuzu-birthday','menu','first-visit','location','recruitment'];
  const missing=ids.filter(id=>!document.getElementById(id));
  const mobileBar=document.querySelector('.mobile-bar,.mobile-bottom-bar');
  const booking=[...document.querySelectorAll('a')].filter(a=>/立即訂位/.test(a.textContent||'')).map(a=>a.href);
  const menuTabs=[...document.querySelectorAll('.menu-tabs button,[role="tablist"] button,[data-pane]')].length;
  const rosterButtons=[...document.querySelectorAll('#roster button,#roster [role="button"],#roster a')].length;
  return {fallback,mobile,ready:stage?.dataset.videoReady,playable:stage?.dataset.videoPlayable,error:stage?.dataset.videoError,videoReadyState:video?.readyState,currentTime:video?.currentTime,paused:video?.paused,muted:video?.muted,posterOpacity:+(cs(poster)?.opacity||0),posterVisibility:cs(poster)?.visibility,wordmarkOpacity:+(cs(wordmark)?.opacity||0),wordmarkVisibility:cs(wordmark)?.visibility,mountOpacity:+(cs(mount)?.opacity||0),mountVisibility:cs(mount)?.visibility,ratio:r?r.width/r.height:null,brandShare:brand&&media?brand.width/(brand.width+media.width):null,horizontalOverflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,broken,missing,mobileLinks:mobileBar?.querySelectorAll('.mobile-bottom-link').length||0,menuExpanded:document.querySelector('.menu-toggle')?.getAttribute('aria-expanded'),booking,menuTabs,rosterButtons,heartbeatImage:document.querySelector('#heartbeat-support img')?.naturalWidth||0,marker:document.querySelector('meta[name="x-magicoffice-production-release"]')?.content||''};
 },{fallback,mobile});
 await page.screenshot({path:`${ROOT}/${name}.png`,fullPage:false});
 results[name]={state,pageErrors,consoleErrors,failedRequests,forbiddenRequests,playbackWaitError};
 await page.close();
}

await run('desktop-1440x900',{width:1440,height:900});
await run('mobile-390x844',{width:390,height:844},{mobile:true});
await run('fallback-390x844',{width:390,height:844},{mobile:true,fallback:true});
await browser.close();

const failures=[];
for(const [name,r] of Object.entries(results)){
 const s=r.state;
 if(!s.marker.includes('home-video-wordmark-12s-2026-09-01-v4'))failures.push(`${name}: release marker`);
 if(s.missing.length)failures.push(`${name}: missing sections ${s.missing}`);
 if(s.broken.length)failures.push(`${name}: broken images ${JSON.stringify(s.broken)}`);
 if(s.horizontalOverflow>2)failures.push(`${name}: overflow ${s.horizontalOverflow}`);
 if(Math.abs((s.ratio||0)-16/9)>.035)failures.push(`${name}: ratio ${s.ratio}`);
 if(s.mobileLinks!==4)failures.push(`${name}: mobile links ${s.mobileLinks}`);
 if(!s.booking.length)failures.push(`${name}: booking link missing`);
 if(!s.menuTabs)failures.push(`${name}: menu tabs missing`);
 if(!s.rosterButtons)failures.push(`${name}: roster interactions missing`);
 if(!s.heartbeatImage)failures.push(`${name}: heartbeat art missing`);
 if(r.pageErrors.length)failures.push(`${name}: page errors ${r.pageErrors.join('|')}`);
 if(r.playbackWaitError&&!name.startsWith('fallback'))failures.push(`${name}: playback wait ${r.playbackWaitError}`);
 if(r.forbiddenRequests.length)failures.push(`${name}: forbidden requests ${r.forbiddenRequests.join(',')}`);
 if(name.startsWith('desktop')&&!(s.brandShare>.30&&s.brandShare<.43))failures.push(`${name}: desktop share ${s.brandShare}`);
 if(name.startsWith('mobile')&&s.menuExpanded!=='true')failures.push(`${name}: mobile menu did not open`);
 if(name.startsWith('fallback')){
  if(s.ready!=='false')failures.push(`${name}: ready ${s.ready}`);
  if(!(s.posterOpacity>.95)||s.posterVisibility!=='visible')failures.push(`${name}: poster fallback`);
  if(!(s.wordmarkOpacity>.95)||s.wordmarkVisibility!=='visible')failures.push(`${name}: wordmark fallback`);
  if(s.ready!=='false'||s.playable==='true')failures.push(`${name}: fallback video state ${s.ready}/${s.playable}`);
 }else{
  if(s.ready!=='true'||s.playable!=='true')failures.push(`${name}: video state ${s.ready}/${s.playable}`);
  if(!(s.currentTime>.2)||s.paused)failures.push(`${name}: video not advancing`);
  if(!s.muted)failures.push(`${name}: video not muted`);
  if(!(s.posterOpacity<.05)||s.posterVisibility!=='hidden')failures.push(`${name}: poster not hidden`);
  if(!(s.wordmarkOpacity<.05)||s.wordmarkVisibility!=='hidden')failures.push(`${name}: wordmark not hidden`);
  if(!(s.mountOpacity>.95)||s.mountVisibility!=='visible')failures.push(`${name}: video mount not visible`);
 }
}
fs.writeFileSync(`${ROOT}/browser-report.json`,JSON.stringify({results,failures},null,2));
console.log(JSON.stringify({results,failures},null,2));
if(failures.length)process.exit(1);
