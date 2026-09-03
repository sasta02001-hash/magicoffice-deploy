(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const TIMEZONE = 'Asia/Taipei';
  const params = new URLSearchParams(location.search);
  const OFFLINE = params.get('offline') === '1' || location.protocol === 'file:';
  const POSTER_ONLY = params.get('poster') === '1' || document.documentElement.dataset.posterOnly === 'true';

  function embedded(id, fallback = null) {
    try {
      const node = document.getElementById(id);
      return node ? JSON.parse(node.textContent || '') : fallback;
    } catch (error) {
      console.warn(`[MagicOffice] 無法解析 ${id}`, error);
      return fallback;
    }
  }

  const site = embedded('mo-site-data', {});
  const rosterFallback = embedded('mo-roster-data', []);
  const scheduleFallback = embedded('mo-schedule-fallback', { rows: [] });
  const menuFallback = embedded('mo-menu-fallback', { worlds: [] });
  const eventsData = embedded('mo-events-data', { events: [] });

  const escapeHtml = (value = '') => String(value)
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');

  function storageGet(key) { try { return localStorage.getItem(key); } catch { return null; } }
  function storageSet(key, value) { try { localStorage.setItem(key, value); } catch {} }

  function cacheRead(key) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || !parsed.data || !Number.isFinite(Number(parsed.savedAt))) return null;
      return parsed;
    } catch { return null; }
  }

  function cacheWrite(key, data) {
    try { localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), data })); } catch {}
  }

  function cacheAgeHours(entry) {
    return entry?.savedAt ? Math.max(0, (Date.now() - Number(entry.savedAt)) / 3_600_000) : Infinity;
  }

  function formatSyncTime(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat('zh-TW', {
      timeZone: TIMEZONE, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).format(date);
  }

  async function fetchJson(url, timeout = 9000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, { cache: 'no-store', signal: controller.signal, headers: { accept: 'application/json' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } finally { clearTimeout(timer); }
  }

  function taipeiDateParts(date = new Date()) {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(date).reduce((acc, part) => { acc[part.type] = part.value; return acc; }, {});
  }

  function todayTaipei() {
    const p = taipeiDateParts();
    return `${p.year}-${p.month}-${p.day}`;
  }

  function isoDateFromDate(date) {
    const p = taipeiDateParts(date);
    return `${p.year}-${p.month}-${p.day}`;
  }

  function addDays(dateString, amount) {
    const date = new Date(`${dateString}T12:00:00+08:00`);
    date.setUTCDate(date.getUTCDate() + amount);
    return isoDateFromDate(date);
  }

  function mondayOf(dateString) {
    const date = new Date(`${dateString}T12:00:00+08:00`);
    const weekday = new Intl.DateTimeFormat('en-US', { timeZone: TIMEZONE, weekday: 'short' }).format(date);
    const index = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekday);
    return addDays(dateString, index === 0 ? -6 : 1 - index);
  }

  function dateLabel(dateString) {
    return new Intl.DateTimeFormat('zh-TW', { timeZone: TIMEZONE, month: '2-digit', day: '2-digit' }).format(new Date(`${dateString}T12:00:00+08:00`));
  }

  function weekdayLabel(dateString) {
    return new Intl.DateTimeFormat('zh-TW', { timeZone: TIMEZONE, weekday: 'short' }).format(new Date(`${dateString}T12:00:00+08:00`));
  }

  function initNavigation() {
    const toggle = $('.mo-menu-toggle');
    const nav = $('.mo-nav');
    if (toggle && nav) {
      const close = () => { toggle.setAttribute('aria-expanded', 'false'); nav.classList.remove('is-open'); };
      toggle.addEventListener('click', () => {
        const open = toggle.getAttribute('aria-expanded') !== 'true';
        toggle.setAttribute('aria-expanded', String(open));
        nav.classList.toggle('is-open', open);
      });
      nav.addEventListener('click', (event) => { if (event.target.closest('a')) close(); });
      addEventListener('resize', () => { if (innerWidth > 960) close(); }, { passive: true });
    }

    const mobileBar = $('.mo-mobile-bar');
    if (mobileBar) {
      let lastY = Math.max(0, scrollY);
      let ticking = false;
      const update = () => {
        const y = Math.max(0, scrollY);
        const delta = y - lastY;
        if (innerWidth > 960 || y < 60 || delta < -10) mobileBar.classList.remove('is-hidden');
        else if (delta > 10 && y > 130) mobileBar.classList.add('is-hidden');
        lastY = y;
        ticking = false;
      };
      addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
    }
  }

  function initHeroVideo() {
    const cinema = $('.mo-cinema');
    if (!cinema) return;
    const video = $('video', cinema);
    const start = $('[data-video-start]', cinema);
    const toggle = $('[data-video-toggle]');
    const sound = $('[data-video-sound]');
    const volume = $('[data-video-volume]');
    const fullscreen = $('[data-video-fullscreen]');
    const time = $('[data-video-time]');
    const status = $('[data-video-status]');
    if (!video) return;

    let hasPlayed = false;
    let loadFailed = false;
    const setState = (state, message = '') => {
      cinema.dataset.state = state;
      cinema.dataset.videoReady = String(video.readyState >= 1 && !video.error);
      cinema.dataset.hasPlayed = String(hasPlayed);
      if (status && message) status.textContent = message;
    };
    const formatTime = (seconds) => {
      const safe = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
      return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
    };
    const syncTime = () => {
      if (!time) return;
      const duration = Number.isFinite(video.duration) ? video.duration : 12;
      time.textContent = `${formatTime(video.currentTime)} / ${formatTime(duration)}`;
    };
    const syncControls = () => {
      if (toggle) {
        const icon = $('span', toggle); const label = $('b', toggle);
        if (icon) icon.textContent = video.paused ? '▶' : 'Ⅱ';
        if (label) label.textContent = video.paused ? '播放' : '暫停';
        toggle.setAttribute('aria-label', video.paused ? '播放試播影片' : '暫停試播影片');
      }
      if (sound) {
        const muted = video.muted || video.volume === 0;
        const icon = $('span', sound); const label = $('b', sound);
        if (icon) icon.textContent = muted ? '🔇' : '🔊';
        if (label) label.textContent = muted ? '開啟聲音' : '關閉聲音';
        sound.setAttribute('aria-label', muted ? '開啟影片聲音' : '關閉影片聲音');
        cinema.dataset.audioState = muted ? 'muted' : 'audible';
      }
      if (volume && document.activeElement !== volume) volume.value = String(video.volume || 0);
      syncTime();
    };
    const safePlay = async ({ audible = false } = {}) => {
      if (POSTER_ONLY || loadFailed) {
        video.pause();
        setState(loadFailed ? 'error' : 'idle', loadFailed ? '影片暫時無法載入，已保留正式封面。' : '目前為封面檢查模式。');
        syncControls();
        return false;
      }
      if (audible) {
        const chosen = Math.max(0.15, Number(volume?.value || storageGet('magicoffice.hero.volume') || 0.7));
        video.volume = Math.min(1, chosen);
        video.muted = false;
      }
      setState('loading', audible ? '正在啟動有聲播放…' : '正在載入試播影片…');
      try {
        await video.play();
        return true;
      } catch (error) {
        setState(hasPlayed ? 'paused' : 'idle', '瀏覽器阻擋自動播放，請按「播放試播影片」。');
        syncControls();
        return false;
      }
    };

    video.defaultMuted = true;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    const savedVolume = Number(storageGet('magicoffice.hero.volume'));
    video.volume = Number.isFinite(savedVolume) && savedVolume > 0 ? Math.min(1, savedVolume) : 0.7;

    video.addEventListener('loadedmetadata', () => { if (POSTER_ONLY) { video.pause(); setState('idle', '目前為封面備援檢查模式。'); syncControls(); return; } setState(hasPlayed ? cinema.dataset.state : 'ready', '影片已就緒，可直接播放並開啟聲音。'); syncControls(); }, { passive: true });
    video.addEventListener('canplay', () => { if (POSTER_ONLY) { video.pause(); setState('idle', '目前為封面備援檢查模式。'); return; } cinema.dataset.videoReady = 'true'; if (!hasPlayed && cinema.dataset.state === 'loading') setState('ready', '影片已就緒，可直接播放並開啟聲音。'); }, { passive: true });
    video.addEventListener('playing', () => { hasPlayed = true; loadFailed = false; setState('playing', video.muted ? '影片播放中；可按「開啟聲音」。' : '影片與聲音播放中。'); syncControls(); }, { passive: true });
    video.addEventListener('pause', () => { if (hasPlayed && !video.ended) setState('paused', '影片已暫停。'); syncControls(); }, { passive: true });
    video.addEventListener('volumechange', syncControls, { passive: true });
    video.addEventListener('timeupdate', syncTime, { passive: true });
    video.addEventListener('error', () => { loadFailed = true; hasPlayed = false; setState('error', '影片暫時無法載入，已保留正式封面。'); syncControls(); }, { passive: true });
    video.addEventListener('abort', () => { if (!hasPlayed) setState('idle', '影片載入已中止，請重新按播放。'); }, { passive: true });
    video.addEventListener('stalled', () => { if (!hasPlayed) setState('loading', '影片仍在載入；封面會持續顯示。'); }, { passive: true });

    start?.addEventListener('click', () => safePlay({ audible: true }));
    toggle?.addEventListener('click', () => { if (video.paused) safePlay(); else video.pause(); });
    sound?.addEventListener('click', async () => {
      const makeAudible = video.muted || video.volume === 0;
      if (makeAudible) {
        video.muted = false;
        if (video.volume === 0) video.volume = Math.max(0.15, Number(volume?.value || 0.7));
        storageSet('magicoffice.hero.volume', String(video.volume));
        if (video.paused) await safePlay({ audible: true });
        else setState('playing', '影片與聲音播放中。');
      } else {
        video.muted = true;
        if (!video.paused) setState('playing', '影片播放中；可隨時再次開啟聲音。');
      }
      syncControls();
    });
    volume?.addEventListener('input', async () => {
      const next = Math.max(0, Math.min(1, Number(volume.value)));
      video.volume = next;
      video.muted = next === 0;
      storageSet('magicoffice.hero.volume', String(next));
      if (next > 0 && video.paused) await safePlay({ audible: true });
      syncControls();
    });
    fullscreen?.addEventListener('click', async () => {
      try {
        if (cinema.requestFullscreen) await cinema.requestFullscreen();
        else if (cinema.webkitRequestFullscreen) cinema.webkitRequestFullscreen();
        else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen();
      } catch {}
    });

    setState('idle', '載入前顯示正式封面；播放失敗時不會出現黑框。');
    syncControls();
    if (POSTER_ONLY) {
      video.removeAttribute('autoplay');
      video.pause();
      video.currentTime = 0;
      setState('idle', '目前為封面備援檢查模式。');
      syncControls();
    } else {
      if (!matchMedia('(prefers-reduced-motion: reduce)').matches) requestAnimationFrame(() => safePlay());
      document.addEventListener('visibilitychange', () => { if (!document.hidden && !hasPlayed && !loadFailed) safePlay(); });
    }
  }

  let dialogTrigger = null;
  let dialogScrollY = 0;
  function openDialog(dialog) {
    if (!dialog || dialog.open) return;
    dialogTrigger = document.activeElement;
    dialogScrollY = scrollY;
    document.documentElement.classList.add('mo-dialog-open');
    document.body.style.setProperty('--dialog-scroll-y', `-${dialogScrollY}px`);
    dialog.showModal();
    dialog.scrollTop = 0;
    dialog.querySelector('[data-dialog-close]')?.focus({preventScroll:true});
  }
  function initDialogs() {
    const purchase = $('#purchase-dialog');
    $$('[data-open-purchase]').forEach(button => button.addEventListener('click', () => openDialog(purchase)));
    $$('[data-dialog-close]').forEach(button => button.addEventListener('click', () => button.closest('dialog')?.close()));
    $$('dialog').forEach(dialog => {
      dialog.addEventListener('close', () => {
        if ($$('dialog').some(d => d.open)) return;
        document.documentElement.classList.remove('mo-dialog-open');
        document.body.style.removeProperty('--dialog-scroll-y');
        window.scrollTo({top:dialogScrollY, behavior:'instant'});
        dialogTrigger?.focus?.({preventScroll:true});
      });
      dialog.addEventListener('click', event => {
        if (event.target !== dialog) return;
        const r=dialog.getBoundingClientRect();
        if (event.clientX<r.left || event.clientX>r.right || event.clientY<r.top || event.clientY>r.bottom) dialog.close();
      });
    });
  }

  function renderProfile(profile) {
    const name=profile.cardName || profile.name;
    const facts=[['生日',profile.birthday],['出沒時段',profile.hours],['興趣',profile.interest],['喜歡',profile.likes],['不喜歡',profile.dislikes]]
      .filter(([,value])=>value).map(([label,value])=>`<div class="mo-profile-field"><dt>${label}</dt><dd>${escapeHtml(value)}</dd></div>`).join('');
    return `<article class="mo-profile-layout"><figure class="mo-profile-portrait"><img src="${escapeHtml(profile.image)}" alt="${escapeHtml(name)}" decoding="async"/></figure><div class="mo-profile-copy"><header><p class="mo-profile-role">${escapeHtml(profile.role||'姶仕')}</p><h2 id="profile-title">${escapeHtml(name)}</h2>${profile.name!==name?`<p class="mo-profile-alias">${escapeHtml(profile.name)}</p>`:''}</header><dl class="mo-profile-facts">${facts}</dl>${profile.message?`<section class="mo-profile-message"><h3>想對你說</h3><p>${escapeHtml(profile.message)}</p></section>`:''}</div></article>`;
  }

  function initRoster() {
    const grid = $('[data-roster-grid]');
    const dialog = $('#profile-dialog');
    const content = $('#profile-content');
    if (!grid) return;
    const profiles = new Map(rosterFallback.map((item) => [item.id, item]));
    grid.addEventListener('click', (event) => {
      const card = event.target.closest('[data-profile-id]');
      if (!card) return;
      const profile = profiles.get(card.dataset.profileId);
      if (!profile || !dialog || !content) return;
      content.innerHTML = renderProfile(profile);
      openDialog(dialog);
    });
    $$('[data-roster-filter]').forEach((button) => button.addEventListener('click', () => {
      $$('[data-roster-filter]').forEach((item) => item.classList.toggle('is-active', item === button));
      const filter = button.dataset.rosterFilter;
      $$('.mo-cast-card', grid).forEach((card) => { card.hidden = filter !== '全部' && card.dataset.role !== filter; });
    }));
  }

  function renderScheduleRows(rows) {
    const grid = $('[data-schedule-grid]');
    const section = $('[data-schedule-section]');
    if (!grid || !section) return;
    const today = todayTaipei();
    const start = mondayOf(today);
    const byDate = new Map(Array.from({ length: 7 }, (_, index) => [addDays(start, index), []]));
    for (const row of rows || []) if (byDate.has(row.date)) byDate.get(row.date).push(row);
    grid.innerHTML = [...byDate.entries()].map(([date, entries]) => {
      entries.sort((a, b) => Number(a.sort || 999) - Number(b.sort || 999));
      const tags = [...new Set(entries.flatMap((row) => [row.costume, row.event]).filter(Boolean))];
      const closed = entries.some((row) => row.event === '公休' || row.shift === '公休');
      const list = closed
        ? '<li class="is-empty"><strong>公休</strong><time>當日不營業</time></li>'
        : entries.length
          ? entries.map((row) => `<li><strong>${escapeHtml(row.name || row.event || '未公告')}</strong><time>${escapeHtml(row.startTime && row.endTime ? `${row.startTime}–${row.endTime}` : row.shift || '時間未定')}</time></li>`).join('')
          : '<li class="is-empty"><strong>尚未公告</strong><time>請留意官網更新</time></li>';
      return `<article class="mo-day-card${date === today ? ' is-today' : ''}" data-schedule-date="${date}"><header><small>${escapeHtml(weekdayLabel(date))}</small><strong>${escapeHtml(dateLabel(date))}</strong><span>${date === today ? 'TODAY' : '&nbsp;'}</span></header><div class="mo-day-tags">${tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join('')}</div><ul>${list}</ul></article>`;
    }).join('');
    section.dataset.weekStart = start;
    const summary = $('[data-schedule-summary]');
    if (summary) summary.textContent = `目前顯示 ${start}–${addDays(start, 6)}`;
  }

  function setScheduleState(kind, label, updatedAt = '') {
    const node = $('[data-schedule-state]');
    if (node) { node.dataset.state = kind; node.textContent = label; }
    const updated = $('[data-schedule-updated]');
    if (updated) updated.textContent = updatedAt ? `更新：${formatSyncTime(updatedAt)}` : '';
  }

  let scheduleSyncing = false;
  async function syncSchedule(force = false) {
    if (scheduleSyncing) return;
    scheduleSyncing = true;
    const cacheKey = 'magicoffice.schedule.v4.3';
    const maxAge = Number(site?.schedule?.clientCacheMaxHours) || 168;
    const cached = cacheRead(cacheKey);
    const cachedUsable = Boolean(cached?.data?.rows?.length) && cacheAgeHours(cached) <= maxAge;
    const refreshButton = $('[data-schedule-refresh]');
    refreshButton?.setAttribute('aria-busy', 'true');

    try {
      if (!force && cachedUsable) {
        renderScheduleRows(cached.data.rows);
        setScheduleState('cache', '最近成功快取', cached.data.updatedAt || cached.savedAt);
      }
      if (OFFLINE) {
        if (!cachedUsable) renderScheduleRows(scheduleFallback.rows || []);
        setScheduleState(cachedUsable ? 'cache' : 'fallback', cachedUsable ? '離線快取' : '官網發布快照', cachedUsable ? (cached.data.updatedAt || cached.savedAt) : scheduleFallback.generatedAt);
        return;
      }

      const live = await fetchJson('/api/schedule', Number(site?.schedule?.timeoutMs) || 10000);
      if (!Array.isArray(live.rows) || !live.rows.length) throw new Error('empty schedule');
      if (live.stale) {
        if (cachedUsable) {
          renderScheduleRows(cached.data.rows);
          setScheduleState('cache', '最近成功快取', cached.data.updatedAt || cached.savedAt);
        } else {
          renderScheduleRows(live.rows);
          setScheduleState('fallback', '官網發布快照', live.updatedAt || live.generatedAt);
        }
        return;
      }
      renderScheduleRows(live.rows);
      cacheWrite(cacheKey, live);
      setScheduleState('live', '即時班表已同步', live.updatedAt || live.generatedAt);
    } catch (error) {
      if (cachedUsable) {
        renderScheduleRows(cached.data.rows);
        setScheduleState('cache', '最近成功快取', cached.data.updatedAt || cached.savedAt);
      } else {
        renderScheduleRows(scheduleFallback.rows || []);
        setScheduleState('fallback', '官網發布快照', scheduleFallback.generatedAt);
      }
      console.warn('[MagicOffice] 班表同步失敗，已使用備援資料', error);
    } finally {
      scheduleSyncing = false;
      refreshButton?.removeAttribute('aria-busy');
    }
  }

  function activateMenuTab(code, { focus = false } = {}) {
    const section = $('[data-menu-section]');
    if (!section) return;
    const tabs = $$('[data-menu-tab]', section);
    const panes = $$('[data-menu-world]', section);
    const target = tabs.find((tab) => tab.dataset.menuTab === code) || tabs[0];
    if (!target) return;
    tabs.forEach((tab) => {
      const active = tab === target;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', String(active));
      tab.setAttribute('tabindex', active ? '0' : '-1');
    });
    panes.forEach((pane) => {
      const active = pane.dataset.menuWorld === target.dataset.menuTab;
      pane.classList.toggle('is-active', active);
      pane.hidden = !active;
      pane.setAttribute('aria-hidden', String(!active));
    });
    section.dataset.activeMenuWorld = target.dataset.menuTab;
    if (focus) target.focus({ preventScroll: true });
  }

  function renderMenuData(data) {
    if (!data?.worlds?.length || !globalThis.MOMenuView) return;
    const section=$('[data-menu-section]'),tabs=$('.mo-menu-tabs'),panes=$('[data-menu-panes]');
    if (!section || !tabs || !panes) return;
    const previous=section.dataset.activeMenuWorld || 'CAFE';
    tabs.innerHTML=globalThis.MOMenuView.renderTabs(data);
    panes.innerHTML=globalThis.MOMenuView.renderPanes(data);
    activateMenuTab(previous);
  }

  function bindMenuTabs() {
    const section = $('[data-menu-section]');
    if (!section || section.dataset.tabsBound === '1') return;
    section.dataset.tabsBound = '1';
    section.addEventListener('click', (event) => {
      const button = event.target.closest('[data-menu-tab]');
      if (!button || !section.contains(button)) return;
      event.preventDefault();
      activateMenuTab(button.dataset.menuTab);
    });
    section.addEventListener('keydown', (event) => {
      const button = event.target.closest('[data-menu-tab]');
      if (!button || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      const tabs = $$('[data-menu-tab]', section);
      const index = tabs.indexOf(button);
      let next = index;
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = tabs.length - 1;
      event.preventDefault();
      activateMenuTab(tabs[next].dataset.menuTab, { focus: true });
    });
    activateMenuTab(section.dataset.activeMenuWorld || $('[data-menu-tab]', section)?.dataset.menuTab);
  }

  function setMenuState(kind, message, updatedAt = '') {
    const note = $('[data-menu-sync-note]');
    const state = $('[data-menu-state]');
    const updated = $('[data-menu-updated]');
    if (state) { state.dataset.state = kind; state.textContent = kind === 'live' ? '即時同步' : kind === 'cache' ? '最近快取' : '官網發布版'; }
    if (updated) updated.textContent = updatedAt ? `更新：${formatSyncTime(updatedAt)}` : '';
    if (note) {
      note.dataset.state = kind;
      note.textContent = message;
    }
  }

  let menuSyncing = false;
  async function syncMenu(force = false) {
    if (menuSyncing) return;
    menuSyncing = true;
    const cacheKey = 'magicoffice.menu.v4.3';
    const maxAge = Number(site?.menu?.clientCacheMaxHours) || 168;
    const cached = cacheRead(cacheKey);
    const cachedUsable = Boolean(cached?.data?.worlds?.length) && cacheAgeHours(cached) <= maxAge;
    const refreshButton = $('[data-menu-refresh]');
    refreshButton?.setAttribute('aria-busy', 'true');

    try {
      if (!force && cachedUsable) {
        renderMenuData(cached.data);
        setMenuState('cache', '目前顯示最近成功同步的菜單快取', cached.data.updatedAt || cached.savedAt);
      }
      if (OFFLINE) {
        if (!cachedUsable) renderMenuData(menuFallback);
        setMenuState(cachedUsable ? 'cache' : 'fallback', cachedUsable ? '目前顯示離線快取' : '目前顯示官網發布菜單', cachedUsable ? (cached.data.updatedAt || cached.savedAt) : menuFallback.updatedAt);
        return;
      }

      const live = await fetchJson('/api/menu', Number(site?.menu?.timeoutMs) || 12000);
      if (!live?.worlds?.length) throw new Error('empty menu');
      if (live.stale) {
        if (cachedUsable) {
          renderMenuData(cached.data);
          setMenuState('cache', '目前顯示最近成功同步的菜單快取', cached.data.updatedAt || cached.savedAt);
        } else {
          renderMenuData(live);
          setMenuState('fallback', '目前顯示官網發布菜單', live.updatedAt);
        }
        return;
      }
      renderMenuData(live);
      cacheWrite(cacheKey, live);
      setMenuState('live', '最新菜單已同步', live.updatedAt);
    } catch (error) {
      if (cachedUsable) {
        renderMenuData(cached.data);
        setMenuState('cache', '目前顯示最近成功同步的菜單快取', cached.data.updatedAt || cached.savedAt);
      } else {
        renderMenuData(menuFallback);
        setMenuState('fallback', '同步暫時不可用，顯示官網發布菜單', menuFallback.updatedAt);
      }
      console.warn('[MagicOffice] 菜單同步失敗，已使用備援資料', error);
    } finally {
      menuSyncing = false;
      refreshButton?.removeAttribute('aria-busy');
    }
  }

  function eventState(event, now = Date.now()) {
    const start = Date.parse(event.start);
    const end = Date.parse(event.end);
    if (Number.isFinite(start) && now < start) return 'upcoming';
    if (Number.isFinite(end) && now > end) return 'archive';
    return 'live';
  }

  const eventStateLabel = (state) => state === 'live' ? '活動進行中' : state === 'upcoming' ? '即將登場' : '活動回顧';

  function updateEvents() {
    const now = Date.now();
    const events = eventsData.events || [];
    const counts = { live: 0, upcoming: 0, archive: 0 };
    const byId = new Map();
    for (const event of events) {
      const state = eventState(event, now);
      counts[state] += 1;
      byId.set(event.id, { event, state });
      const suffix = event.statusSuffix ? ` · ${event.statusSuffix}` : '';
      $$(`[data-event-id="${CSS.escape(event.id)}"]`).forEach((node) => {
        node.dataset.eventStatus = state;
        node.hidden = state === 'archive';
        node.classList.remove('is-live', 'is-upcoming', 'is-archive');
        node.classList.add(`is-${state}`);
        $('[data-event-card-status]', node)?.replaceChildren(document.createTextNode(`${eventStateLabel(state)}${suffix}`));
        $('[data-event-status-label]', node)?.replaceChildren(document.createTextNode(`${eventStateLabel(state)}${suffix}`));
        const register = $('[data-event-action="register"]', node);
        if (register) {
          if (state === 'archive') { register.textContent = register.dataset.eventArchiveLabel || '活動已結束'; register.removeAttribute('target'); register.removeAttribute('rel'); register.href = '#events'; register.setAttribute('aria-disabled', 'true'); }
          else { register.textContent = register.dataset.eventLiveLabel || '立即訂位'; register.href = register.dataset.eventLiveHref || register.href; register.target = '_blank'; register.rel = 'noopener'; register.removeAttribute('aria-disabled'); }
        }
      });
    }
    Object.entries(counts).forEach(([state, count]) => { const node = $(`[data-event-count="${state}"]`); if (node) node.textContent = String(count); });
    const ordered = [...events].sort((a, b) => {
      const rank = { live: 0, upcoming: 1, archive: 2 };
      const sa = eventState(a, now); const sb = eventState(b, now);
      if (rank[sa] !== rank[sb]) return rank[sa] - rank[sb];
      return sa === 'archive' ? Date.parse(b.end) - Date.parse(a.end) : Date.parse(a.start) - Date.parse(b.start);
    });
    const grid = $('[data-event-grid]');
    if (grid) ordered.forEach((event) => { const card = $(`[data-event-id="${CSS.escape(event.id)}"]`, grid); if (card) grid.append(card); });
    const next = ordered.find((event) => eventState(event, now) === 'upcoming');
    const nextNode = $('[data-event-next]');
    if (nextNode) nextNode.textContent = next ? `下一場：${next.title}｜${next.displayDate}` : '目前沒有即將登場的活動';
    const clock = $('[data-event-clock]');
    if (clock) clock.textContent = new Intl.DateTimeFormat('zh-TW', { timeZone: TIMEZONE, dateStyle: 'medium', timeStyle: 'short' }).format(new Date());
  }

  function initImageGuards() {
    $$('img').forEach((image) => image.addEventListener('error', () => {
      image.closest('figure,.mo-cast-photo,.mo-world-card,.mo-event-card')?.classList.add('is-image-missing');
      image.hidden = true;
    }, { once: true }));
  }

  function init() {
    initNavigation();
    initHeroVideo();
    initDialogs();
    initRoster();
    bindMenuTabs();
    initImageGuards();
    updateEvents();
    setInterval(updateEvents, 60_000);
    syncSchedule();
    syncMenu();
    $('[data-schedule-refresh]')?.addEventListener('click', () => syncSchedule(true));
    $('[data-menu-refresh]')?.addEventListener('click', () => syncMenu(true));

    const scheduleInterval = Math.max(1, Number(site?.schedule?.refreshMinutes) || 5) * 60_000;
    const menuInterval = Math.max(1, Number(site?.menu?.refreshMinutes) || 10) * 60_000;
    setInterval(() => { if (!document.hidden) syncSchedule(true); }, scheduleInterval);
    setInterval(() => { if (!document.hidden) syncMenu(true); }, menuInterval);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) { syncSchedule(true); syncMenu(true); }
    });
    addEventListener('online', () => { syncSchedule(true); syncMenu(true); }, { passive: true });

    const year = $('#year'); if (year) year.textContent = String(new Date().getFullYear());
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
