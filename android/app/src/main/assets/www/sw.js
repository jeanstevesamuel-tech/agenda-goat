// Service Worker : install, activate, fetch, notificationclick, message.
const VERSION = '2.1.9'; // doit rester identique à APP_VERSION (js/constants.js) : vérifié par les tests
const CACHE = `agenda-etoile-static-${VERSION}`;
const ASSETS = [
  './', 'index.html', 'manifest.webmanifest',
  'css/base.css', 'css/components.css', 'css/calendar.css', 'css/tasks.css', 'css/modal.css', 'css/responsive.css',
  'js/boot.js', 'js/app.js', 'js/state.js', 'js/storage.js', 'js/tasks.js', 'js/calendar.js', 'js/notifications.js', 'js/native.js',
  'js/reminders.js', 'js/ui.js', 'js/audio.js', 'js/validation.js', 'js/statistics.js', 'js/utils.js', 'js/constants.js', 'js/strings.fr.js',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/icon-monochrome.svg'
];
const PATHS = new Set(ASSETS.map(a => new URL(a, self.registration.scope).pathname));

self.addEventListener('install', e => {
  // Pas de skipWaiting automatique : l'utilisateur choisit quand mettre à jour.
  // cache: 'reload' : fichiers pris sur le serveur, jamais dans le cache HTTP (qui peut garder d'anciens fichiers ~10 min après un déploiement).
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS.map(a => new Request(a, { cache: 'reload' })))));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('agenda-etoile-static-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Pages : réseau d'abord, puis copie locale hors connexion.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(res => {
        if (res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(CACHE).then(c => c.put('index.html', copy)); }
        return res;
      }).catch(() => caches.match('index.html'))
    );
    return;
  }
  // Ressources de l'appli : cache d'abord, mise à jour en arrière-plan.
  if (!PATHS.has(url.pathname)) return;
  e.respondWith(
    caches.match(req).then(cached => {
      const fresh = fetch(req).then(res => {
        if (res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
        return res;
      }).catch(() => cached);
      return cached || fresh;
    })
  );
});

self.addEventListener('message', e => {
  const d = e.data || {};
  if (d.type === 'SKIP_WAITING') self.skipWaiting();
  if (d.type === 'GET_VERSION' && e.source) e.source.postMessage({ type: 'version', version: VERSION });
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const taskId = e.notification.data && e.notification.data.taskId;
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if ('focus' in c) { c.postMessage({ type: 'open-task', taskId }); return c.focus(); }
      }
      return self.clients.openWindow(taskId ? `./?task=${encodeURIComponent(taskId)}` : './');
    })
  );
});
