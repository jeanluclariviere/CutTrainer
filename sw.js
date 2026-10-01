// Network first, and never a stale copy, so every update you push shows up on the next load;
// the cached copy is only used when you're offline.
const CACHE = 'cut-trainer-v5';
const CORE = ['./', './index.html', './ar.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './ar-core.js', './ar-worker.js', './engine.js'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).catch(()=>{})); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const same = new URL(req.url).origin === location.origin;
  // always ask the server (GitHub Pages lets browsers reuse a page for 10 minutes otherwise)
  e.respondWith((same ? fetch(req.url, {cache: 'no-cache', credentials: 'same-origin'}) : fetch(req)).then(res => {
    if (res.ok && same) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req).then(r => r || caches.match('./index.html'))));
});
