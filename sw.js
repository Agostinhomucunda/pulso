const CACHE_NAME = 'pulso-shell-v5';
const SCOPE_URL = new URL(self.registration.scope);
const CORE_FILES = [
  'index.html',
  'dashboard.html',
  'empresas-parceiros.html',
  'offline.html',
  'manifest.webmanifest',
  'pwa.css',
  'pwa.js',
  'styles.css',
  'dashboard.css',
  'automation.css',
  'account-type-choice.css',
  'whatsapp-alerts.css',
  'whatsapp-alerts-home.css',
  'app.js',
  'dashboard.js',
  'empresas-parceiros.js',
  'account-type-choice.js',
  'whatsapp-alerts.js',
  'supabase-config.js',
  'assets/pwa-icon-192.png',
  'assets/pwa-icon-512.png',
  'assets/pulso-mark-3d-small.png',
  'assets/luanda-hero.jpg'
];
const PAGE_FILES = new Set([
  'index.html',
  'dashboard.html',
  'empresas-parceiros.html',
  'offline.html'
]);
const STATIC_EXTENSIONS = new Set([
  '.css', '.js', '.png', '.jpg', '.jpeg', '.webp', '.svg', '.webm', '.ico', '.webmanifest'
]);

function cacheKey(url) {
  const key = new URL(url.href);
  key.search = '';
  key.hash = '';
  return new Request(key.href, { method: 'GET' });
}

function relativePath(url) {
  if (!url.pathname.startsWith(SCOPE_URL.pathname)) return null;
  return decodeURIComponent(url.pathname.slice(SCOPE_URL.pathname.length));
}

function isSameOriginStatic(url) {
  if (url.origin !== self.location.origin) return false;
  const path = relativePath(url);
  if (path === null) return false;
  if (PAGE_FILES.has(path)) return true;
  const extension = path.slice(path.lastIndexOf('.')).toLowerCase();
  return STATIC_EXTENSIONS.has(extension);
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(CORE_FILES.map(path => new URL(path, SCOPE_URL).href));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith('pulso-shell-') && name !== CACHE_NAME).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Connectivity probes must bypass all caches to check the real site connection.
  if (url.searchParams.has('__pwa_check')) {
    event.respondWith(fetch(request));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const response = await fetch(request);
        if (response.ok && !url.search) await cache.put(cacheKey(url), response.clone());
        return response;
      } catch {
        const cachedPage = await cache.match(cacheKey(url));
        if (cachedPage) return cachedPage;
        const offlinePage = await cache.match(new URL('offline.html', SCOPE_URL).href);
        return offlinePage || Response.error();
      }
    })());
    return;
  }

  if (!isSameOriginStatic(url)) return;
  const key = cacheKey(url);
  const cachePromise = caches.open(CACHE_NAME);
  const cachedPromise = cachePromise.then(cache => cache.match(key));
  const networkUpdate = fetch(request).then(async response => {
    if (response.ok && response.type === 'basic') {
      const cache = await cachePromise;
      await cache.put(key, response.clone());
    }
    return response;
  }).catch(() => null);
  event.waitUntil(networkUpdate.then(() => undefined));
  event.respondWith(cachedPromise.then(cached => cached || networkUpdate).then(response => response || Response.error()));
});
