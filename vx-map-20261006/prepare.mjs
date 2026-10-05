import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const ROOT=path.dirname(fileURLToPath(import.meta.url));
const BASE=path.join(ROOT,'../vx-activities-20261005/patch/catalog/content/pages/activities');
const sha=b=>createHash('sha256').update(b).digest('hex');
const read=p=>fs.readFile(p,'utf8');
const write=async(p,b)=>{await fs.mkdir(path.dirname(p),{recursive:true});await fs.writeFile(p,b);};
const fragment=await read(path.join(ROOT,'map.html'));
const map=heading=>fragment.replaceAll('{{heading}}',heading).trim();
const cssLink='<link rel="stylesheet" href="/activities/vx-art-map.css">';
const activityBefore=await read(path.join(BASE,'index.html'));
const opsBefore=await read(path.join(BASE,'operations.js'));
const bookingBefore=await read(process.argv[2]);
const oldLocation=/<section class="vx-opening-location">[\s\S]*?<\/section>/g;
assert.equal((activityBefore.match(oldLocation)||[]).length,1);
assert.equal((opsBefore.match(oldLocation)||[]).length,1);
const activities=activityBefore.replace(oldLocation,map('h3')).replace('</head>',cssLink+'</head>');
const ops=opsBefore.replace(oldLocation,map('h3'));
const bookingMarker='<section class="section section--radiant">';
assert.equal(bookingBefore.split(bookingMarker).length,2);
let booking=bookingBefore.replace(bookingMarker,'<section class="section"><div class="shell">'+map('h2')+'</div></section>\n'+bookingMarker).replace('</head>',cssLink+'</head>');
const heroEnd='<a class="btn" href="/works/">瀏覽作品目錄</a>';
const hero=booking.match(/<section class="page-hero">[\s\S]*?<\/section>/)?.[0];
assert(hero?.includes(heroEnd));booking=booking.replace(hero,hero.replace(heroEnd,heroEnd+'<a class="btn" href="#vx-art-map">VX ART 到店地圖 ↓</a>'));
const files={
 'catalog/content/pages/activities/index.html':activities,
 'catalog/content/pages/activities/operations.js':ops,
 'catalog/content/pages/activities/vx-art-map.css':await read(path.join(ROOT,'map.css')),
 'main/source/booking/index.html':booking,
 'catalog/content/pages/activities/vx-art-neighborhood-map.jpeg':await fs.readFile(process.argv[3])
};
assert.equal(sha(files['catalog/content/pages/activities/vx-art-neighborhood-map.jpeg']),'1552a6bf95d4be6c532369c8318ad8870892468ce1e9a2f44ac6eef0aa09c67a','Original upload must remain unchanged');
const checksums={};for(const [p,b] of Object.entries(files)){await write(path.join(ROOT,'patch',p),b);checksums['patch/'+p]=sha(b);}
await write(path.join(ROOT,'checksums.json'),JSON.stringify(checksums,null,2)+'\n');
await write(path.join(ROOT,'baseline.json'),JSON.stringify({'catalog/content/pages/activities/index.html':sha(activityBefore),'catalog/content/pages/activities/operations.js':sha(opsBefore),'main/source/booking/index.html':sha(bookingBefore)},null,2)+'\n');
console.log('Prepared two map sections, shared CSS and byte-identical original JPEG.');
