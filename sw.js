const CACHE_NAME = 'pulso-shell-v14';
const SCOPE_URL = new URL(self.registration.scope);
const CORE_FILES = [
  'index.html',
  'dashboard.html',
  'empresas-parceiros.html',
  'offline.html',
  'manifest.webmanifest',
  'pwa.css',
  'pwa.js',
  'push-config.js',
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
  'organizational-dashboard.js',
  'organizational-dashboard.css',
  'parceiro-dashboard.html',
  'empresa-dashboard.html',
  'supabase-config.js',
  'assets/pwa-icon-192-v2.png',
  'assets/pwa-icon-512-v2.png',
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
    // Ignore the browser HTTP cache so a new app shell cannot reinstall stale files.
    const coreRequests = CORE_FILES.map(path => new Request(new URL(path, SCOPE_URL), { cache: 'reload' }));
    await cache.addAll(coreRequests);
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

  // Pedidos Range são usados por vídeos e não podem ser guardados como recursos completos.
  if (request.headers.has('range')) {
    event.respondWith(fetch(request));
    return;
  }

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

self.addEventListener('push', event => {
  event.waitUntil((async () => {
    let payload = {};
    try { payload = event.data?.json() || {}; } catch { /* Push vazio ou malformado. */ }
    const title = String(payload.title || 'PULSO').slice(0, 100);
    const body = String(payload.body || 'Tens uma nova actualização no PULSO.').slice(0, 500);
    const fallbackIcon = new URL('assets/pwa-icon-192-v2.png', SCOPE_URL).href;
    const internalAsset = value => {
      try {
        const url = new URL(String(value || ''), SCOPE_URL);
        return url.origin === self.location.origin && url.pathname.startsWith(SCOPE_URL.pathname)
          ? url.href : fallbackIcon;
      } catch { return fallbackIcon; }
    };
    await self.registration.showNotification(title, {
      body,
      icon: internalAsset(payload.icon),
      badge: internalAsset(payload.badge),
      tag: String(payload.tag || 'pulso-system-notification').slice(0, 80),
      renotify: false,
      data: { url: String(payload.url || 'dashboard.html#notifications') },
    });
  })());
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    let target;
    try { target = new URL(event.notification.data?.url || 'dashboard.html#notifications', SCOPE_URL); }
    catch { target = new URL('dashboard.html#notifications', SCOPE_URL); }
    if (target.origin !== self.location.origin || !target.pathname.startsWith(SCOPE_URL.pathname)) {
      target = new URL('dashboard.html#notifications', SCOPE_URL);
    }
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      try {
        const clientUrl = new URL(client.url);
        if (clientUrl.origin === target.origin && clientUrl.pathname.startsWith(SCOPE_URL.pathname)) {
          await client.navigate(target.href);
          return client.focus();
        }
      } catch { /* Ignorar uma janela que já tenha sido fechada. */ }
    }
    return self.clients.openWindow(target.href);
  })());
});
