/* KebunRakyat SPMS — Service Worker (offline shell + cache tile peta yang pernah dibuka) */
var VERSION = 'spms-demo-1.2.0';
var SHELL = VERSION + '-shell', CDN = VERSION + '-cdn', TILES = 'spms-tiles';
var SHELL_FILES = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];
// Versi demo: berkas tambahan (app.html, backend.js) ikut di-cache bila ada
var OPTIONAL_FILES = ['./app.html', './backend.js'];
var CDN_FILES = ['https://unpkg.com/leaflet@1.9.4/dist/leaflet.js', 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css', 'https://unpkg.com/pmtiles@4.5.0/dist/pmtiles.js'];
// Esri TIDAK di-cache (ketentuan Esri melarang penyimpanan tile untuk offline)
var TILE_HOSTS = ['tile.openstreetmap.org', 'tile.opentopomap.org'];
var MAX_TILES = 2500; // hanya tile yang pernah dilihat pengguna (bukan unduhan massal — sesuai kebijakan tile OSM)

self.addEventListener('install', function (e) {
  e.waitUntil(Promise.all([
    caches.open(SHELL).then(function (c) { return c.addAll(SHELL_FILES).then(function () { return Promise.all(OPTIONAL_FILES.map(function (u) { return fetch(u).then(function (r) { if (r.ok) return c.put(u, r); }).catch(function () {}); })); }); }),
    caches.open(CDN).then(function (c) { return Promise.all(CDN_FILES.map(function (u) { return fetch(u, { mode: 'cors' }).then(function (r) { if (r.ok) return c.put(u, r); }).catch(function () {}); })); })
  ]).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) { return Promise.all(keys.filter(function (k) { return k.indexOf(VERSION) !== 0 && k !== TILES; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); }));
});
function trimTiles() {
  return caches.open(TILES).then(function (c) { return c.keys().then(function (k) { if (k.length > MAX_TILES) return Promise.all(k.slice(0, k.length - MAX_TILES).map(function (r) { return c.delete(r); })); }); });
}
self.addEventListener('fetch', function (e) {
  var req = e.request; if (req.method !== 'GET') return;
  // permintaan Range (PMTiles online) & file .pmtiles tidak di-cache: langsung ke jaringan
  if (req.headers.get('range') || /\.pmtiles(\?|$)/i.test(req.url)) return;
  var url = new URL(req.url);
  // Apps Script & Google: selalu jaringan (data harus segar, sesi aman)
  if (/(^|\.)google\.com$|googleusercontent\.com$|googleapis\.com$/.test(url.hostname) && url.hostname !== 'fonts.googleapis.com') return;
  if (TILE_HOSTS.some(function (h) { return url.hostname.indexOf(h) >= 0; })) {
    e.respondWith(caches.open(TILES).then(function (c) { return c.match(req).then(function (hit) {
      if (hit) return hit;
      return fetch(req).then(function (r) { if (r.ok || r.type === 'opaque') { c.put(req, r.clone()); trimTiles(); } return r; }).catch(function () { return new Response('', { status: 504 }); });
    }); }));
    return;
  }
  if (url.origin !== location.origin) { // CDN: stale-while-revalidate
    e.respondWith(caches.open(CDN).then(function (c) { return c.match(req).then(function (hit) {
      var net = fetch(req).then(function (r) { if (r.ok) c.put(req, r.clone()); return r; }).catch(function () { return hit; });
      return hit || net;
    }); }));
    return;
  }
  if (req.mode === 'navigate') { // network-first untuk halaman
    e.respondWith(fetch(req).then(function (r) { var cp = r.clone(); caches.open(SHELL).then(function (c) { c.put('./index.html', cp); }); return r; })
      .catch(function () { return caches.match('./index.html'); }));
    return;
  }
  e.respondWith(caches.match(req).then(function (hit) { return hit || fetch(req).then(function (r) { if (r.ok) { var cp = r.clone(); caches.open(SHELL).then(function (c) { c.put(req, cp); }); } return r; }); }));
});
self.addEventListener('message', function (e) { if (e.data === 'skipWaiting') self.skipWaiting(); });
