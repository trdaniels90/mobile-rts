// Finds computer units that sit still for a long time while holding a move/hunt/attack order, or Ore Trucks that
// are not mining or unloading. node tools/sim/stuck.js <repo> [minutes] [map] [1v1|2v2] [seed]
const vm = require('vm');
const [root, mins = '12', map = 'bridge', mode = '1v1', seed0 = '1000'] = process.argv.slice(2);
const headless = require(root + '/server/headless.js');
const ctx = headless.load(), run = (s) => vm.runInContext(s, ctx);
const sides = mode === '1v1' ? `[{ faction: 'allies', ally: 0, ai: true }, { faction: 'soviets', ally: 1, ai: true }]`
  : `[{ faction: 'allies', ally: 0, ai: true }, { faction: 'soviets', ally: 1, ai: true }, { faction: 'soviets', ally: 0, ai: true }, { faction: 'allies', ally: 1, ai: true }]`;
run(`newWorld('allies', 'hard', ${+seed0}, 0, false, '${map}', ${sides}); for (const t of G.teams) t.auto = true; G.me = -1; 0`);
const hist = new Map(), report = new Map(); let samples = 0, stuckSamples = 0;
const WIN = 20;   // seconds without moving
for (let i = 0; i < +mins * 1800 && !run('G.over'); i++) {
  ctx.get('update')(1 / 30);
  if (i % 60) continue;   // every 2 s
  const now = run('G.t');
  const list = run(`G.entities.filter((e) => e.alive && e.kind === 'unit' && e.cls !== 'air' && G.teams[e.team].isAI).map((e) => [e.id, e.x, e.y, e.type, e.order.type, !!e.dest, e.target && e.target.alive ? 1 : 0, e.team, e.moving ? 1 : 0, e.stuckN, e.state || '', e.def.harvester ? JSON.stringify({ hs: e.hs, load: e.load, ref: e.ref && e.ref.id, dockU: e.ref && e.ref.dockU && e.ref.dockU.id, dockAlive: e.ref && e.ref.dockU && e.ref.dockU.alive, dockHs: e.ref && e.ref.dockU && e.ref.dockU.hs, q: e.qSpot && [Math.round(e.qSpot.x), Math.round(e.qSpot.y)], dest: e.dest && [Math.round(e.dest.x), Math.round(e.dest.y)], need: e.needPath, hcell: e.hcell, pathLen: e.path && e.path.length, wait: e.htimer, dock: e.ref && (()=>{const d=dockPoint(e.ref);return [Math.round(d.x),Math.round(d.y)]})(), holder: e.ref && e.ref.dockU && (()=>{const h=e.ref.dockU;return {x:Math.round(h.x),y:Math.round(h.y),dest:h.dest&&[Math.round(h.dest.x),Math.round(h.dest.y)],need:h.needPath,pl:h.path&&h.path.length,idx:h.pathIdx,best:h.dockBest,ban:h.dockBan,t:Math.round(G.t),mv:h.moving,load:h.load,ord:h.order.type}})() }) : ''])`);
  for (const [id, x, y, type, ord, dest, tgt, team, mv, sn, st, hv] of list) {
    let h = hist.get(id); if (!h) hist.set(id, h = []);
    h.push([now, x, y]); while (h.length && now - h[0][0] > WIN + 2) h.shift();
    if (now - h[0][0] < WIN) continue;
    const far = Math.max(...h.map((p) => Math.hypot(p[1] - x, p[2] - y)));
    if (far > 6) continue;
    const truck = type === 'truck' || type === 'harv' || /truck|harv/.test(type);
    const want = truck || ((ord === 'hunt' || ord === 'attack' || ord === 'move') && !tgt);
    samples++;
    if (!want) continue;
    stuckSamples++;
    const k = id; if (!report.has(k)) report.set(k, { id, type, ord, team, x: Math.round(x), y: Math.round(y), cell: [Math.floor(x / 24), Math.floor(y / 24)], first: Math.round(now), dest, hv, n: 0 });
    report.get(k).n++; report.get(k).last = Math.round(now);
  }
}
const arr = [...report.values()].sort((a, b) => b.n - a.n);
console.log('stuck samples', stuckSamples, 'distinct units', arr.length, 'final t', Math.round(run('G.t')));
for (const r of arr.slice(0, 25)) console.log(JSON.stringify(r));
