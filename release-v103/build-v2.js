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
const EXPECTED_PATCH_SHA = 'cd0288a676f539efb0e2253895a8d19784307b33a130e12039c42f43b28fd5fe';
const EXPECTED_OVERLAY_SHA = '07071b91f7a9ccb98d1b3698e411b79d69e1824a025cb1304154178c9890050f';
const EXPECTED_TARGET_INDEX_SHA = '4674f616428f22669d74dc258dd99dc87543bf722901b249a7aaa597039bbd91';
const EXPECTED_TARGET_CSS_SHA = '24561ed8ae2f187aa3c68dc987ce6250a5f008e865a13247a6de67d3e4194af9';
const EXPECTED_TARGET_MANIFEST_SHA = '08ff45129ccfa8e71f3e000f6b4d2dc0fe39a8b553de3d8504d450cc5bfa20a8';
const SOURCE_OVERRIDES = Object.freeze({
  'README_UPLOAD.txt': { bytes: 718, sha256: '365a468f85d3e3771fa83497102fdf7df28f761540337df4643fe8e8cd32e3d8' },
  'assets/css/site-v2.0.6.css': { bytes: 103973, sha256: 'f2274be8c7a37127917c2f28c03026c1aed8b0a3d4574d3b753d2c6af7d65612' },
  'assets/js/mo-v206-build-marker-v2.0.6.js': { bytes: 338, sha256: '7dde257e0a10e67af0fd83a714690e084370215553f89b8919b1966b52c2d0eb' },
  'index.html': { bytes: 75046, sha256: '42fe7df9e30735206fe9ac989d348f0460e2dca926b48f4d75a825efc36655c3' }
});
const TARGET_VERCEL_JSON = `{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "cleanUrls": true,
  "trailingSlash": false,
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
        { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=()" },
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "X-MagicOffice-Version", "value": "new-domain-v1.0.3" }
      ]
    },
    {
      "source": "/assets/(.*)",
      "headers": [
        { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }
      ]
    },
    {
      "source": "/index.html",
      "headers": [
        { "key": "Cache-Control", "value": "public, max-age=0, must-revalidate" }
      ]
    },
    {
      "source": "/",
      "headers": [
        { "key": "Cache-Control", "value": "public, max-age=0, must-revalidate" }
      ]
    }
  ],
  "rewrites": [
    { "source": "/", "destination": "/index.html" }
  ]
}
`;

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
          'user-agent': 'MagicOffice-New-Domain-v1.0.3-release-builder/3.1'
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

function verifyBinaryInput(filePath, expectedSha) {
  if (!fs.existsSync(filePath)) fail(`Missing release input ${path.basename(filePath)}`);
  const buffer = fs.readFileSync(filePath);
  const actualSha = sha256(buffer);
  if (actualSha !== expectedSha) {
    fail(`Checksum mismatch for ${path.basename(filePath)}`, { expectedSha, actualSha, bytes: buffer.length });
  }
  return { bytes: buffer.length, sha256: actualSha };
}

function applyReleasePatch() {
  const patchFd = fs.openSync(PATCH_FILE, 'w');
  try {
    execFileSync('gzip', ['-dc', PATCH_GZ], { encoding: 'buffer', stdio: ['ignore', patchFd, 'inherit'] });
  } finally {
    fs.closeSync(patchFd);
  }
  execFileSync('patch', ['--batch', '--forward', '-p0', '-d', OUT, '-i', PATCH_FILE], { stdio: 'inherit' });
  execFileSync('tar', ['-xzf', OVERLAY, '-C', OUT], { stdio: 'inherit' });
  fs.writeFileSync(path.join(OUT, 'vercel.json'), TARGET_VERCEL_JSON, 'utf8');
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
  const binaryInputs = {
    patch: verifyBinaryInput(PATCH_GZ, EXPECTED_PATCH_SHA),
    overlay: verifyBinaryInput(OVERLAY, EXPECTED_OVERLAY_SHA)
  };
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  const oldManifestResponse = await fetchBytes('asset-manifest-v1.0.0.json', 'manifest-v100');
  const oldManifest = JSON.parse(oldManifestResponse.buffer.toString('utf8'));
  if (oldManifest.version !== '1.0.0-new-domain') fail('Unexpected source manifest version.', oldManifest.version);

  const fetchableSourceAssets = oldManifest.assets.filter(asset => asset.path !== 'vercel.json');
  const sourceFetches = await runPool(fetchableSourceAssets, 10, async (asset, index) => {
    const expected = SOURCE_OVERRIDES[asset.path] || asset;
    const result = await fetchBytes(asset.path, `v100-${index}`, expected);
    writeFile(asset.path, result.buffer);
    return { path: asset.path, bytes: result.buffer.length, sha256: sha256(result.buffer) };
  });

  applyReleasePatch();

  const manifestPath = path.join(OUT, 'asset-manifest-v1.0.3.json');
  if (!fs.existsSync(manifestPath)) fail('v1.0.3 manifest was not installed.');
  const manifestBuffer = fs.readFileSync(manifestPath);
  if (sha256(manifestBuffer) !== EXPECTED_TARGET_MANIFEST_SHA) fail('v1.0.3 manifest checksum mismatch.');
  const newManifest = JSON.parse(manifestBuffer.toString('utf8'));
  if (newManifest.version !== '1.0.3-new-domain') fail('Unexpected release manifest version.', newManifest.version);
  validateManifest(newManifest);
  const markers = validateReleaseMarkers();

  const indexBuffer = fs.readFileSync(path.join(OUT, 'index.html'));
  const cssBuffer = fs.readFileSync(path.join(OUT, 'assets/css/site-v2.0.6.css'));
  if (sha256(indexBuffer) !== EXPECTED_TARGET_INDEX_SHA) fail('Final index checksum mismatch.');
  if (sha256(cssBuffer) !== EXPECTED_TARGET_CSS_SHA) fail('Final CSS checksum mismatch.');

  const releaseFilesBeforeReport = [...new Set(newManifest.assets.map(asset => asset.path).concat('asset-manifest-v1.0.3.json'))];
  if (releaseFilesBeforeReport.length !== 98) fail('Unexpected v1.0.3 release file count.', releaseFilesBeforeReport.length);

  const report = {
    version: RELEASE_VERSION,
    generatedAt: new Date().toISOString(),
    sourceOrigin: SOURCE_ORIGIN,
    sourceVersion: oldManifest.version,
    sourceAssetCount: oldManifest.assets.length,
    sourceFetchedCount: sourceFetches.length,
    sourceSkippedPaths: ['vercel.json'],
    sourceOverridesValidated: SOURCE_OVERRIDES,
    binaryInputs,
    releaseManifestVersion: newManifest.version,
    releaseAssetCount: newManifest.assets.length,
    releaseFileCountBeforeReport: releaseFilesBeforeReport.length,
    releaseImageCount: newManifest.assets.filter(asset => String(asset.mime || '').startsWith('image/')).length,
    releaseTotalBytes: newManifest.assets.reduce((sum, asset) => sum + asset.bytes, 0),
    indexSha256: sha256(indexBuffer),
    cssSha256: sha256(cssBuffer),
    manifestSha256: sha256(manifestBuffer),
    markers,
    success: true
  };
  fs.writeFileSync(path.join(OUT, 'build-report.json'), JSON.stringify(report, null, 2));
  console.log('MAGICOFFICE_V103_RELEASE_BUILD_OK', JSON.stringify(report));
})().catch(error => {
  console.error('MAGICOFFICE_V103_RELEASE_BUILD_FAILED', error && error.stack ? error.stack : String(error));
  process.exit(1);
});
