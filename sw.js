// Offline-Cache: App-Hülle (Netz zuerst, offline aus dem Cache). Aufgabendaten liegen geschützt in Supabase und
// werden von der App selbst im Cache „ap2-data“ gehalten – den lässt dieser Service Worker beim Update stehen.
const V = 'ap2-claude-v34';
const KEEP = [V, 'ap2-data'];
const SHELL = ['./', 'index.html', 'css/app.css', 'js/core.js', 'js/store.js', 'js/pad.js', 'js/anno.js', 'js/sync.js', 'js/symbols.js', 'js/app.js', 'manifest.webmanifest', 'fonts/archivo.woff2', 'fonts/archivo-ext.woff2', 'icon-192.png'];
self.addEventListener('install', e => e.waitUntil(caches.open(V).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => !KEEP.includes(k)).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url); if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  if (u.pathname.includes('/data/img/')) return e.respondWith(caches.open(V).then(c => c.match(e.request).then(r => r || fetch(e.request).then(res => { if (res.ok) c.put(e.request, res.clone()); return res; }))));
  // App-Hülle immer beim Server nachfragen (no-cache = mit ETag prüfen), sonst hält GitHub Pages alte Dateien bis zu 10 min im Browser-Cache
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then(res => { if (res.ok) { const cp = res.clone(); caches.open(V).then(c => c.put(e.request, cp)); } return res; }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
// Push-Mitteilungen (Duelle)
self.addEventListener('push', e => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'AP2 Lernraum', { body: d.body || '', tag: d.tag, icon: 'icon-192.png', badge: 'icon-192.png', data: { url: d.url || '#/' } }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const target = new URL(self.registration.scope).href + (e.notification.data && e.notification.data.url || '#/');
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(ws => { const w = ws.find(x => x.url.startsWith(self.registration.scope)); if (w) { w.navigate ? w.navigate(target).catch(() => {}) : 0; return w.focus(); } return clients.openWindow(target); }));
});
