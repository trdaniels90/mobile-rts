// Offline support and updates. Network first (always asking the server whether a file changed),
// so a new version is picked up as soon as the game is next loaded; the cache is only used when
// there is no connection. Each version keeps its own cache, and older ones are cleared out.
importScripts('src/version.js');
const CACHE = 'red-horizon-' + VERSION;
// The soundtrack is big, so it is fetched in the background after install (never blocking an update).
const TRACKS = ['music/industry.mp3', 'music/war.mp3', 'music/smash.mp3', 'music/rain.mp3', 'music/airstrike.mp3', 'music/roll.mp3'];
const FILES = ['./', 'index.html', 'style.css', 'src/version.js', 'src/data.js', 'src/maps.js', 'src/voxel.js', 'src/models.js', 'src/art.js', 'src/world.js', 'src/ai.js', 'src/voices.js', 'src/sfx.js', 'src/music.js', 'src/audio.js', 'src/manual.js', 'src/debrief.js', 'src/report.js', 'src/profile.js', 'src/netcore.js', 'src/net.js', 'src/save.js', 'src/ui.js',
  'manifest.webmanifest', 'maps/bridge.png', 'maps/river.png', 'art/htank/hull.png', 'art/htank/turret.png', 'art/htank/shadow.png', 'icons/icon.svg', 'icons/icon-192.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  caches.open(CACHE).then((c) => TRACKS.reduce((p, t) => p.then(() => c.match(t).then((hit) => hit || c.add(t))).catch(() => {}), Promise.resolve()));
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
