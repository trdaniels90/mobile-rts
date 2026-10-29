const { chromium, devices } = require('playwright');
// Production check for one faction: node prodtest.js <repo> <faction>
(async () => {
  const [root, faction] = process.argv.slice(2);
  const b = await chromium.launch();
  const p = await (await b.newContext({ ...devices['iPhone 13 landscape'] })).newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.route(/fonts/, (r) => r.abort());
  await p.goto('file://' + root + '/index.html'); await p.tap('#startBtn'); await p.waitForTimeout(600);
  const r = await p.evaluate((faction) => {
    window.__over = () => G.over;
    const out = { issues: [], notes: [] };
    const bad = (m) => out.issues.push(m), note = (m) => out.notes.push(m);
    newWorld(faction, 'normal', 7);
    const me = G.teams[0], foe = G.teams[1]; foe.isAI = false; me.auto = false; me.credits = 1e6; G.paused = true;
    // Clear the enemy away so nothing interferes.
    for (const e of G.entities) if (e.team === 1 && e.kind === 'unit') e.alive = false;
    const step = (secs) => { for (let i = 0; i < secs * 30; i++) { G.paused = false; update(1 / 30); G.paused = true; } };
    step(0.1);
    const cy = buildingsOf(0).find((b) => b.type === 'cy');
    const place = (type) => {
      for (let r = 3; r < 16; r++) for (let a = 0; a < 6.28; a += 0.3) {
        const cx = Math.round(cy.cx + Math.cos(a) * r), cyy = Math.round(cy.cy + Math.sin(a) * r);
        if (canPlace(me, type, cx, cyy, 1)) return addBuilding(type, me, cx, cyy);
      }
      bad('could not place ' + type); return null;
    };
    const blds = {};
    for (const t of ['power', 'power', 'power', 'power', 'refinery', 'barracks', 'factory', 'helipad', 'airfield', 'dome']) blds[t] = place(t);
    step(1);
    const spawned = [];
    const realSpawn = spawnUnit;
    window.spawnUnit = function (team, type) { const u = realSpawn(team, type); if (team.id === 0) spawned.push({ type, u, t: G.t, x: u && u.x, y: u && u.y }); if (!u) bad('spawnUnit returned nothing for ' + type); return u; };
    const types = Object.keys(UNIT_DEFS).filter((k) => UNIT_DEFS[k].factions && UNIT_DEFS[k].factions.includes(faction) && ['barracks', 'factory', 'helipad', 'airfield'].includes(UNIT_DEFS[k].producer));
    out.types = types;
    for (const t of types) { if (!available(me, t)) bad(t + ' not available with all producers built'); const e = startProduction(me, t); if (e) bad('startProduction(' + t + '): ' + e); }
    step(90);
    const made = spawned.map((s) => s.type);
    for (const t of types) if (!made.includes(t)) bad(t + ' was never produced');
    for (const s of spawned) {
      const u = s.u; if (!u) continue;
      if (!isFinite(s.x) || !isFinite(s.y)) bad(s.type + ' spawned at a bad position');
      if (!u.alive) { bad(s.type + ' died on its own'); continue; }
      if (!isFinite(u.x) || !isFinite(u.y) || !inMap(Math.floor(u.x / CELL), Math.floor(u.y / CELL))) bad(s.type + ' ended at a bad position');
      if (u.cls === 'air') {
        const pad = padFor(u); const sp = pad && padSpot(pad, u);
        if (u.as !== 'landed') bad(s.type + ' not landed on its pad (' + u.as + ')');
        else if (sp && Math.hypot(sp.x - u.x, sp.y - u.y) > 30) bad(s.type + ' landed away from its slot');
      } else {
        const c = cellOfPos(u.x, u.y);
        if (G.bld[c]) bad(s.type + ' is standing inside a building');
        if (Math.hypot(u.x - s.x, u.y - s.y) < 8 && !u.def.harvester) note(s.type + ' never moved away from the exit');
      }
    }
    // Stress A: exit blocked by a crowd of tanks.
    const f = blds.factory;
    const ex = cellCenter(f.exitCell);
    const tank = faction === 'allies' ? 'mtank' : 'htank';
    for (let i = 0; i < 25; i++) { const u = addUnit(tank, me, ex.x + ((i % 5) - 2) * 18, ex.y + Math.floor(i / 5) * 18); setGuard(u); }
    const before = spawned.length;
    startProduction(me, tank); step(30);
    const sA = spawned.slice(before).find((s) => s.type === tank);
    if (!sA) bad('blocked exit: no tank produced');
    else { if (!isFinite(sA.x) || G.bld[cellOfPos(sA.x, sA.y)]) bad('blocked exit: tank spawned inside a building or bad position'); note('blocked exit: spawned ' + Math.round(Math.hypot(sA.x - ex.x, sA.y - ex.y)) + 'px from the exit'); }
    // Stress B: eight helicopters on one Helipad.
    const heli = faction === 'allies' ? 'heli' : 'hind';
    for (let i = 0; i < 8; i++) startProduction(me, heli);
    step(120);
    const helis = unitsOf(0).filter((u) => u.type === heli && u.as === 'landed');
    const spots = new Set(helis.map((u) => Math.round(u.x / 4) + ',' + Math.round(u.y / 4)));
    out.notes.push(helis.length + ' helicopters on 1 Helipad use ' + spots.size + ' parking spots');
    if (spots.size < helis.length) bad(`${helis.length} helicopters on one Helipad share ${spots.size} spots (stacked on top of each other)`);
    // Stress C: a jet at the front of the aircraft queue with the Airfield gone.
    const jet = faction === 'allies' ? 'jet' : 'mig';
    me.queues.heli.length = 0; me.queues.jet.length = 0;
    startProduction(me, jet); startProduction(me, heli);
    blds.airfield.hp = 0; kill(blds.airfield, null, 'AP'); step(0.5);
    for (const u of unitsOf(0)) if (u.type === jet) u.alive = false;
    const before2 = spawned.length; step(40);
    const gotHeli = spawned.slice(before2).some((s) => s.type === heli);
    if (!gotHeli) bad('with the Airfield lost, a queued ' + jet + ' blocks the ' + heli + ' behind it (aircraft queue stuck)');
    // Stress F: a helicopter and a jet build side by side.
    me.queues.heli.length = 0; me.queues.jet.length = 0;
    const af2 = place('airfield'); step(0.5);
    startProduction(me, heli); startProduction(me, jet); step(2);
    const hp = me.queues.heli[0] ? me.queues.heli[0].progress : 1, jp = me.queues.jet[0] ? me.queues.jet[0].progress : 1;
    note('after 2 s: helicopter ' + Math.round(hp * 100) + '%, jet ' + Math.round(jp * 100) + '%');
    if (!(hp > 0 && jp > 0)) bad('helicopter and jet do not build at the same time');
    step(30);
    // Stress D: War Factory destroyed mid-build, then rebuilt.
    me.queues.vehicle.length = 0; startProduction(me, tank); step(3);
    const prog = me.queues.vehicle[0] && me.queues.vehicle[0].progress;
    kill(blds.factory, null, 'AP'); step(5);
    const q = me.queues.vehicle[0];
    note('factory lost at ' + Math.round(prog * 100) + '%: queue ' + (q ? 'kept at ' + Math.round(q.progress * 100) + '%' : 'emptied'));
    const before3 = spawned.length; place('factory'); step(30);
    if (!spawned.slice(before3).some((s) => s.type === tank)) bad('after rebuilding the War Factory, the queued tank was not finished');
    // Stress E: Barracks sold mid-build.
    me.queues.infantry.length = 0; startProduction(me, 'rifle'); step(1);
    blds.barracks.sellT = 1; step(3);
    out.notes.push('barracks being sold: infantry queue ' + (me.queues.infantry.length ? 'kept' : 'emptied'));
    if (G.over) bad('game ended during the test');
    return out;
  }, faction);
  console.log(faction.toUpperCase(), JSON.stringify(r, null, 1), 'page errors:', errs.slice(0, 3)); await b.close();
})();
