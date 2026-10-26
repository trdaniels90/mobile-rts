// Offline support. Network first, so a new version is picked up on the next load;
// the cache is only used when there is no connection.
const CACHE = 'red-horizon-v2';
const FILES = ['./', 'index.html', 'style.css', 'src/data.js', 'src/voxel.js', 'src/models.js', 'src/art.js', 'src/world.js', 'src/ai.js', 'src/voices.js', 'src/sfx.js', 'src/music.js', 'src/audio.js', 'src/manual.js', 'src/ui.js',
  'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); } return res; })
      .catch(() => caches.match(e.request))
  );
});
