import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const TEAM='team_44tkvxP20I5s9SUmlxfUEQM1', PROJECT='prj_lRkAvQWr9EaFNDqr2v1L6YYMUGTX', BASELINE='dpl_6PTiy8C4m9fXeY28iPD3FboTNTJV';
async function api(route){const u=new URL(route,'https://api.vercel.com');u.searchParams.set('teamId',TEAM);const r=await fetch(u,{redirect:'error',headers:{Authorization:`Bearer ${process.env.VERCEL_TOKEN}`},signal:AbortSignal.timeout(45000)});assert(r.ok,'API HTTP '+r.status);return r.json();}
function flat(items,prefix=''){return items.flatMap(i=>{let p=prefix?prefix+'/'+i.name:i.name;if(p==='src')p='';if(i.children)return flat(i.children,p);return i.type==='directory'?[]:[{file:p.replace(/^src\//,''),uid:i.uid,size:i.size}];});}
const d=await api('/v13/deployments/moon-tau-sandy.vercel.app');assert.equal(d.projectId??d.project?.id,PROJECT);assert.equal(d.id??d.uid,BASELINE);
const list=flat(await api('/v6/deployments/'+BASELINE+'/files?base=src'));
const result={checkedAt:new Date().toISOString(),deploymentId:BASELINE,projectId:PROJECT,sourceFiles:list,settings:d.projectSettings??null};
for(const name of ['vercel.json','package.json']){const item=list.find(i=>i.file===name);if(!item)continue;const raw=await api('/v8/deployments/'+BASELINE+'/files/'+item.uid);const json=JSON.parse(Buffer.from(typeof raw==='string'?raw:raw.data??raw.content,'base64').toString());result[name]=name==='vercel.json'?Object.fromEntries(Object.entries(json).filter(([k])=>!['env','build','builds'].includes(k))):{scripts:json.scripts,dependencies:json.dependencies,devDependencies:json.devDependencies};}
console.log(JSON.stringify(result,null,2));await fs.mkdir('evidence',{recursive:true});await fs.writeFile('evidence/inspection.json',JSON.stringify(result,null,2));
