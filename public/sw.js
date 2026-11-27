// sw.js
// Asset-free service worker for js-hack-arena.

const SW_VERSION = 'arena-sw-2026-11-27-2';
const SHELL_CACHE = `shell-${SW_VERSION}`;
const RUNTIME_CACHE = `runtime-${SW_VERSION}`;
const APP_SHELL = ['./', './index.html'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await cache.addAll(APP_SHELL);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((k) => (k.startsWith('shell-arena-sw-') && k !== SHELL_CACHE)
          || (k.startsWith('runtime-arena-sw-') && k !== RUNTIME_CACHE))
        .map((k) => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (!isSameOrigin(url)) return;

  // Let the network handle routes that depend on a signed-in session.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/ws/') || url.pathname.startsWith('/auth/')
      || url.pathname.startsWith('/tools/dungeon-editor/')) {
    return;
  }

  // Navigation: network first, fallback to shell cache.
  if (req.mode === 'navigate') {
    // The preview and game use different documents, including in offline mode.
    const isPreview = url.pathname === '/interface-preview/' || url.pathname === '/interface-preview/index.html';
    if (!isPreview && url.pathname !== '/' && url.pathname !== '/index.html') return;
    const shellUrl = isPreview ? './interface-preview/' : './index.html';
    event.respondWith((async () => {
      try {
        const network = await fetch(req, { cache: 'reload' });
        if (network.ok) {
          const cache = await caches.open(SHELL_CACHE);
          await cache.put(shellUrl, network.clone()).catch(() => {});
        }
        return network;
      } catch {
        const cache = await caches.open(SHELL_CACHE);
        const cached = await cache.match(shellUrl);
        if (cached) return cached;
        return Response.error();
      }
    })());
    return;
  }

  // Revalidate scripts independently of the browser's HTTP cache. The runtime
  // cache is an offline fallback for the same URL.
  event.respondWith((async () => {
    const cache = await caches.open(RUNTIME_CACHE);
    try {
      const network = req.destination === 'script' ? await fetch(req, { cache: 'reload' }) : await fetch(req);
      if (network.ok) await cache.put(req, network.clone()).catch(() => {});
      return network;
    } catch {
      const cached = await cache.match(req);
      if (cached) return cached;
    }

    return Response.error();
  })());
});
