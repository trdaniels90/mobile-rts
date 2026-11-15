// Bridges that can be destroyed (maps with `breakable`), headless: a span is only hurt by an ordered attack, goes down
// with what stands on it, turns to water (routes go round), is rebuilt for credits, and travels to an online copy.
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

// Rebuilding.
run('T0.credits = 1000; 0');
ok('too poor to rebuild', run('rebuildSpan(T0, S)') === false);
run('T0.credits = 5000; 0');
ok('rebuild ordered and paid', run('rebuildSpan(T0, S)') === true && run('T0.credits') === 5000 - run('SPAN.rebuild'));
ok('no second payment', run('rebuildSpan(T1, S)') === false);
step(run('SPAN.rebuildTime') - 2);
ok('not up early', !run('S.alive'));
step(4);
ok('rebuilt: deck again, full health', run('S.alive && S.hp === S.maxHp && S.cells.every((c) => G.terr[c] === 5 && G.block[c] === 0)'));

// Online: the snapshot carries the spans; an order from a remote player can name one.
run(`var P = NetCore.peer(1), snap = null; NetCore.hosting = true; NetCore.snapshots([P], (p, s) => { snap = s; }); 0`);
ok('first snapshot carries the spans', run('!!(snap && snap.sp && snap.sp.length === 4 && snap.sp[0][1] === 1)'), run('snap && snap.sp'));
run(`snap = null; NetCore.snapshots([P], (p, s) => { snap = s; }); 0`);
ok('nothing sent while unchanged', run('!snap || !snap.sp'));
run(`var mine = addUnit('mtank', T1, south.x, south.y); NetCore.applyCommand(1, { f: 'commandAttack', a: [[{ $e: mine.id }], { $e: S.id }] }); 0`);
ok('a remote attack order names the span', run('mine.order.type === "attack" && mine.order.target === S'));
run(`S.hp = 1; damage(S, 500, 'AP', mine); T1.credits = 4000; NetCore.applyCommand(1, { f: 'rebuildSpan', a: [{ $t: 1 }, { $e: S.id }] }); 0`);
ok('a remote rebuild order works', run('!S.alive && S.rebT > 0 && S.by === 1'));
run(`applySpans([[6000, 1, 0], [0, 0, 12], [6000, 1, 0], [6000, 1, 0]]); 0`);
ok('a copy applies the host state', run('S.alive && !G.spans[1].alive && G.spans[1].rebT === 12 && G.terr[G.spans[1].cells[0]] === 4'));

// A saved game keeps the spans and the orders that name them.
if (run('typeof SaveGame !== "undefined" && !!SaveGame.freeze')) {
  run(`commandAttack([mine], S); var g2 = SaveGame.thaw(SaveGame.freeze(G)); 0`);
  ok('a save keeps the spans', run('g2.spans.length === 4 && g2.spans[1].alive === false && g2.spans[1].cells.length === G.spans[1].cells.length'));
  ok('a saved attack order still names its span', run('g2.entities.find((e) => e.id === mine.id).order.target === g2.spans[0]'));
} else console.log('(SaveGame not loaded here: save not checked)');

// The computer rebuilds when it can well afford it.
run(`applySpans([[6000, 1, 0], [0, 0, 0], [6000, 1, 0], [6000, 1, 0]]); T1.isAI = true; T1.credits = 9000; T1.spanT = 0; aiBridges(T1); 0`);
ok('the computer orders a rebuild', run('G.spans[1].rebT > 0 && G.spans[1].by === 1'));

console.log(fails ? fails + ' FAILED' : 'all passed');
process.exit(fails ? 1 : 0);
