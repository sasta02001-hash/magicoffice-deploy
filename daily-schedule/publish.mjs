import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';

export const TEAM='team_44tkvxP20I5s9SUmlxfUEQM1';
export const PROJECT='prj_C4Gll6J7LNgmwPoOg6Qf1nABUn0A';
export const HOST='magicoffice-data.vercel.app';
const MAIN='https://magicoffice.vercel.app';
export const FILES=['package.json','config.json','fallback.json','vercel.json','public/index.html','lib/csv.mjs','lib/schedule-parser.mjs','lib/schedule-service.mjs','lib/runtime.mjs','lib/site-health.mjs','api/schedule.js','api/health.js','api/site-health.js','tests/csv.test.mjs','tests/schedule-parser.test.mjs','tests/schedule-service.test.mjs','tests/site-health.test.mjs'];
const FIELDS=['date','name','startTime','endTime','shift','costume','event','sort','updatedAt'];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export function validateRequest(request,now=Date.now()) {
  assert.equal(request.projectId,PROJECT,'WRONG_PROJECT');
  assert.match(request.expectedDeploymentId,/^dpl_[A-Za-z0-9]+$/);
  assert.ok(Number.isFinite(Date.parse(request.sourceVerifiedAt)),'INVALID_SOURCE_TIME');
  const age=now-Date.parse(request.sourceVerifiedAt);
  assert.ok(age>=-60000&&age<=3600000,'SOURCE_VERIFICATION_EXPIRED');
  for(const k of ['sourceHash','publicHash'])assert.match(request[k],/^[a-f0-9]{64}$/);
  assert.ok(Array.isArray(request.publishedMonths)&&request.publishedMonths.length,'MONTH_METADATA_REQUIRED');
  assert.ok(Array.isArray(request.excludedNames),'PERSONNEL_RULE_REQUIRED');
  assert.ok(!request.excludedNames.some(n=>/碧瑠|へきる/.test(n)),'HEKIRU_MUST_REMAIN');
}
export function flattenFiles(nodes,prefix='') {
  assert.ok(Array.isArray(nodes),'INVALID_SOURCE_TREE');
  return nodes.flatMap(n=>{
    assert.ok(typeof n.name==='string'&&!n.name.includes('/')&&!['.','..'].includes(n.name),'UNSAFE_SOURCE_PATH');
    const name=prefix+n.name;
    if(n.type==='directory'||n.type==='folder'||Array.isArray(n.children))return flattenFiles(n.children||[],name+'/');
    assert.equal(n.type,'file',`UNSUPPORTED_SOURCE_TYPE:${String(n.type).replace(/[^a-zA-Z0-9_-]/g,'').slice(0,30)}:keys=${Object.keys(n).join(',')}`);
    return [{file:name,uid:n.uid}];
  });
}
export function validateRows(rows) {
  assert.ok(Array.isArray(rows)&&rows.length,'EMPTY_ROWS');
  for(const row of rows)assert.deepEqual(Object.keys(row).sort(),[...FIELDS].sort(),'UNEXPECTED_PUBLIC_FIELD');
  const keys=rows.map(r=>JSON.stringify([r.date,r.name,r.startTime,r.endTime]));
  assert.equal(new Set(keys).size,keys.length,'DUPLICATE_ROWS');
}
export function filteredRows(rows,excludedNames) {
  const normalize=n=>String(n).normalize('NFKC').replace(/[\s☘\uFE0F]/gu,'').toLowerCase();
  const excluded=new Set(excludedNames.map(normalize));
  return rows.filter(r=>!excluded.has(normalize(r.name)));
}
export function verifyLive(body,expectedRows,contentHash) {
  assert.equal(body.dataState,'live','SOURCE_NOT_LIVE');
  assert.equal(body.stale,false,'SOURCE_STALE');
  assert.equal(body.sourceHttpStatus,200,'SOURCE_HTTP_FAILURE');
  const clean=rows=>rows.map(({updatedAt,...r})=>r);
  assert.deepEqual(clean(body.rows),clean(expectedRows),'ROW_MISMATCH');
  assert.equal(body.sourceHash,contentHash(expectedRows),'HASH_MISMATCH');
}
async function publicJson(url) {
  const response=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(30000)});
  assert.equal(response.status,200,'PUBLIC_HTTP_FAILURE');
  return response.json();
}
async function run() {
  const token=process.env.VERCEL_TOKEN;
  assert.ok(token,'MISSING_VERCEL_TOKEN: configure the repository Actions secret');
  const request=JSON.parse(await fs.readFile(new URL('./request.json',import.meta.url),'utf8'));
  validateRequest(request);
  const receipt={status:'validating',requestedAt:request.sourceVerifiedAt,projectId:PROJECT};
  const output=new URL('./receipt.json',import.meta.url);
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'magicoffice-data-'));
  async function api(route,method='GET',body) {
    const u=new URL(route,'https://api.vercel.com');
    assert.equal(u.origin,'https://api.vercel.com');
    u.searchParams.set('teamId',TEAM);
    const response=await fetch(u,{method,redirect:'error',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(45000)});
    if(!response.ok) {
      const payload=await response.json().catch(()=>({}));
      const code=String(payload.error?.code??payload.code??'unknown').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,60);
      const message=String(payload.error?.message??payload.message??'').toLowerCase();
      const reason=/expir/.test(message)?'expired':/invalid.*token|token.*invalid/.test(message)?'invalid-token':/revok/.test(message)?'revoked':/permission|scope|not authorized|access/.test(message)?'access-denied':'unspecified';
      throw new Error(`VERCEL_API_HTTP_${response.status}:${method}:${route.replace(/dpl_[A-Za-z0-9]+/g,'deployment').replace(/\/files\/[^?]+/g,'/files/file')}:code=${code}:reason=${reason}`);
    }
    return response.json();
  }
  async function production() {
    const d=await api(`/v13/deployments/${HOST}`);
    assert.equal(d.projectId??d.project?.id,PROJECT,'PRODUCTION_PROJECT_MISMATCH');
    assert.equal(d.readyState,'READY','PRODUCTION_NOT_READY');
    return d;
  }
  try {
    const before=await production();
    assert.equal(before.id,request.expectedDeploymentId,'DEPLOYMENT_BASE_CHANGED');
    receipt.previousDeployment=before.id;
    const tree=flattenFiles(await api(`/v6/deployments/${before.id}/files?base=src`));
    assert.deepEqual(tree.map(f=>f.file).sort(),[...FILES].sort(),'SERVICE_FILES_CHANGED_REVIEW_REQUIRED');
    // Source locations and unfiltered data remain inside this ephemeral runner.
    // They are never committed, printed, or attached as public Actions artifacts.
    const files=[];
    for(const entry of tree) {
      assert.ok(entry.uid,'SOURCE_FILE_ID_MISSING');
      const response=await api(`/v8/deployments/${before.id}/files/${encodeURIComponent(entry.uid)}`);
      const encoded=typeof response==='string'?response:(response.data??response.content);
      assert.equal(typeof encoded,'string','UNRECOGNIZED_FILE_RESPONSE');
      const data=Buffer.from(encoded,'base64').toString('utf8');
      assert.ok(Buffer.byteLength(data)<400000,'SOURCE_FILE_TOO_LARGE');
      const local=path.join(temp,entry.file);
      await fs.mkdir(path.dirname(local),{recursive:true});await fs.writeFile(local,data,{mode:0o600});
      files.push({file:entry.file,data,encoding:'utf-8'});
    }
    const config=JSON.parse(await fs.readFile(path.join(temp,'config.json'),'utf8'));
    const monthKey=x=>`${x.year}-${String(x.month).padStart(2,'0')}`;
    const actualMonths=config.sheets.map(monthKey).sort();
    assert.deepEqual(actualMonths,[...request.publishedMonths].sort(),'MONTH_CONFIG_UPDATE_REQUIRED');
    const {createScheduleService,contentHash}=await import(pathToFileURL(path.join(temp,'lib/schedule-service.mjs')));
    const fallback=JSON.parse(await fs.readFile(path.join(temp,'fallback.json'),'utf8'));
    const fresh=await createScheduleService({config,fallback}).getSchedule();
    validateRows(fresh.rows);verifyLive(fresh,fresh.rows,contentHash);
    assert.equal(fresh.sourceHash,request.sourceHash,'SOURCE_CHANGED_SINCE_NATIVE_GRID_CHECK');
    assert.equal(fresh.meta.currentWeekComplete,true,'CURRENT_WEEK_INCOMPLETE');
    const publicRows=filteredRows(fresh.rows,request.excludedNames);
    assert.equal(contentHash(publicRows),request.publicHash,'PUBLIC_PERSONNEL_MISMATCH');
    const menuBefore=await publicJson(MAIN+'/api/menu');
    const menuContent=menu=>JSON.stringify({rows:menu.rows,data:menu.data,items:menu.items,fetchedAt:menu.fetchedAt,sourceHash:menu.sourceHash});
    const backup={...fallback,rows:fresh.rows,sourceHash:fresh.sourceHash,fetchedAt:fresh.fetchedAt,sourceVerifiedAt:fresh.sourceVerifiedAt,updatedAt:fresh.updatedAt,generatedAt:fresh.generatedAt,source:'原始 Google Sheets｜每日驗證備援',stale:true,dataState:'published',syncCode:'EMBEDDED_BACKUP_ONLY'};
    const text=JSON.stringify(backup,null,2)+'\n';
    await fs.writeFile(path.join(temp,'fallback.json'),text);
    files.find(f=>f.file==='fallback.json').data=text;
    const testEnv={...process.env};delete testEnv.VERCEL_TOKEN;delete testEnv.GITHUB_TOKEN;
    execFileSync('npm',['test'],{cwd:temp,env:testEnv,stdio:'pipe',timeout:120000});
    assert.equal((await production()).id,before.id,'CONCURRENT_DEPLOYMENT_DETECTED');
    receipt.verifiedAt=fresh.sourceVerifiedAt;receipt.rows=fresh.rows.length;receipt.publicRows=publicRows.length;
    receipt.sourceHash=fresh.sourceHash;receipt.publicHash=contentHash(publicRows);
    receipt.fallbackSha256=hash(text);receipt.tests='passed';
    const deployed=await api('/v13/deployments','POST',{name:'magicoffice-data',project:PROJECT,target:'production',files,projectSettings:{framework:null,buildCommand:'npm test',installCommand:'echo No external dependencies',outputDirectory:'public',nodeVersion:'24.x'},meta:{scheduleRequest:request.sourceVerifiedAt,githubRunId:process.env.GITHUB_RUN_ID||'manual'}});
    assert.ok(deployed.id,'NO_DEPLOYMENT_ID');receipt.deploymentId=deployed.id;receipt.status='building';
    await fs.writeFile(output,JSON.stringify(receipt,null,2));
    let ready=false;
    for(let i=0;i<100;i++) {
      const d=await api(`/v13/deployments/${deployed.id}`);
      if(['ERROR','CANCELED'].includes(d.readyState))throw new Error('DEPLOYMENT_'+d.readyState);
      if(d.readyState==='READY'&&!d.aliasError&&(d.alias||[]).includes(HOST)){ready=true;break;}
      await pause(5000);
    }
    assert.ok(ready,'DEPLOYMENT_READY_TIMEOUT');
    assert.equal((await production()).id,deployed.id,'ALIAS_NOT_UPDATED');
    // Verify the deployed backup bytes as well as the currently live responses.
    const newTree=flattenFiles(await api(`/v6/deployments/${deployed.id}/files?base=src`));
    const bf=newTree.find(f=>f.file==='fallback.json');assert.ok(bf,'BACKUP_NOT_DEPLOYED');
    const b=await api(`/v8/deployments/${deployed.id}/files/${encodeURIComponent(bf.uid)}`);
    assert.equal(hash(Buffer.from(typeof b==='string'?b:b.data??b.content,'base64')),receipt.fallbackSha256,'DEPLOYED_BACKUP_MISMATCH');
    let verified=false;
    for(let i=0;i<65;i++) {
      const data=await publicJson(`https://${HOST}/api/schedule`);
      const main=await publicJson(MAIN+'/api/schedule');
      try {verifyLive(data,fresh.rows,contentHash);verifyLive(main,publicRows,contentHash);verified=true;break;}
      catch {if(i===64)throw new Error('POST_DEPLOY_LIVE_PARITY_FAILED');await pause(5000);}
    }
    assert.ok(verified);
    const health=await publicJson(MAIN+'/api/health');assert.equal(health.status,'healthy','SITE_NOT_HEALTHY');
    const menuAfter=await publicJson(MAIN+'/api/menu');assert.equal(menuContent(menuAfter),menuContent(menuBefore),'MENU_CHANGED_DURING_RUN');
    receipt.status='published-and-verified';receipt.finishedAt=new Date().toISOString();
    await fs.writeFile(output,JSON.stringify(receipt,null,2));
    console.log(JSON.stringify(receipt));
  } catch(error) {
    receipt.status='failed';receipt.error=String(error.message).split('\n')[0].slice(0,180);
    await fs.writeFile(output,JSON.stringify(receipt,null,2));
    // Do not print raw response bodies, source files, or subprocess output.
    throw new Error(receipt.error);
  } finally {await fs.rm(temp,{recursive:true,force:true});}
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url) {
  run().catch(error=>{console.error(error.message);process.exitCode=1;});
}
