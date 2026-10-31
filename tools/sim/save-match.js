const { chromium, devices } = require('playwright');
const fs = require('fs'), path = require('path');
// A saved skirmish that is continued is still the same match on the stats page: one record, however
// often it is saved and continued, finished once with the full game time. Served from a fake website
// (so the game reports), with Supabase faked and every request noted. A save from before this change
// (no match id) starts a new match instead.
// node tools/sim/save-match.js <repo>
(async () => {
  const [root] = process.argv.slice(2);
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13 landscape'], serviceWorkers: 'block' });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  const inserted = [], ended = [], progress = [], types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webmanifest': 'application/json', '.png': 'image/png' };
  await p.route(/fonts\.(googleapis|gstatic)/, (r) => r.abort());
  await p.route('https://rh.test/**', (r) => {
    const f = path.join(root, new URL(r.request().url()).pathname.replace(/^\/$/, '/index.html'));
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) return r.fulfill({ status: 404, body: '' });
    r.fulfill({ status: 200, body: fs.readFileSync(f), contentType: types[path.extname(f)] || 'application/octet-stream' });
  });
  await p.route(/supabase\.co/, (r) => {
    const u = r.request().url(), body = r.request().postData() ? JSON.parse(r.request().postData()) : {};
    const hdr = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: hdr });
    if (/rest\/v1\/matches$/.test(u)) {
      if (inserted.some((x) => x.id === body.id)) return r.fulfill({ status: 409, headers: hdr, body: '{}' });   // the primary key refuses a duplicate
      inserted.push(body); return r.fulfill({ status: 201, headers: hdr, body: '' });
    }
    if (/rpc\/match_end/.test(u)) { ended.push({ id: body.p_id, result: body.p_result, s: body.p_duration }); return r.fulfill({ status: 204, headers: hdr, body: '' }); }
    if (/rpc\/match_progress/.test(u)) { progress.push({ id: body.p_id, s: body.p_duration }); return r.fulfill({ status: 204, headers: hdr, body: '' }); }
    return r.fulfill({ status: 200, headers: hdr, contentType: 'application/json', body: '[]' });
  });
  const playMinutes = (m) => p.evaluate((m) => { for (let i = 0; i < m * 60 * 30 && !G.over; i++) { G.paused = false; update(1 / 30); } }, m);
  const saveAndReload = async () => {
    await p.evaluate(() => document.getElementById('menuBtn').click());   // opens the menu: saves
    await p.waitForTimeout(1500);
    await p.reload(); await p.waitForTimeout(1500);
  };
  await p.goto('https://rh.test/index.html'); await p.tap('#startBtn'); await p.tap('#maps [data-map-go]'); await p.waitForTimeout(800);
  const local = await p.evaluate(() => Report.matchId);
  await playMinutes(3);
  await saveAndReload();
  // Continue, play on, save, reload and continue again.
  await p.tap('#continueBtn'); await p.waitForFunction(() => document.getElementById('menu').hidden, null, { timeout: 15000 });
  const id1 = await p.evaluate(() => Report.matchId);
  await playMinutes(2);
  await saveAndReload();
  await p.tap('#continueBtn'); await p.waitForFunction(() => document.getElementById('menu').hidden, null, { timeout: 15000 });
  const id2 = await p.evaluate(() => Report.matchId);
  const gameT = await p.evaluate(() => Math.round(G.t));
  await playMinutes(1);
  // Win it: one finished match, with the whole game's time.
  await p.evaluate(() => { const c = G.entities.find((e) => e.team === 1 && e.type === 'cy'); damage(c, 1e6, 'HE', null); for (let i = 0; i < 40; i++) update(1 / 30); });
  await p.waitForTimeout(3500);
  const first = { local, id1, id2, sameId: local && local === id1 && id1 === id2, gameT, inserted: inserted.map((x) => x.id), ended };
  // A save without a match id (made before this change) starts a new match.
  await p.tap('.db-new'); await p.waitForTimeout(500);
  await p.tap('#startBtn'); await p.tap('#maps [data-map-go]'); await p.waitForTimeout(800);
  await playMinutes(1);
  await p.evaluate(() => document.getElementById('menuBtn').click()); await p.waitForTimeout(1500);
  await p.evaluate(() => new Promise((res) => { const r = indexedDB.open('red-horizon', 1); r.onsuccess = () => { const s = r.result.transaction('save', 'readwrite').objectStore('save'); const g = s.get('skirmish'); g.onsuccess = () => { const v = g.result; v.meta.match = null; s.put(v, 'skirmish'); }; r.result.transaction('save').oncomplete = res; setTimeout(res, 600); }; }));
  await p.waitForTimeout(800);
  await p.reload(); await p.waitForTimeout(1500);
  const before = inserted.length;
  await p.tap('#continueBtn'); await p.waitForFunction(() => document.getElementById('menu').hidden, null, { timeout: 15000 });
  await p.waitForTimeout(500);
  console.log(JSON.stringify({ ...first, oldSaveStartsNewMatch: inserted.length === before + 1 || { before, after: inserted.length }, matchesInserted: inserted.length, errs: errs.slice(0, 4) }, null, 1));
  await b.close();
})();
