// APCs (Allied `apc`, Soviet `btr`): infantry board, ride, unload; destroyed with soldiers aboard, about half get out, hurt;
// a forged online order for someone else's APC is refused. Headless. node tools/sim/apc.js <repo>
const vm = require('vm');
const root = process.argv[2];
const headless = require(root + '/server/headless.js');
const out = {};
for (const fac of ['allies', 'soviets']) {
  const ctx = headless.load(), run = (s) => vm.runInContext(s, ctx);
  run(`newWorld('${fac}', 'normal', 7); G.me = 0; for (const t of G.teams) { t.isAI = false; t.auto = false; } 0`);
  out[fac] = JSON.parse(run(`(() => {
    const step = (s) => { for (let i = 0; i < s * 30; i++) update(1 / 30); };
    const me = G.teams[0], foe = G.teams[1], r = {}, type = '${fac}' === 'allies' ? 'apc' : 'btr';
    const cy = buildingsOf(0).find((b) => b.type === 'cy');
    let fx = 0, fy = 0;
    search: for (let dy = -40; dy <= 40; dy++) for (let dx = -40; dx <= 40; dx++) {
      const bx = cy.x + dx * CELL, by = cy.y + dy * CELL;
      let ok = Math.hypot(dx, dy) > 12; for (let k = -3; k < 12 && ok; k++) for (let oy = -3; oy <= 3; oy++) if (!passableAt(bx + k * CELL, by + oy * CELL)) ok = false;
      if (ok) { fx = bx; fy = by; break search; }
    }
    r.buildable = UNIT_DEFS[type].producer === 'factory' && UNIT_DEFS[type].factions.join() === '${fac}';
    const apc = addUnit(type, me, fx, fy); setGuard(apc, fx, fy);
    const inf = []; for (let i = 0; i < 6; i++) inf.push(addUnit(i % 2 ? 'rocket' : 'rifle', me, fx - 60 + (i % 3) * 14, fy - 40 + Math.floor(i / 3) * 14));
    for (const u of inf) setGuard(u, u.x, u.y);
    commandBoard(inf, apc); step(12);
    r.aboard = (apc.cargo || []).length; r.leftOut = inf.filter((u) => u.alive).length;
    commandMove([apc], fx + CELL * 8, fy); step(8);
    r.drove = Math.round(Math.hypot(apc.x - fx, apc.y - fy) / CELL);
    const before = unitsOf(0).filter((u) => u.cls === 'inf').length;
    commandUnload([apc]); step(4);
    r.unloaded = unitsOf(0).filter((u) => u.cls === 'inf').length - before; r.cargoAfter = apc.cargo.length;
    // a forged order from side 1 to unload side 0's APC
    apc.cargo = [{ type: 'rifle', hp: 50, rank: 0, kills: 0, kw: 0, born: 0 }];
    NetCore.applyCommand(1, { f: 'commandUnload', a: [[{ $e: apc.id }]] }); step(2);
    r.forgedRefused = apc.cargo.length === 1;
    // destroyed with 5 aboard, 40 times: about half get out, at half health
    let got = 0, tries = 40, hpOk = true;
    for (let i = 0; i < tries; i++) {
      const a = addUnit(type, me, fx, fy + CELL * 3);
      a.cargo = []; for (let j = 0; j < 5; j++) a.cargo.push({ type: 'rifle', hp: 40, rank: 0, kills: 0, kw: 0, born: 0 });
      const n0 = unitsOf(0).filter((u) => u.cls === 'inf' && u.alive).length;
      const lost0 = me.stats.lost;
      damage(a, 99999, 'AP', null);
      const fresh = unitsOf(0).filter((u) => u.cls === 'inf' && u.alive);
      const k = fresh.slice(n0).filter((u) => u.hp === 20).length; got += k;   // (at half the 40 they had; the vehicle's own crew may bail out too, at full health)
      if (me.stats.lost - lost0 !== 1 + 5 - k) { hpOk = false; r.bad = [me.stats.lost - lost0, k]; }
      for (const u of fresh.slice(n0)) u.alive = false;
      step(0.1);
    }
    r.escapeShare = +(got / (tries * 5)).toFixed(2); r.escapeStatsOk = hpOk;
    step(3);
    return JSON.stringify(r);
  })()`));
}
console.log(JSON.stringify(out));
const ok = Object.values(out).every((r) => r.buildable === true && r.aboard === 5 && r.leftOut === 1 && r.drove >= 6 && r.unloaded === 5 && r.cargoAfter === 0 &&
  r.forgedRefused && r.escapeShare > 0.35 && r.escapeShare < 0.65 && r.escapeStatsOk);
console.log(ok ? 'PASS' : 'FAIL');
process.exit(ok ? 0 : 1);
