// Ore Trucks queue at a refinery's dock instead of jamming. Headless: 8 full trucks sent home to one
// refinery; prints how long until all are unloaded. node tools/sim/truck-queue.js <repo> [trucks]
const vm = require('vm');
const root = process.argv[2], n = +(process.argv[3] || 8);
const ctx = require(root + '/server/headless.js').load(), run = (s) => vm.runInContext(s, ctx);
run(`newWorld('allies', 'normal', 7); G.me = 0; for (const t of G.teams) { t.isAI = false; t.auto = false; } 0`);
console.log(JSON.stringify(run(`(() => {
  const me = G.teams[0];
  for (const b of buildingsOf(0)) b.buildT = 1;
  const cy = buildingsOf(0).find((b) => b.type === 'cy');
  for (const r of buildingsOf(0).filter((b) => b.type === 'refinery')) damage(r, 1e9, Object.keys(WARHEADS)[0]);
  let ref = null;
  for (let d = 5; d < 14 && !ref; d++) for (let a = 0; a < 6.28 && !ref; a += 0.3) { const x = Math.round(cy.cx + Math.cos(a) * d), y = Math.round(cy.cy + Math.sin(a) * d); try { ref = addBuilding('refinery', me, x, y); } catch (e) {} if (ref && !ref.exitCell && ref.exitCell !== 0) ref = null; }
  ref.buildT = 1;
  G.ore.fill(0);   // nothing to mine: they unload once and idle
  const T = [];
  for (let i = 0; i < ${n}; i++) { const u = addUnit('harv', me, ref.x + (Math.random() - 0.5) * 120, ref.y + 90 + Math.random() * 60); u.load = u.def.capacity; u.hs = 'return'; u.x = ref.x + (Math.random() - 0.5) * 120; u.y = ref.y + 90 + Math.random() * 60; u.dest = null; u.path = null; T.push(u); }
  let t = 0; const done = new Set(); while (t < 120 && done.size < T.length) { update(1 / 30); t += 1 / 30; for (const u of T) if (u.load < u.def.capacity) done.add(u); }
   return { trucks: T.length, secs: +t.toFixed(1), left: T.length - done.size };
})()`)));
