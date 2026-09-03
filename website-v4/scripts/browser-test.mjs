import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const OUT = path.join(ROOT, 'verification');
fs.mkdirSync(OUT, { recursive: true });
const schedule = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/schedule-fallback.json'), 'utf8'));
const menu = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/menu-fallback.json'), 'utf8'));
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.mp4': 'video/mp4', '.xml': 'application/xml', '.txt': 'text/plain' };

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (url.pathname === '/api/schedule') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ...schedule, source: 'Browser test live route', stale: false }));
    return;
  }
  if (url.pathname === '/api/menu') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ...menu, source: 'Browser test live route', stale: false }));
    return;
  }
  const clean = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  const file = path.resolve(DIST, `.${clean}`);
  if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404, { 'content-type': 'text/plain' }); res.end('Not found'); return;
  }
  res.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((resolve) => server.listen(4173, '127.0.0.1', resolve));

const chromeCandidates = [process.env.CHROME_PATH, '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable'].filter(Boolean);
const executablePath = chromeCandidates.find((candidate) => fs.existsSync(candidate));
if (!executablePath) throw new Error('找不到 Chromium／Chrome；請設定 CHROME_PATH。');
const browser = await puppeteer.launch({ headless: true, executablePath, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--disable-dev-shm-usage'] });
const results = {};

async function run(name, viewport, query = '') {
  const page = await browser.newPage();
  await page.setViewport({ ...viewport, deviceScaleFactor: 1, isMobile: viewport.width < 500, hasTouch: viewport.width < 500 });
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  await page.goto(`http://127.0.0.1:4173/${query}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForSelector('.mo-cast-card');
  await new Promise((resolve) => setTimeout(resolve, 1800));
  if (!query.includes('poster=1')) {
    try { await page.waitForFunction(() => document.querySelector('.mo-cinema')?.dataset.state === 'playing', { timeout: 12_000 }); } catch {}
  }
  if (viewport.width < 500) {
    await page.click('.mo-menu-toggle');
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  await page.screenshot({ path: path.join(OUT, `${name}-top.png`), fullPage: false });
  const state = await page.evaluate(() => {
    const q = (selector) => document.querySelector(selector);
    const qa = (selector) => [...document.querySelectorAll(selector)];
    const style = (node) => node ? getComputedStyle(node) : null;
    const cinema = q('.mo-cinema');
    const video = cinema?.querySelector('video');
    const h1 = q('.mo-hero h1');
    const h1Style = style(h1);
    return {
      build: document.documentElement.dataset.build,
      sections: qa('section').length,
      roster: qa('.mo-cast-card').length,
      days: qa('.mo-day-card').length,
      eventCards: qa('.mo-event-card').length,
      eventDetails: qa('.mo-event-detail').length,
      menuItems: qa('[data-menu-item-id]').length,
      brokenImages: qa('img').filter((image) => image.complete && image.naturalWidth === 0).map((image) => image.src),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      cinemaState: cinema?.dataset.state,
      currentTime: video?.currentTime,
      paused: video?.paused,
      posterOpacity: style(q('.mo-poster'))?.opacity,
      wordmarkOpacity: style(q('.mo-poster-wordmark'))?.opacity,
      scheduleState: q('[data-schedule-state]')?.dataset.state,
      menuState: q('[data-menu-sync-note]')?.dataset.state,
      mobileMenuOpen: q('.mo-nav')?.classList.contains('is-open'),
      titleLines: h1 && h1Style ? Math.round(h1.getBoundingClientRect().height / Number.parseFloat(h1Style.lineHeight || h1Style.fontSize)) : null,
      jsonLd: qa('script[type="application/ld+json"]').length,
    };
  });
  results[name] = { state, pageErrors, consoleErrors };
  await page.close();
}

await run('desktop-1440x900', { width: 1440, height: 900 });
await run('mobile-390x844', { width: 390, height: 844 });
await run('fallback-390x844', { width: 390, height: 844 }, '?offline=1&poster=1');
await browser.close();
server.close();

const failures = [];
for (const [name, result] of Object.entries(results)) {
  const state = result.state;
  const expected = [
    [state.roster === 16, `roster=${state.roster}`],
    [state.days === 7, `days=${state.days}`],
    [state.eventCards === 5 && state.eventDetails === 5, `events=${state.eventCards}/${state.eventDetails}`],
    [state.menuItems >= 88, `menu=${state.menuItems}`],
    [state.brokenImages.length === 0, `brokenImages=${state.brokenImages.length}`],
    [state.overflow <= 2, `overflow=${state.overflow}`],
    [state.titleLines === 1, `titleLines=${state.titleLines}`],
    [state.jsonLd >= 1, `jsonLd=${state.jsonLd}`],
  ];
  for (const [ok, message] of expected) if (!ok) failures.push(`${name}: ${message}`);
  if (result.pageErrors.length) failures.push(`${name}: pageErrors=${result.pageErrors.join(' | ')}`);
  if (result.consoleErrors.length) failures.push(`${name}: consoleErrors=${result.consoleErrors.join(' | ')}`);
  if (name.startsWith('fallback')) {
    if (state.cinemaState !== 'idle') failures.push(`${name}: cinemaState=${state.cinemaState}`);
    if (Number(state.posterOpacity) < .95 || Number(state.wordmarkOpacity) < .95) failures.push(`${name}: poster fallback hidden`);
    if (state.scheduleState !== 'fallback' || state.menuState !== 'fallback') failures.push(`${name}: fallback states=${state.scheduleState}/${state.menuState}`);
  } else {
    if (state.cinemaState !== 'playing' || state.paused || !(state.currentTime > .2)) failures.push(`${name}: video did not play`);
    if (Number(state.posterOpacity) > .05 || Number(state.wordmarkOpacity) > .05) failures.push(`${name}: poster did not hide after playback`);
    if (state.scheduleState !== 'live' || state.menuState !== 'live') failures.push(`${name}: live states=${state.scheduleState}/${state.menuState}`);
  }
}
fs.writeFileSync(path.join(OUT, 'browser-report.json'), `${JSON.stringify({ checkedAt: new Date().toISOString(), results, failures }, null, 2)}\n`);
console.log(JSON.stringify({ results, failures }, null, 2));
if (failures.length) process.exit(1);
