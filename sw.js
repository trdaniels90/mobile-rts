// Offline support and updates. Network first (always asking the server whether a file changed),
// so a new version is picked up as soon as the game is next loaded; the cache is only used when
// there is no connection. Each version keeps its own cache, and older ones are cleared out.
importScripts('src/version.js');
const CACHE = 'red-horizon-' + VERSION;
const FILES = ['./', 'index.html', 'style.css', 'src/version.js', 'src/data.js', 'src/voxel.js', 'src/models.js', 'src/art.js', 'src/world.js', 'src/ai.js', 'src/voices.js', 'src/sfx.js', 'src/music.js', 'src/audio.js', 'src/manual.js', 'src/ui.js',
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
    fetch(e.request.url, { cache: 'no-cache' })   // revalidate: GitHub Pages lets browsers keep files for 10 minutes
      .then((res) => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); } return res; })
      .catch(() => caches.match(e.request))
  );
});
