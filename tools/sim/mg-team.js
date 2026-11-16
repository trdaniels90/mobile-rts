// MG Team (hmg): sets its gun up before firing, packs it before moving, dug in once set up, and a staged fight
// against riflemen and a Ranger. Headless. node tools/sim/mg-team.js <repo>
const vm = require('vm');
const root = process.argv[2];
const headless = require(root + '/server/headless.js');
const out = {};
for (const fac of ['allies', 'soviets']) {
  const ctx = headless.load(), run = (s) => vm.runInContext(s, ctx);
  run(`newWorld('${fac}', 'normal', 5); G.me = 0; for (const t of G.teams) { t.isAI = false; t.auto = false; } 0`);
  out[fac] = JSON.parse(run(`(() => {
    const step = (s, f) => { for (let i = 0; i < s * 30; i++) { update(1 / 30); if (f) f(); } };
    const me = G.teams[0], foe = G.teams[1], res = {};
    for (const b of G.entities) if (b.kind === 'bld') { b.hp = b.maxHp = 1e9; b.buildT = 1; }
    const cy = buildingsOf(0).find((b) => b.type === 'cy');
    const x0 = cy.x + 10 * CELL, y0 = cy.y - 10 * CELL;
    // 1: setting up: no shot for 1.5 s, then fire
    const mg = addUnit('hmg', me, x0, y0);
    const dummy = addUnit('rifle', foe, x0 + 130, y0); dummy.hp = dummy.maxHp = 1e6; dummy.def = Object.assign({}, dummy.def, { weapon: null, speed: 0 });
    let first = null; const t0 = G.t;
    step(4, () => { if (first === null && mg.shots) first = G.t - t0; });
    res.firstShot = +first.toFixed(2); res.setup = mg.setup;
    // 2: dug in: half damage when set up
    const hp = mg.hp; damage(mg, 20, 'SA', null); res.dugIn = +((hp - mg.hp) / 20).toFixed(2); mg.hp = hp;
    // 3: told to move: packs up (stays put about 1 s), then walks
    dummy.alive = false;
    commandMove([mg], x0, y0 + 10 * CELL);
    const y1 = mg.y; step(0.8); res.movedWhilePacking = +(mg.y - y1).toFixed(1);
    step(3); res.movedAfter = +(mg.y - y1).toFixed(1); res.packed = mg.setup;
    mg.alive = false;
    // 4: staged fight: 2 MG Teams (setting up on guard) against 8 riflemen walking in
    // open ground: a row of 16 passable cells
    let fx = 0, fy = 0;
    search: for (let dy = -30; dy <= 30; dy++) for (let dx = -30; dx <= 30; dx++) {
      const bx = cy.x + dx * CELL, by = cy.y + dy * CELL;
      let ok = true; for (let k = 0; k < 16 && ok; k++) for (const oy of [0, CELL]) if (!passableAt(bx + k * CELL, by + oy)) ok = false;
      if (ok && Math.hypot(dx, dy) > 8) { fx = bx; fy = by; break search; }
    }
    const team = [addUnit('hmg', me, fx, fy), addUnit('hmg', me, fx, fy + CELL)];
    const rif = []; for (let i = 0; i < 8; i++) rif.push(addUnit('rifle', foe, fx + 14 * CELL + (i % 2) * 20, fy + (i >> 1) * 8));
    for (const u of rif) { u.order = { type: 'attack', target: team[0] }; u.target = team[0]; }
    step(60);
    res.fightHp = [team.map((u) => Math.round(u.hp)), rif.map((u) => Math.round(u.hp)), team.map((u) => u.shots || 0), rif.map((u) => Math.round(Math.hypot(u.x - team[0].x, u.y - team[0].y)))];
    res.fightRiflesLeft = rif.filter((u) => u.alive).length; res.fightMgLeft = team.filter((u) => u.alive).length;
    for (const u of team.concat(rif)) u.alive = false;
    // 5: against a helicopter (hits it) and the cost of 8 riflemen = 2 MG teams
    return JSON.stringify(res);
  })()`));
}
console.log(JSON.stringify(out));
const ok = Object.values(out).every((r) => r.firstShot >= 1.4 && r.firstShot < 2.2 && r.dugIn < 0.6 && r.movedWhilePacking < 1 && r.movedAfter > 20 && r.packed === 0);
console.log(ok ? 'PASS' : 'FAIL');
process.exit(ok ? 0 : 1);
