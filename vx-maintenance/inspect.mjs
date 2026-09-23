import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const TEAM='team_44tkvxP20I5s9SUmlxfUEQM1';
const token=process.env.VERCEL_TOKEN;
assert.ok(token,'MISSING_TOKEN');
async function api(route){
  const u=new URL(route,'https://api.vercel.com');u.searchParams.set('teamId',TEAM);
  const r=await fetch(u,{redirect:'error',headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(45000)});
  assert.equal(r.status,200,`API_HTTP_${r.status}`);return r.json();
}
function flat(nodes,prefix=''){return nodes.flatMap(n=>n.type==='file'?[{file:prefix+n.name,uid:n.uid,size:n.size}]:flat(n.children||[],prefix+n.name+'/'));}
async function read(id,file){const j=await api(`/v8/deployments/${id}/files/${file.uid}`);return Buffer.from(typeof j==='string'?j:j.data??j.content,'base64').toString('utf8');}
const out={checkedAt:new Date().toISOString(),status:'inspected',projects:[]};
for(const host of ['vxsagittarius-content.vercel.app','vxsagittarius-media-privacy-2026091.vercel.app']){
  const d=await api(`/v13/deployments/${host}`);const files=flat(await api(`/v6/deployments/${d.id}/files?base=src`));
  const p={host,deploymentId:d.id,projectId:d.projectId??d.project?.id,files};
  for(const name of ['manifest.json','content/media.json','catalog.mjs']){
    const entry=files.find(f=>f.file===name);if(!entry)continue;
    const data=await read(d.id,entry);
    if(name==='manifest.json'){const m=JSON.parse(data);p.manifest={stage:m.stage,totalStages:m.totalStages,finalize:m.finalize,previousOrigin:m.previousOrigin,previousPaths:m.previousPaths,parts:m.parts,assets:m.assets};}
    if(name==='content/media.json'){const m=JSON.parse(data);p.media={allowedOrigins:m.allowedOrigins,film032:m.works['032']?.files['film.mp4'],base032:m.works['032']?.base};}
    if(name==='catalog.mjs')p.supportsFileUrl=data.includes('proof.url');
  }
  out.projects.push(p);
}
await fs.writeFile('vx-maintenance/inspection.json',JSON.stringify(out,null,2));
console.log(JSON.stringify(out));
