import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {flattenTree,SOURCE_PATHS,prepareContentFiles} from '../vx-maintenance/repair.mjs';
const ROOT=path.dirname(fileURLToPath(import.meta.url));
const TEAM='team_44tkvxP20I5s9SUmlxfUEQM1';
const ORIGIN='https://vxsagittarius.vercel.app';
const NEW_FILES=[];
const modules={
 catalog:{project:'prj_CbkfJKuRbzmjT4IsWAitQ3K0oAsE',name:'vxsagittarius-content',host:'vxsagittarius-content.vercel.app',baseline:'dpl_BK2BJvPsxu4Yh2hDXHEj1jN4p9ub',paths:SOURCE_PATHS},
 main:{project:'prj_bh5zjYhzdYkITXrIJ7vSSA2ua9lI',name:'vxsagittarius',host:'vxsagittarius.vercel.app',baseline:'dpl_7fDRmt4HTjSjpsuACtbXc1wP3Tyz',paths:['package.json','vercel.json','build.mjs','main.mjs','source-manifest.json',...['404.html','about/index.html','assets/home-catalog.css','assets/motion.js','assets/operations.css','assets/operations.js','assets/repairs.css','assets/site.css','assets/site.js','assets/works/folio-reveal.js','assets/works/work-navigation.js','assets/works/works.css','assets/works/works.js','booking/index.html','index.html','library/index.html','nebula/index.html','robots.txt'].map(p=>'source/'+p)]}
};
const hash=x=>createHash('sha256').update(x).digest('hex');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const receipt={status:'started',stage:'restore',startedAt:new Date().toISOString(),deployments:{}};
const save=()=>fs.writeFile(path.join(ROOT,'publication-receipt.json'),JSON.stringify(receipt,null,2));
async function api(route,options={}){
 const u=new URL(route,'https://api.vercel.com');u.searchParams.set('teamId',TEAM);
 for(let attempt=0;attempt<3;attempt++){
  let r;
  try{r=await fetch(u,{...options,redirect:'error',headers:{'Content-Type':'application/json',...options.headers,Authorization:`Bearer ${process.env.VERCEL_TOKEN}`},signal:AbortSignal.timeout(45000)});}
  catch{if(attempt<2&&!options.method){await pause(1500);continue;}throw Error('Vercel API connection failed');}
  if(!r.ok){if(attempt<2&&!options.method&&[429,500,502,503,504].includes(r.status)){await pause(1500);continue;}throw Error(`Vercel HTTP ${r.status}`);}
  const body=await r.text();return body?JSON.parse(body):{};
 }
}
async function live(m){const d=await api('/v13/deployments/'+m.host);assert.equal(d.projectId??d.project?.id,m.project);return d.id??d.uid;}
async function restore(m,dir){
 assert.equal(await live(m),m.baseline,'Production baseline changed: '+m.name);
 const entries=flattenTree(await api(`/v6/deployments/${m.baseline}/files?base=src`));
 assert.deepEqual(entries.map(e=>e.file).sort(),m.paths.toSorted(),'Unexpected source set: '+m.name);
 const source=new Map();
 for(const entry of entries){
  const result=await api(`/v8/deployments/${m.baseline}/files/${entry.uid}`);
  const raw=typeof result==='string'?result:result.data??result.content;
  assert(typeof raw==='string'&&/^[A-Za-z0-9+/]*={0,2}$/.test(raw),'Invalid source encoding');
  const data=Buffer.from(raw,'base64');assert(data.length<2000000);
  if(!/\.(jpeg|webp)$/.test(entry.file))assert(Buffer.from(data.toString('utf8')).equals(data));
  const dest=path.join(dir,entry.file);await fs.mkdir(path.dirname(dest),{recursive:true});await fs.writeFile(dest,data);source.set(entry.file,hash(data));
 }
 return source;
}
function run(bin,args,cwd){
 const r=spawnSync(bin,args,{cwd,env:{PATH:process.env.PATH,CI:'true'},encoding:'utf8',timeout:120000,maxBuffer:2000000});
 assert.equal(r.status,0,`Validation failed: ${args.join(' ')} ${r.stderr.slice(0,400)} ${r.stdout.slice(-400)}`);console.log(r.stdout.trim());
}
const json=async p=>JSON.parse(await fs.readFile(p,'utf8'));
async function ready(id,project){
 for(let i=0;i<60;i++){const d=await api('/v13/deployments/'+id);assert.equal(d.projectId??d.project?.id,project);if(d.readyState==='READY')return;assert(!['ERROR','CANCELED'].includes(d.readyState),`Deployment ${d.readyState}`);await pause(5000);}
 throw Error('Deployment readiness timeout');
}
async function verify(url,predicate){
 for(let i=0;i<12;i++){
  const r=await fetch(url,{signal:AbortSignal.timeout(30000),redirect:'error',headers:{'Cache-Control':'no-cache'}});
  if(r.ok&&predicate(Buffer.from(await r.arrayBuffer())))return;
  await pause(5000);
 }
 throw Error('Public verification failed: '+new URL(url).pathname);
}
let temp;
try{
 assert(process.env.VERCEL_TOKEN,'Publishing authorization unavailable');await save();
 temp=await fs.mkdtemp(path.join(os.tmpdir(),'vx-classification-resolution-20261006-'));
 const originals={};for(const [key,m] of Object.entries(modules))originals[key]=await restore(m,path.join(temp,key));
 const cat=path.join(temp,'catalog'),main=path.join(temp,'main');
 const beforeConfig=await json(path.join(cat,'vercel.json'));
 const beforeWorks=await json(path.join(cat,'content/works.json'));
 const beforeMedia=await json(path.join(cat,'content/media.json'));
 assert.equal(beforeWorks.length,32);assert.equal(beforeConfig.rewrites.length,128);
 run(process.execPath,[path.join(ROOT,'apply-update.mjs'),temp],ROOT);
 receipt.stage='validate';await save();
 run(process.execPath,['--test',path.join(ROOT,'classification.test.mjs')],ROOT);
 run(process.execPath,['--check',path.join(main,'source/assets/works/works.js')],ROOT);
 run(process.execPath,['build.mjs'],cat);run(process.execPath,['build.mjs'],main);
 const afterWorks=await json(path.join(cat,'content/works.json'));
 assert.deepEqual(afterWorks,await json(path.join(ROOT,'patch/catalog/content/works.json')),'Classification differs from approved patch');
 for(const old of beforeWorks){const next=afterWorks.find(w=>w.id===old.id);assert(next);for(const key of ['width','height','duration','poster','description'])assert.deepEqual(next[key],old[key],'Unrelated work field changed');}
 assert.deepEqual(await json(path.join(cat,'content/media.json')),beforeMedia,'Media changed');
 const afterConfig=await json(path.join(cat,'vercel.json'));
 const normalize=c=>{c=structuredClone(c);for(const rule of c.headers??[])for(const h of rule.headers??[])if(h.key.toLowerCase()==='x-vx-content-revision')h.value='<revision>';return c;};
 assert.deepEqual(normalize(afterConfig),normalize(beforeConfig),'Routing or security changed');
 for(const [key,original] of Object.entries(originals)){
  const allowed=new Set(key==='catalog'?['content/works.json','catalog.mjs','vercel.json']:[]);
  for(const [file,sha] of original)if(!allowed.has(file))assert.equal(hash(await fs.readFile(path.join(temp,key,file))),sha,'Unrelated source changed: '+file);
 }
 const health=await json(path.join(cat,'public/health.json'));
 receipt.revision=health.revision;receipt.worksPreserved=32;receipt.mediaRoutesPreserved=128;receipt.classifications=Object.fromEntries((await json(path.join(ROOT,'classification.json'))).categories.map(c=>[c.id,afterWorks.filter(w=>w.category===c.id).length]));receipt.visualReview=await json(path.join(ROOT,'browser-verification.json'));assert.equal(receipt.visualReview.status,'passed','Browser verification required');await save();
 for(const [key,m] of Object.entries({catalog:modules.catalog})){
  receipt.stage='publish-'+key;await save();assert.equal(await live(m),m.baseline,'Concurrent production change');
  if(key==='main')assert.equal(await live(modules.catalog),receipt.deployments.catalog.id,'Content changed during classification publication');
  const names=[...new Set([...m.paths,...(key==='catalog'?NEW_FILES:[])])];
  const source=await Promise.all(names.map(async file=>({file,bytes:await fs.readFile(path.join(temp,key,file))})));
  const files=key==='catalog'?await prepareContentFiles(source,api):source.map(({file,bytes})=>({file,data:bytes.toString('utf8'),encoding:'utf-8'}));
  const d=await api('/v13/deployments',{method:'POST',body:JSON.stringify({name:m.name,project:m.project,target:'production',files,projectSettings:{framework:null,buildCommand:'npm run build',installCommand:'echo No external dependencies',outputDirectory:'public'},meta:{reason:'Resolve user-delegated visual classifications for works 005 and 009 only',baselineDeploymentId:m.baseline,githubCommitSha:process.env.GITHUB_SHA}})});
  const id=d.id??d.uid;assert(/^dpl_[a-zA-Z0-9]+$/.test(id));receipt.deployments[key]={id,url:d.url,baseline:m.baseline};await save();await ready(id,m.project);
  let assigned=false;for(let i=0;i<24;i++){if(await live(m)===id){assigned=true;break;}await pause(5000);}assert(assigned,'Production alias not assigned');
  if(key==='catalog')await verify('https://'+m.host+'/activities/',b=>b.toString().includes('data-reward-points="50"'));
 }
 receipt.mainDeploymentPreserved=await live(modules.main);assert.equal(receipt.mainDeploymentPreserved,modules.main.baseline);receipt.stage='verify-public';await save();
 const targets=[
  [ORIGIN+'/works/',b=>b.toString().includes('id="vx-craft-filter"')&&b.toString().includes('GENERAL SERVICES')],
  [ORIGIN+'/health.json',b=>JSON.parse(b).revision===health.revision&&JSON.parse(b).count===32],
  [ORIGIN+'/catalog.json',b=>JSON.stringify(JSON.parse(b).works)===JSON.stringify(afterWorks)],
  [ORIGIN+'/activities/',b=>b.toString().includes('AirPods 5 無線耳機')&&b.toString().includes('vx-art-neighborhood-map.jpeg')],
  [ORIGIN+'/booking/',b=>b.toString().includes('id="vx-art-map"')]
 ];
 for(const file of ['assets/works/works.js','assets/works/works.css','index.html']){
  const expected=hash(await fs.readFile(path.join(main,'source',file)));targets.push([ORIGIN+'/'+(file==='index.html'?'':file),b=>hash(b)===expected]);
 }
 const mapHash=hash(await fs.readFile(path.join(cat,'content/pages/activities/vx-art-neighborhood-map.jpeg')));
 targets.push([ORIGIN+'/activities/vx-art-neighborhood-map.jpeg',b=>hash(b)===mapHash]);
 for(const [url,predicate] of targets)await verify(url,predicate);
 receipt.originalMapPreserved=true;receipt.publicChecks=targets.length;receipt.status='verified';receipt.stage='complete';receipt.finishedAt=new Date().toISOString();await save();console.log(JSON.stringify(receipt));
}catch(e){receipt.status='failed';receipt.error=e.message;await save();console.error(e.message);process.exitCode=1;}
finally{if(temp)await fs.rm(temp,{recursive:true,force:true});}


