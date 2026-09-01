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

async function check(name, viewport, mobile = false) {
  const page = await browser.newPage();
  await page.setViewport({ ...viewport, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1 });
  if (mobile) {
    await page.setUserAgent(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 Version/18.6 Mobile/15E148 Safari/604.1',
    );
  }

  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));

  await page.goto('http://127.0.0.1:4173/', {
    waitUntil: 'domcontentloaded',
    timeout: 120000,
  });
  await page.waitForSelector('.home-video-poster', { visible: true, timeout: 30000 });

  const initial = await page.evaluate(() => ({
    ready: document.querySelector('.home-hero-stage')?.dataset.videoReady,
    poster: Boolean(document.querySelector('.home-video-poster')),
    wordmark: Boolean(document.querySelector('.home-video-wordmark')),
    mobileLinks: document.querySelectorAll('.mobile-bar > .mobile-bottom-link').length,
  }));

  await new Promise((resolve) => setTimeout(resolve, 18000));

  const state = await page.evaluate(() => {
    const stage = document.querySelector('.home-hero-stage');
    const video = stage?.querySelector('video');
    const rect = stage?.getBoundingClientRect();
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
      horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      mobileLinks: document.querySelectorAll('.mobile-bar > .mobile-bottom-link').length,
      brokenHeroImages: [...document.querySelectorAll('.homepage-hero-v2 img')]
        .filter((image) => image.complete && image.naturalWidth === 0)
        .map((image) => image.currentSrc || image.src),
    };
  });

  await page.screenshot({
    path: `assets/home-hero-production-safe-v2/${name}.png`,
    fullPage: false,
  });
  await page.close();
  results[name] = { initial, state, pageErrors };
}

await check('desktop-1440x900', { width: 1440, height: 900 }, false);
await check('mobile-390x844', { width: 390, height: 844 }, true);
await browser.close();

const failures = [];
for (const [name, result] of Object.entries(results)) {
  if (result.initial.ready !== 'false') failures.push(`${name}: poster not retained initially`);
  if (!result.initial.poster || !result.initial.wordmark) failures.push(`${name}: poster/wordmark missing`);
  if (result.state.ready !== 'true' || result.state.playable !== 'true') failures.push(`${name}: video did not reach playing state`);
  if (!(result.state.currentTime > 0.25) || result.state.paused) failures.push(`${name}: video time did not advance`);
  if (result.state.error) failures.push(`${name}: media error ${result.state.error}`);
  if (Math.abs(result.state.ratio - 16 / 9) > 0.035) failures.push(`${name}: stage ratio ${result.state.ratio}`);
  if (result.state.horizontalOverflow > 2) failures.push(`${name}: horizontal overflow ${result.state.horizontalOverflow}`);
  if (result.state.mobileLinks !== 4) failures.push(`${name}: mobile links ${result.state.mobileLinks}`);
  if (result.state.brokenHeroImages.length) failures.push(`${name}: broken hero images`);
}

fs.writeFileSync(
  'assets/home-hero-production-safe-v2/browser-report.json',
  JSON.stringify({ results, failures }, null, 2),
);
console.log(JSON.stringify({ results, failures }, null, 2));
if (failures.length) process.exit(1);
