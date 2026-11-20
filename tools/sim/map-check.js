// Checks every map's ground (rules and pictures): node tools/sim/map-check.js <repo> [seeds for generated maps, default 8]
//  - routes: every start position reaches every other over open ground (8-way, no corner cutting, as findPath), also with
//    the breakable bridges down; no start reaches the others only through one-cell gaps; open pockets nothing reaches
//    (noted: forest, creek or cliff edges), one-cell gaps beside cliffs;
//  - ore and gems: every cell on open ground, not on a cliff or under drawn rock, reachable by a harvester from a start;
//    each start's nearest field;
//  - cliffs as drawn (look.js cliffLookFor, the tall crags; its painted foot is the 2D rock): blocked cliff cells that
//    show little rock (look open), open cells under rock (look blocked).
const { chromium } = require('playwright');
(async () => {
  const root = process.argv[2], seeds = +(process.argv[3] || 8);
  const b = await chromium.launch();
  const p = await b.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.route(/fonts|supabase|fly\.dev/, (r) => r.abort());
  await p.goto('file://' + root + '/index.html'); await p.waitForTimeout(800);
  const out = await p.evaluate((seeds) => {
    const res = [];
    for (const id of Object.keys(MAPS)) for (let si = 0; si < (MAPS[id].rows ? 1 : seeds); si++) {
      newWorld('allies', 'normal', 1000 + si * 7919, 0, false, id);
      const N = MAP, free = (c) => !G.block[c], r = { map: id, seed: MAPS[id].rows ? null : G.seed, size: N, problems: [], notes: [] };
      const X = (c) => c % N, Y = (c) => (c / N) | 0, at = (x, y) => y * N + x, inM = (x, y) => x >= 0 && y >= 0 && x < N && y < N;
      const step = (a, bc, ok) => { const ax = X(a), ay = Y(a), bx = X(bc), by = Y(bc); return !(ax !== bx && ay !== by) || ok(at(bx, ay)) || ok(at(ax, by)); };
      const regions = (ok) => {   // region number per open cell (0: blocked)
        const reg = new Int32Array(N * N); let n = 0;
        for (let c0 = 0; c0 < N * N; c0++) {
          if (!ok(c0) || reg[c0]) continue;
          n++; const q = [c0]; reg[c0] = n;
          for (let i = 0; i < q.length; i++) { const c = q[i], x = X(c), y = Y(c);
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { if (!dx && !dy) continue; const nx = x + dx, ny = y + dy; if (!inM(nx, ny)) continue; const d = at(nx, ny); if (reg[d] || !ok(d) || !step(c, d, ok)) continue; reg[d] = n; q.push(d); } }
        }
        return reg;
      };
      const sp = G.spawns.map((s) => at(s.cx, s.cy));
      // Routes between the start positions.
      const reg = regions(free), main = reg[sp[0]];
      sp.forEach((c, i) => { if (reg[c] !== main) r.problems.push(`start ${i} (${X(c)},${Y(c)}) cannot reach start 0 over ground`); });
      if (G.spans && G.spans.length) {   // breakable bridges down
        const down = new Set(G.spans.flatMap((s) => s.cells)), reg2 = regions((c) => free(c) && !down.has(c));
        const cut = sp.filter((c) => reg2[c] !== reg2[sp[0]]).length;
        r.notes.push(`with every bridge down, ${cut ? cut + ' of ' + sp.length + ' starts are cut off from start 0' : 'every start still reaches every other'}`);
      }
      // Pockets: open cells (not water's islands of one cell) nothing reaches.
      const size = new Map(); for (let c = 0; c < N * N; c++) if (reg[c]) size.set(reg[c], (size.get(reg[c]) || 0) + 1);
      const pockets = [...size].filter(([k, n]) => k !== main && n >= 4);
      for (const [k, n] of pockets) { let c = reg.indexOf(k); const byCliff = (() => { for (let i = 0; i < N * N; i++) if (reg[i] === k) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const x = X(i) + dx, y = Y(i) + dy; if (inM(x, y) && G.cliff && G.cliff[at(x, y)]) return true; } return false; })();
        r.notes.push(`an open pocket of ${n} cells at (${X(c)},${Y(c)}) nothing reaches${byCliff ? ' (a cliff on its edge)' : ''}`); }   // (no start or ore in it: those are checked below)
      // One-cell gaps on the routes: an open cell with blocked cells on both sides (left/right or up/down), where widening
      // the routes by a cell (an open cell needs an open neighbour each way) would cut a start off.
      const wide = (c) => { if (!free(c)) return false; const x = X(c), y = Y(c); const o = (dx, dy) => inM(x + dx, y + dy) && free(at(x + dx, y + dy)); return (o(1, 0) || o(-1, 0)) && (o(0, 1) || o(0, -1)) && !((!o(1, 0) && !o(-1, 0)) || (!o(0, 1) && !o(0, -1))); };
      const regW = regions((c) => free(c) && !(((X(c) > 0 && !free(c - 1)) && (X(c) < N - 1 && !free(c + 1))) || ((Y(c) > 0 && !free(c - N)) && (Y(c) < N - 1 && !free(c + N)))));
      const cutW = sp.filter((c) => regW[c] !== regW[sp[0]]);
      if (cutW.length) r.problems.push(`${cutW.length} start(s) reach start 0 only through one-cell gaps`);
      let gaps = 0, cliffGaps = [];
      for (let c = 0; c < N * N; c++) { if (!free(c)) continue; const x = X(c), y = Y(c), bl = (dx, dy) => !inM(x + dx, y + dy) || !free(at(x + dx, y + dy)), cl = (dx, dy) => inM(x + dx, y + dy) && G.cliff && G.cliff[at(x + dx, y + dy)];
        if ((bl(1, 0) && bl(-1, 0)) || (bl(0, 1) && bl(0, -1))) { gaps++; if ((cl(1, 0) || cl(-1, 0) || cl(0, 1) || cl(0, -1)) && reg[c] === main) cliffGaps.push(`${x},${y}`); } }
      r.notes.push(`${gaps} one-cell-wide open cells; ${cliffGaps.length} of them beside a cliff on the main ground${cliffGaps.length ? ': ' + cliffGaps.slice(0, 12).join(' ') + (cliffGaps.length > 12 ? '...' : '') : ''}`);
      // Ore and gems.
      let ore = 0, gems = 0; const bad = [];
      for (let c = 0; c < N * N; c++) {
        if (!G.ore[c]) continue;
        G.gem[c] ? gems++ : ore++;
        const x = X(c), y = Y(c);
        if (G.terr[c] > 1 || G.block[c] || (G.cliff && G.cliff[c])) bad.push(`${G.gem[c] ? 'gem' : 'ore'} on blocked ground at ${x},${y}`);
        else if (reg[c] !== main) bad.push(`${G.gem[c] ? 'gem' : 'ore'} unreachable at ${x},${y}`);
      }
      if (bad.length) r.problems.push(`${bad.length} ore/gem cells wrong: ` + bad.slice(0, 8).join('; '));
      const fields = G.oreFields.map((f) => ({ ...f, n: 0 }));
      for (let c = 0; c < N * N; c++) if (G.ore[c]) { let bf = null, bd = 1e9; for (const f of fields) { const d = Math.hypot(X(c) - f.cx, Y(c) - f.cy); if (d < bd) { bd = d; bf = f; } } if (bf) bf.n++; }
      const empty = fields.filter((f) => !f.n);
      if (empty.length) r.problems.push(`${empty.length} ore field(s) placed but with no ore cells (all on blocked ground?): ` + empty.map((f) => `${f.gem ? 'gems' : 'ore'} at ${Math.round(f.cx)},${Math.round(f.cy)}`).join('; '));
      const near = sp.map((c) => { let bd = 1e9; for (const f of fields) if (!f.gem && f.n) bd = Math.min(bd, Math.hypot(X(c) - f.cx, Y(c) - f.cy)); return Math.round(bd); });
      r.notes.push(`${ore} ore cells, ${gems} gem cells in ${fields.length} fields; nearest ore field to each start (cells): ${near.join(' ')}`);
      if (Math.max(...near) > 32) r.problems.push(`a start's nearest ore field is ${Math.max(...near)} cells away`);
      // Cliffs as drawn.
      if (typeof cliffLookFor === 'function' && G.cliff) {
        cliffLook = null; const L = cliffLookFor(), S = 4, cov = (c) => { let k = 0; for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) if (L.height((X(c) + (i + 0.5) / S) * CELL, (Y(c) + (j + 0.5) / S) * CELL) > 0.5) k++; return k / (S * S); };
        let cl = 0; const bare = [], under = [], oreUnder = [];
        for (let c = 0; c < N * N; c++) {
          if (G.cliff[c]) { cl++; if (cov(c) < 0.25) bare.push(`${X(c)},${Y(c)}`); continue; }
          if (!free(c) && !G.ore[c]) continue;
          // only cells near a cliff can be under its rock
          let nearC = false; for (let dy = -2; dy <= 2 && !nearC; dy++) for (let dx = -2; dx <= 2; dx++) if (inM(X(c) + dx, Y(c) + dy) && G.cliff[at(X(c) + dx, Y(c) + dy)]) { nearC = true; break; }
          if (!nearC) continue;
          const k = cov(c);
          if (G.ore[c] && k > 0.3) oreUnder.push(`${X(c)},${Y(c)}`);
          else if (free(c) && k > 0.5) under.push(`${X(c)},${Y(c)}`);
        }
        r.notes.push(`${cl} cliff cells; ${bare.length} of them show little rock (look open but block)${bare.length ? ': ' + bare.slice(0, 10).join(' ') : ''}; ${under.length} open cells mostly under drawn rock (look blocked but are open)${under.length ? ': ' + under.slice(0, 10).join(' ') : ''}`);
        if (oreUnder.length) r.problems.push(`${oreUnder.length} ore/gem cells under drawn rock: ${oreUnder.slice(0, 10).join(' ')}`);
        r.cliffBare = bare.length; r.cliffUnder = under.length;
      }
      res.push(r);
    }
    return res;
  }, seeds);
  for (const r of out) {
    console.log(`\n== ${r.map}${r.seed !== null ? ' (seed ' + r.seed + ')' : ''}, ${r.size} x ${r.size}: ${r.problems.length ? r.problems.length + ' PROBLEM(S)' : 'OK'}`);
    for (const x of r.problems) console.log('  PROBLEM: ' + x);
    for (const x of r.notes) console.log('  ' + x);
  }
  if (errs.length) console.log('page errors:', errs.slice(0, 3));
  await b.close();
})();
