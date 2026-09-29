import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const baseline=JSON.parse(await fs.readFile('moon-maintenance/baseline.json','utf8'));
const TEAM='team_44tkvxP20I5s9SUmlxfUEQM1', HOST='moon-tau-sandy.vercel.app';
const hash=b=>createHash('sha1').update(b).digest('hex');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function api(route,options={}){const u=new URL(route,'https://api.vercel.com');u.searchParams.set('teamId',TEAM);const r=await fetch(u,{...options,redirect:'error',headers:{Authorization:`Bearer ${process.env.VERCEL_TOKEN}`,'Content-Type':'application/json',...options.headers},signal:AbortSignal.timeout(45000)});assert(r.ok,`Vercel HTTP ${r.status} for ${u.pathname}`);return r.json();}
async function live(){const d=await api('/v13/deployments/'+HOST);assert.equal(d.projectId??d.project?.id,baseline.projectId);return d.id??d.uid;}
await fs.mkdir('evidence',{recursive:true});
const save=(name,obj)=>fs.writeFile('evidence/'+name+'.json',JSON.stringify(obj,null,2));
const command=process.argv[2];
if(command==='prepare'){
  assert.equal(await live(),baseline.deploymentId,'Production changed; rebase required');
  const files=[];
  for(const entry of baseline.sourceFiles){
    assert(!entry.file.includes('..')&&!path.isAbsolute(entry.file));
    const raw=await api(`/v8/deployments/${baseline.deploymentId}/files/${entry.uid}`);
    const bytes=Buffer.from(typeof raw==='string'?raw:raw.data??raw.content,'base64');
    assert.equal(hash(bytes),entry.uid,'Restored file hash mismatch: '+entry.file);
    await fs.mkdir(path.dirname('work/site/'+entry.file),{recursive:true});await fs.writeFile('work/site/'+entry.file,bytes);
    files.push({file:entry.file,before:entry.uid,size:bytes.length});
  }
  const cssPath='work/site/styles.css';let css=await fs.readFile(cssPath,'utf8');
  const before=`  border-bottom: 1px solid transparent;\n  transition: background .35s ease, border-color .35s ease, backdrop-filter .35s ease;`;
  assert.equal(css.split(before).length,2,'Header patch context mismatch');
  css=css.replace(before,`  background: rgba(4, 10, 18, .9);\n  border-bottom: 1px solid rgba(210, 173, 115, .13);\n  backdrop-filter: blur(18px) saturate(125%);\n  transition: background .35s ease, border-color .35s ease, backdrop-filter .35s ease;`);
  assert(css.includes('background: rgba(4, 10, 18, .82);'));css=css.replace('background: rgba(4, 10, 18, .82);','background: rgba(4, 10, 18, .94);');
  const nav=`.desktop-nav a {\n  position: relative;\n  padding: 8px 0;\n  color: rgba(245, 238, 223, .78);`;
  assert(css.includes(nav));css=css.replace(nav,nav.replace('rgba(245, 238, 223, .78)','#f5eedf'));
  await fs.writeFile(cssPath,css);
  for(const f of files){f.after=hash(await fs.readFile('work/site/'+f.file));if(f.file!=='styles.css')assert.equal(f.before,f.after,'Unrelated file changed');}
  await save('prepared',{at:new Date().toISOString(),baselineDeploymentId:baseline.deploymentId,changedFiles:files.filter(f=>f.before!==f.after),files});
  console.log(JSON.stringify({prepared:true,sourceFiles:files.length,bytes:files.reduce((s,f)=>s+f.size,0),changedFiles:['styles.css']}));
}else if(command==='publish'){
  const test=JSON.parse(await fs.readFile('evidence/local-browser.json','utf8'));assert.equal(test.status,'passed');
  const prepared=JSON.parse(await fs.readFile('evidence/prepared.json','utf8'));
  assert.equal(await live(),baseline.deploymentId,'Production changed before publication');
  const files=[];
  for(const f of prepared.files){const bytes=await fs.readFile('work/site/'+f.file);assert.equal(hash(bytes),f.after);files.push({file:f.file,sha:f.after,size:bytes.length});if(f.before!==f.after)await api('/v2/files',{method:'POST',headers:{'Content-Type':'application/octet-stream','x-vercel-digest':f.after},body:bytes});}
  assert.equal(await live(),baseline.deploymentId,'Production changed before publication');
  const created=await api('/v13/deployments',{method:'POST',body:JSON.stringify({name:'moon',project:baseline.projectId,target:'production',files,projectSettings:{framework:null,buildCommand:null,installCommand:null,outputDirectory:null},meta:{reason:'Authorized Moon header readability repair',baselineDeploymentId:baseline.deploymentId,githubCommitSha:process.env.GITHUB_SHA}})});
  const id=created.id??created.uid;assert(/^dpl_/.test(id));const receipt={at:new Date().toISOString(),baselineDeploymentId:baseline.deploymentId,deploymentId:id,url:created.url,changedFiles:['styles.css'],status:'created'};await save('deployment',receipt);console.log(JSON.stringify(receipt));
  let ready=false;for(let n=0;n<60;n++){const d=await api('/v13/deployments/'+id);assert(!['ERROR','CANCELED'].includes(d.readyState));if(d.readyState==='READY'){ready=true;break;}await pause(3000);}assert(ready,'Deployment readiness timeout');
  let assigned=false;for(let n=0;n<24;n++){if(await live()===id){assigned=true;break;}await pause(2500);}assert(assigned,'Production alias not assigned');
  receipt.status='ready';receipt.verifiedAt=new Date().toISOString();await save('deployment',receipt);console.log(JSON.stringify(receipt));
}else throw Error('Unknown command');
