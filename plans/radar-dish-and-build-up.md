# Plan: Soviet radar dish turns, new construction animation

For a Sonnet session to code. Read `CLAUDE.md` first (branch rule: work on `claude/cross-platform-game-k2d9lb`,
do not release or deploy; show the owner an MP4 and wait for their OK).

**Looks only, both modes.** Nothing in the simulation, saves or snapshots changes. `buildT`, `sellT` and `team.low`
are already synced to online guests, so the server needs no change. Keep every new per-building value in a `Map`
in art.js keyed by `b.id`, never as a field on `b` (fields on entities are saved and sent over the network).

Defaults below are the planner's picks; the owner can change them (see "Owner decisions" at the end).

---

## Part 1: the Soviet radar dish turns

### Where things are now
- `SOVIET.dome` in `src/models.js` (about line 4141): concrete bunker, pedestal `m.cylZ(22, 28, 13, 18, 3, ...)`,
  then the curved mesh antenna (loop `for (let x = 6; x < 39; x++)`, curve `y = 25 - dx*dx/34`, z 18-32) and the
  feed horn boom `m.box(21, 17, 24, 24, 28, 26, ...)`. All baked into the structure sprite.
- Rotating parts already exist for defences: `HEADS` in models.js (`[builder, pivot x, pivot y, pivot height]`,
  model built round its own pivot at z 0), `headSprite(type, faction, angle, stage)` (32 facings via
  `facingSprite`), drawn in `drawStructure` (art.js about line 1758) with `liftPt(x + h[1], y + h[2], h[3] * VK)`.
  Heads are not baked (made on demand), so a new one needs no bake.

### Steps
1. **models.js:** take the antenna loop and the feed horn out of `SOVIET.dome` (the pedestal stays in the
   building). Add a new table next to `HEADS`:
   ```js
   // Turning parts that are not weapons: keyed by type, then faction. Same layout as HEADS.
   const SPINNERS = { dome: { soviets: [(pal) => { ... }, 22, 28, 18] } };
   ```
   The builder rebuilds the same antenna and feed horn, shifted so the pivot (x 22, y 28, z 18 of the building)
   is at (0, 0, 0): x - 22, y - 28, z - 18. Size the `VModel` to fit (about `new VModel(-18, -14, 36, 18, 16)`;
   check nothing is clipped). Do **not** add `dome` to `HEADS`: `HEADS` is keyed by type only (the Allied Radar
   Dome would get it too) and world.js `muzzle` reads it.
2. **models.js:** `spinnerSprite(type, faction, angle, stage)`, a copy of `headSprite` reading `SPINNERS[type][faction]`
   (key `'P' + type + pal.key`; damaged stages through `scorchModel` the same way).
3. **art.js `drawStructure`:** after the `HEADS` block, if `SPINNERS[b.type] && SPINNERS[b.type][b.faction]`, draw it
   exactly as the turret head is drawn (`liftPt`, `blit(.., false)`, no recoil). Angle:
   - `const DISH_SPEED = 0.9` rad a second (about one turn in 7 s; RA-style slow sweep).
   - A `Map` `dishAngle` (id -> { a, t }): each draw advances `a` by `DISH_SPEED * (G.t - t)` (clamp the step to
     0.25 s so a paused or held game does not jump), start at `b.id * 1.7` so dishes are out of step.
   - It does not turn while `b.buildT < 1`, while `b.sellT > 0`, at damage stage 2, or while its side is on low power
     (`G.teams[b.team].low`), matching how low power slows everything else. It keeps its last angle.
   - Delete entries for dead buildings now and then (e.g. when the map grows past 64 entries, drop ids not in `G.byId`).
4. **Damaged models:** `damageModel` / `damagedSprite` work from the building model, which no longer has the dish:
   check stage 1 and 2 of the Soviet dome still look right (holes in the bunker) and the dish is drawn scorched.
5. **Rebake:** models.js changed, so `node tools/bake-sprites.js <repo>` (then `--check`) and
   `node tools/bake-ground.js <repo> --check` (rebake the ground if the key changed). Spinners are not baked.
6. **Sidebar cameo / Field Manual picture** of the Soviet Radar use the building model: draw the dish into them
   too, at a fixed angle, so the cameo is not a bare pedestal. Find where cameos are made (`cameo` in models.js /
   ui.js); if a structure cameo has no hook for extra parts, put the antenna back for `cameo === true` only
   (`SOVIET[k](pal, cameo)` already receives it) instead of adding one.
7. **Optional, only if the owner says yes:** the Allied Radar Dome's small mast dish (`STRUCTURES.dome`,
   `m.ellipsoid(40, 14, 31, ...)`) turning the same way: `SPINNERS.dome.allies` with the mast top as pivot.

---

## Part 2: new construction (and selling) animation

### Where things are now
- `updateBuilding` (world.js about line 4293): `b.buildT` goes 0 to 1 over 1.4 s after placing, with clank sounds.
  Selling sets `sellT = 1.2` and counts down.
- `drawStructure` (art.js about line 1746): while `k < 1` it darkens the footprint and draws the bottom `k` of the
  sprite with a 1 px gold line on top. That is the whole animation.

### Design (default; owner can change)
Keep the 1.4 s (changing it is a gameplay change). Replace the `k < 1` branch with `drawBuildUp(g, b, s, x, y, k, selling)`
in art.js, in four overlapping phases of `k`:

| k | What shows |
|---|---|
| 0 - 0.15 | The footprint: a dark pad fades in, a dashed outline of the footprint in the faction colour (draw on the ground plane, so it is a diamond in the iso view: use `toView`/the same transform as other ground lines such as `drawRally`). Dust puffs at the four corners. |
| 0.05 - 0.85 | Scaffold: a pole at each footprint corner rising ahead of the building to `min(1, k * 1.25)` of the sprite's top, with horizontal rails every 8 px between neighbouring poles (lines from `liftPt(corner, h)`). Allies yellow (`#d8b13a`), Soviets red-brown (`#9c3a2a`) with grey rails. |
| 0.1 - 0.95 | The building rises out of the ground as now (bottom rows of the sprite), with a bright weld line at the top edge that flickers, and 6-10 spark pixels shooting off it (orange/white). |
| 0.85 - 1 | Scaffold fades out; a short white sheen sweeps once across the sprite (draw the sprite again with `globalCompositeOperation = 'lighter'` and alpha `0.35 * (1 - (k - 0.85) / 0.15)`, clipped to a moving diagonal band). |

Selling plays the same thing backwards from `k = sellT / 1.2` (the existing `Math.min(k, ...)`), without the sheen.

### Rules for the code
- **No state, no effects.** Everything the animation draws is worked out from `k`, `b.id` and `G.t` (use a small hash
  like `strSeed` or `hash3` for spark positions), so it costs nothing to keep and looks the same however often it
  is drawn. Do not push into `G.effects` from drawing code (effects are part of the battle copy online).
- **Iso view:** heights go through `liftPt(x, y, h * VK)`; things standing up (poles, sparks) use the same helpers
  the flags use (`standAt`). The sprite crop must keep working with `uprightCtx`: the existing code calls
  `g.drawImage(s.img, sx, sy, sw, sh, dx, dy, dw, dh)` with the 9-argument form, check `uprightCtx` in art.js
  handles that form for a sprite (has `_ox`), and if it does not, draw through the same path `blit` uses.
- Walls and gates (`wallPic`) and village houses are not structures here: leave them alone.
- Defences that go up (turrets, SAM) must not show their head before `buildT` reaches 1 (check: today the head is
  skipped because of the early `return`; keep that).
- Keep it cheap: a few dozen `fillRect`/line calls per building going up. A Construction Yard placing walls of
  structures should not cost more than about 0.2 ms a frame.

### Steps
1. Write `drawBuildUp` in art.js and call it from `drawStructure` in place of the current `k < 1` block.
2. Optional extra, only if cheap: a soft "thunk" when it finishes is already the `build` sfx; do not add sounds.
3. Check the Field Manual / debrief do not call `drawStructure` with `buildT < 1` (they draw sprites directly).

---

## Testing (keep runs short: the owner's usage is limited)

1. `node --check src/*.js`, `node tools/bake-sprites.js . --check`, `node tools/bake-ground.js . --check`.
2. Throwaway Playwright script in the scratchpad (not committed), from `tools/sim` patterns: start a skirmish as
   Soviets, place a Radar on open ground near the camera, then an Allied game the same way. Record about 8 s of
   each at phone size (390 x 844) with `recordVideo`, convert to **MP4** with ffmpeg (never GIF), and show the
   owner: a Soviet Radar going up, its dish turning, it stopping on low power (sell the power plants), and a sale.
3. Look for console errors; run `node tools/sim/save-load.js .` once (a battle saved mid-construction continues).
4. Commit on `claude/cross-platform-game-k2d9lb`, push, and wait for the owner's OK. Add a short note to `CLAUDE.md`
   (what `SPINNERS` and `drawBuildUp` are, "looks only, both modes, not released").

## Owner decisions (ask before or with the first video)
- Construction time stays 1.4 s (looks only)? A longer build-up would be a gameplay change for both modes.
- Should the Allied Radar Dome's small dish turn too (Part 1 step 7)?
- Dish speed (default one turn in about 7 s) and whether low power stops it.
