// Cadence PWA Service Worker — Network-First + Now Playing Notification Controls
const CACHE_NAME = 'cadence-runtime-v6';
const NOW_PLAYING_TAG = 'cadence-now-playing';

let lastNotificationPayload = null;

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Remove any stale workbox precaches that could trap the installed PWA on an old bundle
      const keys = await caches.keys();
      let hadStaleCache = false;
      await Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            hadStaleCache = true;
            return caches.delete(key);
          }
          return Promise.resolve();
        })
      );
      await self.clients.claim();

      // If an old Workbox cache was cleared, refresh open PWA windows so they run the latest player
      if (hadStaleCache) {
        const windowClients = await self.clients.matchAll({ type: 'window' });
        for (const client of windowClients) {
          if ('navigate' in client) {
            client.navigate(client.url).catch(() => {});
          }
        }
      }
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Never intercept API calls, SW script, APK downloads, or audio streams
  if (
    url.pathname === '/sw.js' ||
    url.pathname.startsWith('/api/') ||
    url.pathname.endsWith('.apk') ||
    url.pathname.startsWith('/download/') ||
    url.hostname.includes('saavncdn.com') ||
    url.hostname.includes('youtube.com') ||
    url.hostname.includes('googlevideo.com')
  ) {
    return;
  }

  // Network-first for HTML and JS/CSS so the installed PWA always runs the latest player code
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.status === 200 && url.origin === self.location.origin) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone)).catch(() => {});
        }
        return res;
      })
      .catch(async () => {
        const cached = await caches.match(req);
        if (cached) return cached;
        return fetch(req);
      })
  );
});

async function renderNowPlayingNotification(payload) {
  if (!payload || !self.registration || !self.registration.showNotification) return;
  lastNotificationPayload = payload;

  const title = payload.title || 'Cadence';
  const artist = payload.artist || 'Unknown Artist';
  const album = payload.album || 'Cadence';
  const playing = Boolean(payload.playing);
  const icon = payload.icon || '/pwa-512x512.png';

  const options = {
    body: `${artist} • ${album}`,
    icon,
    badge: '/pwa-192x192.png',
    tag: NOW_PLAYING_TAG,
    silent: true,
    renotify: false,
    requireInteraction: playing,
    data: {
      trackId: payload.trackId || '',
      playing,
    },
    actions: [
      { action: 'prev', title: '⏮ Prev' },
      { action: 'toggle', title: playing ? '⏸ Pause' : '▶ Play' },
      { action: 'next', title: '⏭ Next' },
    ],
  };

  try {
    await self.registration.showNotification(title, options);
  } catch {
    // Fallback without action buttons if platform restricts actions count
    try {
      await self.registration.showNotification(title, {
        body: `${artist} • ${album}`,
        icon,
        badge: '/pwa-192x192.png',
        tag: NOW_PLAYING_TAG,
        silent: true,
      });
    } catch {
      // ignore
    }
  }
}

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || typeof data !== 'object') return;

  if (data.type === 'CADENCE_SYNC_NOTIFICATION') {
    event.waitUntil(renderNowPlayingNotification(data.payload));
  } else if (data.type === 'CADENCE_CLEAR_NOTIFICATION') {
    event.waitUntil(
      (async () => {
        if (!self.registration || !self.registration.getNotifications) return;
        const list = await self.registration.getNotifications({ tag: NOW_PLAYING_TAG });
        for (const n of list) {
          n.close();
        }
      })()
    );
  }
});

self.addEventListener('notificationclick', (event) => {
  const action = event.action;

  if (action === 'prev' || action === 'toggle' || action === 'next') {
    event.waitUntil(
      (async () => {
        const clientList = await self.clients.matchAll({
          type: 'window',
          includeUncontrolled: true,
        });
        for (const client of clientList) {
          client.postMessage({
            type: 'CADENCE_SW_ACTION',
            action,
          });
        }
        if (action === 'toggle' && lastNotificationPayload) {
          await renderNowPlayingNotification({
            ...lastNotificationPayload,
            playing: !lastNotificationPayload.playing,
          });
        }
      })()
    );
    return;
  }

  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow('/');
      }
    })
  );
});
