import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';

const DIST = path.resolve('dist');
const HTML = path.join(DIST, 'index.html');
const SOURCE = path.resolve('source-assets/magicoffice-home-clean-scene-v1.webp');
const ASSET_URL = '/assets/media/magicoffice-home-clean-scene-v1.webp';
const ASSET = path.join(DIST, ASSET_URL.replace(/^\//, ''));
const RELEASE = 'home-clean-scene-2026-09-01-v2';
const CACHE = '20260901-clean-scene-v2';

if (!fs.existsSync(HTML)) throw new Error('dist/index.html is missing');
if (!fs.existsSync(SOURCE)) throw new Error('approved clean-scene source is missing');
const meta = await sharp(SOURCE).metadata();
if (meta.width !== 1000 || meta.height !== 1333) throw new Error(`clean scene has wrong size ${meta.width}x${meta.height}`);
fs.mkdirSync(path.dirname(ASSET), { recursive: true });
fs.copyFileSync(SOURCE, ASSET);

let html = fs.readFileSync(HTML, 'utf8');
html = html
  .replace(/<meta\s+name=["']x-magicoffice-home-static-background["'][^>]*>/gi, '')
  .replace(/<meta\s+name=["']x-magicoffice-home-photo-beauty["'][^>]*>/gi, '')
  .replace(/<meta\s+name=["']x-magicoffice-home-dynamic-background["'][^>]*>/gi, '')
  .replace(/<link\s+[^>]*id=["']magicoffice-home-static-background-preload["'][^>]*>/gi, '')
  .replace(/<link\s+[^>]*id=["']magicoffice-home-clean-scene-preload["'][^>]*>/gi, '')
  .replace(/<style\s+id=["']magicoffice-home-static-background-v\d+["']>[\s\S]*?<\/style>/gi, '')
  .replace(/<style\s+id=["']magicoffice-home-dynamic-background-v\d+["']>[\s\S]*?<\/style>/gi, '')
  .replace(/<style\s+id=["']magicoffice-home-visible-refinement-v\d+["']>[\s\S]*?<\/style>/gi, '')
  .replace(/<style\s+id=["']magicoffice-home-petal-scale-fix-v\d+["']>[\s\S]*?<\/style>/gi, '')
  .replace(/<style\s+id=["']magicoffice-home-clean-scene-v\d+["']>[\s\S]*?<\/style>/gi, '')
  .replace(/<div\s+class=["']mo-home-static-bg["'][^>]*>[\s\S]*?<\/div>/gi, '')
  .replace(/<div\s+class=["']mo-home-motion-bg["'][^>]*>[\s\S]*?<\/div>/gi, '');

const head = `
<meta name="x-magicoffice-home-static-background" content="${RELEASE}"/>
<meta name="x-magicoffice-home-dynamic-background" content="${RELEASE}"/>
<link id="magicoffice-home-clean-scene-preload" rel="preload" as="image" href="${ASSET_URL}?v=${CACHE}" fetchpriority="high"/>
<style id="magicoffice-home-clean-scene-v2">
.homepage-hero-v2{position:relative!important;isolation:isolate!important;overflow:hidden!important;background:#080609!important}
.homepage-hero-v2::before,.homepage-hero-v2::after{content:none!important;display:none!important;background:none!important}
.mo-home-static-bg{position:absolute!important;inset:0!important;z-index:0!important;display:block!important;visibility:visible!important;opacity:1!important;overflow:hidden!important;pointer-events:none!important;user-select:none!important;background:#080609!important}
.mo-home-static-bg-image{position:absolute!important;inset:-1.5%!important;width:103%!important;height:103%!important;max-width:none!important;display:block!important;visibility:visible!important;opacity:1!important;object-fit:cover!important;object-position:50% 52%!important;filter:saturate(.96) brightness(.86) contrast(1.035)!important;transform:translateZ(0) scale(1.008)!important;transform-origin:center!important}
.mo-home-static-bg-glow{position:absolute!important;inset:0!important;background:radial-gradient(circle at 77% 19%,rgba(255,211,228,.15),transparent 39%),radial-gradient(circle at 28% 70%,rgba(215,181,112,.075),transparent 46%)!important;mix-blend-mode:screen!important;pointer-events:none!important}
.mo-home-static-bg-shade{position:absolute!important;inset:0!important;display:block!important;background:linear-gradient(90deg,rgba(5,4,6,.67) 0%,rgba(7,5,7,.40) 34%,rgba(7,5,7,.12) 67%,rgba(5,4,6,.18) 100%),linear-gradient(to top,rgba(6,4,6,.58) 0%,rgba(6,4,6,.08) 38%,transparent 63%)!important;pointer-events:none!important}
.mo-home-motion-bg{position:absolute!important;inset:0!important;z-index:2!important;overflow:hidden!important;pointer-events:none!important;user-select:none!important;contain:layout paint style!important}
.mo-home-petal{position:absolute!important;left:var(--left)!important;top:var(--top)!important;display:block!important;width:18px!important;height:10px!important;border-radius:92% 5% 92% 5%!important;background:linear-gradient(145deg,rgba(255,229,238,.94),rgba(215,119,149,.90) 53%,rgba(120,31,61,.84))!important;box-shadow:0 0 5px rgba(255,190,211,.22)!important;opacity:var(--alpha,.46)!important;filter:blur(var(--blur,0px))!important;will-change:transform,opacity!important;transform-origin:center!important;animation:mo-home-clean-petal-fall var(--duration,12s) linear var(--delay,0s) infinite!important}
@keyframes mo-home-clean-petal-fall{0%{transform:translate3d(0,-100px,0) rotate(0deg) scale(var(--scale,1));opacity:0}8%{opacity:var(--alpha,.46)}86%{opacity:var(--alpha,.46)}100%{transform:translate3d(var(--drift,60px),940px,0) rotate(var(--spin,560deg)) scale(var(--scale,1));opacity:0}}
.homepage-hero-v2>.home-hero-shell{position:relative!important;z-index:4!important}
@media(max-width:960px){.mo-home-static-bg-image{object-position:50% 47%!important;filter:saturate(.94) brightness(.82) contrast(1.03)!important}.mo-home-static-bg-shade{background:linear-gradient(to top,rgba(5,4,6,.68) 1%,rgba(7,5,7,.25) 50%,rgba(7,5,7,.11) 100%),linear-gradient(90deg,rgba(5,4,6,.19),transparent 75%)!important}.mo-home-motion-bg{opacity:.84!important}.mo-home-petal{width:14px!important;height:8px!important}.mo-home-petal:nth-child(7){display:none!important}@keyframes mo-home-clean-petal-fall{0%{transform:translate3d(0,-75px,0) rotate(0deg) scale(var(--scale,1));opacity:0}8%{opacity:var(--alpha,.46)}86%{opacity:var(--alpha,.46)}100%{transform:translate3d(var(--drift,44px),720px,0) rotate(var(--spin,520deg)) scale(var(--scale,1));opacity:0}}}
@media(prefers-reduced-motion:reduce){.mo-home-motion-bg{display:none!important}.mo-home-static-bg-image{transform:none!important}}
</style>`;
if (!html.includes('</head>')) throw new Error('homepage has no </head>');
html = html.replace('</head>', `${head}\n</head>`);

const layers = `<div class="mo-home-static-bg" aria-hidden="true"><img class="mo-home-static-bg-image" src="${ASSET_URL}?v=${CACHE}" width="1000" height="1333" alt="" decoding="async" fetchpriority="high"/><span class="mo-home-static-bg-glow"></span><span class="mo-home-static-bg-shade"></span></div><div class="mo-home-motion-bg" aria-hidden="true"><i class="mo-home-petal" style="--left:7%;--top:-14%;--delay:-1.1s;--duration:11.7s;--drift:64px;--scale:.92;--alpha:.48;--spin:570deg"></i><i class="mo-home-petal" style="--left:22%;--top:-23%;--delay:-6.4s;--duration:13.9s;--drift:-48px;--scale:.70;--alpha:.32;--spin:-530deg;--blur:.2px"></i><i class="mo-home-petal" style="--left:39%;--top:-9%;--delay:-3.3s;--duration:10.7s;--drift:82px;--scale:1.05;--alpha:.52;--spin:640deg"></i><i class="mo-home-petal" style="--left:56%;--top:-26%;--delay:-9.0s;--duration:14.6s;--drift:-62px;--scale:.66;--alpha:.28;--spin:-590deg;--blur:.3px"></i><i class="mo-home-petal" style="--left:72%;--top:-11%;--delay:-5.1s;--duration:12.3s;--drift:52px;--scale:.88;--alpha:.43;--spin:550deg"></i><i class="mo-home-petal" style="--left:86%;--top:-19%;--delay:-11.0s;--duration:15.0s;--drift:-72px;--scale:.62;--alpha:.27;--spin:-620deg;--blur:.35px"></i><i class="mo-home-petal" style="--left:96%;--top:-6%;--delay:-7.4s;--duration:11.2s;--drift:-38px;--scale:.80;--alpha:.37;--spin:590deg"></i></div>`;
const hero = /(<section\b[^>]*class=["'][^"']*\bhomepage-hero-v2\b[^"']*["'][^>]*>)/i;
if (!hero.test(html)) throw new Error('homepage hero opening tag was not found');
html = html.replace(hero, `$1${layers}`);

const required = [RELEASE, `${ASSET_URL}?v=${CACHE}`, 'mo-home-clean-petal-fall', 'home-hero-stage', '立即訂位', '本週出勤'];
for (const marker of required) if (!html.includes(marker)) throw new Error(`missing final marker ${marker}`);
if ((html.match(/class="mo-home-static-bg"/g) || []).length !== 1) throw new Error('static background layer count is not one');
if ((html.match(/class="mo-home-motion-bg"/g) || []).length !== 1) throw new Error('motion background layer count is not one');
if ((html.match(/class="mo-home-petal"/g) || []).length !== 7) throw new Error('petal count is not seven');

fs.writeFileSync(HTML, html);
const asset = fs.readFileSync(ASSET);
const sha256 = crypto.createHash('sha256').update(asset).digest('hex');
const health = {
  ok: true,
  release: RELEASE,
  background: { path: ASSET_URL, width: meta.width, height: meta.height, bytes: asset.length, sha256, treatment: 'approved clean scene with scene clutter removed; no portrait retouching' },
  petals: { desktop: 7, mobile: 6, reducedMotion: 'hidden' },
  preserved: ['logo', 'booking button', 'weekly schedule', 'video stage']
};
fs.writeFileSync(path.join(DIST, 'health.json'), `${JSON.stringify(health, null, 2)}\n`);
console.log('MAGICOFFICE_CLEAN_SCENE_V2_OK', JSON.stringify(health));
