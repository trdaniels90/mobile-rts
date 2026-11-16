# Plan: Soviet radar dish turns, new construction animation for every structure (iso camera)

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

## Part 2: new construction (and selling) animation for every structure, made for the iso camera

Owner's report: building animations look wrong with the new camera angle. This covers every structure (all types,
both factions), not one building.

### What is wrong now (art.js `drawStructure`, about line 1746)
While `k = buildT < 1` it does three things, all written for the old straight-down view:
1. `g.fillRect(x, y, b.w * CELL, b.h * CELL)` for the dark pad. `ui.js` draws structures with `v.upright = true`
   (ui.js line 506), so `uprightCtx` turns this into an upright screen rectangle round the footprint's middle, not
   the footprint's diamond.
2. It draws the bottom `hh` screen rows of the sprite. In the iso view the bottom of the picture is the footprint's
   front corner, so the building appears as a wipe from the front corner upward (left and right corners pop in half
   way), not as something rising or being built.
3. The gold line `fillRect(x, y + s.oy + H - hh, b.w * CELL, 1)` mixes a screen-row offset into world coordinates:
   in the turned view it lands in the wrong place, and as an upright 1 px line it does not follow the building.
Selling uses the same code backwards.

### New design: built layer by layer (default; owner can change)
Keep the 1.4 s (changing it is a gameplay change). Replace the `k < 1` block with `drawBuildUp(g, b, s, x, y, k, selling)`.

1. **Layered sprites (the main look).** Like Tiberian Sun's build-up: the building's own voxel model cut off at a
   height, so walls go up course by course with their cut tops showing. `BUILD_STEPS = 6` cut heights.
   - models.js: `buildModel(m, step)` = `copyModel(m)` with every voxel above `ceil(m.d * step / BUILD_STEPS)` cleared;
     the voxels on the new top layer that were inside a wall get a slightly darker, rough material so the cut reads
     as unfinished (optional, only if cheap). `buildSprite(type, faction, step, camo)`: key `'S' + type + pal.key + 'b' + step`,
     made like `damagedSprite`: queued (a `buildQueue` worked like `dmgQueue` / `pumpDamaged`, one sprite every 20 ms,
     never in a frame), returns null until ready.
   - When to make them: when the player's own item becomes ready to place (the sidebar's ready state) queue that type's
     steps for `G.me`'s palette; and whenever any structure with `buildT < 1` is drawn (enemies, allies, computer).
     Not on the game server (it draws nothing).
   - Not baked (that would be 6 x the structure sheets). Let them go: drop a type's step sprites from the sprite
     cache once no building of that type and palette has been under construction for 30 s (check how `sprite()`
     caches in models.js and add a delete if there is none).
   - Draw: step = `floor(k * BUILD_STEPS)` (0 = only the slab); while that step's sprite is not ready use the
     fallback (2). Step 6 is the finished sprite.
2. **Fallback, also the first moments: rising through the ground.** Draw the full finished sprite pushed down the
   screen by `(1 - k) * H` and clipped (`g.save(); g.beginPath(); ... g.clip()`) to the region above the footprint's
   front edges: the polygon through the footprint's left, front and right corners (world corners turned with the
   view transform, so build it in world coordinates with `g.upright = false` or in screen coordinates with
   `toView`), extended straight up to the top of the screen. It then sinks into its own pad in the iso view. This
   replaces the row crop for good, so nothing depends on the layered sprites being ready.
3. **Pad.** Draw the footprint in world coordinates with `upright` off (see `screenDraw` in ui.js line 207 for how
   upright is switched), so it is the diamond: dark pad fading in over `k` 0 to 0.15, a dashed outline in the
   faction colour, dust puffs at the four corners for the first 0.3 s.
4. **Scaffold.** At each footprint corner a pole standing up the screen from `liftPt(cornerX, cornerY, 0)` to the
   current build height (step height x `VK`, a little above it), and rails between neighbouring poles every 8 px of
   height, drawn on the back two sides before the building and the front two after it, so the building is inside the
   scaffold. Allies yellow (`#d8b13a`), Soviets red-brown (`#9c3a2a`) with grey rails. Fades out over k 0.85 to 1.
5. **Welding sparks** at the current top: 6 to 10 spark pixels at points along the footprint's edges lifted to the
   build height, flickering.
6. **Finish:** a short white sheen sweeps once across the finished sprite (draw it again with
   `globalCompositeOperation = 'lighter'`, alpha `0.35 * (1 - (k - 0.85) / 0.15)`, clipped to a moving diagonal band).
7. **Selling** plays it backwards from `sellT / 1.2` (layers come off, scaffold goes back up), no sheen.

### Rules for the code
- **No state, no effects.** Everything the animation draws is worked out from `k`, `b.id` and `G.t` (use `strSeed` or
  `hash3` for spark spots), so it looks the same however often it is drawn. Do not push into `G.effects` from drawing
  code (effects are part of the online battle copy). The only stored things are sprites in the cache.
- Use the view helpers in voxel.js (`toView`, `fromView`, `liftPt`, `VK`) and `standAt` (art.js) for things standing up.
  Do not mix screen-row offsets into world coordinates (bug 3 above).
- Draw order: structures are sorted with units by their footprint's front corner; the scaffold's front rails must not
  be drawn over units standing in front of the building (only draw within the building's own draw call).
- Every footprint size (1x1 turret to 4x4 and the 3x3 Tech Center), both factions, the camouflaged Pillbox (its pad
  colour from `groundColour`), and defences: no head (turret, SAM, Flame Tower, AA gun, dish spinner) before `buildT`
  reaches 1 (today's early `return` does this: keep it).
- Walls, gates and village houses are not structures here: leave them alone.
- Keep it cheap: a few dozen draw calls per building going up, about 0.2 ms a frame for one building.
- The sidebar, Field Manual and debrief draw sprites directly, not through `drawStructure`: unchanged.

## Testing (keep runs short: the owner's usage is limited)

1. `node --check src/*.js`, `node tools/bake-sprites.js . --check`, `node tools/bake-ground.js . --check`.
2. Throwaway Playwright script in the scratchpad (not committed), from `tools/sim` patterns: start a skirmish as
   Soviets, place a Radar on open ground near the camera, then an Allied game the same way. Record about 8 s of
   each at phone size (390 x 844) with `recordVideo`, convert to **MP4** with ffmpeg (never GIF), and show the
   owner: a Soviet Radar going up, its dish turning, it stopping on low power (sell the power plants), and a sale.
   Also record, zoomed in, a 1x1 (Gun Turret or Pillbox), a 2x2 (Barracks) and a big one (Construction Yard or War
   Factory) of each faction going up and one being sold, with units walking past in front, the first build of a type
   (fallback, then layers) and a second one (layers from the start).
3. Look for console errors; run `node tools/sim/save-load.js .` once (a battle saved mid-construction continues).
4. Commit on `claude/cross-platform-game-k2d9lb`, push, and wait for the owner's OK. Add a short note to `CLAUDE.md`
   (what `SPINNERS` and `drawBuildUp` are, "looks only, both modes, not released").

## Owner decisions (ask before or with the first video)
- Construction time stays 1.4 s (looks only)? Six layers in 1.4 s is quick; a longer build-up (e.g. 2.5 s) would show
  them better but is a gameplay change for both modes.
- Layered build (default) or only the cheaper "rising through the ground" with scaffold?
- Should the Allied Radar Dome's small dish turn too (Part 1 step 7)?
- Dish speed (default one turn in about 7 s) and whether low power stops it.
