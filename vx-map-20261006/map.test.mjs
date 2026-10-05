import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
const ROOT=new URL('./',import.meta.url);
const read=p=>fs.readFile(new URL(p,ROOT),'utf8');
const activities=await read('patch/catalog/content/pages/activities/index.html');
const ops=await read('patch/catalog/content/pages/activities/operations.js');
const booking=await read('patch/main/source/booking/index.html');
test('both map modules preserve original artwork, navigation and accessible enlargement',()=>{
 for(const html of [activities,booking]){
  assert.equal((html.match(/id="vx-art-map"/g)||[]).length,1);
  for(const text of ['vx-art-map.css','vx-art-neighborhood-map.jpeg','非等比例','Google 地圖導航','點圖放大查看','width="1254" height="1254"','target="_blank" rel="noopener"'])assert(html.includes(text),text);
 }
 assert(booking.includes('href="#vx-art-map"'));
 for(const text of ['黑盒髮廊','私座髮藝','DC Hair','訂金','取消與改期'])assert(booking.includes(text),text);
});
test('dynamic activity rerender retains the map and all 15 current rewards',async()=>{
 const context={window:{}};vm.runInNewContext(ops,context);
 const data=JSON.parse(activities.match(/<script id="vx-operations-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
 const before=JSON.parse(await fs.readFile(new URL('../vx-activities-20261005/campaign.json',ROOT),'utf8'));
 assert.deepEqual(data.campaigns,[before]);
 const html=context.window.VXOperations.card(data.campaigns[0],Date.parse('2026-10-06T12:00:00+08:00'));
 assert.equal((html.match(/data-reward-points=/g)||[]).length,15);assert(html.includes('id="vx-art-map"'));
 assert(html.includes('VX 滿點卡＝紅卡'));assert(html.includes('ERA 滿點卡＝綠卡'));
});
test('patch integrity and uploaded original image SHA-256',async()=>{
 const checksums=JSON.parse(await read('checksums.json'));assert.equal(Object.keys(checksums).length,5);
 for(const [p,sha] of Object.entries(checksums))assert.equal(createHash('sha256').update(await fs.readFile(new URL(p,ROOT))).digest('hex'),sha);
 assert.equal(checksums['patch/catalog/content/pages/activities/vx-art-neighborhood-map.jpeg'],'1552a6bf95d4be6c532369c8318ad8870892468ce1e9a2f44ac6eef0aa09c67a');
});
