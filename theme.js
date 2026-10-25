// 🌗 Light, Dark or Automatic (follows the phone, which on iPhone can switch at sunset). Chosen in
// OurPawmily › Me › Appearance and used by both apps; loaded first so the page never flashes.
(function () {
  let t = null;
  try { t = localStorage.getItem('pawmily.theme'); } catch { /* blocked */ }
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  const dark = t === 'dark' || (t !== 'light' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
  const meta = document.querySelector('meta[name=theme-color]');
  if (meta) meta.content = dark ? '#111513' : '#2f7d5b';
})();
