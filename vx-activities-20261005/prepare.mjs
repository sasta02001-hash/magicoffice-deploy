import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const ROOT=path.dirname(fileURLToPath(import.meta.url));
const BASE=path.join(ROOT,'../vx-opening-2026');
const hash=x=>createHash('sha256').update(x).digest('hex');
const read=p=>fs.readFile(p,'utf8');
const write=async(p,data)=>{await fs.mkdir(path.dirname(p),{recursive:true});await fs.writeFile(p,data);};
const campaign=JSON.parse(await read(path.join(BASE,'campaign.json')));
Object.assign(campaign,{
 summary:'風格，由你定義。線上預約 9 折、The Money 消費回饋、10 月彩虹專案，以及 15 款積分禮遇。',
 benefit:'線上預約 9 折、10 月實付消費於 11 月回饋 10% The Money、TRIARCH × PRIDE 2026，以及 10–50 分積分禮品兌換。',
 points:'以實際付款金額計算：VX 每消費 NT$6,000 獲得 1 點；ERA 每消費 NT$3,000 獲得 1 點。各品牌集滿 10 點，即為 1 張滿點卡。VX 滿點卡（紅卡）每張換算 10 分；ERA 滿點卡（綠卡）每張換算 5 分。「點」用來集滿卡片；「分」用來兌換禮品。使用 LINE 官方集點功能，兌換後回收相應滿點卡。同分數品項分別兌換，並非整組贈送。',
 rewards:JSON.parse(await read(path.join(ROOT,'rewards.json')))
});
let ops=await read(path.join(BASE,'patch/catalog/content/pages/activities/operations.js'));
ops=ops.replace(/  function openingCard\(c, now\) \{[\s\S]*?(?=  function card\()/,await read(path.join(ROOT,'opening-card.js'))+'\n');
assert(ops.includes('data-reward-points'));
ops=ops.replace("    if (!list) return;",`    if (!list) return;
    if (!list.dataset.rewardBound) {
      list.dataset.rewardBound = 'true';
      list.addEventListener('click', event => {
        const button = event.target.closest('[data-reward-filter]');
        if (!button) return;
        const value = button.dataset.rewardFilter;
        let count = 0;
        list.querySelectorAll('[data-reward-points]').forEach(item => {
          item.hidden = value !== 'all' && item.dataset.rewardPoints !== value;
          if (!item.hidden) count++;
        });
        list.querySelectorAll('[data-reward-filter]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
        const message = list.querySelector('.vx-reward-count');
        if (message) message.textContent = (value === 'all' ? '共 ' : value + ' 分 · ') + count + ' 款禮遇';
      });
    }`);
const context={window:{}};vm.runInNewContext(ops,context);
const VX=context.window.VXOperations;
assert(VX.validate(campaign));
const now=Date.parse('2026-10-05T12:00:00+08:00');
const dataScript=html=>html.replace(/(<script id="vx-operations-data" type="application\/json">)([\s\S]*?)(<\/script>)/,(_,start,raw,end)=>{
 const data=JSON.parse(raw);data.reviewedAt='2026-10-05';data.campaigns=[campaign];
 return start+JSON.stringify(data).replaceAll('<','\\u003c')+end;
});
const activityPath='catalog/content/pages/activities/index.html';
const mainPath='main/source/index.html';
const beforeActivities=await read(path.join(BASE,'patch',activityPath));
const beforeHome=await read(path.join(BASE,'patch',mainPath));
let activities=dataScript(beforeActivities);
activities=activities.replace(/(<div data-campaign-list aria-live="polite">)[\s\S]*?(<\/div><div class="vx-price-notes">)/,(_,a,b)=>a+VX.card(campaign,now)+b);
activities=activities.replaceAll('紅綠集卡收藏開幕限定','10 月彩虹專案與 15 款積分禮遇');
activities=activities.replace('在這裡查閱活動內容、期間與適用條件。參加活動及後續詢問，由 LINE 官方接續。','預約禮遇、消費回饋與積分收藏。活動期間、適用條件與兌換方式，一次看清楚。');
let home=dataScript(beforeHome).replace(/(<div data-campaign-home>)[\s\S]*?(<\/div><\/div>)/,(_,a,b)=>a+VX.homeMarkup([campaign],now)+b);
for(const text of [activities,home,ops])assert(!/月底前|1 張綠色滿卡至 4 張紅色滿卡/.test(text));
await write(path.join(ROOT,'patch',activityPath),activities);
await write(path.join(ROOT,'patch',mainPath),home);
await write(path.join(ROOT,'patch/catalog/content/pages/activities/operations.js'),ops);
const css=await read(path.join(BASE,'patch/catalog/content/pages/activities/opening-2026.css'))+'\n'+await read(path.join(ROOT,'activities.css'));
await write(path.join(ROOT,'patch/catalog/content/pages/activities/opening-2026.css'),css);
await write(path.join(ROOT,'campaign.json'),JSON.stringify(campaign,null,2)+'\n');
await write(path.join(ROOT,'baseline.json'),JSON.stringify({[activityPath]:hash(Buffer.from(beforeActivities)),[mainPath]:hash(Buffer.from(beforeHome))},null,2)+'\n');
if(process.argv[2]){
 const sharp=createRequire(import.meta.url)(path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'sharp'));
 const folder=path.join(process.argv[2],'02_單品圖');
 const names=(await fs.readdir(folder)).filter(s=>s.endsWith('.png')).sort();
 assert.equal(names.length,15);
 for(let i=0;i<names.length;i++){
  const r=campaign.rewards[i];assert(names[i].includes(`${r.points}分`));
  const bytes=await sharp(path.join(folder,names[i])).webp({quality:85,effort:6}).toBuffer();
  await write(path.join(ROOT,'patch/catalog/content/pages/activities/rewards-2026',r.id+'.webp'),bytes);
  console.log(r.id,bytes.length);
 }
}
const checksums={};
async function walk(dir){for(const name of await fs.readdir(dir)){const p=path.join(dir,name);if((await fs.stat(p)).isDirectory())await walk(p);else checksums[path.relative(ROOT,p)]=hash(await fs.readFile(p));}}
await walk(path.join(ROOT,'patch'));
await write(path.join(ROOT,'checksums.json'),JSON.stringify(checksums,null,2)+'\n');
console.log('Prepared activity page, homepage entry, 15 rewards and integrity manifests.');
