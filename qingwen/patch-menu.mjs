import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

export async function patchMenu(original) {
  let html=original.get('index.html').toString('utf8');
  let css=original.get('style.css').toString('utf8');
  let js=original.get('menu.js').toString('utf8');
  assert.ok(!html.includes('id="sets"'),'SETS_ALREADY_EXIST');
  const once=(text,from,to,label)=>{
    assert.equal(text.split(from).length,2,`PATCH_TARGET_${label}`);
    return text.replace(from,to);
  };
  html=once(html,'<div class="category-inner">','<div class="category-inner"><a href="#sets" id="tab-sets" data-tab="sets">全日套餐</a>','NAV');
  const section=await fs.readFile(new URL('./combo-section.html',import.meta.url),'utf8');
  html=once(html,'<main id="menu" tabindex="-1">','<main id="menu" tabindex="-1">\n'+section,'SECTION');
  html=once(html,'只有披薩可享飲品加購 <strong>-20 元</strong>','披薩套餐 <strong>$250 起</strong>','OLD_OFFER');
  html=once(html,'<p class="pizza-offer">披薩套餐 <strong>$250 起</strong></p>','<a class="menu-set-link" href="#sets">披薩搭配指定飲品 <strong>$250 起</strong>・查看套餐 ↗</a>','PIZZA_LINK');
  html=once(html,'</div></section>\n<section id="pizza"','</div><a class="menu-set-link" href="#sets">厚片套餐 <strong>$160 起</strong>・軟法／貝果套餐 <strong>$200 起</strong>・查看套餐 ↗</a></section>\n<section id="pizza"','FOOD_LINK');
  assert.equal([...html.matchAll(/<details class="downloads">[\s\S]*?<\/details>/g)].length,1,'DOWNLOADS_TARGET');
  html=html.replace(/<details class="downloads">[\s\S]*?<\/details>/,'<p class="menu-current">單品與套餐價格以本頁為準。<br>喜歡的餐點、飲品，直接告訴店員即可。</p>');
  html=once(html,'style.css?v=photos4','style.css?v=sets20260924','CSS_CACHE');
  html=once(html,'src="menu.js"','src="menu.js?v=sets20260924"','JS_CACHE');
  html=once(html,'咖啡、茶與飲品、輕食、6 吋披薩。','全日套餐 160 元起、咖啡、茶與飲品、輕食、6 吋披薩。','DESCRIPTION');
  css+='\n'+await fs.readFile(new URL('./combo-style.css',import.meta.url),'utf8');
  js=once(js,"allowed.has(id) ? id : 'coffee'","allowed.has(id) ? id : 'sets'",'DEFAULT_TAB');
  assert.ok(!/只有披薩可享|飲品加購|<details class="downloads">/.test(html),'OLD_OFFER_REMAINED');
  // Existing single-item price entries must remain byte-for-byte identical.
  const prices=x=>[...x.matchAll(/class="(?:price|flavours|pizza-price)"[\s\S]*?<\/(?:span|ul|p)>/g)].map(x=>x[0]);
  assert.deepEqual(prices(html),prices(original.get('index.html').toString('utf8')),'SINGLE_PRICES_CHANGED');
  return new Map([['index.html',Buffer.from(html)],['style.css',Buffer.from(css)],['menu.js',Buffer.from(js)]]);
}
