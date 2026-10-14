// Offline cache for the app shell. Barcode lookups always go to the network.
const CACHE = 'lean-plate-v28';
const SHELL = ['./', 'index.html', 'styles.css', 'js/app.js', 'js/plan.js', 'js/foods.js', 'js/activity.js', 'js/devices.js', 'js/research.js', 'js/lifting.js', 'js/lift.js', 'js/rewards.js', 'js/storage.js', 'js/sync.js', 'js/analytics.js', 'js/zip.js', 'js/review.js', 'manifest.webmanifest', 'icon.svg', 'icon-180.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Network first so updates show up, cache as fallback when offline.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request)),
  );
});
