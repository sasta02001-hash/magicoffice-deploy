import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';

export const TEAM = 'team_44tkvxP20I5s9SUmlxfUEQM1';
export const PROJECT = 'prj_CbkfJKuRbzmjT4IsWAitQ3K0oAsE';
export const PRIVACY_PROJECT = 'prj_jf0F7rOmNEepg1AKF19uwAGSrUvl';
export const CONTENT_HOST = 'vxsagittarius-content.vercel.app';
export const PUBLIC_ORIGIN = 'https://vxsagittarius.vercel.app';
export const PRIVACY_ORIGIN = 'https://vxsagittarius-media-privacy-2026091.vercel.app';
export const BASELINE = 'dpl_EJhQ4ADY5or9rtHRTS2c1nFn1akQ';
export const PRIVACY_BASELINE = 'dpl_DqhBHvq2jtHSsw9MN1pKz7ZBmz8Q';
export const MAIN_BASELINE = 'dpl_EKxT52NtX61YzRszzjwThd92Fqy7';
export const SOURCE_PATHS = Object.freeze([
  'package.json','vercel.json','build.mjs','catalog.mjs','templates/works.html',
  'content/works.json','content/media.json','content/site-routes.json',
  'content/pages/404.html','content/pages/activities/index.html','content/pages/services/index.html',
  ...['color','perm','bleach','triascend','trifusion','triform','trievolve'].map(s => `content/pages/project-${s}/index.html`),
]);
const DIR = path.dirname(fileURLToPath(import.meta.url));
const hash = value => createHash('sha256').update(value).digest('hex');
const equal = (a,b) => JSON.stringify(a) === JSON.stringify(b);
const assert = (ok,message) => { if (!ok) throw new Error(message); };
const pause = ms => new Promise(resolve => setTimeout(resolve,ms));
const cleanEnv = () => ({PATH:process.env.PATH,CI:'true',NODE_ENV:'test'});

function parseJson(text,label) {
  try { return JSON.parse(text); } catch { throw new Error(`Invalid JSON: ${label}`); }
}

export function safePath(value) {
  assert(typeof value === 'string' && value.length > 0 && value.length < 250,'Invalid source path');
  assert(!value.includes('\\') && !value.includes('\0') && !value.startsWith('/'),'Unsafe source path');
  assert(!value.split('/').some(s => s === '..' || s === '.' || s === ''),'Unsafe source path');
  return value;
}

export function flattenTree(tree) {
  const result = [];
  const visit = (items,prefix='') => {
    assert(Array.isArray(items),'Invalid source tree');
    for (const item of items) {
      assert(item && typeof item === 'object','Invalid source entry');
      let name = item.name ?? item.path;
      assert(typeof name === 'string','Source filename missing');
      let file = prefix ? `${prefix}/${name}` : name;
      if (file === 'src' && Array.isArray(item.children)) { visit(item.children,''); continue; }
      if (!prefix && file.startsWith('src/')) file = file.slice(4);
      safePath(file);
      if (Array.isArray(item.children)) visit(item.children,file);
      else if (item.type === 'directory') continue;
      else {
        assert(item.type==='file' || item.type===undefined,'Unsupported source entry type');
        assert(typeof item.uid === 'string' && /^[a-zA-Z0-9_-]+$/.test(item.uid),'Source UID missing or invalid');
        result.push({file,uid:item.uid,size:item.size ?? null});
      }
    }
  };
  visit(Array.isArray(tree) ? tree : tree?.files);
  assert(new Set(result.map(x=>x.file)).size === result.length,'Duplicate source path');
  return result.sort((a,b)=>a.file.localeCompare(b.file));
}

export function validateSourceSet(entries) {
  assert(entries.length === SOURCE_PATHS.length,'Unexpected content source file count');
  assert(entries.every(x=>SOURCE_PATHS.includes(x.file)),'Unexpected content source file');
  assert(SOURCE_PATHS.every(file=>entries.some(x=>x.file===file)),'Required content source missing');
  return entries;
}

export function validatePrivacyManifest(raw) {
  const assets = Array.isArray(raw) ? raw : raw?.assets;
  assert(Array.isArray(assets) && assets.length === 24,'Privacy manifest must contain exactly 24 films');
  const ids = new Set();
  return assets.map(asset => {
    const match = asset.path?.match(/^assets\/works\/(\d{3})\/film\.mp4$/);
    assert(match && Number(match[1])>=1 && Number(match[1])<=32,'Unexpected privacy asset path');
    const id=match[1]; assert(!ids.has(id),'Duplicate privacy asset'); ids.add(id);
    assert(Number.isSafeInteger(asset.bytes) && asset.bytes>0 && asset.bytes<200_000_000,'Invalid privacy asset size');
    assert(/^[a-f0-9]{64}$/.test(asset.sha256),'Invalid privacy asset hash');
    if (asset.url) assert(asset.url===`${PRIVACY_ORIGIN}/${asset.path}`,'Unexpected privacy asset URL');
    return {id,path:asset.path,bytes:asset.bytes,sha256:asset.sha256,url:`${PRIVACY_ORIGIN}/${asset.path}`};
  });
}

export function repairMetadata(originalWorks,originalMedia,assets) {
  assert(Array.isArray(originalWorks) && originalWorks.length===32,'Expected 32 works');
  assert(new Set(originalWorks.map(w=>w.id)).size===32,'Duplicate current work');
  assert(originalMedia && Array.isArray(originalMedia.allowedOrigins) && originalMedia.works,'Invalid current media registry');
  const works=structuredClone(originalWorks), media=structuredClone(originalMedia);
  const selected = new Set(assets.map(x=>x.id));
  for (const asset of assets) {
    const entry=media.works[asset.id];
    assert(entry?.files?.['film.mp4'],'Privacy work is missing current film');
    entry.files['film.mp4']={...entry.files['film.mp4'],url:asset.url,bytes:asset.bytes,sha256:asset.sha256};
  }
  if(!media.allowedOrigins.includes(PRIVACY_ORIGIN))media.allowedOrigins.push(PRIVACY_ORIGIN);
  const replace = value => typeof value==='string' ? value.replaceAll('榛果粽','榛果棕') : Array.isArray(value) ? value.map(replace) : value && typeof value==='object' ? Object.fromEntries(Object.entries(value).map(([k,v])=>[k,replace(v)])) : value;
  const index=works.findIndex(w=>w.id==='009'); assert(index>=0,'Work 009 missing'); works[index]=replace(works[index]);
  for(const work of originalWorks) {
    if(work.id!=='009')assert(equal(work,works.find(w=>w.id===work.id)),'Unrelated work changed');
    const before=originalMedia.works[work.id],after=media.works[work.id];
    if(!selected.has(work.id))assert(equal(before,after),'Unrelated media changed');
    else {
      const a=structuredClone(before),b=structuredClone(after); delete a.files['film.mp4'];delete b.files['film.mp4'];
      assert(equal(a,b),'Cover or poster changed');
    }
  }
  const a=structuredClone(originalMedia),b=structuredClone(media);delete a.works;delete b.works;delete a.allowedOrigins;delete b.allowedOrigins;
  assert(equal(a,b),'Media registry metadata changed');
  return {works,media};
}

export function assertRewrites(before,after,assets) {
  assert(Array.isArray(before)&&Array.isArray(after)&&before.length===128&&after.length===128,'Expected 128 media rewrites');
  assert(new Set(after.map(r=>r.source)).size===128,'Duplicate media rewrite');
  const changes=new Map(assets.map(a=>[`/${a.path}`,a.url]));
  for(const old of before) {
    const next=after.find(r=>r.source===old.source);assert(next,'Existing media rewrite missing');
    if(changes.has(old.source))assert(next.destination===changes.get(old.source),'Per-file URL not supported: privacy rewrite missing');
    else assert(equal(old,next),'Unrelated media rewrite changed');
  }
}

export function assertConfigPreserved(before,after) {
  const normalize = config => {
    const value=structuredClone(config);delete value.rewrites;
    for(const rule of value.headers??[])for(const header of rule.headers??[])if(header.key.toLowerCase()==='x-vx-content-revision')header.value='<revision>';
    return value;
  };
  assert(equal(normalize(before),normalize(after)),'Unrelated deployment configuration changed');
}

async function parallel(items,limit,fn) {
  const results=new Array(items.length);let next=0;
  await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{
    while(next<items.length){const i=next++;results[i]=await fn(items[i],i);}
  })); return results;
}

function createAPI(token) {
  assert(typeof token==='string' && token.length>0,'VERCEL_TOKEN unavailable');
  return async function api(route,options={}) {
    assert(route.startsWith('/')&&!route.includes('://'),'Invalid API route');
    const url=new URL(route,'https://api.vercel.com');url.searchParams.set('teamId',TEAM);
    for(let attempt=0;attempt<3;attempt++){
      let response;
      try { response=await fetch(url,{...options,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},signal:AbortSignal.timeout(45_000),redirect:'error'}); }
      catch { if(attempt<2&&(!options.method||options.method==='GET')){await pause(1500);continue;}throw new Error('Vercel API request failed'); }
      if(!response.ok){if(attempt<2&&[429,500,502,503,504].includes(response.status)&&(!options.method||options.method==='GET')){await pause(1500);continue;}throw new Error(`Vercel API HTTP ${response.status}`);}
      return parseJson(await response.text(),'Vercel response');
    }
  };
}

async function contentProductionId(api) {
  const info=await api(`/v13/deployments/${CONTENT_HOST}`);
  assert(info.projectId===PROJECT || info.project?.id===PROJECT,'Content alias belongs to a different project');
  const id=info.id??info.uid;assert(/^dpl_[a-zA-Z0-9]+$/.test(id),'Invalid production deployment ID');return id;
}
async function deployment(api,id,project) {
  const info=await api(`/v13/deployments/${encodeURIComponent(id)}`);
  assert((info.id??info.uid)===id,'Deployment identity mismatch');
  assert(info.projectId===project || info.project?.id===project,'Deployment belongs to a different project');
  return info;
}
async function getSourceText(api,deploymentId,entry) {
  if(entry.size!==null)assert(Number(entry.size)<=2_000_000,'Source text exceeds size limit');
  const file=await api(`/v8/deployments/${deploymentId}/files/${entry.uid}`);
  assert(typeof file==='string' || file.encoding==='base64' || file.encoding===undefined,'Unsupported source encoding');
  const data=typeof file==='string'?file:(file.data??file.content);
  assert(typeof data==='string'&&/^[A-Za-z0-9+/]*={0,2}$/.test(data),'Invalid base64 source file');
  const bytes=Buffer.from(data,'base64'); assert(bytes.length<=2_000_000,'Source text exceeds size limit');
  const text=bytes.toString('utf8');assert(Buffer.from(text).equals(bytes),'Source is not UTF-8');return text;
}
async function restoreContent(api,id,temp) {
  await deployment(api,id,PROJECT);
  const entries=validateSourceSet(flattenTree(await api(`/v6/deployments/${id}/files?base=src`)));
  const result=await parallel(entries,3,async entry=>{
    const text=await getSourceText(api,id,entry);const dest=path.join(temp,entry.file);
    await fs.mkdir(path.dirname(dest),{recursive:true});await fs.writeFile(dest,text,{mode:0o600});
    return {...entry,bytes:Buffer.byteLength(text),sha256:hash(text)};
  });return result;
}
async function publicBytes(url,{maxBytes=200_000_000}={}) {
  const allowed=[PUBLIC_ORIGIN,PRIVACY_ORIGIN,`https://${CONTENT_HOST}`];
  assert(allowed.includes(new URL(url).origin),'Unexpected public request origin');
  let response;
  try {response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(90_000),headers:{'Cache-Control':'no-cache'}});}catch {throw new Error('Public request failed or redirected');}
  assert(response.ok,`Public HTTP ${response.status}`);
  const length=Number(response.headers.get('content-length')??0);assert(length<=maxBytes,'Public response exceeds size limit');
  const chunks=[];let total=0;
  for await(const chunk of response.body){total+=chunk.length;assert(total<=maxBytes,'Public response exceeds size limit');chunks.push(chunk);}
  return {bytes:Buffer.concat(chunks),headers:response.headers};
}
async function publicJSON(url) {const r=await publicBytes(url,{maxBytes:2_000_000});return parseJson(r.bytes.toString('utf8'),'public JSON');}
async function verifyAsset(asset,origin) {
  const result=await publicBytes(`${origin}/${asset.path}`);
  assert(result.headers.get('content-type')?.includes('video/mp4'),'Privacy asset is not MP4');
  assert(result.bytes.length===asset.bytes,'Privacy asset byte count mismatch');
  assert(hash(result.bytes)===asset.sha256,'Privacy asset SHA-256 mismatch');
  return {path:asset.path,bytes:asset.bytes,sha256:asset.sha256,verified:true};
}
async function writeJSON(file,data){await fs.writeFile(file,JSON.stringify(data,null,2)+'\n',{mode:0o600});}

async function inspectPrivacy(api,id) {
  const info=await deployment(api,id,PRIVACY_PROJECT);
  const entries=flattenTree(await api(`/v6/deployments/${id}/files?base=src`));
  assert(entries.length<5000,'Privacy source tree unexpectedly large');
  const manifest=entries.find(e=>e.file==='manifest.json');
  const summary={deploymentId:id,state:info.readyState??info.status,sourceFiles:entries.map(e=>({file:e.file,size:e.size})),manifest:null};
  if(manifest){
    const data=parseJson(await getSourceText(api,id,manifest),'privacy manifest');
    const assets=Array.isArray(data.assets)?data.assets:[];
    summary.manifest={stage:data.stage??null,totalStages:data.totalStages??null,finalize:data.finalize??null,assetCount:assets.length,
      assets:assets.map(a=>({path:typeof a.path==='string'?safePath(a.path):null,bytes:a.bytes,sha256:a.sha256,parts:Array.isArray(a.parts)?a.parts.filter(p=>typeof p==='string'&&/^_upload\/[a-zA-Z0-9_.-]+$/.test(p)):[]})),
      partCount:entries.filter(e=>e.file.startsWith('_upload/')).length,
      partBytes:entries.filter(e=>e.file.startsWith('_upload/')).reduce((sum,e)=>sum+(Number(e.size)||0),0)};
  }
  return summary;
}

async function inspectContent(temp) {
  const works=parseJson(await fs.readFile(path.join(temp,'content/works.json'),'utf8'),'works');
  const media=parseJson(await fs.readFile(path.join(temp,'content/media.json'),'utf8'),'media');
  const catalog=await fs.readFile(path.join(temp,'catalog.mjs'),'utf8');
  const overrides=[];
  for(const [id,work] of Object.entries(media.works??{}))for(const [file,proof] of Object.entries(work.files??{}))if(proof.url){const u=new URL(proof.url);overrides.push({id,file,url:u.origin+u.pathname});}
  return {works,media,summary:{count:works.length,allowedOrigins:media.allowedOrigins.map(origin=>new URL(origin).origin),
    baseOrigins:[...new Set(Object.values(media.works??{}).map(w=>new URL(w.base).origin))],perFileOverrides:overrides,
    supportsPerFileUrl: /\bproof\.url\b|\bfile\.url\b|\[file\]\??\.url|\basset\.url\b/.test(catalog),
    work009HasTypo:JSON.stringify(works.find(w=>w.id==='009')).includes('榛果粽')}};
}

const SOURCE_TEST = `import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport fs from 'node:fs';\nimport {validateWorks,mediaRewrites,render} from '../catalog.mjs';\nconst read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');\nconst works=JSON.parse(read('content/works.json')),media=JSON.parse(read('content/media.json'));\ntest('all 32 works survive catalog validation and direct-page render',()=>{assert.equal(validateWorks(works).length,32);for(const w of works){assert.ok(render(read('templates/works.html'),works,w.id).includes('/works/'+w.id+'/'));}});\ntest('all registered per-file destinations are honored and covers remain registered',()=>{const rules=mediaRewrites(works,media);assert.equal(rules.length,128);for(const w of works)for(const [file,proof] of Object.entries(media.works[w.id].files)){if(!['cover-384.webp','cover-768.webp',w.poster,'film.mp4'].includes(file))continue;assert.equal(rules.find(r=>r.source==='/assets/works/'+w.id+'/'+file)?.destination,proof.url??media.works[w.id].base+'/'+file);}});\n`;

function runQuiet(command,args,cwd,label) {
  const result=spawnSync(command,args,{cwd,env:cleanEnv(),encoding:'utf8',timeout:120_000,maxBuffer:1_000_000});
  assert(result.status===0,`${label} failed`);
}

export async function run() {
  const receipt={startedAt:new Date().toISOString(),status:'started',stage:'request',contentProjectId:PROJECT};
  const save=()=>writeJSON(path.join(DIR,'receipt.json'),receipt);
  let temp;
  try {
    await save();
    const request=parseJson(await fs.readFile(path.join(DIR,'request.json'),'utf8'),'request');
    assert(['inspect','repair'].includes(request.mode),'Request mode must be inspect or repair');
    receipt.mode=request.mode;
    const expected=request.expectedDeploymentId??BASELINE;
    assert(typeof expected==='string'&&/^dpl_[a-zA-Z0-9]+$/.test(expected),'Invalid baseline deployment ID');
    const privacyId=request.privacyDeploymentId??PRIVACY_BASELINE;
    assert(typeof privacyId==='string'&&/^dpl_[a-zA-Z0-9]+$/.test(privacyId),'Invalid privacy deployment ID');
    if(request.mode==='repair')assert(/^[a-f0-9]{64}$/.test(request.expectedRevision),'Repair requires expectedRevision');
    const api=createAPI(process.env.VERCEL_TOKEN);
    const expectedMain=request.expectedMainDeploymentId??MAIN_BASELINE;
    assert(typeof expectedMain==='string'&&/^dpl_[a-zA-Z0-9]+$/.test(expectedMain),'Invalid main baseline deployment ID');
    const mainUnchanged=async()=>{const live=await api('/v13/deployments/vxsagittarius.vercel.app');assert((live.id??live.uid)===expectedMain,'Main production changed: baseline mismatch');};
    receipt.stage='baseline';receipt.baselineDeploymentId=expected;
    receipt.mainBaselineDeploymentId=expectedMain;await mainUnchanged();
    assert(await contentProductionId(api)===expected,'Content production changed: baseline mismatch');
    temp=await fs.mkdtemp(path.join(os.tmpdir(),'vx-content-repair-'));await fs.chmod(temp,0o700);
    receipt.stage='restore';await save();
    const entries=await restoreContent(api,expected,temp);
    receipt.sourceFiles=entries.map(({file,bytes,sha256})=>({file,bytes,sha256}));
    const current=await inspectContent(temp);receipt.content=current.summary;
    receipt.stage='privacy-inspection';receipt.privacy=await inspectPrivacy(api,privacyId);await save();
    if(request.mode==='inspect'){receipt.status='inspected';receipt.stage='complete';receipt.finishedAt=new Date().toISOString();await save();return receipt;}
    receipt.stage='verify-privacy-assets';await save();
    const manifest=parseJson(await fs.readFile(path.join(DIR,'privacy-assets.json'),'utf8'),'privacy assets');
    const assets=validatePrivacyManifest(manifest);
    receipt.privacyAssetChecks=await parallel(assets,3,asset=>verifyAsset(asset,PRIVACY_ORIGIN));await save();
    const initialHealth=await publicJSON(`${PUBLIC_ORIGIN}/health.json`);
    assert(initialHealth.revision===request.expectedRevision&&initialHealth.count===32,'Public revision changed: baseline mismatch');
    receipt.stage='prepare';
    const originalConfig=parseJson(await fs.readFile(path.join(temp,'vercel.json'),'utf8'),'original config');
    const {works,media}=repairMetadata(current.works,current.media,assets);
    await writeJSON(path.join(temp,'content/works.json'),works);await writeJSON(path.join(temp,'content/media.json'),media);
    const pkg=parseJson(await fs.readFile(path.join(temp,'package.json'),'utf8'),'package');
    assert(pkg.scripts?.build==='node build.mjs'&&pkg.scripts?.test==='node --test test/*.test.mjs','Unexpected build or test command');
    assert(!Object.keys(pkg.dependencies??{}).length&&!Object.keys(pkg.devDependencies??{}).length,'Unexpected external dependencies');
    await fs.mkdir(path.join(temp,'test'));await fs.writeFile(path.join(temp,'test/maintenance.test.mjs'),SOURCE_TEST);
    receipt.stage='tests';await save();runQuiet('npm',['test'],temp,'Catalog tests');
    receipt.stage='build';await save();runQuiet(process.execPath,['build.mjs'],temp,'Catalog build');
    const generated=parseJson(await fs.readFile(path.join(temp,'vercel.json'),'utf8'),'generated config');
    assertRewrites(originalConfig.rewrites,generated.rewrites,assets);
    assertConfigPreserved(originalConfig,generated);
    for(const entry of entries.filter(e=>!['content/works.json','content/media.json','vercel.json'].includes(e.file)))assert(hash(await fs.readFile(path.join(temp,entry.file)))===entry.sha256,'Unrelated source file changed');
    const builtHealth=parseJson(await fs.readFile(path.join(temp,'public/health.json'),'utf8'),'built health');
    assert(builtHealth.count===32&&/^[a-f0-9]{64}$/.test(builtHealth.revision),'Invalid built health');receipt.expectedNewRevision=builtHealth.revision;
    const files=await Promise.all(SOURCE_PATHS.map(async file=>({file,data:await fs.readFile(path.join(temp,file),'utf8'),encoding:'utf-8'})));
    assert(Buffer.byteLength(JSON.stringify(files))<1_000_000,'Content deployment payload too large');
    receipt.stage='concurrency-check';await save();
    await mainUnchanged();
    assert(await contentProductionId(api)===expected,'Content production changed before deployment');
    const preDeployHealth=await publicJSON(`${PUBLIC_ORIGIN}/health.json`);
    assert(preDeployHealth.revision===request.expectedRevision&&preDeployHealth.count===32,'Public revision changed before deployment');
    receipt.stage='deploy-request';await save();
    const created=await api('/v13/deployments',{method:'POST',body:JSON.stringify({name:'vxsagittarius-content',project:PROJECT,target:'production',files,projectSettings:{framework:null,buildCommand:'npm run build',installCommand:'echo No external dependencies',outputDirectory:'public'},meta:{reason:'VX privacy media routing and work009 spelling repair',baselineDeploymentId:expected}})});
    const newId=created.id??created.uid;assert(/^dpl_[a-zA-Z0-9]+$/.test(newId),'Deployment did not return a valid ID');
    receipt.deploymentId=newId;receipt.deploymentState=created.readyState??created.status;receipt.status='deployment-created';receipt.stage='deployment-poll';await save();
    let ready=false;
    for(let n=0;n<60;n++){
      const state=await deployment(api,newId,PROJECT);receipt.deploymentState=state.readyState??state.status;await save();
      if(receipt.deploymentState==='READY'){ready=true;break;}
      assert(!['ERROR','CANCELED'].includes(receipt.deploymentState),'Content deployment failed');await pause(5000);
    }
    assert(ready,'Content deployment did not become READY');receipt.stage='alias-poll';await save();
    let assigned=false;for(let n=0;n<24;n++){if(await contentProductionId(api)===newId){assigned=true;break;}await pause(5000);}
    assert(assigned,'Production alias does not point at new deployment');receipt.productionAliasAssigned=true;
    receipt.stage='post-deploy-health';await save();
    let healthy=false;for(let n=0;n<18;n++){const h=await publicJSON(`${PUBLIC_ORIGIN}/health.json`);if(h.revision===builtHealth.revision&&h.count===32){receipt.publicHealth=h;healthy=true;break;}await pause(5000);}
    assert(healthy,'Published health revision did not converge');
    receipt.stage='post-deploy-assets';await save();receipt.publicAssetChecks=await parallel(assets,3,asset=>verifyAsset(asset,PUBLIC_ORIGIN));await save();
    receipt.stage='post-deploy-pages';await save();
    receipt.publicPages=await parallel(works,4,async w=>{const r=await publicBytes(`${PUBLIC_ORIGIN}/works/${w.id}/`,{maxBytes:1_000_000});const html=r.bytes.toString('utf8');assert(html.includes(`<link rel="canonical" href="${PUBLIC_ORIGIN}/works/${w.id}/">`),'Public work canonical mismatch');if(w.id==='009')assert(!html.includes('榛果粽')&&html.includes('榛果棕'),'Public spelling repair missing');return {id:w.id,status:200};});
    await mainUnchanged();receipt.mainProductionUnchanged=true;
    receipt.status='verified';receipt.stage='complete';receipt.finishedAt=new Date().toISOString();await save();return receipt;
  } catch(error) {
    receipt.status=receipt.deploymentId?'failed-after-deployment':'failed';
    receipt.error=String(error?.message??'Unknown failure').slice(0,250);receipt.finishedAt=new Date().toISOString();await save();throw new Error(`VX maintenance failed at ${receipt.stage}; see receipt.json`);
  } finally { if(temp)await fs.rm(temp,{recursive:true,force:true}); }
}

if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
  run().then(r=>console.log(JSON.stringify({status:r.status,stage:r.stage,deploymentId:r.deploymentId??null,revision:r.publicHealth?.revision??null,count:r.publicHealth?.count??r.content?.count??null,privacyAssetChecks:r.privacyAssetChecks?.length??0,publicAssetChecks:r.publicAssetChecks?.length??0,publicPageChecks:r.publicPages?.length??0,mainProductionUnchanged:r.mainProductionUnchanged??null}))).catch(error=>{console.error(error.message);process.exitCode=1;});
}
