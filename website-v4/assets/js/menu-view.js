/* v4.3.3 — one shared renderer for server build and live CMS updates. */
(() => {
  'use strict';
  const esc=(v='')=>String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
  const ordered=(xs=[])=>xs.filter(x=>x.status!=='隱藏').slice().sort((a,b)=>(Number(a.sort)||999)-(Number(b.sort)||999));
  const meta={
    CAFE:{title:'午後咖啡',roman:'AFTERNOON COFFEE',caption:'浮世繪浪花',left:'午後微醺・風雅一席',right:'魔幻姶仕社',facts:['CAFÉ 14:00–20:00','低消 NT$350／90 分鐘','另加 10% 服務費']},
    BAR:{title:'魔幻夜晚',roman:'MAGIC OFF ICE',caption:'浮世繪夜雪',left:'魔幻夜晚',right:'夜色微醺・心靈解放',facts:['BAR 20:00–02:00','低消 NT$500／90 分鐘','另加 10% 服務費']}
  };
  function periods(data){
    const worlds=data?.worlds||[];
    const collection=worlds.find(w=>w.code==='COLLECTION');
    return ['CAFE','BAR'].map(code=>{
      const w=worlds.find(x=>x.code===code); if(!w)return null;
      const groups=ordered(collection?.groups).filter(g=>(g.periodCode || ({'COLLECTION-01':'CAFE','COLLECTION-02':'BAR'}[g.id]))===code);
      return {...w,key:code.toLowerCase(),collection:collection?{...collection,groups}:null};
    }).filter(Boolean);
  }
  function group(g){
    const items=ordered(g.items);
    if(!items.length)return '';
    return `<article class="mo-menu-group" data-menu-group-id="${esc(g.id)}"><h3>${esc(g.title)}</h3><ul>${items.map(i=>`<li data-menu-item-id="${esc(i.id)}"><span>${esc(i.name)}${i.description?`<small>${esc(i.description)}</small>`:''}</span><strong>${esc(i.price)}</strong></li>`).join('')}</ul>${g.note?`<p class="mo-menu-note">${esc(g.note)}</p>`:''}</article>`;
  }
  function header(w){
    const m=meta[w.code];
    return `<header class="mo-menu-world-header"><span class="mo-menu-world-vertical mo-menu-world-vertical--left" aria-hidden="true">${esc(m.left)}</span><div class="mo-menu-world-title"><span class="mo-menu-world-emblem" aria-hidden="true">✿</span><p>${esc(m.caption)}</p><h3>${esc(m.title)}</h3><small>${esc(m.roman)}</small></div><figure class="mo-menu-world-photo"><img src="${esc(w.image)}" alt="${esc(w.title)}" loading="lazy" decoding="async"/></figure><div class="mo-menu-world-copy"><p class="mo-eyebrow">${esc(w.eyebrow)}</p><h4>${esc(w.title)}</h4><p>${esc(w.intro)}</p><div class="mo-menu-world-facts">${m.facts.map(f=>`<span>${esc(f)}</span>`).join('')}</div></div><span class="mo-menu-world-vertical mo-menu-world-vertical--right" aria-hidden="true">${esc(m.right)}</span></header>`;
  }
  function collection(w){
    const c=w.collection;
    if(!c || !c.groups.length)return '';
    return `<section class="mo-period-collection" data-collection-period="${esc(w.code)}" aria-labelledby="collection-${esc(w.key)}-title"><header><p class="mo-eyebrow">UKIYO-E COLLECTION</p><h3 id="collection-${esc(w.key)}-title">櫻花收藏<span>浮世繪／周邊・${w.code==='CAFE'?'午後篇':'夜晚篇'}</span></h3><p>${esc(c.intro||'')}</p></header><div class="mo-collection-content"><figure><img src="${esc(c.image)}" alt="櫻花收藏浮世繪場景" loading="lazy" decoding="async"/></figure><div>${c.groups.map(group).join('')}</div></div>${c.note?`<p class="mo-menu-note">${esc(c.note)}</p>`:''}</section>`;
  }
  function renderTabs(data){
    return periods(data).map((w,i)=>`<button id="menu-tab-${esc(w.key)}" type="button" role="tab" data-menu-tab="${esc(w.code)}" aria-controls="menu-${esc(w.key)}" aria-selected="${i===0}" tabindex="${i===0?0:-1}" class="${i===0?'is-active':''}">${esc(meta[w.code].title)}</button>`).join('');
  }
  function renderPanes(data){
    return periods(data).map((w,i)=>`<section class="mo-menu-pane${i===0?' is-active':''}" id="menu-${esc(w.key)}" data-menu-world="${esc(w.code)}" role="tabpanel" aria-labelledby="menu-tab-${esc(w.key)}" ${i===0?'':'hidden'} aria-hidden="${i!==0}">${header(w)}<div class="mo-menu-grid mo-menu-grid--reading" data-menu-groups>${ordered(w.groups).map(group).join('')}</div>${w.note?`<p class="mo-menu-note">${esc(w.note)}</p>`:''}${collection(w)}</section>`).join('');
  }
  globalThis.MOMenuView=Object.freeze({periods,renderTabs,renderPanes});
})();
