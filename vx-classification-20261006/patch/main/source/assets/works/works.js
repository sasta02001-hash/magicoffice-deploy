(() => {
  'use strict';
  if (window.VXLegacyRedirectPending) return;
  const works = [...(window.VX_WORKS || [])].sort((a, b) => Number(b.id) - Number(a.id));
  const categories = window.VX_CRAFT_CATEGORIES || [];
  const byId = new Map(works.map(work => [work.id, work]));
  const viewer = document.querySelector('#vx-work-viewer');
  const video = document.querySelector('#vx-work-video');
  const media = document.querySelector('.vx-viewer-media');
  const status = document.querySelector('#vx-playback-status');
  const error = document.querySelector('#vx-video-error');
  const duration = document.querySelector('#vx-work-duration');
  const copyButton = document.querySelector('#vx-copy-work');
  const copyStatus = document.querySelector('#vx-copy-status');
  const revealImage = document.querySelector('#vx-folio-reveal img');
  const folio = window.createVXFolioReveal(document.querySelector('#vx-folio-reveal'), window.matchMedia('(prefers-reduced-motion: reduce)'), video);
  const openedWorks = new Set();
  let revision = 0, returnFocus = null, activeWork = null;
  const asset = (work, filename) => '/assets/works/' + work.id + '/' + filename;
  const escape = text => String(text).replace(/[&<>"']/g, character => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[character]));
  const timeLabel = seconds => Number.isFinite(seconds) ? String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(Math.floor(seconds % 60)).padStart(2, '0') : '';
  function card(work, index) {
    const title = escape(work.cardTitle || work.title);
    const category = categories.find(c => c.id === work.category);
    const tag = category ? '<span class="vx-craft-tag">' + escape(category.code) + '</span>' : '';
    const info = work.cardInfo === (work.cardTitle || work.title) ? '' : '<p>' + escape(work.cardInfo) + '</p>';
    return '<article class="vx-work-card" id="work-' + work.id + '"><a class="vx-work-link" href="/works/' + work.id + '/" data-vx-work="' + work.id + '" aria-label="觀看' + escape(work.title) + '作品影片">' +
      '<div class="vx-folio-cover"><div class="vx-folio-front"><img class="vx-folio-art" src="' + asset(work, 'cover-768.webp') + '" srcset="' + asset(work, 'cover-384.webp') + ' 384w, ' + asset(work, 'cover-768.webp') + ' 768w" sizes="(max-width: 700px) calc((100vw - 50px) / 2), (max-width: 1000px) calc((100vw - 100px) / 3), 374px" width="768" height="1152" alt="' + escape(work.alt) + '" decoding="async" loading="' + (index < 3 ? 'eager' : 'lazy') + '"></div></div>' +
      tag + '<h2>' + title + '</h2>' + info + '<div class="vx-card-meta"><span class="vx-watch"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3l8 5-8 5z"/></svg>觀看動態</span><span aria-label="作品編號 ' + work.id + '">' + work.id + '</span></div></a></article>';
  }
  function mount(root) {
    const grid = root?.querySelector('[data-vx-work-grid]');
    if (!grid || grid.dataset.mounted) return;
    grid.dataset.mounted = 'true';
    const controls = root.querySelector('[data-vx-craft-controls]');
    const select = root.querySelector('#vx-craft-filter');
    const summary = root.querySelector('#vx-craft-summary');
    const counts = root.querySelectorAll('[data-vx-work-count], [data-vx-craft-count]');
    const more = root.querySelector('[data-vx-works-more]');
    let filtered = works, visibleCount = 0;
    const requested = new URL(location.href).searchParams.get('craft');
    let activeCategory = categories.some(c => c.id === requested) ? requested : 'all';
    function renderSelection() {
      const category = categories.find(c => c.id === activeCategory);
      filtered = category ? works.filter(w => w.category === category.id) : works;
      visibleCount = Math.min(12, filtered.length);
      grid.innerHTML = filtered.length ? filtered.slice(0, visibleCount).map(card).join('') : '<div class="vx-craft-empty"><p>此分類尚無作品</p><button type="button" class="vx-works-more" data-vx-show-all>瀏覽全部作品</button></div>';
      counts.forEach(count => { count.textContent = filtered.length + ' 件作品'; });
      if (summary) summary.textContent = category ? category.id === 'pending' ? '005 煙晶緞帶、009 歐美線條：工藝分類待確認。' : category.code + '｜' + category.name + ' · ' + category.combination + (category.id === 'general' ? '，獨立於 TRIARCH 工藝系列。' : '') : '依實際施作工藝分類，從漂、染、燙到複合工藝。';
      if (more) more.hidden = visibleCount >= filtered.length;
      if (select) select.value = activeCategory;
    }
    function changeCategory(value) {
      activeCategory = categories.some(c => c.id === value) ? value : 'all';
      const url = new URL(location.href);
      if (activeCategory === 'all') url.searchParams.delete('craft');
      else url.searchParams.set('craft', activeCategory);
      history.replaceState(history.state, '', url.pathname + url.search + url.hash);
      renderSelection();
    }
    if (controls) controls.hidden = false;
    select?.addEventListener('change', () => changeCategory(select.value));
    grid.addEventListener('click', event => {
      if (event.target.closest('[data-vx-show-all]')) { changeCategory('all'); select?.focus({preventScroll:true}); }
    });
    more?.addEventListener('click', () => {
      const start = visibleCount;
      visibleCount = Math.min(visibleCount + 12, filtered.length);
      grid.insertAdjacentHTML('beforeend', filtered.slice(start, visibleCount).map((work, index) => card(work, start + index)).join(''));
      more.hidden = visibleCount >= filtered.length;
      grid.querySelector('[data-vx-work="' + filtered[start]?.id + '"]')?.focus({preventScroll:true});
    });
    renderSelection();
  }

  window.VXWorks = {mount};
  mount(document.querySelector('#app'));
  async function playWork() {
    if (!viewer.open) return;
    const current = revision;
    status.hidden = false; status.textContent = '影片載入中…';
    try { await video.play(); if (!viewer.open) video.pause(); }
    catch { if (current === revision && viewer.open && !video.error) { status.textContent = '請點影片播放鍵開始觀看。'; status.hidden = false; } }
  }
  function setWork(work) {
    activeWork = work;
    document.querySelector('#vx-work-title').textContent = work.title;
    document.querySelector('.vx-work-description').textContent = work.description;
    document.querySelector('.vx-viewer-copy dl').innerHTML = work.details.map(([label, value]) => '<div><dt>' + escape(label) + '</dt><dd>' + escape(value) + '</dd></div>').join('');
    document.querySelector('.vx-work-reference').textContent = '作品編號 ' + work.id;
    document.querySelector('.vx-consult-button').setAttribute('aria-label', '在 LINE 諮詢' + work.title);
    video.setAttribute('aria-label', work.title + '實際作品影片');
    video.poster = asset(work, work.poster);
    video.width = work.width; video.height = work.height;
    video.muted = true;
    media.style.aspectRatio = work.width + ' / ' + work.height;
    media.style.setProperty('--vx-film-max-width', ((work.width / work.height) * 65).toFixed(3) + 'dvh');
    duration.textContent = timeLabel(work.duration);
    error.querySelector('a').href = asset(work, 'film.mp4');
    const film = asset(work, 'film.mp4');
    if (video.getAttribute('src') !== film) { video.src = film; video.load(); }
    else video.currentTime = 0;
  }
  function openWork(target, autoplay = true, hash) {
    const work = byId.get(hash?.split('/')[1] || target?.dataset.vxWork);
    if (!work || viewer.open || typeof viewer.showModal !== 'function') return;
    const current = ++revision;
    const art = target?.querySelector('.vx-folio-art');
    const quick = openedWorks.has(work.id) || !art?.complete || !art.naturalWidth;
    openedWorks.add(work.id);
    revealImage.src = art?.currentSrc || asset(work, 'cover-768.webp');
    returnFocus = target;
    video.pause(); setWork(work);
    error.hidden = true; status.hidden = true; copyStatus.hidden = true;
    folio.prepare(); viewer.showModal(); viewer.scrollTop = 0;
    document.body.classList.add('vx-work-enhanced');
    document.title = work.title + '｜VX SAGITTARIUS';
    document.body.classList.add('vx-work-open');
    folio.reveal({quick}).then(completed => {
      if (completed && viewer.open && !document.hidden && current === revision && autoplay) playWork();
    });
  }
  function closeWork() {
    if (!viewer.open) return;
    revision++; folio.cancel(); video.pause(); status.hidden = true;
    video.removeAttribute('src'); video.load();
    viewer.close(); document.body.classList.remove('vx-work-open');
    document.title = document.body.dataset.page === 'home' ? 'VX SAGITTARIUS｜VX TRIARCH' : '作品｜VX SAGITTARIUS';
    const target = returnFocus?.isConnected ? returnFocus : document.querySelector('#app [data-vx-work="' + activeWork?.id + '"]');
    target?.focus({preventScroll:true});
  }
  const navigation = window.createVXWorkNavigation({
    host:window, hashes:works.map(work => '#works/' + work.id), catalogHash:'#works', pathMode:true, open:openWork, close:closeWork,
    isOpen:() => viewer.open,
    resolveHash:target => '#works/' + target.dataset.vxWork,
    findTarget:hash => {
      const id = hash.split('/')[1];
      return returnFocus?.isConnected && returnFocus.dataset.vxWork === id ? returnFocus : document.querySelector('#app [data-vx-work="' + id + '"]');
    }
  });
  document.addEventListener('click', event => {
    const target = event.target.closest('[data-vx-work]');
    if (!target || !byId.has(target.dataset.vxWork) || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    if (typeof viewer.showModal !== 'function') return;
    event.preventDefault(); navigation.open(target);
  });
  document.querySelector('#vx-close-work').addEventListener('click', () => navigation.close());
  viewer.addEventListener('cancel', event => { event.preventDefault(); navigation.close(); });
  viewer.addEventListener('click', event => {
    const box = viewer.getBoundingClientRect();
    if (event.target === viewer && (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom)) navigation.close();
  });
  document.querySelector('#vx-replay-work').addEventListener('click', () => { video.currentTime = 0; playWork(); });
  video.addEventListener('loadedmetadata', () => { duration.textContent = timeLabel(video.duration); });
  video.addEventListener('playing', () => { status.hidden = true; });
  video.addEventListener('waiting', () => { if (viewer.open) { status.textContent = '影片載入中…'; status.hidden = false; } });
  video.addEventListener('pause', () => { if (!video.error) status.hidden = true; });
  video.addEventListener('ended', () => { status.hidden = true; });
  video.addEventListener('error', () => { if (viewer.open) { error.hidden = false; status.hidden = true; } });
  document.addEventListener('visibilitychange', () => { if (document.hidden) video.pause(); });
  window.addEventListener('pagehide', () => video.pause());
  if (navigator.clipboard?.writeText) copyButton.hidden = false;
  copyButton.addEventListener('click', async () => {
    if (!activeWork) return;
    const work = activeWork;
    const shareUrl = window.location.origin + '/works/' + work.id + '/';
    const text = '我想諮詢這款 VX 作品：' + work.title + '。\n' + work.details.map(([label, value]) => label + '：' + value).join('\n') + '\n作品編號：' + work.id + '\n' + shareUrl;
    try { await navigator.clipboard.writeText(text); if (activeWork === work) copyStatus.textContent = '已複製，可貼到 LINE 對話。'; }
    catch { if (activeWork === work) copyStatus.textContent = '未能複製。可在 LINE 提供作品編號 ' + work.id + '。'; }
    if (activeWork === work) copyStatus.hidden = false;
  });
})();
