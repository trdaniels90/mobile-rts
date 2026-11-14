// Primary buildings and rally points: units made at an outpost Barracks wait at that outpost, PRIMARY picks
// which Barracks trains, and a rally point sends new units there. Headless. node tools/sim/rally.js <repo>
const vm = require('vm');
const root = process.argv[2];
const headless = require(root + '/server/headless.js');
const ctx = headless.load(), run = (s) => vm.runInContext(s, ctx);
run(`newWorld('allies', 'normal', 5); G.me = 0; for (const t of G.teams) { t.isAI = false; t.auto = false; } G.teams[0].credits = 1e5; 0`);
const r = run(`(() => {
  const step = (s) => { for (let i = 0; i < s * 30; i++) update(1 / 30); };
  const me = G.teams[0], res = {};
  for (const b of buildingsOf(1)) { b.hp = b.maxHp = 1e9; }
  const cy = buildingsOf(0).find((b) => b.type === 'cy');
  // a free 6x6 patch at least 30 cells from the yard: the 'outpost'
  const open = (x, y) => { for (let j = -2; j < 6; j++) for (let i = -2; i < 6; i++) { if (!inMap(x + i, y + j)) return false; const c = idx(x + i, y + j); if (G.block[c] || G.bld[c] || G.ore[c] || G.resv[c] || G.terr[c] >= 2) return false; } return true; };
  let spot = null;
  for (let d = 30; d < 60 && !spot; d++) for (let a = 0; a < 6.28 && !spot; a += 0.2) { const x = Math.round(cy.cx + Math.cos(a) * d), y = Math.round(cy.cy + Math.sin(a) * d); if (open(x, y)) spot = [x, y]; }
  const home = addBuilding('barracks', me, cy.cx + 5, cy.cy + 4); home.buildT = 1;
  for (const b of buildingsOf(0)) b.buildT = 1;
  const far = addBuilding('barracks', me, spot[0], spot[1]); far.buildT = 1;
  const pw = addBuilding('power', me, spot[0] + 3, spot[1]); pw.buildT = 1;
  const near = (u, b, cells) => Math.hypot(u.x - b.x, u.y - b.y) < cells * CELL;
  // 1: newest Barracks (the far one) trains, units stay at the far base
  const A = Array.from({ length: 6 }, () => spawnUnit(me, 'rifle')); step(25);
  res.atOutpost = A.filter((u) => near(u, far, 14)).length;
  // 2: PRIMARY on the home Barracks: units come out there
  setPrimary(home);
  const B = Array.from({ length: 4 }, () => spawnUnit(me, 'rifle')); step(25);
  res.atHome = B.filter((u) => near(u, home, 14)).length;
  res.onePrimary = buildingsOf(0).filter((b) => b.primary).length;
  // 3: rally point on the home Barracks
  const rp = { x: cy.x + 10 * CELL, y: cy.y - 10 * CELL };
  setRally(home, rp.x, rp.y);
  const C = Array.from({ length: 5 }, () => spawnUnit(me, 'rifle')); step(30);
  res.atRally = C.filter((u) => Math.hypot(u.x - rp.x, u.y - rp.y) < 3 * CELL).length;
  res.staged = C.every((u) => u.staged);
  setRally(home, null, null); res.cleared = home.rally === null;
  // 4: the primary is lost: back to the newest
  damage(home, 1e9, Object.keys(WARHEADS)[0]); step(3);
  const D = spawnUnit(me, 'rifle'); res.fallback = near(D, far, 4);
  // auto attack still launches rallied units
  G.fog[0].fill(1); setAuto(me, true); step(2);
  res.autoLaunch = C.some((u) => u.order.type === 'hunt');
  // canRally refuses other buildings
  setRally(cy, 1, 1); res.cyNoRally = !cy.rally;
  return res;
})()`);
console.log(JSON.stringify(r));
const ok = r.atOutpost === 6 && r.atHome === 4 && r.onePrimary === 1 && r.atRally === 5 && r.staged && r.cleared && r.autoLaunch && r.fallback && r.cyNoRally;
console.log(ok ? 'PASS' : 'FAIL'); process.exit(ok ? 0 : 1);
