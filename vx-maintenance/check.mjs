import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const ORIGIN='https://vxsagittarius.vercel.app';
const PRIVACY='https://vxsagittarius-media-privacy-2026091.vercel.app';
const out={startedAt:new Date().toISOString(),status:'checking',checks:[],errors:[],unverified:['Physical iPhone/Android layout','Visual face masking across every frame; verify samples in browser','Private runtime logs']};
async function request(url,method='GET'){
  let r;
  for(let i=0;i<2;i++){
    try{r=await fetch(url,{method,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(30000)});if(r.ok)return r;}catch(e){if(i)throw e;}
  }
  assert.equal(r?.status,200,`HTTP_${r?.status}:${url}`);return r;
}
async function batch(items,fn){for(let i=0;i<items.length;i+=8)await Promise.all(items.slice(i,i+8).map(async item=>{try{await fn(item);}catch(e){out.errors.push({item,error:e.message.slice(0,200)});}}));}
try{
  const health=await (await request(ORIGIN+'/health.json')).json();assert.equal(health.status,'healthy');
  const catalog=await (await request(ORIGIN+'/catalog.json')).json();assert.equal(catalog.revision,health.revision);assert.equal(catalog.works.length,health.count);
  const privacy=await (await request(PRIVACY+'/privacy-manifest.json')).json();assert.equal(privacy.count,privacy.assets.length);
  out.contentRevision=health.revision;out.works=catalog.works.length;out.privacyRevision=privacy.revision;
  const filmProof=new Map(privacy.assets.map(a=>['/'+a.path,a]));
  const siteMap=await (await request(ORIGIN+'/sitemap.xml')).text();
  const urls=[...new Set([...siteMap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>m[1]))];
  assert.ok(urls.length>=catalog.works.length+8,'INCOMPLETE_SITEMAP');
  await batch(urls,async url=>{assert.equal(new URL(url).origin,ORIGIN);const r=await request(url);const text=await r.text();assert.ok((r.headers.get('content-type')||'').includes('text/html'));assert.ok(text.includes('<main'),'MISSING_MAIN');if(url.includes('/works/009/'))assert.ok(!text.includes('榛果粽'),'TYPO_REGRESSION');out.checks.push({type:'page',url,status:200});});
  const assets=catalog.works.flatMap(w=>['film.mp4',w.poster,'cover-384.webp','cover-768.webp'].map(f=>'/assets/works/'+w.id+'/'+f));
  await batch(assets,async asset=>{
    const r=await request(ORIGIN+asset,'HEAD');const type=r.headers.get('content-type')||'';assert.ok(type.startsWith(asset.endsWith('.mp4')?'video/':'image/'),'ASSET_TYPE');assert.ok(Number(r.headers.get('content-length'))>0,'EMPTY_ASSET');
    const proof=filmProof.get(asset);if(proof){assert.equal(Number(r.headers.get('content-length')),proof.bytes,'PRIVACY_SIZE_REGRESSION');assert.equal(r.headers.get('x-vx-privacy-sha256'),proof.sha256,'PRIVACY_ROUTE_REGRESSION');}
    out.checks.push({type:'asset',path:asset,status:200,privacyRoute:!!proof});
  });
  for(const id of ['001','032']){if(!catalog.works.some(w=>w.id===id))continue;const r=await fetch(ORIGIN+'/assets/works/'+id+'/film.mp4',{headers:{Range:'bytes=0-1023'},redirect:'error',signal:AbortSignal.timeout(30000)});assert.equal(r.status,206,'VIDEO_RANGE_FAILED');assert.equal((await r.arrayBuffer()).byteLength,1024);out.checks.push({type:'range',id,status:206});}
  out.status=out.errors.length?'issues-found':'passed';
}catch(e){out.status='failed';out.errors.push({error:e.message.slice(0,200)});}
out.finishedAt=new Date().toISOString();out.counts={pages:out.checks.filter(c=>c.type==='page').length,assets:out.checks.filter(c=>c.type==='asset').length,privacyRoutes:out.checks.filter(c=>c.privacyRoute).length,ranges:out.checks.filter(c=>c.type==='range').length};
await fs.writeFile('vx-maintenance/check-result.json',JSON.stringify(out,null,2));
console.log(JSON.stringify(out));if(out.status!=='passed')process.exitCode=1;
