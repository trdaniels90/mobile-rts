// When does the computer attack? Headless 1 v 1 of two computers; logs when each side sends waves and how
// many squads retreat or turn home. node tools/sim/ai-timing.js <repo> [games] [minutes] [difficulty] [map]
const vm = require('vm');
const [root, games = '3', mins = '25', diff = 'normal', map = 'bridge'] = process.argv.slice(2);
const headless = require(root + '/server/headless.js');
for (let g = 0; g < +games; g++) {
  const ctx = headless.load(), run = (s) => vm.runInContext(s, ctx);
  const seed = 2000 + g * 7919;
  run(`newWorld('allies', '${diff}', ${seed}, 0, false, '${map}', [{ faction: 'allies', ally: 0, ai: true }, { faction: 'soviets', ally: 1, ai: true }]); for (const t of G.teams) t.auto = true; G.me = -1; 0`);
  const t0 = Date.now(), at = [[], []], last = [0, 0]; let err = null;
  try {
    for (let i = 0; i < +mins * 60 * 30 && !run('G.over'); i++) {
      ctx.get('update')(1 / 30);
      if (i % 30 === 0) for (const t of run('G.teams.map((t) => t.waves || 0)').keys()) {
        const w = run(`G.teams[${t}].waves || 0`);
        if (w > last[t]) { last[t] = w; at[t].push(Math.round(run('G.t'))); }
      }
    }
  } catch (e) { err = e.stack.split('\n').slice(0, 4).join(' | '); }
  console.log(JSON.stringify({ game: g, seed, cpuSec: Math.round((Date.now() - t0) / 1000), t: Math.round(run('G.t')), waveTimes: at, over: run('G.over && G.over.winner'), squads: run('G.teams.map((t) => t.sqn || null)'), how: run('G.teams.map((t) => t.flk || null)'), approach: run('G.teams.map((t) => (t.apHist || []).map((a) => Math.round(a * 57.3)))'), err }));
}
