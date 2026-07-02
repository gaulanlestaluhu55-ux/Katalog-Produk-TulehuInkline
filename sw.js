/* Service worker minimal — cuma buat memenuhi syarat installability Chrome.
   Sengaja gak nyimpen cache apa-apa, biar data admin selalu fresh dari server,
   gak ada resiko nampilin data produk yang basi. */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
