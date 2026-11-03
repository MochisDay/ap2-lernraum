// Offline-Cache: App-Hülle (Netz zuerst, offline aus dem Cache). Aufgabendaten liegen geschützt in Supabase und
// werden von der App selbst im Cache „ap2-data“ gehalten – den lässt dieser Service Worker beim Update stehen.
const V = 'ap2-claude-v18';
const KEEP = [V, 'ap2-data'];
const SHELL = ['./', 'index.html', 'css/app.css', 'js/core.js', 'js/store.js', 'js/pad.js', 'js/sync.js', 'js/symbols.js', 'js/app.js', 'manifest.webmanifest'];
self.addEventListener('install', e => e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => !KEEP.includes(k)).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url); if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  if (u.pathname.includes('/data/img/')) return e.respondWith(caches.open(V).then(c => c.match(e.request).then(r => r || fetch(e.request).then(res => { if (res.ok) c.put(e.request, res.clone()); return res; }))));
  e.respondWith(fetch(e.request).then(res => { if (res.ok) { const cp = res.clone(); caches.open(V).then(c => c.put(e.request, cp)); } return res; }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
