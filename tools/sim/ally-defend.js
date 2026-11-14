// Defend ally with a choice of ally (3 v 3): units go to the picked ally, switch when another is picked,
// answer raiders at that ally's base and enemy units hitting its units just outside it. Headless.
// node tools/sim/ally-defend.js <repo> [map]
const vm = require('vm');
const [root, map = 'lakes'] = process.argv.slice(2);
const ctx = require(root + '/server/headless.js').load(), run = (s) => vm.runInContext(s, ctx);
run(`newWorld('allies', 'normal', 5, 0, false, '${map}', [0, 1, 2, 3, 4, 5].map((i) => ({ faction: i % 2 ? 'soviets' : 'allies', ally: i % 2, ai: false })));
  G.me = 0; for (const t of G.teams) { t.auto = false; t.credits = 0; } 0`);
console.log(JSON.stringify(run(`(() => {
  const step = (s) => { for (let i = 0; i < s * 30; i++) update(1 / 30); };
  const me = G.teams[0], res = {};
  const cyOf = (id) => buildingsOf(id).find((b) => b.type === 'cy');
  const cy2 = cyOf(2), cy4 = cyOf(4), cy1 = cyOf(1);
  const mine = Array.from({ length: 8 }, () => addUnit('mtank', me, me.start.cx * CELL, me.start.cy * CELL + 90));
  step(2);
  const near = (u, b, cells) => Math.hypot(u.x - b.x, u.y - b.y) < cells * CELL;
  setAssist(me, true, 4); res.side = me.assistSide;
  step(150);
  res.atAlly4 = mine.filter((u) => near(u, cy4, 20)).length;
  // raiders at ally 4's base
  const foe = (x, y) => { const u = addUnit('mtank', G.teams[1], x, y); u.hp = u.maxHp = 600; return u; };
  const R = Array.from({ length: 3 }, (_, i) => foe(cy4.x + (6 + i) * CELL, cy4.y + 8 * CELL));
  for (const r of R) { r.order = { type: 'attack', target: cy4 }; r.target = cy4; }
  step(40);
  res.raidersDead1 = R.filter((r) => !r.alive).length;
  // enemy attacking an allied unit 18 cells from its base
  const bait = addUnit('mtank', G.teams[4], cy4.x, cy4.y + 18 * CELL); bait.hp = bait.maxHp = 4000;
  const R2 = Array.from({ length: 2 }, (_, i) => foe(bait.x + (3 + i) * CELL, bait.y));
  for (const r of R2) { r.order = { type: 'attack', target: bait }; r.target = bait; }
  step(40);
  res.raidersDead2 = R2.filter((r) => !r.alive).length;
  // switch to ally 2
  setAssist(me, true, 2); step(150);
  res.atAlly2 = mine.filter((u) => u.alive && near(u, cy2, 20)).length; res.alive = mine.filter((u) => u.alive).length;
  return res;
})()`)));
