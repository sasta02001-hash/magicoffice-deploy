import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const ROOT=path.dirname(fileURLToPath(import.meta.url));
const source=path.resolve(process.argv[2]);
const hash=b=>createHash('sha256').update(b).digest('hex');
const spec=JSON.parse(await fs.readFile(path.join(ROOT,'classification.json'),'utf8'));
const categories=spec.categories;
const byId=new Map(spec.works.map(w=>[w.id,w]));
const baseline={},checksums={};
async function read(file){const bytes=await fs.readFile(path.join(source,file));baseline[file]=hash(bytes);return bytes.toString('utf8');}
async function write(file,text){const dest=path.join(ROOT,'patch',file);await fs.mkdir(path.dirname(dest),{recursive:true});await fs.writeFile(dest,text);checksums['patch/'+file]=hash(text);}
function replace(text,from,to){assert(text.includes(from),'Expected source boundary missing: '+from.slice(0,100));return text.replace(from,()=>to);}
const works=JSON.parse(await read('catalog/content/works.json'));
assert.equal(works.length,32);assert.equal(byId.size,32);
for(const work of works){
  const row=byId.get(work.id);assert(row);const category=categories.find(c=>c.id===row.category);assert(category);
  work.title=row.title;work.cardTitle=row.title;work.cardInfo=row.category==='pending'?'工藝分類待確認':row.technique;work.category=row.category;
  work.details=work.details.filter(([key])=>key!=='類別');
  if(work.id==='004')work.details=work.details.map(([key,value])=>[key,value.replaceAll('絲緞電棒燙','絲絨電棒燙')]);
  work.details.unshift(['工藝分類',category.id==='pending'?'待確認':category.code+'｜'+category.name]);
  if(category.id!=='pending')work.details.splice(1,0,['工藝組合',row.technique]);
  if(work.id==='029')work.alt='煙藕粉紫的髮型封套';
}
await write('catalog/content/works.json',JSON.stringify(works,null,2)+'\n');
let catalog=await read('catalog/catalog.mjs');
catalog=replace(catalog,"export const ORIGIN",'export const CRAFT_CATEGORIES = Object.freeze('+JSON.stringify(categories)+'.map(Object.freeze));\nexport const ORIGIN');
catalog=replace(catalog,"const keys = ['id'","if (typeof w.category !== 'string' || !CRAFT_CATEGORIES.some(c => c.id === w.category)) throw Error('Invalid craft category');\n    const keys = ['category','id'");
catalog=replace(catalog,'window.VX_WORKS = Object.freeze(', 'window.VX_CRAFT_CATEGORIES = Object.freeze("+json(CRAFT_CATEGORIES)+".map(Object.freeze));\\nwindow.VX_WORKS = Object.freeze(');
catalog=replace(catalog,"  const info = w.cardInfo", "  const category = CRAFT_CATEGORIES.find(c => c.id === w.category);\n  const tag = category ? '<span class=\"vx-craft-tag\">'+escape(category.code)+'</span>' : '';\n  const info = w.cardInfo");
catalog=replace(catalog,"</div></div><h2>'+title", "</div></div>'+tag+'<h2>'+title");
catalog=replace(catalog,'export function render(',await fs.readFile(path.join(ROOT,'controls.txt'),'utf8')+'\nexport function render(');
catalog=replace(catalog,'  let html=template;',`  let html=template;
  html=html.replace('<div class="vx-work-grid"',classificationControls(works)+'<div class="vx-work-grid"');`);
await write('catalog/catalog.mjs',catalog);
let js=await read('main/source/assets/works/works.js');
js=replace(js,'  const byId =',"  const categories = window.VX_CRAFT_CATEGORIES || [];\n  const byId =");
js=replace(js,'    const info = work.cardInfo',`    const category = categories.find(c => c.id === work.category);
    const tag = category ? '<span class="vx-craft-tag">' + escape(category.code) + '</span>' : '';
    const info = work.cardInfo`);
js=replace(js,"'<h2>' + title", "tag + '<h2>' + title");
const start=js.indexOf('  function mount(root) {'),end=js.indexOf('  window.VXWorks = {mount};');assert(start>=0&&end>start);
js=js.slice(0,start)+await fs.readFile(path.join(ROOT,'mount.txt'),'utf8')+'\n'+js.slice(end);
await write('main/source/assets/works/works.js',js);
const css=await read('main/source/assets/works/works.css');
await write('main/source/assets/works/works.css',css+'\n'+await fs.readFile(path.join(ROOT,'classification.css'),'utf8'));
let home=await read('main/source/index.html');
for(const [from,to] of [['漸層藍・巴黎畫染','漸層藍 × 巴黎畫染'],['漂髮・奶霜粉','奶霜粉'],['亞麻灰＋縮毛矯正','亞麻灰 × 縮毛矯正']])home=replace(home,from,to);
await write('main/source/index.html',home);
await fs.writeFile(path.join(ROOT,'baseline.json'),JSON.stringify(baseline,null,2)+'\n');
await fs.writeFile(path.join(ROOT,'checksums.json'),JSON.stringify(checksums,null,2)+'\n');
console.log('Prepared 32 approved classifications and 5 narrowly scoped source overlays.');
