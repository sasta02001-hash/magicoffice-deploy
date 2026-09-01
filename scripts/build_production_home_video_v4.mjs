import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const SOURCE_HTML = path.resolve('assets/home-hero-preview-v3/preview.html');
const POSTER_FILE = path.resolve('assets/home-hero-preview-v3/magicoffice-home-video-poster-v1.webp');
const DESKTOP_BG_FILE = path.resolve('assets/home-clean-scene-desktop-v1/magicoffice-home-clean-scene-desktop-v1.webp');
const VIDEO_FILE = path.resolve('assets/production-trial-video/MagicOffice_home_trial_720p_12s_v1.mp4');
const LEGACY_ROOT = path.resolve(process.env.LEGACY_ROOT || '/tmp/mo-v207/v207-site');
const OUTPUT_DIR = path.resolve('assets/production-home-video-v4');
const OUTPUT_HTML = path.join(OUTPUT_DIR, 'MagicOffice_home_video_v4.html');
const OUTPUT_INDEX = path.join(OUTPUT_DIR, 'index.html');
const ORIGIN = 'https://magicoffice.vercel.app';
const RELEASE = 'home-video-wordmark-12s-2026-09-01-v4';
const EXPECTED_VIDEO = { bytes: 3016896, sha256: '2251aa3eb1d386a4d3a889ab147f7a212838e7f1c56bcac018e92fb44bc5f7b1' };
const CLEAN_SCENE_CHUNKS = ['part-00.txt','part-01a.txt','part-01b.txt','part-02.txt','part-03.txt','part-04.txt','part-05.txt','part-06a.txt','part-07.txt','part-08.txt','part-09.txt'];

const MIME = {
  '.css':'text/css','.js':'text/javascript','.json':'application/json','.webmanifest':'application/manifest+json',
  '.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.ico':'image/x-icon',
  '.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf','.otf':'font/otf','.mp4':'video/mp4','.webm':'video/webm','.mp3':'audio/mpeg'
};

const sha256 = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');
const mimeFor = (pathname, fallback='application/octet-stream') => MIME[path.extname(pathname).toLowerCase()] || fallback;
const dataUri = (buffer, mime) => `data:${mime};base64,${buffer.toString('base64')}`;
const escapeStyle = (text) => text.replace(/<\/style/gi,'<\\/style');
const escapeScript = (text) => text.replace(/<\/script/gi,'<\\/script');

function webpDimensions(buffer) {
  if (buffer.length < 30 || buffer.subarray(0,4).toString() !== 'RIFF' || buffer.subarray(8,12).toString() !== 'WEBP') return null;
  const kind = buffer.subarray(12,16).toString();
  if (kind === 'VP8 ') {
    const offset = buffer.indexOf(Buffer.from([0x9d,0x01,0x2a]),20);
    if (offset < 0) return null;
    return { width: buffer.readUInt16LE(offset+3)&0x3fff, height: buffer.readUInt16LE(offset+5)&0x3fff };
  }
  if (kind === 'VP8X') return { width:1+buffer.readUIntLE(24,3), height:1+buffer.readUIntLE(27,3) };
  if (kind === 'VP8L' && buffer[20] === 0x2f) {
    const bits=buffer.readUInt32LE(21); return { width:(bits&0x3fff)+1, height:((bits>>14)&0x3fff)+1 };
  }
  return null;
}

function reconstructMobileScene() {
  const root=path.resolve('source-assets/clean-scene-v7');
  const encoded=CLEAN_SCENE_CHUNKS.map((name)=>fs.readFileSync(path.join(root,name),'utf8').trim()).join('');
  const buffer=Buffer.from(encoded,'base64');
  const dim=webpDimensions(buffer);
  if (!dim || dim.width !== 1000 || dim.height !== 1333) throw new Error(`Mobile clean-scene dimensions invalid ${JSON.stringify(dim)}`);
  return buffer;
}

function heartbeatSvg() {
  return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900" role="img" aria-labelledby="t d">
<title id="t">MagicOffice 心跳應援</title><desc id="d">2026年9月1日至15日心跳應援，九月整月訂位即送小卡一張。</desc>
<defs>
 <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff9fc"/><stop offset=".46" stop-color="#ffd7e8"/><stop offset="1" stop-color="#fff3f8"/></linearGradient>
 <radialGradient id="halo"><stop stop-color="#ffffff" stop-opacity=".96"/><stop offset=".55" stop-color="#fff" stop-opacity=".25"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
 <linearGradient id="pink" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#ff71a8"/><stop offset="1" stop-color="#d92d70"/></linearGradient>
 <filter id="shadow" x="-30%" y="-30%" width="160%" height="170%"><feGaussianBlur in="SourceAlpha" stdDeviation="8"/><feOffset dy="10"/><feColorMatrix values="0 0 0 0 .45 0 0 0 0 .03 0 0 0 0 .20 0 0 0 .28 0"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>
</defs>
<rect width="1200" height="900" rx="46" fill="url(#bg)"/>
<circle cx="220" cy="190" r="270" fill="url(#halo)"/><circle cx="1010" cy="720" r="330" fill="url(#halo)"/>
<g opacity=".14" fill="#ef407f"><path d="M110 130c-72-84-190 37 0 184 190-147 72-268 0-184z"/><path d="M1080 625c-96-112-252 49 0 245 252-196 96-357 0-245z"/></g>
<g fill="none" stroke="#f28bad" stroke-width="3" opacity=".72"><path d="M120 110h230l30 32 30-32h230"/><path d="M560 785h230l30-32 30 32h230"/></g>
<g filter="url(#shadow)">
 <path d="M600 150c-118-138-310 60 0 300 310-240 118-438 0-300z" fill="url(#pink)" opacity=".96"/>
 <path d="M600 205c-76-89-200 39 0 194 200-155 76-283 0-194z" fill="#fff8fc" opacity=".92"/>
</g>
<text x="600" y="500" text-anchor="middle" font-family="'Noto Serif TC','PMingLiU',serif" font-size="116" font-weight="900" letter-spacing="12" fill="#e52f72">心跳應援</text>
<text x="600" y="575" text-anchor="middle" font-family="Georgia,'Noto Serif TC',serif" font-size="42" font-weight="700" letter-spacing="5" fill="#b5275a">全力で応援するよ！！</text>
<text x="600" y="650" text-anchor="middle" font-family="Georgia,serif" font-size="36" letter-spacing="8" fill="#7c3b57">2026.09.01–09.15</text>
<rect x="250" y="700" width="700" height="76" rx="38" fill="#fff" fill-opacity=".78" stroke="#ee8cac" stroke-width="2"/>
<text x="600" y="750" text-anchor="middle" font-family="'Noto Sans TC','Microsoft JhengHei',sans-serif" font-size="30" font-weight="700" letter-spacing="2" fill="#a52c59">九月整月活動｜訂位即送小卡一張</text>
<g fill="#f36f9e" opacity=".75"><circle cx="188" cy="500" r="7"/><circle cx="1020" cy="370" r="7"/><circle cx="958" cy="185" r="5"/><circle cx="282" cy="730" r="5"/></g>
</svg>`,'utf8');
}

function transparentSvg() {
  return Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"></svg>','utf8');
}

function cleanAssetPath(raw, basePath='/') {
  if (!raw) return null;
  const value=String(raw).trim().replace(/^['"]|['"]$/g,'');
  let decodedValue=value; try { decodedValue=decodeURIComponent(value); } catch {}
  if (!value || /^(?:data:|blob:|javascript:|mailto:|tel:|#)/i.test(value) || decodedValue.startsWith('#')) return null;
  let url;
  try { url=new URL(value, `${ORIGIN}${basePath.startsWith('/')?basePath:`/${basePath}`}`); } catch { return null; }
  if (url.host !== new URL(ORIGIN).host) return null;
  if (!(url.pathname.startsWith('/assets/') || url.pathname === '/site.webmanifest' || url.pathname === '/favicon.png' || url.pathname === '/apple-touch-icon.png')) return null;
  return url.pathname;
}

async function main() {
  if (!fs.existsSync(LEGACY_ROOT)) throw new Error(`Missing extracted legacy root ${LEGACY_ROOT}`);
  for (const file of [SOURCE_HTML,POSTER_FILE,DESKTOP_BG_FILE,VIDEO_FILE]) if (!fs.existsSync(file)) throw new Error(`Missing source ${file}`);
  fs.rmSync(OUTPUT_DIR,{recursive:true,force:true}); fs.mkdirSync(OUTPUT_DIR,{recursive:true});

  let html=fs.readFileSync(SOURCE_HTML,'utf8');
  const poster=fs.readFileSync(POSTER_FILE);
  const desktopBg=fs.readFileSync(DESKTOP_BG_FILE);
  const video=fs.readFileSync(VIDEO_FILE);
  const mobileScene=reconstructMobileScene();
  const heartbeat=heartbeatSvg();
  const transparent=transparentSvg();
  if (video.length !== EXPECTED_VIDEO.bytes || sha256(video) !== EXPECTED_VIDEO.sha256) throw new Error(`Trial video verification failed ${video.length} ${sha256(video)}`);

  const special=new Map([
    ['/assets/og-card.jpg',{buffer:poster,mime:'image/webp',source:'approved poster'}],
    ['/assets/media/magicoffice-home-video-poster-v1.webp',{buffer:poster,mime:'image/webp',source:'approved poster'}],
    ['/assets/media/magicoffice-home-video-poster-v1.png',{buffer:poster,mime:'image/webp',source:'approved poster'}],
    ['/assets/media/magicoffice-home-clean-scene-v5.webp',{buffer:mobileScene,mime:'image/webp',source:'clean-scene v7 repository payload'}],
    ['/assets/media/44049d5f46ae6a12.webp',{buffer:mobileScene,mime:'image/webp',source:'clean-scene v7 repository payload'}],
    ['/assets/media/heartbeat-support-v7.png',{buffer:heartbeat,mime:'image/svg+xml',source:'heartbeat campaign fallback art'}],
    ['/assets/media/homepage-cinema-frame-final-v2.webp',{buffer:transparent,mime:'image/svg+xml',source:'removed legacy ornament'}],
    ['/assets/css/magic-menu-cms-v1.0.4.css',{buffer:Buffer.from('/* Menu CMS presentation is covered by the verified site stylesheet; no remote dependency. */','utf8'),mime:'text/css',source:'local compatibility shim'}],
  ]);

  const cache=new Map();
  function getAsset(pathname) {
    if (special.has(pathname)) return special.get(pathname);
    if (cache.has(pathname)) return cache.get(pathname);
    const clean=pathname.replace(/^\/+/,'');
    const candidate=path.resolve(LEGACY_ROOT,clean);
    if (!candidate.startsWith(LEGACY_ROOT+path.sep)) throw new Error(`Unsafe asset path ${pathname}`);
    if (!fs.existsSync(candidate) || !fs.statSync(candidate).isFile()) throw new Error(`Missing local v2.0.7.2 asset ${pathname}`);
    const buffer=fs.readFileSync(candidate);
    const result={buffer,mime:mimeFor(pathname),source:`legacy:${pathname}`};
    cache.set(pathname,result); return result;
  }

  function inlineCss(css,cssPath) {
    let out=css;
    out=out.replace(/@import\s+(?:url\()?\s*["']([^"']+)["']\s*\)?\s*;?/gi,(all,raw)=>{
      const p=cleanAssetPath(raw,cssPath); if (!p) return all;
      const asset=getAsset(p); if (asset.mime!=='text/css') return all;
      return inlineCss(asset.buffer.toString('utf8'),p);
    });
    out=out.replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi,(all,_q,raw)=>{
      const p=cleanAssetPath(raw,cssPath); if (!p) return all;
      const asset=getAsset(p); return `url("${dataUri(asset.buffer,asset.mime)}")`;
    });
    return out;
  }

  const stylesheetTags=[...html.matchAll(/<link\b[^>]*>/gi)].map((m)=>m[0]).filter((tag)=>{
    const rel=tag.match(/\brel=["']([^"']+)["']/i)?.[1]||'';
    const href=tag.match(/\bhref=["']([^"']+)["']/i)?.[1]||'';
    return /(?:^|\s)stylesheet(?:\s|$)/i.test(rel) && cleanAssetPath(href);
  });
  for (const tag of stylesheetTags) {
    const href=tag.match(/\bhref=["']([^"']+)["']/i)?.[1];
    const p=cleanAssetPath(href); const asset=getAsset(p);
    const css=inlineCss(asset.buffer.toString('utf8'),p);
    html=html.replace(tag,`<style data-inline-source="${p}">${escapeStyle(css)}</style>`);
  }

  const scriptTags=[...html.matchAll(/<script\b[^>]*\bsrc=["'][^"']+["'][^>]*>[\s\S]*?<\/script>/gi)].map((m)=>m[0]);
  for (const tag of scriptTags) {
    const src=tag.match(/\bsrc=["']([^"']+)["']/i)?.[1];
    const p=cleanAssetPath(src); if (!p) continue;
    const asset=getAsset(p);
    const attrs=(tag.match(/^<script\b([^>]*)>/i)?.[1]||'').replace(/\s+src=["'][^"']+["']/i,'').replace(/\s+(?:defer|async)(?:=["'][^"']*["'])?/gi,'');
    html=html.replace(tag,`<script${attrs} data-inline-source="${p}">${escapeScript(asset.buffer.toString('utf8'))}</script>`);
  }

  for (const id of ['homepage-integrated-hero-v1-js','magicoffice-home-hero-refine-v1-js','magicoffice-home-hero-patch-script-v1','magicoffice-home-video-safe-v2-js','magicoffice-home-video-controller-v3']) {
    html=html.replace(new RegExp(`<script\\b(?=[^>]*\\bid=["']${id}["'])[^>]*>[\\s\\S]*?<\\/script>`,'gi'),'');
  }

  const directSpecial=[
    ['https://raw.githubusercontent.com/sasta02001-hash/magicoffice-deploy/main/assets/home-hero-preview-v3/magicoffice-home-video-poster-v1.webp',dataUri(poster,'image/webp')],
    ['https://raw.githubusercontent.com/sasta02001-hash/magicoffice-deploy/main/assets/home-clean-scene-desktop-v1/magicoffice-home-clean-scene-desktop-v1.webp',dataUri(desktopBg,'image/webp')],
  ];
  for (const [from,to] of directSpecial) html=html.split(from).join(to);

  const assetPattern=/(?:https:\/\/magicoffice\.vercel\.app)?(?:\/assets\/[^\s"'<> )]+|\/site\.webmanifest|\/favicon\.png|\/apple-touch-icon\.png)/gi;
  const matches=[...new Set(html.match(assetPattern)||[])].sort((a,b)=>b.length-a.length);
  for (const raw of matches) {
    const p=cleanAssetPath(raw.split('#')[0]); if (!p) continue;
    const asset=getAsset(p);
    html=html.split(raw).join(dataUri(asset.buffer,asset.mime));
  }

  const videoUri=dataUri(video,'video/mp4');
  const mountPattern=/(<([a-z0-9]+)\b[^>]*\bdata-home-video-mount\b[^>]*>)[\s\S]*?(<\/\2>)/i;
  if (!mountPattern.test(html)) throw new Error('Missing data-home-video-mount');
  html=html.replace(mountPattern,`$1<video class="home-hero-trial-video" muted autoplay loop playsinline webkit-playsinline preload="auto" aria-label="MagicOffice 試播影片" src="${videoUri}"></video>$3`);

  const stagePattern=/<([a-z0-9]+)\b([^>]*\bclass=["'][^"']*\bhomepage-cinema-stage\b[^"']*["'][^>]*)>/i;
  const stage=html.match(stagePattern); if (!stage) throw new Error('Missing homepage cinema stage');
  const stageAttrs=stage[2].replace(/\sdata-video-(?:ready|playable|error)=["'][^"']*["']/gi,'');
  html=html.replace(stagePattern,`<${stage[1]}${stageAttrs} data-video-ready="false" data-video-playable="false" data-video-error="false">`);
  html=html.replace('.homepage-cinema-stage[data-video-ready="true"] .home-video-wordmark,.homepage-cinema-stage[data-video-playable="true"] .home-video-wordmark','.homepage-cinema-stage[data-video-ready="true"] .home-video-wordmark');

  html=html.replace(/<meta\b(?=[^>]*\bname=["'](?:robots|site-version|verified-deployment|x-magicoffice-production-release|production-promotion)["'])[^>]*>/gi,'');
  html=html.replace('</head>',`<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1"/><meta name="site-version" content="${RELEASE}"/><meta name="verified-deployment" content="${RELEASE}"/><meta name="x-magicoffice-production-release" content="${RELEASE}"/><meta name="production-promotion" content="production-ready"/></head>`,1);
  html=html.replace(/data-site-version=["'][^"']*["']/i,`data-site-version="${RELEASE}"`);
  if (!/data-build-format=/i.test(html)) html=html.replace(/<html\b/i,'<html data-build-format="self-contained-production"');
  else html=html.replace(/data-build-format=["'][^"']*["']/i,'data-build-format="self-contained-production"');

  const css=`<style id="magicoffice-home-video-production-v4-css">
.homepage-cinema-stage.home-hero-stage{background:#170b10!important;isolation:isolate!important}
.homepage-cinema-stage .home-video-poster{z-index:1!important;opacity:1!important;visibility:visible!important;background:#170b10!important;transition:opacity .32s ease,visibility .32s ease!important}
.homepage-cinema-stage [data-home-video-mount]{z-index:0!important;opacity:1!important;visibility:visible!important;background:transparent!important;transition:opacity .32s ease,visibility .32s ease!important}
.homepage-cinema-stage [data-home-video-mount] video{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;display:block!important;object-fit:cover!important;object-position:center!important;background:transparent!important}
.homepage-cinema-stage .home-video-wordmark{z-index:3!important}
.homepage-cinema-stage[data-video-ready="true"] .home-video-poster,.homepage-cinema-stage[data-video-ready="true"] .home-video-wordmark{opacity:0!important;visibility:hidden!important}
.homepage-cinema-stage[data-video-ready="true"] [data-home-video-mount]{z-index:2!important;opacity:1!important;visibility:visible!important}
.homepage-cinema-stage[data-video-ready="false"] [data-home-video-mount]{z-index:0!important;opacity:1!important;visibility:visible!important}
.homepage-cinema-stage[data-video-playable="true"] .cinema-fullscreen-button{display:grid!important;opacity:.88!important;pointer-events:auto!important}
.homepage-cinema-stage[data-video-playable="false"] .cinema-fullscreen-button{display:none!important}
.heartbeat-support-poster img{background:#ffe2ef!important}
@media(prefers-reduced-motion:reduce){.homepage-cinema-stage .home-video-poster,.homepage-cinema-stage [data-home-video-mount],.homepage-cinema-stage .home-video-wordmark{transition:none!important}}
</style>`;
  html=html.replace('</head>',`${css}</head>`,1);

  const controller=`<script id="magicoffice-home-video-controller-v4">
(function(){
 function init(){
  var stage=document.querySelector('.homepage-cinema-stage.home-hero-stage,.homepage-cinema-stage'); if(!stage)return;
  var mount=stage.querySelector('[data-home-video-mount]'),video=mount&&mount.querySelector('video'),fullscreen=stage.querySelector('.cinema-fullscreen-button');
  var fallback=new URLSearchParams(location.search).get('moFallback')==='1';
  function state(ready,playable,error){stage.dataset.videoReady=ready?'true':'false';stage.dataset.videoPlayable=playable?'true':'false';stage.dataset.videoError=error?'true':'false';if(mount)mount.setAttribute('aria-hidden',ready?'false':'true');}
  state(false,false,false);
  if(video){
   video.muted=true;video.defaultMuted=true;video.autoplay=true;video.loop=true;video.playsInline=true;video.setAttribute('muted','');video.setAttribute('autoplay','');video.setAttribute('playsinline','');video.setAttribute('webkit-playsinline','');
   function playable(){state(false,true,false)} function playing(){state(true,true,false)} function failed(){try{video.pause()}catch(e){}state(false,false,true)}
   ['loadedmetadata','loadeddata','canplay'].forEach(function(n){video.addEventListener(n,playable,{passive:true})});video.addEventListener('playing',playing,{passive:true});video.addEventListener('error',failed,{passive:true});video.addEventListener('abort',failed,{passive:true});
   function attempt(){if(fallback)return;var p=video.play();if(p&&p.catch)p.catch(function(){state(false,video.readyState>=2,false)})}
   if(fallback){try{video.pause()}catch(e){}state(false,false,false)}else{if(video.readyState>=2)playable();requestAnimationFrame(attempt);setTimeout(attempt,350);setTimeout(attempt,1400)}
   stage.addEventListener('click',function(e){if(fullscreen&&(e.target===fullscreen||fullscreen.contains(e.target)))return;if(stage.dataset.videoReady!=='true')attempt()});
   document.addEventListener('visibilitychange',function(){if(!document.hidden&&stage.dataset.videoReady!=='true')attempt()});
  }
  if(fullscreen)fullscreen.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();var req=stage.requestFullscreen||stage.webkitRequestFullscreen;if(req){var r=req.call(stage);if(r&&r.catch)r.catch(function(){})}else if(video&&video.webkitEnterFullscreen)try{video.webkitEnterFullscreen()}catch(x){}});
  var bar=document.querySelector('.mobile-bar,.mobile-bottom-bar');if(bar){var last=scrollY||0,ticking=false;function update(){var y=scrollY||0;if(y>last+8&&y>120)bar.classList.add('is-scrolled-hidden');else if(y<last-8||y<60)bar.classList.remove('is-scrolled-hidden');last=y;ticking=false}addEventListener('scroll',function(){if(!ticking){ticking=true;requestAnimationFrame(update)}},{passive:true})}
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
</script>`;
  if (!html.includes('</body>')) throw new Error('Missing </body>'); html=html.replace('</body>',`${controller}</body>`,1);

  const unresolved=(html.match(/(?:https:\/\/magicoffice\.vercel\.app)?\/assets\/[^\s"'<> )]+/gi)||[]).filter((x)=>!x.startsWith('data:'));
  const checks={
    release:html.includes(RELEASE),selfContained:html.includes('data-build-format="self-contained-production"'),
    poster:(html.match(/class="home-video-poster"/g)||[]).length===1,wordmark:html.includes('data-wordmark="MAGICOFFICE"'),
    video:(html.match(/class="home-hero-trial-video"/g)||[]).length===1&&html.includes('data:video/mp4;base64,'),playingGuard:html.includes("video.addEventListener('playing',playing"),
    fallback:html.includes("video.addEventListener('error',failed")&&html.includes('data-video-ready="false"'),
    noExternalStyles:!/<link\b[^>]*\brel=["']stylesheet["']/i.test(html),noExternalScripts:!/<script\b[^>]*\bsrc=["']/i.test(html),
    noOfficialAssets:unresolved.length===0,noRawGitHub:!/raw\.githubusercontent\.com\/sasta02001-hash\/magicoffice-deploy\/main\/assets\//i.test(html),
    desktop3664:html.includes('36fr')&&html.includes('64fr'),mobileFour:html.includes('data-home-mobile-nav="four-core-links"'),
    sections:['id="roster"','id="schedule"','id="event-hub"','id="heartbeat-support"','id="menu"','id="location"'].every((x)=>html.includes(x)),
    indexable:/name="robots" content="index,follow/i.test(html)
  };
  const failed=Object.entries(checks).filter(([,v])=>!v).map(([k])=>k); if(failed.length) throw new Error(`Final checks failed ${failed.join(', ')} unresolved=${JSON.stringify(unresolved.slice(0,12))}`);

  fs.writeFileSync(OUTPUT_HTML,html); fs.writeFileSync(OUTPUT_INDEX,html);
  const manifest={release:RELEASE,source:'approved v3 preview + v2.0.7.2 Git asset snapshot',outputBytes:Buffer.byteLength(html),outputSha256:sha256(Buffer.from(html)),legacyRoot:LEGACY_ROOT,embeddedLegacyAssetCount:cache.size,video:{bytes:video.length,sha256:sha256(video),width:1280,height:720,fps:24,durationSeconds:12,audio:false},poster:{bytes:poster.length,sha256:sha256(poster),dimensions:webpDimensions(poster)},desktopBackground:{bytes:desktopBg.length,sha256:sha256(desktopBg),dimensions:webpDimensions(desktopBg)},mobileBackground:{bytes:mobileScene.length,sha256:sha256(mobileScene),dimensions:webpDimensions(mobileScene)},heartbeatArtwork:{bytes:heartbeat.length,sha256:sha256(heartbeat)},checks};
  fs.writeFileSync(path.join(OUTPUT_DIR,'manifest.json'),JSON.stringify(manifest,null,2)); console.log('MAGICOFFICE_PRODUCTION_V4_BUILT',JSON.stringify(manifest));
}

main().catch((error)=>{console.error(error.stack||error);process.exit(1)});
