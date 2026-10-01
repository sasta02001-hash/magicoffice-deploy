import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {validateResume} from './validate-resume.mjs';import {PRIVACY_PROJECT} from './repair.mjs';
test('content-only resume requires the exact already-published deployment and manifest',()=>{
 const assets=Array.from({length:24},(_,i)=>({path:'assets/works/'+String(i+1).padStart(3,'0')+'/film.mp4',bytes:1000,sha256:'a'.repeat(64)}));
 const revision=createHash('sha256').update(JSON.stringify(assets)).digest('hex');
 const request={mode:'resume-content',expectedPrivacyDeploymentId:'dpl_new',expectedPrivacyRevision:revision};
 const receipt={status:'published-and-verified',projectId:PRIVACY_PROJECT,deploymentId:'dpl_new',revision,count:24};
 const manifest={revision,assets};assert.equal(validateResume(request,receipt,manifest),revision);
 for(const key of ['status','projectId','deploymentId','revision'])assert.throws(()=>validateResume(request,{...receipt,[key]:'wrong'},manifest));
 const changed=structuredClone(manifest);changed.assets[0].sha256='b'.repeat(64);assert.throws(()=>validateResume(request,receipt,changed));
});
