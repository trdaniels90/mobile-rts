// A direct order from the player (move, guard, attack) takes a unit out of the auto logic until Stop: Auto Attack
// does not launch it and base defence does not call it. Headless. node tools/sim/manual-override.js <repo>
const vm = require('vm');
const root = process.argv[2];
const headless = require(root + '/server/headless.js');
const ctx = headless.load(), run = (s) => vm.runInContext(s, ctx);
run(`newWorld('allies', 'normal', 5); G.me = 0; for (const t of G.teams) { t.isAI = false; t.auto = false; } G.teams[0].credits = 1e5; G.fog[0].fill(1); 0`);
const r = run(`(() => {
  const step = (s) => { for (let i = 0; i < s * 30; i++) update(1 / 30); };
  const me = G.teams[0], cy = buildingsOf(0).find((b) => b.type === 'cy'), res = {};
  for (const b of buildingsOf(1)) { b.hp = b.maxHp = 1e9; }   // the battle must not end (Auto Attack goes for the enemy base)
  const mk = (n, dx) => Array.from({ length: n }, (_, i) => { const u = addUnit('rifle', me, cy.x + dx + i * 14, cy.y + 70); setGuard(u, u.x, u.y); u.staged = true; return u; });
  const A = mk(4, -150), C = mk(4, 40);
  commandMove(A, cy.x - 120, cy.y + 80);
  step(12);
  res.manualSet = A.every((u) => u.manual) && C.every((u) => !u.manual);
  res.AidleGuard = A.every((u) => u.order.type === 'guard');
  // defence: an enemy rifleman walks into the base with Auto Attack off
  const foe = addUnit('rifle', G.teams[1], cy.x + 30, cy.y + 90);
  step(4);
  res.defendersC = C.filter((u) => u.defending).length; res.defendersA = A.filter((u) => u.defending).length;
  for (let i = 0; i < 400 && foe.alive; i++) step(0.5);
  step(8);
  // auto attack on: control units go out, moved ones stay
  setAuto(me, true);
  res.AhuntAfterAuto = A.filter((u) => u.order.type === 'hunt').length; res.ChuntAfterAuto = C.filter((u) => u.order.type === 'hunt').length;
  // Stop returns them to the auto logic
  commandStop(A); step(15);
  res.stopClears = A.every((u) => !u.manual);
  setAuto(me, false); setAuto(me, true);
  res.AhuntAfterStop = A.filter((u) => u.order.type === 'hunt').length;
  // an attack order ends: after a few idle minutes the unit goes home and rejoins the auto logic; a moved one stays manual
  setAuto(me, false);
  const target = addUnit('rifle', G.teams[1], cy.x + 600, cy.y); const D = addUnit('rifle', me, cy.x + 560, cy.y), M = addUnit('rifle', me, cy.x + 560, cy.y + 40);
  commandAttack([D], target); commandMove([M], M.x, M.y + 10);
  for (let i = 0; i < 40 && target.alive; i++) step(1);
  res.targetDied = !target.alive; res.attackStillManual = D.manual === true;
  step(150); res.beforeIdleLimit = D.manual === true;
  step(60); res.attackReleased = D.manual === false && D.staged === true; res.Dstate = [D.alive, D.order.type, !!D.order.hold, D.manualFrom, D.idleSince && Math.round(G.t - D.idleSince), D.manual, G.over && JSON.stringify({ w: G.over.winner, how: G.over.how, t: Math.round(G.over.t || 0) })]; res.movedStays = M.manual === true;
  // the computer's own orders never set it
  G.teams[1].isAI = true; const e = addUnit('rifle', G.teams[1], 100, 100); commandMove([e], 200, 200); res.aiManual = !!e.manual;
  return res;
})()`);
console.log(JSON.stringify(r));
const ok = r.manualSet && r.AidleGuard && r.defendersC > 0 && r.defendersA === 0 && r.AhuntAfterAuto === 0 && r.ChuntAfterAuto > 0 && r.stopClears && r.AhuntAfterStop > 0 && !r.aiManual && r.targetDied && r.attackStillManual && r.beforeIdleLimit && r.attackReleased && r.movedStays;
console.log(ok ? 'PASS' : 'FAIL'); process.exit(ok ? 0 : 1);
