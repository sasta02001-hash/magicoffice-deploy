// Menu-only publication: copy the currently pinned public tree byte-for-byte,
// then replace only the verified menu backups and release markers.
import fs from 'node:fs/promises';
import {createWriteStream,createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {Readable,Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {inspectMenuSnapshot} from '../lib/menu-snapshot.mjs';
const digest=b=>createHash('sha256').update(b).digest('hex');
const root=process.cwd(),out=path.join(root,'public');
const cfg=JSON.parse(await fs.readFile('menu-publication.json','utf8'));
const manifest=JSON.parse(await fs.readFile('menu-baseline-manifest.json','utf8'));
const snapshot=JSON.parse(await fs.readFile('menu-snapshot.json','utf8'));
assert.equal(inspectMenuSnapshot(snapshot).status,200,'MENU_NOT_VALID');
assert.equal(manifest.version,cfg.expectedVersion,'BASE_VERSION_CHANGED');
assert.equal(manifest.files.length+1,manifest.totalPublishedFiles,'INCOMPLETE_BASE_MANIFEST');
const seen=new Set();
for(const f of manifest.files){assert.ok(!f.path.startsWith('/')&&!f.path.split('/').some(s=>!s||s==='.'||s==='..')&&!/[\\%?#]/.test(f.path),'INVALID_PATH');assert.match(f.sha256,/^[a-f0-9]{64}$/);assert.ok(!seen.has(f.path),'DUPLICATE_PATH');seen.add(f.path);}
assert.equal(new URL(cfg.base).origin,'https://magicoffice.vercel.app');
await fs.mkdir(out,{recursive:true});
let next=0;
await Promise.all(Array.from({length:6},async()=>{while(next<manifest.files.length){const f=manifest.files[next++];const r=await fetch(new URL(f.path,cfg.base),{cache:'no-store',signal:AbortSignal.timeout(300000)});assert.equal(r.status,200,'BASE_FILE_HTTP:'+f.path);let size=0;const h=createHash('sha256');const check=new Transform({transform(chunk,enc,cb){size+=chunk.length;h.update(chunk);cb(size>f.bytes?new Error('BASE_SIZE:'+f.path):null,chunk);}});const dest=path.join(out,f.path);await fs.mkdir(path.dirname(dest),{recursive:true});await pipeline(Readable.fromWeb(r.body),check,createWriteStream(dest));assert.equal(size,f.bytes,'BASE_SIZE:'+f.path);assert.equal(h.digest('hex'),f.sha256,'BASE_HASH:'+f.path);}}));
const read=p=>fs.readFile(path.join(out,p),'utf8');
const write=(p,s)=>fs.writeFile(path.join(out,p),s);
let html=await read('index.html');
const oldMenu=/((?:<script)\b(?=[^>]*\bid=["']mo-menu-fallback["'])[^>]*>)([\s\S]*?)(<\/script>)/i;
assert.equal([...html.matchAll(new RegExp(oldMenu.source,'gi'))].length,1,'MENU_EMBED_COUNT');
const canonical=x=>JSON.stringify(x,(_k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
const sameWorlds=m=>assert.equal(canonical(m.worlds),canonical(snapshot.worlds),'BASE_MENU_CHANGED');
sameWorlds(JSON.parse(html.match(oldMenu)[2]));sameWorlds(JSON.parse(await read('content/menu-fallback.json')));
const safe=JSON.stringify(snapshot).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
html=html.replace(oldMenu,(_all,a,_json,b)=>a+safe+b);
assert.ok(html.includes(cfg.expectedVersion),'BASE_MARKER_MISSING');
html=html.replaceAll(cfg.expectedVersion,cfg.version);
// Keep the existing metadata field consistent with the actual release marker.
html=html.replace(/(<meta\b(?=[^>]*name=["']x-magicoffice-build["'])[^>]*content=["'])[^"']+(["'])/i,(_all,a,b)=>a+cfg.version+b);
await write('index.html',html);
await write('content/menu-fallback.json',JSON.stringify(snapshot,null,2)+'\n');
await write('BUILD_VERSION.txt',cfg.version+'\n');
const changed=new Set(['index.html','content/menu-fallback.json','BUILD_VERSION.txt']);
const published=[];
for(const f of manifest.files){const file=path.join(out,f.path);const h=createHash('sha256');for await(const chunk of createReadStream(file))h.update(chunk);const hash=h.digest('hex');if(!changed.has(f.path))assert.equal(hash,f.sha256,'UNRELATED_FILE_CHANGED');published.push({path:f.path,bytes:(await fs.stat(file)).size,sha256:hash});}
await write('migration-manifest.json',JSON.stringify({...manifest,version:cfg.version,files:published},null,2)+'\n');
console.log(JSON.stringify({staticFiles:published.length,unchangedFiles:published.length-changed.size,changed:[...changed],menuItems:snapshot.summary.itemCount,verifiedAt:snapshot.fetchedAt}));
