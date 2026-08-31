import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';

const DIST = path.resolve('dist');
const HTML_FILE = path.join(DIST, 'index.html');
const SOURCE_FILE = path.join(DIST, 'assets/media/44049d5f46ae6a12.webp');
const OUTPUT_RELATIVE = '/assets/media/magicoffice-home-bg-visible-v2.webp';
const OUTPUT_FILE = path.join(DIST, OUTPUT_RELATIVE.replace(/^\//, ''));
const RELEASE = 'home-bg-visible-refinement-2026-09-01-v2';
const CACHE_KEY = '20260901-visible-v2';

if (!fs.existsSync(HTML_FILE)) throw new Error('Missing dist/index.html');
if (!fs.existsSync(SOURCE_FILE)) throw new Error('Missing original homepage background');

fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });

await sharp(SOURCE_FILE)
  .rotate()
  .modulate({ brightness: 1.14, saturation: 1.10 })
  .linear(1.065, -4)
  .sharpen({ sigma: 0.95, m1: 0.75, m2: 1.45, x1: 2, y2: 10, y3: 20 })
  .webp({ quality: 94, effort: 5, smartSubsample: true })
  .toFile(OUTPUT_FILE);

const metadata = await sharp(OUTPUT_FILE).metadata();
if (metadata.width !== 1000 || metadata.height !== 1333) {
  throw new Error(`Unexpected refined background size ${metadata.width}x${metadata.height}`);
}

let html = fs.readFileSync(HTML_FILE, 'utf8');

html = html
  .replace(/home-bg-beautified-petals-2026-09-01-v1/g, RELEASE)
  .replace(/\/assets\/media\/magicoffice-home-bg-beautified-v1\.webp\?v=[^"'<>\s]+/g, `${OUTPUT_RELATIVE}?v=${CACHE_KEY}`)
  .replace(/<style\s+id=["']magicoffice-home-visible-refinement-v2["']>[\s\S]*?<\/style>/gi, '')
  .replace(/<style\s+id=["']magicoffice-home-petal-scale-fix-v1["']>[\s\S]*?<\/style>/gi, '');

const petals = `<div class="mo-home-motion-bg" aria-hidden="true"><i class="mo-home-petal" style="--left:8%;--top:-16%;--delay:-1.0s;--duration:11.6s;--drift:86px;--scale:1.08;--alpha:.78;--spin:610deg;--sway:-16px"></i><i class="mo-home-petal" style="--left:24%;--top:-24%;--delay:-6.4s;--duration:14.0s;--drift:-62px;--scale:.78;--alpha:.58;--spin:-560deg;--blur:.15px;--sway:20px"></i><i class="mo-home-petal" style="--left:43%;--top:-12%;--delay:-3.2s;--duration:10.8s;--drift:104px;--scale:1.18;--alpha:.84;--spin:690deg;--sway:-24px"></i><i class="mo-home-petal" style="--left:62%;--top:-26%;--delay:-9.0s;--duration:14.8s;--drift:-76px;--scale:.72;--alpha:.52;--spin:-640deg;--blur:.25px;--sway:18px"></i><i class="mo-home-petal" style="--left:80%;--top:-10%;--delay:-5.0s;--duration:12.2s;--drift:72px;--scale:1.00;--alpha:.72;--spin:590deg;--sway:-18px"></i><i class="mo-home-petal" style="--left:94%;--top:-28%;--delay:-11.0s;--duration:15.6s;--drift:-92px;--scale:.66;--alpha:.46;--spin:-700deg;--blur:.35px;--sway:22px"></i></div>`;

if (!/<div\s+class=["']mo-home-motion-bg["'][^>]*>[\s\S]*?<\/div>/i.test(html)) {
  throw new Error('Missing homepage petal layer');
}
html = html.replace(/<div\s+class=["']mo-home-motion-bg["'][^>]*>[\s\S]*?<\/div>/i, petals);

const style = `<style id="magicoffice-home-visible-refinement-v2">
.homepage-hero-v2{background:#090607!important}
.mo-home-static-bg{background:#090607!important}
.mo-home-static-bg::before{content:""!important;display:block!important;position:absolute!important;inset:0!important;z-index:1!important;pointer-events:none!important;background:radial-gradient(circle at 78% 13%,rgba(255,213,225,.22) 0%,rgba(255,191,211,.10) 18%,transparent 38%),radial-gradient(circle at 44% 70%,rgba(151,40,70,.20) 0%,transparent 44%),linear-gradient(180deg,rgba(255,255,255,.035),transparent 34%)!important}
.mo-home-static-bg-image{object-position:68% 28%!important;filter:saturate(1.08) brightness(1.02) contrast(1.08)!important;transform:translateZ(0) scale(1.012)!important}
.mo-home-static-bg-shade{z-index:2!important;background:linear-gradient(90deg,rgba(5,4,5,.46) 0%,rgba(8,5,6,.24) 36%,rgba(8,5,6,.07) 72%,rgba(5,4,5,.18) 100%),linear-gradient(to top,rgba(7,4,6,.50) 0%,rgba(7,4,6,.12) 35%,transparent 58%)!important}
.mo-home-motion-bg{z-index:2!important;opacity:1!important;mix-blend-mode:screen!important}
.mo-home-petal{display:block!important;width:22px!important;height:13px!important;border-radius:95% 8% 95% 8%!important;background:linear-gradient(145deg,rgba(255,232,239,.98) 0%,rgba(236,153,177,.95) 47%,rgba(154,55,84,.90) 100%)!important;box-shadow:0 0 8px rgba(255,183,205,.42),inset 2px 1px 2px rgba(255,255,255,.42)!important;opacity:var(--alpha,.68)!important;filter:blur(var(--blur,0px))!important;will-change:transform,opacity!important;animation:mo-home-petal-fall-visible var(--duration,12s) linear var(--delay,0s) infinite!important}
.mo-home-petal::after{content:"";position:absolute;left:48%;top:12%;width:1px;height:72%;background:rgba(118,32,56,.45);transform:rotate(34deg);transform-origin:center}
@keyframes mo-home-petal-fall-visible{0%{transform:translate3d(0,-110px,0) rotate(0deg) scale(var(--scale,1));opacity:0}8%{opacity:var(--alpha,.68)}46%{transform:translate3d(var(--sway,0px),420px,0) rotate(calc(var(--spin,560deg) * .46)) scale(var(--scale,1))}100%{transform:translate3d(var(--drift,70px),980px,0) rotate(var(--spin,560deg)) scale(var(--scale,1));opacity:.08}}
.homepage-hero-v2>.home-hero-shell{position:relative!important;z-index:4!important}
@media(max-width:960px){.mo-home-static-bg-image{object-position:63% 24%!important;filter:saturate(1.04) brightness(.94) contrast(1.06)!important}.mo-home-static-bg::before{background:radial-gradient(circle at 73% 12%,rgba(255,213,225,.17),transparent 36%),radial-gradient(circle at 48% 72%,rgba(151,40,70,.15),transparent 42%)!important}.mo-home-static-bg-shade{background:linear-gradient(to top,rgba(5,4,5,.66) 2%,rgba(7,5,6,.26) 54%,rgba(7,5,6,.05)),linear-gradient(90deg,rgba(5,4,5,.20),transparent 72%)!important}.mo-home-motion-bg{opacity:.92!important}.mo-home-petal{width:17px!important;height:10px!important;box-shadow:0 0 6px rgba(255,183,205,.34)!important}@keyframes mo-home-petal-fall-visible{0%{transform:translate3d(0,-90px,0) rotate(0deg) scale(var(--scale,1));opacity:0}8%{opacity:var(--alpha,.68)}46%{transform:translate3d(var(--sway,0px),340px,0) rotate(calc(var(--spin,560deg) * .46)) scale(var(--scale,1))}100%{transform:translate3d(var(--drift,55px),760px,0) rotate(var(--spin,560deg)) scale(var(--scale,1));opacity:.08}}}
@media(prefers-reduced-motion:reduce){.mo-home-motion-bg{display:none!important}.mo-home-static-bg-image{transform:none!important}}
</style>`;

if (!html.includes('</head>')) throw new Error('Missing </head> during visible refinement');
html = html.replace('</head>', `${style}</head>`);

const petalCount = (html.match(/class="mo-home-petal"/g) || []).length;
if (petalCount !== 6) throw new Error(`Expected 6 petals, found ${petalCount}`);
if (!html.includes(`${OUTPUT_RELATIVE}?v=${CACHE_KEY}`)) throw new Error('Refined background URL was not inserted');
if (!html.includes(RELEASE)) throw new Error('Refinement release marker was not inserted');

fs.writeFileSync(HTML_FILE, html);

const backgroundBuffer = fs.readFileSync(OUTPUT_FILE);
const backgroundSha = crypto.createHash('sha256').update(backgroundBuffer).digest('hex');
const healthFile = path.join(DIST, 'health.json');
let health = {};
if (fs.existsSync(healthFile)) {
  try { health = JSON.parse(fs.readFileSync(healthFile, 'utf8')); } catch {}
}
health.ok = true;
health.release = RELEASE;
health.background = {
  path: OUTPUT_RELATIVE,
  bytes: backgroundBuffer.length,
  sha256: backgroundSha,
  width: metadata.width,
  height: metadata.height,
  treatment: {
    brightness: 1.14,
    saturation: 1.10,
    contrast: 1.065,
    sharpenSigma: 0.95,
    webpQuality: 94
  }
};
health.petals = 6;
health.visualChange = 'stronger background separation, reduced dark veil, brighter six-petal motion';
fs.writeFileSync(healthFile, `${JSON.stringify(health, null, 2)}\n`);

console.log('MAGICOFFICE_VISIBLE_REFINEMENT_V2_OK', JSON.stringify({
  release: RELEASE,
  background: OUTPUT_RELATIVE,
  bytes: backgroundBuffer.length,
  sha256: backgroundSha,
  petals: petalCount
}));
