self.addEventListener('push', (event) => {
  const data = event.data?.json() || {};
  event.waitUntil(
    self.registration.showNotification(data.title || 'OfferCity', {
      body: data.body || 'New offer available!',
      icon: data.icon || '/favicon.ico',
      badge: '/favicon.ico',
      data: { url: data.url || '/' },
      vibrate: [200, 100, 200],
      requireInteraction: false
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(wins => {
      const url = event.notification.data?.url || '/';
      for (const win of wins) {
        if (win.url.includes(url) && 'focus' in win) return win.focus();
      }
      return clients.openWindow(url);
    })
  );
});
