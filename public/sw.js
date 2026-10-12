const CACHE = 'changban-v2';
const urlsToCache = ['/', '/manifest.json', '/css/style.css', '/js/app.js?v=3'];

self.addEventListener('install', (e) => {
  // 删除旧缓存，强制更新
  self.skipWaiting();
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))))
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(clients.claim());
});

self.addEventListener('fetch', (e) => {
  // 不从缓存读取，直接走网络
  e.respondWith(fetch(e.request));
});
