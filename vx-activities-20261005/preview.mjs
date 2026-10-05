import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const ROOT=path.dirname(fileURLToPath(import.meta.url));
const cache=new Map();
const types={'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.webp':'image/webp','.json':'application/json'};
http.createServer(async(req,res)=>{
 try{
  const u=new URL(req.url,'http://localhost');let p=decodeURIComponent(u.pathname);if(p.endsWith('/'))p+='index.html';
  if(p.includes('..'))throw Error('Invalid path');
  for(const local of [path.join(ROOT,'patch/catalog/content/pages',p),path.join(ROOT,'patch/main/source',p),path.join(ROOT,'../vx-opening-2026/patch/catalog/content/pages',p)]){
   try{const data=await fs.readFile(local);res.writeHead(200,{'Content-Type':types[path.extname(p)]||'application/octet-stream'});res.end(data);return;}catch(e){if(e.code!=='ENOENT')throw e;}
  }
  if(!cache.has(p))cache.set(p,fetch('https://vxsagittarius.vercel.app'+u.pathname,{signal:AbortSignal.timeout(40000)}).then(async r=>({status:r.status,type:r.headers.get('content-type'),bytes:Buffer.from(await r.arrayBuffer())})));
  const result=await cache.get(p);res.writeHead(result.status,{'Content-Type':result.type||'application/octet-stream'});res.end(result.bytes);
 }catch{res.writeHead(502);res.end('Preview fetch failed');}
}).listen(4173,'127.0.0.1',()=>console.log('VX review at http://127.0.0.1:4173/activities/'));
