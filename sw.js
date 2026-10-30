// Offline cache for the app shell. Barcode lookups always go to the network.
const CACHE = 'lean-plate-v308';
const SHELL = ['./', 'index.html', 'styles.css', 'js/app.js', 'js/plan.js', 'js/foods.js', 'js/activity.js', 'js/devices.js', 'js/research.js', 'js/lifting.js', 'js/lift.js', 'js/rewards.js', 'js/storage.js', 'js/sync.js', 'js/account.js', 'js/healthParts.js', 'js/dietDays.js', 'js/accountBoot.js', 'js/recover.js', 'family/crypto.js', 'js/analytics.js', 'js/zip.js', 'js/review.js', 'js/planProgress.js', 'js/planCoach.js', 'js/commands.js', 'js/notes.js', 'js/plans.js', 'js/poster.js', 'js/share.js', 'js/brief.js', 'js/briefTab.js', 'js/shows.js', 'js/showsCore.js', 'js/dogs.js', 'js/adopt.js', 'js/household.js', 'js/rhythm.js', 'js/dexa.js', 'js/bodycomp.js', 'js/climb.js', 'js/progress.js', 'js/cheer.js', 'js/photos.js', 'js/dress.js', 'js/dressTab.js', 'js/calendar.js', 'js/calTab.js', 'manifest.webmanifest', 'theme.js', 'icon.svg', 'icon-180.png'];

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
    // Always revalidate with the server so an update never mixes new and old files.
    fetch(e.request, { cache: 'no-cache' })
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request)),
  );
});

// 🔔 OurPawmily notifications (Web Push): show it, and open the right screen when it's tapped.
self.addEventListener('push', (e) => {
  let m = {};
  try { m = e.data ? e.data.json() : {}; } catch { m = { body: e.data?.text() || '' }; }
  e.waitUntil(Promise.all([
    self.registration.showNotification(m.title || 'OurPawmily', {
      body: m.body || '', tag: m.tag || undefined, icon: 'icon-180.png', badge: 'icon-180.png', data: { url: m.url || 'family/' },
    }),
    // An open app checks for what's new and shows its own banner.
    self.clients.matchAll({ type: 'window' }).then((wins) => wins.forEach((w) => w.postMessage({ pushed: m.tag || true }))),
  ]));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || 'family/', self.registration.scope);
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
    const open = wins.find((w) => new URL(w.url).pathname === url.pathname);
    if (open) { open.postMessage({ open: url.hash.slice(1) }); return open.focus(); }
    return self.clients.openWindow(url.href);
  }));
});
