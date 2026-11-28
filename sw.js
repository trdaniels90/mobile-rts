// Offline support and updates. Network first (always asking the server whether a file changed),
// so a new version is picked up as soon as the game is next loaded; the cache is only used when
// there is no connection. Each version keeps its own cache, and older ones are cleared out.
importScripts('src/version.js');
const CACHE = 'red-horizon-' + VERSION;
// The soundtrack is big, so it is fetched in the background after install (never blocking an update).
// The baked sprites (models.js SpriteSheets): the main colours and wrecks with the music; teammate colours are kept when first used.
// The baked ground (art.js GroundSheets): the manifest and previews here; a map's sheets are kept as a battle loads them.
// The baked crags (look.js CliffSheets): the manifest here; a map's sheets are kept as a battle loads them.
const ART = ['grounds/manifest.json', 'cliffs/manifest.json', 'grounds/river/preview.webp', 'grounds/snowbound/preview.webp', 'grounds/lakes/preview.webp', 'grounds/twinlakes/preview.webp', 'grounds/village/preview.webp', 'grounds/city/preview.webp', 'grounds/frost/preview.webp', 'grounds/marsh/preview.webp', 'grounds/berlin/preview.webp', 'grounds/isles/preview.webp', 'sprites/manifest.json', 'sprites/allies0.webp', 'sprites/soviets0.webp', 'sprites/burnt.webp', 'normals/manifest.json', 'normals/allies0.webp', 'normals/soviets0.webp', 'normals/burnt.webp'];
const TRACKS = [];   // the soundtrack was removed (2026-11-25)
const FILES = ['./', 'index.html', 'style.css', 'src/version.js', 'src/data.js', 'src/maps.js', 'src/voxel.js', 'src/models.js', 'src/art.js', 'src/look.js', 'src/lookfx.js', 'src/gl.js', 'src/lookstorm.js', 'src/lookstructs.js', 'src/world.js', 'src/ai.js', 'src/voices.js', 'src/sfx.js', 'src/music.js', 'src/audio.js', 'src/manual.js', 'src/debrief.js', 'src/report.js', 'src/profile.js', 'src/netcore.js', 'src/net.js', 'src/chat.js', 'src/save.js', 'src/editor.js', 'src/ui.js',
  'manifest.webmanifest', 'maps/bridge.png', 'maps/river.png', 'maps/snowbound.png', 'maps/lakes.png', 'maps/twinlakes.png', 'maps/village.png', 'maps/city.png', 'maps/frost.png', 'maps/marsh.png', 'maps/berlin.png', 'maps/isles.png', 'icons/icon.svg', 'icons/icon-192.png', 'icons/apple-touch-icon.png', 'images/loading.jpg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  caches.open(CACHE).then((c) => ART.concat(TRACKS).reduce((p, t) => p.then(() => c.match(t).then((hit) => hit || c.add(t))).catch(() => {}), Promise.resolve()));
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request.url, { cache: 'no-cache' })   // revalidate: GitHub Pages lets browsers keep files for 10 minutes
      .then((res) => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); } return res; })
      .catch(() => caches.match(e.request).then((hit) => hit || caches.match(e.request, { ignoreSearch: true })))   // (sheets are asked for with their bake's hash: ?h=)
  );
});
