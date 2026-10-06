import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {validateWorks,workScript,card,CRAFT_CATEGORIES} from './patch/catalog/catalog.mjs';
const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8');
const spec=JSON.parse(read('classification.json'));
const works=JSON.parse(read('patch/catalog/content/works.json'));
test('every work agrees with the approved classification document',()=>{
 assert.equal(validateWorks(works).length,32);assert.equal(new Set(works.map(w=>w.id)).size,32);
 assert.deepEqual(CRAFT_CATEGORIES,spec.categories);
 for(const expected of spec.works){
  const work=works.find(w=>w.id===expected.id);assert(work);
  assert.equal(work.title,expected.title);assert.equal(work.cardTitle,expected.title);assert.equal(work.category,expected.category);
  const cat=spec.categories.find(c=>c.id===expected.category);
  assert.deepEqual(work.details[0],['工藝分類',cat.id==='pending'?'待確認':cat.code+'｜'+cat.name]);
  if(cat.id!=='pending')assert.deepEqual(work.details[1],['工藝組合',expected.technique]);
 }
 assert.deepEqual(Object.fromEntries(spec.categories.map(c=>[c.id,works.filter(w=>w.category===c.id).length])),{bleach:4,color:0,perm:12,triascend:2,trifusion:10,triform:0,trievolve:1,general:1,pending:2});
 assert.deepEqual(works.filter(w=>w.category==='pending').map(w=>w.id),['005','009']);
 assert.equal(works.find(w=>w.id==='006').category,'bleach');
 assert.equal(works.find(w=>w.id==='030').category,'general');
});
test('browser data and static cards share canonical classifications',()=>{
 const context={window:{}};vm.runInNewContext(workScript(works),context);
 assert.equal(context.window.VX_WORKS.length,32);assert.equal(context.window.VX_CRAFT_CATEGORIES.length,9);
 for(const work of works){const html=card(work,0);assert(html.includes(work.title));assert(html.includes('class="vx-craft-tag"'));assert(html.includes('/works/'+work.id+'/'));}
 const invalid=structuredClone(works);invalid[0].category='guessed';assert.throws(()=>validateWorks(invalid),/Invalid craft category/);
});
test('release patch matches its integrity manifest',()=>{
 for(const [p,sha] of Object.entries(JSON.parse(read('checksums.json'))))assert.equal(createHash('sha256').update(read(p)).digest('hex'),sha);
});
