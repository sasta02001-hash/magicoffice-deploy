
(() => {
  const registryNode = document.getElementById('magic-event-registry');
  if (!registryNode) return;
  let registry;
  try { registry = JSON.parse(registryNode.textContent); } catch (error) { console.error('MagicOffice event registry error', error); return; }
  const labels = {upcoming:'即將登場', live:'活動進行中', archive:'活動回顧'};
  const rank = {live:0, upcoming:1, archive:2};
  const reviewMode = /review/i.test(document.querySelector('meta[name="site-version"]')?.content || '');
  const previewValue = null;
  const previewDate = previewValue ? new Date(previewValue) : null;
  const now = previewDate && !Number.isNaN(previewDate.getTime()) ? previewDate : new Date();
  if (previewDate && !Number.isNaN(previewDate.getTime())) document.documentElement.dataset.eventPreview = 'true';

  const statusOf = event => {
    const start = new Date(event.start).getTime();
    const end = new Date(event.end).getTime();
    const current = now.getTime();
    return current < start ? 'upcoming' : current <= end ? 'live' : 'archive';
  };
  const events = registry.events.map(event => ({...event, status:statusOf(event)}));
  const sortEvents = list => [...list].sort((a,b) => {
    if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
    if (a.status === 'archive') return new Date(b.end) - new Date(a.end);
    return new Date(a.start) - new Date(b.start);
  });

  const setText = (node, value) => { if (node && node.textContent !== value) node.textContent = value; };
  events.forEach(event => {
    const section = document.getElementById(event.sectionId);
    if (section) {
      section.dataset.eventStatus = event.status;
      section.classList.remove('event-state-live','event-state-upcoming','event-state-archive');
      section.classList.add(`event-state-${event.status}`);
      const badge = section.querySelector('[data-event-status-label]');
      if (badge) {
        const suffix = badge.dataset.eventStatusSuffix || event.statusSuffix || '';
        setText(badge, labels[event.status] + (suffix ? ` · ${suffix}` : ''));
        badge.classList.toggle('ended', event.status === 'archive');
      }
      setText(section.querySelector('[data-event-eyebrow]'), event.eyebrow);
      section.querySelectorAll('[data-event-action="register"]').forEach(action => {
        const liveHref = action.dataset.eventLiveHref;
        const liveLabel = action.dataset.eventLiveLabel;
        const archiveLabel = action.dataset.eventArchiveLabel || '活動已結束';
        if (event.status === 'archive') {
          action.removeAttribute('href');
          action.setAttribute('aria-disabled','true');
          action.setAttribute('tabindex','-1');
          action.classList.add('is-event-disabled');
          setText(action, archiveLabel);
        } else {
          if (liveHref) action.setAttribute('href', liveHref);
          action.removeAttribute('aria-disabled');
          action.removeAttribute('tabindex');
          action.classList.remove('is-event-disabled');
          if (liveLabel) setText(action, liveLabel);
        }
      });
      section.querySelectorAll('[data-event-action="updates"]').forEach(action => {
        const text = event.status === 'archive' ? action.dataset.eventArchiveLabel : action.dataset.eventLiveLabel;
        if (text) setText(action, text);
      });
    }

    const card = document.querySelector(`.event-hub-card[data-event-id="${event.id}"]`);
    if (card) {
      card.dataset.eventStatus = event.status;
      card.classList.remove('is-live','is-upcoming','is-archive');
      card.classList.add(`is-${event.status}`);
      setText(card.querySelector('[data-event-card-status]'), labels[event.status]);
      const time = card.querySelector('[data-event-card-date]');
      if (time) { time.dateTime = event.start; setText(time, event.displayDate); }
      card.setAttribute('aria-label', `${event.title}，${labels[event.status]}，${event.displayDate}`);
    }
  });

  const ordered = sortEvents(events);
  const grid = document.querySelector('#event-hub .event-hub-grid');
  if (grid) ordered.forEach(event => {
    const card = grid.querySelector(`[data-event-id="${event.id}"]`);
    if (card) grid.appendChild(card);
  });
  const menuSection = document.getElementById('menu');
  if (menuSection?.parentNode) ordered.forEach(event => {
    const section = document.getElementById(event.sectionId);
    if (section) menuSection.parentNode.insertBefore(section, menuSection);
  });

  ['live','upcoming','archive'].forEach(status => {
    setText(document.querySelector(`[data-event-count="${status}"]`), String(events.filter(event => event.status === status).length));
  });
  const next = ordered.find(event => event.status === 'upcoming');
  setText(document.querySelector('[data-event-next]'), next ? `下一場：${next.title}｜${next.displayDate}` : '下一場活動將於官網公布');
  const clock = document.querySelector('[data-event-clock]');
  if (clock) {
    const parts = new Intl.DateTimeFormat('zh-TW',{timeZone:registry.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
    const values = Object.fromEntries(parts.map(part => [part.type,part.value]));
    const label = `${values.year}.${values.month}.${values.day}`;
    setText(clock,label);
    clock.dateTime = `${values.year}-${values.month}-${values.day}`;
  }

  const structuredNode = document.getElementById('magic-structured-data');
  if (structuredNode) {
    try {
      const structured = JSON.parse(structuredNode.textContent);
      const stateMap = {upcoming:'https://schema.org/EventScheduled',live:'https://schema.org/EventScheduled',archive:'https://schema.org/EventCompleted'};
      structured['@graph']?.forEach(item => {
        if (item['@type'] !== 'Event' || !item['@id']) return;
        const id = item['@id'].replace('#event-','');
        const event = events.find(candidate => candidate.id === id);
        if (event) item.eventStatus = stateMap[event.status];
      });
      structuredNode.textContent = JSON.stringify(structured);
    } catch (_) {}
  }

  document.documentElement.dataset.eventClock = now.toISOString();
  window.MagicOfficeEvents = Object.freeze({timezone:registry.timezone,now:new Date(now),events:ordered.map(event => ({...event}))});
})();
