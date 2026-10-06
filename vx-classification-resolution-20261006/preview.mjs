import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const ROOT=path.dirname(fileURLToPath(import.meta.url));
const cache=new Map();
const types={'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.webp':'image/webp','.jpeg':'image/jpeg','.json':'application/json'};
http.createServer(async(req,res)=>{
 try{
  const u=new URL(req.url,'http://localhost');let p=decodeURIComponent(u.pathname);if(p.endsWith('/'))p+='index.html';
  if(p.includes('..'))throw Error('Invalid path');
  for(const part of ['catalog','main']){
   try{const data=await fs.readFile(path.join(ROOT,'snapshot',part,'public',p));res.writeHead(200,{'Content-Type':types[path.extname(p)]||'application/octet-stream'});res.end(data);return;}catch(e){if(e.code!=='ENOENT')throw e;}
  }
  if(u.pathname.endsWith('.mp4')){
   const r=await fetch('https://vxsagittarius.vercel.app'+u.pathname,{headers:req.headers.range?{Range:req.headers.range}:{},signal:AbortSignal.timeout(40000)});
   const headers=Object.fromEntries(['content-type','content-length','accept-ranges','content-range'].filter(k=>r.headers.has(k)).map(k=>[k,r.headers.get(k)]));
   res.writeHead(r.status,headers);res.end(Buffer.from(await r.arrayBuffer()));return;
  }
  if(!cache.has(p))cache.set(p,fetch('https://vxsagittarius.vercel.app'+u.pathname,{signal:AbortSignal.timeout(40000)}).then(async r=>({status:r.status,type:r.headers.get('content-type'),bytes:Buffer.from(await r.arrayBuffer())})));
  const result=await cache.get(p);res.writeHead(result.status,{'Content-Type':result.type||'application/octet-stream'});res.end(result.bytes);
 }catch{res.writeHead(502);res.end('Preview fetch failed');}
}).listen(4173,'127.0.0.1',()=>console.log('VX portfolio preview at http://127.0.0.1:4173/works/'));

