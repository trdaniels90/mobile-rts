'use strict';
// The end-of-mission debrief: a Battle tab (strength of both sides through the game, with the key
// moments marked, and your most valuable unit) and a Scorecard tab (you against the enemy, and
// your kills by unit type). Built from what the world recorded in G.log as the game went on.
const Debrief = (() => {
  let root = null, onRematch = null, onNew = null;
  const SIDE = { allies: '#5f8fd6', soviets: '#e0584a' };   // checked for colour-blind contrast on the panel
  const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
  const money = (v) => '$' + (v >= 10000 ? (v / 1000).toFixed(v >= 100000 ? 0 : 1) + 'k' : Math.round(v).toLocaleString('en-US'));
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

  function build() {
    root = document.createElement('div');
    root.id = 'debrief';
    root.hidden = true;
    root.innerHTML = `<div class="db-card" role="dialog" aria-modal="true" aria-labelledby="dbTitle">
      <div class="db-head"><div><p class="db-kick"></p><h1 id="dbTitle"></h1></div><span class="db-time"></span></div>
      <div class="db-ptabs" role="tablist"><button role="tab" data-p="battle">Battle</button><button role="tab" data-p="score">Scorecard</button></div>
      <div class="db-grid" data-page="battle">
        <section class="db-panel">
          <div class="db-tabs" role="group" aria-label="Measure"><button data-k="army">Military</button><button data-k="income">Economy</button><button data-k="blds">Buildings</button></div>
          <div class="db-legend"></div>
          <div class="db-chart"><svg viewBox="0 0 600 270" role="img" aria-label="Strength of both sides through the battle"></svg><div class="db-tip"></div></div>
          <p class="db-note">Dots mark key moments: waves, big pushes, Outposts and the final blow. Drag across the graph for details.</p>
        </section>
        <section class="db-panel db-mvp"></section>
      </div>
      <div class="db-grid" data-page="score" hidden>
        <section class="db-panel"><table class="db-table"></table></section>
        <section class="db-panel"><p class="db-ptitle">Your kills by unit</p><div class="db-bytype"></div></section>
      </div>
      <div class="db-extra"></div>
      <div class="db-buttons"><button type="button" class="db-rematch">Rematch</button><button type="button" class="db-new">New Mission</button></div>
    </div>`;
    document.body.appendChild(root);
    root.querySelector('.db-ptabs').addEventListener('click', (e) => { const b = e.target.closest('[data-p]'); if (b) page(b.dataset.p); });
    root.querySelector('.db-rematch').addEventListener('click', () => { close(); onRematch(); });
    root.querySelector('.db-new').addEventListener('click', () => { close(); onNew(); });
  }
  function page(p) {
    for (const b of root.querySelectorAll('.db-ptabs button')) b.setAttribute('aria-selected', String(b.dataset.p === p));
    for (const g of root.querySelectorAll('[data-page]')) g.hidden = g.dataset.page !== p;
  }

  // won: did the player win. opts: { difficulty, onRematch, onNew }
  function open(won, opts) {
    if (!root) build();
    onRematch = opts.onRematch; onNew = opts.onNew;
    const me = G.teams[PLAYER], foe = G.teams[ENEMY], L = G.log;
    const cMe = SIDE[me.faction], cFoe = SIDE[foe.faction];
    const sideName = (t) => (t.faction === 'allies' ? 'Allies' : 'Soviets');
    root.querySelector('.db-kick').textContent = `${sideName(me)} vs ${sideName(foe)} · ${opts.difficulty}`;
    const title = root.querySelector('#dbTitle');
    title.textContent = won ? 'Mission Accomplished' : 'Mission Failed';
    title.className = won ? 'won' : 'lost';
    root.querySelector('.db-time').textContent = fmt(G.t);
    root.querySelector('.db-legend').innerHTML = `<span><i style="background:${cMe}"></i>You (${sideName(me)})</span><span><i style="background:${cFoe}"></i>Enemy (${sideName(foe)})</span>`;

    // Most valuable unit: the player's unit with the most kills, standing or fallen.
    const alive = unitsOf(PLAYER).filter((u) => u.kills).map((u) => ({ type: u.type, faction: u.faction, kills: u.kills, worth: u.killWorth, born: u.born, died: null }));
    const mvp = alive.concat(L.fallen).sort((a, b) => b.kills - a.kills || b.worth - a.worth)[0];
    root.querySelector('.db-mvp').innerHTML = mvp ? `<div class="db-mvp-head"><img src="${cameoURL(mvp.type, mvp.faction)}" alt="">
        <div><p class="db-medal">★ Most valuable unit</p><h3>${esc(UNIT_DEFS[mvp.type].name)}</h3>
        <p class="db-call">Built at ${fmt(mvp.born)} · ${mvp.died === null ? 'survived' : 'fell at ' + fmt(mvp.died)}</p></div></div>
        <div class="db-mvpstats"><div><b>${mvp.kills}</b><span>Kills</span></div><div><b>${money(mvp.worth)}</b><span>Enemy value</span></div><div><b>${fmt((mvp.died === null ? G.t : mvp.died) - mvp.born)}</b><span>In action</span></div></div>`
      : '<p class="db-call">No kills this time: no medal to hand out.</p>';

    // Scorecard.
    const rows = [['Units built', 'units'], ['Units lost', 'lost', true], ['Enemies destroyed', 'killed'], ['Buildings destroyed', 'bldKilled'], ['Buildings lost', 'bldLost', true], ['Ore harvested', 'harvested']];
    root.querySelector('.db-table').innerHTML = `<thead><tr><th></th><th><i style="background:${cMe}"></i>You</th><th><i style="background:${cFoe}"></i>Enemy</th></tr></thead><tbody>` +
      rows.map(([label, k, low]) => {
        const a = me.stats[k], b = foe.stats[k], f = k === 'harvested' ? money : (v) => v;
        return `<tr><td>${label}</td><td class="${(low ? a < b : a > b) ? 'lead' : ''}">${f(a)}</td><td class="${(low ? b < a : b > a) ? 'lead' : ''}">${f(b)}</td></tr>`;
      }).join('') + '</tbody>';
    const byType = {};
    for (const u of alive.concat(L.fallen)) byType[u.type] = (byType[u.type] || 0) + u.kills;
    const bt = Object.entries(byType).sort((a, b) => b[1] - a[1]), most = bt.length ? bt[0][1] : 1;
    root.querySelector('.db-bytype').innerHTML = bt.length ? bt.map(([t, k]) => `<div class="db-bt"><span>${esc(UNIT_DEFS[t].name)}</span><div class="db-bar" style="width:${(k / most * 100).toFixed(1)}%;background:${cMe}"></div><b>${k}</b></div>`).join('')
      : '<p class="db-call">No kills recorded.</p>';

    const extra = root.querySelector('.db-extra');   // e.g. the leaderboard name box after a win
    extra.replaceChildren(...(opts.extra ? [opts.extra] : []));
    extra.hidden = !opts.extra;

    chart(cMe, cFoe);
    page('battle');
    root.hidden = false;
  }
  function close() { if (root) root.hidden = true; }

  // Strength through the battle: one line per side, one measure at a time, never two scales at once.
  function chart(cMe, cFoe) {
    const svg = root.querySelector('svg'), tip = root.querySelector('.db-tip'), box = root.querySelector('.db-chart');
    const W = 600, H = 270, Lm = 50, R = 12, T = 18, B = 26, L = G.log, tMax = Math.max(60, G.t);
    const EV = L.events;
    const evText = (e) => (e.team === PLAYER ? 'Your ' : 'Enemy ') + (e.kind === 'cy lost' ? 'Construction Yard destroyed' : e.kind === 'outpost lost' ? 'Outpost lost' : e.kind);
    const evColor = (e) => (e.team === PLAYER ? cMe : cFoe);
    const unit = { army: money, income: (v) => money(v) + '/min', blds: (v) => Math.round(v) };
    const series = (k) => (k !== 'income' ? L.samples.map((s) => [s.t, s[k][PLAYER], s[k][ENEMY]])
      // income averaged over the last minute: single truckloads make the raw figures jump about
      : L.samples.map((s, i) => { const w = L.samples.slice(Math.max(0, i - 3), i + 1); return [s.t, w.reduce((a, q) => a + q.income[PLAYER], 0) / w.length, w.reduce((a, q) => a + q.income[ENEMY], 0) / w.length]; }));
    const niceMax = (v) => { const p = Math.pow(10, Math.floor(Math.log10(v || 1))), n = v / p; return [1, 1.2, 1.6, 2, 2.4, 3, 4, 5, 6, 8, 10].find((q) => q >= n) * p; };
    let key = 'army';
    function draw() {
      for (const b of root.querySelectorAll('.db-tabs button')) b.setAttribute('aria-pressed', String(b.dataset.k === key));
      tip.style.display = 'none';
      const s = series(key), yMax = niceMax(Math.max(1, ...s.map((q) => Math.max(q[1], q[2]))) * 1.05);
      const X = (t) => Lm + (W - Lm - R) * t / tMax, Y = (v) => T + (H - T - B) * (1 - v / yMax);
      let g = '';
      for (let i = 0; i <= 4; i++) { const v = yMax * i / 4, y = Y(v); g += `<line x1="${Lm}" x2="${W - R}" y1="${y}" y2="${y}" class="db-grid-line"/><text x="${Lm - 6}" y="${y + 4}" text-anchor="end">${unit[key](v)}</text>`; }
      const step = tMax > 1800 ? 10 : 5;
      for (let m = 0; m <= tMax / 60; m += step) g += `<text x="${X(m * 60)}" y="${H - 8}" text-anchor="middle">${m}:00</text>`;
      for (const e of EV) { const x = X(e.t); g += `<line x1="${x}" x2="${x}" y1="${T - 6}" y2="${H - B}" stroke="${evColor(e)}" stroke-opacity="0.35" stroke-dasharray="2 3"/><circle cx="${x}" cy="${T - 8}" r="4" fill="${evColor(e)}" class="db-ring"/>`; }
      const path = (i) => s.map((q, j) => `${j ? 'L' : 'M'}${X(q[0]).toFixed(1)},${Y(q[i]).toFixed(1)}`).join('');
      g += `<path d="${path(2)}" fill="none" stroke="${cFoe}" stroke-width="2" stroke-linejoin="round"/><path d="${path(1)}" fill="none" stroke="${cMe}" stroke-width="2" stroke-linejoin="round"/>`;
      g += `<line class="db-xh" x1="0" x2="0" y1="${T}" y2="${H - B}" visibility="hidden"/><circle class="db-d1 db-ring" r="4" fill="${cMe}" visibility="hidden"/><circle class="db-d2 db-ring" r="4" fill="${cFoe}" visibility="hidden"/>`;
      svg.innerHTML = g;
      const show = (cx) => {
        if (!s.length) return;
        const r = svg.getBoundingClientRect(), t = Math.max(0, Math.min(tMax, ((cx - r.left) / r.width * W - Lm) / (W - Lm - R) * tMax));
        const q = s.reduce((a, b) => (Math.abs(b[0] - t) < Math.abs(a[0] - t) ? b : a)), x = X(q[0]);
        for (const [c, i] of [['.db-d1', 1], ['.db-d2', 2]]) { const d = svg.querySelector(c); d.setAttribute('cx', x); d.setAttribute('cy', Y(q[i])); d.setAttribute('visibility', 'visible'); }
        const xh = svg.querySelector('.db-xh'); xh.setAttribute('x1', x); xh.setAttribute('x2', x); xh.setAttribute('visibility', 'visible');
        const ev = EV.filter((e) => Math.abs(e.t - q[0]) <= 20).map((e) => `<div class="db-tipev">${evText(e)}</div>`).join('');
        tip.innerHTML = `<b>${fmt(q[0])}</b><div><i style="background:${cMe}"></i>You ${unit[key](q[1])}</div><div><i style="background:${cFoe}"></i>Enemy ${unit[key](q[2])}</div>${ev}`;
        tip.style.display = 'block';
        const tw = tip.offsetWidth, px = x / W * r.width;
        tip.style.left = Math.max(tw / 2, Math.min(r.width - tw / 2, px)) + 'px';
      };
      box.onpointermove = box.onpointerdown = (e) => show(e.clientX);
      box.onpointerleave = () => { tip.style.display = 'none'; for (const c of ['.db-xh', '.db-d1', '.db-d2']) svg.querySelector(c).setAttribute('visibility', 'hidden'); };
    }
    root.querySelector('.db-tabs').onclick = (e) => { const b = e.target.closest('[data-k]'); if (b) { key = b.dataset.k; draw(); } };
    tip.style.display = 'none';
    draw();
  }
  return { open, close };
})();
