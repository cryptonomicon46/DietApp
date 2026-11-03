// 🌗 Light, Dark or Automatic (follows the phone, which on iPhone can switch at sunset). Chosen in
// OurPawmily › Me › Appearance and used by both apps; loaded first so the page never flashes.
(function () {
  let t = null;
  try { t = localStorage.getItem('pawmily.theme'); } catch { /* blocked */ }
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  const dark = t === 'dark' || (t !== 'light' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
  const meta = document.querySelector('meta[name=theme-color]');
  if (meta) meta.content = dark ? '#111513' : '#2f7d5b';
  // 🐾 OurPawmily's opening animation plays on a cold launch only: not on a reload, going back,
  // or coming back from the trackers (a page of this app opened it).
  try {
    if (/\/family\/(index\.html)?$/.test(location.pathname)) {
      const nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
      let fromApp = false;
      try { fromApp = !!document.referrer && new URL(document.referrer).origin === location.origin; } catch { /* no referrer */ }
      if (fromApp || (nav && nav.type !== 'navigate')) document.documentElement.classList.add('nosplash');
    }
  } catch { /* plays */ }
})();
