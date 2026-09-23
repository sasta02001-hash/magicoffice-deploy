import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {patchMenu} from './patch-menu.mjs';

const PROJECT = 'prj_ivj29hH4VhtflaVtGapoPLR1RnOi';
const TEAM = 'team_44tkvxP20I5s9SUmlxfUEQM1';
const NAME = 'qingwen-coffee-menu-vercel';
const HOST = 'qingwen-coffee-menu-vercel.vercel.app';
const BASE = 'dpl_4gBiVDN5K9HtgRnnLDQiEvwNvtwu';
const SOURCE_COMMIT = process.env.GITHUB_SHA || 'qingwen-menu-combos-20260924';
const EXPECTED_MENU = '27a35ae01a14c33c097dc5fc93a4fa5a72fe0e554f479d9b5d26f438ec19b122';
const MENU_HASHES = {
  'index.html': '27a35ae01a14c33c097dc5fc93a4fa5a72fe0e554f479d9b5d26f438ec19b122',
  'style.css': 'eb50f0ed99678ddd1907e3857d6f2a658e5f06a79df8bee20baedf841712ec09',
  'menu.js': '237bf4eab0d7b9cc25ae1e0af61ac8f3e594c73f1b89b60abe22737c6c1b0c38'
};
const hash = b => createHash('sha256').update(b).digest('hex');
const delay = ms => new Promise(r => setTimeout(r, ms));
const token = process.env.VERCEL_TOKEN;
const receiptPath = new URL('./receipt.json', import.meta.url);
const receipt = {status:'preflight',projectId:PROJECT,sourceCommit:SOURCE_COMMIT,startedAt:new Date().toISOString()};
const save = () => fs.writeFile(receiptPath,JSON.stringify(receipt,null,2));

function flatten(nodes,prefix='') {
  assert.ok(Array.isArray(nodes),'INVALID_FILE_TREE');
  return nodes.flatMap(n => {
    assert.ok(typeof n.name==='string' && !/[\\/]/.test(n.name) && !['.','..'].includes(n.name),'UNSAFE_FILE_NAME');
    const file=prefix+n.name;
    if(['directory','folder'].includes(n.type))return flatten(n.children||[],file+'/');
    assert.equal(n.type,'file','UNSUPPORTED_SOURCE_TYPE');
    assert.ok(n.uid,'MISSING_SOURCE_FILE_ID');
    return [{file,uid:n.uid}];
  });
}
async function api(route) {
  const url=new URL(route,'https://api.vercel.com');
  assert.equal(url.origin,'https://api.vercel.com');
  url.searchParams.set('teamId',TEAM);
  const r=await fetch(url,{headers:{Authorization:`Bearer ${token}`},redirect:'error',signal:AbortSignal.timeout(60000)});
  if(!r.ok) {
    const d=await r.json().catch(()=>({}));
    const code=String(d.error?.code||d.code||'unknown').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,70);
    throw new Error(`VERCEL_HTTP_${r.status}:${code}`);
  }
  return r.json();
}
async function checkBrowser(target,label) {
  const code=await new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,[new URL('./browser-check.mjs',import.meta.url).pathname,target,label],{stdio:'inherit',env:{PATH:process.env.PATH,HOME:process.env.HOME}});
    child.on('error',()=>reject(new Error('BROWSER_START_FAILED')));child.on('close',resolve);
  });
  assert.equal(code,0,'BROWSER_VERIFICATION_FAILED');
}
async function production() {
  const d=await api(`/v13/deployments/${HOST}`);
  assert.equal(d.projectId??d.project?.id,PROJECT,'WRONG_PRODUCTION_PROJECT');
  assert.equal(d.readyState,'READY','PRODUCTION_NOT_READY');
  return d;
}
async function sourceBytes(deployment,uid) {
  const r=await api(`/v8/deployments/${deployment}/files/${encodeURIComponent(uid)}`);
  const b64=typeof r==='string'?r:r.data??r.content;
  assert.equal(typeof b64,'string','UNKNOWN_SOURCE_RESPONSE');
  return Buffer.from(b64,'base64');
}
async function publicBytes(relative) {
  const url=new URL(relative,`https://${HOST}/`);
  assert.equal(url.hostname,HOST);
  const r=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(60000)});
  assert.equal(r.status,200,`PUBLIC_HTTP_${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

let temp;
try {
  assert.ok(token,'MISSING_MAGICOFFICE_ACTIONS_SECRET');
  const project=await api(`/v9/projects/${PROJECT}`);
  assert.equal(project.id,PROJECT,'WRONG_PROJECT');
  assert.equal(project.accountId,TEAM,'WRONG_TEAM');
  assert.equal(project.name,NAME,'WRONG_PROJECT_NAME');
  const before=await production();
  assert.equal(before.id,BASE,'PRODUCTION_CHANGED_REVIEW_REQUIRED');
  receipt.previousDeployment=before.id;
  receipt.outputDirectory=before.projectSettings?.outputDirectory??null;
  const tree=flatten(await api(`/v6/deployments/${before.id}/files?base=src`));
  assert.ok(tree.length>0 && tree.length<=2000,'UNEXPECTED_SOURCE_FILE_COUNT');
  assert.equal(new Set(tree.map(x=>x.file)).size,tree.length,'DUPLICATE_SOURCE_PATH');
  receipt.originalFiles=tree.map(x=>x.file);
  await save();
  temp=await fs.mkdtemp(path.join(os.tmpdir(),'qingwen-menu-'));
  const bytesByPath=new Map();
  let total=0;
  for(const entry of tree) {
    assert.ok(!entry.file.split('/').some(x=>x==='.git'||x==='.env'||x.startsWith('.env.')),'UNEXPECTED_SENSITIVE_SOURCE');
    const bytes=await sourceBytes(before.id,entry.uid);
    total+=bytes.length;
    assert.ok(total<180_000_000,'SOURCE_SIZE_LIMIT');
    bytesByPath.set(entry.file,bytes);
    const dest=path.join(temp,entry.file);
    await fs.mkdir(path.dirname(dest),{recursive:true});
    await fs.writeFile(dest,bytes);
  }
  // Patch only the menu. Every other current source file, including Wi-Fi, is preserved.
  const anchors=tree.filter(x=>path.posix.basename(x.file)==='index.html' && hash(bytesByPath.get(x.file))===EXPECTED_MENU);
  assert.equal(anchors.length,1,'MENU_SOURCE_NOT_FOUND');
  const publicRoot=path.posix.dirname(anchors[0].file).replace(/^\.$/,'');
  receipt.publicRoot=publicRoot;
  const menuPaths=Object.keys(MENU_HASHES).map(file=>path.posix.join(publicRoot,file));
  const originalMenu=new Map();
  for(const [file,digest] of Object.entries(MENU_HASHES)) {
    const bytes=bytesByPath.get(path.posix.join(publicRoot,file));
    assert.ok(bytes,'MENU_FILE_MISSING');
    assert.equal(hash(bytes),digest,'MENU_CHANGED_BEFORE_PATCH');
    originalMenu.set(file,bytes);
  }
  const patched=await patchMenu(originalMenu);
  const preserved=tree.filter(x=>!menuPaths.includes(x.file)).map(x=>({file:x.file,sha256:hash(bytesByPath.get(x.file))}));
  receipt.preservedFiles=preserved;
  receipt.changedFiles=[];
  for(const [file,bytes] of patched) {
    const target=path.posix.join(publicRoot,file);
    await fs.writeFile(path.join(temp,target),bytes);
    bytesByPath.set(target,bytes);
    receipt.changedFiles.push({file:target,sha256:hash(bytes)});
  }
  assert.ok(preserved.some(x=>x.file.endsWith('wifi/index.html')),'WIFI_MISSING_IN_SOURCE');
  const beforeWifi=hash(await publicBytes('/wifi/'));
  const beforeQr=hash(await publicBytes('/wifi/wifi-qr.png'));
  await fs.mkdir(path.join(temp,'.vercel'),{recursive:true});
  await fs.writeFile(path.join(temp,'.vercel/project.json'),JSON.stringify({projectId:PROJECT,orgId:TEAM,projectName:NAME}));
  await checkBrowser(path.join(temp,publicRoot),'preview');
  assert.equal((await production()).id,before.id,'PRODUCTION_CHANGED_BEFORE_PUBLISH');
  receipt.status='publishing';
  await save();
  console.log(JSON.stringify({status:'publishing',projectId:PROJECT,preservedFileCount:preserved.length,changedFiles:receipt.changedFiles.map(x=>x.file)}));
  const code=await new Promise((resolve,reject)=>{
    const child=spawn('npx',['--yes','vercel@59.23.2','deploy','--prod','--yes','--scope','magicoffice','--token',token],{
      cwd:temp,stdio:'inherit',env:{...process.env,VERCEL_PROJECT_ID:PROJECT,VERCEL_ORG_ID:TEAM}
    });
    child.on('error',()=>reject(new Error('DEPLOY_PROCESS_FAILED')));
    child.on('close',resolve);
  });
  assert.equal(code,0,'VERCEL_DEPLOY_FAILED');
  let after;
  for(let i=0;i<30;i++) {
    after=await production();
    if(after.id!==before.id)break;
    await delay(2000);
  }
  assert.notEqual(after.id,before.id,'PRODUCTION_ALIAS_NOT_UPDATED');
  receipt.deploymentId=after.id;
  receipt.deploymentUrl='https://'+after.url;
  receipt.status='verifying';
  await save();
  const afterTree=flatten(await api(`/v6/deployments/${after.id}/files?base=src`));
  // Compare every preserved source byte; project link files added by the CLI are excluded.
  for(const entry of preserved) {
    const next=afterTree.find(x=>x.file===entry.file);
    assert.ok(next,'PRESERVED_FILE_MISSING');
    const old=tree.find(x=>x.file===entry.file);
    if(next.uid!==old.uid)assert.equal(hash(await sourceBytes(after.id,next.uid)),entry.sha256,'PRESERVED_FILE_CHANGED');
  }
  for(const entry of receipt.changedFiles) {
    const next=afterTree.find(x=>x.file===entry.file);
    assert.ok(next,'PATCHED_FILE_MISSING');
    assert.equal(hash(await sourceBytes(after.id,next.uid)),entry.sha256,'PATCHED_SOURCE_HASH_MISMATCH');
  }
  for(const [file,bytes] of patched) {
    const route=file==='index.html'?'/':'/'+file;
    assert.equal(hash(await publicBytes(route)),hash(bytes),'LIVE_MENU_HASH_MISMATCH');
  }
  assert.equal(hash(await publicBytes('/wifi/')),beforeWifi,'LIVE_WIFI_CHANGED');
  assert.equal(hash(await publicBytes('/wifi/wifi-qr.png')),beforeQr,'LIVE_QR_CHANGED');
  await checkBrowser(`https://${HOST}/`,'production');
  receipt.status='published-and-verified';
  receipt.publicUrl=`https://${HOST}/#sets`;
  receipt.finishedAt=new Date().toISOString();
  await save();
  console.log(JSON.stringify({status:receipt.status,deploymentId:after.id,url:receipt.publicUrl,wifiUnchanged:true}));
} catch(error) {
  receipt.status='failed';
  receipt.error=String(error.message).replaceAll(token||'__NO_TOKEN__','[redacted]').split('\n')[0].slice(0,200);
  await save();
  console.error(receipt.error);
  process.exitCode=1;
} finally {
  if(temp)await fs.rm(temp,{recursive:true,force:true});
}
