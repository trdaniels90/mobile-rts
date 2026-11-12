// Aircraft on Auto Attack (hunt orders) steer round anti-air the side has found. Headless: the enemy has a SAM
// Site beside part of its base; checks which building each aircraft goes for, that it still attacks when
// everything is covered, and that undiscovered anti-air is ignored. node tools/sim/aa-avoid.js <repo> [seed]
const vm = require('vm');
const [root, seed = '5'] = process.argv.slice(2);
const headless = require(root + '/server/headless.js');
const ctx = headless.load(), run = (s) => vm.runInContext(s, ctx);
run(`newWorld('allies', 'normal', ${+seed}); G.me = -1; G.teams[1].isAI = false; G.teams[0].isAI = false; G.teams[0].credits = 1e5; 0`);
const out = run(`(() => {
  const step = (s) => { for (let i = 0; i < s * 30; i++) update(1 / 30); };
  const ecy = buildingsOf(1).find((b) => b.type === 'cy'), me = G.teams[0];
  const mk = (x, y) => { const j = addUnit('jet', me, x, y); j.as = 'fly'; j.alt = JET_ALT; return j; };
  const res = {};
  const t1 = G.teams[1];
  for (const [t, dx, dy] of [['power', 20, 0], ['barracks', -16, 4], ['refinery', 4, 18]]) { const b = addBuilding(t, t1, ecy.cx + dx, ecy.cy + dy); if (b) b.buildT = 1; }
  // 1. nothing discovered: the Construction Yard
  G.fog[0].fill(1);
  const pickWith = (label) => { const j = mk(ecy.x - 900, ecy.y); setHunt(j); const b = nearestEnemyBuilding(j); res[label] = b && b.type; j.alive = false; return b; };
  pickWith('noAA');
  // 2. a SAM Site beside the Construction Yard, found: it picks an open building elsewhere
  const others = buildingsOf(1).filter((b) => b !== ecy);
  const far = others.reduce((a, b) => (dist(b, ecy) > dist(a, ecy) ? b : a));
  const sam = addBuilding('sam', G.teams[1], ecy.cx + 4, ecy.cy);
  sam.buildT = 1;
  AA_CACHE[0] = null; AA_CACHE[1] = null;
  const aa = knownAA(0, true);
  res.aaKnown = aa.length; res.coverCy = aaCover(aa, ecy); res.coverFar = aaCover(aa, far); res.farType = far.type;
  const b2 = pickWith('withSAM'); res.withSAMcovered = b2 ? aaCover(aa, b2) : null;
  // 3. everything covered: still attacks something (the least covered)
  for (const b of buildingsOf(1)) if (b !== sam) { const s2 = addBuilding('sam', G.teams[1], b.cx, b.cy + b.h + 1); if (s2) s2.buildT = 1; }
  AA_CACHE[0] = null; AA_CACHE[1] = null; const aa3 = knownAA(0, true);
  const b3 = pickWith('allCovered'); res.allCoveredPicked = b3 && b3.type; res.allCoveredCover = b3 ? aaCover(aa3, b3) : null;
  // 4. SAM on ground it has not uncovered is not counted
  for (const b of buildingsOf(1)) if (b.def.antiAir) b.alive = false;
  G.fog[0].fill(0); AA_CACHE[0] = null; AA_CACHE[1] = null;
  const hidden = addBuilding('sam', G.teams[1], 5, 5); hidden.buildT = 1; AA_CACHE[0] = null; AA_CACHE[1] = null;
  res.hiddenSamCounted = knownAA(0, true).length;
  return res;
})()`);
console.log(JSON.stringify(out));
const ok = out.noAA === 'cy' && out.aaKnown >= 1 && out.coverCy >= 1 && out.coverFar === 0 && out.withSAMcovered === 0 && out.allCoveredPicked && out.hiddenSamCounted === 0;
console.log(ok ? 'PASS' : 'FAIL');
process.exit(ok ? 0 : 1);
