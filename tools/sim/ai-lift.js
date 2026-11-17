// The computer's air assaults by personality. Headless. node tools/sim/ai-lift.js <repo> [minutes] [map]
// 1 For each personality, a Normal 1 v 1 of two computers of that personality: when it first flew an assault, how many,
//   of which kind (with a wave, of its own, a turtle's reinforcements), soldiers landed and how many were alive 60 s later,
//   what they were, and how far the paired drops landed in time from their wave.
// 2 Staged: a turtle's outlying refinery attacked; its transport brings idle infantry from the main base and they hold there.
const vm = require('vm');
const [root, minutes = '22', map = 'bridge', only = ''] = process.argv.slice(2);
const headless = require(root + '/server/headless.js');

function game(style) {
  const ctx = headless.load(), run = (s) => vm.runInContext(s, ctx);
  run(`setTransports(true); newWorld('allies', 'normal', ${7 + style.length}, 0, false, '${map}'); G.me = -1; for (const t of G.teams) { t.isAI = true; t.auto = true; t.style = '${style}'; } 0`);
  return JSON.parse(run(`(() => {
    const log = [], landed = [];
    const sa = startAssault;
    startAssault = function (team, plan, drop, extra = {}) {
      const ok = sa(team, plan, drop, extra);
      if (ok) log.push({ side: team.id, t: Math.round(G.t), kind: extra.mode === 'guard' ? 'defend' : extra.goAt !== undefined ? 'wave' : 'solo', crew: plan.crew.map((u) => u.type), heli: plan.heli.id });
      return ok;
    };
    const uo = unloadOne;
    unloadOne = function (h, ai) {
      const n = G.nextId; uo(h, ai);
      const u = G.byId.get(n);
      const a = log.slice().reverse().find((l) => l.heli === h.id);
      if (u) landed.push({ id: u.id, t: G.t, heli: h.id, type: u.type, kind: a ? a.kind : '?' });
      if (a && a.landT === undefined) a.landT = Math.round(G.t);
    };
    let errors = 0, firstErr = null;
    for (let i = 0; i < 30 * 60 * ${minutes}; i++) {
      try { update(1 / 30); } catch (e) { errors++; firstErr = firstErr || e.stack.split('\\n').slice(0, 3).join(' | '); }
      if (G.over) break;
    }
    const alive60 = landed.filter((l) => G.t - l.t >= 60).map((l) => G.byId.get(l.id));
    const byKindAlive = {}; for (const l of landed.filter((l) => G.t - l.t >= 60)) { const u = G.byId.get(l.id), k = byKindAlive[l.kind] || (byKindAlive[l.kind] = [0, 0]); k[1]++; if (u && u.alive) k[0]++; }
    const kinds = {}; for (const l of landed) kinds[l.type] = (kinds[l.type] || 0) + 1;
    return JSON.stringify({ minutes: +(G.t / 60).toFixed(1), errors, firstErr,
      transports: G.entities.filter((e) => e.alive && e.def && e.def.lift).length,
      assaults: log.length, first: log.length ? log[0].t : null, byKind: log.reduce((m, l) => (m[l.kind] = (m[l.kind] || 0) + 1, m), {}),
      flightSecs: log.filter((l) => l.landT).map((l) => l.landT - l.t),
      landed: landed.length, aliveAfter60: alive60.filter((u) => u && u.alive).length + ' of ' + alive60.length, aliveByKind: byKindAlive, kinds });
  })()`));
}
for (const style of ['rusher', 'raider', 'balanced', 'turtle']) if (!only || only.split(',').includes(style)) console.log(style, JSON.stringify(game(style)));
if (only) process.exit(0);

// --- 2: a turtle's reinforcements
const ctx = headless.load(), run = (s) => vm.runInContext(s, ctx);
run(`setTransports(true); newWorld('allies', 'normal', 3, 0, false, '${map}'); G.me = -1; for (const t of G.teams) { t.isAI = true; t.auto = false; } G.teams[0].style = 'turtle'; G.teams[1].isAI = false; 0`);
console.log('turtle defence', run(`(() => {
  const me = G.teams[0], foe = G.teams[1], cy = buildingsOf(0).find((b) => b.type === 'cy');
  const place = (type, near, from = 3) => { for (let d = from; d < 40; d++) for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) { const x = near.cx + dx, y = near.cy + dy; if (Math.max(Math.abs(dx), Math.abs(dy)) === d && canPlace(me, type, x, y, 0)) { const b = addBuilding(type, me, x, y); b.buildT = 1; return b; } } };
  for (const t of ['power', 'power', 'refinery', 'factory']) place(t, cy);
  const bar = place('barracks', cy), pad = place('helipad', cy);
  for (const u of unitsOf(0)) if (u.cls === 'air') u.alive = false;
  // an outlying refinery 22+ cells out (an Outpost lets it stand there)
  const a = Math.atan2(WORLD / 2 - cy.y, WORLD / 2 - cy.x);
  const op = addBuilding('outpost', me, Math.round(cy.cx + Math.cos(a) * 24), Math.round(cy.cy + Math.sin(a) * 24)); op.buildT = 1;
  const far = place('refinery', op);
  updatePower(); me.credits = 5000;
  const h = spawnUnit(me, 'chinook');
  for (let i = 0; i < 8; i++) { const c = nearestFreeCell(cellOfPos(bar.x - 40 + i * 12, bar.y + 50), 5), q = cellCenter(c); const u = addUnit(i < 5 ? 'rifle' : 'rocket', me, q.x, q.y); setGuard(u, q.x, q.y); u.staged = true; }
  for (let i = 0; i < 3; i++) { const c = nearestFreeCell(cellOfPos(far.x + CELL * 4, far.y + CELL * (i - 1)), 4), q = cellCenter(c); addUnit('rifle', foe, q.x, q.y); }
  let flew = null, guard = 0;
  for (let i = 0; i < 30 * 70; i++) {
    update(1 / 30);
    if (!flew && h.order.type === 'lift') flew = { t: +G.t.toFixed(1), dropToRefinery: Math.round(Math.hypot(h.order.dx - far.x, h.order.dy - far.y) / CELL), mode: h.order.ai };
  }
  guard = unitsOf(0).filter((u) => u.cls === 'inf' && distTo(u, far) < CELL * 8).length;
  return JSON.stringify({ flew, soldiersAtRefinery: guard, refineryAlive: far.alive });
})()`));
