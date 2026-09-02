import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const base = process.env.BASE_URL || 'http://127.0.0.1:4173/';
const chrome = process.env.CHROME_PATH;
const output = process.env.SCREEN_DIR || 'verification-v43';
const requireLiveApi = process.env.REQUIRE_LIVE_API === '1';
if (!chrome) throw new Error('CHROME_PATH is required');
fs.mkdirSync(output, { recursive: true });

const browser = await puppeteer.launch({ headless:true, executablePath:chrome, args:['--no-sandbox','--disable-setuid-sandbox','--autoplay-policy=no-user-gesture-required','--disable-dev-shm-usage'] });
const report = { attempted:true, base, cases:{}, failures:[] };

async function run(name, viewport, mobile=false) {
  const page = await browser.newPage();
  await page.setViewport({ ...viewport, isMobile:mobile, hasTouch:mobile, deviceScaleFactor:mobile?2:1 });
  if (mobile) await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 Version/18.7 Mobile/15E148 Safari/604.1');
  const pageErrors=[]; const consoleErrors=[]; const failedRequests=[];
  page.on('pageerror', error => pageErrors.push(String(error)));
  page.on('console', message => { if (message.type()==='error') consoleErrors.push(message.text()); });
  page.on('requestfailed', request => failedRequests.push({url:request.url(),error:request.failure()?.errorText||'unknown'}));
  await page.goto(base, { waitUntil:'networkidle2', timeout:120000 });
  await page.waitForFunction(() => document.documentElement.dataset.ready === 'true', { timeout:45000 });
  await page.waitForSelector('#roster-grid .roster-card', { timeout:30000 });
  await page.waitForSelector('#event-grid .event-card', { timeout:30000 });
  await page.waitForSelector('#menu-tabs button', { timeout:30000 });
  await page.waitForSelector('#schedule-grid .day-card', { timeout:30000 });

  const start = await page.$('.video-start');
  if (start) await start.click();
  await page.waitForFunction(() => { const v=document.querySelector('#hero-video'); return v && !v.paused && v.currentTime > .2; }, { timeout:30000 });
  const sound = await page.$('#video-sound');
  if (sound) await sound.click();
  await page.waitForFunction(() => { const v=document.querySelector('#hero-video'); return v && v.muted === false; }, { timeout:10000 });

  for (const world of ['BAR','COLLECTION','CAFE']) {
    await page.click(`[data-menu-world="${world}"]`);
    await page.waitForFunction((value) => document.querySelector(`[data-menu-world="${value}"]`)?.classList.contains('active'), {}, world);
  }
  const firstRoster = await page.$('#roster-grid .roster-card');
  if (firstRoster) {
    await firstRoster.click();
    await page.waitForFunction(() => document.querySelector('#profile-dialog')?.open === true, { timeout:10000 });
    await page.click('#profile-dialog .dialog-close');
  }

  const state = await page.evaluate(() => {
    const video=document.querySelector('#hero-video');
    const overflow=document.documentElement.scrollWidth-document.documentElement.clientWidth;
    const scheduleSource=document.querySelector('#schedule-source')?.textContent?.trim()||'';
    const menuSource=document.querySelector('#menu-source')?.textContent?.trim()||'';
    return {
      release:document.documentElement.dataset.release,
      ready:document.documentElement.dataset.ready,
      title:document.querySelector('#hero-title')?.textContent?.trim(),
      titleRect:document.querySelector('#hero-title')?.getBoundingClientRect().toJSON(),
      videoCurrentTime:video?.currentTime,
      videoPaused:video?.paused,
      videoMuted:video?.muted,
      rosterCount:document.querySelectorAll('#roster-grid .roster-card').length,
      eventCount:document.querySelectorAll('#event-grid .event-card').length,
      eventDetailCount:document.querySelectorAll('#event-details .event-section').length,
      menuTabCount:document.querySelectorAll('#menu-tabs button').length,
      menuItemCount:document.querySelectorAll('#menu-panel .menu-item').length,
      scheduleDayCount:document.querySelectorAll('#schedule-grid .day-card').length,
      brokenImages:[...document.images].filter(img=>img.complete&&img.naturalWidth===0).map(img=>img.src),
      overflow,scheduleSource,menuSource,
      bodyHeight:document.body.scrollHeight
    };
  });
  await page.screenshot({ path:path.join(output,`${name}-hero.png`), fullPage:false });
  await page.evaluate(() => document.querySelector('#event-hub')?.scrollIntoView());
  await new Promise(r=>setTimeout(r,300));
  await page.screenshot({ path:path.join(output,`${name}-events.png`), fullPage:false });
  await page.evaluate(() => document.querySelector('#menu')?.scrollIntoView());
  await new Promise(r=>setTimeout(r,300));
  await page.screenshot({ path:path.join(output,`${name}-menu.png`), fullPage:false });
  report.cases[name]={state,pageErrors,consoleErrors,failedRequests};
  if(state.release!=='magicoffice-v4.3-clean-replacement-2026-09-03')report.failures.push(`${name}: release marker`);
  if(state.title!=='魔幻姶仕社')report.failures.push(`${name}: hero title`);
  if(!(state.videoCurrentTime>.2)||state.videoPaused)report.failures.push(`${name}: video playback`);
  if(state.videoMuted)report.failures.push(`${name}: sound toggle`);
  if(state.rosterCount!==16)report.failures.push(`${name}: roster ${state.rosterCount}`);
  if(state.eventCount!==5||state.eventDetailCount!==5)report.failures.push(`${name}: events ${state.eventCount}/${state.eventDetailCount}`);
  if(state.menuTabCount!==3)report.failures.push(`${name}: menu tabs ${state.menuTabCount}`);
  if(state.menuItemCount<35)report.failures.push(`${name}: visible menu items ${state.menuItemCount}`);
  if(state.scheduleDayCount!==7)report.failures.push(`${name}: schedule ${state.scheduleDayCount}`);
  if(state.brokenImages.length)report.failures.push(`${name}: broken images ${state.brokenImages.length}`);
  if(state.overflow>2)report.failures.push(`${name}: horizontal overflow ${state.overflow}`);
  if(pageErrors.length)report.failures.push(`${name}: page errors ${pageErrors.join(' | ')}`);
  if(requireLiveApi&&(scheduleSource.includes('官網發布版')||menuSource.includes('官網發布版')))report.failures.push(`${name}: live APIs fell back ${scheduleSource}/${menuSource}`);
  await page.close();
}

await run('desktop-1440x900',{width:1440,height:900});
await run('mobile-390x844',{width:390,height:844},true);
await browser.close();
fs.writeFileSync(path.join(output,'browser-report.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
if(report.failures.length)process.exit(1);
