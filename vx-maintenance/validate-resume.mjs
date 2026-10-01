import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {validatePrivacyManifest,PRIVACY_ORIGIN,PRIVACY_PROJECT} from './repair.mjs';

export function validateResume(request,receipt,manifest){
  assert.equal(request.mode,'resume-content');
  assert.equal(receipt.status,'published-and-verified');
  assert.equal(receipt.projectId,PRIVACY_PROJECT);
  assert.equal(receipt.deploymentId,request.expectedPrivacyDeploymentId);
  assert.equal(receipt.revision,request.expectedPrivacyRevision);
  assert.equal(manifest.revision,request.expectedPrivacyRevision);
  const assets=validatePrivacyManifest(manifest);
  const rows=assets.map(({path,bytes,sha256})=>({path,bytes,sha256}));
  const revision=createHash('sha256').update(JSON.stringify(rows)).digest('hex');
  assert.equal(revision,manifest.revision);
  assert.equal(receipt.count,assets.length);
  return revision;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const read=async n=>JSON.parse(await fs.readFile(new URL(n,import.meta.url),'utf8'));
  const request=await read('request.json'),receipt=await read('media-receipt.json'),manifest=await read('privacy-assets.json');
  validateResume(request,receipt,manifest);
  const r=await fetch(PRIVACY_ORIGIN+'/privacy-manifest.json',{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(30000)});
  assert.equal(r.status,200);const live=await r.json();
  assert.equal(live.revision,manifest.revision);assert.deepEqual(live.assets,manifest.assets);
  console.log(JSON.stringify({status:'published-media-confirmed',deploymentId:receipt.deploymentId,revision:manifest.revision,reupload:false}));
}
