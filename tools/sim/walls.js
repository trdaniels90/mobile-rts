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
ok('a slanted line has no corner gaps', run(`(() => { const l = wallLine('sandbag', 5, 5, 9, 8); for (let i = 1; i < l.length; i++) if (Math.abs(cellX(l[i]) - cellX(l[i - 1])) + Math.abs(cellY(l[i]) - cellY(l[i - 1])) !== 1) return false; return l.length === 8; })()`));
ok('a line stops at ' + run('WALL_LINE_MAX') + ' pieces', run(`wallLine('sandbag', 2, 2, 100, 2).length`) === run('WALL_LINE_MAX'));
ok('selling gives half back', run(`(T0.credits = 0, sellWall(T0, bx - 2, by + 2))`) === true && run('T0.credits') === 12 && run(`G.wall[idx(bx - 2, by + 2)]`) === 0 && run(`G.block[idx(bx - 2, by + 2)]`) === 0);
ok('not another side to sell', run(`sellWall(T1, bx, by)`) === false);

// Concrete, a gate, and who passes.
run(`var fa = addBuilding('factory', T0, cy0.cx - 5, cy0.cy); fa.buildT = 1; T0.credits = 5000;
  var gy = by + 3; placeWalls(T0, 'concrete', bx - 3, gy, bx - 1, gy); placeWalls(T0, 'gate', bx, gy, bx + 5, gy); placeWalls(T0, 'concrete', bx + 1, gy, bx + 3, gy);
  var gate = idx(bx, gy); 0`);
ok('a gate is one piece', run('G.wall[gate] === 4 && G.wall[idx(bx + 1, gy)] === 3'));
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

// Barbed wire: infantry stopped, vehicles through, flattening it.
run(`var cy1 = buildingsOf(1).find((b) => b.type === 'cy'), bk1 = addBuilding('barracks', T1, cy1.cx + 5, cy1.cy); bk1.buildT = 1; T1.credits = 3000;
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

console.log(fails ? fails + ' FAILED' : 'all passed');
process.exit(fails ? 1 : 0);
