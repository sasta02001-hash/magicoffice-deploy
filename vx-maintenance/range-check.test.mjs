import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyRange} from './range-check.mjs';

test('a temporary full response is discarded and the unchanged URL is retried',async()=>{
  let cancelled=false;const calls=[];
  const result=await verifyRange('https://example.test/film.mp4',{wait:async()=>{},fetchImpl:async(url,options)=>{
    calls.push({url,range:options.headers.Range});
    if(calls.length===1)return {status:200,body:{cancel:async()=>{cancelled=true;}}};
    return new Response(new Uint8Array(1024),{status:206,headers:{'content-range':'bytes 0-1023/9999'}});
  }});
  assert(cancelled);assert.equal(result.attempts,2);assert.equal(calls[0].url,calls[1].url);assert.equal(calls[1].range,'bytes=0-1023');
});
test('persistent full responses and wrong byte ranges remain failures',async()=>{
  await assert.rejects(verifyRange('https://example.test/film.mp4',{attempts:2,wait:async()=>{},fetchImpl:async()=>new Response(new Uint8Array(1024),{status:200})}),/cache expiry/);
  await assert.rejects(verifyRange('https://example.test/film.mp4',{fetchImpl:async()=>new Response(new Uint8Array(1024),{status:206,headers:{'content-range':'bytes 1024-2047/9999'}})}),/RANGE_HEADER/);
});
