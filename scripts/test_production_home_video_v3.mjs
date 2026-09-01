import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

const OUTPUT_DIR = 'assets/production-home-video-v3';
const BASE = 'http://127.0.0.1:4173/';

const browser = await puppeteer.launch({
  headless: true,
  executablePath: process.env.CHROME_PATH,
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--autoplay-policy=no-user-gesture-required',
    '--disable-dev-shm-usage',
  ],
});

const results = {};

async function scrollDocument(page) {
  await page.evaluate(async () => {
    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const max = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
    for (let y = 0; y < max; y += 700) {
      window.scrollTo(0, y);
      await delay(80);
    }
    window.scrollTo(0, 0);
    await delay(250);
  });
}

async function runCase(name, viewport, { mobile = false, fallback = false } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ ...viewport, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
  if (mobile) {
    await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 Version/18.6 Mobile/15E148 Safari/604.1');
  }

  const pageErrors = [];
  const consoleErrors = [];
  const forbiddenRequests = [];
  const failedRequests = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('request', (request) => {
    const url = request.url();
    if (/magicoffice\.vercel\.app\/assets\//i.test(url) || /raw\.githubusercontent\.com/i.test(url) || /magicoffice-preview-v2\.vercel\.app/i.test(url)) {
      forbiddenRequests.push(url);
    }
  });
  page.on('requestfailed', (request) => {
    const url = request.url();
    if (/^(?:data:|blob:)/i.test(url)) return;
    failedRequests.push({ url, error: request.failure()?.errorText || 'unknown' });
  });

  const url = `${BASE}${fallback ? '?moFallback=1' : ''}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForSelector('.home-video-poster', { visible: true, timeout: 30000 });
  await page.waitForSelector('.home-hero-trial-video', { timeout: 30000 });

  if (fallback) {
    await new Promise((resolve) => setTimeout(resolve, 1800));
  } else {
    await page.waitForFunction(() => {
      const stage = document.querySelector('.homepage-cinema-stage');
      const video = stage?.querySelector('.home-hero-trial-video');
      return stage?.dataset.videoReady === 'true' && video && !video.paused && video.currentTime > 0.20;
    }, { timeout: 35000 });
  }

  if (mobile) {
    const toggle = await page.$('.menu-toggle');
    if (toggle) {
      await toggle.click();
      await new Promise((resolve) => setTimeout(resolve, 180));
    }
  }

  await scrollDocument(page);
  await new Promise((resolve) => setTimeout(resolve, 700));

  const state = await page.evaluate(({ fallback, mobile }) => {
    const stage = document.querySelector('.homepage-cinema-stage');
    const video = stage?.querySelector('.home-hero-trial-video');
    const poster = stage?.querySelector('.home-video-poster');
    const wordmark = stage?.querySelector('.home-video-wordmark');
    const mount = stage?.querySelector('[data-home-video-mount]');
    const shell = document.querySelector('.home-hero-shell');
    const brand = document.querySelector('.home-hero-brand');
    const media = document.querySelector('.home-hero-media');
    const rect = stage?.getBoundingClientRect();
    const brandRect = brand?.getBoundingClientRect();
    const mediaRect = media?.getBoundingClientRect();
    const style = (element) => element ? getComputedStyle(element) : null;
    const brokenImages = [...document.images]
      .filter((image) => image.complete && image.naturalWidth === 0)
      .map((image) => ({ alt: image.alt, src: (image.currentSrc || image.src || '').slice(0, 140) }));
    const missingSections = ['roster','schedule','event-hub','heartbeat-support','menu','location']
      .filter((id) => !document.getElementById(id));
    const mobileBar = document.querySelector('.mobile-bar,.mobile-bottom-bar');
    const mobileLinks = mobileBar ? mobileBar.querySelectorAll('.mobile-bottom-link').length : 0;
    const menuToggle = document.querySelector('.menu-toggle');
    const scheduleText = document.querySelector('#week-grid')?.textContent?.replace(/\s+/g, ' ').trim() || '';
    const bookingLinks = [...document.querySelectorAll('a')].filter((a) => /立即訂位/.test(a.textContent || '')).map((a) => a.href);
    return {
      fallback,
      mobile,
      ready: stage?.dataset.videoReady,
      playable: stage?.dataset.videoPlayable,
      error: stage?.dataset.videoError,
      videoReadyState: video?.readyState,
      videoCurrentTime: video?.currentTime,
      videoPaused: video?.paused,
      videoMuted: video?.muted,
      posterOpacity: Number.parseFloat(style(poster)?.opacity || '0'),
      posterVisibility: style(poster)?.visibility,
      wordmarkOpacity: Number.parseFloat(style(wordmark)?.opacity || '0'),
      wordmarkVisibility: style(wordmark)?.visibility,
      mountOpacity: Number.parseFloat(style(mount)?.opacity || '0'),
      mountVisibility: style(mount)?.visibility,
      stageWidth: rect?.width,
      stageHeight: rect?.height,
      stageRatio: rect ? rect.width / rect.height : null,
      shellDisplay: style(shell)?.display,
      brandWidth: brandRect?.width,
      mediaWidth: mediaRect?.width,
      brandMediaShare: brandRect && mediaRect ? brandRect.width / (brandRect.width + mediaRect.width) : null,
      horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      brokenImages,
      missingSections,
      mobileLinks,
      menuExpanded: menuToggle?.getAttribute('aria-expanded'),
      scheduleTextLength: scheduleText.length,
      bookingLinks,
      wordmarkExists: Boolean(wordmark),
      posterExists: Boolean(poster),
      videoExists: Boolean(video),
      productionMarker: document.querySelector('meta[name="x-magicoffice-production-release"]')?.content || null,
    };
  }, { fallback, mobile });

  await page.screenshot({ path: `${OUTPUT_DIR}/${name}.png`, fullPage: false });
  await page.close();
  results[name] = { state, pageErrors, consoleErrors, forbiddenRequests, failedRequests };
}

await runCase('desktop-1440x900', { width: 1440, height: 900 });
await runCase('mobile-390x844', { width: 390, height: 844 }, { mobile: true });
await runCase('fallback-390x844', { width: 390, height: 844 }, { mobile: true, fallback: true });
await browser.close();

const failures = [];
for (const [name, result] of Object.entries(results)) {
  const { state } = result;
  if (!state.productionMarker?.includes('home-video-wordmark-12s-2026-09-01-v3')) failures.push(`${name}: production marker missing`);
  if (!state.posterExists || !state.wordmarkExists || !state.videoExists) failures.push(`${name}: hero media elements missing`);
  if (state.missingSections.length) failures.push(`${name}: missing sections ${state.missingSections.join(',')}`);
  if (state.mobileLinks !== 4) failures.push(`${name}: mobile links ${state.mobileLinks}`);
  if (Math.abs((state.stageRatio || 0) - 16 / 9) > 0.035) failures.push(`${name}: stage ratio ${state.stageRatio}`);
  if (state.horizontalOverflow > 2) failures.push(`${name}: horizontal overflow ${state.horizontalOverflow}`);
  if (state.brokenImages.length) failures.push(`${name}: broken images ${JSON.stringify(state.brokenImages)}`);
  if (!state.bookingLinks.length || state.bookingLinks.some((href) => !href || href === 'about:blank')) failures.push(`${name}: booking links missing`);
  if (result.pageErrors.length) failures.push(`${name}: page errors ${result.pageErrors.join(' | ')}`);
  if (result.forbiddenRequests.length) failures.push(`${name}: forbidden asset requests ${result.forbiddenRequests.join(',')}`);
  if (name.startsWith('desktop')) {
    if (!(state.brandMediaShare > 0.30 && state.brandMediaShare < 0.42)) failures.push(`${name}: desktop brand/media share ${state.brandMediaShare}`);
  }
  if (name.startsWith('mobile') && state.menuExpanded !== 'true') failures.push(`${name}: mobile menu did not open`);
  if (name.startsWith('fallback')) {
    if (state.ready !== 'false') failures.push(`${name}: fallback ready=${state.ready}`);
    if (!(state.posterOpacity > 0.95) || state.posterVisibility !== 'visible') failures.push(`${name}: poster fallback not visible`);
    if (!(state.wordmarkOpacity > 0.95) || state.wordmarkVisibility !== 'visible') failures.push(`${name}: wordmark fallback not visible`);
    if (!(state.mountOpacity < 0.05) || state.mountVisibility !== 'hidden') failures.push(`${name}: video mount visible during fallback`);
  } else {
    if (state.ready !== 'true' || state.playable !== 'true') failures.push(`${name}: video state ${state.ready}/${state.playable}`);
    if (!(state.videoCurrentTime > 0.20) || state.videoPaused) failures.push(`${name}: video did not advance`);
    if (!state.videoMuted) failures.push(`${name}: video is not muted`);
    if (!(state.posterOpacity < 0.05) || state.posterVisibility !== 'hidden') failures.push(`${name}: poster did not hide after playing`);
    if (!(state.wordmarkOpacity < 0.05) || state.wordmarkVisibility !== 'hidden') failures.push(`${name}: wordmark did not hide after playing`);
    if (!(state.mountOpacity > 0.95) || state.mountVisibility !== 'visible') failures.push(`${name}: video mount not visible after playing`);
  }
}

fs.writeFileSync(`${OUTPUT_DIR}/browser-report.json`, JSON.stringify({ results, failures }, null, 2));
console.log(JSON.stringify({ results, failures }, null, 2));
if (failures.length) process.exit(1);
