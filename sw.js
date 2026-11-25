const V = 'pq-v1.2.1';
const CORE = ['./', 'index.html', 'app.css', 'app.js', 'data.js', 'banks.json', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-180.png',
  'vendor/leaflet/leaflet.js', 'vendor/leaflet/leaflet.css', 'vendor/tesseract/tesseract.min.js'];
const OCR = ['vendor/tesseract/worker.min.js', 'vendor/tesseract/tesseract-core-simd-lstm.wasm.js', 'vendor/tesseract/tesseract-core-lstm.wasm.js', 'vendor/tesseract/eng.traineddata.gz'];
self.addEventListener('install', e => e.waitUntil((async () => {
  const c = await caches.open(V);
  await c.addAll(CORE);
  await Promise.all(OCR.map(u => c.add(u).catch(() => {})));
  self.skipWaiting();
})()));
self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== V && k !== 'pq-tiles') await caches.delete(k);
  await self.clients.claim();
})()));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (u.hostname.endsWith('tile.openstreetmap.org')) {
    e.respondWith(caches.open('pq-tiles').then(async c => (await c.match(e.request)) || fetch(e.request).then(r => { c.put(e.request, r.clone()); return r; })));
    return;
  }
  if (u.origin !== location.origin) return;
  e.respondWith(caches.open(V).then(async c => {
    const hit = await c.match(e.request, { ignoreSearch: true });
    const net = fetch(e.request).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; }).catch(() => hit);
    return hit || net;
  }));
});
self.addEventListener('notificationclick', e => { e.notification.close(); e.waitUntil(self.clients.matchAll({ type: 'window' }).then(l => l[0] ? l[0].focus() : self.clients.openWindow('./'))); });
