import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeRows,verifyCoverage,rosterDiff,PROJECT,validateRequest,flattenFiles,validateRows,filteredRows,verifyLive,discoverSheetTabs,patchScheduleParser} from './publish.mjs';
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

test('roster delta ignores timestamps, preserves split shifts and counts pure additions/removals',()=>{
 assert.deepEqual(rosterDiff([row],[{...row,updatedAt:'new'}]),{added:0,removed:0,timeChanges:0});
 assert.deepEqual(rosterDiff([row],[{...row,startTime:'20:30'}]),{added:0,removed:0,timeChanges:1});
 assert.deepEqual(rosterDiff([row],[row,{...row,name:'other'}]),{added:1,removed:0,timeChanges:0});
 assert.deepEqual(rosterDiff([row,{...row,name:'other'}],[row]),{added:0,removed:1,timeChanges:0});
 assert.deepEqual(rosterDiff([row,{...row,startTime:'14:00',endTime:'18:00'}],[row,{...row,startTime:'14:30',endTime:'18:00'}]),{added:0,removed:0,timeChanges:1});
});

test('future sheet metadata is discovered without publishing source identifiers',()=>{
 const html=String.raw`[7,0,\"129782300\",[{\"1\":[[0,0,\"十月\"]]}]`;
 assert.deepEqual(discoverSheetTabs(html),[{gid:'129782300',title:'十月'}]);
});
test('schedule parser migration accepts dotted half-hours and separate closure rows',()=>{
 const source=`const input = String(value ?? '').trim().replace(/[－–—]/g, '-').replace(/：/g, ':');
    const dayRows = [];
      if (!sourceName) fail('ATTENDANCE_WITHOUT_NAME', cell);
    if (event === '公休') {`;
 const patched=patchScheduleParser(source);
 assert.match(patched,/closedByMarker/);
 assert.match(patched,/\(\?<=\\d\)/);
 assert.equal(patchScheduleParser(patched),patched);
});

test('weekly report sums every day including undetermined attendance and one explicit closure',()=>{
 const rows=[3,2,5,2,5,1,5].flatMap((count,i)=>Array.from({length:count},(_,j)=>{
   const date=`2026-10-${String(5+i).padStart(2,'0')}`;
   if(i===5)return {...row,date,name:'',startTime:'',endTime:'',shift:'未公告',event:'公休'};
   return {...row,date,name:`person-${j}`,...(j===0?{startTime:'',endTime:'',shift:'未定'}:{})};
 }));
 const summary=summarizeRows([...rows,{...row,date:'2026-10-12'}],'2026-10-05','2026-10-11');
 assert.equal(summary.rows,24);
 assert.equal(summary.week.rows,23);
 assert.equal(summary.week.closureRows,1);
 assert.equal(summary.week.undeterminedRows,6);
 assert.equal(summary.week.timedRows,16);
 assert.deepEqual(summary.week.daily.map(day=>day.rows),[3,2,5,2,5,1,5]);
 assert.equal(summary.week.complete,true);
 const meta={currentWeekRowCount:23,currentWeekComplete:true,currentWeekMissingDates:[]};
 verifyCoverage(meta,summary);
 assert.throws(()=>verifyCoverage({...meta,currentWeekRowCount:20},summary),/WEEK_METADATA_COUNT_MISMATCH/);
});

test('weekly report crosses a year boundary and leaves blank dates missing',()=>{
 const summary=summarizeRows([{...row,date:'2026-12-31'},{...row,date:'2027-01-01'}],'2026-12-28','2027-01-03');
 assert.equal(summary.week.rows,2);
 assert.equal(summary.week.complete,false);
 assert.equal(summary.week.closureRows,0);
 assert.equal(summary.week.missingDates.length,5);
 assert.throws(()=>summarizeRows([row],'2026-02-30','2026-03-08'),/INVALID_WEEK_START/);
});

test('weekly report retains split shifts and rejects unclassified attendance',()=>{
 const rows=[{...row,date:'2026-10-05'},{...row,date:'2026-10-05',startTime:'14:00',endTime:'18:00'}];
 assert.equal(summarizeRows(rows,'2026-10-05','2026-10-11').week.rows,2);
 assert.throws(()=>summarizeRows([{...row,startTime:'',endTime:'',shift:'unknown'}],'2026-10-05','2026-10-11'),/UNCLASSIFIED_PUBLIC_ROW/);
});
