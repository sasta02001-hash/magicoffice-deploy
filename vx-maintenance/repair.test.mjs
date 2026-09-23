import test from 'node:test';
import assert from 'node:assert/strict';
import {flattenTree,validateSourceSet,SOURCE_PATHS,validatePrivacyManifest,PRIVACY_ORIGIN,repairMetadata,assertRewrites,assertConfigPreserved} from './repair.mjs';

const assets=()=>Array.from({length:24},(_,i)=>({path:`assets/works/${String(i+1).padStart(3,'0')}/film.mp4`,bytes:1234,sha256:'a'.repeat(64)}));
const inputs=()=>{
  const works=Array.from({length:32},(_,i)=>({id:String(i+1).padStart(3,'0'),title:i===8?'榛果粽':'example',details:[['髮色',i===8?'榛果粽':'example']],duration:5}));
  const media={allowedOrigins:['https://original.vercel.app','https://new-cover.vercel.app'],works:Object.fromEntries(works.map(w=>[w.id,{base:`https://original.vercel.app/assets/works/${w.id}`,files:Object.fromEntries(['film.mp4','cover-384.webp','cover-768.webp','poster.webp'].map(file=>[file,{bytes:500,sha256:'b'.repeat(64),...(file==='cover-384.webp'?{url:`https://new-cover.vercel.app/assets/works/${w.id}/${file}`}:{})}]))}]))};
  return {works,media};
};
const rewrites=media=>Object.entries(media.works).flatMap(([id,w])=>Object.entries(w.files).map(([file,p])=>({source:`/assets/works/${id}/${file}`,destination:p.url??`${w.base}/${file}`})));

test('current source restoration rejects traversal, duplicate paths, symlinks and unapproved files',()=>{
  const entries=flattenTree([{name:'src',type:'directory',children:SOURCE_PATHS.map((file,i)=>({name:file,type:'file',uid:`uid${i}`}))}]);
  assert.equal(validateSourceSet(entries).length,18);
  for(const name of ['../.env','/etc/passwd','foo\\bar','content/../.env'])assert.throws(()=>flattenTree([{name,type:'file',uid:'x'}]));
  assert.throws(()=>flattenTree([{name:'.env',type:'symlink',uid:'x'}]));
  assert.throws(()=>flattenTree([{name:'package.json',uid:'a'},{name:'package.json',uid:'b'}]));
  assert.throws(()=>validateSourceSet([...entries,{file:'.env',uid:'secret'}]));
});
test('privacy manifest requires 24 unique, fully hashed film files from the exact privacy origin',()=>{
  const rows=validatePrivacyManifest({assets:assets()});assert.equal(rows.length,24);
  assert.ok(rows.every(a=>a.url===`${PRIVACY_ORIGIN}/${a.path}`));
  for(const change of [a=>a.pop(),a=>{a[1]=a[0];},a=>{a[0].path='assets/works/001/cover-768.webp';},a=>{a[0].url='https://malicious.example/film.mp4';},a=>{a[0].sha256='bad';},a=>{a[0].bytes=0;}]){const a=assets();change(a);assert.throws(()=>validatePrivacyManifest({assets:a}));}
});
test('film-only metadata repair preserves every existing cover override and eight unaffected works',()=>{
  const original=inputs(),snapshot=structuredClone(original),rows=validatePrivacyManifest(assets());
  const fixed=repairMetadata(original.works,original.media,rows);
  assert.deepEqual(original,snapshot);
  assert.equal(fixed.works[8].title,'榛果棕');assert.equal(fixed.works[8].details[0][1],'榛果棕');
  for(let i=0;i<32;i++){
    const id=String(i+1).padStart(3,'0');
    for(const file of ['cover-384.webp','cover-768.webp','poster.webp'])assert.deepEqual(fixed.media.works[id].files[file],original.media.works[id].files[file]);
    if(i>=24)assert.deepEqual(fixed.media.works[id],original.media.works[id]);
  }
  assert.deepEqual(fixed.media.allowedOrigins,[...original.media.allowedOrigins,PRIVACY_ORIGIN]);
  assertRewrites(rewrites(original.media),rewrites(fixed.media),rows);
  assert.throws(()=>assertRewrites(rewrites(original.media),rewrites(original.media),rows));
  const broken=rewrites(fixed.media);broken.find(r=>r.source.includes('cover-384')).destination='https://original.vercel.app/old';
  assert.throws(()=>assertRewrites(rewrites(original.media),broken,rows));
});
test('nonmedia deployment settings are preserved while revision header may change',()=>{
  const before={version:2,redirects:[{source:'/old',destination:'/works'}],headers:[{source:'/(.*)',headers:[{key:'X-VX-Content-Revision',value:'old'},{key:'Cache-Control',value:'max-age=0'}]}],rewrites:[]};
  const after=structuredClone(before);after.headers[0].headers[0].value='new';assertConfigPreserved(before,after);
  after.redirects=[];assert.throws(()=>assertConfigPreserved(before,after));
});
