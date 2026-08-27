
(() => {
  const yuzuItems = [...document.querySelectorAll('#yuzu-birthday details.yuzu-accordion')];
  const openExclusive = item => {
    if (!item) return;
    yuzuItems.forEach(other => { if (other !== item) other.open = false; });
    item.open = true;
  };

  yuzuItems.forEach(item => {
    item.addEventListener('toggle', () => {
      if (item.open) yuzuItems.forEach(other => { if (other !== item) other.open = false; });
    });
  });

  const revealHashTarget = hash => {
    if (!hash || hash === '#') return;
    let target;
    try { target = document.querySelector(hash); } catch (_) { return; }
    if (!target) return;
    const detail = target.matches('details') ? target : target.closest('details');
    if (detail) {
      if (detail.classList.contains('yuzu-accordion')) openExclusive(detail);
      else detail.open = true;
    }
  };

  document.addEventListener('click', event => {
    const link = event.target.closest('a[href^="#"]');
    if (link) revealHashTarget(link.getAttribute('href'));
  });

  if (location.hash) revealHashTarget(location.hash);
  if (matchMedia('(max-width: 760px)').matches && !location.hash.startsWith('#yuzu-')) {
    yuzuItems.forEach(item => { item.open = false; });
  }
})();
