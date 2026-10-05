import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
const root=new URL('./',import.meta.url);
const read=p=>fs.readFile(new URL(p,root),'utf8');
const c=JSON.parse(await read('campaign.json'));
const sandbox={window:{}};vm.runInNewContext(await read('patch/catalog/content/pages/activities/operations.js'),sandbox);
const ops=sandbox.window.VXOperations;
test('15 separately redeemable approved gifts and six correct score levels',()=>{
 assert.equal(c.rewards.length,15);
 assert.deepEqual(c.rewards.map(x=>x.points),[10,10,15,15,25,25,35,35,40,40,40,50,50,50,50]);
 assert.equal(new Set(c.rewards.map(x=>x.id)).size,15);
 assert.equal(c.rewards.find(x=>x.id==='airpods-5').name,'AirPods 5 無線耳機');
 assert.match(c.rewards.find(x=>x.id==='portrait').note,/AI 情境示意・非廠商實拍作品/);
});
test('correct points, rates and explicit noncash distinction',()=>{
 const html=ops.card(c,Date.parse('2026-10-05T12:00:00+08:00'));
 for(const text of ['NT$6,000＝1 點','NT$3,000＝1 點','10 點＝1 張滿點卡','VX 滿點卡＝紅卡','ERA 滿點卡＝綠卡','10 分','5 分','同分數品項並非整組贈送','非現金退款','NT$6,980','NT$7,980','NT$8,980'])assert(html.includes(text),text);
 assert.equal((html.match(/data-reward-points=/g)||[]).length,15);
 assert(!/月底前|現折\s*20%/.test(html));
});
test('campaign and October-only benefits have independent Taiwan date boundaries',()=>{
 for(const [date,status] of [['2026-09-30T23:59:59+08:00','upcoming'],['2026-10-01T00:00:00+08:00','current'],['2026-12-31T23:59:59+08:00','current'],['2027-01-01T00:00:00+08:00','ended']])assert.equal(ops.status(c,Date.parse(date)),status);
 assert(ops.card(c,Date.parse('2026-10-31T23:59:59+08:00')).includes('data-october-status="current"'));
 assert(ops.card(c,Date.parse('2026-11-01T00:00:00+08:00')).includes('data-october-status="ended"'));
});
test('static HTML and client data share the same campaign; all patch files are hashed',async()=>{
 for(const p of ['patch/catalog/content/pages/activities/index.html','patch/main/source/index.html']){
  const html=await read(p),raw=html.match(/<script id="vx-operations-data" type="application\/json">([\s\S]*?)<\/script>/)[1];
  assert.deepEqual(JSON.parse(raw).campaigns,[c]);assert(!/月底前|1 張綠色滿卡至 4 張紅色滿卡/.test(html));
 }
 const checksums=JSON.parse(await read('checksums.json'));assert.equal(Object.keys(checksums).length,19);
 for(const [p,sha] of Object.entries(checksums))assert.equal(createHash('sha256').update(await fs.readFile(new URL(p,root))).digest('hex'),sha);
});
