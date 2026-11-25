// Walls and gates, headless: laying a line (rules, price, limits), what each kind stops, gates and alliances, wire under
// tracks, ordered fire only, selling, Auto Attack units shooting a way through, and an online copy.
// node tools/sim/walls.js <repo>
const vm = require('vm');
const root = process.argv[2];
const ctx = require(root + '/server/headless.js').load(), run = (s) => vm.runInContext(s, ctx);
let fails = 0;
const ok = (name, v, extra) => { console.log((v ? 'ok   ' : 'FAIL ') + name + (extra !== undefined ? '  ' + JSON.stringify(extra) : '')); if (!v) fails++; };
const step = (sec) => { const up = ctx.get('update'); for (let i = 0; i < sec * 30; i++) up(1 / 30); };

run(`newWorld('allies', 'normal', 5, 0, true, 'twinlakes'); G.me = -1;
  var T0 = G.teams[0], T1 = G.teams[1], cy0 = buildingsOf(0).find((b) => b.type === 'cy');
  var bx = cy0.cx, by = cy0.cy + cy0.h + 3;   // a row of open ground south of the yard
  T0.credits = 5000; 0`);
ok('nothing without a Barracks', run(`placeWalls(T0, 'sandbag', bx - 2, by, bx + 4, by)`) === 0);
run(`var bk = addBuilding('barracks', T0, cy0.cx + 5, cy0.cy); bk.buildT = 1; 0`);
ok('Soviet wire is not for the Allies', run(`placeWalls(T0, 'wire', bx - 2, by, bx + 4, by)`) === 0);
ok('concrete and gates need a War Factory', run(`placeWalls(T0, 'concrete', bx - 2, by, bx + 4, by) + placeWalls(T0, 'gate', bx, by, bx, by)`) === 0);
const n1 = run(`placeWalls(T0, 'sandbag', bx - 2, by, bx + 4, by)`);
ok('a line of sandbags is laid and paid for', n1 === 7 && run('T0.credits') === 5000 - 7 * 25 && run('G.wallN') === 7, { laid: n1 });
ok('they block the ground', run(`[0,1,2,3,4,5,6].every((i) => G.block[idx(bx - 2 + i, by)] === 1 && G.wall[idx(bx - 2 + i, by)] === 1)`));
ok('no second piece on the same cell', run(`placeWalls(T0, 'sandbag', bx - 2, by, bx + 4, by)`) === 0);
ok('not far from the base', run(`placeWalls(T0, 'sandbag', bx, by + 30, bx + 3, by + 30)`) === 0);
ok('money runs out mid-line', run(`(T0.credits = 60, placeWalls(T0, 'sandbag', bx - 2, by + 2, bx + 4, by + 2))`) === 2 && run('T0.credits') === 10);
ok('a slanted line steps diagonally, one piece a step', run(`(() => { const l = wallLine('sandbag', 5, 5, 9, 8); for (let i = 1; i < l.length; i++) if (Math.max(Math.abs(cellX(l[i]) - cellX(l[i - 1])), Math.abs(cellY(l[i]) - cellY(l[i - 1]))) !== 1) return false; return l.length === 5 && wallLine('sandbag', 5, 5, 9, 9).length === 5; })()`));
ok('a slanted line is two straight runs (diagonal, then straight)', run(`(() => { const l = wallLine('sandbag', 5, 5, 14, 9).map((c) => [cellX(c), cellY(c)]); let turns = 0; for (let i = 2; i < l.length; i++) if (l[i][0] - l[i - 1][0] !== l[i - 1][0] - l[i - 2][0] || l[i][1] - l[i - 1][1] !== l[i - 1][1] - l[i - 2][1]) turns++; return turns === 1 && l.length === 10 && l[9][0] === 14 && l[9][1] === 9; })()`));
ok('a line stops at ' + run('WALL_LINE_MAX') + ' pieces', run(`wallLine('sandbag', 2, 2, 100, 2).length`) === run('WALL_LINE_MAX'));
ok('selling gives half back', run(`(T0.credits = 0, sellWall(T0, bx - 2, by + 2))`) === true && run('T0.credits') === 12 && run(`G.wall[idx(bx - 2, by + 2)]`) === 0 && run(`G.block[idx(bx - 2, by + 2)]`) === 0);
ok('not another side to sell', run(`sellWall(T1, bx, by)`) === false);

// Concrete, a gate, and who passes.
run(`var fa = addBuilding('factory', T0, cy0.cx - 5, cy0.cy); fa.buildT = 1; T0.credits = 5000;
  var gy = by + 3; placeWalls(T0, 'concrete', bx - 4, gy, bx - 2, gy); var c0 = T0.credits, gn = placeWalls(T0, 'gate', bx, gy, bx + 5, gy), gpaid = c0 - T0.credits; placeWalls(T0, 'concrete', bx + 2, gy, bx + 4, gy);
  var gate = idx(bx, gy); 0`);
ok('a gate is three cells for one price', run('gn === 1 && gpaid === WALLS.gate.cost && G.wall[gate] === 4 && G.wall[gate - 1] === 6 && G.wall[gate + 1] === 6 && G.wall[idx(bx + 2, gy)] === 3'), run('[gn, gpaid]'));
ok('a gate needs all three cells free', run(`placeWalls(T0, 'gate', bx - 2, gy, bx - 2, gy) + placeWalls(T0, 'gate', bx + 1, gy - 1, bx + 1, gy + 3)`) === 0);
ok('the gate does not block the ground map, but stops the unnamed', run('G.block[gate] === 0 && !freeCell(gate)'));
run(`var mine = addUnit('rifle', T0, 0, 0), foe = addUnit('rifle', T1, 0, 0); 0`);
ok('its own side passes a gate, the enemy does not', run(`(MOVER = mine, freeCell(gate)) && !(MOVER = foe, freeCell(gate))`) && run('(MOVER = null, true)'));
run(`mine.x = (bx + 0.5) * CELL; mine.y = (gy - 2) * CELL; commandMove([mine], (bx + 0.5) * CELL, (gy + 3) * CELL); 0`);
step(12);
ok('a friendly soldier walks through the gate', run(`mine.y > (gy + 2) * CELL`), run('[Math.round(mine.y / CELL), gy]'));

run(`var mtk = addUnit('mtank', T0, (bx + 0.5) * CELL, (gy - 2) * CELL); commandMove([mtk], (bx + 0.5) * CELL, (gy + 3) * CELL); 0`);
step(14);
ok('a friendly tank drives through the gate', run(`mtk.y > (gy + 2) * CELL`), run('[Math.round(mtk.y / CELL), gy]'));
run(`foe.x = (bx + 0.5) * CELL; foe.y = (gy + 3) * CELL; commandMove([foe], (bx + 0.5) * CELL, (gy - 2) * CELL); 0`);
step(14);
ok('an enemy soldier cannot walk in through it', run(`foe.y > gy * CELL`), run('[Math.round(foe.y / CELL), gy]'));

// A gate is one thing: one health, taken down whole.
run(`hitWall(gate - 1, 100); 0`);
ok('a hit on one cell of a gate hurts all of it', run('[gate - 1, gate, gate + 1].every((c) => G.wallHp[c] === WALLS.gate.hp - 100)'));
run(`var c1 = T0.credits, sold = sellWall(T0, bx + 1, gy); 0`);
ok('taking a gate down removes all three cells for half its price', run('sold && T0.credits - c1 === WALLS.gate.cost / 2 && [gate - 1, gate, gate + 1].every((c) => G.wall[c] === 0)'));
run(`placeWalls(T0, 'gate', bx, gy, bx, gy); hitWall(gate + 1, 5000); 0`);
ok('a gate shot down falls whole', run('[gate - 1, gate, gate + 1].every((c) => G.wall[c] === 0)'));

// Barbed wire: infantry stopped, vehicles through, flattening it.
run(`var cy1 = buildingsOf(1).find((b) => b.type === 'cy'), bk1 = addBuilding('barracks', T1, cy1.cx + 5, cy1.cy); bk1.buildT = 1; T1.credits = 3000;
  for (const u of unitsOf(1)) u.alive = false;   // (its starting units may be standing on the row)
  var wx = cy1.cx, wy = cy1.cy + cy1.h + 3; 0`);
ok('a line of wire', run(`placeWalls(T1, 'wire', wx - 2, wy, wx + 4, wy)`) === 7);
run(`var wc = idx(wx + 1, wy), sol = addUnit('rifle', T1, 0, 0), tank = addUnit('htank', T1, (wx + 1.5) * CELL, (wy - 2) * CELL); 0`);
ok('wire stops infantry, not vehicles', run(`!(MOVER = sol, freeCell(wc)) && (MOVER = tank, freeCell(wc))`) && run('(MOVER = null, G.block[wc] === 0)'));
run(`commandMove([tank], (wx + 1.5) * CELL, (wy + 3) * CELL); 0`);
step(10);
ok('a tank drives through and flattens it', run(`tank.y > (wy + 1) * CELL && G.wall[wc] === 0`));

// Only ordered fire hurts a wall.
run(`var gun = addUnit('mtank', T1, (bx + 2.5) * CELL, (by - 4) * CELL), target = idx(bx + 2, by); T0.isAI = false; 0`);
step(8);
ok('nobody shoots a wall unasked', run('G.wallHp[target]') === 100);
run(`commandAttackGround([gun], (bx + 2.5) * CELL, (by + 0.5) * CELL); 0`);
ok('attack ground on a wall names its cell', run(`gun.order.target.kind === 'spot' && gun.order.target.wall === target`));
let t = 0;
while (run('G.wall[target]') && t < 60) { step(1); t++; }
ok('the piece is shot down and the ground is open', run('G.wall[target] === 0 && G.block[target] === 0'), { seconds: t });
step(2);
ok('the attacker stands down', run(`gun.order.type !== 'attack'`));

// Auto Attack: hunters walled off from their target shoot a way through.
run(`for (const u of G.entities) if (u.kind === 'unit') u.alive = false;
  clearWalls(); T0.credits = 9000;
  // a ring of concrete round the Allied yard, barracks and factory
  var x0 = cy0.cx - 7, x1 = cy0.cx + 9, y0 = cy0.cy - 3, y1 = cy0.cy + 6, ring = 0;
  ring += placeWalls(T0, 'concrete', x0, y0, x1, y0) + placeWalls(T0, 'concrete', x0, y1, x1, y1) + placeWalls(T0, 'concrete', x0, y0, x0, y1) + placeWalls(T0, 'concrete', x1, y0, x1, y1);
  // (close any gap the rules left: trees, the edge of the building range)
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) { const c = idx(x, y); if ((x === x0 || x === x1 || y === y0 || y === y1) && !G.block[c] && !G.bld[c] && !G.wall[c]) { setWall(c, 3, 0, 300); ring++; } }
  G.fog[1].fill(1);
  var raid = [0, 1, 2, 3].map((i) => addUnit('htank', T1, (x0 + 4 + i * 2) * CELL, (y1 + 6) * CELL)); for (const u of raid) setHunt(u); T1.isAI = true; 0`);
ok('the base is walled in', run('ring') > 40 && run(`wallInTheWay(raid[0], cy0) >= 0`), { pieces: run('ring') });
let bt = 0, breaching = false;
while (bt < 120 && run('cy0.hp === cy0.maxHp && bk.hp === bk.maxHp && fa.hp === fa.maxHp')) { step(2); bt += 2; if (run('raid.some((u) => u.breach)')) breaching = true; }
ok('hunters shoot a way through and reach the base', breaching && bt < 120, { seconds: bt, breaching });

// Online: a copy gets the cells.
run(`var P = NetCore.peer(1), snaps = []; NetCore.hosting = true; for (let i = 0; i < 6; i++) NetCore.snapshots([P], (p, s) => snaps.push(s)); var wl = snaps.find((s) => s.wl); 0`);
ok('snapshots carry the walls a player can see', run('!!wl && wl.wl.length % 4 === 0 && wl.wl.length >= 4'), run('wl && wl.wl.length / 4'));
run(`var before = G.wallN, keep = [G.wall.slice(), G.block.slice()]; clearWalls(); 0`);
ok('clearing unblocks everything', run('G.wallN === 0 && !keep[0].some((k, c) => k && WALL_BY_ID[k].hard && G.block[c])'));
run(`applyWalls(wl.wl); 0`);
ok('a copy rebuilds them from the snapshot', run('G.wallN === wl.wl.length / 4 && G.wallN > 0'));
run(`NetCore.applyCommand(0, { f: 'sellWall', a: [{ $t: 0 }, x0, y0] }); 0`);
ok('a remote order sells a piece', run('G.wall[idx(x0, y0)] === 0'));
run(`T0.credits = 500; var lx = x0 + 3, ly = y0 + 1; NetCore.applyCommand(0, { f: 'placeWalls', a: [{ $t: 0 }, 'sandbag', lx, ly, lx, ly] }); 0`);
ok('a remote order lays one', run('G.wall[idx(lx, ly)] === 1 && T0.credits === 475'));

// A gate laid over a side's own wall: the pieces it covers are replaced, half their price back; never over an enemy's.
run(`newWorld('allies', 'normal', 5, 0, true, 'twinlakes'); G.me = -1;
  var A = G.teams[0], B = G.teams[1], yd = buildingsOf(0).find((b) => b.type === 'cy');
  for (const t of ['barracks', 'factory']) { const b = addBuilding(t, A, yd.cx + (t === 'factory' ? -5 : 5), yd.cy); b.buildT = 1; }
  var wx = yd.cx - 3, wy = yd.cy + yd.h + 3; A.credits = 5000;
  var laid = placeWalls(A, 'concrete', wx, wy, wx + 6, wy); A.credits = 1000;
  var gOk = placeWalls(A, 'gate', wx + 3, wy, wx + 4, wy), mid = idx(wx + 3, wy); 0`);
ok('a gate goes over your own concrete', run('laid === 7 && gOk === 1 && G.wall[mid] === 4 && G.wall[mid - 1] === 6 && G.wall[mid + 1] === 6 && G.wall[mid - 2] === 3 && G.wall[mid + 2] === 3'), run('[laid, gOk]'));
ok('it pays the gate less half the three pieces', run('A.credits === 1000 - WALLS.gate.cost + 3 * Math.floor(WALLS.concrete.cost / 2)'), run('A.credits'));
ok('the gate cells no longer block the ground map', run('!G.block[mid - 1] && !G.block[mid] && !G.block[mid + 1] && G.wallN === 7'));
run(`var sb = idx(wx, wy + 2); A.credits = 5000; placeWalls(A, 'sandbag', wx, wy + 2, wx + 2, wy + 2); setWall(idx(wx + 3, wy + 2), 3, 1, 300); A.credits = 1000; 0`);
ok('not over an enemy piece', run(`placeWalls(A, 'gate', wx + 2, wy + 2, wx + 3, wy + 2) === 0 && G.wall[idx(wx + 3, wy + 2)] === 3 && A.credits === 1000`));
ok('not over another gate', run(`placeWalls(A, 'gate', wx + 4, wy, wx + 5, wy) === 0`));
ok('the refund can make up a short purse', run(`(A.credits = WALLS.gate.cost - 30, placeWalls(A, 'gate', wx + 1, wy + 2, wx + 2, wy + 2))`) === 1, run('A.credits'));

// A diagonal wall: pieces touch only at their corners, and nothing slips between them (route, steps or a straight shortcut).
run(`G.wall.fill(0); G.wallTeam.fill(0); G.wallHp.fill(0); G.wallN = 0;
  var dg = null;
  for (let y = 10; y < MAP - 30 && !dg; y++) for (let x = 10; x < MAP - 30 && !dg; x++) {
    let ok = true; for (let k = -2; k < 22 && ok; k++) for (const o of [-2, -1, 0, 1, 2]) if (!freeCell(idx(x + k, y + k + o)) || G.bld[idx(x + k, y + k + o)]) ok = false;
    if (ok) dg = [x, y];
  }
  0`);
ok('open ground for a diagonal wall', run('!!dg'));
const nd = run(`(() => { let n = 0; for (let k = 0; k < 20; k++) { const c = idx(dg[0] + k, dg[1] + k); setWall(c, WALLS.concrete.id, 0, WALLS.concrete.hp); n++; } return n; })()`);
ok('twenty pieces on a diagonal', nd === 20 && run('wallLine("concrete", dg[0], dg[1], dg[0] + 19, dg[1] + 19).length') === 20);
ok('the corner between two pieces is shut', run('cornerShut(idx(dg[0] + 6, dg[1] + 5), idx(dg[0] + 5, dg[1] + 6))') && !run('los((dg[0] + 6.5) * CELL, (dg[1] + 5.5) * CELL, (dg[0] + 5.5) * CELL, (dg[1] + 6.5) * CELL, 1)'));
run(`var wk = addUnit('rifle', T0, (dg[0] + 10.5) * CELL, (dg[1] + 9.5) * CELL), wv = addUnit('mtank', T0, (dg[0] + 13.5) * CELL, (dg[1] + 12.3) * CELL);
  var side = (u) => Math.sign(u.x - u.y - (dg[0] - dg[1]) * CELL);
  var s0 = [side(wk), side(wv)], crossed = 0;
  commandMove([wk], (dg[0] + 9.5) * CELL, (dg[1] + 10.5) * CELL); commandMove([wv], (dg[0] + 12.5) * CELL, (dg[1] + 14.5) * CELL);
  // pushed straight at the corner every step as well, as a crowd would
  0`);
for (let i = 0; i < 20 * 30; i++) { run(`tryMove(wk, -0.7, 0.7); tryMove(wv, -0.7, 0.7); if (side(wk) !== s0[0] && wk.x > dg[0] * CELL + 20 && wk.x < (dg[0] + 19) * CELL) crossed++; if (side(wv) !== s0[1] && wv.x > dg[0] * CELL + 20 && wv.x < (dg[0] + 19) * CELL) crossed++; 0`); ctx.get('update')(1 / 30); }
ok('a soldier and a tank pushed at it never slip through', run('crossed') === 0, run('[crossed, side(wk), side(wv), s0]'));

// A diagonal gate (straight across the iso view) laid over the diagonal wall: three cells corner to corner, its own pass.
run(`wk.alive = false; wv.alive = false; T0.credits = 5000; var gm = idx(dg[0] + 10, dg[1] + 10), gd = placeWalls(T0, 'gate', dg[0] + 10, dg[1] + 10, dg[0] + 11, dg[1] + 11); 0`);
ok('a diagonal gate goes over the diagonal wall', run('gd === 1 && G.wall[gm] === 7 && G.wall[gm - MAP - 1] === 6 && G.wall[gm + MAP + 1] === 6 && G.wall[gm - 2 * MAP - 2] === 3 && gateDiag(gm - MAP - 1) === 1'), run('[gd, G.wall[gm]]'));
ok('its cells are one gate', run('JSON.stringify(gateCells(gm + MAP + 1)) === JSON.stringify([gm - MAP - 1, gm, gm + MAP + 1])'));
ok('the other diagonal lies north-east to south-west', run('JSON.stringify(wallLine("gate", 20, 20, 21, 19)) === JSON.stringify([idx(19, 21), idx(20, 20), idx(21, 19)])'));
ok('its corners are shut to the enemy, open to its own', run(`(MOVER = foe, cornerShut(gm + 1, gm + MAP)) && (MOVER = mine, !cornerShut(gm + 1, gm + MAP)) && (MOVER = null, true)`));
run(`var gw = addUnit('rifle', T0, (dg[0] + 11.5) * CELL, (dg[1] + 9.5) * CELL); commandMove([gw], (dg[0] + 9.5) * CELL, (dg[1] + 11.5) * CELL); 0`);
for (let i = 0; i < 12 * 30; i++) ctx.get('update')(1 / 30);
ok('a friendly soldier walks through the diagonal gate', run('side(gw) < 0'), run('[gw.x / CELL, gw.y / CELL]'));

console.log(fails ? fails + ' FAILED' : 'all passed');
process.exit(fails ? 1 : 0);
