import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {validateRefinement} from './refinement-guard.mjs';

function fixture(){
  const source={width:720,height:1280,frames:100,fps:30,originalSha256:'b'.repeat(64)};
  const plan={works:{'001':{source}}};
  const manifest={algorithm:'hair-aware-soft-v1',assets:[{id:'001',path:'assets/works/001/film.mp4',sourceSha256:source.originalSha256,validated:true,audioUnchanged:true,width:720,height:1280,frames:100,fps:30,bytes:12000,sha256:'a'.repeat(64)}]};
  const assets=manifest.assets.map(({path,bytes,sha256})=>({path,bytes,sha256}));
  const request={mode:'publish-refinement',refinementCommitSha:'c'.repeat(40),refinementRunId:123,approvedPrivacyRevision:createHash('sha256').update(JSON.stringify(assets)).digest('hex')};
  return {request,manifest,plan};
}
test('publication requires the exact reviewed media revision and original geometry/audio',()=>{
  const f=fixture();assert.equal(validateRefinement(f.request,f.manifest,f.plan),f.request.approvedPrivacyRevision);
  for(const [key,value] of [['sourceSha256','d'.repeat(64)],['width',360],['fps',24],['frames',99],['audioUnchanged',false],['sha256','e'.repeat(64)]]){
    const g=fixture();g.manifest.assets[0][key]=value;assert.throws(()=>validateRefinement(g.request,g.manifest,g.plan));
  }
  const g=fixture();g.manifest.assets=[];assert.throws(()=>validateRefinement(g.request,g.manifest,g.plan));
});
test('metadata-only normalization is tied to reviewed input and identical decoded pixels',()=>{
  const f=fixture();f.manifest.reviewedAssets=structuredClone(f.manifest.assets);
  f.manifest.assets[0].sha256='d'.repeat(64);
  f.manifest.colorNormalization=[{id:'001',inputSha256:'a'.repeat(64),outputSha256:'d'.repeat(64),
    decodedPixelHashBefore:'SHA256='+'b'.repeat(64),decodedPixelHashAfter:'SHA256='+'b'.repeat(64),audioUnchanged:true,geometryUnchanged:true}];
  assert.equal(validateRefinement(f.request,f.manifest,f.plan),f.request.approvedPrivacyRevision);
  f.manifest.colorNormalization[0].decodedPixelHashAfter='SHA256='+'e'.repeat(64);
  assert.throws(()=>validateRefinement(f.request,f.manifest,f.plan));
});
