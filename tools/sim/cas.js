// Close Air Support (POWERS.cas, Tech Center upgrades cas1-cas3). Headless. node tools/sim/cas.js <repo> [faction]
// 1 rules: the tiers need the Tech Center, an Airfield and the tier before; the power shows only once cas1 is researched and charges from then.
// 2 strikes: 1, 2 and 3 planes against a column of tanks (light, medium, heavy) and a few riflemen in the open: missiles fired, gun runs,
//   damage to vehicles and kills, the planes making their runs and leaving. 3 planes with a SAM Site beside the target.
const vm = require('vm');
const root = process.argv[2], faction = process.argv[3] || 'allies';
const headless = require(root + '/server/headless.js');
const ctx = headless.load(), run = (s) => vm.runInContext(s, ctx);
run(`newWorld('${faction}', 'normal', 7); G.me = 0; for (const t of G.teams) { t.isAI = false; t.auto = false; } 0`);
const res = JSON.parse(run(`(() => {
  const step = (s, f) => { for (let i = 0; i < s * 30; i++) { update(1 / 30); if (f) f(); } };
  const me = G.teams[0], foe = G.teams[1], r = {};
  const cy = buildingsOf(0).find((b) => b.type === 'cy');
  const place = (type, team = me, at = cy) => {
    for (let d = 3; d < 30; d++) for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) {
      const x = at.cx + dx, y = at.cy + dy;
      if (canPlace(team, type, x, y, 0)) { const b = addBuilding(type, team, x, y); b.buildT = 1; return b; }
    }
  };
  for (const t of ['power', 'power', 'power', 'refinery', 'factory', 'dome', 'power', 'power']) place(t);
  const tech = place('tech');
  updatePower();
  me.credits = 50000;
  r.noAirfield = startResearch(me, 'cas1') === 'Not available';
  const af = place('airfield'); updatePower();
  for (const u of G.entities.filter((e) => e.kind === 'unit' && e.cls === 'air')) u.alive = false;
  r.tier2First = startResearch(me, 'cas2') === 'Not available';
  r.noPowerYet = !hasPower(me, 'cas') && !powerReady(me, 'cas');
  r.start1 = startResearch(me, 'cas1'); step(61);
  r.has1 = hasUpgrade(me, 'cas1') && hasPower(me, 'cas');
  r.charging = Math.round(me.powers.cas);
  r.start2 = startResearch(me, 'cas2'); step(91); r.has2 = hasUpgrade(me, 'cas2');
  r.start3 = startResearch(me, 'cas3'); step(121); r.has3 = hasUpgrade(me, 'cas3');
  r.paid = Math.round(50000 - me.credits);
  // --- 2: strikes on open ground away from the base
  let fx = 0, fy = 0;
  search: for (let dy = -45; dy <= 45; dy++) for (let dx = -45; dx <= 45; dx++) {
    const bx = cy.x + dx * CELL, by = cy.y + dy * CELL;
    let ok = Math.hypot(dx, dy) > 18; for (let k = -6; k <= 6 && ok; k++) for (let j = -6; j <= 6 && ok; j++) if (!passableAt(bx + k * CELL, by + j * CELL)) ok = false;
    if (ok) { fx = bx; fy = by; break search; }
  }
  const foeType = (t) => t;
  const strike = (tier, sam) => {
    for (const e of G.entities) if (e.alive && e.kind === 'unit') e.alive = false;
    step(0.1);
    me.upgrades = { cas1: true, cas2: tier >= 2, cas3: tier >= 3 };
    const targets = [];
    const types = ['ltank', 'mtank', 'htank', 'mtank', 'htank', 'ltank', 'rifle', 'rifle', 'rifle'];
    types.forEach((t, i) => { const u = addUnit(t, foe, fx + (i % 3 - 1) * 40 + 20, fy + (Math.floor(i / 3) - 1) * 40); u.def = Object.assign({}, u.def, { speed: 0 }); targets.push(u); });
    let samB = null;
    if (sam) { samB = addBuilding('sam', foe, Math.floor(fx / CELL) + 3, Math.floor(fy / CELL) - 2); samB.buildT = 1; foe.low = false; }
    me.powers.cas = POWERS.cas.charge;
    const hp0 = targets.map((t) => t.hp);
    const ok = launchPower(me, 'cas', fx, fy);
    const planes = G.entities.filter((e) => e.alive && e.kind === 'unit' && e.def.scripted);
    let missiles = 0, guns = 0, t = 0; const seen = new Set();
    step(70, () => {
      for (const p of G.projectiles) if (p.kind === 'missile' && p.from && p.from.def.scripted && !seen.has(p)) { seen.add(p); missiles++; }
      for (const p of planes) if (p.strafe && !p._s) { p._s = true; guns++; } else if (!p.strafe) p._s = false;
    });
    const vehDmg = targets.reduce((a, u, i) => a + (u.cls === 'veh' ? hp0[i] - Math.max(0, u.hp) : 0), 0);
    return { ok, planes: planes.length, types: [...new Set(planes.map((p) => p.type))].join(','), missiles, gunRuns: guns,
      vehDamage: Math.round(vehDmg), vehKilled: targets.filter((u) => u.cls === 'veh' && !u.alive).length + '/6', infKilled: targets.filter((u) => u.cls === 'inf' && !u.alive).length + '/3',
      planesLeft: planes.filter((p) => p.alive).length, planesShotDown: planes.filter((p) => !p.alive && p.hp <= 0).length,
      samHp: samB ? Math.round(samB.hp / samB.maxHp * 100) + '%' : undefined };
  };
  r.tier1 = strike(1); r.tier2 = strike(2); r.tier3 = strike(3); r.tier3Sam = strike(3, true);
  return JSON.stringify(r);
})()`));
console.log(JSON.stringify(res, null, 1));
