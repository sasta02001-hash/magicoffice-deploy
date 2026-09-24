import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

export function validateRefinement(request,manifest,plan){
  assert.equal(request.mode,'publish-refinement');
  assert.match(request.refinementCommitSha,/^[a-f0-9]{40}$/);
  assert(Number.isSafeInteger(request.refinementRunId)&&request.refinementRunId>0);
  assert.match(request.approvedPrivacyRevision,/^[a-f0-9]{64}$/);
  assert.equal(manifest.algorithm,'hair-aware-soft-v1');
  assert.deepEqual(manifest.assets.map(a=>a.id).sort(),Object.keys(plan.works).sort(),'Refinement coverage changed');
  for(const asset of manifest.assets){
    const original=plan.works[asset.id].source;
    assert.equal(asset.path,`assets/works/${asset.id}/film.mp4`);
    assert.equal(asset.sourceSha256,original.originalSha256,'Refinement source changed');
    assert.equal(asset.validated,true);assert.equal(asset.audioUnchanged,true);
    for(const key of ['width','height','frames'])assert.equal(asset[key],original[key],`Refinement ${key} changed`);
    assert(Math.abs(asset.fps-original.fps)<.001,'Refinement frame rate changed');
    assert.match(asset.sha256,/^[a-f0-9]{64}$/);assert(asset.bytes>0);
  }
  const reviewed=manifest.reviewedAssets??manifest.assets;
  if(manifest.reviewedAssets){
    assert.equal(reviewed.length,manifest.assets.length);assert.equal(manifest.colorNormalization.length,reviewed.length);
    for(let i=0;i<reviewed.length;i++){
      const proof=manifest.colorNormalization[i],before=reviewed[i],after=manifest.assets[i];
      assert.equal(before.id,after.id);assert.equal(proof.id,after.id);
      assert.equal(proof.inputSha256,before.sha256);assert.equal(proof.outputSha256,after.sha256);
      assert.match(proof.decodedPixelHashBefore,/^SHA256=[a-f0-9]{64}$/);
      assert.equal(proof.decodedPixelHashBefore,proof.decodedPixelHashAfter,'Unreviewed pixels changed');
      assert.equal(proof.audioUnchanged,true);assert.equal(proof.geometryUnchanged,true);
    }
  }
  const assets=reviewed.map(({path,bytes,sha256})=>({path,bytes,sha256}));
  const revision=createHash('sha256').update(JSON.stringify(assets)).digest('hex');
  assert.equal(revision,request.approvedPrivacyRevision,'Unreviewed artifact revision');
  return revision;
}

export async function verifyRefinementRun(request,repository,token){
  assert.equal(repository,'sasta02001-hash/magicoffice-deploy');
  assert(Number.isSafeInteger(request.refinementRunId)&&request.refinementRunId>0);
  const response=await fetch(`https://api.github.com/repos/${repository}/actions/runs/${request.refinementRunId}`,{
    headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(30000)});
  assert(response.ok,'Refinement run lookup failed');const run=await response.json();
  assert.equal(run.head_branch,'vx-maintenance');assert.equal(run.head_sha,request.refinementCommitSha);
  assert.equal(run.path,'.github/workflows/vx-maintenance.yml');
  assert.equal(run.status,'completed');assert.equal(run.conclusion,'success');
}
