// The computer with no ore near its refineries buys a Mobile Outpost first (front of the queue, with little
// money) and holds army production until it is out. Headless. node tools/sim/ai-starved.js <repo>
const vm = require('vm');
const root = process.argv[2];
const headless = require(root + '/server/headless.js');
const ctx = headless.load(), run = (s) => vm.runInContext(s, ctx);
run(`newWorld('allies', 'hard', 7, 0, false, 'bridge', [{ faction: 'allies', ally: 0, ai: true }, { faction: 'soviets', ally: 1, ai: true }]); G.me = -1; 0`);
const r = run(`(() => {
  for (let i = 0; i < 30 * 240; i++) update(1 / 30);
  const t = G.teams[1], before = aiStarved(t);
  const refs = buildingsOf(1).filter((b) => b.type === 'refinery');
  for (let c = 0; c < G.ore.length; c++) if (!G.gem[c] && refs.some((b) => Math.hypot(cellX(c) - b.cx, cellY(c) - b.cy) <= 16)) G.ore[c] = 0;
  t.starvedT = undefined; t.credits = 400;
  const q0 = t.queues.vehicle.map((q) => q.type).join(), iq0 = t.queues.infantry.length;
  t.queues.infantry.length = 0;
  aiThink(t);
  const head = t.queues.vehicle[0] && t.queues.vehicle[0].type;
  const remote = !!aiRemoteField(t), fac = buildingsOf(1).some((b) => b.type === 'factory');
  return { outposts: buildingsOf(1).filter((b) => b.type === 'outpost').length, fobs: unitsOf(1).filter((u) => u.type === 'fob').length, credits: Math.round(t.credits), before, starved: aiStarved(t), refs: refs.length, fac, remote, q0, q: t.queues.vehicle.map((q) => q.type).join(), head, infantryQueued: t.queues.infantry.length };
})()`);
console.log(JSON.stringify(r));
const ok = !r.before && r.starved && (!r.fac || !r.remote || (r.head === 'fob' && r.infantryQueued === 0));
console.log(ok ? 'PASS' : 'FAIL'); process.exit(ok ? 0 : 1);
