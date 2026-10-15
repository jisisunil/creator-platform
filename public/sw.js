// NFR-5 / NFR-6: when the network drops, page loads show a friendly offline page instead
// of the browser's error. Only the offline pages are cached, so signed-in pages and
// personal data never sit in the browser's cache. Bump CACHE_NAME when they change.
const CACHE_NAME = 'offline-v1';
const OFFLINE_PAGES = { en: '/en/offline', hi: '/hi/offline' };

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        // Without cookies, so the cached page never shows who was signed in.
        cache.addAll(
          Object.values(OFFLINE_PAGES).map((path) => new Request(path, { credentials: 'omit' })),
        ),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return;
  event.respondWith(
    fetch(event.request).catch(async () => {
      const locale = new URL(event.request.url).pathname.split('/')[1] ?? '';
      const offlinePage = OFFLINE_PAGES[locale] ?? OFFLINE_PAGES.en;
      return (await caches.match(offlinePage)) ?? Response.error();
    }),
  );
});
