/* 光のグラデーション・タイムライン：サービスワーカー
   目的は「一度開いた端末ならオフラインでも起動できる」ことだけ。
   ・自サイトのファイルはネットワーク優先（公開版の更新をすぐ反映）、届かないときだけキャッシュ。
     ブラウザの HTTP キャッシュも毎回サーバーに確かめる（no-cache）。親ページと枠（iframe）で版が食い違わないように
   ・外部のライブラリは使っていない（すべて index.html の中） */
const CACHE = 'lgt-v3';
const SHELL = ['./', './index.html', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', './icons/apple-touch-icon.png'];

self.addEventListener('install', function (ev) {
  ev.waitUntil(caches.open(CACHE).then(function (c) {
    return c.addAll(SHELL);
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

  if (new URL(req.url).origin !== self.location.origin) { return; }

  // ナビゲーション（親ページ・枠の iframe）は Request を作り直せないので URL で取り直す
  const fresh = (req.mode === 'navigate')
    ? fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' })
    : fetch(new Request(req, { cache: 'no-cache' }));
  ev.respondWith(fresh.then(function (r) {
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
