'use strict';
// Runs the game's simulation in Node, without a browser: the scripts in src/ are loaded into one
// shared context, as index.html loads them, with stand-ins for the canvas and the page. Nothing is
// drawn; the ground and decal canvases swallow every call.
const fs = require('fs'), path = require('path'), vm = require('vm');
const SRC = path.join(__dirname, '..', 'src');
// The scripts the battle needs. The drawing scripts are loaded too, because the simulation calls
// a few of their helpers (decals, the ground picture); their canvases are stubs.
const SCRIPTS = ['version.js', 'data.js', 'maps.js', 'voxel.js', 'models.js', 'art.js', 'world.js', 'ai.js', 'netcore.js'];

function stubCtx() {
  const img = (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(Math.max(4, (w | 0) * (h | 0) * 4)) });
  const t = {};
  return new Proxy(t, {
    get(o, k) {
      if (k in o) return o[k];
      if (k === 'getImageData' || k === 'createImageData') return (a, b, w, h) => (typeof a === 'object' ? img(a.width, a.height) : img(w === undefined ? a : w, h === undefined ? b : h));
      if (k === 'measureText') return () => ({ width: 0 });
      if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern') return () => ({ addColorStop() {} });
      if (k === 'canvas') return null;
      return () => {};
    },
    set(o, k, v) { o[k] = v; return true; },
  });
}
function stubCanvas() {
  const c = { width: 1, height: 1, style: {}, getContext() { return c._ctx || (c._ctx = stubCtx()); }, toDataURL() { return ''; }, addEventListener() {} };
  return c;
}
function stubEl() {
  const el = { style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } }, children: [],
    appendChild(x) { return x; }, append() {}, prepend() {}, remove() {}, addEventListener() {}, removeEventListener() {}, setAttribute() {}, getAttribute() { return null; },
    querySelector() { return stubEl(); }, querySelectorAll() { return []; }, innerHTML: '', textContent: '', hidden: true };
  return el;
}

function load(opts = {}) {
  const ctx = {
    console, Math, Date, JSON, Map, Set, WeakMap, Promise, Uint8Array, Uint16Array, Int32Array, Int16Array, Uint32Array, Float32Array, Float64Array, Uint8ClampedArray, ArrayBuffer,
    setTimeout, clearTimeout, setInterval, clearInterval, performance: require('perf_hooks').performance,
    HEADLESS: true,
    document: { createElement: (t) => (t === 'canvas' ? stubCanvas() : stubEl()), getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, body: stubEl(), documentElement: stubEl(), hidden: false },
    navigator: { userAgent: 'node' }, location: { search: '', hostname: 'server', protocol: 'https:' },
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    addEventListener() {}, removeEventListener() {}, requestAnimationFrame() {}, matchMedia: () => ({ matches: false, addEventListener() {} }),
    Image: function () { return stubCanvas(); }, OffscreenCanvas: function (w, h) { const c = stubCanvas(); c.width = w; c.height = h; return c; },
  };
  ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const f of SCRIPTS) vm.runInContext(fs.readFileSync(path.join(SRC, f), 'utf8'), ctx, { filename: f });
  // Drawing the ground and the voxel sprites is all the server would waste time on: skip it.
  vm.runInContext(`
    paintTerrain = function () { return mkCanvas(WORLD, WORLD); };
  `, ctx);
  // The scripts' const and let names (G, VERSION, NetCore...) are not properties of the context:
  // ctx.get('G') reads one.
  Object.defineProperty(ctx, 'get', { value: (name) => vm.runInContext(name, ctx), enumerable: false });
  return ctx;
}
module.exports = { load };

if (require.main === module) {
  const g = load();
  const run = (s) => vm.runInContext(s, g);
  let t0 = Date.now();
  run(`newWorld('allies', 'normal', 1234); G.teams[0].isAI = true; G.teams[0].auto = true; 0`);
  console.log('world in', Date.now() - t0, 'ms');
  t0 = Date.now();
  run(`for (let i = 0; i < 60 * 300; i++) update(1 / 60); 0`);
  console.log('5 game minutes in', Date.now() - t0, 'ms', run(`G.entities.filter(e => e.alive).length + ' alive, t=' + G.t.toFixed(0) + (G.over ? ' over' : '')`));
}
