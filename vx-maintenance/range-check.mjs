import assert from 'node:assert/strict';

export async function verifyRange(url,{fetchImpl=fetch,wait=ms=>new Promise(r=>setTimeout(r,ms)),attempts=14}={}){
  for(let attempt=1;attempt<=attempts;attempt++){
    const response=await fetchImpl(url,{headers:{Range:'bytes=0-1023'},redirect:'error',signal:AbortSignal.timeout(30000)});
    if(response.status===206){
      const range=response.headers.get('content-range');
      assert.match(range??'',/^bytes 0-1023\/[0-9]+$/,'VIDEO_RANGE_HEADER_FAILED');
      assert.equal((await response.arrayBuffer()).byteLength,1024,'VIDEO_RANGE_BYTES_FAILED');
      return {status:206,attempts:attempt,contentRange:range};
    }
    // A newly published static asset can briefly retain a cached full response.
    // Cancel its body instead of downloading a whole film during a range check.
    await response.body?.cancel();
    assert.equal(response.status,200,'VIDEO_RANGE_FAILED');
    assert(attempt<attempts,'VIDEO_RANGE_FAILED: still receiving full responses after cache expiry');
    await wait(5000);
  }
}
