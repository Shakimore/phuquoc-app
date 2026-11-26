const V = 'pq-v3.0.0', A = 'pq-assets', VAULT = 'vault-4bc93244ff.bin';
const CORE = ['./', 'index.html', 'app.css', 'app.js', 'data.js', 'banks.json', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-180.png', 'icon-512m.png',
  'vendor/leaflet/leaflet.js', 'vendor/leaflet/leaflet.css', 'vendor/tesseract/tesseract.min.js'];
const BIG = [VAULT, 'SourceSans3.woff2'];
const OCR = ['vendor/tesseract/worker.min.js', 'vendor/tesseract/tesseract-core-simd-lstm.wasm.js', 'vendor/tesseract/tesseract-core-lstm.wasm.js', 'vendor/tesseract/eng.traineddata.gz'];
const isAsset = p => /\/(vault-[0-9a-f]+\.bin|[^/]+\.woff2|vendor\/tesseract\/(worker\.min\.js|tesseract-core[^/]*\.js|eng\.traineddata\.gz))$/.test(p);
const fresh = u => new Request(u, { cache: 'reload' });
async function keep(c, u, must) {
  if (await c.match(u)) return;
  try { const r = await fetch(fresh(u)); if (!r.ok) throw new Error(r.status); await c.put(u, r); } catch (e) { if (must) throw e; }
}
self.addEventListener('install', e => e.waitUntil((async () => {
  const c = await caches.open(V), a = await caches.open(A);
  await Promise.all(CORE.map(async u => { const r = await fetch(fresh(u)); if (!r.ok) throw new Error(u); await c.put(u, r); }));
  await Promise.all(BIG.map(u => keep(a, u, true)));
  await Promise.all(OCR.map(u => keep(a, u, false)));
  self.skipWaiting();
})()));
self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== V && k !== A && k !== 'pq-tiles') await caches.delete(k);
  const a = await caches.open(A);
  for (const r of await a.keys()) { const p = new URL(r.url).pathname; if (/vault-[0-9a-f]+\.bin$/.test(p) && !p.endsWith('/' + VAULT)) await a.delete(r); }
  await self.clients.claim();
})()));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (u.hostname.endsWith('tile.openstreetmap.org')) {
    e.respondWith(caches.open('pq-tiles').then(async c => (await c.match(e.request)) || fetch(e.request).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; })));
    return;
  }
  if (u.origin !== location.origin) return;
  if (isAsset(u.pathname)) {
    e.respondWith(caches.open(A).then(async c => (await c.match(e.request, { ignoreSearch: true })) || fetch(e.request).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; })));
    return;
  }
  e.respondWith(caches.open(V).then(async c => {
    const hit = (await c.match(e.request, { ignoreSearch: true })) || (e.request.mode === 'navigate' ? (await c.match('./')) || (await c.match('index.html')) : null);
    const net = fetch(e.request).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; }).catch(() => hit || Response.error());
    return hit || net;
  }));
});
self.addEventListener('notificationclick', e => { e.notification.close(); e.waitUntil(self.clients.matchAll({ type: 'window' }).then(l => l[0] ? l[0].focus() : self.clients.openWindow('./'))); });
