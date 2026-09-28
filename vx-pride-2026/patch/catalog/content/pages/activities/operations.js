(function (root) {
  'use strict';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const datePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+08:00$/;
  function validate(c) {
    const required = ['id','title','summary','benefit','startsAt','endsAt','audience','services','locations','conditions','participation'];
    return c && required.every(k => typeof c[k] === 'string' && c[k].trim()) &&
      /^[a-z0-9-]+$/.test(c.id) && datePattern.test(c.startsAt) && datePattern.test(c.endsAt) &&
      Number.isFinite(Date.parse(c.startsAt)) && Date.parse(c.endsAt) > Date.parse(c.startsAt);
  }
  function status(c, now = Date.now()) {
    if (!validate(c) || c.published !== true) return 'draft';
    if (now < Date.parse(c.startsAt)) return 'upcoming';
    return now < Date.parse(c.endsAt) ? 'current' : 'ended';
  }
  const names = {current:'進行中',upcoming:'即將開始',ended:'已結束'};
  const date = value => value.slice(0,16).replace('T',' ').replaceAll('-','.');
  const period = c => c.displayPeriod || `${date(c.startsAt)} — ${date(c.endsAt)}（台灣時間）`;
  const line = '<a class="btn btn--gold" href="https://lin.ee/Roebk7r" target="_blank" rel="noopener">LINE 詢問活動</a>';
  function card(c, now) {
    const state = status(c, now);
    const fields = [['活動內容',c.summary],['優惠與權益',c.benefit],['活動期間',period(c)],['適用對象',c.audience],['適用服務',c.services],['施作地點',c.locations],['使用限制',c.conditions],['參加方式',c.participation]];
    const poster = typeof c.poster === 'string' && /^\/activities\/[a-z0-9-]+\.jpe?g$/.test(c.poster) ? `<a class="vx-campaign-poster" href="${escape(c.poster)}" target="_blank" rel="noopener" aria-label="開啟完整活動海報"><img src="${escape(c.poster)}" width="1122" height="1402" alt="${escape(c.posterAlt || c.title)}" decoding="async" fetchpriority="high"></a>` : '';
    const prices = Array.isArray(c.prices) ? `<ul class="vx-campaign-prices">${c.prices.map(p=>`<li><span>${escape(p.title)}</span><strong>${escape(p.price)}</strong></li>`).join('')}</ul>` : '';
    return `<article class="vx-campaign" id="${escape(c.id)}" data-campaign-status="${state}"><span class="vx-status">${names[state]}</span><h2>${escape(c.title)}</h2><p class="vx-meta">${escape(period(c))}</p><p>${escape(c.summary)}</p>${prices}${poster}<details><summary>查看完整活動內容</summary><dl>${fields.map(([k,v])=>`<div><dt>${k}</dt><dd>${escape(v)}</dd></div>`).join('')}</dl><p class="vx-meta">向 LINE 提供活動名稱「${escape(c.title)}」，即可接續詢問。</p>${state==='ended'?'<p class="vx-meta">此活動已結束。</p>':line}</details></article>`;
  }
  function homeMarkup(campaigns, now = Date.now()) {
    const next = campaigns.filter(c=>['current','upcoming'].includes(status(c,now))).sort((a,b)=> (status(a,now)==='current'?0:1)-(status(b,now)==='current'?0:1)||Date.parse(a.startsAt)-Date.parse(b.startsAt))[0];
    return next ? `<span class="vx-status">${names[status(next,now)]}</span><h3>${escape(next.title)}</h3><p>${escape(next.summary)}</p><p class="vx-meta">${escape(period(next))}</p><a class="vx-text-link" href="/activities/#${escape(next.id)}">查看活動詳情 →</a>` : '<h3>目前尚無公開活動</h3><p>新活動將在這裡公布。服務諮詢、集點與客服，可由 LINE 官方協助。</p><a class="vx-text-link" href="/activities/">前往最新活動 →</a>';
  }
  function mount(app) {
    let data;
    try { data = JSON.parse(document.getElementById('vx-operations-data')?.textContent || '{}'); }
    catch { data = {}; }
    const campaigns = (Array.isArray(data.campaigns) ? data.campaigns : []).filter(c=>status(c)!=='draft');
    app.querySelectorAll('[data-campaign-home]').forEach(el=>{el.innerHTML=homeMarkup(campaigns);});
    const list = app.querySelector('[data-campaign-list]');
    if (!list) return;
    const toolbar = app.querySelector('[data-campaign-filters]');
    const draw = filter => {
      const now=Date.now();
      const shown=campaigns.filter(c=>status(c,now)===filter).sort((a,b)=>Date.parse(b.startsAt)-Date.parse(a.startsAt));
      list.innerHTML=shown.length ? shown.map(c=>card(c,now)).join('') : `<div class="vx-empty"><h2>${{current:'目前尚無公開活動',upcoming:'目前沒有活動預告',ended:'目前沒有已結束的活動紀錄'}[filter]}</h2><p>活動公布後，這裡會列出期間、適用條件與參加方式。</p>${line}</div>`;
      toolbar.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.campaignFilter===filter)));
    };
    toolbar.addEventListener('click',e=>{const b=e.target.closest('[data-campaign-filter]');if(b)draw(b.dataset.campaignFilter);});
    const id=location.hash.includes('/') ? location.hash.split('/')[1] : location.hash.slice(1);
    const selected=campaigns.find(c=>c.id===id);
    const defaultFilter = ['current','upcoming','ended'].find(s=>campaigns.some(c=>status(c)===s)) || 'current';
    draw(selected ? status(selected) : defaultFilter);
    if(selected) {
      const article = document.getElementById(selected.id);
      const detail = article && list.contains(article) ? article.querySelector('details') : null;
      if (detail) detail.open = true;
    }
  }
  root.VXOperations = {validate,status,homeMarkup,card,mount};
  if (typeof module !== 'undefined') module.exports=root.VXOperations;
})(typeof window !== 'undefined' ? window : {});

