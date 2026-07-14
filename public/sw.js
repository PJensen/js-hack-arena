// sw.js
// Asset-free service worker for js-hack-arena.

const SW_VERSION = 'arena-sw-2026-07-13-1';
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
        .filter((k) => k !== SHELL_CACHE && k !== RUNTIME_CACHE)
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

  // Never cache API-like routes if introduced later.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/ws/')) {
    return;
  }

  // Navigation: network first, fallback to shell cache.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const network = await fetch(req);
        const cache = await caches.open(SHELL_CACHE);
        cache.put('./index.html', network.clone());
        return network;
      } catch {
        const cache = await caches.open(SHELL_CACHE);
        const cached = await cache.match('./index.html');
        if (cached) return cached;
        return Response.error();
      }
    })());
    return;
  }

  // Same-origin runtime requests: network first so a room never mixes module
  // generations across tabs. The cache remains an offline fallback.
  event.respondWith((async () => {
    const cache = await caches.open(RUNTIME_CACHE);
    try {
      const network = await fetch(req);
      if (network && network.ok) cache.put(req, network.clone());
      return network;
    } catch {
      const cached = await cache.match(req);
      if (cached) return cached;
    }

    const shell = await caches.open(SHELL_CACHE);
    return (await shell.match('./index.html')) || Response.error();
  })());
});
