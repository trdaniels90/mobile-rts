const { chromium, devices } = require('playwright');
// An online battle with MiGs, SAM Sites, rocket soldiers and infantry waves: two phones connect, the host
// runs the battle fast, and the guest's copy must follow it (nothing missing, nothing far off, no errors).
// node tools/sim/pvp-air-inf.js <repo> [seconds]
(async () => {
  const [root, secs = '40'] = process.argv.slice(2);
  const b = await chromium.launch();
  const open = async (tag) => {
    const p = await (await b.newContext({ ...devices['iPhone 13 landscape'] })).newPage();
    p.errs = []; p.on('pageerror', (e) => p.errs.push(tag + ': ' + e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' | ')));
    await p.route(/fonts|supabase\.co\/(rest|auth)/, (r) => r.abort());
    await p.addInitScript(() => {   // count what goes over the data channel
      window.__bytes = 0; window.__msgs = 0; window.__max = 0;
      const s = RTCDataChannel.prototype.send;
      RTCDataChannel.prototype.send = function (d) { window.__bytes += d.length; window.__msgs++; window.__max = Math.max(window.__max, d.length); return s.call(this, d); };
    });
    await p.goto('file://' + root + '/index.html');
    await p.tap('#onlineBtn');
    return p;
  };
  const A = await open('host'), B = await open('guest');
  await A.tap('[data-on=host]');
  await A.waitForSelector('.on-code');
  const code = await A.textContent('.on-code');
  await B.fill('#onCode', code); await B.tap('#online form button[type=submit]');
  const t0 = Date.now();
  await A.waitForSelector('[data-on=start]', { timeout: 30000 });
  await B.waitForFunction(() => Net.lobby && Net.lobby.host && Net.lobby.host.name, null, { timeout: 10000 });
  const connectMs = Date.now() - t0;
  await A.tap('[data-on=swap]'); await A.waitForTimeout(300);

  await A.tap('[data-on=start]');
  await B.waitForFunction(() => Net.role === 'guest' && G.entities.length > 0, null, { timeout: 10000 });
  await A.evaluate(() => {
    for (const t of G.teams) { t.isAI = true; t.auto = true; t.credits = 20000; }
    const cyOf = (i) => G.entities.find((e) => e.alive && e.team === i && e.type === 'cy');
    const near = (t, dx, dy) => { const cy = cyOf(t); return [cy.x + dx, cy.y + dy]; };
    // Team 0: an Airfield and MiGs. Team 1: SAM Sites and rocket soldiers at home, with raiders sent at team 0.
    const me = G.teams[0], foe = G.teams[1], c0 = cyOf(0);
    for (let r = 3; r < 14; r++) { let d = false; for (let a = 0; a < 6.28 && !d; a += 0.3) { const cx = Math.round(c0.cx + Math.cos(a) * r), cy = Math.round(c0.cy + Math.sin(a) * r); if (canPlace(me, 'airfield', cx, cy, 1)) { addBuilding('airfield', me, cx, cy); d = true; } } if (d) break; }
    for (let i = 0; i < 4; i++) spawnUnit(me, 'mig');
    const c1 = cyOf(1);
    for (let r = 3; r < 14 && !window.__sam; r++) for (let a = 0; a < 6.28; a += 0.4) { const cx = Math.round(c1.cx + Math.cos(a) * r), cy = Math.round(c1.cy + Math.sin(a) * r); if (canPlace(foe, 'sam', cx, cy, 1)) { addBuilding('sam', foe, cx, cy); window.__sam = 1; break; } }
    for (let i = 0; i < 8; i++) addUnit('rocket', foe, c1.x + 40 + i * 12, c1.y + 90);
    for (let i = 0; i < 14; i++) { const u = addUnit('rifle', foe, c0.x + 380 + (i % 5) * 14, c0.y + 40 + Math.floor(i / 5) * 14); setHunt(u); u.staged = false; }
    for (let i = 0; i < 14; i++) { const u = addUnit('rifle', me, c0.x + 60 + (i % 5) * 14, c0.y + 90 + Math.floor(i / 5) * 14); setHunt(u); u.staged = false; }
    window.__st = { rearm: 0, defending: 0, landed: 0, lanes: 0, fizzled: 0 };
    window.__fast = setInterval(() => {
      if (G.over) return;
      for (let i = 0; i < 24; i++) update(1 / 30);
      Net.hostTick(1);
      for (const u of G.entities) if (u.alive && u.kind === 'unit') { if (u.rearming) window.__st.rearm++; if (u.defending && u.cls === 'air') window.__st.defending++; if (u.cls === 'air' && u.as === 'landed') window.__st.landed++; if (u.lane) window.__st.lanes++; }
    }, 100);
  });
  await A.waitForTimeout(+secs * 1000);
  const host = await A.evaluate(() => { clearInterval(window.__fast); return { t: Math.round(G.t), over: !!G.over, st: window.__st, migs: G.entities.filter((e) => e.type === 'mig').map((e) => e.alive), proj: G.projectiles.length, team1: G.entities.filter((e) => e.alive && e.team === 1).map((e) => e.id),
    pos: Object.fromEntries(G.entities.filter((e) => e.alive).map((e) => [e.id, [Math.round(e.x), Math.round(e.y), e.hp]])) }; });
  await A.waitForTimeout(2000);
  // The guest is only told about ground it has uncovered: compare its own units (team 1) always, and the
  // host's units only where the guest's shroud is open.
  const guest = await B.evaluate((hostPos) => {
    const mine = {}, seen = {};
    for (const e of G.entities) if (e.alive) mine[e.id] = [Math.round(e.x), Math.round(e.y), e.hp];
    for (const id in hostPos) seen[id] = !!G.seen[cellOfPos(hostPos[id][0], hostPos[id][1])];
    return { t: Math.round(G.t), over: !!G.over, pos: mine, seen };
  }, Object.fromEntries(Object.entries(host.pos).map(([k, v]) => [k, v])));
  let off = 0, missing = 0, extra = 0, hpOff = 0, checked = 0;
  for (const id in host.pos) {
    const own = host.team1.includes(+id);
    if (!own && !guest.seen[id]) continue;
    checked++;
    const g = guest.pos[id]; if (!g) { missing++; continue; }
    off = Math.max(off, Math.hypot(g[0] - host.pos[id][0], g[1] - host.pos[id][1])); hpOff = Math.max(hpOff, Math.abs(g[2] - host.pos[id][2]));
  }
  for (const id in guest.pos) if (!host.pos[id]) extra++;
  console.log(JSON.stringify({ hostT: host.t, guestT: guest.t, over: [host.over, guest.over], hostAlive: Object.keys(host.pos).length, checked, missing, extra, maxOffPx: Math.round(off), maxHpOff: Math.round(hpOff), migsAlive: host.migs, proj: host.proj, activity: host.st, errs: A.errs.concat(B.errs) }, null, 1));
  await b.close();
})();
