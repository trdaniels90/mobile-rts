'use strict';
// Save and continue a skirmish. One slot per device: the most recent skirmish, saved on its own
// (when the menu opens, when the phone locks or switches apps, and every couple of minutes) and
// cleared when that game ends. Kept in IndexedDB, which has room for it.
//
// The whole of G is saved as a graph: every object once, with references between them kept
// ({ $r: n }), so a unit's target is the same unit again after loading. Unit and structure stats
// and the other tables in data.js are saved by name ({ $s: path }); number grids as base64. The
// ground (scorch marks, craters, wrecks) and the decals layer are saved as pictures.
const SaveGame = (() => {
  const DB = 'red-horizon', STORE = 'save', KEY = 'skirmish';
  const ROOTS = { FACTIONS, WARHEADS, UNIT_DEFS, BUILD_DEFS, POWERS, DIFFICULTY };
  const STATIC = new Map();
  (function index(o, path) {
    if (!o || typeof o !== 'object' || STATIC.has(o)) return;
    STATIC.set(o, path);
    for (const k in o) index(o[k], path.concat(k));
  })(ROOTS, []);
  const fromPath = (path) => path.reduce((o, k) => o[k], ROOTS);
  // Not saved: rebuilt on loading (byId, the canvases, what is drawn) or for this session only.
  const SKIP = new Set(['byId', 'terrainCanvas', 'tctx', 'decals', 'dctx', 'seen', 'selection', 'place', 'paused', 'inFx', 'shroudDirty']);
  const TYPED = { Uint8Array, Uint16Array, Int32Array, Float32Array, Float64Array, Int16Array, Uint32Array, Int8Array };

  function b64(a) {
    const u = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
    let s = '';
    for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function unb64(type, s) {
    const bin = atob(s), u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return new TYPED[type](u.buffer);
  }

  function freeze(root) {
    const ids = new Map(), nodes = [];
    const enc = (v) => {
      if (v === null || typeof v !== 'object') return typeof v === 'number' && !Number.isFinite(v) ? { $n: String(v) } : v;
      if (STATIC.has(v)) return { $s: STATIC.get(v) };
      if (ArrayBuffer.isView(v)) return TYPED[v.constructor.name] ? { $a: v.constructor.name, d: b64(v) } : null;
      if (Object.getPrototypeOf(v) !== Object.prototype && !Array.isArray(v)) return null;   // canvases, maps and the like
      let id = ids.get(v);
      if (id !== undefined) return { $r: id };
      ids.set(v, (id = nodes.length));
      nodes.push(null);
      if (Array.isArray(v)) nodes[id] = v.map(enc);
      else {
        const o = {};
        for (const k in v) if (v !== root || !SKIP.has(k)) { const x = v[k]; if (x !== undefined && typeof x !== 'function') o[k] = enc(x); }
        nodes[id] = o;
      }
      return { $r: id };
    };
    enc(root);
    return JSON.stringify(nodes);
  }
  function thaw(text) {
    const nodes = JSON.parse(text);
    const objs = nodes.map((n) => (Array.isArray(n) ? [] : {}));
    const dec = (v) => {
      if (v === null || typeof v !== 'object') return v;
      if (v.$r !== undefined) return objs[v.$r];
      if (v.$s !== undefined) return fromPath(v.$s);
      if (v.$a !== undefined) return unb64(v.$a, v.d);
      if (v.$n !== undefined) return Number(v.$n);
      return v;
    };
    nodes.forEach((n, i) => {
      const o = objs[i];
      if (Array.isArray(n)) for (let j = 0; j < n.length; j++) o[j] = dec(n[j]);
      else for (const k in n) o[k] = dec(n[k]);
    });
    return objs[0];
  }

  // IndexedDB, wrapped: every call resolves (to null on any failure) and never throws.
  let dbp = null;
  function db() {
    if (!dbp) dbp = new Promise((res) => {
      try {
        const r = indexedDB.open(DB, 1);
        r.onupgradeneeded = () => r.result.createObjectStore(STORE);
        r.onsuccess = () => res(r.result);
        r.onerror = () => res(null);
      } catch (_) { res(null); }
    });
    return dbp;
  }
  function tx(mode, fn) {
    return db().then((d) => d && new Promise((res) => {
      try {
        const t = d.transaction(STORE, mode), req = fn(t.objectStore(STORE));
        t.oncomplete = () => res(req ? req.result : true);
        t.onerror = t.onabort = () => res(null);
      } catch (_) { res(null); }
    }));
  }
  const put = (k, v) => tx('readwrite', (s) => s.put(v, k));
  const get = (k) => tx('readonly', (s) => s.get(k));

  let pictures = null;   // a picture save under way
  // view: { faction, diffKey, cam, match } from the sidebar, the camera and the match report.
  function save(view) {
    try {
      if (!G || G.over) return Promise.resolve(null);
      const t0 = performance.now();
      const state = freeze(G);
      const meta = { at: Date.now(), t: G.t, faction: view.faction, foe: G.teams[foeOf(G.me)].faction, diffKey: view.diffKey, version: VERSION, match: view.match || null };
      const done = put(KEY, { meta, state, cam: view.cam, ms: Math.round(performance.now() - t0) }).then(() => put(KEY + '-meta', meta));
      // The ground pictures take longer: one at a time, and an older pair is fine meanwhile.
      if (!pictures && G.terrainCanvas.toBlob) {
        const shot = (c) => new Promise((res) => { try { c.toBlob(res, 'image/png'); } catch (_) { res(null); } });
        pictures = Promise.all([shot(G.terrainCanvas), shot(G.decals)])
          .then(([ground, decals]) => (ground && decals ? put(KEY + '-pictures', { ground, decals, at: meta.at }) : null))
          .then(() => { pictures = null; }, () => { pictures = null; });
      }
      return done;
    } catch (_) { return Promise.resolve(null); }
  }
  // The saved game's summary, for the menu, or null.
  const info = () => get(KEY + '-meta');
  // Puts the saved game in G; resolves to { faction, diffKey, cam } or null.
  async function load() {
    try {
      const rec = await get(KEY);
      if (!rec) return null;
      const g = thaw(rec.state);
      g.byId = new Map(g.entities.map((e) => [e.id, e]));
      g.seen = g.fog[g.me]; g.selection = []; g.place = null; g.paused = false; g.inFx = false; g.shroudDirty = true;
      // The ground from its saved picture; without one, painted afresh (without the marks of battle).
      g.decals = mkCanvas(WORLD, WORLD);
      g.dctx = g.decals.getContext('2d');
      let ground = null;
      const pic = await get(KEY + '-pictures');
      if (pic && typeof createImageBitmap === 'function') {
        try {
          const [a, b] = await Promise.all([createImageBitmap(pic.ground), createImageBitmap(pic.decals)]);
          ground = mkCanvas(WORLD, WORLD);
          ground.getContext('2d').drawImage(a, 0, 0); g.dctx.drawImage(b, 0, 0);
        } catch (_) { ground = null; }
      }
      g.terrainCanvas = ground || paintTerrain(g.terr, g.seed, g.road, g.bridges);
      g.tctx = g.terrainCanvas.getContext('2d');
      G = g;
      return { faction: rec.meta.faction, diffKey: rec.meta.diffKey, cam: rec.cam, match: rec.meta.match };
    } catch (_) { return null; }
  }
  const clear = () => Promise.all([tx('readwrite', (s) => s.delete(KEY)), tx('readwrite', (s) => s.delete(KEY + '-meta')), tx('readwrite', (s) => s.delete(KEY + '-pictures'))]);

  return { save, load, info, clear, freeze, thaw };
})();
