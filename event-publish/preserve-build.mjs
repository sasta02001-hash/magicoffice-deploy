// Preserve the pinned public tree exactly, then apply only reviewed event files.
import fs from 'node:fs/promises';
import {createReadStream,createWriteStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {Readable,Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const sha=b=>createHash('sha256').update(b).digest('hex');
const cfg=JSON.parse(await fs.readFile('event-publication.json','utf8'));
const manifest=JSON.parse(await fs.readFile('event-baseline-manifest.json','utf8'));
const out=path.join(process.cwd(),'public');
assert.equal(manifest.version,cfg.expectedVersion);
assert.equal(manifest.files.length+1,manifest.totalPublishedFiles);
assert.equal(cfg.base,'https://magicoffice.vercel.app');
const safe=p=>typeof p==='string'&&!p.startsWith('/')&&!p.split('/').some(s=>!s||s==='.'||s==='..')&&!/[\\%?#]/.test(p);
const seen=new Set();
for(const f of manifest.files){assert.ok(safe(f.path));assert.ok(!seen.has(f.path));seen.add(f.path);assert.match(f.sha256,/^[a-f0-9]{64}$/);}
const allowed=new Set([...cfg.changedExisting,...cfg.added]);
assert.equal(cfg.overlayFiles.length,allowed.size);
for(const f of cfg.overlayFiles){assert.ok(safe(f.path)&&allowed.has(f.path));const b=await fs.readFile(path.join('event-overlays',f.path));assert.equal(b.length,f.bytes);assert.equal(sha(b),f.sha256);}
for(const p of cfg.changedExisting)assert.ok(seen.has(p));
for(const p of cfg.added)assert.ok(!seen.has(p));
const before=await fetch(cfg.base+'/migration-manifest.json',{cache:'no-store',signal:AbortSignal.timeout(45000)});
assert.equal(before.status,200);assert.deepEqual(await before.json(),manifest,'LIVE_BASE_CHANGED');
await fs.mkdir(out,{recursive:true});
let cursor=0;
await Promise.all(Array.from({length:6},async()=>{while(cursor<manifest.files.length){
 const f=manifest.files[cursor++];let success=false;
 for(let attempt=0;attempt<3&&!success;attempt++){
  try{
   const r=await fetch(new URL(f.path,cfg.base),{cache:'no-store',signal:AbortSignal.timeout(300000)});assert.equal(r.status,200,'BASE_FILE_HTTP:'+f.path);
   let size=0;const h=createHash('sha256');const check=new Transform({transform(chunk,enc,cb){size+=chunk.length;h.update(chunk);cb(size>f.bytes?new Error('BASE_SIZE:'+f.path):null,chunk);}});
   const dest=path.join(out,f.path);await fs.mkdir(path.dirname(dest),{recursive:true});await pipeline(Readable.fromWeb(r.body),check,createWriteStream(dest));
   assert.equal(size,f.bytes,'BASE_SIZE:'+f.path);assert.equal(h.digest('hex'),f.sha256,'BASE_HASH:'+f.path);success=true;
  }catch(e){if(attempt===2)throw e;}
 }
}}));
for(const f of cfg.overlayFiles){const dest=path.join(out,f.path);await fs.mkdir(path.dirname(dest),{recursive:true});await fs.copyFile(path.join('event-overlays',f.path),dest);}
const html=await fs.readFile(path.join(out,'index.html'),'utf8');
const events=JSON.parse(await fs.readFile(path.join(out,'content/events.json'),'utf8'));
const embedded=JSON.parse(html.match(/<script\b[^>]*id="mo-events-data"[^>]*>([\s\S]*?)<\/script>/)[1]);
assert.deepEqual(embedded,events);assert.equal(events.events.filter(e=>e.id===cfg.eventId).length,1);assert.ok(html.includes(' id="angel-devil"'));assert.ok(html.includes('data-build="'+cfg.version+'"'));
const published=[];
for(const p of [...new Set([...manifest.files.map(f=>f.path),...cfg.added])].sort()){
 const file=path.join(out,p);const h=createHash('sha256');for await(const chunk of createReadStream(file))h.update(chunk);const hash=h.digest('hex');
 const previous=manifest.files.find(f=>f.path===p);if(previous&&!allowed.has(p))assert.equal(hash,previous.sha256,'UNRELATED_FILE_CHANGED:'+p);
 published.push({path:p,bytes:(await fs.stat(file)).size,sha256:hash});
}
await fs.writeFile(path.join(out,'migration-manifest.json'),JSON.stringify({...manifest,version:cfg.version,totalPublishedFiles:published.length+1,files:published},null,2)+'\n');
const end=await fetch(cfg.base+'/migration-manifest.json',{cache:'no-store',signal:AbortSignal.timeout(45000)});assert.deepEqual(await end.json(),manifest,'CONCURRENT_PUBLICATION');
console.log(JSON.stringify({event:cfg.eventId,version:cfg.version,changed:cfg.changedExisting,added:cfg.added,unrelatedFilesPreserved:manifest.files.length-cfg.changedExisting.length}));
