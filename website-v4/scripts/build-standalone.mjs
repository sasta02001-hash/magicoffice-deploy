import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const sourcePath = path.join(DIST, 'index.html');
const outputPath = path.join(DIST, 'MagicOffice_PRODUCTION_READY_v2_STANDALONE.html');

const mime = (file) => ({
  '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf',
})[path.extname(file).toLowerCase()] || 'application/octet-stream';
const uri = (file) => `data:${mime(file)};base64,${fs.readFileSync(file).toString('base64')}`;
const escapeScript = (text) => text.replace(/<\/script/gi, '<\\/script');
const escapeStyle = (text) => text.replace(/<\/style/gi, '<\\/style');

let html = fs.readFileSync(sourcePath, 'utf8');
const cssFile = path.join(DIST, 'assets/css/site.css');
let css = fs.readFileSync(cssFile, 'utf8');
css = css.replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi, (whole, quote, raw) => {
  if (/^(?:data:|https?:|#)/i.test(raw)) return whole;
  const resolved = path.resolve(path.dirname(cssFile), raw.split('?')[0]);
  return fs.existsSync(resolved) ? `url("${uri(resolved)}")` : whole;
});
html = html.replace(/<link\b(?=[^>]*\brel=["']stylesheet["'])[^>]*\bhref=["']assets\/css\/site\.css[^"']*["'][^>]*>/i, `<style id="mo-standalone-css">${escapeStyle(css)}</style>`);

const jsFile = path.join(DIST, 'assets/js/app.js');
const js = fs.readFileSync(jsFile, 'utf8');
html = html.replace(/<script\b[^>]*\bsrc=["']assets\/js\/app\.js[^"']*["'][^>]*>\s*<\/script>/i, `<script id="mo-standalone-js">${escapeScript(js)}</script>`);

const assetFiles = [];
const walk = (folder) => {
  for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    const file = path.join(folder, entry.name);
    if (entry.isDirectory()) walk(file);
    else assetFiles.push(file);
  }
};
walk(path.join(DIST, 'assets'));
assetFiles.sort((a, b) => b.length - a.length);
for (const file of assetFiles) {
  if (file === cssFile || file === jsFile) continue;
  const relative = path.relative(DIST, file).replaceAll('\\', '/');
  const data = uri(file);
  html = html.split(relative).join(data);
}

const manifestPath = path.join(DIST, 'site.webmanifest');
if (fs.existsSync(manifestPath)) html = html.split('site.webmanifest').join(uri(manifestPath));
html = html.replace('<html ', '<html data-delivery="single-file-backup" ');
html = html.replace('</head>', '<meta name="x-magicoffice-standalone" content="offline-backup-v2.1"/></head>');

if (/<link\b[^>]*rel=["']stylesheet/i.test(html)) throw new Error('Standalone still contains external stylesheet');
if (/<script\b[^>]*src=["'][^"']+/i.test(html)) throw new Error('Standalone still contains external script');
if (/\b(?:src|poster)=["']assets\//i.test(html)) throw new Error('Standalone still contains local media references');
if (!html.includes('data:video/mp4;base64,')) throw new Error('Standalone video was not embedded');
if (!html.includes('data:image/webp;base64,')) throw new Error('Standalone images were not embedded');

fs.writeFileSync(outputPath, html);
const report = {
  generatedAt: new Date().toISOString(),
  file: path.basename(outputPath),
  bytes: Buffer.byteLength(html),
  sha256: crypto.createHash('sha256').update(html).digest('hex'),
  purpose: '完整離線預覽／備份；正式營運請使用模組化 Vercel 專案以保留即時同步。',
};
fs.writeFileSync(path.join(DIST, 'standalone-report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
