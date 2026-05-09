// Required for Android Chrome "Add to Home Screen" prompt
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  if (!event.data) return;

  try {
    const payload = event.data.json();
    const { title, body, icon, data } = payload;

    event.waitUntil(
      self.registration.showNotification(title, {
        body,
        icon: icon || '/favicon.svg',
        badge: '/marker-icon.png',
        data,
        vibrate: [200, 100, 200],
        requireInteraction: false,
        actions: [
          { action: 'open', title: '查看' },
          { action: 'close', title: '关闭' },
        ],
      })
    );
  } catch {
    // Fallback: show raw text
    event.waitUntil(
      self.registration.showNotification('Bliver 新消息', {
        body: event.data.text(),
        icon: '/marker-icon.png',
      })
    );
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Try to focus an existing window
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise open a new window
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
