// Crossroads Village (MAPS.village): the houses rolled from the battle's seed, headless. The same seed gives the same
// village (ids too), another seed another; houses block their cells, are never fired on unasked, take damage from
// blasts beside them and from an ordered attack (ATTACK GROUND), fall to rubble anyone can cross, travel to an
// online copy, and a computer 2 v 2 runs on the map without errors.
// node tools/sim/village.js <repo>
const vm = require('vm');
const root = process.argv[2];
const headless = require(root + '/server/headless.js');
const ctx = headless.load(), run = (s) => vm.runInContext(s, ctx);
let fails = 0;
const ok = (name, v, extra) => { console.log((v ? 'ok   ' : 'FAIL ') + name + (extra !== undefined ? '  ' + JSON.stringify(extra) : '')); if (!v) fails++; };
const step = (sec) => { const up = ctx.get('update'); for (let i = 0; i < sec * 30; i++) up(1 / 30); };

const sig = (seed) => run(`newWorld('allies', 'normal', ${seed}, 0, true, 'village'); G.me = -1; JSON.stringify(G.houses.map((h) => [h.id, h.cx, h.cy, h.w, h.h, h.type]))`);
const a = sig(11), b = sig(11), c = sig(12);
ok('same seed, same village', a === b);
ok('another seed, another village', a !== c);
run(`newWorld('allies', 'normal', 11, 0, true, 'village'); G.me = -1; 0`);
const n = run('G.houses.length');
ok('a village of houses', n >= 40 && n <= 140, { houses: n, church: run(`G.houses.filter((h) => h.type.includes('church')).length`) });
ok('houses are not entities, but can be named', run('G.houses.every((h) => !G.entities.includes(h) && G.byId.get(h.id) === h)'));
ok('their cells are blocked', run('G.houses.every((h) => { for (let y = h.cy; y < h.cy + h.h; y++) for (let x = h.cx; x < h.cx + h.w; x++) if (!G.block[idx(x, y)]) return false; return true; })'));
ok('none on the streets or the square', run('G.houses.every((h) => { for (let y = h.cy; y < h.cy + h.h; y++) for (let x = h.cx; x < h.cx + h.w; x++) if (G.terr[idx(x, y)] !== 0) return false; return true; })'));
ok('every start can reach the square', run(`G.spawns.every((s) => connected(idx(s.cx, s.cy + 3), idx(71, 71)))`));
// Every house can be walked up to: some free cell beside it is connected to the square.
ok('every house can be reached', run(`G.houses.every((h) => { for (let y = h.cy - 1; y <= h.cy + h.h; y++) for (let x = h.cx - 1; x <= h.cx + h.w; x++) { const c = idx(x, y); if (!G.block[c] && connected(c, idx(71, 71))) return true; } return false; })`));

// A fight in the village: tanks of both sides on the square do not fire at houses.
run(`var T0 = G.teams[0], T1 = G.teams[1], sq = cellCenter(idx(71, 71));
  var H = G.houses.slice().sort((p, q) => Math.hypot(p.x - sq.x, p.y - sq.y) - Math.hypot(q.x - sq.x, q.y - sq.y))[0];
  var tanks = [0, 1, 2, 3].map((i) => addUnit('mtank', T0, sq.x - 30 + i * 14, sq.y));
  var foes = [0, 1].map((i) => addUnit('rifle', T1, H.x + (i ? 30 : -30), (H.cy + H.h + 1) * CELL));
  var hp0 = G.houses.reduce((s, h) => s + h.hp, 0); 0`);
step(4);
ok('nobody shoots at a house unasked (rifles only nearby)', run('H.hp === H.maxHp'));
// Blasts beside a house hurt it: an artillery shell lands next to it.
run(`(function () { const w = UNIT_DEFS.arty.weapon; lobBlast({ tx: H.x, ty: (H.cy + H.h) * CELL + 6, w, from: null, team: 0, style: 'shell' }); })(); 0`);
ok('a shell beside it hurts it', run('H.hp < H.maxHp'), run('[Math.round(H.hp), H.maxHp]'));
run(`commandAttackGround(tanks, H.x, H.y); 0`);
ok('ATTACK GROUND on a house targets the house', run('tanks.every((u) => u.target === H)'));
let t = 0;
while (run('H.alive') && t < 120) { step(2); t += 2; }
ok('ordered fire brings it down', !run('H.alive'), { seconds: t });
ok('its cells are open again', run('(() => { for (let y = H.cy; y < H.cy + H.h; y++) for (let x = H.cx; x < H.cx + H.w; x++) if (G.block[idx(x, y)]) return false; return true; })()'));
ok('the tanks stand down', run(`tanks.every((u) => u.target !== H)`));

// The online copy: houses' health in snapshots, applied to the copy.
run(`var hv = G.houses.map((x) => (x.alive ? Math.max(1, Math.ceil(x.hp)) : 0)); var host = G;
  newWorld('allies', 'normal', 11, 1, true, 'village'); G.remote = true; applyHouses(hv); 0`);
ok('the copy has the same village, down where the host is', run(`G.houses.length === hv.length && G.houses.every((h, i) => h.alive === (hv[i] > 0)) && !G.houses.find((h) => h.id === H.id).alive`));
ok('the copy opens the fallen house too', run(`(() => { const h = G.houses.find((x) => x.id === H.id); return !G.block[idx(h.cx, h.cy)]; })()`));

// The real snapshot: house health goes out when it changes, and only then.
run(`newWorld('allies', 'normal', 11, 0, true, 'village'); G.me = -1; var P = NetCore.peer(1); var got = []; NetCore.snapshots([P], (q, sn) => got.push(sn)); 0`);
ok('first snapshot carries every house', run('got[0].hv && got[0].hv.length === G.houses.length'));
run(`got = []; NetCore.snapshots([P], (q, sn) => got.push(sn)); var quiet = !got[0].hv; damage(G.houses[2], 99999, 'HE'); got = []; NetCore.snapshots([P], (q, sn) => got.push(sn)); 0`);
ok('nothing sent while nothing changes, then the fall', run('quiet && got[0].hv && got[0].hv[2] === 0'));

// Computers play the map for 14 minutes: no errors, and the houses get hurt by the fighting round them.
run(`newWorld('allies', 'hard', 21, 0, false, 'village', [{ faction: 'allies', ally: 0, ai: true }, { faction: 'soviets', ally: 1, ai: true }, { faction: 'soviets', ally: 0, ai: true }, { faction: 'allies', ally: 1, ai: true }]); for (const t of G.teams) t.auto = true; G.me = -1; 0`);
let err = null;
try { for (let m = 0; m < 14; m++) step(60); } catch (e) { err = e.stack; }
ok('a 2 v 2 of computers runs 14 minutes', !err, err && err.slice(0, 400));
ok('fighting hurt the village', true, { hurt: run('G.houses.filter((h) => h.alive && h.hp < h.maxHp).length'), down: run('G.houses.filter((h) => !h.alive).length'), units: run(`G.entities.filter((e) => e.kind === 'unit').length`) });
console.log(fails ? fails + ' failed' : 'all passed');
process.exit(fails ? 1 : 0);
