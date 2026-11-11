/* 光のグラデーション・タイムライン：サービスワーカー
   目的は「一度開いた端末ならオフラインでも起動できる」ことだけ。
   ・自サイトのファイルはネットワーク優先（公開版の更新をすぐ反映）、届かないときだけキャッシュ
   ・p5.js（版番号つきCDN）は中身が変わらないのでキャッシュ優先 */
const CACHE = 'lgt-v1';
const P5 = 'https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.9.4/p5.min.js';
const SHELL = ['./', './index.html', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', './icons/apple-touch-icon.png'];

self.addEventListener('install', function (ev) {
  ev.waitUntil(caches.open(CACHE).then(function (c) {
    return c.addAll(SHELL).then(function () {
      // p5 は <script> と同じ no-cors で取得して保存（失敗しても初回表示時に保存される）
      return fetch(new Request(P5, { mode: 'no-cors' }))
        .then(function (r) { return c.put(P5, r); }).catch(function () {});
    });
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (ev) {
  ev.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; })
      .map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (ev) {
  const req = ev.request;
  if (req.method !== 'GET') { return; }

  if (req.url === P5) {
    ev.respondWith(caches.match(P5).then(function (hit) {
      return hit || fetch(req).then(function (r) {
        const copy = r.clone();
        caches.open(CACHE).then(function (c) { c.put(P5, copy); });
        return r;
      });
    }));
    return;
  }

  if (new URL(req.url).origin !== self.location.origin) { return; }

  ev.respondWith(fetch(req).then(function (r) {
    if (r.ok) {
      const copy = r.clone();
      caches.open(CACHE).then(function (c) { c.put(req, copy); });
    }
    return r;
  }).catch(function () {
    return caches.match(req, { ignoreSearch: true }).then(function (hit) {
      if (hit) { return hit; }
      if (req.mode === 'navigate') { return caches.match('./index.html'); }
      return Response.error();
    });
  }));
});
