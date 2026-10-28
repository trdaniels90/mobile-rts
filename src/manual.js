'use strict';
// The Field Manual: a multi-page booklet opened from the main menu, in the spirit of the printed
// manuals that came with mid-90s strategy games. Pictures are the game's own sidebar portraits and
// every number comes from the unit and structure tables, so the manual always matches the game.

const Manual = (() => {
  // --- What each piece is for ---------------------------------------------------
  const TEXT = {
    // Structures
    cy: ['The heart of your base: every structure is built here. It cannot be sold, and if it falls the mission is lost. Guard it above all else.', '', ''],
    power: ['Supplies 100 power. Keep production above demand: on low power everything builds more slowly, radar goes offline and Tesla Coils fall silent.', '', 'A tempting target for raids'],
    apower: ['Twice the output of a standard plant on a 3x3 footprint. Unlocked by the War Factory.', '', 'Losing one hurts twice as much'],
    refinery: ['Processes ore into credits. Each comes with a free Ore Truck that harvests and unloads on its own. Build them close to ore fields.', '', 'Key target for enemy raids'],
    outpost: ['Unpacked from a Mobile Outpost. You can build up to 8 cells around it, so a refinery can sit right beside a distant ore field.', '', 'Lightly defended unless you add guns'],
    barracks: ['Trains infantry. More Barracks do not train faster, but losing one does not stop training if you have another.', '', ''],
    factory: ['Builds tanks, support vehicles, Ore Trucks and the Mobile Outpost. Unlocks the Helipad, Airfield and Advanced Power Plant.', '', ''],
    dome: ['Turns on the radar minimap (it goes offline on low power) and unlocks your side\'s long-range support vehicle at the War Factory.', '', 'Without it you fight blind'],
    helipad: ['Builds and rearms helicopters. Comes with one free helicopter. Aircraft are repaired on their pad for credits.', '', ''],
    airfield: ['Builds and rearms jets and charges the Spy Plane, Paratrooper and Bombing Run powers. Comes with one free jet.', '', ''],
    pillbox: ['A sandbagged machine-gun nest. Cheap and quick to build.', 'Infantry', 'Tanks'],
    turret: ['A heavy gun turret that outranges most tanks.', 'Tanks, vehicles', 'Infantry swarms, artillery'],
    aagun: ['Fills the sky with black flak. Cannot fire at ground targets.', 'Helicopters, jets', 'Anything on the ground'],
    ftur: ['Throws burning fuel that keeps burning on the ground for a moment.', 'Infantry', 'Tanks'],
    tesla: ['Long-range lightning: one strike kills a soldier outright and each one tears into armour. Needs plenty of power: on low power it goes dark.', 'Infantry, vehicles', 'Artillery, V2 rockets, power cuts'],
    sam: ['Launches guided missiles at aircraft, with a roar of backblast. Cannot fire at ground targets.', 'Helicopters, jets', 'Anything on the ground'],
    // Infantry
    rifle: ['The backbone of every army: cheap, quick to train and useful in numbers. Under fire they drop into cover, crouching or going prone.', 'Infantry', 'Tanks, flame, Tesla'],
    grenadier: ['Lobs grenades in an arc over cover, with a blast that hurts groups. Carries spare grenades in bags on his hips.', 'Infantry groups, light vehicles', 'Tanks at range'],
    rocket: ['Allied anti-armour and anti-aircraft infantry, as in the original: Dragon rockets punch through tank armour, and RedEye missiles reach further to bring down aircraft. One launcher, so it fires one or the other.', 'Tanks, aircraft', 'Infantry, light vehicles'],
    pilot: ['Bails out of a downed aircraft, parachutes down and runs for the nearest friendly structure. Reaching it, the pilot is recovered and you get $100. Cannot be trained.', '', ''],
    // Vehicles
    ranger: ['A fast armed jeep for scouting and raids. Its machine gun can also fire at aircraft.', 'Infantry, Ore Trucks', 'Tanks'],
    ltank: ['Quick, cheap armour with a light cannon.', 'Light vehicles', 'Heavy tanks'],
    mtank: ['The Allied main battle tank: well armoured with a solid gun.', 'Vehicles, structures', 'Rockets, Tesla Coils'],
    htank: ['Thick Soviet armour and twin cannons.', 'Vehicles, structures', 'Rockets, artillery'],
    mammoth: ['Slow and enormous. Twin cannons for ground targets and missile pods that also fire at aircraft.', 'Everything', 'Its own speed'],
    arty: ['A tracked howitzer that outranges every defence. With no turret the whole vehicle turns to aim, and its shells drop in a high arc, so it can miss a moving target. Needs a Radar Dome.', 'Defences, infantry, anything standing still', 'Anything that reaches it'],
    v2rl: ['A truck carrying one huge rocket on a launch rail. Slow to reload but the blast wrecks buildings, with a crater and a shake you can feel. Needs a Radar Dome.', 'Structures, defences', 'Fast units, aircraft'],
    harv: ['Finds ore, fills up and drives home to unload, all on its own. It works the field nearest its refinery until every last bit is gone, then the next nearest; at most three trucks share a field. Gems are worth twice as much as ore but never grow back. Under fire it runs home and waits by the refinery until the danger has passed.', '', 'Unarmed: protect it'],
    fob: ['Drive it to a distant ore field and tap DEPLOY: it unpacks into an Outpost you can build around.', '', 'Unarmed while driving'],
    // Aircraft
    heli: ['A fast gunship with six Hellfire missiles a sortie: armour-piercing, deadly to tanks but poor against infantry. Flies home to rearm.', 'Tanks, vehicles', 'Infantry, AA Guns, SAM sites, rocket soldiers'],
    hind: ['An armoured Soviet gunship whose chain gun tears through infantry, with twelve bursts a sortie.', 'Infantry, light vehicles', 'AA defences, rockets'],
    jet: ['Styled after the F-15E Strike Eagle: two ground-attack missiles, two air-to-air missiles, four bombs and two bursts of flares per sortie.', 'Structures, aircraft', 'SAM sites, flak, rockets'],
    mig: ['A fast Soviet delta-wing fighter-bomber with missiles for ground and air targets, bombs and flares.', 'Structures, aircraft', 'AA Guns, rockets'],
  };
  const WEAPON = {
    rifle: 'Rifle', grenadier: 'Grenades (arcing, splash)', rocket: 'Dragon rockets; RedEye missiles (air)', pilot: 'Pistol',
    ranger: 'Machine gun (hits aircraft too)', ltank: 'Light cannon', mtank: 'Cannon', htank: 'Twin cannons', mammoth: 'Twin cannons + anti-air missile pods',
    arty: 'Howitzer (arcing, splash)', v2rl: 'V2 rocket (arcing, huge splash)', heli: 'Hellfire missiles (anti-armour)', hind: 'Chain gun',
    jet: 'Missiles (ground and air), bombs', mig: 'Missiles (ground and air), bombs',
    pillbox: 'Machine gun', turret: 'Cannon', aagun: 'Flak (aircraft only)', ftur: 'Flamethrower', tesla: 'Tesla bolt', sam: 'SAM missiles (aircraft only)',
  };
  const POWER_TEXT = {
    spy: 'A fast reconnaissance plane flies over the target and reveals a wide area.',
    para: 'A transport drops a squad of seven infantry by parachute wherever you choose.',
    bomb: 'A bomber carpet-bombs a strip of ground along its flight path.',
  };

  // --- Helpers ---------------------------------------------------------------------
  const side = (d) => (d.factions.length === 2 ? 'both' : d.factions[0] || 'none');
  const badge = (s) => s === 'both' ? '<span class="fm-side both">Both sides</span>' : s === 'allies' ? '<span class="fm-side allies">Allies</span>' : s === 'soviets' ? '<span class="fm-side soviets">Soviets</span>' : '<span class="fm-side none">Special</span>';
  const cells = (px) => `${Math.round(px / CELL * 2) / 2} cells`;
  const speed = (d) => d.cls === 'inf' ? 'On foot' : d.speed <= 32 ? 'Very slow' : d.speed <= 42 ? 'Slow' : d.speed <= 56 ? 'Medium' : d.speed <= 100 ? 'Fast' : d.speed <= 160 ? 'Very fast' : 'Jet';
  const armor = (d) => ({ inf: 'Infantry', light: 'Light', heavy: 'Heavy', air: 'Aircraft' }[d.armor] || 'Structure');
  const nameOf = (t) => defOf(t).name;
  const req = (list) => list && list.length ? list.map(nameOf).join(', ') : '';
  const pic = (type, faction) => {
    try { return `<img class="fm-pic" alt="" src="${cameoURL(type, faction)}">`; } catch (e) { return '<div class="fm-pic"></div>'; }
  };
  const stat = (k, v) => (v === '' || v === undefined ? '' : `<dt>${k}</dt><dd>${v}</dd>`);

  function entry(type) {
    const B = BUILD_DEFS[type], d = B || UNIT_DEFS[type], s = side(d), t = TEXT[type] || ['', '', ''];
    const faction = s === 'soviets' ? 'soviets' : s === 'allies' ? 'allies' : (window.__fmFaction || 'allies');
    const w = d.weapon, w2 = d.weapon2;
    let rows = stat('Cost', d.cost ? `$${d.cost}` : 'Free') + stat(B ? 'Strength' : 'Armour', B ? `${d.hp}` : `${armor(d)}, ${d.hp}`);
    if (B) {
      rows += stat('Power', d.power > 0 ? `+${d.power}` : d.power < 0 ? `${d.power}` : '0');
      rows += stat('Size', `${d.w} x ${d.h}`);
      rows += stat('Needs', req(d.req.filter((r) => r !== 'cy')) || (type === 'cy' ? '' : 'Construction Yard'));
    } else {
      rows += stat('Speed', speed(d));
      rows += stat('Built at', d.producer ? nameOf(d.producer) : '');
      rows += stat('Needs', req(d.req));
    }
    if (w || WEAPON[type]) {
      rows += stat('Weapon', WEAPON[type] || '');
      if (w) rows += stat('Range', w2 && w2.range > w.range ? `${cells(w.range)}, air ${cells(w2.range)}` : cells(w.range));
    }
    const strong = t[1] ? `<p class="fm-vs"><b>Strong against:</b> ${t[1]}</p>` : '', weak = t[2] ? `<p class="fm-vs"><b>Weak against:</b> ${t[2]}</p>` : '';
    return `<article class="fm-entry">
      <div class="fm-head">${pic(type, faction)}<div><h3>${d.name}</h3>${badge(s)}</div></div>
      <dl class="fm-stats">${rows}</dl>
      <p>${t[0]}</p>${strong}${weak}
    </article>`;
  }
  const entries = (types) => `<div class="fm-grid">${types.filter((t) => defOf(t)).map(entry).join('')}</div>`;
  function powers() {
    const f = window.__fmFaction || 'allies';
    return `<div class="fm-grid">${Object.entries(POWERS).map(([k, p]) => `<article class="fm-entry">
      <div class="fm-head">${pic('pw:' + k, f)}<div><h3>${p.name}</h3><span class="fm-side both">Airfield power</span></div></div>
      <dl class="fm-stats">${stat('Recharge', `${p.charge} s`)}</dl><p>${POWER_TEXT[k]}</p></article>`).join('')}</div>
      <p>Powers charge only while you own an Airfield, at half speed on low power. Tap one when it shows READY, then tap the target (on touch screens tap again or press LAUNCH to confirm). AA Guns and SAM sites can shoot the planes down.</p>`;
  }

  // --- The pages ---------------------------------------------------------------------
  const PAGES = [
    { ch: 'Contents', title: '', html: () => `
      <div class="fm-cover">
        <p class="fm-stamp">Restricted</p>
        <h2>Red Horizon</h2>
        <p class="fm-sub">Field Manual for Allied and Soviet Commanders</p>
        <ol class="fm-toc">${CHAPTERS.slice(1).map((c) => `<li><button type="button" data-goto="${c.page}">${c.name}</button><span>${c.page + 1}</span></li>`).join('')}</ol>
      </div>` },
    { ch: 'Basics', title: 'Your Mission', html: () => `
      <p>Somewhere on this island stands the enemy's <b>Construction Yard</b>. Destroy it and the mission is won. Lose yours and the mission is over: it cannot be rebuilt or sold.</p>
      <h4>Building a base</h4>
      <p>The left column of the sidebar builds structures, the right column builds units. When a structure is READY, tap the map to place it (it must touch your base: within 6 cells of your buildings, or 8 of an Outpost). A good start: <b>Power Plant</b>, then <b>Ore Refinery</b>, then <b>Barracks</b> and <b>War Factory</b>.</p>
      <h4>Money</h4>
      <p>Credits come from ore. Every refinery brings an Ore Truck that works on its own; ore fields grow back slowly and spread onto open ground beside them, so fields left alone slowly get bigger. Purple <b>gems</b> are worth twice as much but never regrow. Far-off fields are best worked from an <b>Outpost</b>: drive a Mobile Outpost there and deploy it.</p>
      <h4>Power</h4>
      <p>Each structure draws power. If demand passes supply your base runs on low power: production slows, the radar goes offline and Tesla Coils go dark. Build more Power Plants before that happens.</p>
      <h4>Radar</h4>
      <p>You start without radar. Build a <b>Radar Dome</b> to switch on the minimap, then tap it to jump the view.</p>` },
    { ch: 'Basics', title: 'Controls', html: () => `
      <table class="fm-table">
        <tr><th></th><th>Touch</th><th>Mouse and keyboard</th></tr>
        <tr><td>Select</td><td>Tap a unit; double-tap for all of that type on screen</td><td>Click; double click</td></tr>
        <tr><td>Select a group</td><td>Hold, then drag (or toggle the box button and drag)</td><td>Drag a box</td></tr>
        <tr><td>Move / attack</td><td>Tap the ground / an enemy</td><td>Click the ground / an enemy</td></tr>
        <tr><td>Deselect</td><td>The ✕ button</td><td>Right click or Esc</td></tr>
        <tr><td>Build</td><td>Tap an icon; when READY tap the map, then tap the ghost again</td><td>Click the icon, then the map</td></tr>
        <tr><td>Cancel production</td><td>Hold the icon</td><td>Right click the icon</td></tr>
        <tr><td>Scroll and zoom</td><td>Drag, pinch, or tap the radar</td><td>Arrow keys or WASD, mouse wheel, click the radar</td></tr>
      </table>
      <p>Select one of your structures to <b>repair</b> it (costs credits and takes about a minute; a quarter of the speed while under fire) or <b>sell</b> it. Select a Mobile Outpost and tap <b>DEPLOY</b> to unpack it.</p>` },
    { ch: 'Basics', title: 'Your Army in Battle', html: () => `
      <h4>Auto Attack</h4>
      <p>New units spread out to open ground around your base and guard it: where they stand is up to chance, so move them to cover the approaches you care about. <b>Auto Attack</b> starts off, and can only be switched on once you have uncovered an enemy building: units sent to attack only go after buildings you have found, so scout first. Switch it on and every idle unit heads out at once, each at its own top speed, fighting whatever it meets on the way; after that, new units go out 10 at a time. The AUTO button shows how many are waiting.</p>
      <h4>Defending</h4>
      <p>Units waiting near your base turn on any raiders inside it, or on anything shooting your Ore Trucks, then go back to their posts when it is quiet again.</p>
      <h4>Aircraft</h4>
      <p>Helicopters and jets take off as soon as they are built, attack on their own and fly home to rearm. Badly damaged aircraft come home and wait on their pad until repaired. Jets drop flares when a missile closes in, which can pull it off course. Fighters waiting on the Airfield scramble on their own when enemy aircraft come over your base, and jets with nothing left to hit fly home. A pilot shot down bails out and runs home; get them back to any of your structures for a $100 bonus.</p>
      <h4>Infantry under fire</h4>
      <p>Soldiers take cover when shot at: some stay up, some crouch (harder to hit) and some go prone (harder still).</p>
      <h4>Expansions</h4>
      <p>Outposts and outlying refineries are fair game: one auto-attack wave in three raids them, and the computer raids yours.</p>` },
    { ch: 'Structures', title: 'Base and Economy', html: () => entries(['cy', 'power', 'apower', 'refinery', 'outpost', 'dome']) },
    { ch: 'Structures', title: 'Production', html: () => entries(['barracks', 'factory', 'helipad', 'airfield']) },
    { ch: 'Structures', title: 'Defences', html: () => entries(['pillbox', 'turret', 'aagun', 'ftur', 'tesla', 'sam']) },
    { ch: 'Infantry', title: 'Infantry', html: () => entries(['rifle', 'grenadier', 'rocket', 'pilot']) },
    { ch: 'Vehicles', title: 'Armour', html: () => entries(['ranger', 'ltank', 'mtank', 'htank', 'mammoth']) },
    { ch: 'Vehicles', title: 'Support Vehicles', html: () => entries(['arty', 'v2rl', 'harv', 'fob']) },
    { ch: 'Aircraft', title: 'Aircraft', html: () => entries(['heli', 'hind', 'jet', 'mig']) },
    { ch: 'Powers', title: 'Airfield Support Powers', html: powers },
    { ch: 'Intel', title: 'The Enemy Commander', html: () => `
      <p>The computer plays by your rules: the same buildings, costs and units. How it fights depends on the difficulty.</p>
      <table class="fm-table">
        <tr><th></th><th>Easy</th><th>Normal</th><th>Hard</th></tr>
        <tr><td>Attack waves</td><td>4 to 7 units</td><td>5 to 10, big pushes of 10 to 13</td><td>6 to 12, big pushes of 12 to 16</td></tr>
        <tr><td>Targets</td><td>Your Construction Yard</td><td>A mix: yard, refineries, power, Outposts</td><td>Your weakest valuable buildings</td></tr>
        <tr><td>Raids</td><td>Rare</td><td>From about 4 minutes</td><td>From about 3 minutes</td></tr>
        <tr><td>Defences</td><td>Up to 4</td><td>Up to 8, plus AA</td><td>Up to 12, plus AA</td></tr>
        <tr><td>Against aircraft</td><td>No special answer</td><td>More anti-air troops and fighters, AA where you strike</td><td>The same, in greater numbers</td></tr>
      </table>` },
    { ch: 'Intel', title: 'Field Tips', html: () => `
      <ul class="fm-tips">
        <li>Build a second refinery early: two Ore Trucks double your income.</li>
        <li>Put an Outpost and refinery by a distant ore field instead of making trucks drive across the map, then guard it.</li>
        <li>Rocket Soldiers are cheap insurance against aircraft. So are AA Guns and SAM sites placed by your refineries.</li>
        <li>Artillery and V2 launchers outrange every defence. Park them behind your tanks and let them break a fortified line.</li>
        <li>Fast units like Rangers make good raiders: Ore Trucks are slow, expensive and unarmed.</li>
        <li>Never let your power run short just before a fight: Tesla Coils go dark and production crawls.</li>
        <li>A Radar Dome early lets you see raids coming on the minimap.</li>
        <li>Damaged structures can be repaired while you fight, but only at a quarter of the speed under fire: pull back and fix them between waves.</li>
      </ul>
      <p class="fm-end">End of manual. Good luck, Commander.</p>` },
  ];
  const CHAPTERS = [];
  PAGES.forEach((p, i) => { if (!CHAPTERS.some((c) => c.name === p.ch)) CHAPTERS.push({ name: p.ch, page: i }); });

  // --- The booklet ------------------------------------------------------------------
  let root = null, page = 0;
  function build() {
    root = document.createElement('div');
    root.id = 'manual';
    root.hidden = true;
    root.innerHTML = `<div class="fm-book" role="dialog" aria-modal="true" aria-labelledby="fmTitle">
      <header class="fm-top">
        <nav class="fm-tabs">${CHAPTERS.map((c) => `<button type="button" data-goto="${c.page}">${c.name}</button>`).join('')}</nav>
        <button type="button" class="fm-close" aria-label="Close the manual">✕</button>
      </header>
      <div class="fm-page"><h2 id="fmTitle"></h2><div class="fm-body"></div></div>
      <footer class="fm-foot">
        <button type="button" class="fm-prev">◀ Prev</button>
        <span class="fm-num"></span>
        <button type="button" class="fm-next">Next ▶</button>
      </footer>
    </div>`;
    document.body.appendChild(root);
    root.addEventListener('click', (e) => {
      const g = e.target.closest('[data-goto]');
      if (g) show(+g.dataset.goto);
      else if (e.target.closest('.fm-prev')) show(page - 1);
      else if (e.target.closest('.fm-next')) show(page + 1);
      else if (e.target.closest('.fm-close') || e.target === root) close();
    });
    document.addEventListener('keydown', (e) => {
      if (root.hidden) return;
      if (e.key === 'Escape') { close(); e.stopPropagation(); }
      else if (e.key === 'ArrowRight') show(page + 1);
      else if (e.key === 'ArrowLeft') show(page - 1);
    }, true);
  }
  function show(i) {
    page = Math.max(0, Math.min(PAGES.length - 1, i));
    const p = PAGES[page];
    root.querySelector('#fmTitle').textContent = p.title;
    root.querySelector('.fm-body').innerHTML = p.html();
    root.querySelector('.fm-page').scrollTop = 0;
    root.querySelector('.fm-num').textContent = `Page ${page + 1} of ${PAGES.length}`;
    root.querySelector('.fm-prev').disabled = page === 0;
    root.querySelector('.fm-next').disabled = page === PAGES.length - 1;
    for (const b of root.querySelectorAll('.fm-tabs button')) b.setAttribute('aria-current', +b.dataset.goto <= page && CHAPTERS.find((c) => c.page === +b.dataset.goto).name === p.ch ? 'true' : 'false');
    // On a narrow screen the tabs scroll sideways: keep the current chapter's tab in view.
    const cur = root.querySelector('.fm-tabs button[aria-current="true"]'), nav = root.querySelector('.fm-tabs');
    if (cur) nav.scrollLeft = Math.max(0, cur.offsetLeft - nav.offsetLeft - (nav.clientWidth - cur.offsetWidth) / 2);
  }
  function open(faction) {
    if (!root) build();
    window.__fmFaction = faction;
    root.hidden = false;
    show(page);
    root.querySelector('.fm-close').focus();
  }
  function close() { if (root) root.hidden = true; }
  return { open, close, get pages() { return PAGES.length; } };
})();

// What's New: every release, newest first, on the same paper as the Field Manual.
const News = (() => {
  let root = null;
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  function build() {
    root = document.createElement('div');
    root.id = 'news';
    root.hidden = true;
    const body = RELEASES.map((r, i) => `<section class="fm-release">
        <h3>${esc(r.title)}</h3>
        <p class="fm-when">${r.date} · version ${r.v}${i === 0 ? ' · <b>this version</b>' : ''}</p>
        ${r.groups.map(([head, items]) => `${head ? `<h4>${esc(head)}</h4>` : ''}<ul>${items.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`).join('')}
      </section>`).join('');
    root.innerHTML = `<div class="fm-book" role="dialog" aria-modal="true" aria-labelledby="newsTitle">
      <header class="fm-top"><span class="fm-brand">Dispatches</span><span style="flex:1"></span>
        <button type="button" class="fm-close" aria-label="Close What's New">✕</button></header>
      <div class="fm-page"><h2 id="newsTitle">What's New</h2>${body}</div>
    </div>`;
    document.body.appendChild(root);
    root.addEventListener('click', (e) => { if (e.target.closest('.fm-close') || e.target === root) close(); });
    document.addEventListener('keydown', (e) => { if (!root.hidden && e.key === 'Escape') { close(); e.stopPropagation(); } }, true);
  }
  function open() { if (!root) build(); root.hidden = false; root.querySelector('.fm-page').scrollTop = 0; root.querySelector('.fm-close').focus(); }
  function close() { if (root) root.hidden = true; }
  return { open, close };
})();
