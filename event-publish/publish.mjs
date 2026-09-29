import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const TEAM='team_44tkvxP20I5s9SUmlxfUEQM1',PROJECT='prj_JcF9cms6IGKkWJJsCaOWkwVVzA9D',HOST='magicoffice.vercel.app';
const sha=b=>createHash('sha256').update(b).digest('hex');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const flat=(nodes,prefix='')=>nodes.flatMap(n=>Array.isArray(n.children)?flat(n.children,prefix+n.name+'/'):[{file:prefix+n.name,uid:n.uid,type:n.type}]);
const here=path.dirname(new URL(import.meta.url).pathname);
const request=JSON.parse(await fs.readFile(path.join(here,'request.json'),'utf8'));
const receipt={status:'validating',projectId:PROJECT,event:request.eventId,version:request.version};
const output=path.join(here,'receipt.json');
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'magicoffice-event-'));
const canonical=x=>JSON.stringify(x,(_k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
async function api(route,method='GET',body){const u=new URL(route,'https://api.vercel.com');u.searchParams.set('teamId',TEAM);const r=await fetch(u,{method,redirect:'error',headers:{Authorization:'Bearer '+process.env.VERCEL_TOKEN,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(90000)});if(!r.ok)throw new Error('VERCEL_HTTP_'+r.status);return r.json();}
async function bytes(url){const r=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(45000)});assert.equal(r.status,200,'PUBLIC_HTTP_'+r.status);return Buffer.from(await r.arrayBuffer());}
async function json(url){return JSON.parse(await bytes(url));}
async function fileBytes(id,uid){const r=await api('/v8/deployments/'+id+'/files/'+encodeURIComponent(uid));return Buffer.from(typeof r==='string'?r:r.data??r.content,'base64');}
const setLocal=async(file,data)=>{const p=path.join(temp,file);await fs.mkdir(path.dirname(p),{recursive:true});await fs.writeFile(p,data,{mode:0o600});};
try{
 assert.equal(request.projectId,PROJECT);assert.equal(request.eventId,'angel-devil');
 const before=await api('/v13/deployments/'+HOST);assert.equal(before.projectId,PROJECT);assert.equal(before.id,request.expectedDeploymentId,'PRODUCTION_CHANGED');assert.equal(before.readyState,'READY');receipt.previousDeployment=before.id;
 const baselineBytes=await bytes('https://'+HOST+'/migration-manifest.json');assert.equal(sha(baselineBytes),request.baselineManifestSha256,'BASE_MANIFEST_CHANGED');
 const baseline=JSON.parse(baselineBytes);assert.equal(baseline.version,request.expectedVersion);
 const oldEvents=await json('https://'+HOST+'/content/events.json');const oldMenu=await json('https://'+HOST+'/api/menu');assert.equal(oldMenu.stale,false);
 const tree=flat(await api('/v6/deployments/'+before.id+'/files?base=src'));const files=[];const sourceHashes=new Map();
 for(const e of tree){assert.equal(e.type,'file');assert.ok(!e.file.startsWith('/')&&!e.file.split('/').includes('..'));assert.ok(!/\.(mp4|webm|mov)$/i.test(e.file));const b=await fileBytes(before.id,e.uid);assert.ok(b.length<4000000,'SOURCE_TOO_LARGE');await setLocal(e.file,b);files.push({file:e.file,data:b.toString('base64'),encoding:'base64'});sourceHashes.set(e.file,sha(b));}
 const set=async(file,data)=>{const b=Buffer.isBuffer(data)?data:Buffer.from(data);await setLocal(file,b);const e=files.find(f=>f.file===file);const v={file,data:b.toString('base64'),encoding:'base64'};if(e)Object.assign(e,v);else files.push(v);};
 const newEvents=JSON.parse(await fs.readFile(path.join(here,'overlays/content/events.json'),'utf8'));
 assert.deepEqual(newEvents.events.filter(e=>e.id!==request.eventId),oldEvents.events,'OTHER_EVENTS_CHANGED');
 const event=newEvents.events.find(e=>e.id===request.eventId);assert.equal(event.start,'2026-10-01T00:00:00+08:00');assert.equal(event.end,'2026-10-22T23:59:59+08:00');
 for(const f of request.overlayFiles){const b=await fs.readFile(path.join(here,'overlays',f.path));assert.equal(b.length,f.bytes);assert.equal(sha(b),f.sha256);await set('event-overlays/'+f.path,b);}
 const env={...process.env};delete env.VERCEL_TOKEN;delete env.GITHUB_TOKEN;
 execFileSync('npm',['test'],{cwd:temp,env,stdio:'pipe',timeout:120000});receipt.existingSourceTests='passed';
 const config=JSON.parse(await fs.readFile(path.join(temp,'vercel.json'),'utf8'));
 config.buildCommand='npm test && node scripts/publish-event.mjs';
 await set('vercel.json',JSON.stringify(config,null,2)+'\n');
 await set('scripts/publish-event.mjs',await fs.readFile(path.join(here,'preserve-build.mjs')));
 await set('event-baseline-manifest.json',baselineBytes);
 await set('event-publication.json',JSON.stringify({...request,base:'https://'+HOST},null,2)+'\n');
 // Every pre-existing source file except the explicit build-command update stays byte-identical.
 for(const f of files)if(sourceHashes.has(f.file)&&f.file!=='vercel.json')assert.equal(sha(Buffer.from(f.data,'base64')),sourceHashes.get(f.file),'UNRELATED_SOURCE_CHANGED');
 assert.equal((await api('/v13/deployments/'+HOST)).id,before.id,'CONCURRENT_DEPLOYMENT');
 const deployed=await api('/v13/deployments','POST',{name:'magicoffice',project:PROJECT,target:'production',files,projectSettings:{framework:null,nodeVersion:'24.x'},meta:{event:request.eventId,githubRunId:process.env.GITHUB_RUN_ID}});
 receipt.deploymentId=deployed.id;receipt.status='building';await fs.writeFile(output,JSON.stringify(receipt,null,2));
 let ready=false;for(let i=0;i<150;i++){const s=await api('/v13/deployments/'+deployed.id);if(['ERROR','CANCELED'].includes(s.readyState))throw new Error('DEPLOYMENT_'+s.readyState);if(s.readyState==='READY'&&!s.aliasError&&(s.alias||[]).includes(HOST)){ready=true;break;}await pause(5000);}assert.ok(ready,'READY_TIMEOUT');
 assert.equal((await api('/v13/deployments/'+HOST)).id,deployed.id,'ALIAS_MISMATCH');
 const after=await json('https://'+HOST+'/migration-manifest.json');assert.equal(after.version,request.version);assert.equal(after.files.length,baseline.files.length+request.added.length);
 const allowed=new Set([...request.changedExisting,...request.added]);
 for(const f of baseline.files){const n=after.files.find(x=>x.path===f.path);assert.ok(n,'MISSING_STATIC');if(!allowed.has(f.path))assert.deepEqual(n,f,'UNRELATED_STATIC_CHANGED');}
 for(const f of request.overlayFiles){const b=await bytes('https://'+HOST+'/'+f.path);assert.equal(sha(b),f.sha256,'LIVE_OVERLAY_MISMATCH:'+f.path);}
 const newMenu=await json('https://'+HOST+'/api/menu');assert.equal(canonical(newMenu.worlds),canonical(oldMenu.worlds));assert.equal(newMenu.stale,false);
 const health=await json('https://'+HOST+'/api/health');assert.equal(health.status,'healthy');
 const schedule=await json('https://'+HOST+'/api/schedule');assert.equal(schedule.stale,false);assert.equal(schedule.dataState,'live');
 receipt.status='published-and-verified';receipt.url='https://'+HOST+'/#angel-devil';receipt.finishedAt=new Date().toISOString();receipt.unrelatedStaticFilesPreserved=baseline.files.length-request.changedExisting.length;receipt.sourceFilesPreserved=sourceHashes.size-1;receipt.menuItems=newMenu.summary.itemCount;receipt.scheduleRows=schedule.rows.length;receipt.health=health.status;
 await fs.writeFile(output,JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));
}catch(e){receipt.status='failed';receipt.error=String(e.message).split('\n')[0].slice(0,180);await fs.writeFile(output,JSON.stringify(receipt,null,2));console.error(receipt.error);process.exitCode=1;}finally{await fs.rm(temp,{recursive:true,force:true});}
