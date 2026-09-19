import test from 'node:test';
import assert from 'node:assert/strict';
import {PROJECT,validateRequest,flattenFiles,validateRows,filteredRows,verifyLive} from './publish.mjs';
const now=Date.parse('2026-09-19T08:00:00Z');
const req={projectId:PROJECT,expectedDeploymentId:'dpl_TEST',sourceVerifiedAt:new Date(now).toISOString(),sourceHash:'a'.repeat(64),publicHash:'b'.repeat(64),publishedMonths:['2026-09'],excludedNames:['心葉','嚕咩','Rumei','咲茉','泉']};
const row={date:'2026-09-19',name:'碧瑠',startTime:'20:00',endTime:'02:00',shift:'夜間',costume:'',event:'',sort:'10',updatedAt:req.sourceVerifiedAt};
test('reject expired verification, wrong project, and accidental Hekiru exclusion',()=>{
  validateRequest(req,now);
  assert.throws(()=>validateRequest(req,now+3600001));
  assert.throws(()=>validateRequest({...req,projectId:'main-site'},now));
  assert.throws(()=>validateRequest({...req,excludedNames:['へきる']},now));
});
test('source paths cannot escape the isolated service directory',()=>{
  assert.throws(()=>flattenFiles([{name:'..',type:'directory',children:[]}]));
  assert.throws(()=>flattenFiles([{name:'x/y',type:'file',uid:'123'}]));
  assert.deepEqual(flattenFiles([{name:'lib',type:'directory',children:[{name:'x.mjs',type:'file',uid:'abc'}]}]),[{file:'lib/x.mjs',uid:'abc'}]);
});
test('private notes and duplicate shifts cannot be published',()=>{
  validateRows([row]);
  assert.throws(()=>validateRows([{...row,notes:'internal'}]));
  assert.throws(()=>validateRows([row,row]));
});
test('personnel exclusion handles clover and keeps Hekiru',()=>{
  const rows=[row,{...row,name:'☘️心葉'},{...row,name:'Rumei'}];
  assert.deepEqual(filteredRows(rows,req.excludedNames),[row]);
});
test('HTTP success alone cannot pass stale or mismatched live data',()=>{
  const live={dataState:'live',stale:false,sourceHttpStatus:200,rows:[row],sourceHash:'ok'};
  verifyLive(live,[row],()=> 'ok');
  assert.throws(()=>verifyLive({...live,stale:true},[row],()=> 'ok'));
  assert.throws(()=>verifyLive({...live,rows:[]},[row],()=> 'ok'));
});
