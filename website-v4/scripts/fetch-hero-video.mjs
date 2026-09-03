import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'content', 'hero-video-source.json'), 'utf8'));
const target = path.join(root, 'assets', 'video', manifest.filename);
const temp = `${target}.partial`;

function sha256(file) {
  const hash = crypto.createHash('sha256');
  const fd = fs.openSync(file, 'r');
  const buffer = Buffer.allocUnsafe(4 * 1024 * 1024);
  try {
    let bytes;
    do {
      bytes = fs.readSync(fd, buffer, 0, buffer.length, null);
      if (bytes) hash.update(buffer.subarray(0, bytes));
    } while (bytes);
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest('hex');
}

function validTarget() {
  return fs.existsSync(target) && fs.statSync(target).size === manifest.bytes && sha256(target) === manifest.sha256;
}

async function fetchPart(part) {
  const urls = [
    `https://drive.usercontent.google.com/download?id=${encodeURIComponent(part.id)}&export=download&confirm=t`,
    `https://drive.google.com/uc?export=download&id=${encodeURIComponent(part.id)}&confirm=t`,
  ];
  let lastError;
  for (const url of urls) {
    try {
      const response = await fetch(url, { redirect: 'follow' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('text/html')) throw new Error('Google Drive returned HTML instead of media bytes');
      const data = Buffer.from(await response.arrayBuffer());
      const digest = crypto.createHash('sha256').update(data).digest('hex');
      if (data.length !== part.bytes) throw new Error(`part ${part.order} size mismatch: ${data.length}`);
      if (digest !== part.sha256) throw new Error(`part ${part.order} sha256 mismatch`);
      return data;
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`Unable to download video part ${part.order}: ${lastError?.message || 'unknown error'}`);
}

if (validTarget()) {
  console.log(`Hero video already verified: ${manifest.filename}`);
  process.exit(0);
}

fs.mkdirSync(path.dirname(target), { recursive: true });
fs.rmSync(temp, { force: true });
const output = fs.openSync(temp, 'w');
try {
  for (const part of [...manifest.parts].sort((a, b) => a.order - b.order)) {
    const data = await fetchPart(part);
    fs.writeSync(output, data);
    console.log(`Downloaded video part ${part.order + 1}/${manifest.parts.length}`);
  }
} finally {
  fs.closeSync(output);
}

if (fs.statSync(temp).size !== manifest.bytes) throw new Error('Final hero video size mismatch');
if (sha256(temp) !== manifest.sha256) throw new Error('Final hero video sha256 mismatch');
fs.renameSync(temp, target);
console.log(`Hero video restored and verified: ${manifest.filename}`);
