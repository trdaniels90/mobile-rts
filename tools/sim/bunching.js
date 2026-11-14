// How bunched units are in a fight (headless, no browser). A staged battle: side 1 (Soviets) hunts with
// infantry and tanks, side 0 (Allies) defends its base with infantry and tanks waiting at home (base defence).
// Every half second of fighting it counts, for each unit, its friends within a V2 blast (30 px) and
// reports the average, the share of samples with 6 or more in one blast, and the worst; plus how the fight went.
// node tools/sim/bunching.js <repo> [runs] [seconds]
const vm = require('vm');
const [root, runs = '4', secs = '90'] = process.argv.slice(2);
const headless = require(root + '/server/headless.js');
const BLAST = 30;
const tot = { atk: [], def: [] };
for (let r = 0; r < +runs; r++) {
  const ctx = headless.load(), run = (s) => vm.runInContext(s, ctx);
  run(`newWorld('allies', 'normal', ${5000 + r * 131}, 0, false, 'bridge', [{ faction: 'allies', ally: 0, ai: false }, { faction: 'soviets', ally: 1, ai: false }]); G.me = -1;
    for (const e of G.entities) if (e.kind === 'unit') e.alive = false;
    G.entities = G.entities.filter((e) => e.alive);
    const A = G.teams[0], S = G.teams[1]; G.fog[1].fill(1);
    const ax = A.start.cx * CELL, ay = A.start.cy * CELL, sx = S.start.cx * CELL, sy = S.start.cy * CELL;
    const L = Math.hypot(sx - ax, sy - ay), ux = (sx - ax) / L, uy = (sy - ay) / L;
    const near = (x, y) => { const c = nearestFreeCell(cellOfPos(x, y), 6); return cellCenter(c); };
    // Defenders: idle at home, a few cells out toward the enemy.
    for (let i = 0; i < 18; i++) { const t = i < 12 ? 'rifle' : i < 15 ? 'rocket' : 'mtank';
      const p = near(ax + ux * CELL * 8 + (Math.random() - 0.5) * CELL * 8, ay + uy * CELL * 8 + (Math.random() - 0.5) * CELL * 8);
      const u = addUnit(t, A, p.x, p.y); setGuard(u, p.x, p.y); u.staged = true; }
    // Attackers: 26 cells out from the Allied base, hunting.
    for (let i = 0; i < 24; i++) { const t = i < 14 ? 'rifle' : i < 18 ? 'grenadier' : 'htank';
      const p = near(ax + ux * CELL * 26 + (Math.random() - 0.5) * CELL * 5, ay + uy * CELL * 26 + (Math.random() - 0.5) * CELL * 5);
      const u = addUnit(t, S, p.x, p.y); setHunt(u); }
    0`);
  const upd = ctx.get('update');
  const s = { atk: [], def: [] };
  for (let i = 0; i < +secs * 30; i++) {
    upd(1 / 30);
    if (i % 15) continue;
    const res = run(`(() => { const out = [[], []];
      const us = G.entities.filter((e) => e.alive && e.kind === 'unit' && e.cls !== 'air');
      const fighting = us.some((u) => u.target && u.target.kind === 'unit');
      if (!fighting) return null;
      for (const u of us) { if (!u.target) continue; let n = 0; for (const o of us) if (o.team === u.team && Math.hypot(o.x - u.x, o.y - u.y) < ${BLAST}) n++; out[u.team].push(n); }
      return out; })()`);
    if (!res) continue;
    s.def.push(...res[0]); s.atk.push(...res[1]);
  }
  const k = run(`[unitsOf(0).length, unitsOf(1).length, G.teams[0].stats.killed, G.teams[1].stats.killed]`);
  const sum = (a) => ({ avg: +(a.reduce((x, y) => x + y, 0) / (a.length || 1)).toFixed(2), six: +(a.filter((n) => n >= 6).length / (a.length || 1)).toFixed(3), worst: Math.max(0, ...a) });
  console.log(JSON.stringify({ run: r, attack: sum(s.atk), defend: sum(s.def), alive: { allies: k[0], soviets: k[1] }, killed: { allies: k[2], soviets: k[3] } }));
  tot.atk.push(...s.atk); tot.def.push(...s.def);
}
const sum = (a) => ({ avg: +(a.reduce((x, y) => x + y, 0) / (a.length || 1)).toFixed(2), six: +(a.filter((n) => n >= 6).length / (a.length || 1)).toFixed(3), worst: Math.max(0, ...a) });
console.log('ALL', JSON.stringify({ attack: sum(tot.atk), defend: sum(tot.def) }));
