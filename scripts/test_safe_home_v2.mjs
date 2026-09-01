import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const browser = await puppeteer.launch({
  headless: true,
  executablePath: process.env.CHROME_PATH,
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--autoplay-policy=no-user-gesture-required',
  ],
});

const results = {};

async function configurePage(page, viewport, mobile = false) {
  await page.setViewport({ ...viewport, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1 });
  if (mobile) {
    await page.setUserAgent(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 Version/18.6 Mobile/15E148 Safari/604.1',
    );
  }
}

async function collectState(page) {
  return page.evaluate(() => {
    const stage = document.querySelector('.home-hero-stage');
    const video = stage?.querySelector('video');
    const poster = document.querySelector('.home-video-poster');
    const wordmark = document.querySelector('.home-video-wordmark');
    const rect = stage?.getBoundingClientRect();
    const posterStyle = poster ? getComputedStyle(poster) : null;
    const wordmarkStyle = wordmark ? getComputedStyle(wordmark) : null;
    return {
      ready: stage?.dataset.videoReady,
      playable: stage?.dataset.videoPlayable,
      videoReadyState: video?.readyState,
      currentTime: video?.currentTime,
      paused: video?.paused,
      error: video?.error ? String(video.error.code) : null,
      width: rect?.width,
      height: rect?.height,
      ratio: rect ? rect.width / rect.height : null,
      posterOpacity: posterStyle ? Number(posterStyle.opacity) : null,
      posterVisibility: posterStyle?.visibility,
      wordmarkOpacity: wordmarkStyle ? Number(wordmarkStyle.opacity) : null,
      wordmarkVisibility: wordmarkStyle?.visibility,
      horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      mobileLinks: document.querySelectorAll('.mobile-bar > .mobile-bottom-link').length,
      brokenHeroImages: [...document.querySelectorAll('.homepage-hero-v2 img')]
        .filter((image) => image.complete && image.naturalWidth === 0)
        .map((image) => image.currentSrc || image.src),
    };
  });
}

async function playbackCheck(name, viewport, mobile = false) {
  const page = await browser.newPage();
  await configurePage(page, viewport, mobile);

  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));

  await page.goto('http://127.0.0.1:4173/', {
    waitUntil: 'domcontentloaded',
    timeout: 120000,
  });
  await page.waitForSelector('.home-video-poster', { timeout: 30000 });
  await page.waitForSelector('.home-video-wordmark', { timeout: 30000 });

  const initial = await collectState(page);
  await new Promise((resolve) => setTimeout(resolve, 18000));
  const state = await collectState(page);

  await page.screenshot({
    path: `assets/home-hero-production-safe-v2/${name}.png`,
    fullPage: false,
  });
  await page.close();
  results[name] = { mode: 'playback', initial, state, pageErrors };
}

async function fallbackCheck() {
  const page = await browser.newPage();
  await configurePage(page, { width: 390, height: 844 }, true);
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    if (/\.mp4(?:\?|$)/i.test(request.url())) request.abort('failed');
    else request.continue();
  });

  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));

  await page.goto('http://127.0.0.1:4173/', {
    waitUntil: 'domcontentloaded',
    timeout: 120000,
  });
  await page.waitForSelector('.home-video-poster', { timeout: 30000 });
  await page.waitForSelector('.home-video-wordmark', { timeout: 30000 });
  await new Promise((resolve) => setTimeout(resolve, 5000));
  const state = await collectState(page);

  await page.screenshot({
    path: 'assets/home-hero-production-safe-v2/fallback-video-error.png',
    fullPage: false,
  });
  await page.close();
  results['fallback-video-error'] = { mode: 'fallback', state, pageErrors };
}

await playbackCheck('desktop-1440x900', { width: 1440, height: 900 }, false);
await playbackCheck('mobile-390x844', { width: 390, height: 844 }, true);
await fallbackCheck();
await browser.close();

const failures = [];
for (const [name, result] of Object.entries(results)) {
  const state = result.state;
  if (result.pageErrors.length) failures.push(`${name}: page errors ${result.pageErrors.join(' | ')}`);
  if (Math.abs(state.ratio - 16 / 9) > 0.035) failures.push(`${name}: stage ratio ${state.ratio}`);
  if (state.horizontalOverflow > 2) failures.push(`${name}: horizontal overflow ${state.horizontalOverflow}`);
  if (state.mobileLinks !== 4) failures.push(`${name}: mobile links ${state.mobileLinks}`);
  if (state.brokenHeroImages.length) failures.push(`${name}: broken hero images ${state.brokenHeroImages.join(',')}`);

  if (result.mode === 'playback') {
    if (!result.initial || result.initial.posterOpacity === null || result.initial.wordmarkOpacity === null) {
      failures.push(`${name}: poster or wordmark missing`);
    }
    if (state.ready !== 'true' || state.playable !== 'true') failures.push(`${name}: video did not reach playing state`);
    if (!(state.currentTime > 0.25) || state.paused) failures.push(`${name}: video time did not advance`);
    if (state.error) failures.push(`${name}: media error ${state.error}`);
  } else {
    if (state.ready !== 'false') failures.push(`${name}: stage incorrectly marked ready after media failure`);
    if (!(state.posterOpacity >= 0.95) || state.posterVisibility !== 'visible') failures.push(`${name}: poster fallback not visible`);
    if (!(state.wordmarkOpacity >= 0.90) || state.wordmarkVisibility !== 'visible') failures.push(`${name}: wordmark fallback not visible`);
  }
}

fs.writeFileSync(
  'assets/home-hero-production-safe-v2/browser-report.json',
  JSON.stringify({ results, failures }, null, 2),
);
console.log(JSON.stringify({ results, failures }, null, 2));
if (failures.length) process.exit(1);
