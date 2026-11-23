// The Specialist (both sides, needs a Tech Center, at most 2): unavailable before a Tech Center, the cap, a charge planted on an enemy
// structure destroys it after the fuse (and he gets clear first), smoke thrown under fire, and smoke blocking shots through it.
// Headless. node tools/sim/specialist.js <repo>
const vm = require('vm');
const root = process.argv[2];
const headless = require(root + '/server/headless.js');
const ctx = headless.load(), run = (s) => vm.runInContext(s, ctx);
run(`newWorld('allies', 'normal', 9); G.me = 0; for (const t of G.teams) { t.isAI = false; t.auto = false; } 0`);
const r = JSON.parse(run(`(() => {
  const step = (s, f) => { for (let i = 0; i < s * 30; i++) { update(1 / 30); if (f && f()) return true; } return false; };
  const me = G.teams[0], foe = G.teams[1], r = {};
  const base = (team) => {
    const cy = buildingsOf(team.id).find((b) => b.type === 'cy');
    const place = (type) => { for (let d = 3; d < 30; d++) for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) if (canPlace(team, type, cy.cx + dx, cy.cy + dy, 0)) { const b = addBuilding(type, team, cy.cx + dx, cy.cy + dy); b.buildT = 1; return b; } };
    for (const t of ['power', 'power', 'power', 'barracks', 'refinery', 'dome', 'power']) place(t);
    return { cy, place };
  };
  const A = base(me), S = base(foe);
  updatePower(); me.credits = foe.credits = 50000;
  r.lockedBeforeTech = !available(me, 'spec') && !available(foe, 'spec');
  A.place('tech'); S.place('tech'); updatePower();
  r.bothSides = available(me, 'spec') && available(foe, 'spec');
  const res = []; for (let i = 0; i < 3; i++) res.push(startProduction(foe, 'spec'));
  r.cap = res[0] === null && res[1] === null && res[2] === 'limit'; foe.queues.infantry.length = 0;
  // Demolition: a Specialist sent at an enemy Power Plant; every enemy gun silenced so only the charge does it.
  const pw = buildingsOf(foe.id).find((b) => b.type === 'power'); pw.maxHp = pw.hp = 1e5;
  for (const e of G.entities) if (e.team === foe.id && e.kind === 'unit') e.alive = false;
  const sp = addUnit('spec', me, pw.x - CELL * 8, pw.y); sp.hp = sp.maxHp = 1e6;
  commandAttack([sp], pw);
  let planted = -1, gone = -1;
  step(40, () => { if (planted < 0 && pw.c4T) planted = G.t; if (!pw.alive) { gone = G.t; return true; } });
  r.planted = planted > 0; r.fuse = +(gone - planted).toFixed(1);
  r.destroyed = !pw.alive; r.clear = Math.round(distTo(sp, pw)); r.hpLeft = Math.round(sp.hp);
  // Smoke between two riflemen blocks the shot; standing almost together they still see each other.
  const a = addUnit('rifle', me, sp.x, sp.y + 200), b = addUnit('rifle', foe, sp.x + 100, sp.y + 200);
  r.clearBefore = clearShot(a, b, a.def.weapon);
  const cloud = { x: sp.x + 50, y: sp.y + 200, r: SMOKE_R, end: G.t + 5, puff: 0 }; G.smokes = [cloud];
  r.blocked = !clearShot(a, b, a.def.weapon) && !clearShot(b, a, b.def.weapon);
  b.x = a.x + 15; r.nearSees = clearShot(a, b, a.def.weapon); b.x = a.x + 100;
  r.lobbedGoesOver = clearShot(a, b, { proj: 'grenade' });
  step(6); r.cleared = !G.smokes.includes(cloud);
  a.alive = b.alive = false;
  // Smoke under fire: enemy riflemen shoot the Specialist until he throws one; then they lose him.
  const sp2 = addUnit('spec', foe, sp.x + 300, sp.y + 300); sp2.hp = sp2.maxHp = 1e6; setGuard(sp2, sp2.x, sp2.y); sp2.def = Object.assign({}, sp2.def, { weapon: null });
  const shooters = [0, 1, 2].map((i) => { const u = addUnit('rifle', me, sp2.x - 110, sp2.y - 20 + i * 20); setGuard(u, u.x, u.y); u.order.hold = true; return u; });
  r.smoked = step(20, () => G.smokes && G.smokes.length > 0);
  step(1);
  r.lostHim = shooters.every((u) => u.target !== sp2 || !clearShot(u, sp2, u.def.weapon));
  return JSON.stringify(r);
})()`));
console.log(JSON.stringify(r));
const ok = r.lockedBeforeTech && r.bothSides && r.cap && r.planted && r.destroyed && r.fuse >= 4.9 && r.fuse <= 5.3 && r.clear > CELLS(2) && r.clearBefore && r.blocked && r.nearSees && r.lobbedGoesOver && r.cleared && r.smoked && r.lostHim;
function CELLS(n) { return n * 24; }
console.log(ok ? 'PASS' : 'FAIL');
process.exit(ok ? 0 : 1);
