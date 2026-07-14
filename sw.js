const CACHE = 'tulehu-v4';

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/admin.html',
  '/dashboard.html',
  '/pesanan.html',
  '/keuangan.html',
  '/stok.html',
  '/vendor.html',
  '/css/style.css',
  '/css/admin.css',
  '/js/config.js',
  '/js/helpers.js',
  '/js/admin-core.js',
  '/js/main.js',
  '/js/state.js',
  '/js/render.js',
  '/js/collapse.js',
  '/js/gallery.js',
  '/js/events.js',
  '/js/filter.js',
  '/js/data.js',
  '/js/whatsapp.js',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => {
      return cache.addAll(PRECACHE_URLS);
    }).catch(() => {
      // Precache failure is non-fatal
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // API calls — always network
  if (url.pathname.startsWith('/api/') || url.hostname.includes('vercel')) {
    event.respondWith(fetch(request).catch(() => new Response(JSON.stringify({ status: 'error', message: 'offline' }), { status: 503, headers: { 'Content-Type': 'application/json' } })));
    return;
  }

  // CDN fonts / Chart.js — cache-first
  if (url.hostname.includes('googleapis') || url.hostname.includes('gstatic') || url.hostname.includes('jsdelivr')) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(request, copy));
        return res;
      }))
    );
    return;
  }

  // HTML pages — network-first
  if (url.pathname.endsWith('.html') || url.pathname === '/' || url.pathname.endsWith('manifest.json')) {
    event.respondWith(
      fetch(request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(request, copy));
        return res;
      }).catch(() => caches.match(request).then((cached) => cached || new Response('Offline', { status: 503 })))
    );
    return;
  }

  // Static assets (JS, CSS, images, fonts) — cache-first
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(request, copy));
        return res;
      });
    }).catch(() => new Response('Offline', { status: 503 }))
  );
});
