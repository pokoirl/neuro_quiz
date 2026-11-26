// Offline cache. With signal: the app's code and page come fresh from the site (latest version at once);
// without signal: everything comes from the copy on the phone. data.js (14 MB figures) is only re-downloaded when CACHE changes.
const CACHE = 'neuroquiz-1.5';
const FILES = ['./', 'index.html', 'app.js', 'data.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];
self.addEventListener('install', e => {
  // cache:'reload' skips the browser's own short-term cache, so a new version never stores old files
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(FILES.map(f => fetch(new Request(f, { cache: 'reload' })).then(r => { if (!r.ok) throw new Error(f); return c.put(f, r); })))));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('neuroquiz-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
const FRESH = /\/(index\.html|app\.js|manifest\.webmanifest)?$/;   // small files: network first
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin && (req.mode === 'navigate' || FRESH.test(url.pathname))) {
    e.respondWith(Promise.race([
      fetch(req, { cache: 'no-cache' }).then(r => { if (r.ok) { const cp = r.clone(); caches.open(CACHE).then(c => c.put(req, cp)); } return r; }),
      new Promise((_, no) => setTimeout(no, 4000))                // weak signal: don't wait more than 4 s
    ]).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(r => r || fetch(req)));
});
