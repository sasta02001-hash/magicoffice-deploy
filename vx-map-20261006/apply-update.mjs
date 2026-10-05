import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const ROOT=path.dirname(fileURLToPath(import.meta.url));
const checkout=path.resolve(process.argv[2]);
const hash=x=>createHash('sha256').update(x).digest('hex');
const baseline=JSON.parse(await fs.readFile(path.join(ROOT,'baseline.json'),'utf8'));
for(const [file,sha] of Object.entries(baseline))assert.equal(hash(await fs.readFile(path.join(checkout,file))),sha,'Campaign source changed: '+file);
const checksums=JSON.parse(await fs.readFile(path.join(ROOT,'checksums.json'),'utf8'));
for(const [file,sha] of Object.entries(checksums)){
 assert(file.startsWith('patch/')&&!file.includes('..'));
 const bytes=await fs.readFile(path.join(ROOT,file));assert.equal(hash(bytes),sha,'Patch integrity: '+file);
 const dest=path.join(checkout,file.slice(6));await fs.mkdir(path.dirname(dest),{recursive:true});await fs.writeFile(dest,bytes);
}
const manifestPath=path.join(checkout,'main/source-manifest.json');
const manifest=JSON.parse(await fs.readFile(manifestPath,'utf8'));
const entry=manifest.preservedFiles.find(x=>x.path==='booking/index.html');assert(entry,'Booking page missing from manifest');
const bytes=await fs.readFile(path.join(checkout,'main/source/booking/index.html'));Object.assign(entry,{bytes:bytes.length,sha256:hash(bytes)});
await fs.writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n');
console.log('Applied narrowly scoped map-only booking and activity overlay.');
