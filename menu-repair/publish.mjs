import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const TEAM='team_44tkvxP20I5s9SUmlxfUEQM1',PROJECT='prj_JcF9cms6IGKkWJJsCaOWkwVVzA9D',HOST='magicoffice.vercel.app';
const sha=b=>createHash('sha256').update(b).digest('hex');
const canonical=x=>JSON.stringify(x,(_k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const flat=(nodes,prefix='')=>nodes.flatMap(n=>Array.isArray(n.children)?flat(n.children,prefix+n.name+'/'):[{file:prefix+n.name,uid:n.uid,type:n.type}]);
const request=JSON.parse(await fs.readFile(new URL('./request.json',import.meta.url),'utf8'));
const receipt={status:'validating',projectId:PROJECT,sourceVerifiedAt:request.sourceVerifiedAt,worldsHash:request.worldsHash};
const output=new URL('./receipt.json',import.meta.url);
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'magicoffice-menu-'));
async function api(route,method='GET',body){const u=new URL(route,'https://api.vercel.com');u.searchParams.set('teamId',TEAM);const r=await fetch(u,{method,redirect:'error',headers:{Authorization:'Bearer '+process.env.VERCEL_TOKEN,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(60000)});if(!r.ok)throw new Error('VERCEL_HTTP_'+r.status);return r.json();}
async function json(url){const r=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(45000)});return {status:r.status,body:await r.json()};}
async function fileBytes(id,uid){const r=await api('/v8/deployments/'+id+'/files/'+encodeURIComponent(uid));return Buffer.from(typeof r==='string'?r:r.data??r.content,'base64');}
const setLocal=async(file,data)=>{const p=path.join(temp,file);await fs.mkdir(path.dirname(p),{recursive:true});await fs.writeFile(p,data,{mode:0o600});};
try{
 assert.equal(request.projectId,PROJECT,'WRONG_PROJECT');
 assert.ok(Date.now()-Date.parse(request.sourceVerifiedAt)>=0&&Date.now()-Date.parse(request.sourceVerifiedAt)<3600000,'SOURCE_CHECK_EXPIRED');
 assert.equal(request.contentDifferences,0,'CONTENT_CHANGE_REQUIRES_NEW_PAYLOAD');
 assert.equal(request.fullSourceRangeChecked,true,'FULL_SOURCE_REQUIRED');
 assert.match(request.worldsHash,/^[a-f0-9]{64}$/);
 const before=await api('/v13/deployments/'+HOST);assert.equal(before.projectId,PROJECT);assert.equal(before.id,request.expectedDeploymentId,'PRODUCTION_CHANGED');assert.equal(before.readyState,'READY');
 receipt.previousDeployment=before.id;
 const tree=flat(await api('/v6/deployments/'+before.id+'/files?base=src'));
 const files=[];
 for(const e of tree){assert.equal(e.type,'file');assert.ok(!e.file.startsWith('/')&&!e.file.split('/').includes('..'));assert.ok(!/\.(mp4|webm|mov)$/i.test(e.file),'UNEXPECTED_MEDIA_SOURCE');const bytes=await fileBytes(before.id,e.uid);assert.ok(bytes.length<2000000,'SOURCE_TOO_LARGE');await setLocal(e.file,bytes);files.push({file:e.file,data:bytes.toString('base64'),encoding:'base64'});}
 const set=async(file,data)=>{await setLocal(file,data);const e=files.find(f=>f.file===file);const v={file,data,encoding:'utf-8'};if(e)Object.assign(e,v);else files.push(v);};
 const baseline=await json('https://'+HOST+'/migration-manifest.json');assert.equal(baseline.status,200);assert.equal(baseline.body.version,request.expectedVersion);assert.equal(sha(canonical(baseline.body)),request.baselineManifestHash,'BASE_MANIFEST_CHANGED');
 const sourceMenu=JSON.parse(await fs.readFile(path.join(temp,'menu-snapshot.json'),'utf8'));
 assert.equal(sha(canonical(sourceMenu.worlds)),request.worldsHash,'VERIFIED_MENU_CONTENT_MISMATCH');
 const current=await json('https://'+HOST+'/api/menu');assert.equal(sha(canonical(current.body.worlds)),request.worldsHash,'LIVE_MENU_CHANGED');
 const scheduleBefore=await json('https://'+HOST+'/api/schedule');assert.equal(scheduleBefore.status,200);assert.equal(scheduleBefore.body.stale,false);
 const snapshot={...sourceMenu,fetchedAt:request.sourceVerifiedAt,sourceVerifiedAt:request.sourceVerifiedAt,updatedAt:request.sourceVerifiedAt,checkedAt:request.sourceVerifiedAt,stale:false,syncCode:'PUBLISHED_SNAPSHOT'};
 const snapshotText=JSON.stringify(snapshot,null,2)+'\n';
 await set('menu-snapshot.json',snapshotText);
 const {inspectMenuSnapshot}=await import(pathToFileURL(path.join(temp,'lib/menu-snapshot.mjs')));
 assert.equal(inspectMenuSnapshot(snapshot).status,200,'MENU_VALIDATION_FAILED');
 assert.equal(inspectMenuSnapshot(snapshot,{now:Date.parse(request.sourceVerifiedAt)+15*86400000}).status,503,'EXPIRY_PROTECTION_MISSING');
 const env={...process.env};delete env.VERCEL_TOKEN;delete env.GITHUB_TOKEN;
 const testLog=execFileSync('npm',['test'],{cwd:temp,env,stdio:'pipe',timeout:120000}).toString();
 receipt.tests='passed';receipt.testCount=Number(testLog.match(/# tests (\d+)/)?.[1]??0);
 const config=JSON.parse(await fs.readFile(path.join(temp,'vercel.json'),'utf8'));
 config.buildCommand='npm test && node scripts/publish-menu.mjs';config.installCommand='echo Using existing dependency-free runtime and tests';
 await set('vercel.json',JSON.stringify(config,null,2)+'\n');
 await set('scripts/publish-menu.mjs',await fs.readFile(new URL('./preserve-build.mjs',import.meta.url),'utf8'));
 await set('menu-baseline-manifest.json',JSON.stringify(baseline.body,null,2)+'\n');
 await set('menu-publication.json',JSON.stringify({base:'https://'+HOST,expectedVersion:request.expectedVersion,version:request.version},null,2)+'\n');
 assert.equal((await api('/v13/deployments/'+HOST)).id,before.id,'CONCURRENT_DEPLOYMENT');
 const d=await api('/v13/deployments','POST',{name:'magicoffice',project:PROJECT,target:'production',files,projectSettings:{framework:null,nodeVersion:'24.x'},meta:{menuVerifiedAt:request.sourceVerifiedAt,githubRunId:process.env.GITHUB_RUN_ID}});
 receipt.deploymentId=d.id;receipt.status='building';await fs.writeFile(output,JSON.stringify(receipt,null,2));
 let ready=false;for(let i=0;i<120;i++){const state=await api('/v13/deployments/'+d.id);if(['ERROR','CANCELED'].includes(state.readyState))throw new Error('DEPLOYMENT_'+state.readyState);if(state.readyState==='READY'&&!state.aliasError&&(state.alias||[]).includes(HOST)){ready=true;break;}await pause(5000);}assert.ok(ready,'READY_TIMEOUT');
 assert.equal((await api('/v13/deployments/'+HOST)).id,d.id,'ALIAS_MISMATCH');
 const deployedTree=flat(await api('/v6/deployments/'+d.id+'/files?base=src'));
 const deployedSnapshot=deployedTree.find(f=>f.file==='menu-snapshot.json');assert.equal(sha(await fileBytes(d.id,deployedSnapshot.uid)),sha(snapshotText),'DEPLOYED_SNAPSHOT_MISMATCH');
 const manifestAfter=await json('https://'+HOST+'/migration-manifest.json');assert.equal(manifestAfter.status,200);assert.equal(manifestAfter.body.version,request.version);assert.equal(manifestAfter.body.files.length,baseline.body.files.length);
 const allowed=new Set(['index.html','content/menu-fallback.json','BUILD_VERSION.txt']);
 for(const f of baseline.body.files){const n=manifestAfter.body.files.find(x=>x.path===f.path);assert.ok(n,'STATIC_FILE_MISSING');if(!allowed.has(f.path))assert.deepEqual(n,f,'UNRELATED_STATIC_CHANGE');}
 let verified=false;
 for(let i=0;i<70;i++){const menu=await json('https://'+HOST+'/api/menu'),health=await json('https://'+HOST+'/api/health');if(menu.status===200&&!menu.body.stale&&health.status===200&&health.body.status==='healthy'){assert.equal(menu.body.fetchedAt,request.sourceVerifiedAt);assert.equal(sha(canonical(menu.body.worlds)),request.worldsHash);assert.equal(menu.body.summary.valid,true);receipt.menu={httpStatus:200,items:menu.body.summary.itemCount,groups:menu.body.summary.groupCount,stale:false};receipt.health={httpStatus:200,status:'healthy'};verified=true;break;}await pause(5000);}assert.ok(verified,'POST_PUBLICATION_HEALTH_FAILED');
 const scheduleAfter=await json('https://'+HOST+'/api/schedule');assert.equal(scheduleAfter.status,200);assert.equal(scheduleAfter.body.stale,false);assert.equal(scheduleAfter.body.dataState,'live');assert.equal(scheduleAfter.body.sourceHash,scheduleBefore.body.sourceHash,'SCHEDULE_CHANGED_DURING_REPAIR');
 const fallback=await json('https://'+HOST+'/content/menu-fallback.json');assert.equal(fallback.status,200);assert.equal(fallback.body.fetchedAt,request.sourceVerifiedAt);assert.equal(sha(canonical(fallback.body.worlds)),request.worldsHash);
 receipt.status='published-and-verified';receipt.finishedAt=new Date().toISOString();receipt.snapshotSha256=sha(snapshotText);receipt.staticFilesPreserved=baseline.body.files.length-allowed.size;receipt.version=request.version;receipt.scheduleRows=scheduleAfter.body.rows.length;receipt.scheduleHash=scheduleAfter.body.sourceHash;await fs.writeFile(output,JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));
}catch(e){receipt.status='failed';receipt.error=String(e.message).split('\n')[0].slice(0,120);await fs.writeFile(output,JSON.stringify(receipt,null,2));console.error(receipt.error);process.exitCode=1;}finally{await fs.rm(temp,{recursive:true,force:true});}
