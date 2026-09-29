import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const TEAM='team_44tkvxP20I5s9SUmlxfUEQM1',HOST='magicoffice.vercel.app',PROJECT='prj_JcF9cms6IGKkWJJsCaOWkwVVzA9D';
const sha=b=>createHash('sha256').update(b).digest('hex');
async function api(route){const u=new URL(route,'https://api.vercel.com');u.searchParams.set('teamId',TEAM);const r=await fetch(u,{headers:{Authorization:'Bearer '+process.env.VERCEL_TOKEN},signal:AbortSignal.timeout(45000)});assert.equal(r.status,200,'API_HTTP_'+r.status);return r.json();}
function flat(nodes,prefix=''){return nodes.flatMap(n=>Array.isArray(n.children)?flat(n.children,prefix+n.name+'/'):[{file:prefix+n.name,type:n.type,uid:n.uid}]);}
const d=await api('/v13/deployments/'+HOST);assert.equal(d.projectId,PROJECT);assert.equal(d.id,'dpl_ErH5zwjVmRswwGYMPx6QbVtv2XD7');
const src=flat(await api('/v6/deployments/'+d.id+'/files?base=src'));
const built=flat(await api('/v6/deployments/'+d.id+'/files'));
const files=[];
for(const e of src){if(!/\.(json|mjs|js)$/.test(e.file))continue;const r=await api('/v8/deployments/'+d.id+'/files/'+encodeURIComponent(e.uid));const bytes=Buffer.from(typeof r==='string'?r:r.data??r.content,'base64');const info={file:e.file,sha256:sha(bytes),size:bytes.length};if(['package.json','vercel.json','build-config.json'].includes(e.file)){const j=JSON.parse(bytes);info.settings=j;}files.push(info);}
const report={deployment:d.id,settings:d.projectSettings,source:src,built,files};await fs.writeFile('menu-repair/inspection.json',JSON.stringify(report,null,2));console.log(JSON.stringify({deployment:d.id,sourceFiles:src.length,builtFiles:built.length}));
