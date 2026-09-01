import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const SOURCE_HTML = path.resolve('assets/home-hero-preview-v3/preview.html');
const POSTER_FILE = path.resolve('assets/home-hero-preview-v3/magicoffice-home-video-poster-v1.webp');
const DESKTOP_BG_FILE = path.resolve('assets/home-clean-scene-desktop-v1/magicoffice-home-clean-scene-desktop-v1.webp');
const VIDEO_FILE = path.resolve('assets/production-trial-video/MagicOffice_home_trial_720p_12s_v1.mp4');
const OUTPUT_DIR = path.resolve('assets/production-home-video-v3');
const OUTPUT_HTML = path.join(OUTPUT_DIR, 'MagicOffice_home_video_v3.html');
const OUTPUT_INDEX = path.join(OUTPUT_DIR, 'index.html');
const OFFICIAL = new URL('https://magicoffice.vercel.app/');
const RELEASE = 'home-video-wordmark-12s-2026-09-01-v3';
const EXPECTED_VIDEO = {
  bytes: 3016896,
  sha256: '2251aa3eb1d386a4d3a889ab147f7a212838e7f1c56bcac018e92fb44bc5f7b1',
};

const requestHeaders = {
  'user-agent': 'Mozilla/5.0 (compatible; MagicOffice-Production-Builder/3.0)',
  'cache-control': 'no-cache',
  pragma: 'no-cache',
};

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function extensionMime(pathname, fallback = 'application/octet-stream') {
  const ext = path.extname(pathname).toLowerCase();
  return ({
    '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json',
    '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon',
    '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf',
    '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg',
  })[ext] || fallback;
}

function dataUri(buffer, mime) {
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

function escapeInlineScript(text) {
  return text.replace(/<\/script/gi, '<\\/script');
}

function escapeInlineStyle(text) {
  return text.replace(/<\/style/gi, '<\\/style');
}

function normalizeAssetUrl(raw, base = OFFICIAL) {
  if (!raw) return null;
  const value = String(raw).trim().replace(/^['"]|['"]$/g, '');
  if (!value || /^(?:data:|blob:|javascript:|mailto:|tel:|#)/i.test(value)) return null;
  let url;
  try { url = new URL(value, base); } catch { return null; }
  if (url.host !== OFFICIAL.host) return null;
  if (!(url.pathname.startsWith('/assets/') || url.pathname === '/site.webmanifest')) return null;
  url.hash = '';
  return url;
}

function extractOfficialAssetUrls(text, base = OFFICIAL) {
  const urls = new Map();
  const add = (raw) => {
    const url = normalizeAssetUrl(raw, base);
    if (!url) return;
    const key = `${url.pathname}${url.search}`;
    if (!urls.has(key)) urls.set(key, url);
  };

  for (const match of text.matchAll(/https:\/\/magicoffice\.vercel\.app\/(?:assets\/|site\.webmanifest)[^\s"'<>)]*/gi)) add(match[0]);
  for (const match of text.matchAll(/(?:^|["'(`=\s])((?:\/assets\/|\/site\.webmanifest)[^\s"'<>)]*)/gim)) add(match[1]);
  for (const match of text.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) add(match[1]);
  for (const match of text.matchAll(/(?:src|href|poster|content)\s*=\s*["']([^"']+)["']/gi)) add(match[1]);
  for (const match of text.matchAll(/srcset\s*=\s*["']([^"']+)["']/gi)) {
    for (const part of match[1].split(',')) add(part.trim().split(/\s+/)[0]);
  }
  return [...urls.values()];
}

async function fetchAsset(url, retries = 5) {
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url.href, { headers: requestHeaders, redirect: 'follow' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const finalUrl = new URL(response.url);
      if (finalUrl.host !== OFFICIAL.host) throw new Error(`unexpected redirect to ${finalUrl.host}`);
      const buffer = Buffer.from(await response.arrayBuffer());
      if (!buffer.length) throw new Error('empty response');
      const typeHeader = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      const mime = typeHeader || extensionMime(url.pathname);
      const head = buffer.subarray(0, 160).toString('utf8').trimStart().toLowerCase();
      const expectedBinary = /\.(?:png|jpe?g|webp|gif|ico|woff2?|ttf|otf|mp4|webm|mp3)$/i.test(url.pathname);
      if (expectedBinary && (head.startsWith('<!doctype html') || head.startsWith('<html'))) {
        throw new Error('binary asset resolved to HTML');
      }
      if ((url.pathname.endsWith('.css') || url.pathname.endsWith('.js')) && (head.startsWith('<!doctype html') || head.startsWith('<html'))) {
        throw new Error('text asset resolved to HTML');
      }
      return { url, finalUrl, buffer, mime };
    } catch (error) {
      lastError = error;
      if (attempt < retries) await new Promise((resolve) => setTimeout(resolve, 800 * attempt));
    }
  }
  throw new Error(`Failed to fetch ${url.href}: ${lastError?.message || lastError}`);
}

function replacementForms(record) {
  const { url } = record;
  const forms = new Set([
    url.href,
    `${url.origin}${url.pathname}${url.search}`,
    `${url.origin}${url.pathname}`,
    `${url.pathname}${url.search}`,
    url.pathname,
  ]);
  return [...forms].sort((a, b) => b.length - a.length);
}

function replaceAllLiteral(text, search, replacement) {
  return search ? text.split(search).join(replacement) : text;
}

function applyBinaryReplacements(text, binaryRecords) {
  let output = text;
  const ordered = [...binaryRecords].sort((a, b) => {
    const aLen = Math.max(...replacementForms(a).map((item) => item.length));
    const bLen = Math.max(...replacementForms(b).map((item) => item.length));
    return bLen - aLen;
  });
  for (const record of ordered) {
    const uri = dataUri(record.buffer, record.mime);
    for (const form of replacementForms(record)) output = replaceAllLiteral(output, form, uri);
  }
  return output;
}

function removeScriptById(html, id) {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return html.replace(new RegExp(`<script\\b(?=[^>]*\\bid=["']${escaped}["'])[^>]*>[\\s\\S]*?<\\/script>`, 'gi'), '');
}

async function main() {
  for (const required of [SOURCE_HTML, POSTER_FILE, DESKTOP_BG_FILE, VIDEO_FILE]) {
    if (!fs.existsSync(required)) throw new Error(`Missing required source: ${required}`);
  }

  fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  let html = fs.readFileSync(SOURCE_HTML, 'utf8');
  const poster = fs.readFileSync(POSTER_FILE);
  const desktopBg = fs.readFileSync(DESKTOP_BG_FILE);
  const video = fs.readFileSync(VIDEO_FILE);
  if (video.length !== EXPECTED_VIDEO.bytes || sha256(video) !== EXPECTED_VIDEO.sha256) {
    throw new Error(`Trial video verification failed bytes=${video.length} sha256=${sha256(video)}`);
  }

  const records = new Map();
  const queue = extractOfficialAssetUrls(html);
  const queued = new Set(queue.map((url) => `${url.pathname}${url.search}`));
  while (queue.length) {
    const url = queue.shift();
    const key = `${url.pathname}${url.search}`;
    if (records.has(key)) continue;
    const record = await fetchAsset(url);
    records.set(key, record);
    const ext = path.extname(url.pathname).toLowerCase();
    const isText = record.mime.startsWith('text/') || ['.css', '.js', '.json', '.webmanifest', '.svg'].includes(ext);
    if (isText) {
      const text = record.buffer.toString('utf8');
      for (const nested of extractOfficialAssetUrls(text, record.finalUrl)) {
        const nestedKey = `${nested.pathname}${nested.search}`;
        if (!records.has(nestedKey) && !queued.has(nestedKey)) {
          queued.add(nestedKey);
          queue.push(nested);
        }
      }
    }
  }

  const textRecords = [...records.values()].filter((record) => {
    const ext = path.extname(record.url.pathname).toLowerCase();
    return record.mime.startsWith('text/') || ['.css', '.js', '.json', '.webmanifest', '.svg'].includes(ext);
  });
  const binaryRecords = [...records.values()].filter((record) => !textRecords.includes(record));

  const specialBinary = [
    {
      url: new URL('https://raw.githubusercontent.com/sasta02001-hash/magicoffice-deploy/main/assets/home-hero-preview-v3/magicoffice-home-video-poster-v1.webp'),
      buffer: poster,
      mime: 'image/webp',
    },
    {
      url: new URL('https://raw.githubusercontent.com/sasta02001-hash/magicoffice-deploy/main/assets/home-clean-scene-desktop-v1/magicoffice-home-clean-scene-desktop-v1.webp'),
      buffer: desktopBg,
      mime: 'image/webp',
    },
  ];
  const allBinary = [...binaryRecords, ...specialBinary];

  html = html.replace(/<link\b(?=[^>]*\brel=["']preload["'])[^>]*>/gi, '');

  const stylesheetTags = [...html.matchAll(/<link\b[^>]*>/gi)].map((match) => match[0]).filter((tag) => {
    const rel = tag.match(/\brel=["']([^"']+)["']/i)?.[1] || '';
    const href = tag.match(/\bhref=["']([^"']+)["']/i)?.[1] || '';
    return /(?:^|\s)stylesheet(?:\s|$)/i.test(rel) && normalizeAssetUrl(href);
  });
  for (const tag of stylesheetTags) {
    const href = tag.match(/\bhref=["']([^"']+)["']/i)?.[1];
    const url = normalizeAssetUrl(href);
    const key = `${url.pathname}${url.search}`;
    const record = records.get(key) || records.get(url.pathname);
    if (!record) throw new Error(`Missing fetched stylesheet ${href}`);
    let css = record.buffer.toString('utf8');
    css = applyBinaryReplacements(css, allBinary);
    html = html.replace(tag, `<style data-inline-source="${url.pathname}">${escapeInlineStyle(css)}</style>`);
  }

  const deferredScripts = [];
  const scriptTags = [...html.matchAll(/<script\b[^>]*\bsrc=["'][^"']+["'][^>]*>[\s\S]*?<\/script>/gi)].map((match) => match[0]);
  for (const tag of scriptTags) {
    const src = tag.match(/\bsrc=["']([^"']+)["']/i)?.[1];
    const url = normalizeAssetUrl(src);
    if (!url) continue;
    const key = `${url.pathname}${url.search}`;
    const record = records.get(key) || records.get(url.pathname);
    if (!record) throw new Error(`Missing fetched script ${src}`);
    let code = record.buffer.toString('utf8');
    code = applyBinaryReplacements(code, allBinary);
    deferredScripts.push(`\n/* inline:${url.pathname} */\n${escapeInlineScript(code)}\n`);
    html = html.replace(tag, '');
  }

  for (const id of [
    'homepage-integrated-hero-v1-js',
    'magicoffice-home-hero-refine-v1-js',
    'magicoffice-home-hero-patch-script-v1',
    'magicoffice-home-video-safe-v2-js',
    'magicoffice-home-video-controller-v3',
  ]) html = removeScriptById(html, id);

  const videoUri = dataUri(video, 'video/mp4');
  const videoMarkup = `<video class="home-hero-trial-video" muted loop playsinline webkit-playsinline preload="auto" aria-label="MagicOffice 試播影片" src="${videoUri}"></video>`;
  const mountPattern = /(<([a-z0-9]+)\b[^>]*\bdata-home-video-mount\b[^>]*>)[\s\S]*?(<\/\2>)/i;
  if (!mountPattern.test(html)) throw new Error('Could not locate data-home-video-mount');
  html = html.replace(mountPattern, `$1${videoMarkup}$3`);

  const stagePattern = /<([a-z0-9]+)\b([^>]*\bclass=["'][^"']*\bhomepage-cinema-stage\b[^"']*["'][^>]*)>/i;
  const stageMatch = html.match(stagePattern);
  if (!stageMatch) throw new Error('Could not locate homepage cinema stage');
  let stageAttributes = stageMatch[2]
    .replace(/\sdata-video-ready=["'][^"']*["']/gi, '')
    .replace(/\sdata-video-playable=["'][^"']*["']/gi, '')
    .replace(/\sdata-video-error=["'][^"']*["']/gi, '');
  html = html.replace(stagePattern, `<${stageMatch[1]}${stageAttributes} data-video-ready="false" data-video-playable="false" data-video-error="false">`);

  html = html.replace(
    '.homepage-cinema-stage[data-video-ready="true"] .home-video-wordmark,.homepage-cinema-stage[data-video-playable="true"] .home-video-wordmark',
    '.homepage-cinema-stage[data-video-ready="true"] .home-video-wordmark',
  );

  html = applyBinaryReplacements(html, allBinary);
  for (const record of textRecords.filter((item) => item.url.pathname === '/site.webmanifest')) {
    const manifestUri = dataUri(record.buffer, record.mime || 'application/manifest+json');
    for (const form of replacementForms(record)) html = replaceAllLiteral(html, form, manifestUri);
  }

  html = html.replace(/<meta\b(?=[^>]*\bname=["']robots["'])[^>]*>/gi, '');
  html = html.replace(/<meta\b(?=[^>]*\bname=["']x-magicoffice-preview-release["'])[^>]*>/gi, '');
  html = html.replace(/<meta\b(?=[^>]*\bname=["']x-magicoffice-preview["'])[^>]*>/gi, '');
  html = html.replace(/<meta\b(?=[^>]*\bname=["']production-promotion["'])[^>]*>/gi, '');
  html = html.replace(/<meta\b(?=[^>]*\bname=["']site-version["'])[^>]*>/gi, '');
  html = html.replace(/<meta\b(?=[^>]*\bname=["']verified-deployment["'])[^>]*>/gi, '');
  html = html.replace(/<meta\b(?=[^>]*\bname=["']x-magicoffice-production-release["'])[^>]*>/gi, '');
  html = html.replace('</head>', `<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1"/><meta name="site-version" content="${RELEASE}"/><meta name="verified-deployment" content="${RELEASE}"/><meta name="x-magicoffice-production-release" content="${RELEASE}"/><meta name="production-promotion" content="production-ready"/></head>`, 1);
  html = html.replace(/data-site-version=["'][^"']*["']/i, `data-site-version="${RELEASE}"`);
  html = html.replace(/data-build-format=["'][^"']*["']/i, 'data-build-format="self-contained-production"');

  const finalCss = `<style id="magicoffice-home-video-production-v3-css">
.homepage-cinema-stage.home-hero-stage{background:#170b10!important;isolation:isolate!important}
.homepage-cinema-stage .home-video-poster{z-index:1!important;opacity:1!important;visibility:visible!important;background:#170b10!important;transition:opacity .32s ease,visibility .32s ease!important}
.homepage-cinema-stage [data-home-video-mount]{z-index:2!important;opacity:0!important;visibility:hidden!important;background:transparent!important;transition:opacity .32s ease,visibility .32s ease!important}
.homepage-cinema-stage [data-home-video-mount] video{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;display:block!important;object-fit:cover!important;object-position:center!important;background:transparent!important}
.homepage-cinema-stage .home-video-wordmark{z-index:3!important}
.homepage-cinema-stage[data-video-ready="true"] .home-video-poster,.homepage-cinema-stage[data-video-ready="true"] .home-video-wordmark{opacity:0!important;visibility:hidden!important}
.homepage-cinema-stage[data-video-ready="true"] [data-home-video-mount]{opacity:1!important;visibility:visible!important}
.homepage-cinema-stage[data-video-ready="false"] [data-home-video-mount]{opacity:0!important;visibility:hidden!important}
.homepage-cinema-stage[data-video-playable="true"] .cinema-fullscreen-button{display:grid!important;opacity:.88!important;pointer-events:auto!important}
.homepage-cinema-stage[data-video-playable="false"] .cinema-fullscreen-button{display:none!important}
@media(prefers-reduced-motion:reduce){.homepage-cinema-stage .home-video-poster,.homepage-cinema-stage [data-home-video-mount],.homepage-cinema-stage .home-video-wordmark{transition:none!important}}
</style>`;
  html = html.replace('</head>', `${finalCss}</head>`, 1);

  const controller = `<script id="magicoffice-home-video-controller-v3">
(function(){
  function init(){
    var stage=document.querySelector('.homepage-cinema-stage.home-hero-stage,.homepage-cinema-stage');
    if(!stage)return;
    var mount=stage.querySelector('[data-home-video-mount]');
    var video=mount&&mount.querySelector('video');
    var fullscreen=stage.querySelector('.cinema-fullscreen-button');
    var fallbackMode=new URLSearchParams(location.search).get('moFallback')==='1';
    var setState=function(ready,playable,error){
      stage.dataset.videoReady=ready?'true':'false';
      stage.dataset.videoPlayable=playable?'true':'false';
      stage.dataset.videoError=error?'true':'false';
      if(mount)mount.setAttribute('aria-hidden',ready?'false':'true');
    };
    setState(false,false,false);
    if(video){
      video.muted=true;video.defaultMuted=true;video.loop=true;video.playsInline=true;
      video.setAttribute('muted','');video.setAttribute('playsinline','');video.setAttribute('webkit-playsinline','');
      var playable=function(){setState(false,true,false);};
      var playing=function(){setState(true,true,false);};
      var failed=function(){try{video.pause();}catch(e){}setState(false,false,true);};
      video.addEventListener('loadedmetadata',playable,{passive:true});
      video.addEventListener('loadeddata',playable,{passive:true});
      video.addEventListener('canplay',playable,{passive:true});
      video.addEventListener('playing',playing,{passive:true});
      video.addEventListener('error',failed,{passive:true});
      video.addEventListener('abort',failed,{passive:true});
      var attempt=function(){
        if(fallbackMode)return;
        var promise=video.play();
        if(promise&&typeof promise.catch==='function')promise.catch(function(){setState(false,video.readyState>=2,false);});
      };
      if(fallbackMode){try{video.pause();}catch(e){}setState(false,false,false);}else{
        if(video.readyState>=2)playable();
        requestAnimationFrame(attempt);
        setTimeout(attempt,350);
        setTimeout(attempt,1400);
      }
      stage.addEventListener('click',function(event){
        if(event.target===fullscreen||fullscreen&&fullscreen.contains(event.target))return;
        if(stage.dataset.videoReady!=='true')attempt();
      });
      document.addEventListener('visibilitychange',function(){if(!document.hidden&&stage.dataset.videoReady!=='true')attempt();});
    }
    if(fullscreen){
      fullscreen.addEventListener('click',function(event){
        event.preventDefault();event.stopPropagation();
        var target=stage;
        var request=target.requestFullscreen||target.webkitRequestFullscreen;
        if(request){var result=request.call(target);if(result&&result.catch)result.catch(function(){});}
        else if(video&&video.webkitEnterFullscreen)try{video.webkitEnterFullscreen();}catch(e){}
      });
    }
    var bar=document.querySelector('.mobile-bar,.mobile-bottom-bar');
    if(bar){
      var lastY=window.scrollY||0,ticking=false;
      var update=function(){
        var y=window.scrollY||0;
        if(y>lastY+8&&y>120)bar.classList.add('is-scrolled-hidden');
        else if(y<lastY-8||y<60)bar.classList.remove('is-scrolled-hidden');
        lastY=y;ticking=false;
      };
      addEventListener('scroll',function(){if(!ticking){ticking=true;requestAnimationFrame(update);}}, {passive:true});
    }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
</script>`;

  if (!html.includes('</body>')) throw new Error('Missing </body>');
  html = html.replace('</body>', `${deferredScripts.join('\n')}${controller}</body>`, 1);

  const checks = {
    release: html.includes(`x-magicoffice-production-release" content="${RELEASE}`),
    selfContainedBuild: html.includes('data-build-format="self-contained-production"'),
    approvedWordmark: html.includes('data-wordmark="MAGICOFFICE"') && html.includes('magicoffice-home-video-wordmark-v1'),
    poster: (html.match(/class="home-video-poster"/g) || []).length === 1,
    video: (html.match(/class="home-hero-trial-video"/g) || []).length === 1 && html.includes('data:video/mp4;base64,'),
    actualPlayingGuard: html.includes("video.addEventListener('playing',playing"),
    errorFallback: html.includes("video.addEventListener('error',failed") && html.includes('data-video-ready="false"'),
    wordmarkPlayingOnly: !html.includes('data-video-playable="true"] .home-video-wordmark'),
    noOfficialAssetDependency: !/https:\/\/magicoffice\.vercel\.app\/(?:assets\/|site\.webmanifest)/i.test(html),
    noRawGitHubArtwork: !/raw\.githubusercontent\.com\/sasta02001-hash\/magicoffice-deploy\/main\/assets\/(?:home-hero-preview-v3|home-clean-scene-desktop-v1)/i.test(html),
    noExternalStyles: !/<link\b[^>]*\brel=["']stylesheet["'][^>]*>/i.test(html),
    noExternalScripts: !/<script\b[^>]*\bsrc=["'][^"']+["']/i.test(html),
    desktop3664: html.includes('36fr') && html.includes('64fr'),
    mobileFourLinks: html.includes('data-home-mobile-nav="four-core-links"'),
    sections: ['id="roster"','id="schedule"','id="event-hub"','id="heartbeat-support"','id="menu"','id="location"'].every((token)=>html.includes(token)),
    indexable: /<meta\s+name="robots"\s+content="index,follow/i.test(html),
  };
  const failed = Object.entries(checks).filter(([, value]) => !value).map(([key]) => key);
  if (failed.length) throw new Error(`Final self-contained checks failed: ${failed.join(', ')}`);

  fs.writeFileSync(OUTPUT_HTML, html);
  fs.writeFileSync(OUTPUT_INDEX, html);
  const manifest = {
    release: RELEASE,
    source: 'approved home hero v3 preview',
    outputBytes: Buffer.byteLength(html),
    outputSha256: sha256(Buffer.from(html)),
    fetchedAssetCount: records.size,
    embeddedBinaryAssetCount: allBinary.length,
    inlineScriptCount: deferredScripts.length,
    video: { bytes: video.length, sha256: sha256(video), width: 1280, height: 720, fps: 24, durationSeconds: 12, audio: false },
    poster: { bytes: poster.length, sha256: sha256(poster), width: 1280, height: 720 },
    desktopBackground: { bytes: desktopBg.length, sha256: sha256(desktopBg), width: 2560, height: 1440 },
    checks,
  };
  fs.writeFileSync(path.join(OUTPUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log('MAGICOFFICE_SELF_CONTAINED_PRODUCTION_V3_BUILT', JSON.stringify(manifest));
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exit(1);
});
