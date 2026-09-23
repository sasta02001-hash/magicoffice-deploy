import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const ORIGIN='https://vxsagittarius.vercel.app';
const PRIVACY='https://vxsagittarius-media-privacy-2026091.vercel.app';
// Keep existing works until an approved baseline update records an intentional removal.
const REQUIRED_WORK_IDS=Array.from({length:32},(_,i)=>String(i+1).padStart(3,'0'));
const PRIVACY_WORK_IDS=['001','003','005','007','008','009','011','012','013','014','015','016','017','018','019','020','023','024','025','026','029','030','031','032'];
const REQUIRED_PRIVACY_PATHS=new Set(PRIVACY_WORK_IDS.map(id=>'assets/works/'+id+'/film.mp4'));
const out={startedAt:new Date().toISOString(),status:'checking',checks:[],errors:[],unverified:['Physical iPhone/Android layout','Visual face masking across every frame; verify samples in browser','Private runtime logs']};
async function request(url,method='GET'){
  let r;
  for(let i=0;i<2;i++){
    try{r=await fetch(url,{method,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(30000)});if(r.status===200)return r;}catch(e){if(i)throw e;}
  }
  assert.equal(r?.status,200,`HTTP_${r?.status}:${url}`);return r;
}
async function batch(items,fn){for(let i=0;i<items.length;i+=8)await Promise.all(items.slice(i,i+8).map(async item=>{try{await fn(item);}catch(e){out.errors.push({item,error:e.message.slice(0,200)});}}));}
try{
  const health=await (await request(ORIGIN+'/health.json')).json();assert.equal(health.status,'healthy');
  const catalog=await (await request(ORIGIN+'/catalog.json')).json();assert.equal(catalog.revision,health.revision);assert.ok(Array.isArray(catalog.works),'INVALID_CATALOG');assert.equal(catalog.works.length,health.count);
  const workIds=catalog.works.map(w=>w.id),workIdSet=new Set(workIds);
  assert.ok(workIds.every(id=>typeof id==='string'&&/^[0-9]{3,5}$/.test(id)),'INVALID_WORK_ID');
  assert.equal(workIdSet.size,workIds.length,'DUPLICATE_WORK_ID');
  assert.ok(REQUIRED_WORK_IDS.every(id=>workIdSet.has(id)),'REQUIRED_WORK_MISSING_APPROVED_BASELINE_UPDATE_NEEDED');
  const privacy=await (await request(PRIVACY+'/privacy-manifest.json')).json();assert.ok(Array.isArray(privacy.assets),'INVALID_PRIVACY_MANIFEST');assert.equal(privacy.count,24,'PRIVACY_COUNT_REGRESSION');assert.equal(privacy.assets.length,24,'PRIVACY_ASSETS_REGRESSION');
  const privacyPaths=new Set();
  for(const asset of privacy.assets){
    assert.ok(REQUIRED_PRIVACY_PATHS.has(asset.path),'UNKNOWN_PRIVACY_PATH');assert.ok(!privacyPaths.has(asset.path),'DUPLICATE_PRIVACY_PATH');privacyPaths.add(asset.path);
    assert.ok(workIdSet.has(asset.path.split('/')[2]),'PRIVACY_WORK_MISSING');
    assert.ok(Number.isSafeInteger(asset.bytes)&&asset.bytes>0,'INVALID_PRIVACY_BYTES');assert.match(asset.sha256,/^[a-f0-9]{64}$/,'INVALID_PRIVACY_SHA256');
  }
  assert.ok([...REQUIRED_PRIVACY_PATHS].every(p=>privacyPaths.has(p)),'REQUIRED_PRIVACY_PATH_MISSING');
  out.contentRevision=health.revision;out.works=catalog.works.length;out.privacyRevision=privacy.revision;
  const filmProof=new Map(privacy.assets.map(a=>['/'+a.path,a]));
  const siteMap=await (await request(ORIGIN+'/sitemap.xml')).text();
  const urls=[...new Set([...siteMap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>m[1]))];
  assert.ok(urls.length>=catalog.works.length+8,'INCOMPLETE_SITEMAP');
  assert.ok(workIds.every(id=>urls.includes(ORIGIN+'/works/'+id+'/')),'WORK_MISSING_FROM_SITEMAP');
  await batch(urls,async url=>{
    assert.equal(new URL(url).origin,ORIGIN);const r=await request(url);const text=await r.text();
    assert.ok((r.headers.get('content-type')||'').includes('text/html'));assert.ok(text.includes('<main'),'MISSING_MAIN');
    const canonicalTags=(text.match(/<link\b[^>]*>/gi)||[]).filter(tag=>/\brel\s*=\s*(["'])canonical\1/i.test(tag));
    assert.equal(canonicalTags.length,1,'MISSING_OR_DUPLICATE_CANONICAL');
    const canonical=canonicalTags[0].match(/\bhref\s*=\s*(["'])(.*?)\1/i)?.[2]?.replaceAll('&amp;','&');
    assert.equal(canonical,url,'PAGE_CANONICAL_MISMATCH_OR_FALLBACK');
    if(url.includes('/works/009/'))assert.ok(!text.includes('榛果粽'),'TYPO_REGRESSION');out.checks.push({type:'page',url,status:200});
  });
  const assets=catalog.works.flatMap(w=>['film.mp4',w.poster,'cover-384.webp','cover-768.webp'].map(f=>'/assets/works/'+w.id+'/'+f));
  await batch(assets,async asset=>{
    const r=await request(ORIGIN+asset,'HEAD');const type=r.headers.get('content-type')||'';assert.ok(type.startsWith(asset.endsWith('.mp4')?'video/':'image/'),'ASSET_TYPE');assert.ok(Number(r.headers.get('content-length'))>0,'EMPTY_ASSET');
    const proof=filmProof.get(asset);if(proof){assert.equal(Number(r.headers.get('content-length')),proof.bytes,'PRIVACY_SIZE_REGRESSION');assert.equal(r.headers.get('x-vx-privacy-sha256'),proof.sha256,'PRIVACY_ROUTE_REGRESSION');}
    out.checks.push({type:'asset',path:asset,status:200,privacyRoute:!!proof});
  });
  assert.equal(out.checks.filter(c=>c.privacyRoute).length,24,'PRIVACY_ROUTE_COVERAGE_REGRESSION');
  for(const id of ['001','032']){if(!catalog.works.some(w=>w.id===id))continue;const r=await fetch(ORIGIN+'/assets/works/'+id+'/film.mp4',{headers:{Range:'bytes=0-1023'},redirect:'error',signal:AbortSignal.timeout(30000)});assert.equal(r.status,206,'VIDEO_RANGE_FAILED');assert.equal((await r.arrayBuffer()).byteLength,1024);out.checks.push({type:'range',id,status:206});}
  out.status=out.errors.length?'issues-found':'passed';
}catch(e){out.status='failed';out.errors.push({error:e.message.slice(0,200)});}
out.finishedAt=new Date().toISOString();out.counts={pages:out.checks.filter(c=>c.type==='page').length,assets:out.checks.filter(c=>c.type==='asset').length,privacyRoutes:out.checks.filter(c=>c.privacyRoute).length,ranges:out.checks.filter(c=>c.type==='range').length};
await fs.writeFile('vx-maintenance/check-result.json',JSON.stringify(out,null,2));
console.log(JSON.stringify(out));if(out.status!=='passed')process.exitCode=1;
