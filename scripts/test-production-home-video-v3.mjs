import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const base = (process.env.BASE_URL || 'http://127.0.0.1:4173/').replace(/\/?$/, '/');
const chrome = process.env.CHROME_PATH;
if (!chrome) throw new Error('CHROME_PATH is required');

const browser = await puppeteer.launch({
  headless: true,
  executablePath: chrome,
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--autoplay-policy=no-user-gesture-required',
  ],
});

const results = {};

async function audit(name, viewport, mobile = false, blockVideo = false) {
  const page = await browser.newPage();
  await page.setViewport({ ...viewport, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1 });
  if (mobile) {
    await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 Version/18.6 Mobile/15E148 Safari/604.1');
  }

  const pageErrors = [];
  const consoleErrors = [];
  const requestFailures = [];
  const badResponses = [];
  page.on('pageerror', error => pageErrors.push(String(error)));
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('requestfailed', request => {
    const url = request.url();
    if (!(blockVideo && url.includes('MagicOffice_home_trial_720p_12s_v1.mp4'))) {
      requestFailures.push({ url, error: request.failure()?.errorText || '' });
    }
  });
  page.on('response', response => {
    const url = response.url();
    if (response.status() >= 400 && !url.includes('favicon')) {
      badResponses.push({ url, status: response.status() });
    }
  });

  if (blockVideo) {
    await page.setRequestInterception(true);
    page.on('request', request => {
      if (request.url().includes('MagicOffice_home_trial_720p_12s_v1.mp4')) request.abort();
      else request.continue();
    });
  }

  await page.goto(`${base}?production-audit=${Date.now()}-${name}`, {
    waitUntil: 'domcontentloaded',
    timeout: 120000,
  });
  await page.waitForSelector('[data-home-video-stage="true"] .home-video-poster', {
    visible: true,
    timeout: 30000,
  });

  const initial = await page.evaluate(() => {
    const stage = document.querySelector('[data-home-video-stage="true"]');
    const poster = stage?.querySelector('.home-video-poster');
    const wordmark = stage?.querySelector('.home-video-wordmark');
    const video = stage?.querySelector('video');
    return {
      ready: stage?.dataset.videoReady,
      playable: stage?.dataset.videoPlayable,
      posterOpacity: poster ? Number(getComputedStyle(poster).opacity) : null,
      posterVisibility: poster ? getComputedStyle(poster).visibility : null,
      wordmarkOpacity: wordmark ? Number(getComputedStyle(wordmark).opacity) : null,
      wordmarkVisibility: wordmark ? getComputedStyle(wordmark).visibility : null,
      videoReadyState: video?.readyState,
      currentTime: video?.currentTime,
    };
  });

  if (blockVideo) {
    await new Promise(resolve => setTimeout(resolve, 5000));
  } else {
    await page.waitForFunction(() => {
      const stage = document.querySelector('[data-home-video-stage="true"]');
      const video = stage?.querySelector('video');
      return stage?.dataset.videoReady === 'true' && video && video.currentTime > 0.25;
    }, { timeout: 30000 }).catch(() => {});
  }

  // Load and verify all lazy images, not just the first viewport.
  await page.evaluate(async () => {
    const step = Math.max(280, Math.floor(innerHeight * 0.72));
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      scrollTo(0, y);
      await new Promise(resolve => setTimeout(resolve, 65));
    }
    scrollTo(0, 0);
  });
  await new Promise(resolve => setTimeout(resolve, 1500));

  const state = await page.evaluate(() => {
    const stage = document.querySelector('[data-home-video-stage="true"]');
    const poster = stage?.querySelector('.home-video-poster');
    const wordmark = stage?.querySelector('.home-video-wordmark');
    const video = stage?.querySelector('video');
    const rect = stage?.getBoundingClientRect();
    const labels = [...document.querySelectorAll('[data-home-mobile-nav="four-core-links"] .mobile-bottom-link')]
      .map(node => node.textContent.trim());
    return {
      release: document.querySelector('meta[name="x-magicoffice-home-hero-production"]')?.content,
      ready: stage?.dataset.videoReady,
      playable: stage?.dataset.videoPlayable,
      currentTime: video?.currentTime,
      paused: video?.paused,
      videoReadyState: video?.readyState,
      mediaError: video?.error ? video.error.code : null,
      posterOpacity: poster ? Number(getComputedStyle(poster).opacity) : null,
      posterVisibility: poster ? getComputedStyle(poster).visibility : null,
      wordmarkOpacity: wordmark ? Number(getComputedStyle(wordmark).opacity) : null,
      wordmarkVisibility: wordmark ? getComputedStyle(wordmark).visibility : null,
      width: rect?.width,
      height: rect?.height,
      ratio: rect ? rect.width / rect.height : null,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      labels,
      brokenImages: [...document.images]
        .filter(image => image.complete && image.naturalWidth === 0)
        .map(image => image.currentSrc || image.src),
      sections: ['roster', 'schedule', 'menu', 'location'].map(id => ({ id, exists: Boolean(document.getElementById(id)) })),
      booking: [...document.querySelectorAll('.home-hero-actions a')].find(a => a.textContent.includes('立即訂位'))?.href || '',
      attendance: [...document.querySelectorAll('.home-hero-actions a')].find(a => a.textContent.includes('本週出勤'))?.href || '',
    };
  });

  const screenshotDir = process.env.SCREENSHOT_DIR || 'audit-output';
  fs.mkdirSync(screenshotDir, { recursive: true });
  await page.screenshot({ path: `${screenshotDir}/${name}.png`, fullPage: false });
  results[name] = { blockVideo, initial, state, pageErrors, consoleErrors, requestFailures, badResponses };
  await page.close();
}

await audit('desktop-1440x900', { width: 1440, height: 900 }, false, false);
await audit('mobile-390x844', { width: 390, height: 844 }, true, false);
if (process.env.TEST_FALLBACK !== '0') {
  await audit('fallback-390x844', { width: 390, height: 844 }, true, true);
}
await browser.close();

const failures = [];
for (const [name, result] of Object.entries(results)) {
  const state = result.state;
  if (result.initial.ready !== 'false') failures.push(`${name}: poster mode was not the initial state`);
  if (!(result.initial.posterOpacity >= 0.95) || result.initial.posterVisibility !== 'visible') failures.push(`${name}: initial poster not visible`);
  if (!(result.initial.wordmarkOpacity >= 0.95) || result.initial.wordmarkVisibility !== 'visible') failures.push(`${name}: initial wordmark not visible`);
  if (!state.release?.includes('home-hero-video-wordmark-production-2026-09-01')) failures.push(`${name}: release marker missing`);
  if (Math.abs(state.ratio - 16 / 9) > 0.035) failures.push(`${name}: stage ratio ${state.ratio}`);
  if (state.overflow > 2) failures.push(`${name}: horizontal overflow ${state.overflow}`);
  if (JSON.stringify(state.labels) !== JSON.stringify(['姶仕名錄', '本週出勤', '活動快報', '立即訂位'])) failures.push(`${name}: mobile navigation labels ${JSON.stringify(state.labels)}`);
  if (state.sections.some(section => !section.exists)) failures.push(`${name}: required section missing`);
  if (!state.booking || !state.attendance) failures.push(`${name}: hero action link missing`);
  if (state.brokenImages.length) failures.push(`${name}: broken images ${state.brokenImages.join(', ')}`);
  if (result.pageErrors.length) failures.push(`${name}: page errors ${result.pageErrors.join(' | ')}`);
  if (result.consoleErrors.length) failures.push(`${name}: console errors ${result.consoleErrors.join(' | ')}`);
  if (result.requestFailures.length) failures.push(`${name}: request failures ${JSON.stringify(result.requestFailures)}`);
  if (result.badResponses.length) failures.push(`${name}: bad responses ${JSON.stringify(result.badResponses)}`);

  if (result.blockVideo) {
    if (state.ready !== 'false' || state.posterOpacity < 0.95 || state.posterVisibility !== 'visible' || state.wordmarkOpacity < 0.95 || state.wordmarkVisibility !== 'visible') {
      failures.push(`${name}: poster fallback was not retained`);
    }
  } else {
    if (state.ready !== 'true' || state.playable !== 'true' || !(state.currentTime > 0.25) || state.paused || state.mediaError) {
      failures.push(`${name}: video did not actually play ${JSON.stringify({ ready: state.ready, playable: state.playable, currentTime: state.currentTime, paused: state.paused, mediaError: state.mediaError })}`);
    }
    if (state.posterOpacity > 0.1 || state.wordmarkOpacity > 0.1) failures.push(`${name}: poster or wordmark did not fade after actual playback`);
  }
}

const reportPath = process.env.REPORT_PATH || 'audit-output/browser-report.json';
fs.mkdirSync(reportPath.split('/').slice(0, -1).join('/') || '.', { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify({ base, results, failures }, null, 2));
console.log(JSON.stringify({ base, failures }, null, 2));
if (failures.length) process.exit(1);
