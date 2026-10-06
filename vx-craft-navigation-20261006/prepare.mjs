import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const ROOT=path.dirname(fileURLToPath(import.meta.url));
const hash=x=>createHash('sha256').update(x).digest('hex');
const baseline={},checksums={};
async function original(dest,src){const text=await fs.readFile(path.join(ROOT,'..',src),'utf8');baseline[dest]=hash(text);return text;}
async function save(file,text){const dest=path.join(ROOT,'patch',file);await fs.mkdir(path.dirname(dest),{recursive:true});await fs.writeFile(dest,text);checksums['patch/'+file]=hash(text);}
function change(text,from,to){assert(text.includes(from),'Missing source boundary: '+from.slice(0,100));return text.replace(from,()=>to);}
let catalog=await original('catalog/catalog.mjs','vx-classification-resolution-20261006/patch/catalog/catalog.mjs');
const start=catalog.indexOf('function classificationControls('),end=catalog.indexOf('export function render(',start);assert(start>=0&&end>start);
catalog=catalog.slice(0,start)+await fs.readFile(path.join(ROOT,'controls.txt'),'utf8')+'\n'+catalog.slice(end);
catalog=change(catalog,'  let html=template;',`  let html=template;
  html=html.replace('<h1 id="vx-works-heading">作品</h1>','<h1 id="vx-works-heading">作品典藏</h1>');
  html=html.replace('<p>髮色、線條與質地。</p>','<p>從工藝出發，尋見你的風格。</p>');
  html=html.replace('class="vx-work-grid"','class="vx-work-grid" id="vx-craft-results"');`);
catalog=change(catalog,"html=html.replace('<h1 id=\"vx-works-heading\">作品</h1>','<h2", "html=html.replace('<h1 id=\"vx-works-heading\">作品典藏</h1>','<h2");
await save('catalog/catalog.mjs',catalog);
let js=await original('main/source/assets/works/works.js','vx-classification-20261006/patch/main/source/assets/works/works.js');
js=change(js,"    const select = root.querySelector('#vx-craft-filter');",`    const nav = root.querySelector('.vx-craft-nav');
    const links = [...root.querySelectorAll('[data-vx-craft]')];`);
const oldSummary="      if (summary) summary.textContent = category ? category.id === 'pending' ? '005 煙晶緞帶、009 歐美線條：工藝分類待確認。' : category.code + '｜' + category.name + ' · ' + category.combination + (category.id === 'general' ? '，獨立於 TRIARCH 工藝系列。' : '') : '依實際施作工藝分類，從漂、染、燙到複合工藝。';";
js=change(js,oldSummary,`      if (summary) summary.textContent = category ? category.combination + (category.id === 'general' ? ' · GENERAL SERVICES' : '') : '髮色、線條與質地的工藝典藏。';
      const heading = root.querySelector('[data-vx-craft-title]'), code = root.querySelector('[data-vx-craft-code]'), total = root.querySelector('[data-vx-craft-count-number]');
      if (heading) heading.textContent = category?.name || '全部作品';
      if (code) code.textContent = category?.code || 'ALL WORKS';
      if (total) total.textContent = String(filtered.length).padStart(2, '0');`);
js=change(js,'      if (select) select.value = activeCategory;',"      links.forEach(link => link.setAttribute('aria-pressed', String(link.dataset.vxCraft === activeCategory)));");
js=change(js,"    select?.addEventListener('change', () => changeCategory(select.value));",`    nav?.addEventListener('click', event => {
      const link = event.target.closest('[data-vx-craft]');
      if (link) changeCategory(link.dataset.vxCraft);
    });
    nav?.addEventListener('keydown', event => {
      const index = links.indexOf(event.target.closest('[data-vx-craft]'));
      if (index < 0 || !['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? links.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + links.length) % links.length;
      links[next].focus({preventScroll:true});
    });`);
js=change(js,"changeCategory('all'); select?.focus({preventScroll:true});","changeCategory('all'); links[0]?.focus({preventScroll:true});");
await save('main/source/assets/works/works.js',js);
let css=await original('main/source/assets/works/works.css','vx-classification-20261006/patch/main/source/assets/works/works.css');
const boundary=css.indexOf('\n.vx-craft-browser{');assert(boundary>0);
css=css.slice(0,boundary)+'\n'+await fs.readFile(path.join(ROOT,'navigation.css'),'utf8');
await save('main/source/assets/works/works.css',css);
await fs.writeFile(path.join(ROOT,'baseline.json'),JSON.stringify(baseline,null,2)+'\n');
await fs.writeFile(path.join(ROOT,'checksums.json'),JSON.stringify(checksums,null,2)+'\n');
console.log('Prepared direct craft navigation without any select element; all works unchanged.');
