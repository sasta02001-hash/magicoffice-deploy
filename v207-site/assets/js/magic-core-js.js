(() => {
  "use strict";
  const profiles = {"mibao":{"name":"咪寶","role":"管理職","image":"/assets/media/46a75e190baad8e8.webp","birthday":"","interest":"音樂、設計、商業","hours":"小機率隨機","likes":"撒嬌","dislikes":"吃青菜","message":"給我你的錢錢～"},"medamayaki":{"name":"荷包蛋 Medamayaki メダマヤキ yaki","role":"姶仕","image":"/assets/media/3241306c93000ad3.webp","birthday":"6.19","interest":"畫畫","hours":"白天","likes":"吃甜甜的食物！！貓貓！搞抽象💦","dislikes":"吃苦苦 酸酸的食物～～","message":"主人～大小姐～快來找我玩嘛～～♡"},"rumei":{"name":"るめい／Rumei／嚕咩","role":"姶仕","image":"/assets/media/2d5ed350d26c050b.webp","birthday":"10.8","interest":"發呆、偷偷觀察大家、跑地下場、畫畫…很拿手…！！","hours":"白晝的時候會出現","likes":"可愛／漂亮的人們、彼安諾、大嘴吉、我的推們","dislikes":"吃香菜、被忽略、沒有禮貌的人","message":"🎀你的世界太平靜了 所以我出現了啾啾💭💖"},"yuzu":{"name":"柚子","role":"管理職","image":"/assets/media/e22350b8ec2d748a.webp","birthday":"9/23","interest":"在電腦前面玩遊戲","hours":"隨機","likes":"打電動","dislikes":"不打電動","message":"聽說你看到我化妝？那你很辛運欸"},"naya":{"name":"奈亞","role":"姶仕","image":"/assets/media/4fd4c223e064c15d.webp","birthday":"","interest":"","hours":"","likes":"","dislikes":"","message":""},"jubi":{"name":"Jubi","role":"管理職","image":"/assets/media/9cf5f3c7c8e43450.webp","birthday":"8/26","interest":"玩遊戲、手作、看小說","hours":"請查看本週出勤","likes":"睡覺、出門玩","dislikes":"曬太陽","message":"可以帶零食給我吃嗎🤤"},"cc":{"name":"CC／cici","role":"管理職","image":"/assets/media/815c2fdfd2a254ce.webp","birthday":"0209","interest":"睡覺","hours":"都會","likes":"抱著我的小狗睡覺","dislikes":"聒噪的人","message":"不來喝酒就拿繩子把你綁來"},"lele":{"name":"樂樂","role":"管理職","image":"/assets/media/1d6e303714642bf6.webp","birthday":"12/12","interest":"唱歌、喝酒、當公主","hours":"晚上（早上真的起不來）","likes":"唱歌、來找我喝酒、身體健康的人","dislikes":"有人對我碎碎念、屁話一堆（但漂亮的人類可以","message":"喝酒嗎？還是把腎捐給我？"},"cara":{"name":"卡拉","role":"管理職","image":"/assets/media/6abf49f3aab3c507.webp","birthday":"08/25","interest":"喜歡把大家用美美(⁎⁍̴̛ᴗ⁍̴̛⁎)","hours":"整天都在 ٩(˃̶͈̀௰˂̶͈́)و","likes":"用頭滑、研究人類","dislikes":"不聽話把頭髮搞到壞掉的人(╯°□°）╯︵ ┻━┻","message":"歡迎來到魔幻☆希望大家來這裡可以被魔法療癒 o(≧v≦)o"},"sakuma":{"name":"咲茉","role":"姶仕","image":"/assets/media/f2097a926bdf48b3.webp","birthday":"12/4","interest":"聽團、彈貝斯、吉他、五月天、塔羅、喝酒、拍照、貓、海洋地科、自然地理","hours":"咲茉白天限定出沒中💜","likes":"看五月天、練琴、解牌、貓、看論文","dislikes":"煮飯、運動、吃油很多的肉、看天文物理還是數學相關的論文。","message":"如果有什麼疑難雜症或任何問題都可以來找咲茉捏，算塔羅聊音樂還是什麼都可以！（也可以來店裡拿地奧題目一起寫啦）"},"nana":{"name":"なな","role":"姶仕","image":"/assets/media/e404ebb20f7273f8.webp","birthday":"06/06","interest":"調酒、甜點、占卜","hours":"白天晚上都有可能出現但我更愛月亮升起後出沒","likes":"酒精、甜食、毛茸茸","dislikes":"苦瓜、青椒、茄子、番茄、榴槤、蠢蛋行為( ･´ｰ･｀)どや、不尊重酒精","message":"塔羅牌告訴我，今天會遇見重要的人。如果你剛好坐到我面前——那大概就是命運的安排吧✨"},"mona":{"name":"桃奈","role":"姶仕","image":"/assets/media/59f9acb8861a6595.webp","birthday":"","interest":"","hours":"","likes":"","dislikes":"","message":""},"kokoro":{"name":"心葉☘️","role":"姶仕","image":"/assets/media/4bf65583e3739d3f.webp","birthday":"5/20","interest":"畫畫、吃蛋糕、睡覺","hours":"白天","likes":"爆豪勝己♡小羊 piano 各種可愛東西🎀","dislikes":"指點別人外貌( °-°)不禮貌壞壞","message":"大家尼好～不像 e 人的心葉☘️希望來的主人大小姐都能開心的回家～！"},"mika":{"name":"米菓","role":"姶仕","image":"/assets/media/d9800fa21c1b6e2e.webp","birthday":"11/30","interest":"當個媽寶","hours":"晚上","likes":"開香檳🍾","dislikes":"機機巴巴","message":"有事找我媽"},"sakuri":{"name":"櫻璃／さくり","role":"姶仕","image":"/assets/media/8f1e2635714effb9.webp","birthday":"2008.01.30","interest":"繪畫、打扮","hours":"白天","likes":"看動漫漫畫、吃巧克力","dislikes":"打掃","message":"希望每次見面都能成為您今天最開心的時刻(๑˃ᴗ˂)و♡"},"hekiru":{"name":"碧瑠／へきる","role":"姶仕","image":"/assets/media/617f58b1207050e6.webp","birthday":"08/07","interest":"睡覺、偶像夢幻祭、食物語跟光遇、看動畫","hours":"都會","likes":"乙狩阿多尼斯","dislikes":"違反規則ㄉ人😣","message":"可以來找我玩嗎？✋🫩🤚我會畫簡易版孔雀"}};
  const $ = (s, root=document) => root.querySelector(s);
  const $$ = (s, root=document) => Array.from(root.querySelectorAll(s));

  const menuToggle = $('.menu-toggle');
  const mainNav = $('#main-nav');
  if (menuToggle && mainNav) {
    const setMenu = open => {
      mainNav.classList.toggle('open', open);
      document.body.classList.toggle('nav-open', open);
      menuToggle.setAttribute('aria-expanded', String(open));
      const label = menuToggle.querySelector('.sr-only');
      if (label) label.textContent = open ? '關閉選單' : '開啟選單';
    };
    menuToggle.addEventListener('click', () => setMenu(!mainNav.classList.contains('open')));
    $$('#main-nav a').forEach(a => a.addEventListener('click', () => setMenu(false)));
    document.addEventListener('click', event => {
      if (mainNav.classList.contains('open') && !mainNav.contains(event.target) && !menuToggle.contains(event.target)) setMenu(false);
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && mainNav.classList.contains('open')) { setMenu(false); menuToggle.focus(); }
    });
    window.addEventListener('resize', () => { if (window.innerWidth > 1180) setMenu(false); });
  }

  const profileDialog = $('#profile-dialog');
  const profileContent = $('#profile-content');
  const field = (label, value) => value ? `<div><small>${label}</small><strong>${value}</strong></div>` : '';
  const closeProfile = () => {
    if (!profileDialog) return;
    if (typeof profileDialog.close === 'function') profileDialog.close();
    else profileDialog.removeAttribute('open');
  };
  const openProfile = card => {
    const p = profiles[card.dataset.profile];
    if (!p || !profileDialog || !profileContent) return;
    const hasDetails = [p.birthday,p.interest,p.hours,p.likes,p.dislikes,p.message].some(Boolean);
    profileContent.innerHTML = `<div class="profile-layout">
      <img src="${p.image}" alt="${p.name} 正式人物卡">
      <div class="profile-copy"><p class="eyebrow">${p.role}</p><h2>${p.name}</h2>
        <div class="profile-meta">${field('生日',p.birthday)}${field('興趣',p.interest)}${field('出沒時段',p.hours)}${field('喜歡的事情',p.likes)}${field('討厭的事情',p.dislikes)}</div>
        <p class="profile-message">${hasDetails ? (p.message || '人物介紹以官網最新內容為準。') : '本週出勤請以官網最新內容為準。'}</p>
      </div></div>`;
    if (typeof profileDialog.showModal === 'function') profileDialog.showModal();
    else profileDialog.setAttribute('open', '');
  };
  document.addEventListener('click', event => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const card = target.closest('.cast-card[data-profile]');
    if (card) openProfile(card);
  });
  $$('.profile-dialog .dialog-close').forEach(button => button.addEventListener('click', closeProfile));
  profileDialog?.addEventListener('click', event => { if (event.target === profileDialog) closeProfile(); });

  const activateMenu = id => {
    $$('.menu-tabs button').forEach(b => {
      const active = b.dataset.pane === id;
      b.classList.toggle('active', active);
      b.setAttribute('aria-selected', String(active));
    });
    $$('.menu-pane').forEach(p => p.classList.toggle('active', p.id === id));
  };
  $$('.menu-tabs button').forEach(btn => btn.addEventListener('click', () => activateMenu(btn.dataset.pane)));
  $$('[data-menu-jump]').forEach(link => link.addEventListener('click', () => activateMenu(link.dataset.menuJump)));

  const activateEvent = id => {
    $$('.event-nav button').forEach(b => {
      const active = b.dataset.eventPanel === id;
      b.classList.toggle('active', active);
      b.setAttribute('aria-selected', String(active));
    });
    $$('.event-panel').forEach(p => p.classList.toggle('active', p.id === id));
  };
  $$('.event-nav button').forEach(btn => btn.addEventListener('click', () => activateEvent(btn.dataset.eventPanel)));

  const purchaseDialog = $('#purchase-dialog');
  $$('[data-open-purchase]').forEach(b => b.addEventListener('click', () => purchaseDialog?.showModal()));
  $$('.purchase-dialog .dialog-close,[data-cancel-purchase]').forEach(b => b.addEventListener('click', () => purchaseDialog?.close()));
  purchaseDialog?.addEventListener('click', e => { if (e.target === purchaseDialog) purchaseDialog.close(); });

  $$('.filters button').forEach(btn => btn.addEventListener('click', () => {
    $$('.filters button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const role = btn.dataset.filter;
    $$('.cast-card[data-role]').forEach(card => { card.hidden = role !== '全部' && card.dataset.role !== role; });
  }));

  const taipeiParts = date => Object.fromEntries(new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(date).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
  const updateStatus = () => {
    const p = taipeiParts(new Date());
    const t = Number(p.hour) * 60 + Number(p.minute);
    const box = $('#live-status'), text = $('#live-text');
    if (!box || !text) return;
    box.classList.remove('is-open');
    if (t >= 840 && t < 1200) { text.textContent = '午後咖啡服務時段'; box.classList.add('is-open'); }
    else if (t >= 1200 || t < 120) { text.textContent = '今日營業時段'; box.classList.add('is-open'); }
    else text.textContent = '目前非固定服務時段';
  };
  updateStatus(); setInterval(updateStatus, 60000);

  const today = new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  $$('.day-card').forEach(card => { if (card.dataset.date === today) card.classList.add('today'); });

  // Avoid displaying stale operational information after its validity window.
  if (today > '2026-08-24') {
    const grid = $('#schedule .schedule-grid');
    if (grid) grid.hidden = true;
    const head = $('#schedule .section-heading');
    if (head && !$('.schedule-expired-note', head.parentElement)) {
      const note = document.createElement('p');
      note.className = 'schedule-expired-note';
      note.textContent = '最新出勤班表請查看官網本週出勤。';
      head.after(note);
    }
  }
  const eventEnd = new Date('2026-08-22T02:00:00+08:00');
  if (new Date() >= eventEnd) {
    const badge = $('#event-status-badge');
    if (badge) { badge.textContent = '活動回顧'; badge.classList.add('ended'); }
    const eyebrow = $('#events .section-heading .eyebrow');
    const title = $('#events .section-heading h2');
    if (eyebrow) eyebrow.textContent = 'EVENT ARCHIVE';
    if (title) title.textContent = 'Jubi 生誕祭｜活動回顧';
  }
  const summerNavyEnd = new Date('2026-09-01T00:00:00+08:00');
  if (new Date() >= summerNavyEnd) {
    const summerBadge = $('#summer-navy-status');
    if (summerBadge) { summerBadge.textContent = '活動已結束'; summerBadge.classList.add('ended'); }
  }
})();
