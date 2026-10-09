// Service worker para sa phone push notifications. Ipinapakita ang ipinadala
// ng Worker (cron) kahit sarado ang Tanaydana, at binubuksan ang tamang page
// kapag pinindot.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { title: 'Tanaydana', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Tanaydana', {
    body: d.body || '',
    icon: 'img/forgefolio-logo.png',
    badge: 'img/forgefolio-logo.png',
    tag: d.tag || undefined,
    data: { url: d.url || 'dashboard.html' }
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL(e.notification.data && e.notification.data.url || 'dashboard.html', self.location.origin).href;
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = all.find(c => c.url.includes('/dashboard.html'));
    if (open) { await open.focus(); open.postMessage({ type: 'open', url }); return; }
    await self.clients.openWindow(url);
  })());
});
