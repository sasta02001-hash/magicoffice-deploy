const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const RELEASE_VERSION = 'new-domain-v1.0.3';
const SOURCE_ORIGIN = (process.env.MAGICOFFICE_RELEASE_SOURCE || 'https://magicoffice.vercel.app').replace(/\/$/, '');
const ROOT = process.cwd();
const OUT = path.join(ROOT, 'public');
const PATCH_GZ = path.join(ROOT, 'runtime-relative.patch.gz');
const PATCH_FILE = path.join(ROOT, 'runtime-relative.patch');
const OVERLAY = path.join(ROOT, 'v103-small-overlay.tar.gz');

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function fail(message, details) {
  if (details !== undefined) console.error('DETAILS', JSON.stringify(details));
  throw new Error(message);
}

async function fetchBytes(relativePath, cacheKey, expected = null) {
  let lastError;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const joiner = relativePath.includes('?') ? '&' : '?';
    const url = `${SOURCE_ORIGIN}/${relativePath}${joiner}mo-release=${cacheKey}-${attempt}-${Date.now()}`;
    try {
      const response = await fetch(url, {
        redirect: 'follow',
        cache: 'no-store',
        headers: {
          'cache-control': 'no-cache',
          'user-agent': 'MagicOffice-New-Domain-v1.0.3-release-builder/3.0'
        }
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const buffer = Buffer.from(await response.arrayBuffer());
      if (expected) {
        const actualSha = sha256(buffer);
        if (buffer.length !== expected.bytes || actualSha !== expected.sha256) {
          throw new Error(`Expected ${expected.bytes}/${expected.sha256}, received ${buffer.length}/${actualSha}`);
        }
      }
      return { buffer, contentType: response.headers.get('content-type') || '', finalUrl: response.url };
    } catch (error) {
      lastError = error;
      if (attempt < 5) await new Promise(resolve => setTimeout(resolve, attempt * 450));
    }
  }
  fail(`Unable to fetch ${relativePath}`, { error: String(lastError) });
}

async function runPool(items, limit, worker) {
  let cursor = 0;
  const results = new Array(items.length);
  async function runner() {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runner));
  return results;
}

function writeFile(relativePath, buffer) {
  const destination = path.join(OUT, relativePath);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, buffer);
}

function reconstructChunked(prefix, destination) {
  if (fs.existsSync(destination)) return;
  const pattern = new RegExp(`^${prefix}-\\d+\\.b64$`);
  const chunks = fs.readdirSync(ROOT).filter(name => pattern.test(name)).sort();
  if (!chunks.length) fail(`Missing ${path.basename(destination)} and ${prefix}-XX.b64 chunks.`);
  const encoded = chunks.map(name => fs.readFileSync(path.join(ROOT, name), 'utf8')).join('').replace(/\s+/g, '');
  fs.writeFileSync(destination, Buffer.from(encoded, 'base64'));
}

function verifyBinaryInputs() {
  reconstructChunked('patch', PATCH_GZ);
  reconstructChunked('overlay', OVERLAY);
  const expected = {
    [PATCH_GZ]: 'cd0288a676f539efb0e2253895a8d19784307b33a130e12039c42f43b28fd5fe',
    [OVERLAY]: '07071b91f7a9ccb98d1b3698e411b79d69e1824a025cb1304154178c9890050f'
  };
  const result = {};
  for (const [filePath, expectedSha] of Object.entries(expected)) {
    if (!fs.existsSync(filePath)) fail(`Missing release input ${path.basename(filePath)}`);
    const buffer = fs.readFileSync(filePath);
    const actualSha = sha256(buffer);
    if (actualSha !== expectedSha) fail(`Checksum mismatch for ${path.basename(filePath)}`, { expectedSha, actualSha, bytes: buffer.length });
    result[path.basename(filePath)] = { bytes: buffer.length, sha256: actualSha };
  }
  return result;
}

function applyReleasePatch() {
  execFileSync('gzip', ['-dc', PATCH_GZ], { encoding: 'buffer', stdio: ['ignore', fs.openSync(PATCH_FILE, 'w'), 'inherit'] });
  execFileSync('patch', ['--batch', '--forward', '-p0', '-d', OUT, '-i', PATCH_FILE], { stdio: 'inherit' });
  execFileSync('tar', ['-xzf', OVERLAY, '-C', OUT], { stdio: 'inherit' });
  fs.rmSync(path.join(OUT, 'asset-manifest-v1.0.0.json'), { force: true });
}

function validateManifest(manifest) {
  const problems = [];
  for (const asset of manifest.assets) {
    const filePath = path.join(OUT, asset.path);
    if (!fs.existsSync(filePath)) {
      problems.push({ path: asset.path, reason: 'missing' });
      continue;
    }
    const buffer = fs.readFileSync(filePath);
    const actualSha = sha256(buffer);
    if (buffer.length !== asset.bytes || actualSha !== asset.sha256) {
      problems.push({
        path: asset.path,
        reason: 'mismatch',
        expectedBytes: asset.bytes,
        actualBytes: buffer.length,
        expectedSha256: asset.sha256,
        actualSha256: actualSha
      });
    }
  }
  if (problems.length) fail('v1.0.3 final asset validation failed.', problems.slice(0, 30));
}

function validateReleaseMarkers() {
  const html = fs.readFileSync(path.join(OUT, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(OUT, 'assets/css/site-v2.0.6.css'), 'utf8');
  const markers = {
    htmlVersion: html.includes('data-magic-office-version="1.0.3"'),
    bodyVersion: html.includes('data-site-version="new-domain-v1.0.3"'),
    brand: html.includes('魔幻姶仕社'),
    jubiTime: html.includes('19:00–02:00'),
    magicBar: html.includes('浮世繪夜雪・魔幻酒吧'),
    storyBreak: html.includes('故事，從走進來的'),
    firstVisitBreak: html.includes('第一次來，'),
    footerVersion: html.includes('New Domain v1.0.3'),
    officialCanonical: html.includes('https://magicoffice.vercel.app/'),
    oldVersionRemoved: !html.includes('v2.0 LOCKED'),
    typographyCss: css.includes('MagicOffice New Domain v1.0.3'),
    noRepoRuntimeAssets: !/raw\.githubusercontent\.com\/sasta02001-hash\/magicoffice-deploy|cdn\.jsdelivr\.net\/gh\/sasta02001-hash\/magicoffice-deploy/i.test(html)
  };
  if (!Object.values(markers).every(Boolean)) fail('Required v1.0.3 release markers are missing.', markers);
  return markers;
}

(async () => {
  const binaryInputs = verifyBinaryInputs();
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  const oldManifestResponse = await fetchBytes('asset-manifest-v1.0.0.json', 'manifest-v100');
  const oldManifest = JSON.parse(oldManifestResponse.buffer.toString('utf8'));
  if (oldManifest.version !== '1.0.0-new-domain') fail('Unexpected source manifest version.', oldManifest.version);

  const sourceFetches = await runPool(oldManifest.assets, 10, async (asset, index) => {
    const result = await fetchBytes(asset.path, `v100-${index}`, asset);
    writeFile(asset.path, result.buffer);
    return { path: asset.path, bytes: result.buffer.length, sha256: asset.sha256 };
  });

  applyReleasePatch();

  const manifestPath = path.join(OUT, 'asset-manifest-v1.0.3.json');
  if (!fs.existsSync(manifestPath)) fail('v1.0.3 manifest was not installed.');
  const newManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (newManifest.version !== '1.0.3-new-domain') fail('Unexpected release manifest version.', newManifest.version);
  validateManifest(newManifest);
  const markers = validateReleaseMarkers();

  const report = {
    version: RELEASE_VERSION,
    generatedAt: new Date().toISOString(),
    sourceOrigin: SOURCE_ORIGIN,
    sourceVersion: oldManifest.version,
    sourceAssetCount: oldManifest.assets.length,
    sourceFetchedCount: sourceFetches.length,
    binaryInputs,
    releaseManifestVersion: newManifest.version,
    releaseAssetCount: newManifest.assets.length,
    releaseImageCount: newManifest.assets.filter(asset => String(asset.mime || '').startsWith('image/')).length,
    releaseTotalBytes: newManifest.assets.reduce((sum, asset) => sum + asset.bytes, 0),
    indexSha256: sha256(fs.readFileSync(path.join(OUT, 'index.html'))),
    cssSha256: sha256(fs.readFileSync(path.join(OUT, 'assets/css/site-v2.0.6.css'))),
    markers,
    success: true
  };
  fs.writeFileSync(path.join(OUT, 'build-report.json'), JSON.stringify(report, null, 2));
  console.log('MAGICOFFICE_V103_RELEASE_BUILD_OK', JSON.stringify(report));
})().catch(error => {
  console.error('MAGICOFFICE_V103_RELEASE_BUILD_FAILED', error && error.stack ? error.stack : String(error));
  process.exit(1);
});
