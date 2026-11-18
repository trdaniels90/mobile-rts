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
// Engineers capture enemy structures at once, Construction Yards too.
{
  const ctx = headless.load(), run = (s) => vm.runInContext(s, ctx);
  run(`newWorld('allies', 'normal', 7); G.me = 0; for (const t of G.teams) { t.isAI = false; t.auto = false; } 0`);
  out.capture = JSON.parse(run(`(() => {
    const step = (s) => { for (let i = 0; i < s * 30; i++) update(1 / 30); };
    const me = G.teams[0], foe = G.teams[1], r = {};
    const ecy = buildingsOf(1).find((b) => b.type === 'cy');
    const pw = addBuilding('power', foe, ecy.cx + 5, ecy.cy); pw.buildT = 1; updatePower();
    for (const c of G.fog[0].keys()) G.fog[0][c] = 2;
    const e1 = addUnit('engineer', me, pw.x, pw.y + CELL * 4), e2 = addUnit('engineer', me, ecy.x - CELL * 4, ecy.y);
    for (const e of [e1, e2]) e.hp = e.maxHp = 1e6;   // (the enemy's starting units would shoot them)
    r.jobEnemy = engineerJob(e1, pw); r.jobOwnFull = engineerJob(e1, buildingsOf(0)[0]);
    commandEngineer([e1], pw); commandEngineer([e2], ecy); step(20);
    r.power = [pw.team, pw.faction]; r.cy = [ecy.team, ecy.faction]; r.engsUsed = !e1.alive && !e2.alive; r.captured = me.stats.captured;
    step(10); r.foeOut = !!foe.out || !inTheFight(1);
    return JSON.stringify(r);
  })()`));
}
// A Normal 1 v 1 of computers, side 1 a Raider: APCs built and ridden, an Engineer raid, a capture.
{
  const mins = +(process.argv[3] || 20);
  const ctx = headless.load(), run = (s) => vm.runInContext(s, ctx);
  run(`newWorld('allies', 'normal', 4242, 0, false, 'bridge', [{ faction: 'allies', ally: 0, ai: true }, { faction: 'soviets', ally: 1, ai: true }]);
    for (const t of G.teams) t.auto = true; G.me = -1; G.teams[0].style = 'balanced'; G.teams[1].style = 'raider'; 0`);
  out.ai = JSON.parse(run(`(() => {
    const r = { apcs: [0, 0], rode: [0, 0], raids: 0, raidSteps: {}, captured: [0, 0], errors: 0 };
    const seenApc = new Set(), rode = new Set();
    let lastRaid = null;
    for (let i = 0; i < ${mins} * 60 * 15; i++) {
      try { update(1 / 15); } catch (e) { r.errors++; r.err = String(e.stack).slice(0, 300); break; }
      if (i % 15) continue;
      for (const u of G.entities) if (u.alive && u.kind === 'unit' && u.def.apc) {
        if (!seenApc.has(u.id)) { seenApc.add(u.id); r.apcs[u.team]++; }
        if ((u.cargo || []).length && !rode.has(u.id) && !atHome(G.teams[u.team], u, 25)) { rode.add(u.id); r.rode[u.team]++; }
      }
      const R = G.teams[1].engRaid;
      if (R && R !== lastRaid) { r.raids++; lastRaid = R; }
      if (R) r.raidSteps[R.step] = (r.raidSteps[R.step] || 0) + 1;
      if (G.over) break;
    }
    r.captured = G.teams.map((t) => t.stats.captured || 0); r.t = Math.round(G.t / 60);
    r.engineers = G.teams.map((t) => t.queues ? 0 : 0);
    return JSON.stringify(r);
  })()`));
}
console.log(JSON.stringify(out));
const cap = out.capture, ai = out.ai;
const capOk = cap.jobEnemy && !cap.jobOwnFull && cap.power.join() === '0,allies' && cap.cy.join() === '0,allies' && cap.engsUsed && cap.captured === 2;
const aiOk = ai.errors === 0 && ai.apcs[0] > 0 && ai.apcs[1] > 0 && ai.rode[0] + ai.rode[1] > 0 && ai.raids > 0;
console.log('capture', capOk ? 'ok' : 'FAIL', 'ai', aiOk ? 'ok' : 'FAIL');
const ok = capOk && aiOk && Object.entries(out).filter(([k]) => k === 'allies' || k === 'soviets').map(([, v]) => v).every((r) => r.buildable === true && r.aboard === 5 && r.leftOut === 1 && r.drove >= 6 && r.unloaded === 5 && r.cargoAfter === 0 &&
  r.forgedRefused && r.escapeShare > 0.35 && r.escapeShare < 0.65 && r.escapeStatsOk);
console.log(ok ? 'PASS' : 'FAIL');
process.exit(ok ? 0 : 1);
