import {createHash} from 'node:crypto';
export const CRAFT_CATEGORIES = Object.freeze([{"id":"bleach","code":"BLEACH","name":"單項漂髮工藝","combination":"漂髮"},{"id":"color","code":"COLOR","name":"單項染髮工藝","combination":"染髮"},{"id":"perm","code":"PERM","name":"單項燙髮工藝","combination":"燙髮"},{"id":"triascend","code":"TRIASCEND","name":"七維虹彩釉光品藏","combination":"漂髮＋染髮"},{"id":"trifusion","code":"TRIFUSION","name":"星雲畫染拓樸藝作","combination":"染髮＋燙髮"},{"id":"triform","code":"TRIFORM","name":"維娜建構恆熵典藝","combination":"漂髮＋燙髮"},{"id":"trievolve","code":"TRIEVOLVE","name":"進化交響視界藝品","combination":"漂髮＋染髮＋燙髮"},{"id":"general","code":"GENERAL SERVICES","name":"接髮","combination":"接髮"},{"id":"pending","code":"待確認","name":"工藝分類待確認","combination":"實際施作工藝確認後歸類"}].map(Object.freeze));
export const ORIGIN = 'https://vxsagittarius.vercel.app';
export const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const json = value => JSON.stringify(value).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
export function validateWorks(works) {
  if (!Array.isArray(works) || !works.length || works.length > 2000) throw Error('Invalid catalog size');
  const seen = new Set();
  for (const w of works) {
    if (!w || !/^[0-9]{3,5}$/.test(w.id) || seen.has(w.id)) throw Error('Invalid or duplicate work ID');
    seen.add(w.id);
    for (const k of ['title','cardTitle','cardInfo','description','alt']) if (typeof w[k] !== 'string' || w[k].length > 4000 || (k !== 'cardInfo' && !w[k].trim())) throw Error('Invalid '+k);
    if (!['poster.png','poster.webp','poster.jpg'].includes(w.poster)) throw Error('Invalid poster');
    for (const k of ['width','height']) if (!Number.isInteger(w[k]) || w[k] < 1 || w[k] > 16384) throw Error('Invalid dimensions');
    if (!Number.isFinite(w.duration) || w.duration <= 0 || w.duration > 3600) throw Error('Invalid duration');
    if (!Array.isArray(w.details) || w.details.length > 20 || !w.details.length || w.details.some(row => !Array.isArray(row) || row.length !== 2 || row.some(v=>typeof v !== 'string' || v.length > 4000))) throw Error('Invalid work details');
    if (typeof w.category !== 'string' || !CRAFT_CATEGORIES.some(c => c.id === w.category)) throw Error('Invalid craft category');
    const keys = ['category','id','title','cardTitle','cardInfo','description','details','alt','width','height','duration','poster'];
    if(Object.keys(w).some(k => !keys.includes(k))) throw Error('Unexpected catalog field');
  }
  return works;
}
export function workScript(works) {
  validateWorks(works);
  return "'use strict';\nwindow.VX_CRAFT_CATEGORIES = Object.freeze("+json(CRAFT_CATEGORIES)+".map(Object.freeze));\nwindow.VX_WORKS = Object.freeze("+json(works)+".map(work => Object.freeze({...work, details: Object.freeze(work.details.map(Object.freeze))})));\n";
}
export function card(w,i) {
  const asset = file => '/assets/works/'+w.id+'/'+file;
  const title = escape(w.cardTitle || w.title);
  const category = CRAFT_CATEGORIES.find(c => c.id === w.category);
  const tag = category ? '<span class="vx-craft-tag">'+escape(category.code)+'</span>' : '';
  const info = w.cardInfo === (w.cardTitle || w.title) ? '' : '<p>'+escape(w.cardInfo)+'</p>';
  return '<article class="vx-work-card" id="work-'+w.id+'"><a class="vx-work-link" href="/works/'+w.id+'/" data-vx-work="'+w.id+'" aria-label="觀看'+escape(w.title)+'作品影片"><div class="vx-folio-cover"><div class="vx-folio-front"><img class="vx-folio-art" src="'+asset('cover-768.webp')+'" srcset="'+asset('cover-384.webp')+' 384w, '+asset('cover-768.webp')+' 768w" sizes="(max-width: 700px) calc((100vw - 50px) / 2), (max-width: 1000px) calc((100vw - 100px) / 3), 374px" width="768" height="1152" alt="'+escape(w.alt)+'" decoding="async" loading="'+(i<3?'eager':'lazy')+'"></div></div>'+tag+'<h2>'+title+'</h2>'+info+'<div class="vx-card-meta"><span class="vx-watch"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3l8 5-8 5z"/></svg>觀看動態</span><span aria-label="作品編號 '+w.id+'">'+w.id+'</span></div></a></article>';
}
function direct(w) {
  return '<section class="vx-page-intro vx-direct-work"><div class="shell"><div class="eyebrow">VX · 作品 '+w.id+'</div><h1>'+escape(w.title)+'</h1><p>'+escape(w.description)+'</p><video class="vx-direct-video" controls playsinline preload="none" width="'+w.width+'" height="'+w.height+'" poster="/assets/works/'+w.id+'/'+w.poster+'" src="/assets/works/'+w.id+'/film.mp4" aria-label="'+escape(w.title)+'實際作品影片"></video><dl class="vx-direct-details">'+w.details.map(([k,v])=>'<div><dt>'+escape(k)+'</dt><dd>'+escape(v)+'</dd></div>').join('')+'</dl><div class="button-row"><a class="btn btn--gold" href="https://lin.ee/Roebk7r" target="_blank" rel="noopener">LINE 諮詢這款髮型</a><a class="btn" href="/works/">返回作品目錄</a><a class="btn" href="/services/">服務與價目</a></div><p class="vx-meta">髮色呈現會隨光線與螢幕有所差異。</p></div></section>';
}
function replaceOnce(html,rx,value,label) {
  const matches = html.match(new RegExp(rx.source,rx.flags.replace('g','')+'g')) || [];
  if (matches.length !== 1) throw Error('Template boundary missing/ambiguous: '+label);
  return html.replace(rx,()=>value);
}
function classificationControls(works) {
  const count = id => works.filter(w => w.category === id).length;
  return '<div class="vx-craft-browser" data-vx-craft-controls hidden><div class="vx-craft-toolbar"><label for="vx-craft-filter"><span>CRAFT INDEX</span>依工藝瀏覽</label><select id="vx-craft-filter" aria-describedby="vx-craft-summary"><option value="all">全部作品 · '+works.length+'</option>'+CRAFT_CATEGORIES.map(c=>'<option value="'+c.id+'">'+escape(c.code+(c.id==='pending'?'':'｜'+c.name))+' · '+count(c.id)+'</option>').join('')+'</select><span data-vx-craft-count role="status">'+works.length+' 件作品</span></div><p id="vx-craft-summary" class="vx-craft-summary">依實際施作工藝分類，從漂、染、燙到複合工藝。</p></div>';
}

export function render(template,works,id=null) {
  validateWorks(works);
  works=[...works].sort((a,b)=>Number(b.id)-Number(a.id));
  const w=id ? works.find(x=>x.id===id) : null;
  if (id&&!w) throw Error('Unknown work');
  let html=template;
  html=html.replace('<div class="vx-work-grid"',classificationControls(works)+'<div class="vx-work-grid"');
  const grid=/(<div class="vx-work-grid"[^>]*>)[\s\S]*?(<\/div>\s*<button class="vx-works-more")/;
  if(!grid.test(html)) throw Error('Missing catalog grid');
  html=html.replace(grid,(_,a,b)=>a+works.slice(0,12).map(card).join('')+b);
  html=html.replace(/(<span data-vx-work-count>)[\s\S]*?(<\/span>)/,(_,a,b)=>a+works.length+' 件作品'+b);
  if(works.length>12) html=html.replace('data-vx-works-more type="button" hidden','data-vx-works-more type="button"');
  const title=w?w.title+'｜VX SAGITTARIUS':'作品｜VX SAGITTARIUS';
  const description=w?w.description:'瀏覽 VX 真實美髮作品與動態影片，查看髮色、造型、線條與質地。';
  const url=ORIGIN+'/works/'+(w?w.id+'/':'');
  const image=w?ORIGIN+'/assets/works/'+w.id+'/cover-768.webp':ORIGIN+'/assets/images/work-time.webp';
  html=replaceOnce(html,/<title>[\s\S]*?<\/title>/,'<title>'+escape(title)+'</title>','title');
  for(const [attr,key,value] of [['name','description',description],['property','og:title',title],['property','og:description',description],['property','og:url',url],['property','og:image',image],['property','og:image:alt',w?w.alt:title],['name','twitter:title',title],['name','twitter:description',description],['name','twitter:image',image]]) {
    html=replaceOnce(html,new RegExp('<meta '+attr+'="'+key+'" content="[^"]*">'),'<meta '+attr+'="'+key+'" content="'+escape(value)+'">',key);
  }
  html=replaceOnce(html,/<link rel="canonical" href="[^"]*">/,'<link rel="canonical" href="'+escape(url)+'">','canonical');
  const ld={'@context':'https://schema.org','@type':w?'CreativeWork':'WebPage',name:title,description,url,image,inLanguage:'zh-Hant',publisher:{'@type':'Organization',name:'VX SAGITTARIUS',url:ORIGIN}};
  html=replaceOnce(html,/<script type="application\/ld\+json">[\s\S]*?<\/script>/,'<script type="application/ld+json">'+json(ld)+'</script>','structured data');
  if(w) {
    html=html.replace('<section class="vx-works"',direct(w)+'<section class="vx-works"');
    html=html.replace('<h1 id="vx-works-heading">作品</h1>','<h2 id="vx-works-heading">更多作品</h2>');
  }
  if(works.length>12) html=html.replace('</main>','<noscript><nav aria-label="全部作品">'+works.map(x=>'<a href="/works/'+x.id+'/">'+escape(x.title)+'</a>').join(' ')+'</nav></noscript></main>');
  // Keep the unopened viewer's text and media aligned with the first published work.
  const first=works[0];
  const dialogBoundary=/<dialog id="vx-work-viewer"[\s\S]*?<\/dialog>/;
  const originalDialog=html.match(dialogBoundary)?.[0];
  if(!originalDialog)throw Error('Missing dialog');
  let dialog=originalDialog;
  dialog=replaceOnce(dialog,/<video id="vx-work-video"[^>]*>/,'<video id="vx-work-video" playsinline muted controls preload="none" width="'+first.width+'" height="'+first.height+'" poster="/assets/works/'+first.id+'/'+first.poster+'" aria-label="'+escape(first.title)+'實際作品影片">','dialog video');
  dialog=replaceOnce(dialog,/<h2 id="vx-work-title">[\s\S]*?<\/h2>/,'<h2 id="vx-work-title">'+escape(first.title)+'</h2>','dialog title');
  dialog=replaceOnce(dialog,/<p class="vx-work-description">[\s\S]*?<\/p>/,'<p class="vx-work-description">'+escape(first.description)+'</p>','dialog description');
  dialog=replaceOnce(dialog,/<dl>[\s\S]*?<\/dl>/,'<dl>'+first.details.map(([k,v])=>'<div><dt>'+escape(k)+'</dt><dd>'+escape(v)+'</dd></div>').join('')+'</dl>','dialog details');
  dialog=replaceOnce(dialog,/<p class="vx-work-reference">[\s\S]*?<\/p>/,'<p class="vx-work-reference">作品編號 '+first.id+'</p>','dialog reference');
  const duration=String(Math.floor(first.duration/60)).padStart(2,'0')+':'+String(Math.floor(first.duration%60)).padStart(2,'0');
  dialog=replaceOnce(dialog,/<span id="vx-work-duration">[\s\S]*?<\/span>/,'<span id="vx-work-duration">'+duration+'</span>','dialog duration');
  dialog=dialog.replace(/\/assets\/works\/001\//g,'/assets/works/'+first.id+'/');
  html=replaceOnce(html,dialogBoundary,dialog,'dialog');
  return html;
}
export function revision(works) { return createHash('sha256').update(json(works)).digest('hex'); }
export function mediaRewrites(works,registry) {
  validateWorks(works);
  if(!registry || !Array.isArray(registry.allowedOrigins) || !registry.works) throw Error('Invalid media registry');
  const result=[];
  for(const w of works) {
    const entry=registry.works[w.id];
    if(!entry)throw Error('Missing media for '+w.id);
    const base=new URL(entry.base);
    if(base.protocol!=='https:' || base.username || base.password || base.search || base.hash || base.origin===ORIGIN || !registry.allowedOrigins.includes(base.origin) || base.pathname!=='/assets/works/'+w.id)throw Error('Invalid media base');
    for(const file of ['cover-384.webp','cover-768.webp',w.poster,'film.mp4']) {
      const proof=entry.files?.[file];
      if(!proof || !/^[a-f0-9]{64}$/.test(proof.sha256) || !Number.isSafeInteger(proof.bytes) || proof.bytes<1)throw Error('Unverified asset '+w.id+'/'+file);
      const destination=proof.url || entry.base+'/'+file;
      const asset=new URL(destination);
      if(asset.protocol!=='https:' || asset.username || asset.password || asset.search || asset.hash || !registry.allowedOrigins.includes(asset.origin) || !asset.pathname.startsWith('/assets/works/'+w.id+'/') || !['cover-384.webp','cover-768.webp',w.poster,'film.mp4'].includes(asset.pathname.split('/').pop()))throw Error('Invalid media override');
      result.push({source:'/assets/works/'+w.id+'/'+file,destination});
    }
  }
  return result;
}
