import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {flattenTree,SOURCE_PATHS} from '../vx-maintenance/repair.mjs';

const ROOT=path.dirname(fileURLToPath(import.meta.url));
const TEAM='team_44tkvxP20I5s9SUmlxfUEQM1';
const ORIGIN='https://vxsagittarius.vercel.app';
const modules={
 catalog:{project:'prj_CbkfJKuRbzmjT4IsWAitQ3K0oAsE',name:'vxsagittarius-content',host:'vxsagittarius-content.vercel.app',baseline:'dpl_4r4UGjvKKxeRqf45t3m4M7A5zkfG',paths:[...SOURCE_PATHS]},
 main:{project:'prj_bh5zjYhzdYkITXrIJ7vSSA2ua9lI',name:'vxsagittarius',host:'vxsagittarius.vercel.app',baseline:'dpl_EKxT52NtX61YzRszzjwThd92Fqy7',paths:['package.json','vercel.json','build.mjs','main.mjs','source-manifest.json',...['404.html','about/index.html','assets/home-catalog.css','assets/motion.js','assets/operations.css','assets/operations.js','assets/repairs.css','assets/site.css','assets/site.js','assets/works/folio-reveal.js','assets/works/work-navigation.js','assets/works/works.css','assets/works/works.js','booking/index.html','index.html','library/index.html','nebula/index.html','robots.txt'].map(p=>'source/'+p)]}
};
const hash=x=>createHash('sha256').update(x).digest('hex');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const receipt={status:'started',stage:'restore',startedAt:new Date().toISOString(),deployments:{}};
const save=()=>fs.writeFile(path.join(ROOT,'publication-receipt.json'),JSON.stringify(receipt,null,2));
async function api(route,options={}){
 const u=new URL(route,'https://api.vercel.com');u.searchParams.set('teamId',TEAM);
 const r=await fetch(u,{...options,redirect:'error',headers:{Authorization:`Bearer ${process.env.VERCEL_TOKEN}`,'Content-Type':'application/json'},signal:AbortSignal.timeout(45000)});
 assert(r.ok,`Vercel HTTP ${r.status}`);return r.json();
}
async function live(m){const d=await api('/v13/deployments/'+m.host);assert.equal(d.projectId??d.project?.id,m.project);return d.id??d.uid;}
async function restore(m,dir){
 assert.equal(await live(m),m.baseline,'Production baseline changed');
 const entries=flattenTree(await api(`/v6/deployments/${m.baseline}/files?base=src`));
 assert.deepEqual(entries.map(e=>e.file).sort(),m.paths.toSorted(),'Unexpected source set');
 const source=new Map();
 for(const entry of entries){
  const result=await api(`/v8/deployments/${m.baseline}/files/${entry.uid}`);
  const data=Buffer.from(typeof result==='string'?result:result.data??result.content,'base64');
  assert(data.length<2000000);assert(Buffer.from(data.toString('utf8')).equals(data));
  const dest=path.join(dir,entry.file);await fs.mkdir(path.dirname(dest),{recursive:true});await fs.writeFile(dest,data);
  source.set(entry.file,hash(data));
 }
 return source;
}
function run(bin,args,cwd){
 const r=spawnSync(bin,args,{cwd,env:{PATH:process.env.PATH,CI:'true'},encoding:'utf8',timeout:120000,maxBuffer:2000000});
 if(r.status!==0)throw Error(`Local validation failed: ${bin} ${args.join(' ')} ${r.stderr.slice(0,300)}`);
 console.log(r.stdout.trim());
}
async function readJSON(p){return JSON.parse(await fs.readFile(p,'utf8'));}
async function waitReady(id,project){
 for(let i=0;i<60;i++){
  const d=await api('/v13/deployments/'+id);assert.equal(d.projectId??d.project?.id,project);
  if(d.readyState==='READY')return;
  assert(!['ERROR','CANCELED'].includes(d.readyState),`Deployment ${d.readyState}`);await pause(5000);
 }
 throw Error('Deployment readiness timed out');
}
async function verifyUrl(url,predicate){
 for(let i=0;i<12;i++){
  const r=await fetch(url,{signal:AbortSignal.timeout(30000),redirect:'error',headers:{'Cache-Control':'no-cache'}});
  if(r.ok){const data=Buffer.from(await r.arrayBuffer());if(predicate(data))return;}
  await pause(5000);
 }
 throw Error('Published content did not verify: '+new URL(url).pathname);
}
let temp;
try{
 assert(process.env.VERCEL_TOKEN,'Publishing authorization unavailable');await save();
 temp=await fs.mkdtemp(path.join(os.tmpdir(),'vx-pride-'));
 const originals={};
 for(const [key,m] of Object.entries(modules))originals[key]=await restore(m,path.join(temp,key));
 const cat=path.join(temp,'catalog'),main=path.join(temp,'main');
 const beforeConfig=await readJSON(path.join(cat,'vercel.json'));
 const beforeWorks=await readJSON(path.join(cat,'content/works.json'));
 const beforeMedia=await readJSON(path.join(cat,'content/media.json'));
 run('python3',[path.join(ROOT,'apply_update.py'),temp],ROOT);
 receipt.stage='validate';await save();
 run(process.execPath,['--check',path.join(cat,'content/pages/activities/operations.js')],ROOT);
 run(process.execPath,['build.mjs'],cat);run(process.execPath,['build.mjs'],main);
 assert.deepEqual(await readJSON(path.join(cat,'content/works.json')),beforeWorks,'Works changed');
 assert.deepEqual(await readJSON(path.join(cat,'content/media.json')),beforeMedia,'Media changed');
 const afterConfig=await readJSON(path.join(cat,'vercel.json'));
 const normalize=c=>{c=structuredClone(c);for(const rule of c.headers??[])for(const h of rule.headers??[])if(h.key.toLowerCase()==='x-vx-content-revision')h.value='<revision>';return c;};
 assert.deepEqual(normalize(afterConfig),normalize(beforeConfig),'Routing or security settings changed');
 for(const [key,original] of Object.entries(originals)){
  const allowed=new Set(key==='catalog'?['build.mjs','content/pages/activities/index.html','vercel.json']:['source/index.html','source-manifest.json']);
  for(const [file,sha] of original)if(!allowed.has(file))assert.equal(hash(await fs.readFile(path.join(temp,key,file))),sha,'Unrelated file changed: '+file);
 }
 const poster=await fs.readFile(path.join(ROOT,'patch/catalog/content/pages/activities/pride-2026.jpeg'));
 assert.equal(hash(poster),(await readJSON(path.join(ROOT,'checksums.json')))['patch/catalog/content/pages/activities/pride-2026.jpeg']);
 const opsText=await fs.readFile(path.join(cat,'content/pages/activities/operations.js'),'utf8');
 const vm=await import('node:vm');const context={window:{}};vm.runInNewContext(opsText,context);const ops=context.window.VXOperations;
 const campaign=await readJSON(path.join(ROOT,'campaign.json'));assert(ops.validate(campaign));
 for(const [date,status] of [['2026-09-28T14:00:00+08:00','upcoming'],['2026-10-01T00:00:00+08:00','current'],['2026-10-31T23:59:59+08:00','current'],['2026-11-01T00:00:00+08:00','ended']])assert.equal(ops.status(campaign,Date.parse(date)),status);
 receipt.originalPosterSha256=hash(poster);receipt.worksPreserved=beforeWorks.length;receipt.mediaRoutesPreserved=afterConfig.rewrites.length;receipt.dateBoundariesPassed=true;
 const health=await readJSON(path.join(cat,'public/health.json'));receipt.revision=health.revision;await save();
 for(const [key,m] of Object.entries(modules)){
  receipt.stage='publish-'+key;await save();
  assert.equal(await live(m),m.baseline,'Concurrent production change');
  if(key==='main')assert.equal(await live(modules.catalog),receipt.deployments.catalog.id,'Content changed before homepage publication');
  const names=[...m.paths,...(key==='catalog'?['content/pages/activities/operations.js','content/pages/activities/pride-2026.css','content/pages/activities/pride-2026.jpeg']:[])];
  const files=[];for(const file of names){const data=await fs.readFile(path.join(temp,key,file));files.push({file,data:data.toString(file.endsWith('.jpeg')?'base64':'utf8'),encoding:file.endsWith('.jpeg')?'base64':'utf-8'});}
  const created=await api('/v13/deployments',{method:'POST',body:JSON.stringify({name:m.name,project:m.project,target:'production',files,projectSettings:{framework:null,buildCommand:'npm run build',installCommand:'echo No external dependencies',outputDirectory:'public'},meta:{reason:'Publish TRIARCH PRIDE 2026 activity',baselineDeploymentId:m.baseline,githubCommitSha:process.env.GITHUB_SHA}})});
  const id=created.id??created.uid;assert(/^dpl_[a-zA-Z0-9]+$/.test(id));receipt.deployments[key]={id,url:created.url,baseline:m.baseline};await save();
  await waitReady(id,m.project);
  let assigned=false;for(let i=0;i<24;i++){if(await live(m)===id){assigned=true;break;}await pause(5000);}assert(assigned,'Alias not assigned');
  if(key==='catalog')await verifyUrl('https://'+m.host+'/activities/',b=>b.toString().includes('TRIARCH × PRIDE 2026')&&b.toString().includes('NT$8,980'));
 }
 receipt.stage='verify-public';await save();
 const targets=[
  [ORIGIN+'/activities/',b=>b.toString().includes('TRIARCH × PRIDE 2026')&&b.toString().includes('NT$6,980')&&b.toString().includes('NT$7,980')&&b.toString().includes('NT$8,980')&&b.toString().includes('https://lin.ee/Roebk7r')],
  [ORIGIN+'/',b=>b.toString().includes('/activities/#triarch-pride-2026')],
  [ORIGIN+'/activities/pride-2026.jpeg',b=>hash(b)===hash(poster)],
  [ORIGIN+'/activities/operations.js',b=>hash(b)===hash(opsText)],
  [ORIGIN+'/activities/pride-2026.css',b=>b.toString().includes('height:auto')],
  [ORIGIN+'/health.json',b=>JSON.parse(b).revision===health.revision&&JSON.parse(b).count===32],
  [ORIGIN+'/catalog.json',b=>JSON.stringify(JSON.parse(b).works)===JSON.stringify(beforeWorks)]
 ];
 for(const [url,predicate] of targets)await verifyUrl(url,predicate);
 receipt.publicChecks=targets.length;receipt.status='verified';receipt.stage='complete';receipt.finishedAt=new Date().toISOString();await save();
 console.log(JSON.stringify(receipt));
}catch(e){receipt.status='failed';receipt.error=e.message;await save();console.error(e.message);process.exitCode=1;}
finally{if(temp)await fs.rm(temp,{recursive:true,force:true});}
