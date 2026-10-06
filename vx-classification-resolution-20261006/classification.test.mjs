import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {validateWorks,workScript,card,CRAFT_CATEGORIES} from './patch/catalog/catalog.mjs';
const read=p=>JSON.parse(fs.readFileSync(new URL(p,import.meta.url),'utf8'));
const before=read('before-works.json'),works=read('patch/catalog/content/works.json'),spec=read('classification.json');
test('only the requested classifications change; remaining 30 works are byte-equivalent objects',()=>{
 assert.equal(validateWorks(works).length,32);
 for(const work of works){
  const old=before.find(w=>w.id===work.id);assert(old);
  if(!['005','009'].includes(work.id)){assert.deepEqual(work,old);continue;}
  assert.equal(work.category,'triascend');assert.equal(work.cardInfo,'線條提亮・色彩層次');
  assert.deepEqual(work.details[0],['工藝分類','TRIASCEND｜七維虹彩釉光品藏']);
  assert.deepEqual(work.details[1],['工藝組合','挑漂／漂髮＋上色（依作品呈現判斷）']);
  assert.deepEqual(work.details.slice(2),old.details.slice(1));
  for(const key of Object.keys(old).filter(k=>!['category','cardInfo','details'].includes(k)))assert.deepEqual(work[key],old[key]);
 }
 assert.deepEqual(Object.fromEntries(spec.categories.map(c=>[c.id,works.filter(w=>w.category===c.id).length])),{bleach:4,color:0,perm:12,triascend:4,trifusion:10,triform:0,trievolve:1,general:1});
 assert.equal(works.filter(w=>w.category==='pending').length,0);
});
test('category options and generated work data agree without an empty pending filter',()=>{
 assert.deepEqual(CRAFT_CATEGORIES,spec.categories);assert(!CRAFT_CATEGORIES.some(c=>c.id==='pending'));
 const context={window:{}};vm.runInNewContext(workScript(works),context);
 assert.equal(context.window.VX_CRAFT_CATEGORIES.length,8);
 for(const id of ['005','009']){const w=works.find(w=>w.id===id);assert(card(w,0).includes('TRIASCEND'));assert(!card(w,0).includes('待確認'));}
});
