const { chromium, devices } = require('playwright');
// Online play end to end: two phones (pages) meet with a room code over Supabase Realtime, connect
// over WebRTC and play. Checks the guest's copy follows the host's battle, the guest's orders reach
// the host, how many bytes the snapshots take, and that both see the right ending.
// node tools/sim/pvp.js <repo> [seconds]
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
  const lobbyB = await B.evaluate(() => document.querySelector('.on-lobby').innerText.replace(/\s+/g, ' '));
  await A.tap('[data-on=start]');
  await B.waitForFunction(() => Net.role === 'guest' && G.entities.length > 0, null, { timeout: 10000 });
  const hashTerr = () => { let h = 0; for (let i = 0; i < G.terr.length; i++) h = (h * 31 + G.terr[i]) | 0; return h; };
  const same = { terr: (await A.evaluate(hashTerr)) === (await B.evaluate(hashTerr)), sides: [await A.evaluate(() => [G.me, G.teams[0].faction, G.teams.map((t) => t.isAI)]), await B.evaluate(() => [G.me, G.teams[1].faction])] };
  // The guest orders: build a power plant and move its riflemen.
  await B.evaluate(() => {
    const t = G.teams[G.me];
    window.__prod = startProduction(t, 'power');
    const cy = G.entities.find((e) => e.team === G.me && e.type === 'cy');
    window.__moveTo = { x: cy.x + 90, y: cy.y + 90 };
    commandMove(unitsOf(G.me).filter((u) => u.type === 'rifle'), window.__moveTo.x, window.__moveTo.y);
  });
  await A.waitForTimeout(+secs * 1000);
  const host = await A.evaluate(() => {
    const rifles = unitsOf(1).filter((u) => u.type === 'rifle');
    return { t: Math.round(G.t), q: G.teams[1].queues.structure && G.teams[1].queues.structure.type, ready: !!(G.teams[1].queues.structure && G.teams[1].queues.structure.ready),
      rifleOrders: rifles.map((u) => u.order.type), ents: G.entities.length, pos: Object.fromEntries(G.entities.map((e) => [e.id, [Math.round(e.x), Math.round(e.y)]])),
      kbPerSec: Math.round(window.__bytes / 1024 / G.t * 10) / 10, msgs: window.__msgs };
  });
  const guest = await B.evaluate(() => ({ t: Math.round(G.t), ents: G.entities.length, credits: G.teams[G.me].credits, q: G.teams[G.me].queues.structure && G.teams[G.me].queues.structure.type,
    fogCells: G.fog[G.me].reduce((a, b) => a + b, 0), pos: Object.fromEntries(G.entities.map((e) => [e.id, [Math.round(e.x), Math.round(e.y)]])), sentKb: Math.round(window.__bytes / 1024) }));
  let off = 0, missing = 0;
  for (const id in host.pos) { const g = guest.pos[id]; if (!g) { missing++; continue; } off = Math.max(off, Math.hypot(g[0] - host.pos[id][0], g[1] - host.pos[id][1])); }
  // Place the guest's power plant once ready.
  const placed = host.ready ? await B.evaluate(() => {
    const t = G.teams[G.me];
    for (let r = 3; r < 12; r++) for (let a = 0; a < 16; a++) {
      const cy = G.entities.find((e) => e.team === G.me && e.type === 'cy');
      const cx = Math.round(cy.cx + Math.cos(a / 16 * 6.28) * r), cyy = Math.round(cy.cy + Math.sin(a / 16 * 6.28) * r);
      if (placeStructure(t, 'power', cx, cyy)) return true;
    }
    return false;
  }) : 'not ready';
  await A.waitForTimeout(1500);
  const powerOnHost = await A.evaluate(() => buildingsOf(1).map((b) => b.type));
  const powerOnGuest = await B.evaluate(() => buildingsOf(G.me).map((b) => b.type));
  // Stress: the computer plays both sides on the host, eight times as fast, so the guest copies a
  // full battle. Measures snapshot sizes.
  let stress = null;
  if (process.argv[4]) {
    await A.evaluate(() => {
      for (const t of G.teams) { t.isAI = true; t.auto = true; t.credits = 10000; }
      window.__b0 = window.__bytes; window.__m0 = window.__msgs; window.__t0 = G.t; window.__max = 0;
      window.__fast = setInterval(() => { if (G.over) return; for (let i = 0; i < 24; i++) update(1 / 30); Net.hostTick(1); }, 100);
    });
    await A.waitForTimeout(+process.argv[4] * 1000);
    stress = await A.evaluate(() => { clearInterval(window.__fast); return { gameMin: Math.round((G.t - window.__t0) / 6) / 10, over: !!G.over, ents: G.entities.length, units: G.entities.filter((e) => e.kind === 'unit').length,
      avgSnapKb: Math.round((window.__bytes - window.__b0) / (window.__msgs - window.__m0) / 102.4) / 10, maxPieceKb: Math.round(window.__max / 1024), fx: G.effects.length, proj: G.projectiles.length }; });
    // What a snapshot is made of, at normal speed in the big battle: bytes per entity field.
    await A.evaluate(() => {
      window.__tally = {}; window.__snaps = 0;
      const s = RTCDataChannel.prototype.send;
      RTCDataChannel.prototype.send = function (d) {
        try { const m = JSON.parse(d); if (m.k === 's') { window.__snaps++; for (const id in m.e) for (const k in m.e[id]) window.__tally[k] = (window.__tally[k] || 0) + JSON.stringify(m.e[id][k]).length + k.length + 3;
          for (const k of ['p', 'fx', 'ev', 'tm', 'fog', 'ore']) if (m[k]) window.__tally['#' + k] = (window.__tally['#' + k] || 0) + JSON.stringify(m[k]).length; } } catch (_) {}
        return s.call(this, d);
      };
    });
    await A.waitForTimeout(5000);
    stress.perSnapBytes = await A.evaluate(() => Object.fromEntries(Object.entries(window.__tally).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => [k, Math.round(v / window.__snaps)])));
    await A.waitForTimeout(1500);
    const hp = await A.evaluate(() => Object.fromEntries(G.entities.map((e) => [e.id, [Math.round(e.x), Math.round(e.y)]])));
    const gp = await B.evaluate(() => Object.fromEntries(G.entities.map((e) => [e.id, [Math.round(e.x), Math.round(e.y)]])));
    stress.missing = Object.keys(hp).filter((id) => !gp[id]).length; stress.extra = Object.keys(gp).filter((id) => !hp[id]).length;
    await A.evaluate(() => { for (const t of G.teams) t.isAI = false; });
  }
  // The host destroys the guest's Construction Yard: the host wins, the guest loses.
  await A.evaluate(() => { const c = G.entities.find((e) => e.team === 1 && e.type === 'cy'); damage(c, 1e6, 'HE', null); });
  await A.waitForTimeout(4000);
  const ends = [await A.textContent('#dbTitle').catch(() => null), await B.textContent('#dbTitle').catch(() => null)];
  console.log(JSON.stringify({ code, connectMs, lobbyB, same, prod: await B.evaluate(() => window.__prod),
    host: { ...host, pos: undefined }, guest: { ...guest, pos: undefined }, maxOffPx: Math.round(off), missing, placed, powerOnHost, powerOnGuest, stress, ends,
    errs: [...A.errs, ...B.errs].slice(0, 6) }, null, 1));
  await b.close();
})();
