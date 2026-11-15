// Bridges that can be destroyed (maps with `breakable`), attack ground and Engineers, headless: a span is only hurt by an
// ordered attack, goes down with what stands on it, turns to water (routes go round), is rebuilt by an Engineer (the
// computer trains one for it), and travels to an online copy.
// node tools/sim/bridges.js <repo>
const vm = require('vm');
const root = process.argv[2];
const headless = require(root + '/server/headless.js');
const ctx = headless.load(), run = (s) => vm.runInContext(s, ctx);
let fails = 0;
const ok = (name, v, extra) => { console.log((v ? 'ok   ' : 'FAIL ') + name + (extra !== undefined ? '  ' + JSON.stringify(extra) : '')); if (!v) fails++; };
const step = (sec) => { const up = ctx.get('update'); for (let i = 0; i < sec * 30; i++) up(1 / 30); };

run(`newWorld('allies', 'normal', 5, 0, true, 'twinlakes'); G.me = -1; 0`);
ok('four spans on Twin Lakes', run('G.spans.length') === 4, run('G.spans.map((s) => [s.id, s.cx, s.cy, s.w, s.h])'));
ok('other maps have none', run(`(() => { const g = G; newWorld('allies', 'normal', 5, 0, true, 'river'); const n = G.spans.length; G = g; setMapSize(mapSize('twinlakes')); return n; })()`) === 0);

// The north span of the west bridge: tanks on the north bank, an enemy soldier on the deck, a truck bound across.
run(`var S = G.spans[0], T0 = G.teams[0], T1 = G.teams[1];
  var north = { x: S.x, y: (S.cy - 3) * CELL }, south = { x: S.x, y: (S.cy + S.h + 3) * CELL };
  var tanks = [-2, -1, 0, 1, 2, 3].map((i) => addUnit('mtank', T0, north.x + i * 14, north.y));
  var onDeck = addUnit('rifle', T1, S.x, S.y);
  var idle = addUnit('mtank', T0, north.x, north.y - 40);
  0`);
ok('span is not an entity', run('!G.entities.includes(S) && G.byId.get(S.id) === S'));
step(10);
ok('nobody fires at it unasked', run('S.hp === S.maxHp'));
run(`commandAttack(tanks, S); 0`);
step(10);
ok('ordered tanks hurt it', run('S.hp < S.maxHp'), run('Math.round(S.hp)'));
ok('the idle tank does not join in', run('idle.target !== S'));
let t = 10;
while (run('S.alive') && t < 240) { step(2); t += 2; }
ok('span destroyed', !run('S.alive'), { seconds: t });
ok('its cells are water and blocked', run('S.cells.every((c) => G.terr[c] === 4 && G.block[c] === 1)'));
ok('the soldier on the deck went down with it', run('!onDeck.alive'));
ok('attackers stand down', run(`tanks.every((u) => u.order.type !== 'attack')`), run('tanks.map((u) => u.order.type)'));
ok('the banks still connect another way', run('connected(cellOfPos(north.x, north.y), cellOfPos(south.x, south.y))'));

// A unit sent across now goes round (or as near as it can), never over the gap.
run(`commandMove([idle], south.x, south.y); 0`);
let wet = false;
for (let i = 0; i < 60 && !wet; i++) { step(1); wet = run('S.cells.includes(cellOfPos(idle.x, idle.y))'); }
ok('nobody drives over the gap', !wet && run('idle.alive'));

// Attack ground: a spot away from any bridge is shelled until another order; a spot on a span attacks the span.
run(`var gunner = addUnit('mtank', T0, north.x - 60, north.y - 30), gx = north.x - 60, gy = north.y - 140; commandAttackGround([gunner], gx, gy); 0`);
ok('attack ground makes a spot target', run(`gunner.order.type === 'attack' && gunner.order.target.kind === 'spot'`));
let fired = 0;
for (let i = 0; i < 24; i++) { step(0.5); if (run('gunner.cd > 0.5')) fired++; }
ok('the unit keeps shelling the spot', run(`gunner.order.type === 'attack' && gunner.order.target.alive`) && fired >= 4, { reloads: fired });
run(`commandAttackGround([gunner], G.spans[2].x, G.spans[2].y); 0`);
ok('attack ground on a bridge names its span', run('gunner.order.target === G.spans[2]'));
run('commandStop([gunner]); 0');

// Engineers: one rebuilds the span and is used up; one repairs a damaged structure.
run(`var eng = addUnit('engineer', T0, north.x + 30, north.y - 20), eng2 = addUnit('engineer', T0, north.x + 40, north.y - 20); 0`);
ok('engineer is unarmed and cheap to kill', run('!eng.def.weapon && eng.maxHp === 25 && eng.def.cost === 500'));
run(`commandEngineer([eng], S); 0`);
ok('engineer takes the job', run(`eng.order.type === 'engineer' && eng.order.target === S`));
let et = 0;
while (!run('S.alive') && et < 60) { step(1); et++; }
ok('engineer rebuilt the span', run('S.alive && S.hp === S.maxHp && S.cells.every((c) => G.terr[c] === 5 && G.block[c] === 0)'), { seconds: et });
ok('and was used up', run('!eng.alive'));
ok('no job on a standing span', run(`(commandEngineer([eng2], S), eng2.order.type !== 'engineer')`));
run(`var cyB = buildingsOf(0).find((b) => b.type === 'cy') || addBuilding('cy', T0, Math.floor(north.x / CELL) - 1, S.cy - 12); cyB.buildT = 1; cyB.hp = 300;
  eng2.x = cyB.x; eng2.y = (cyB.cy + cyB.h + 2) * CELL; commandEngineer([eng2], cyB); 0`);
et = 0;
while (run('eng2.alive') && et < 60) { step(1); et++; }
ok('engineer repaired the structure in full', run('!eng2.alive && cyB.hp === cyB.maxHp'), { seconds: et });
run(`var eng3 = addUnit('engineer', T1, cyB.x, (cyB.cy + cyB.h + 2) * CELL); cyB.hp = 300; commandEngineer([eng3], cyB); 0`);
ok('an enemy engineer cannot repair it', run(`eng3.order.type !== 'engineer'`));

// Both sides train Engineers at a Barracks.
run(`for (const T of [T0, T1]) { const c = buildingsOf(T.id).find((b) => b.type === 'cy'); const bk = addBuilding('barracks', T, c.cx + 4, c.cy); bk.buildT = 1; T.credits = 2000; startProduction(T, 'engineer'); } 0`);
step(40);
ok('both factions train an Engineer for 500', run(`[T0, T1].every((T) => unitsOf(T.id).some((u) => u.type === 'engineer' && Math.hypot(u.x - T.start.cx * CELL, u.y - T.start.cy * CELL) < 400) && Math.round(T.credits) === 1500)`), run('[T0, T1].map((T) => [T.faction, Math.round(T.credits)])'));

// Online: the snapshot carries the spans; an order from a remote player can name one.
run(`var P = NetCore.peer(1), snap = null; NetCore.hosting = true; NetCore.snapshots([P], (p, s) => { snap = s; }); 0`);
ok('first snapshot carries the spans', run('!!(snap && snap.sp && snap.sp.length === 4 && snap.sp[0][1] === 1)'), run('snap && snap.sp'));
run(`snap = null; NetCore.snapshots([P], (p, s) => { snap = s; }); 0`);
ok('nothing sent while unchanged', run('!snap || !snap.sp'));
run(`var mine = addUnit('mtank', T1, south.x, south.y); NetCore.applyCommand(1, { f: 'commandAttack', a: [[{ $e: mine.id }], { $e: S.id }] }); 0`);
ok('a remote attack order names the span', run('mine.order.type === "attack" && mine.order.target === S'));
run(`NetCore.applyCommand(1, { f: 'commandAttackGround', a: [[{ $e: mine.id }], 400, 400] }); 0`);
ok('a remote attack-ground order works', run(`mine.order.target.kind === 'spot' && mine.order.target.x === 400`));
run(`S.hp = 1; damage(S, 500, 'AP', mine); var eng4 = addUnit('engineer', T1, south.x, south.y); NetCore.applyCommand(1, { f: 'commandEngineer', a: [[{ $e: eng4.id }], { $e: S.id }] }); 0`);
ok('a remote engineer order names the span', run(`!S.alive && eng4.order.type === 'engineer' && eng4.order.target === S`));
run(`snap = null; NetCore.snapshots([P], (p, s) => { snap = s; }); 0`);
ok('a spot target travels in a snapshot without breaking it', run(`!!snap && !!snap.e[mine.id] && JSON.stringify(snap).length > 0`));
run(`applySpans([[6000, 1], [0, 0], [6000, 1], [6000, 1]]); 0`);
ok('a copy applies the host state', run('S.alive && !G.spans[1].alive && G.terr[G.spans[1].cells[0]] === 4'));

// A saved game keeps the spans and the orders that name them.
if (run('typeof SaveGame !== "undefined" && !!SaveGame.freeze')) {
  run(`commandAttack([mine], S); var g2 = SaveGame.thaw(SaveGame.freeze(G)); 0`);
  ok('a save keeps the spans', run('g2.spans.length === 4 && g2.spans[1].alive === false && g2.spans[1].cells.length === G.spans[1].cells.length'));
  ok('a saved attack order still names its span', run('g2.entities.find((e) => e.id === mine.id).order.target === g2.spans[0]'));
} else console.log('(SaveGame not loaded here: save not checked)');

// The computer trains an Engineer for a destroyed span and sends it; it does not train a second one meanwhile.
run(`applySpans([[6000, 1], [6000, 1], [6000, 1], [6000, 1]]); for (const u of G.entities) if (u.kind === 'unit' && u.def.engineer) u.alive = false;
  damage(S, 1e6, 'AP', gunner); T1.isAI = true; T1.credits = 3000; T1.spanT = 0; T1.queues.infantry.length = 0; aiBridges(T1); 0`);
ok('the computer queues an Engineer', run(`T1.queues.infantry.filter((i) => i.type === 'engineer').length === 1`));
run(`T1.spanT = 0; aiBridges(T1); 0`);
ok('only one at a time', run(`T1.queues.infantry.filter((i) => i.type === 'engineer').length === 1`));
let ct = 0;
while (!run('S.alive') && ct < 400) { step(2); ct += 2; }
ok('its Engineer walks over and rebuilds the span', run('S.alive'), { seconds: ct });
ok('and it trains no more once the bridges stand', run(`(T1.spanT = 0, aiBridges(T1), !T1.queues.infantry.some((i) => i.type === 'engineer') && !unitsOf(1).some((u) => u.def.engineer))`));

console.log(fails ? fails + ' FAILED' : 'all passed');
process.exit(fails ? 1 : 0);
