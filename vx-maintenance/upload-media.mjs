import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {validateRefinement} from './refinement-guard.mjs';
const TEAM='team_44tkvxP20I5s9SUmlxfUEQM1';
const PROJECT='prj_jf0F7rOmNEepg1AKF19uwAGSrUvl';
const HOST='vxsagittarius-media-privacy-2026091.vercel.app';
const NAME='vxsagittarius-media-privacy-20260917';
const token=process.env.VERCEL_TOKEN;
const digest=(a,x)=>createHash(a).update(x).digest('hex');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const directory=path.resolve(process.argv[2]||'/tmp/vx-privacy');
const receipt={status:'validating',startedAt:new Date().toISOString(),projectId:PROJECT};
async function save(){await fs.writeFile('vx-maintenance/media-receipt.json',JSON.stringify(receipt,null,2));}
async function api(route,method='GET',body,headers={}){
  const u=new URL(route,'https://api.vercel.com');u.searchParams.set('teamId',TEAM);
  const r=await fetch(u,{method,redirect:'error',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',...headers},body:body instanceof Buffer?body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(120000)});
  if(!r.ok){const b=await r.json().catch(()=>({}));throw Error(`VERCEL_${r.status}_${String(b.error?.code||'error').replace(/[^\w-]/g,'')}`);}
  const t=await r.text();return t?JSON.parse(t):{};
}
async function publicFile(asset){
  const r=await fetch(`https://${HOST}/${asset.path}`,{redirect:'error',cache:'no-store',signal:AbortSignal.timeout(45000)});
  assert.equal(r.status,200,'PRIVACY_FILE_NOT_PUBLIC');
  assert.ok((r.headers.get('content-type')||'').includes('video/'),'PRIVACY_NOT_VIDEO');
  const b=Buffer.from(await r.arrayBuffer());assert.equal(b.length,asset.bytes);assert.equal(digest('sha256',b),asset.sha256);
}
try{
  assert.ok(token,'MISSING_TOKEN');
  const request=JSON.parse(await fs.readFile('vx-maintenance/request.json','utf8'));
  assert.ok(['repair','publish-refinement'].includes(request.mode));
  const plan=JSON.parse(await fs.readFile(path.join(directory,'assets.json'),'utf8'));
  if(request.mode==='publish-refinement')validateRefinement(request,plan,JSON.parse(await fs.readFile('vx-maintenance/privacy-plan.json','utf8')));
  const assets=plan.assets.map(({path,bytes,sha256})=>({path,bytes,sha256}));
  assert.equal(assets.length,24,'INCOMPLETE_PRIVACY_SET');assert.equal(new Set(assets.map(x=>x.path)).size,24);
  const before=await api(`/v13/deployments/${HOST}`);assert.equal(before.projectId??before.project?.id,PROJECT);assert.equal(before.id,request.expectedPrivacyDeploymentId,'PRIVACY_BASE_CHANGED');
  receipt.previousDeployment=before.id;
  async function guardBases(){
    const main=await api('/v13/deployments/vxsagittarius.vercel.app');
    const content=await api('/v13/deployments/vxsagittarius-content.vercel.app');
    assert.equal(main.id,request.expectedMainDeploymentId,'MAIN_BASE_CHANGED');
    assert.equal(content.id,request.expectedDeploymentId,'CONTENT_BASE_CHANGED');
    const response=await fetch('https://vxsagittarius.vercel.app/health.json',{cache:'no-store',signal:AbortSignal.timeout(30000)});
    assert.equal(response.status,200,'CONTENT_HEALTH_UNAVAILABLE');const health=await response.json();
    assert.equal(health.revision,request.expectedRevision,'CONTENT_REVISION_CHANGED');
  }
  await guardBases();
  const files=[];
  for(const a of assets){
    assert.match(a.path,/^assets\/works\/\d{3}\/film\.mp4$/);assert.match(a.sha256,/^[a-f0-9]{64}$/);
    const b=await fs.readFile(path.join(directory,a.path));assert.equal(b.length,a.bytes);assert.equal(digest('sha256',b),a.sha256);
    const sha=digest('sha1',b);
    await api('/v2/files','POST',b,{'Content-Type':'application/octet-stream','Content-Length':String(b.length),'x-vercel-digest':sha});
    files.push({file:'public/'+a.path,sha,size:b.length});
  }
  const revision=digest('sha256',JSON.stringify(assets));
  const manifest={version:1,revision,count:assets.length,assets};
  const config={version:2,buildCommand:'echo Validated privacy media',outputDirectory:'public',headers:[{source:'/(.*)',headers:[{key:'X-Content-Type-Options',value:'nosniff'},{key:'Cache-Control',value:'public, max-age=60, must-revalidate'},{key:'X-VX-Privacy-Revision',value:revision}]},...assets.map(a=>({source:'/'+a.path,headers:[{key:'X-VX-Privacy-SHA256',value:a.sha256}]}))]};
  files.push({file:'vercel.json',data:JSON.stringify(config),encoding:'utf-8'},{file:'public/privacy-manifest.json',data:JSON.stringify(manifest),encoding:'utf-8'});
  assert.equal((await api(`/v13/deployments/${HOST}`)).id,before.id,'CONCURRENT_MEDIA_DEPLOYMENT');
  await guardBases();
  const d=await api('/v13/deployments','POST',{name:NAME,project:PROJECT,target:'production',files,projectSettings:{framework:null,buildCommand:'echo Validated privacy media',installCommand:'echo No external dependencies',outputDirectory:'public'},meta:{privacyRepair:'2026-09-23',githubRunId:process.env.GITHUB_RUN_ID||'manual'}});
  receipt.deploymentId=d.id;receipt.status='building';receipt.revision=revision;await save();
  let ready=false;
  for(let i=0;i<100;i++){const q=await api(`/v13/deployments/${d.id}`);if(['ERROR','CANCELED'].includes(q.readyState))throw Error('MEDIA_'+q.readyState);if(q.readyState==='READY'&&!q.aliasError&&q.alias.includes(HOST)){ready=true;break;}await pause(4000);}
  assert.ok(ready,'MEDIA_READY_TIMEOUT');
  assert.equal((await api(`/v13/deployments/${HOST}`)).id,d.id);
  // Preserve the new deployment receipt while waiting for the documented
  // 60-second CDN lifetime on the original public URLs.
  for(const asset of assets){
    let verified=false;let lastError;
    for(let attempt=0;attempt<18;attempt++){
      try{await publicFile(asset);verified=true;break;}catch(e){lastError=e;await pause(5000);}
    }
    if(!verified)throw lastError;
  }
  await fs.writeFile('vx-maintenance/privacy-assets.json',JSON.stringify(manifest,null,2));
  receipt.status='published-and-verified';receipt.count=assets.length;receipt.finishedAt=new Date().toISOString();await save();console.log(JSON.stringify(receipt));
}catch(e){receipt.status='failed';receipt.error=e.message.slice(0,200);await save();console.error(receipt.error);process.exitCode=1;}
