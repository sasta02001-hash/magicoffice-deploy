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

  function openingPicture(c, home = false) {
    return `<picture class="vx-opening-picture${home?' vx-opening-home':''}"><source media="(max-width: 720px)" srcset="${escape(c.posterMobile)}" width="1080" height="1350"><img src="${escape(c.poster)}" width="1920" height="1080" alt="${escape(c.posterAlt)}" decoding="async" loading="${home?'lazy':'eager'}" ${home?'':'fetchpriority="high"'}></picture>`;
  }
  function openingCard(c, now = Date.now()) {
    const state = status(c, now);
    const octoberEnded = now >= Date.parse('2026-11-01T00:00:00+08:00');
    const detail = (title, body) => `<details class="vx-opening-detail"><summary>${escape(title)}</summary><div class="vx-opening-detail-copy">${escape(body)}</div></details>`;
    const maps = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(c.locations.replace('1樓',''));
    const rewards = (c.rewards || []).map(r => `<article class="vx-reward" data-reward-points="${r.points}"><a class="vx-reward-art" href="/activities/rewards-2026/${escape(r.id)}.webp" target="_blank" rel="noopener" aria-label="開啟${escape(r.name)}完整活動圖"><img src="/activities/rewards-2026/${escape(r.id)}.webp" width="1122" height="1402" loading="lazy" decoding="async" alt="${escape(r.name)}，${r.points} 分兌換；${escape(r.note)}"></a><div class="vx-reward-copy"><p class="vx-reward-score"><strong>${r.points}</strong> 分 <span>POINTS</span></p><h4>${escape(r.name)}</h4><p>${escape(r.subtitle)}</p><small>${escape(r.note)}</small></div></article>`).join('');
    return `<article class="vx-campaign vx-opening" id="${escape(c.id)}" data-campaign-status="${state}">
      <div class="vx-opening-heading"><div><span class="vx-status">${names[state]}</span><h2>${escape(c.title)}</h2><p class="vx-meta">${escape(period(c))}</p></div><p class="vx-opening-tagline">風格，由你定義。</p></div>
      ${openingPicture(c)}
      <div class="vx-opening-intro"><p>從喜歡的樣子出發，讓髮型成為表達自己的一部分。<br>一次看懂預約禮遇、消費回饋、10 月專案與積分收藏。</p>${state === 'ended' ? '<p>開幕活動已結束；已取得的 The Money 仍無使用期限。</p>' : '<a class="btn btn--gold" href="https://lin.ee/Roebk7r" target="_blank" rel="noopener">LINE 預約開幕禮遇 ↗</a>'}</div>
      <nav class="vx-activity-index" aria-label="活動快速導覽"><a href="#online-booking"><span>01</span> 線上預約</a><a href="#the-money"><span>02</span> The Money</a><a href="#pride-2026"><span>03</span> 10 月彩虹專案</a><a href="#rewards-2026"><span>04</span> 積分禮遇</a></nav>
      <div class="vx-offer-grid">
        <section class="vx-offer" id="online-booking"><p class="vx-activity-kicker">01 / ONLINE BOOKING · 10–12 月</p><h3>預約你的風格</h3><p class="vx-offer-number">9<span> 折</span></p><p>透過官方線上平台預約，享開幕慶 9 折。<br>可與現行品牌優惠同享。</p></section>
        <section class="vx-offer" id="the-money"><p class="vx-activity-kicker">02 / THE MONEY · 10 月消費，11 月回饋${octoberEnded ? '（回饋累積已結束）' : ''}</p><h3>把美好留給下一次</h3><p class="vx-offer-number">10<span>% 消費代金</span></p><p>10 月在 VX ART 的實際付款總額，<br>於 11 月回饋 10% The Money。</p>${detail('回饋範圍與使用方式', c.money + '\nThe Money 為消費代金，非現金退款；與預約 9 折分開計算。')}</section>
      </div>
      <section class="vx-activity-section" id="pride-2026" data-october-status="${octoberEnded ? 'ended' : 'current'}"><div class="vx-section-heading"><div><p class="vx-activity-kicker">03 / TRIARCH × PRIDE 2026</p><h3>讓風格，成為你的宣言。</h3></div><p class="vx-meta">2026.10.01 — 10.31${octoberEnded ? ' · 已結束' : ' · 10 月限定'}</p></div><p>彩虹專案價${octoberEnded ? '（活動已結束）' : '，透過官方線上預約可再享開幕慶 9 折'}。</p><div class="vx-pride-prices">${c.prices.map((p,i) => `<section><span>${['COLOR','PERM','BLEACH'][i]}</span><h4>${escape(p.title.split('｜')[1])}</h4><strong>${escape(p.price)}</strong><p>${['色彩設計','紋理塑形','明度建構・色彩上色'][i]}<br>精準剪裁・結構修護<br>專屬洗護・質感造型</p></section>`).join('')}</div><div class="vx-pride-extras"><p><span>PRIDE STYLING</span><strong>遊行前造型整理</strong>完成作品後，遊行前皆可預約造型整理。</p><p><span>DUO SESSION</span><strong>雙人作品席次</strong>伴侶或朋友皆可一起預約。</p></div><p class="vx-activity-note">${escape(c.prideConditions).replaceAll('\n','<br>')}</p></section>
      <section class="vx-activity-section vx-rewards" id="rewards-2026"><div class="vx-section-heading"><div><p class="vx-activity-kicker">04 / VX × ERA · REWARDS COLLECTION</p><h3>把每一次喜歡，累積成禮遇。</h3></div><p class="vx-meta">15 款禮遇 · 10–50 分</p></div><p>消費集「點」，滿卡換算「分」。依喜歡的禮品與所需分數，選擇你的下一份收藏。</p>
      <div class="vx-points-guide"><div class="vx-points-table-wrap"><table class="vx-points-table"><caption>集點與滿卡換算</caption><thead><tr><th scope="col">品牌</th><th scope="col">消費集點</th><th scope="col">滿卡門檻</th><th scope="col">每張滿卡分數</th></tr></thead><tbody><tr><th scope="row">VX</th><td>每 NT$6,000＝1 點</td><td>10 點＝1 張滿點卡</td><td><strong>10 分</strong><small>VX 滿點卡＝紅卡</small></td></tr><tr><th scope="row">ERA</th><td>每 NT$3,000＝1 點</td><td>10 點＝1 張滿點卡</td><td><strong>5 分</strong><small>ERA 滿點卡＝綠卡</small></td></tr></tbody></table></div><p>「點」用來集滿卡片；「分」用來兌換禮品。<br>例：1 張 VX 滿點卡（10 分）＋1 張 ERA 滿點卡（5 分）＝15 分。</p><p class="vx-activity-note">以實際付款金額計算，使用 LINE 官方集點功能；兌換後回收相應滿點卡。</p></div>
      <p class="vx-rewards-intro"><strong>以下每一品項分別兌換，同分數品項並非整組贈送。</strong><br>圖片為商品或情境示意；款式、票券內容及詳細兌換安排，請洽門市確認。</p>
      <div class="vx-reward-filters" role="group" aria-label="依禮品分數篩選"><button type="button" data-reward-filter="all" aria-pressed="true">全部禮遇</button>${[10,15,25,35,40,50].map(p => `<button type="button" data-reward-filter="${p}" aria-pressed="false">${p} 分</button>`).join('')}</div><p class="vx-reward-count" role="status" aria-live="polite">共 15 款禮遇</p><div class="vx-reward-grid">${rewards}</div>
      <div class="vx-reward-footer"><p>選好喜歡的禮遇了嗎？<br><span>透過 LINE 告訴我們品項名稱，確認滿卡分數與兌換安排。</span></p><a class="btn btn--gold" href="https://lin.ee/Roebk7r" target="_blank" rel="noopener">LINE 詢問積分兌換 ↗</a></div></section>
      <section class="vx-opening-location"><div><span class="eyebrow">VISIT · 怎麼來 VX ART</span><h3>從這裡，開始新的風格。</h3><p>${escape(c.locations)}</p><p class="vx-meta">南京敦化路口・微風南京／IKEA 周邊</p></div><div class="button-row"><a class="btn" href="${maps}" target="_blank" rel="noopener">開啟地圖 ↗</a><a class="btn btn--gold" href="https://lin.ee/Roebk7r" target="_blank" rel="noopener">LINE 諮詢與預約 ↗</a></div></section>
    </article>`;
  }


  function card(c, now) {
    if(c.id==='starfield-opening-2026') return openingCard(c,now);
    const state = status(c, now);
    const fields = [['活動內容',c.summary],['優惠與權益',c.benefit],['活動期間',period(c)],['適用對象',c.audience],['適用服務',c.services],['施作地點',c.locations],['使用限制',c.conditions],['參加方式',c.participation]];
    const poster = typeof c.poster === 'string' && /^\/activities\/[a-z0-9-]+\.jpe?g$/.test(c.poster) ? `<a class="vx-campaign-poster" href="${escape(c.poster)}" target="_blank" rel="noopener" aria-label="開啟完整活動海報"><img src="${escape(c.poster)}" width="1122" height="1402" alt="${escape(c.posterAlt || c.title)}" decoding="async" fetchpriority="high"></a>` : '';
    const prices = Array.isArray(c.prices) ? `<ul class="vx-campaign-prices">${c.prices.map(p=>`<li><span>${escape(p.title)}</span><strong>${escape(p.price)}</strong></li>`).join('')}</ul>` : '';
    return `<article class="vx-campaign" id="${escape(c.id)}" data-campaign-status="${state}"><span class="vx-status">${names[state]}</span><h2>${escape(c.title)}</h2><p class="vx-meta">${escape(period(c))}</p><p>${escape(c.summary)}</p>${prices}${poster}<details><summary>查看完整活動內容</summary><dl>${fields.map(([k,v])=>`<div><dt>${k}</dt><dd>${escape(v)}</dd></div>`).join('')}</dl><p class="vx-meta">向 LINE 提供活動名稱「${escape(c.title)}」，即可接續詢問。</p>${state==='ended'?'<p class="vx-meta">此活動已結束。</p>':line}</details></article>`;
  }
  function homeMarkup(campaigns, now = Date.now()) {
    const next = campaigns.filter(c=>['current','upcoming'].includes(status(c,now))).sort((a,b)=> (status(a,now)==='current'?0:1)-(status(b,now)==='current'?0:1)||Date.parse(a.startsAt)-Date.parse(b.startsAt))[0];
    return next ? `${next.id==='starfield-opening-2026'?openingPicture(next,true):''}<span class="vx-status">${names[status(next,now)]}</span><h3>${escape(next.title)}</h3><p>${escape(next.summary)}</p><p class="vx-meta">${escape(period(next))}</p><a class="vx-text-link" href="/activities/#${escape(next.id)}">查看活動詳情 →</a>` : '<h3>目前尚無公開活動</h3><p>新活動將在這裡公布。服務諮詢、集點與客服，可由 LINE 官方協助。</p><a class="vx-text-link" href="/activities/">前往最新活動 →</a>';
  }
  function mount(app) {
    let data;
    try { data = JSON.parse(document.getElementById('vx-operations-data')?.textContent || '{}'); }
    catch { data = {}; }
    const campaigns = (Array.isArray(data.campaigns) ? data.campaigns : []).filter(c=>status(c)!=='draft');
    app.querySelectorAll('[data-campaign-home]').forEach(el=>{el.innerHTML=homeMarkup(campaigns);});
    const list = app.querySelector('[data-campaign-list]');
    if (!list) return;
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
    }
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

