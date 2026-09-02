import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const base = process.env.BASE_URL || 'http://127.0.0.1:4173/';
const chrome = process.env.CHROME_PATH;
const output = process.env.SCREEN_DIR || 'verification-v43-final';
const requireVideoPlayback = process.env.REQUIRE_VIDEO_PLAYBACK === '1';
if (!chrome) throw new Error('CHROME_PATH is required');
fs.mkdirSync(output, { recursive: true });

const browser = await puppeteer.launch({
  headless: true,
  executablePath: chrome,
  args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--autoplay-policy=no-user-gesture-required'],
});
const report = { attempted: true, base, cases: {}, failures: [] };

async function run(name, viewport, mobile = false) {
  const page = await browser.newPage();
  await page.setViewport({ ...viewport, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1 });
  if (mobile) await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 Version/18.7 Mobile/15E148 Safari/604.1');

  const pageErrors = [];
  const consoleErrors = [];
  const failedRequests = [];
  const badResponses = [];
  page.on('pageerror', error => pageErrors.push(String(error)));
  page.on('console', message => {
    if (message.type() === 'error' && !/media|decode|ERR_ABORTED/i.test(message.text())) consoleErrors.push(message.text());
  });
  page.on('requestfailed', request => {
    const url = request.url();
    const error = request.failure()?.errorText || 'unknown';
    if (!/hero-trial-12s-with-audio\.mp4/i.test(url)) failedRequests.push({ url, error });
  });
  page.on('response', response => {
    if (response.status() >= 400 && !response.url().includes('/api/')) badResponses.push({ url: response.url(), status: response.status() });
  });

  await page.goto(base, { waitUntil: 'networkidle2', timeout: 120000 });
  await page.waitForFunction(() => document.documentElement.dataset.ready === 'true', { timeout: 45000 });
  await page.waitForSelector('#roster-grid .roster-card', { timeout: 30000 });
  await page.waitForSelector('#event-grid .event-card', { timeout: 30000 });
  await page.waitForSelector('#menu-tabs button', { timeout: 30000 });
  await page.waitForSelector('#schedule-grid .day-card', { timeout: 30000 });

  let playbackStarted = false;
  let playbackError = '';
  try {
    await page.click('.video-start');
    await page.waitForFunction(() => {
      const video = document.querySelector('#hero-video');
      return video && !video.paused && video.currentTime > 0.15;
    }, { timeout: 6000 });
    playbackStarted = true;
  } catch (error) {
    playbackError = String(error);
  }

  if (playbackStarted) {
    const muted = await page.$eval('#hero-video', video => video.muted);
    if (muted) await page.click('#video-sound');
  }

  for (const world of ['BAR','COLLECTION','CAFE']) {
    await page.click(`[data-menu-world="${world}"]`);
    await page.waitForFunction(value => document.querySelector(`[data-menu-world="${value}"]`)?.classList.contains('active'), {}, world);
  }

  const category = await page.$('#menu-panel [data-menu-category]:not([data-menu-category="ALL"])');
  if (category) {
    const id = await category.evaluate(node => node.dataset.menuCategory);
    await category.click();
    await page.waitForFunction(value => document.querySelector(`[data-menu-category="${value}"]`)?.classList.contains('active'), {}, id);
    await page.click('#menu-panel [data-menu-category="ALL"]');
  }

  await page.click('#roster-grid .roster-card');
  await page.waitForFunction(() => document.querySelector('#profile-dialog')?.open === true, { timeout: 10000 });
  await page.click('#profile-dialog .dialog-close');

  const state = await page.evaluate(() => {
    const video = document.querySelector('#hero-video');
    const source = video?.querySelector('source');
    return {
      release: document.documentElement.dataset.release,
      ready: document.documentElement.dataset.ready,
      title: document.querySelector('#hero-title')?.textContent?.trim(),
      titleWhiteSpace: getComputedStyle(document.querySelector('#hero-title')).whiteSpace,
      videoSource: source?.getAttribute('src') || '',
      videoType: source?.getAttribute('type') || '',
      videoPoster: video?.getAttribute('poster') || '',
      videoCanPlayType: video?.canPlayType('video/mp4') || '',
      videoReadyState: video?.readyState,
      videoNetworkState: video?.networkState,
      videoError: video?.error ? { code: video.error.code, message: video.error.message } : null,
      videoCurrentTime: video?.currentTime || 0,
      videoPaused: video?.paused,
      videoMuted: video?.muted,
      videoControlCount: document.querySelectorAll('.video-controls button, .video-controls input').length,
      rosterCount: document.querySelectorAll('#roster-grid .roster-card').length,
      eventCount: document.querySelectorAll('#event-grid .event-card').length,
      eventDetailCount: document.querySelectorAll('#event-details .event-section').length,
      eventRulesCount: document.querySelectorAll('#event-details details').length,
      menuTabCount: document.querySelectorAll('#menu-tabs button').length,
      menuItemCount: document.querySelectorAll('#menu-panel .menu-item').length,
      scheduleDayCount: document.querySelectorAll('#schedule-grid .day-card').length,
      mobileBarLinks: document.querySelectorAll('.mobile-bar a').length,
      brokenImages: [...document.images].filter(image => image.complete && image.naturalWidth === 0).map(image => image.src),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });

  await page.screenshot({ path: path.join(output, `${name}-hero.png`), fullPage: false });
  await page.evaluate(() => document.querySelector('#event-hub')?.scrollIntoView());
  await new Promise(resolve => setTimeout(resolve, 500));
  await page.screenshot({ path: path.join(output, `${name}-events.png`), fullPage: false });
  await page.evaluate(() => document.querySelector('#menu')?.scrollIntoView());
  await new Promise(resolve => setTimeout(resolve, 500));
  await page.screenshot({ path: path.join(output, `${name}-menu.png`), fullPage: false });

  report.cases[name] = { state, playbackStarted, playbackError, pageErrors, consoleErrors, failedRequests, badResponses };
  if (state.release !== 'magicoffice-v4.3-clean-replacement-2026-09-03') report.failures.push(`${name}: release marker`);
  if (state.title !== '魔幻姶仕社') report.failures.push(`${name}: title`);
  if (!state.videoSource.endsWith('/assets/video/hero-trial-12s-with-audio.mp4') || state.videoType !== 'video/mp4') report.failures.push(`${name}: video source`);
  if (!state.videoPoster || state.videoControlCount < 5) report.failures.push(`${name}: video fallback/controls`);
  if (requireVideoPlayback && !playbackStarted) report.failures.push(`${name}: video playback ${playbackError}`);
  if (state.rosterCount !== 16) report.failures.push(`${name}: roster ${state.rosterCount}`);
  if (state.eventCount !== 5 || state.eventDetailCount !== 5 || state.eventRulesCount < 13) report.failures.push(`${name}: events ${state.eventCount}/${state.eventDetailCount}/${state.eventRulesCount}`);
  if (state.menuTabCount !== 3 || state.menuItemCount < 35) report.failures.push(`${name}: menu ${state.menuTabCount}/${state.menuItemCount}`);
  if (state.scheduleDayCount !== 7) report.failures.push(`${name}: schedule ${state.scheduleDayCount}`);
  if (state.mobileBarLinks !== 4) report.failures.push(`${name}: mobile bar ${state.mobileBarLinks}`);
  if (state.brokenImages.length) report.failures.push(`${name}: broken images ${state.brokenImages.length}`);
  if (state.overflow > 2) report.failures.push(`${name}: overflow ${state.overflow}`);
  if (pageErrors.length) report.failures.push(`${name}: page errors ${pageErrors.join(' | ')}`);
  if (consoleErrors.length) report.failures.push(`${name}: console errors ${consoleErrors.join(' | ')}`);
  if (failedRequests.length) report.failures.push(`${name}: failed requests ${JSON.stringify(failedRequests)}`);
  if (badResponses.length) report.failures.push(`${name}: bad responses ${JSON.stringify(badResponses)}`);
  await page.close();
}

await run('desktop-1440x900', { width: 1440, height: 900 });
await run('mobile-390x844', { width: 390, height: 844 }, true);
await browser.close();
fs.writeFileSync(path.join(output, 'browser-report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (report.failures.length) process.exit(1);
