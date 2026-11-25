'use strict';
// The map editor (owner, 2026-11-25: "build me a level editor where i can place grass, cliffs, water, ore, village buildings
// etc"). Main menu → Map Editor. Paint the ground cell by cell (grass, dirt road, trees, cliff, water, shallows, bridge,
// ore), place gem fields, start positions (two teams), plateaus with a ramp (high ground: MAPS `mesas`), village houses,
// churches, squares with a fountain, village plots (houses rolled each battle) and street lamps. Maps are kept on this
// device (maps.js CustomMaps) as ordinary fixed-layout MAPS entries (`rows` etc., world.js genLayoutMap / genVillage), so
// they show on the skirmish screen and play like the built-in maps. Explore and Play test a map straight from here.
// Not online: the other players and the game server do not have them. Export gives the entry as text (to add a map to
// the game for everyone, in maps.js), Import takes one back.
const MapEditor = (() => {
  const CH = '.,T#~=fo';   // the layout's cell codes (genLayoutMap), indexed by a cell's value in S.grid
  const COL = { '.': [58, 92, 44], ',': [122, 100, 66], T: [24, 58, 28], '#': [128, 122, 112], '~': [46, 86, 150], '=': [150, 120, 80], f: [88, 140, 170], o: [214, 180, 60] };
  const SIZES = [96, 128, 144, 160, 192, 216];
  const TOOLS = [
    ['.', 'Grass'], [',', 'Dirt road'], ['T', 'Trees'], ['#', 'Cliff'], ['~', 'Water'], ['f', 'Shallows'], ['=', 'Bridge'], ['o', 'Ore'],
    ['gem', 'Gems'], ['start', 'Start'], ['mesa', 'Plateau'], ['house', 'House'], ['church', 'Church'], ['square', 'Square'],
    ['lot', 'Village plot'], ['lamp', 'Lamp'], ['erase', 'Remove'], ['pan', 'Move'],
  ];
  const HOUSES = [[2, 2], [3, 2], [2, 3], [3, 3], [4, 2], [2, 4], [4, 3], [3, 4]];
  const HELP = {
    '.': 'Paint grass (open ground).', ',': 'Paint dirt: roads and tracks.', T: 'Paint trees: they block, and burn.',
    '#': 'Paint cliff rock: blocks everything.', '~': 'Paint deep water.', f: 'Paint shallows: units can wade across.',
    '=': 'Paint a bridge over water: a run of bridge cells becomes one bridge.', o: 'Paint ore.',
    gem: 'Tap to place a gem field (size from the brush).', start: 'Tap to place a start position for the chosen team; tap one to remove it.',
    mesa: 'Press on the middle of a plateau and drag toward where the ramp should go down.',
    house: 'Tap to place a house (size below; rotate swaps it).', church: 'Tap to place a church (rotate turns it).',
    square: 'Drag a box for a village square: paved, with a fountain, stalls and benches.',
    lot: 'Drag a box for a village plot: houses are built on it, different every battle.',
    lamp: 'Tap to place a street lamp (lit at night near villages and roads).', erase: 'Tap a gem field, start, plateau, house, plot, square or lamp to remove it.',
    pan: 'Drag to move round the map. Two fingers or the mouse wheel zoom.',
  };
  let root = null, cv = null, g = null, img = null, imgData = null, S = null, tool = '.', brush = 2, team = 0, house = 0, rot = 0, plat = 9;
  let cam = { x: 0, y: 0, z: 6 }, undo = [], dirty = true, imgDirty = true, hover = null, drag = null, msgT = 0;
  const ptrs = new Map();
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const hash = (x, y, k) => { let v = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(k, 1442695041); v = Math.imul(v ^ (v >>> 13), 1274126177); return ((v ^ (v >>> 16)) >>> 0) / 4294967296; };

  // ---- The map being made ----
  function blank(size) {
    return { id: null, name: 'My map', desc: '', size, theme: '', weather: false, daynight: false, bridge: 'timber',
      grid: new Uint8Array(size * size), gems: [], spawns: [], lots: [], houses: [], squares: [], lamps: [], mesas: [] };
  }
  function fromEntry(m, id) {
    const size = m.size || 144, s = blank(size);
    m.rows.forEach((row, y) => { let x = 0; for (const [, n, ch] of row.matchAll(/(\d*)(\D)/g)) for (let k = +(n || 1); k-- > 0; x++) if (x < size && y < size) s.grid[y * size + x] = Math.max(0, CH.indexOf(ch)); });
    const half = m.spawns.length / 2;
    Object.assign(s, { id: id || null, name: m.name || 'My map', desc: m.custom ? m.blurb || '' : '', theme: m.theme || '', weather: !!m.weather, daynight: !!m.daynight, bridge: m.bridge || 'timber',
      gems: (m.gems || []).map((a) => a.slice()), spawns: m.spawns.map(([x, y], i) => [x, y, i < half ? 0 : 1]), lots: (m.lots || []).map((a) => a.slice()),
      houses: (m.houses || []).map((a) => a.slice()), squares: villageSquares(m).map((a) => a.slice()), lamps: (m.lamps || []).map((a) => a.slice()), mesas: (m.mesas || []).map((a) => JSON.parse(JSON.stringify(a))) });
    // Whatever else the map sets that the editor does not show (a copied map's bridge width, fog, plateaus, light...) is kept.
    const MINE = ['name', 'blurb', 'info', 'img', 'custom', 'rows', 'spawns', 'gems', 'lots', 'houses', 'squares', 'square', 'lamps', 'mesas', 'theme', 'weather', 'daynight', 'bridge', 'size', 'teamSize', 'teams', 'village'];
    s.extra = {}; for (const k of Object.keys(m)) if (!MINE.includes(k)) s.extra[k] = JSON.parse(JSON.stringify(m[k]));
    return s;
  }
  function rowsOf(s) {
    const out = [];
    for (let y = 0; y < s.size; y++) {
      let r = '', x = 0;
      while (x < s.size) { const v = s.grid[y * s.size + x]; let n = 1; while (x + n < s.size && s.grid[y * s.size + x + n] === v) n++; r += (n > 1 ? n : '') + CH[v]; x += n; }
      out.push(r);
    }
    return out;
  }
  function toEntry(s) {
    const A = s.spawns.filter((p) => p[2] === 0), B = s.spawns.filter((p) => p[2] === 1), n = s.spawns.length;
    const village = s.lots.length || s.houses.length || s.squares.length;
    const m = {
      ...JSON.parse(JSON.stringify(s.extra || {})),
      name: s.name || 'My map', blurb: s.desc || 'A map made in the map editor.',
      info: `${s.size} × ${s.size} cells · ${n} start position${n === 1 ? '' : 's'} · made in the map editor`,
      size: s.size, teamSize: Math.max(1, Math.min(3, Math.min(A.length, B.length))),
      spawns: A.concat(B).map(([x, y]) => [x, y]), gems: s.gems.map((a) => a.slice()), rows: rowsOf(s),
    };
    if (s.theme) m.theme = s.theme;
    if (s.weather) m.weather = { kind: s.theme === 'snow' ? 'snow' : 'rain', chance: 0.5 };
    if (s.daynight) m.daynight = true;
    if (s.bridge === 'concrete') m.bridge = 'concrete';
    if (s.mesas.length) m.mesas = s.mesas.map((a) => Object.assign({}, a));
    if (village) { m.village = true; m.lots = s.lots.map((a) => a.slice()); m.houses = s.houses.map((a) => a.slice()); if (s.squares.length) m.squares = s.squares.map((a) => a.slice()); }
    if (s.lamps.length) m.lamps = s.lamps.map((a) => a.slice());
    return m;
  }
  const at = (x, y) => (x >= 0 && y >= 0 && x < S.size && y < S.size ? S.grid[y * S.size + x] : -1);
  const set = (x, y, v) => { if (x >= 0 && y >= 0 && x < S.size && y < S.size) S.grid[y * S.size + x] = v; };
  function remember() {
    undo.push({ grid: S.grid.slice(), o: JSON.stringify([S.gems, S.spawns, S.lots, S.houses, S.squares, S.lamps, S.mesas]) });
    if (undo.length > 40) undo.shift();
  }
  function undoLast() {
    const u = undo.pop();
    if (!u) return say('Nothing to undo');
    S.grid = u.grid; [S.gems, S.spawns, S.lots, S.houses, S.squares, S.lamps, S.mesas] = JSON.parse(u.o);
    imgDirty = dirty = true; keepDraft();
  }
  let draftT = 0;
  function keepDraft() {   // (the map in progress survives closing the editor and reloading the page)
    clearTimeout(draftT);
    draftT = setTimeout(() => { try { localStorage.setItem('rh-editor-draft', JSON.stringify({ id: S.id, m: toEntry(S) })); } catch (_) {} }, 800);
  }

  // ---- Changes ----
  function stamp(cx, cy, v) {
    const r = brush - 1;
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) if (Math.hypot(x - cx, y - cy) <= r + 0.35) set(x, y, v);
    imgDirty = dirty = true;
  }
  function line(a, b, v) {   // a stroke between two pointer moves, without gaps
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / Math.max(0.5, brush * 0.5)));
    for (let i = 1; i <= n; i++) stamp(Math.round(a[0] + (b[0] - a[0]) * i / n), Math.round(a[1] + (b[1] - a[1]) * i / n), v);
  }
  // A plateau as Lakeside's (tools/lakes-mesa.py): a flat top `top` cells round (cx, cy) (trees on it kept), a rim of
  // cliff out to `r` with a gap for the ramp, the ramp bare dirt; MAPS mesas gives it its height (world.js makeHeights).
  function plateau(cx, cy, ux, uy) {
    const top = plat, r = top + 2.1, W = 3.5, LEN = 8;
    for (let y = Math.floor(cy - r - LEN - 2); y <= cy + r + LEN + 2; y++) for (let x = Math.floor(cx - r - LEN - 2); x <= cx + r + LEN + 2; x++) {
      if (at(x, y) < 0) continue;
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = Math.hypot(dx, dy), along = dx * ux + dy * uy, across = Math.abs(-dx * uy + dy * ux);
      const ramp = along > 0 && across < W, rim = d + (hash(x, y, 3) - 0.5) * 0.8;
      if (rim < top) { if (at(x, y) !== 2) set(x, y, 0); }
      else if (ramp && along < top + LEN + 0.5) set(x, y, 1);
      else if (d < r) set(x, y, 3);
    }
    S.mesas.push({ x: cx, y: cy, top, r, h: 0.75, ramp: [+ux.toFixed(3), +uy.toFixed(3)], rampW: W, rampLen: LEN });
    imgDirty = dirty = true;
  }
  function houseDims() {
    if (tool === 'church') return rot % 2 ? [4, 6] : [6, 4];
    const [w, h] = HOUSES[house];
    return rot % 2 ? [h, w] : [w, h];
  }
  function placeHouse(cx, cy) {
    const [w, h] = houseDims(), x0 = Math.round(cx - w / 2 + 0.5), y0 = Math.round(cy - h / 2 + 0.5);
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
      if (at(x, y) < 0 || at(x, y) > 1) return say('A house needs open grass or dirt (no trees, rock, water or ore)');
      if (S.houses.some(([a, b, c, d]) => x >= a && y >= b && x < a + c && y < b + d)) return say('That overlaps another house');
    }
    remember();
    S.houses.push([x0, y0, w, h, tool === 'church' ? 'church' + (rot >= 2 ? 1 : 0) : 'house']);
    dirty = true;
  }
  function removeAt(cx, cy) {
    const near = (x, y, r) => Math.hypot(x - cx - 0.5, y - cy - 0.5) <= r;
    const inBox = (a, b, c, d) => cx >= a && cy >= b && cx <= c && cy <= d;
    const lists = [
      [S.spawns, (p) => near(p[0] + 0.5, p[1] + 0.5, 3.5)], [S.lamps, (p) => near(p[0], p[1], 1.5)],
      [S.houses, ([a, b, w, h]) => inBox(a, b, a + w - 1, b + h - 1)], [S.gems, (p) => near(p[0], p[1], p[2] + 0.5)],
      [S.squares, (q) => inBox(...q)], [S.lots, (q) => inBox(...q)], [S.mesas, (m) => near(m.x, m.y, m.r)],
    ];
    for (const [arr, hit] of lists) {
      const i = arr.findIndex(hit);
      if (i >= 0) { remember(); arr.splice(i, 1); dirty = true; return true; }
    }
    return false;
  }
  function tap(cx, cy) {
    if (at(cx, cy) < 0) return;
    if (tool === 'gem') { remember(); S.gems.push([cx + 0.5, cy + 0.5, Math.max(2, brush * 0.8 + 1)]); dirty = true; }
    else if (tool === 'start') {
      const i = S.spawns.findIndex((p) => Math.hypot(p[0] - cx, p[1] - cy) <= 3.5);
      remember();
      if (i >= 0) S.spawns.splice(i, 1);
      else if (S.spawns.filter((p) => p[2] === team).length >= 4) { undo.pop(); return say('Four start positions a team at most'); }
      else S.spawns.push([cx, cy, team]);
      dirty = true;
    } else if (tool === 'house' || tool === 'church') placeHouse(cx, cy);
    else if (tool === 'lamp') { remember(); S.lamps.push([cx + 0.5, cy + 0.5]); dirty = true; }
    else if (tool === 'erase') { if (!removeAt(cx, cy)) say('Nothing to remove there (paint grass to clear the ground)'); }
    keepDraft();
  }
  function box(a, b) { return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])]; }
  function finishBox(a, b) {
    const q = box(a, b), w = q[2] - q[0] + 1, h = q[3] - q[1] + 1;
    if (tool === 'square') {
      if (w < 8 || h < 8) return say('A square needs at least 8 × 8 cells');
      remember(); S.squares.push(q);
      for (let y = q[1]; y <= q[3]; y++) for (let x = q[0]; x <= q[2]; x++) set(x, y, 1);
      imgDirty = true;
    } else {
      if (w < 3 || h < 3) return say('A plot needs at least 3 × 3 cells');
      remember(); S.lots.push(q);
    }
    dirty = true; keepDraft();
  }

  // ---- Checks ----
  function check() {
    const errs = [], warns = [], A = S.spawns.filter((p) => p[2] === 0).length, B = S.spawns.length - A;
    if (!A || !B) errs.push('Place at least one start position for each team (Start tool).');
    else if (A !== B) errs.push(`Both teams need the same number of start positions (now ${A} and ${B}).`);
    for (const p of S.spawns) if (Math.min(p[0], p[1], S.size - 1 - p[0], S.size - 1 - p[1]) < 6) errs.push(`Start at ${p[0]}, ${p[1]} is too close to the edge.`);
    if (S.spawns.length >= 2 && !errs.length) {
      // Every start reaches every other over open ground (trees, rock, water and houses block; bridges and shallows do not).
      const N = S.size, open = new Uint8Array(N * N), seen = new Uint8Array(N * N);
      for (let i = 0; i < N * N; i++) open[i] = [0, 1, 5, 6, 7].includes(S.grid[i]) ? 1 : 0;
      for (const [a, b, w, h] of S.houses) for (let y = b; y < b + h; y++) for (let x = a; x < a + w; x++) if (at(x, y) >= 0) open[y * N + x] = 0;
      for (const [x, y] of S.spawns) for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) if (Math.hypot(i, j) < 3.2 && at(x + i, y + j) >= 0) open[(y + j) * N + x + i] = 1;   // (cleared for the base)
      const q = [S.spawns[0][1] * N + S.spawns[0][0]]; seen[q[0]] = 1;
      for (let k = 0; k < q.length; k++) {
        const c = q[k], x = c % N, y = (c / N) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue; const n = ny * N + nx; if (open[n] && !seen[n]) { seen[n] = 1; q.push(n); } }
      }
      S.spawns.slice(1).forEach(([x, y]) => { if (!seen[y * N + x]) errs.push(`Start at ${x}, ${y} cannot be reached from the first start over open ground.`); });
      let lost = 0; for (let i = 0; i < N * N; i++) if (S.grid[i] === 7 && !seen[i]) { const x = i % N, y = (i / N) | 0; if ([[1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dy]) => !seen[(y + dy) * N + x + dx])) lost++; }
      if (lost) warns.push(`${lost} ore cells cannot be reached by trucks.`);
    }
    if (!S.grid.includes(7) && !S.gems.length) warns.push('There is no ore or gems: nobody can earn money.');
    return { errs, warns };
  }

  // ---- Drawing ----
  function rebuild() {
    const N = S.size;
    if (!img || img.width !== N) { img = document.createElement('canvas'); img.width = img.height = N; imgData = img.getContext('2d').createImageData(N, N); }
    const d = imgData.data;
    for (let i = 0; i < N * N; i++) { const c = COL[CH[S.grid[i]]], k = 0.93 + hash(i % N, (i / N) | 0, 1) * 0.14; d[i * 4] = c[0] * k; d[i * 4 + 1] = c[1] * k; d[i * 4 + 2] = c[2] * k; d[i * 4 + 3] = 255; }
    img.getContext('2d').putImageData(imgData, 0, 0);
    imgDirty = false;
  }
  const toScreen = (x, y) => [(x - cam.x) * cam.z, (y - cam.y) * cam.z];
  const toCell = (sx, sy) => [sx / cam.z + cam.x, sy / cam.z + cam.y];
  function draw() {
    requestAnimationFrame(draw);
    if (!root || root.hidden || !dirty) return;
    dirty = false;
    const r = cv.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
    if (cv.width !== Math.round(r.width * dpr) || cv.height !== Math.round(r.height * dpr)) { cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); }
    if (imgDirty) rebuild();
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#0d0e10'; g.fillRect(0, 0, r.width, r.height);
    const z = cam.z, [ox, oy] = toScreen(0, 0);
    g.imageSmoothingEnabled = false; g.drawImage(img, ox, oy, S.size * z, S.size * z);
    g.strokeStyle = '#999'; g.lineWidth = 1; g.strokeRect(ox - 0.5, oy - 0.5, S.size * z + 1, S.size * z + 1);
    if (z >= 12) {   // the cells
      g.strokeStyle = 'rgba(0,0,0,0.18)'; g.beginPath();
      const [c0, r0] = toCell(0, 0).map((v) => Math.max(0, Math.floor(v))), [c1, r1] = toCell(r.width, r.height).map((v) => Math.min(S.size, Math.ceil(v)));
      for (let x = c0; x <= c1; x++) { const sx = Math.round(ox + x * z) + 0.5; g.moveTo(sx, oy + r0 * z); g.lineTo(sx, oy + r1 * z); }
      for (let y = r0; y <= r1; y++) { const sy = Math.round(oy + y * z) + 0.5; g.moveTo(ox + c0 * z, sy); g.lineTo(ox + c1 * z, sy); }
      g.stroke();
    }
    const rect = (q, fill, stroke, dash) => { const [x, y] = toScreen(q[0], q[1]); g.setLineDash(dash || []); if (fill) { g.fillStyle = fill; g.fillRect(x, y, (q[2] - q[0] + 1) * z, (q[3] - q[1] + 1) * z); } if (stroke) { g.strokeStyle = stroke; g.lineWidth = 2; g.strokeRect(x, y, (q[2] - q[0] + 1) * z, (q[3] - q[1] + 1) * z); } g.setLineDash([]); };
    const circ = (x, y, rad, fill, stroke) => { const [sx, sy] = toScreen(x, y); g.beginPath(); g.arc(sx, sy, Math.max(2, rad * z), 0, 7); if (fill) { g.fillStyle = fill; g.fill(); } if (stroke) { g.strokeStyle = stroke; g.lineWidth = 2; g.stroke(); } };
    for (const m of S.mesas) {
      circ(m.x, m.y, m.top, 'rgba(255,240,200,0.10)', 'rgba(255,230,170,0.8)');
      const [sx, sy] = toScreen(m.x, m.y), [ex, ey] = toScreen(m.x + m.ramp[0] * (m.top + m.rampLen), m.y + m.ramp[1] * (m.top + m.rampLen));
      g.strokeStyle = '#ffe9b0'; g.lineWidth = 3; g.beginPath(); g.moveTo(sx, sy); g.lineTo(ex, ey); g.stroke();
      const a = Math.atan2(ey - sy, ex - sx); g.beginPath(); g.moveTo(ex, ey); g.lineTo(ex - 10 * Math.cos(a - 0.5), ey - 10 * Math.sin(a - 0.5)); g.lineTo(ex - 10 * Math.cos(a + 0.5), ey - 10 * Math.sin(a + 0.5)); g.closePath(); g.fillStyle = '#ffe9b0'; g.fill();
      label('HIGH GROUND', sx, sy - m.top * z - 6, '#ffe9b0');
    }
    for (const q of S.squares) { rect(q, 'rgba(200,190,170,0.35)', '#e0d6c0'); circ((q[0] + q[2] + 1) / 2, (q[1] + q[3] + 1) / 2, 2, '#7fb5d8', '#dfe9f0'); }
    for (const q of S.lots) { rect(q, 'rgba(230,200,140,0.12)', '#e8c98a', [6, 4]); if (z >= 5) label('plot', ...toScreen((q[0] + q[2] + 1) / 2, (q[1] + q[3] + 1) / 2), '#e8c98a'); }
    for (const [a, b, w, h, k] of S.houses) { rect([a, b, a + w - 1, b + h - 1], k.startsWith('church') ? '#d9d2c4' : '#a0523c', '#2a1a12'); if (k.startsWith('church') && z >= 5) label('✝', ...toScreen(a + w / 2, b + h / 2), '#333'); }
    for (const [x, y, rr] of S.gems) circ(x, y, rr, 'rgba(190,80,230,0.55)', '#e6a8ff');
    for (const [x, y] of S.lamps) circ(x, y, 0.45, '#ffe066', '#5a4a10');
    S.spawns.forEach(([x, y, t]) => {
      circ(x + 0.5, y + 0.5, 16, null, t ? 'rgba(255,110,90,0.35)' : 'rgba(110,170,255,0.35)');   // (about the size of a base)
      circ(x + 0.5, y + 0.5, 3.2, t ? '#c8402c' : '#2f6fd0', '#fff');
      const [sx, sy] = toScreen(x + 0.5, y + 0.5); label(t ? 'B' : 'A', sx, sy + 1, '#fff');
    });
    if (drag && drag.box) rect(box(drag.box, drag.cur), 'rgba(255,255,255,0.12)', '#fff', [4, 3]);
    if (drag && drag.mesa) {
      circ(drag.mesa[0], drag.mesa[1], plat, null, '#fff');
      circ(drag.mesa[0], drag.mesa[1], plat + 2.1, null, 'rgba(255,255,255,0.5)');
      const [sx, sy] = toScreen(...drag.mesa), [ex, ey] = toScreen(drag.cur[0] + 0.5, drag.cur[1] + 0.5);
      g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.moveTo(sx, sy); g.lineTo(ex, ey); g.stroke();
    }
    if (hover && !drag) {
      const [hx, hy] = hover;
      if (CH.includes(tool) || tool === 'gem') circ(hx + 0.5, hy + 0.5, tool === 'gem' ? Math.max(2, brush * 0.8 + 1) : brush - 0.5, null, 'rgba(255,255,255,0.8)');
      else if (tool === 'house' || tool === 'church') { const [w, h] = houseDims(), x0 = Math.round(hx - w / 2 + 0.5), y0 = Math.round(hy - h / 2 + 0.5); rect([x0, y0, x0 + w - 1, y0 + h - 1], 'rgba(255,255,255,0.25)', '#fff'); }
      else if (tool === 'mesa') { circ(hx + 0.5, hy + 0.5, plat, null, 'rgba(255,255,255,0.7)'); circ(hx + 0.5, hy + 0.5, plat + 2.1, null, 'rgba(255,255,255,0.35)'); }
    }
  }
  function label(t, x, y, col) { g.font = 'bold 12px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,0.7)'; g.strokeText(t, x, y); g.fillStyle = col; g.fillText(t, x, y); }
  function fit() {
    const r = cv.getBoundingClientRect();
    cam.z = Math.max(1, Math.min(r.width, r.height) / S.size * 0.95);
    cam.x = S.size / 2 - r.width / cam.z / 2; cam.y = S.size / 2 - r.height / cam.z / 2;
    dirty = true;
  }
  function zoomAt(sx, sy, k) {
    const [wx, wy] = toCell(sx, sy);
    cam.z = Math.max(1, Math.min(48, cam.z * k));
    cam.x = wx - sx / cam.z; cam.y = wy - sy / cam.z; dirty = true;
  }

  // ---- Input ----
  const local = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const cellAt = (e) => toCell(...local(e)).map(Math.floor);
  function down(e) {
    cv.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, local(e));
    if (ptrs.size === 2) { if (drag && drag.paint && drag.fresh) undoLast(); drag = { pinch: true, last: [...ptrs.values()] }; return; }   // (two fingers: zoom, not paint)
    if (ptrs.size > 2) return;
    const c = cellAt(e);
    if (tool === 'pan' || e.button === 1 || e.button === 2) { drag = { pan: local(e) }; return; }
    if (CH.includes(tool)) { remember(); drag = { paint: c, fresh: true }; stamp(c[0], c[1], CH.indexOf(tool)); }
    else if (tool === 'square' || tool === 'lot') drag = { box: c, cur: c };
    else if (tool === 'mesa') drag = { mesa: [c[0] + 0.5, c[1] + 0.5], cur: c };
    else drag = { tap: c, at: local(e) };
    dirty = true;
  }
  function move(e) {
    const p = local(e);
    if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, p);
    hover = cellAt(e); dirty = true;
    if (!drag) return;
    if (drag.pinch && ptrs.size === 2) {
      const [a, b] = [...ptrs.values()], [a0, b0] = drag.last;
      const m0 = [(a0[0] + b0[0]) / 2, (a0[1] + b0[1]) / 2], m1 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const k = Math.hypot(a[0] - b[0], a[1] - b[1]) / Math.max(1, Math.hypot(a0[0] - b0[0], a0[1] - b0[1]));
      cam.x -= (m1[0] - m0[0]) / cam.z; cam.y -= (m1[1] - m0[1]) / cam.z; zoomAt(m1[0], m1[1], k);
      drag.last = [a, b]; return;
    }
    if (drag.pan) { cam.x -= (p[0] - drag.pan[0]) / cam.z; cam.y -= (p[1] - drag.pan[1]) / cam.z; drag.pan = p; return; }
    const c = cellAt(e);
    if (drag.paint && (c[0] !== drag.paint[0] || c[1] !== drag.paint[1])) { line(drag.paint, c, CH.indexOf(tool)); drag.paint = c; drag.fresh = false; }
    if (drag.box || drag.mesa) drag.cur = c;
    if (drag.tap && Math.hypot(p[0] - drag.at[0], p[1] - drag.at[1]) > 12) drag = { pan: p };   // (a drag with a tapping tool moves the map)
  }
  function up(e) {
    ptrs.delete(e.pointerId);
    const d = drag;
    if (!d) return;
    if (d.pinch) { if (!ptrs.size) drag = null; return; }
    drag = null; dirty = true;
    if (d.paint) keepDraft();
    else if (d.box) finishBox(d.box, cellAt(e));
    else if (d.mesa) {
      const [cx, cy] = d.mesa, c = cellAt(e), dx = c[0] + 0.5 - cx, dy = c[1] + 0.5 - cy, l = Math.hypot(dx, dy);
      if (at(Math.floor(cx), Math.floor(cy)) < 0) return;
      remember(); plateau(cx, cy, l > 1 ? dx / l : 0, l > 1 ? dy / l : -1); keepDraft();
    } else if (d.tap) tap(...d.tap);
  }

  // ---- The screen ----
  function say(t) {
    const m = root.querySelector('.ed-msg'); m.textContent = t; m.hidden = false;
    clearTimeout(msgT); msgT = setTimeout(() => { m.hidden = true; }, 3200);
  }
  function build() {
    const st = document.createElement('style');
    st.textContent = `
#editor { position: fixed; inset: 0; z-index: 40; display: flex; flex-direction: column; background: #0d0e10; color: #e4e0d4;
  font: 14px system-ui, -apple-system, sans-serif; padding: env(safe-area-inset-top, 0) env(safe-area-inset-right, 0) env(safe-area-inset-bottom, 0) env(safe-area-inset-left, 0); }
#editor[hidden] { display: none; }
#editor button, #editor select, #editor input { font: inherit; color: inherit; }
#editor .ed-bar { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; padding: 6px 8px; background: linear-gradient(180deg, #2c2e30, #1a1b1c); border-bottom: 1px solid #000; }
#editor .ed-title { font-weight: 700; margin-right: auto; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 40vw; }
#editor .ed-b { min-height: 34px; padding: 0 10px; border: 1px solid #5c5f62; border-color: #6c6f72 #111 #111 #6c6f72; background: linear-gradient(180deg, #3a3d40, #26282a); border-radius: 2px; cursor: pointer; }
#editor .ed-b.go { background: linear-gradient(180deg, #7a2a1e, #4c160f); }
#editor .ed-b[aria-pressed="true"] { background: linear-gradient(180deg, #2a5f8a, #173a57); color: #fff; }
#editor .ed-main { flex: 1; position: relative; min-height: 0; }
#editor canvas { position: absolute; inset: 0; width: 100%; height: 100%; touch-action: none; cursor: crosshair; }
#editor .ed-tools { display: flex; gap: 4px; overflow-x: auto; padding: 6px 8px 2px; background: #17181a; border-top: 1px solid #000; -webkit-overflow-scrolling: touch; }
#editor .ed-tool { flex: none; display: flex; flex-direction: column; align-items: center; gap: 2px; min-width: 58px; padding: 4px 4px; border: 1px solid #3a3c3e; background: #222427; border-radius: 3px; font-size: 12px; cursor: pointer; }
#editor .ed-tool i { display: block; width: 22px; height: 16px; border: 1px solid rgba(0,0,0,0.6); border-radius: 2px; font-style: normal; font-size: 12px; line-height: 15px; text-align: center; }
#editor .ed-tool[aria-pressed="true"] { border-color: #ff4a33; background: #3a2420; color: #fff; }
#editor .ed-opts { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; padding: 4px 8px 8px; background: #17181a; min-height: 40px; }
#editor .ed-opts small { color: #a9a395; flex-basis: 100%; }
#editor .ed-msg { position: absolute; left: 50%; top: 10px; transform: translateX(-50%); background: rgba(0,0,0,0.8); padding: 6px 12px; border-radius: 3px; pointer-events: none; max-width: 90%; text-align: center; }
#editor .ed-dlg { position: absolute; inset: 0; z-index: 2; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.6); padding: 12px; }
#editor .ed-dlg[hidden] { display: none; }
#editor .ed-card { background: #1c1d1f; border: 1px solid #5c5f62; max-width: 560px; width: 100%; max-height: 90%; overflow-y: auto; padding: 14px; border-radius: 3px; }
#editor .ed-card h3 { margin: 4px 0 10px; font-size: 17px; }
#editor .ed-card h4 { margin: 14px 0 6px; font-size: 14px; color: #c9c2b0; }
#editor .ed-card label { display: flex; gap: 8px; align-items: center; margin: 6px 0; }
#editor .ed-card input[type=text], #editor .ed-card textarea, #editor .ed-card select { background: #0f1012; border: 1px solid #44474a; padding: 6px; border-radius: 2px; }
#editor .ed-card input[type=text] { flex: 1; }
#editor .ed-card textarea { width: 100%; min-height: 120px; font: 12px ui-monospace, monospace; color: #ddd; }
#editor .ed-row { display: flex; gap: 8px; align-items: center; padding: 6px 0; border-bottom: 1px solid #2a2c2e; }
#editor .ed-row span { flex: 1; }
#editor .ed-row img { width: 48px; height: 48px; image-rendering: pixelated; }
#editor .ed-err { color: #ff8c7a; } #editor .ed-warn { color: #f0d07a; }`;
    document.head.appendChild(st);
    root = document.createElement('div');
    root.id = 'editor'; root.hidden = true;
    root.innerHTML = `<div class="ed-bar"><span class="ed-title"></span>
        <button type="button" class="ed-b" data-ed="maps">Maps</button><button type="button" class="ed-b" data-ed="settings">Settings</button>
        <button type="button" class="ed-b" data-ed="undo">Undo</button><button type="button" class="ed-b" data-ed="fit">Whole map</button>
        <button type="button" class="ed-b" data-ed="save">Save</button><button type="button" class="ed-b" data-ed="explore">Explore</button>
        <button type="button" class="ed-b go" data-ed="play">Play</button><button type="button" class="ed-b" data-ed="close" aria-label="Close">✕</button></div>
      <div class="ed-main"><canvas></canvas><div class="ed-msg" hidden></div><div class="ed-dlg" hidden><div class="ed-card"></div></div></div>
      <div class="ed-tools" role="toolbar" aria-label="Tools">${TOOLS.map(([k, n]) => {
        const c = COL[k], sw = c ? `background: rgb(${c.join(',')})` : '';
        const ic = { gem: '◆', start: 'A', mesa: '▲', house: '⌂', church: '✝', square: '▦', lot: '▭', lamp: '•', erase: '✕', pan: '✥' }[k] || '';
        return `<button type="button" class="ed-tool" data-tool="${esc(k)}" aria-pressed="false"><i style="${sw}">${ic}</i>${n}</button>`; }).join('')}</div>
      <div class="ed-opts"></div>`;
    document.body.appendChild(root);
    cv = root.querySelector('canvas'); g = cv.getContext('2d');
    cv.addEventListener('pointerdown', down); cv.addEventListener('pointermove', move);
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('pointerleave', () => { hover = null; dirty = true; });
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    cv.addEventListener('wheel', (e) => { e.preventDefault(); zoomAt(...local(e), Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
    window.addEventListener('resize', () => { dirty = true; });
    window.addEventListener('keydown', (e) => { if (!root.hidden && (e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); undoLast(); } });
    root.addEventListener('click', onClick);
    requestAnimationFrame(draw);
  }
  function setTool(k) {
    tool = k;
    for (const b of root.querySelectorAll('[data-tool]')) b.setAttribute('aria-pressed', String(b.dataset.tool === k));
    const o = root.querySelector('.ed-opts'), opt = (attr, v, cur, text) => `<button type="button" class="ed-b" data-${attr}="${v}" aria-pressed="${v === cur}">${text}</button>`;
    let h = '';
    if (CH.includes(k) || k === 'gem') h = 'Brush ' + [1, 2, 3, 5, 8].map((v) => opt('brush', v, brush, v)).join('');
    if (k === 'start') h = opt('team', 0, team, 'Team A (blue)') + opt('team', 1, team, 'Team B (red)');
    if (k === 'house') h = HOUSES.map(([w, hh], i) => opt('house', i, house, `${w}×${hh}`)).join('') + '<button type="button" class="ed-b" data-ed="rot">Rotate</button>';
    if (k === 'church') h = '<button type="button" class="ed-b" data-ed="rot">Rotate</button>';
    if (k === 'mesa') h = 'Top size ' + [6, 8, 9, 11, 14].map((v) => opt('plat', v, plat, v)).join('');
    o.innerHTML = h + `<small>${esc(HELP[k] || '')}</small>`;
    dirty = true;
  }
  function title() { root.querySelector('.ed-title').textContent = `Map Editor · ${S.name} (${S.size} × ${S.size})${S.id ? '' : ' · not saved'}`; }
  function dialog(html) { const d = root.querySelector('.ed-dlg'); d.querySelector('.ed-card').innerHTML = html; d.hidden = false; }
  function closeDialog() { root.querySelector('.ed-dlg').hidden = true; }
  function thumb() {
    if (imgDirty || !img) rebuild();
    const c = document.createElement('canvas'); c.width = c.height = 224;
    const x = c.getContext('2d'); x.imageSmoothingEnabled = true; x.drawImage(img, 0, 0, 224, 224);
    for (const [px, py, t] of S.spawns) { x.fillStyle = t ? '#c8402c' : '#2f6fd0'; x.strokeStyle = '#fff'; x.lineWidth = 2; x.beginPath(); x.arc((px + 0.5) * 224 / S.size, (py + 0.5) * 224 / S.size, 6, 0, 7); x.fill(); x.stroke(); }
    return c.toDataURL('image/png');
  }
  function save(quiet) {
    const { errs, warns } = check();
    if (!S.id) S.id = 'my-' + Date.now().toString(36);
    const m = toEntry(S); m.img = thumb();
    if (!CustomMaps.save(S.id, m)) { say('Could not save: this device is out of room for maps'); return null; }
    title(); keepDraft();
    if (!quiet) say(errs.length ? 'Saved. Not playable yet: ' + errs[0] : warns.length ? 'Saved. ' + warns[0] : 'Saved. It is on the skirmish screen now.');
    return { errs, warns };
  }
  function test(how) {
    const r = save(true);
    if (!r) return;
    if (r.errs.length) return dialog(`<h3>Not ready to play</h3>${r.errs.map((t) => `<p class="ed-err">${esc(t)}</p>`).join('')}${r.warns.map((t) => `<p class="ed-warn">${esc(t)}</p>`).join('')}<button type="button" class="ed-b" data-ed="ok">OK</button>`);
    root.hidden = true;
    if (window.EditorHooks) window.EditorHooks[how](S.id);
  }
  function mapsDialog() {
    const mine = CustomMaps.list().map((id) => [id, CustomMaps.get(id)]).filter(([, m]) => m);
    const built = MAP_LIST.filter((id) => MAPS[id].rows && !MAPS[id].custom);
    dialog(`<h3>Maps</h3>
      <h4>New blank map</h4><label>Size <select data-ed-size>${SIZES.map((n) => `<option value="${n}"${n === 144 ? ' selected' : ''}>${n} × ${n}</option>`).join('')}</select>
        <button type="button" class="ed-b" data-ed="new">Start a new map</button></label>
      <h4>My maps (on this device)</h4>${mine.length ? mine.map(([id, m]) => `<div class="ed-row">${m.img ? `<img src="${m.img}" alt="">` : ''}<span>${esc(m.name)}<br><small>${esc(m.info)}</small></span>
        <button type="button" class="ed-b" data-open="${esc(id)}">Open</button><button type="button" class="ed-b" data-del="${esc(id)}">Delete</button></div>`).join('') : '<p>None yet.</p>'}
      <h4>Start from a map in the game (a copy)</h4>${built.map((id) => `<div class="ed-row"><span>${esc(MAPS[id].name)}</span><button type="button" class="ed-b" data-copy="${esc(id)}">Copy</button></div>`).join('')}
      <h4>Share</h4><p><small>Export gives this map as text (send it to have it added to the game for everyone). Import opens one.</small></p>
      <button type="button" class="ed-b" data-ed="export">Export</button> <button type="button" class="ed-b" data-ed="import">Import</button>
      <p><button type="button" class="ed-b" data-ed="ok">Close</button></p>`);
  }
  function settingsDialog() {
    dialog(`<h3>Map settings</h3>
      <label>Name <input type="text" data-set="name" maxlength="40" value="${esc(S.name)}"></label>
      <label>Description <input type="text" data-set="desc" maxlength="200" value="${esc(S.desc)}"></label>
      <label>Look <select data-set="theme"><option value="">Summer</option><option value="snow"${S.theme === 'snow' ? ' selected' : ''}>Winter (snow)</option><option value="marsh"${S.theme === 'marsh' ? ' selected' : ''}>Fen (marsh)</option></select></label>
      <label><input type="checkbox" data-set="weather"${S.weather ? ' checked' : ''}> Rain (snow in winter) in about half the battles</label>
      <label><input type="checkbox" data-set="daynight"${S.daynight ? ' checked' : ''}> Day turns to night</label>
      <label>Bridges <select data-set="bridge"><option value="timber">Timber</option><option value="concrete"${S.bridge === 'concrete' ? ' selected' : ''}>Concrete</option></select></label>
      <p><small>Size: ${S.size} × ${S.size} cells (pick the size when starting a new map). Team A's starts fight team B's; with 2 a team the map offers 2 v 2, with 3, 3 v 3.</small></p>
      <h4>Check the map</h4><div data-check></div>
      <p><button type="button" class="ed-b" data-ed="ok">Done</button></p>`);
    const { errs, warns } = check();
    root.querySelector('[data-check]').innerHTML = errs.map((t) => `<p class="ed-err">${esc(t)}</p>`).join('') + warns.map((t) => `<p class="ed-warn">${esc(t)}</p>`).join('') || '<p>Ready to play.</p>';
  }
  function onClick(e) {
    const t = e.target.closest('button');
    if (!t) return;
    const d = t.dataset;
    if (d.tool) setTool(d.tool);
    else if (d.brush) { brush = +d.brush; setTool(tool); }
    else if (d.team) { team = +d.team; setTool(tool); }
    else if (d.house) { house = +d.house; setTool(tool); }
    else if (d.plat) { plat = +d.plat; setTool(tool); }
    else if (d.open) { load(fromEntry(CustomMaps.get(d.open), d.open)); closeDialog(); }
    else if (d.copy) { const s = fromEntry(MAPS[d.copy]); s.name = MAPS[d.copy].name + ' (copy)'; load(s); closeDialog(); }
    else if (d.del) { if (confirm('Delete this map from this device?')) { CustomMaps.remove(d.del); if (S.id === d.del) { S.id = null; title(); } mapsDialog(); } }
    const a = d.ed;
    if (a === 'close') { root.hidden = true; keepDraft(); }
    else if (a === 'maps') mapsDialog();
    else if (a === 'settings') settingsDialog();
    else if (a === 'undo') undoLast();
    else if (a === 'fit') fit();
    else if (a === 'save') save();
    else if (a === 'explore') test('explore');
    else if (a === 'play') test('play');
    else if (a === 'rot') { rot = (rot + 1) % 4; dirty = true; }
    else if (a === 'ok') { closeDialog(); readSettings(); }
    else if (a === 'new') { const n = +root.querySelector('[data-ed-size]').value; load(blank(n)); closeDialog(); }
    else if (a === 'export') dialog(`<h3>Export</h3><p><small>Copy all of this.</small></p><textarea readonly>${esc(JSON.stringify(toEntry(S)))}</textarea><p><button type="button" class="ed-b" data-ed="ok">Close</button></p>`);
    else if (a === 'import') dialog(`<h3>Import</h3><p><small>Paste a map's text.</small></p><textarea data-imp></textarea><p><button type="button" class="ed-b" data-ed="doimport">Open it</button> <button type="button" class="ed-b" data-ed="ok">Cancel</button></p>`);
    else if (a === 'doimport') {
      try { const m = JSON.parse(root.querySelector('[data-imp]').value); if (!m.rows || !m.spawns) throw new Error('no map'); load(fromEntry(m)); closeDialog(); say('Imported: Save to keep it'); }
      catch (_) { say('That is not a map'); }
    }
  }
  function readSettings() {
    const f = (k) => root.querySelector(`[data-set="${k}"]`);
    if (!f('name')) return;
    S.name = f('name').value.trim() || 'My map'; S.desc = f('desc').value.trim(); S.theme = f('theme').value;
    S.weather = f('weather').checked; S.daynight = f('daynight').checked; S.bridge = f('bridge').value;
    title(); keepDraft();
  }
  function load(s) { S = s; undo = []; imgDirty = dirty = true; title(); requestAnimationFrame(fit); keepDraft(); }
  function open() {
    if (!root) build();
    root.hidden = false;
    if (!S) {
      let d = null; try { d = JSON.parse(localStorage.getItem('rh-editor-draft') || 'null'); } catch (_) {}
      load(d && d.m && d.m.rows ? fromEntry(d.m, d.id && CustomMaps.get(d.id) ? d.id : null) : blank(144));
      setTool('.');
    }
    dirty = true;
  }
  const btn = document.getElementById('editorBtn');
  if (btn) btn.addEventListener('click', open);
  return { open, get state() { return S; }, toEntry: () => toEntry(S), check: () => check() };
})();
