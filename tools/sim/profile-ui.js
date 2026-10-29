const { chromium, devices } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ ...devices['iPhone 13'] })).newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.route(/fonts/, (r) => r.abort());
  let named = null; const calls = [];
  await p.route(/supabase\.co/, async (r) => {
    const u = r.request().url(), body = r.request().postData() || '';
    calls.push(u.replace(/^.*supabase\.co\//, '') + (r.request().headers().authorization ? ' [signed in]' : ''));
    const json = (d) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(d) });
    if (u.includes('auth/v1/otp')) return json({});
    if (u.includes('auth/v1/verify')) return JSON.parse(body).token === '123456' ? json({ access_token: 'tok', refresh_token: 'ref', expires_in: 3600, user: { email: 'cmdr@example.com' } }) : r.fulfill({ status: 403, body: '{"msg":"Token has expired or is invalid"}' });
    if (u.includes('rpc/set_profile_name')) { const n = JSON.parse(body).p_name; if (n.toLowerCase() === 'taken') return json('taken'); named = n; return json('ok'); }
    if (u.includes('rpc/my_profile')) return json([{ name: named, joined: '2026-10-28T20:00:00Z', matches: 7, wins: 1, losses: 2, play_s: 7508, kills: 1128, best_ore: 281715, best_ore_at: '2026-10-28T18:59:03Z' }]);
    if (u.includes('rpc/delete_my_account')) return json(true);
    return json(null);
  });
  await p.goto('file://' + require('path').resolve(__dirname, '../../index.html') + ''); await p.waitForTimeout(1000);
  const shot = async (name) => { await p.waitForTimeout(250); await p.screenshot({ path: name }); };
  await p.click('#profileBtn'); await shot('pf-1-email.png');
  await p.fill('#pfIn', 'not-an-email'); await p.click('.pf-form button[type=submit]'); await p.waitForTimeout(100);
  const badEmail = await p.textContent('.pf-msg');
  await p.fill('#pfIn', 'cmdr@example.com'); await p.click('.pf-form button[type=submit]'); await p.waitForTimeout(300); await shot('pf-2-code.png');
  await p.fill('#pfIn', '111111'); await p.click('.pf-form button[type=submit]'); await p.waitForTimeout(300);
  const wrong = await p.textContent('.pf-msg');
  await p.fill('#pfIn', '123456'); await p.click('.pf-form button[type=submit]'); await p.waitForTimeout(400); await shot('pf-3-name.png');
  await p.fill('#pfIn', 'Taken'); await p.click('.pf-form button[type=submit]'); await p.waitForTimeout(300);
  const taken = await p.textContent('.pf-msg');
  await p.fill('#pfIn', 'Iron Fox'); await p.click('.pf-form button[type=submit]'); await p.waitForTimeout(500); await shot('pf-4-record.png');
  const btn = await p.textContent('#profileBtn');
  await p.reload(); await p.waitForTimeout(800);
  const afterReload = await p.textContent('#profileBtn');
  await p.click('#profileBtn'); await p.waitForTimeout(500);
  await p.click('[data-act=del]'); const sure = await p.textContent('[data-act=del]'); await p.click('[data-act=del]'); await p.waitForTimeout(400);
  const afterDelete = await p.textContent('#profileBtn'); const formBack = await p.isVisible('#pfIn');
  console.log(JSON.stringify({ badEmail, wrong, taken, btn, afterReload, sure, afterDelete, formBack, calls, errs }, null, 1));
  await b.close();
})();
