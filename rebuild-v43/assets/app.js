(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const state = { roster: [], rosterFilter: '全部', rosterQuery: '', events: [], menu: null, menuWorld: 'CAFE', menuCategory: 'ALL', schedule: null };

  const escapeHTML = (value = '') => String(value).replace(/[&<>'"]/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
  const json = async (url, options = {}) => {
    const response = await fetch(url, { cache: options.cache || 'no-store' });
    if (!response.ok) throw new Error(`${url}: ${response.status}`);
    return response.json();
  };
  const fetchWithFallback = async (apiUrl, fallbackUrl, cacheKey) => {
    try {
      const data = await json(apiUrl);
      if (!data || data.ok === false) throw new Error('invalid API payload');
      try { localStorage.setItem(cacheKey, JSON.stringify({ savedAt: Date.now(), data })); } catch {}
      return { data, source: data.source || '即時同步' };
    } catch (apiError) {
      try {
        const cached = JSON.parse(localStorage.getItem(cacheKey) || 'null');
        if (cached && cached.data) return { data: cached.data, source: '最近成功快取' };
      } catch {}
      const fallback = await json(fallbackUrl, { cache: 'no-cache' });
      return { data: fallback, source: fallback.source || '官網發布版' };
    }
  };

  function initHeader() {
    const toggle = $('.menu-toggle');
    const nav = $('#main-nav');
    if (toggle && nav) {
      toggle.addEventListener('click', () => {
        const open = !nav.classList.contains('open');
        nav.classList.toggle('open', open);
        toggle.setAttribute('aria-expanded', String(open));
        document.body.classList.toggle('dialog-open', open && innerWidth <= 960);
      });
      nav.addEventListener('click', (event) => {
        if (event.target.closest('a')) {
          nav.classList.remove('open');
          toggle.setAttribute('aria-expanded', 'false');
          document.body.classList.remove('dialog-open');
        }
      });
    }
    const bar = $('.mobile-bar');
    let lastY = scrollY;
    let raf = 0;
    addEventListener('scroll', () => {
      if (!bar || raf) return;
      raf = requestAnimationFrame(() => {
        const y = scrollY;
        bar.classList.toggle('hidden', y > 150 && y > lastY + 8);
        if (y < lastY - 8 || y < 80) bar.classList.remove('hidden');
        lastY = y;
        raf = 0;
      });
    }, { passive: true });
  }

  function initVideo() {
    const stage = $('.video-stage');
    const video = $('#hero-video');
    const start = $('.video-start');
    const play = $('#video-play');
    const sound = $('#video-sound');
    const volume = $('#video-volume');
    const time = $('#video-time');
    const fullscreen = $('#video-fullscreen');
    if (!stage || !video) return;

    video.muted = true;
    video.defaultMuted = true;
    video.volume = Number(volume?.value || 0.65);
    const setState = (value) => stage.dataset.videoState = value;
    const format = (seconds) => {
      const value = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
      return `00:${String(Math.floor(value)).padStart(2, '0')}`;
    };
    const syncTime = () => {
      if (time) time.textContent = `${format(video.currentTime)} / ${format(video.duration || 12)}`;
    };
    const attemptPlay = async (withSound = false) => {
      if (withSound) video.muted = false;
      try {
        await video.play();
      } catch {
        video.muted = true;
        sound?.setAttribute('aria-pressed', 'false');
        if (sound) sound.textContent = '開啟聲音';
      }
    };
    start?.addEventListener('click', () => attemptPlay(true));
    play?.addEventListener('click', () => video.paused ? attemptPlay(false) : video.pause());
    sound?.addEventListener('click', async () => {
      video.muted = !video.muted;
      sound.setAttribute('aria-pressed', String(!video.muted));
      sound.textContent = video.muted ? '開啟聲音' : '關閉聲音';
      if (video.paused) await attemptPlay(!video.muted);
    });
    volume?.addEventListener('input', () => { video.volume = Number(volume.value); if (video.volume > 0 && !video.muted) sound.textContent = '關閉聲音'; });
    fullscreen?.addEventListener('click', async () => {
      try {
        if (stage.requestFullscreen) await stage.requestFullscreen();
        else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen();
      } catch {}
    });
    video.addEventListener('playing', () => { setState('playing'); if (play) play.textContent = '暫停'; });
    video.addEventListener('pause', () => { if (play) play.textContent = '播放'; });
    video.addEventListener('timeupdate', syncTime);
    video.addEventListener('loadedmetadata', syncTime);
    video.addEventListener('ended', () => { video.currentTime = 0; setState('poster'); syncTime(); });
    ['error','abort','stalled'].forEach((name) => video.addEventListener(name, () => setState('poster')));
    syncTime();
  }

  async function loadRoster() {
    const data = await json('/content/roster.json', { cache: 'no-cache' });
    state.roster = (data.people || []).filter((person) => person.active !== false);
    renderRoster();
  }
  function renderRoster() {
    const grid = $('#roster-grid');
    if (!grid) return;
    const query = state.rosterQuery.trim().toLowerCase();
    const people = state.roster.filter((person) => {
      const roleOk = state.rosterFilter === '全部' || person.role === state.rosterFilter;
      const queryOk = !query || `${person.name}${person.kana || ''}`.toLowerCase().includes(query);
      return roleOk && queryOk;
    });
    grid.innerHTML = people.map((person) => `<button class="roster-card" type="button" data-person="${escapeHTML(person.id)}" aria-label="查看 ${escapeHTML(person.name)} 人物資料"><img src="${escapeHTML(person.image)}" alt="${escapeHTML(person.name)} 人物照片" loading="lazy" width="760" height="1013"><span><small>${escapeHTML(person.role)}</small><strong>${escapeHTML(person.name)}${person.kana ? `／${escapeHTML(person.kana)}` : ''}</strong><em>${escapeHTML(person.availability || '')}</em></span></button>`).join('');
  }
  function initRosterControls() {
    const grid = $('#roster-grid');
    const dialog = $('#profile-dialog');
    const content = $('#profile-content');
    $$('.filter-group [data-roster-filter]').forEach((button) => button.addEventListener('click', () => {
      $$('.filter-group [data-roster-filter]').forEach((item) => item.classList.toggle('active', item === button));
      state.rosterFilter = button.dataset.rosterFilter;
      renderRoster();
    }));
    $('#roster-search')?.addEventListener('input', (event) => { state.rosterQuery = event.target.value; renderRoster(); });
    grid?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-person]');
      if (!button || !dialog || !content) return;
      const person = state.roster.find((item) => item.id === button.dataset.person);
      if (!person) return;
      content.innerHTML = `<div class="profile-layout"><img src="${escapeHTML(person.image)}" alt="${escapeHTML(person.name)}"><div class="profile-copy"><p class="eyebrow">${escapeHTML(person.role)}</p><h2>${escapeHTML(person.name)}${person.kana ? `／${escapeHTML(person.kana)}` : ''}</h2><p>${escapeHTML(person.message || '')}</p><dl><dt>出沒時段</dt><dd>${escapeHTML(person.availability || '請查看本週出勤')}</dd><dt>生日</dt><dd>${escapeHTML(person.birthday || '未公開')}</dd><dt>喜好</dt><dd>${escapeHTML(person.likes || '未公開')}</dd></dl></div></div>`;
      dialog.showModal();
      document.body.classList.add('dialog-open');
    });
    dialog?.addEventListener('close', () => document.body.classList.remove('dialog-open'));
    $('.dialog-close', dialog)?.addEventListener('click', () => dialog.close());
    dialog?.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
  }

  async function loadSchedule(force = false) {
    const source = $('#schedule-source');
    const summary = $('#schedule-summary');
    const button = $('#schedule-refresh');
    if (button) button.disabled = true;
    if (source) source.textContent = '同步中';
    try {
      const result = await fetchWithFallback(`/api/schedule${force ? `?refresh=${Date.now()}` : ''}`, '/content/schedule-snapshot.json', 'mo-schedule-cache-v43');
      state.schedule = result.data;
      renderSchedule(result.source);
      if (summary) summary.textContent = `${state.schedule.weekStart || ''}–${state.schedule.weekEnd || ''}；官網為正式出勤來源。`;
    } catch (error) {
      if (source) source.textContent = '暫時無法載入';
      if (summary) summary.textContent = '班表暫時無法載入，請稍後重新同步。';
    } finally { if (button) button.disabled = false; }
  }
  function renderSchedule(sourceLabel) {
    const grid = $('#schedule-grid');
    const source = $('#schedule-source');
    if (!grid || !state.schedule) return;
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date());
    const week = ['日','一','二','三','四','五','六'];
    grid.innerHTML = (state.schedule.days || []).map((day) => {
      const date = new Date(`${day.date}T12:00:00+08:00`);
      const entries = day.entries || [];
      const content = entries.length ? entries.map((entry) => `<div class="shift-entry"><strong>${escapeHTML(entry.name || '公休')}</strong><span>${escapeHTML(entry.start && entry.end ? `${entry.start}–${entry.end}｜${entry.shift || ''}` : entry.shift || '未公告')}</span>${entry.theme || entry.event ? `<em class="entry-badge">${escapeHTML(entry.event || entry.theme)}</em>` : ''}</div>`).join('') : '<div class="shift-entry"><strong>尚未公告</strong><span>請留意官網更新</span></div>';
      return `<article class="day-card ${day.date === today ? 'today' : ''}"><header class="day-head"><b>${escapeHTML(day.date.slice(5).replace('-', '/'))}</b><small>星期${week[date.getDay()]}</small></header><div class="day-entries">${content}</div></article>`;
    }).join('');
    if (source) source.textContent = sourceLabel || state.schedule.source || '官網發布版';
  }

  function eventStatus(event, now = new Date()) {
    const start = new Date(event.start);
    const end = new Date(event.end);
    if (now < start) return { key:'upcoming', label:'即將登場', order:1 };
    if (now <= end) return { key:'live', label:'活動進行中', order:0 };
    return { key:'archive', label:'活動回顧', order:2 };
  }
  async function loadEvents() {
    const data = await json('/content/events.json', { cache: 'no-cache' });
    const now = new Date();
    state.events = (data.events || []).map((event) => ({ ...event, status: eventStatus(event, now) })).sort((a,b) => a.status.order - b.status.order || new Date(a.start) - new Date(b.start));
    renderEvents();
  }
  function renderEvents() {
    const grid = $('#event-grid');
    const details = $('#event-details');
    const bar = $('#event-statusbar');
    if (!grid || !details || !bar) return;
    const counts = state.events.reduce((map,event) => { map[event.status.key] = (map[event.status.key] || 0) + 1; return map; }, {});
    bar.innerHTML = `<span class="status-chip">${counts.live || 0} 進行中</span><span class="status-chip">${counts.upcoming || 0} 即將登場</span><span class="status-chip">${counts.archive || 0} 活動回顧</span>`;
    grid.innerHTML = state.events.map((event) => `<a class="event-card" href="#event-${escapeHTML(event.id)}"><img src="${escapeHTML(event.image)}" alt="${escapeHTML(event.title)} 官方活動主視覺" loading="lazy"><div class="event-card-body"><span class="event-card-status">${escapeHTML(event.status.label)}</span><h3>${escapeHTML(event.title)}</h3><time>${escapeHTML(event.displayDate)}</time><p>${escapeHTML(event.subtitle)}</p></div></a>`).join('');
    details.innerHTML = state.events.map((event) => `<article class="event-section" id="event-${escapeHTML(event.id)}"><figure class="event-poster"><img src="${escapeHTML(event.image)}" alt="${escapeHTML(event.title)} 主視覺" loading="lazy"></figure><div class="event-content"><span class="event-card-status">${escapeHTML(event.status.label)}</span><p class="event-subtitle">${escapeHTML(event.displayDate)} · ${escapeHTML(event.subtitle)}</p><h3>${escapeHTML(event.title)}</h3><p>${escapeHTML(event.summary)}</p><div class="event-facts">${(event.facts || []).map(([label,value]) => `<div class="event-fact"><small>${escapeHTML(label)}</small><b>${escapeHTML(value)}</b></div>`).join('')}</div><div class="event-actions"><a class="button primary" href="${escapeHTML(event.primary.href)}" ${event.primary.href.startsWith('http') ? 'target="_blank" rel="noopener"' : ''}>${escapeHTML(event.primary.label)}</a><a class="button secondary dark" href="${escapeHTML(event.secondary.href)}" ${event.secondary.href.startsWith('http') ? 'target="_blank" rel="noopener"' : ''}>${escapeHTML(event.secondary.label)}</a></div>${(event.sections || []).map((section,index) => `<details ${index === 0 ? 'open' : ''}><summary>${escapeHTML(section.title)}</summary><ul>${(section.items || []).map((item) => `<li>${escapeHTML(item)}</li>`).join('')}</ul></details>`).join('')}</div></article>`).join('');
  }

  async function loadMenu(force = false) {
    const source = $('#menu-source');
    const button = $('#menu-refresh');
    if (button) button.disabled = true;
    if (source) source.textContent = '同步中';
    try {
      const result = await fetchWithFallback(`/api/menu${force ? `?refresh=${Date.now()}` : ''}`, '/content/menu-snapshot.json', 'mo-menu-cache-v43');
      state.menu = result.data;
      renderMenuTabs();
      renderMenu();
      if (source) source.textContent = result.source;
    } catch (error) {
      if (source) source.textContent = '暫時無法載入';
    } finally { if (button) button.disabled = false; }
  }
  function currentWorld() { return state.menu?.worlds?.find((world) => world.id === state.menuWorld) || state.menu?.worlds?.[0]; }
  function renderMenuTabs() {
    const tabs = $('#menu-tabs');
    if (!tabs || !state.menu) return;
    tabs.innerHTML = state.menu.worlds.map((world) => `<button type="button" role="tab" aria-selected="${world.id === state.menuWorld}" class="${world.id === state.menuWorld ? 'active' : ''}" data-menu-world="${escapeHTML(world.id)}">${escapeHTML(world.tab)}</button>`).join('');
  }
  function renderMenu() {
    const panel = $('#menu-panel');
    const world = currentWorld();
    if (!panel || !world) return;
    panel.className = `menu-panel menu-theme-${world.theme}`;
    const categories = state.menuCategory === 'ALL' ? world.categories : world.categories.filter((category) => category.id === state.menuCategory);
    panel.innerHTML = `<div class="menu-scene"><figure><img src="${escapeHTML(world.scene)}" alt="${escapeHTML(world.title)} 場景" loading="lazy"></figure><div class="menu-scene-copy"><p class="eyebrow">${escapeHTML(world.eyebrow)}</p><h3>${escapeHTML(world.title)}</h3><p>${escapeHTML(world.description)}</p><div class="menu-world-facts">${(world.facts || []).map((fact) => `<span>${escapeHTML(fact)}</span>`).join('')}</div></div></div><div class="menu-category-tabs" role="tablist" aria-label="${escapeHTML(world.tab)}分類"><button type="button" class="${state.menuCategory === 'ALL' ? 'active' : ''}" data-menu-category="ALL">全部</button>${world.categories.map((category) => `<button type="button" class="${state.menuCategory === category.id ? 'active' : ''}" data-menu-category="${escapeHTML(category.id)}">${escapeHTML(category.name)}</button>`).join('')}</div><div class="menu-categories">${categories.map((category) => `<section class="menu-category"><h4>${escapeHTML(category.name)}</h4>${category.items.map(([name,price]) => `<div class="menu-item"><span>${escapeHTML(name)}</span><b>${escapeHTML(price)}</b></div>`).join('')}</section>`).join('')}</div><p class="menu-note">${escapeHTML(world.note || '')}</p>`;
  }
  function initMenuControls() {
    $('#menu-tabs')?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-menu-world]');
      if (!button) return;
      state.menuWorld = button.dataset.menuWorld;
      state.menuCategory = 'ALL';
      history.replaceState(null, '', `#menu-${state.menuWorld.toLowerCase()}`);
      renderMenuTabs();
      renderMenu();
    });
    $('#menu-panel')?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-menu-category]');
      if (!button) return;
      state.menuCategory = button.dataset.menuCategory;
      renderMenu();
    });
    $$('[data-menu-jump]').forEach((link) => link.addEventListener('click', () => {
      state.menuWorld = link.dataset.menuJump;
      state.menuCategory = 'ALL';
      renderMenuTabs();
      renderMenu();
    }));
    const hash = location.hash.match(/^#menu-(cafe|bar|collection)$/i);
    if (hash) state.menuWorld = hash[1].toUpperCase();
  }

  async function boot() {
    initHeader();
    initVideo();
    initRosterControls();
    initMenuControls();
    $('#schedule-refresh')?.addEventListener('click', () => loadSchedule(true));
    $('#menu-refresh')?.addEventListener('click', () => loadMenu(true));
    const tasks = [loadRoster(), loadSchedule(), loadEvents(), loadMenu()];
    const results = await Promise.allSettled(tasks);
    const failures = results.filter((result) => result.status === 'rejected');
    if (failures.length) console.warn('MagicOffice partial fallback', failures.map((item) => String(item.reason)));
    document.documentElement.dataset.ready = 'true';
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
