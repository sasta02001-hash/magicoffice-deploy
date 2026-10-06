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

const modules={
 catalog:{project:'prj_CbkfJKuRbzmjT4IsWAitQ3K0oAsE',name:'vxsagittarius-content',host:'vxsagittarius-content.vercel.app',baseline:'dpl_HSrkVQ9fcEV9GJ1RkWXGbqz4Umog',paths:SOURCE_PATHS},
 main:{project:'prj_bh5zjYhzdYkITXrIJ7vSSA2ua9lI',name:'vxsagittarius',host:'vxsagittarius.vercel.app',baseline:'dpl_CEdaAkPkyNauo7zh5xEscXDFtXnQ',paths:['package.json','vercel.json','build.mjs','main.mjs','source-manifest.json',...['404.html','about/index.html','assets/home-catalog.css','assets/motion.js','assets/operations.css','assets/operations.js','assets/repairs.css','assets/site.css','assets/site.js','assets/works/folio-reveal.js','assets/works/work-navigation.js','assets/works/works.css','assets/works/works.js','booking/index.html','index.html','library/index.html','nebula/index.html','robots.txt'].map(p=>'source/'+p)]}
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

const out=path.join(ROOT,'snapshot');
for(const [key,m] of Object.entries(modules))await restore(m,path.join(out,key));
await fs.writeFile(path.join(out,'baselines.json'),JSON.stringify(modules,null,2));
console.log('Restored only allowlisted source files from verified production deployments.');



