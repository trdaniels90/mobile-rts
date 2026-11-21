# Red Horizon: feature notes

Moved out of `CLAUDE.md` (2026-11-19) so sessions do not load them all. Read the section for the part of the game you are changing; add notes for new features here, newest last.

## Tiberian Sun look (WORK IN PROGRESS, prototype off by default; looks only, both modes)

**Goal (owner, 2026-11-19):** bring the game's look closer to Tiberian Sun's (original work only, nothing copied). A prototype in
`src/look.js` (`LOOK.light`, `LOOK.cliffs`, `LOOK.concrete`).
- **Kept apart (owner: "I don't want this touching the main game until it is ready"):** it lives ONLY on the branch
  `claude/ts-look`; the main branch `claude/cross-platform-game-k2d9lb` has none of it (only a pointer in CLAUDE.md). Never release
  it to the owner's build, the test build or the Windows app until the owner says it is ready. Bring the main branch in now and
  then (`git merge origin/claude/cross-platform-game-k2d9lb`) so the look test shows the current game. On this branch the look is
  ON unless the address has `?look=off`; the menu's version line says "Look test".
- **Look test page** (shareable, the owner shares it from claude.ai): artifact https://claude.ai/artifact/PiiUht6h9D94h1KR1DD2gP
  (slug `b7fc1b4a-ebb5-41ce-bf4c-f9fab9d9fbb0`). Update it like the owner's build (CLAUDE.md "Releasing" step 3-4: single file to `.build/index.html` plus
  `sprites/`, `grounds/`, `music/`), but from this branch and to this slug. Single player only: a claude.ai page blocks
  connections to other hosts, so online play and match reports do not work there (which keeps look tests out of the stats).
  For online testing later: a test build on GitHub Pages would need the owner's OK (Pages serves `main`). Owner reviews each step as a before/after MP4 (`tools/look/record.js` makes the frames, `tools/look/video.sh` the MP4;
recorder usage at the top of record.js).
- **Done, owner liked it ("good starting point", "looks better"):** `drawLook` (ui.js, after the view is put on the screen, not on
  day/night maps): saturation -26%, a cool multiply grade, a low sun from the upper left (soft-light gradient), a light shade with
  holes where fires, blasts, Tesla bolts and structures glow, their warm glow added once at 0.3 ('lighten' buffer, so overlapping
  blasts never pile up; owner said the first version's flames were overwhelming), a vignette. `cloudShadows`: a tileable noise
  cut into clouds, fixed to the ground, drifting (9, 3.5) view px a second, multiplied over the picture.
- **Made, video sent, waiting on the owner's verdict:** tall cliffs and concrete (video of 2026-11-19).
  - Cliffs: `G.cliff` ridges stand up as flat-topped plateaus (Tiberian Sun style mesas): paintCliffs' own mound sum (cut from its
    source, so the crag stands on its painted foot), steep sides to `CLIFF_TOP` (34) and lone rocks lower (`big`), drawn per cell
    as a voxel-space picture (columns back to front, rock faces with strata, grassy/mossy tops, snowy on winter maps) sorted in with
    the units (ui.js `cliffItems` / kind 'cliff' / `drawCliff`), and a shadow to the screen's right (`cliffShadow`). Pictures are
    made 9 a frame (`cliffItems`), so they pop in at first: needs warming at battle start before release.
  - **Ground round structures, redone 2026-11-19 (owner, from a Tiberian Sun screenshot: "I don't see any concrete besides
    the ore refinery and war factory. Even then they're slabs"):** `concreteDecal` now paints ragged patches of worn ground
    round every structure (dark wet earth on snow, trodden dirt elsewhere; out to `CON_M` 40 px, edges from a world-position
    noise so neighbouring patches run together) and a concrete slab only under the Ore Refinery and War Factory
    (`CON_SLABBED`), exactly the footprint, with a neat edge. bibDecal now takes the structure's type (world.js passes it;
    older saved marks have none: dirt only). The notes below on the earlier concrete are history.
  - Concrete (earlier): `concreteDecal` replaces `bibDecal`'s dirt (art.js hook): 12 px slabs on a world grid with joints, grit, oil stains,
    cracks, a full outer ring (owner, 2026-11-19: no missing slabs; was 22% left out) with about a third of its slabs weathered and cracked (`worn`), and a little dirt; every pixel from its world position, so pads and tiles join seamlessly.
- **Made, video sent 2026-11-19 (owner asked for them; verdict pending):** `LOOK.lamps` and `LOOK.ground`.
  - Lamps (`structLamps`, `drawLamps`, in drawLook): from each structure type's voxel model, red beacons on its 1-2 highest
    points (blink 0.14 of every 1.6 s, own phase per structure), a warm glow per 4 x 4 x 4 block of window glass facing the camera
    (up to 10; out below 30% health). **Defences give off no light at all** (owner, 2026-11-19: "it doesn't look correct on
    them"; no beacons, windows or structure glow, and on day/night maps not the night pool of light in drawNight either, art.js
    hook), with one exception: the **Allied AA Gun's searchlight, at night only** (`drawSkyBeams`, after drawNight on day/night
    maps, fading in with `dayNight().night`): a beam up into the sky, sweeping overhead, locked on the nearest enemy aircraft it
    can see within `AA_LOOK` (320 px). Dropped earlier tries: ground searchlights on every defence, SAM beams, AA beams by day.
    On the day/night maps (Village, Frost), where drawLook is not used, the beacons and windows were missing (owner,
    2026-11-19: "my buildings as allies had no lights"): now drawn there on their own, after drawNight (`drawLampsAlone`).
    Note for the main game: its own night lighting puts a pool of light round every structure, the camouflaged pillbox included.
  - Ground (`lookGround`, called from `cliffItems`, so under units and cliff shadows): a fixed soft-light noise of drier, lusher
    and darker patches (12 world px a noise pixel), and tank tracks: every 5 px a ground vehicle moves, a pair of tread marks,
    fading over `TRACK_LIFE` 25 s (max 6000; kept in `lookTracks`, not in G, so not saved). The first strength was invisible on
    the dark graded grass; now up to 0.72 alpha.
- **Made 2026-11-19 (owner asked: "do this"; verdict pending):**
  - Debris round wrecks: `wreckDebris`, drawn under each wreck by wrapping `MARK_DRAW.bakeWreck` (a mark, so once, on the tiles;
    from the wreck's seed, within 35 px: torn metal, rust, plates, bright scraps, track links, ash).
  - Smoother edges: art.js `groundPixels` with `SOFT` (`LOOK_SOFT`, also written into the ground workers' constants line, so it
    is fixed when they start: compare with `?lookoff=ground`): grass fades into dirt and road over a band (darker, worn at the
    middle of it) instead of a dithered cut-off at 0.42, and into the shore's sand. **The baked grounds (`grounds/`) on this
    branch are rebaked with it**: if the look ever becomes optional, the fixed maps need both bakes or none.
  - Water (`LOOK.water`, `drawWater` from `lookGround`, under units): open water (terr 4) as a quarter-size mask from the cells'
    water field, two layers of thin wave crests drifting different ways (added), and foam in a band just off the shore that
    swells and ebbs. Not on winter maps (icy water). Tank tracks are not laid on bridges, fords or water.
  - `tools/look/record-ground.js`: before/after as two page loads (`?lookoff=ground,water`), the same staged scene at the
    crossing nearest River Crossing's middle.
- **Made 2026-11-19 (owner asked; verdict pending): bigger smoke and fires** (`LOOK.smoke`, `lookSmoke`, from ui.js after the
  sorted list, so over the units): the look's own particles (not in G: not saved, not online), fed from structures below 60%
  health (dark smoke from their `damageSpots`, thicker below 30%, where the spots also burn with flames; not the camouflaged
  pillbox), 'fire' effects (one flame per 14 px cluster, so a wreck's many small flames make one, and a puff now and then) and
  smouldering craters (thin grey). Puffs rise, swell, lean more with `windNow()` as they age and fade (life 5-8 s; max
  `SMOKE_MAX` 1400); flames from 6 drawn frames, added; embers. The first try had a big flame on every small flame (far too
  much), now merged and smaller. Thinned at the owner's word ("thin the smoke a bit"): structures' smoke 0.38 / 0.28 opacity (was 0.55 / 0.4) and
  5 / 2.5 puffs a second per spot (was 7 / 3.5), fires' puffs 0.3, craters' 0.22.
- **Tank turret fix (main game, 2026-11-19, on both branches, not released):** see the commit "Fix: a tank's turret slipped a
  pixel" (art.js `blit`): hull and turret were rounded to pixels separately, twice, so the turret wobbled on the hull.
- **Terrain height, stage 1 of 3 (2026-11-19; owner's picks: "Height with rules", **both modes**, on the existing maps):**
  - world.js `makeHeights` -> `G.hgt` (cell middles, world px 0..`HG_MAX` 30): two layers of smooth noise from the map's ground
    seed (fixed maps: always the same hills), down to 0 within 5 cells of water, and level ground round every start position
    (see "Flat starting bases" below; was 8-13 cells). Same on the server and every phone (online games call newWorld with the
    seed and map). `hgtAt`, `standH` (none for aircraft in the air), `slopeMul`.
  - Rules: `distTo` divides the distance by 1 + `HG_DOWN` (0.2) x height difference / 30 when the first is higher, 1 - `HG_UP`
    (0.1) x ... when lower (so reach, acquiring, AI distances all follow; measured 135 px -> 113 down, 150 up); sight +`HG_SIGHT`
    (2) cells at the top (`revealAround`); speed x `slopeMul` (65% to 112%; 81% up a typical hillside) in followPath and slideOut.
  - Looks, for now: hill shading painted into the ground (art.js groundPixels `hgt`, also in the workers and `groundKey`): slopes
    toward the sun lit, the others shaded. Grounds rebaked. Units are NOT drawn raised yet.
  - **Stage 2, made 2026-11-19 (video sent; verdict pending): the ground drawn raised** (`LOOK.hills`, look.js "Raised ground";
    `?lookoff=hills` draws it flat as in stage 1). Drawing only: rules, saves and online play are unchanged.
    - `gLift(x, y)`: `hgtAt` x VK view px up the screen (up to about 25), faded to 0 over the outer `HILL_EDGE` (72 px) of the
      map so the flat land past the edge meets it. `hillPt` (a world point lifted), `onHill(g, x, y, fn)` (fn drawn with the
      world transform moved up by the lift there).
    - The ground: not a view-space picture per tile after all, but `hillWarp` (look.js) + makeGround's `draw(..., warp, after)`
      (art.js): each tile drawn in `HILL_CH` (32 px) chunks, each through its own affine transform fitted to the lift at its
      four corners, drawn `HILL_LAP` (0.6 px) larger so neighbours overlap (no seams seen). Tiles whose 256 px square (and a
      cell round it) is all height 0 are drawn in one piece (`hillFlatBox`: bases and shores). No per-tile pictures, so marks,
      stand-ins and the baked ground work as before; the cost is one drawImage per chunk per layer (some hundreds a frame on
      a phone; zoomed far out on a big screen a few thousand: measure before release). The hills are gentle (steepest slope
      well under what would hide the ground behind it from this camera), so nothing needs sorting.
    - The ground layer and the wrecks layer ('t', 'd') warp; the soft patches (lookGround) are drawn per chunk with the ground
      (`hillPatch`); the shroud is drawn in chunks too (only where some cell round it is dark, ui.js `shroudClear`).
    - Lifted by the ground under them: units (aircraft too, above the ground under them), structures (at their footprint's
      middle), houses, props, villagers, hens, walls, cliffs and their shadows, ore (per cell), trees and their shadows (in
      drawTree / treeShadows, so the far view's tree blocks too), husks and bodies, effects (a tracer's far end by its own
      spot), shots, the flame tower's jet, smoke and embers (look.js lookSmoke), tank tracks, structure glows and lamps,
      the AA searchlight's target, the night lights (art.js drawNight), the rally line, the placement grid and ghost, wall
      lines, power circles, selection brackets, health bars, ranks and the labels over structures.
    - Taps: `s2w` gives the point of the raised ground under the finger (a few steps down the screen by the lift);
      `pick` and the double-tap select compare on the screen with the lifted spots.
    - Not lifted (on low ground anyway): water and its foam (heights are 0 near water), bridges and broken spans, pigeons.
    - Left for later: structures stand at their middle's height, their pads follow the slope (bases are on level ground, so
      only an expansion on a hillside shows it); the minimap and debrief are flat; the camera's edge limits ignore the lift.
  - **Taller hills, made 2026-11-19 (owner: "lets tackle this"; video sent, verdict pending):** the hills are drawn
    `HILL_DRAW` (2.5) times as tall as `G.hgt` (up to about 62 view px). **No rule changes:** reach and sight compare heights as
    a share of `HG_MAX`, and slope speed uses `G.hgt` itself, so only the picture is taller (no mode question needed: both
    modes play exactly as before). `HILL_EDGE` 160 px, smoothstep, at the map's edge.
    - Hills now hide what is behind them. The ground is drawn as a list of chunks (art.js makeGround `chunks` / `drawChunk`,
      `HILL_CH` 32 px on a world grid) sorted back to front by their back corner's depth, each with its patches and its wrecks
      layer; ore is merged into that order (key: its cell's middle + 40 px, so flat ground in front never clips it).
      `hillFit` (look.js, worked out once a battle per chunk) holds the chunk's plane and `occ`: whether some point of it
      stands higher on the screen than ground up to `hillMax()` behind it in its column (it hides ground).
    - Units, trees, structures, cliffs: ui.js draws an `occ` chunk again (`reHill`, with its ore) just before the first thing
      in the sorted list standing less than 6 px behind its back corner, if something already drawn shows where it does
      (`drawnBox`). Things drawn after the list (shots, effects, smoke, aircraft) are never hidden; tank tracks, tree shadows
      and cliff shadows behind a crest can show through it (not yet sorted). The far view's tree blocks are off with hills
      (trees one by one, so hills can hide them: measure the cost on a big screen zoomed out).
    - Taps: `s2w` walks its screen column from as far in front as the highest hill could show, back to the first ground
      that stands at or above the tap (then a few halvings): the nearest ground under the finger, not ground hidden behind.
    - Hill shading stronger (owner, 2026-11-19: "too faint"; picked A from a still of Now / A 2.2 / B 3.5): `HILL_SHADE` 2.2
      (look.js; copied into the ground workers and part of `groundKey`; `?hillshade=1` shows the first version): the slope
      term x2.2, its limits widened, lit slopes a little warmer and shaded ones a little cooler. Grounds rebaked. On rain or
      night maps the shaded side is fairly dim: ease it back if the owner finds it too dark.
  - **Phone speed, 2026-11-19 (owner: "incredibly laggy on a phone"):** measured in headless Chromium at an iPhone's
    landscape size (844 x 390, 3x pixels), CPU slowed 4x, River Crossing at 5 minutes, our base: the look test ran at a
    median **433 ms a frame** (the look off: 50-67 ms). Fixed:
    - drawLook (grade, sun, haze, shade, glows, vignette: several blend passes over the whole picture) now runs on the view
      canvas at zoom 1, before it is scaled up (ui.js, after the bars), not on the screen canvas at 3x pixels: about 25 times
      fewer pixels for soft light that looks the same. Its W/H now come from vw/vh x k, not the canvas.
    - The soft ground patches are painted into each ground tile once (`lookPatchTile`, from makeGround finishSome, with the
      dressing) instead of a soft-light pass over the view every frame (with the raised ground: one per chunk).
    - Raised ground: flat tiles drawn in one piece again (`hillTileFlat`, `HILL_FLAT_FIT`), chunks off the screen skipped.
    - Water (`drawWater`) only round the open water that shows (it worked over the whole box round the turned screen: about
      50 ms of the slowed frame on River Crossing).
    - Now **150 ms** median (hills off: 100 ms; look off: 67 ms). Left: the raised ground's chunks (about a third), lookfx and
      the pools; to measure on a real phone (the owner's) before more work. Profiler: `tools/look/prof.js`.
  - **Stage 3 (next):** the AI using high ground; a game server for the look branch (online testing); balance with the owner;
    the cost of the warped ground on a phone.
  - Checked: teams.js 1v1 river 4 min, no errors.
- **Proposal of 2026-11-19 (page https://claude.ai/artifact/BCzR1QoVMcAXYE8N3mcFkP, slug `52a7f35d-f1d8-4fb0-adf4-dbd0b9aa2f04`;
  our screenshots only). Owner picked 1, 2 and 3; made 2026-11-19, video sent, verdict pending (see below). The list:** 1 light pools on the ground (lamp posts, window spill, ore glow),
  2 ground dressing (rocks, gravel, puddles, worn paths, painted in once), 3 per-map mood (sun colour, shadow tint, haze; merge
  with day/night), 4 living structures (moving parts, build-up), 5 bigger blasts (fireball, shockwave, debris, lasting craters),
  6 steel sidebar skin, 7 storms (looks only; ask the mode if they should affect play), 8 grittier structure colours (owner, 2026-11-19: a full structure redesign). 7 and 8 made 2026-11-19, verdict pending (see below).
  Recommended: 1-3 first. All drawing only (except 7 if made to affect play). Owner then picked 4, 5 and 6: made 2026-11-19, video sent, verdict pending (see below).
- **Made 2026-11-19 (proposal items 1-3, owner's picks; video sent, verdict pending).** All drawing only, both modes; each its own
  switch (`?lookoff=pools`, `dress`, `mood`). Recorder: `tools/look/record-pools.js <repo> <out> <map> <pools|dress|mood> [s] [night|rain]`.
  - **Light pools** (`LOOK.pools`, look.js "Light pools"): lamp posts of our own design (plinth, slim post with a lit edge, bent arm,
    hooded head lit from below; 28 view px tall, `postPic`) placed once a battle from the ground seed (`poolLampsFor`, not in G):
    along every road line every `POOL_GAP` 150 world px, 1.7 cells off it, sides alternating, and 7 in a ring `POOL_RING` 8.5 cells
    (+-1) round each start position; only on grass or dirt, 3 cells from water, ore, cliffs, trees, other lamps and the village's
    own street lamps. Colours: 70% warm yellow, 18% cool blue, 12% red (ring: 80% warm). Hidden while a structure or wall stands
    on its cell. Sorted in with the units as a picture (pushed as kind 'cliff' with `post`, so ui.js needed no change), with a
    shadow to the lower right. Pools (`poolLights`): radius `POOL_R` 46 view px squashed to the ground's slant (VIEW.F), holes in
    drawLook's shade and coloured light screened on at `POOL_DAY` 0.55, so units passing through are lit; a small glow at the head.
    Window spill: up to 4 warm spots (22 px) on the ground just in front of a structure's lit windows (`windowSpill`, not
    defences, not below 30% health). Ore glows faint gold, gems violet (every other cell on screen, 30 px, by amount).
    Day/night maps: drawNight's own darkness gets the pools as holes (`lookNightLights`, one line in art.js drawNight) and their
    colour after it (`lookNightPools`, ui.js, x night), so they grow with the night; by day they come from drawLook (x day).
  - **Ground dressing** (`LOOK.dress`, look.js "Ground dressing"): painted into each ground tile once (art.js makeGround's
    `finishSome` calls `lookDress` before the marks, so pads, scorches and wrecks cover it; nothing per frame). Placed once a
    battle from the ground seed (`dressFor`, not in G), per cell: grass 5% rock clusters, 5% gravel, 7% bushes, 1.5% puddles;
    dirt 8% gravel, 5% rocks, 4% puddles; road cells 12% cracks, 8% oil, 6% gravel, 4% puddles; plus worn paths (two ruts and
    trodden dirt) from each start position to its two nearest ore fields (within 40 cells, not their first 12% nor last 10%).
    Never on or next to water, ore, cliffs, or on trees, fords and bridges. No puddles on snow maps (rocks and bushes snow-capped).
    Each detail from its own seed, so one split between tiles matches.
  - **Per-map mood** (`LOOK.mood`, `MOOD` / `lookMood`): drawLook's saturation cut, multiply grade, sun and shadow tints (soft-light),
    a haze ('screen', thicker toward the top of the screen), the shade's tint, the vignette and the pools' day strength, per map
    id: bridge as before (BASE), river green-grey, lakes cool and misty, twinlakes dry late-summer warm, village golden, snow theme
    (snowbound, frost) cold and bright, a desert theme warm (no desert map yet). Rain pulls toward an overcast grey and falling
    snow toward a white haze, by weatherLevel x 0.8. The day/night maps (village, frost) now get drawLook too (with the mood), faded
    out as night falls (`night` argument), before drawNight; their lamps still come from drawLampsAlone.
- **Fog, made 2026-11-19 (owner: "on the grass maps at night and early morning can we add the possibility of fog rolling in if the
  weather settings are correct for it"; video sent, verdict pending):** `LOOK.fog` (`?lookoff=fog`), look.js `lookFogLevel` (when and how thick),
  drawn into the view before drawLook and drawNight (the night darkens it; the pools' colour shines through it). Only on day/night
  maps that are not snow (Village). On `FOG_CHANCE` 0.55 of nights (rolled per night from G.seed: a night and its morning share one
  roll), never in a battle with rain or snow (G.weather), thinner when the wind gusts (windNow, down to 0.35 of full), each foggy
  night 0.6-1 thick. Day phase (art.js dayNight's: 0 midnight): rolls in from 0.82 to 0.95, lifts from 0.26 to 0.38.
  - First try (a screen-wide veil and drifting noise) rejected by the owner: "It now looks like it's just a screen filter". Now it
    **lies on the ground** (look.js `fogField` / `fogFrame` / `lookFogGround` / `lookFogOver`): a density field fixed to the world
    (`FOG_Q` 8 world px a pixel), thick in low ground (gone above 45% of HG_MAX), thicker within 4 cells of water, cut into banks
    with clear gaps by a fixed noise; each frame thinned by a second noise drifting downwind (0.12 of the wind, 0.15-1). Drawn in
    the world transform: 4 sheets under the units (from cliffItems, after the ground; lifted 0/4/9/15 view px, 0.8/0.5/0.35/0.22)
    so banks have a soft top, and 2 lighter sheets over the units (from lookSmoke, under the smoke; 0/7 px, 0.45/0.25), so
    structures, trees and units stand out of it. Up to `FOG_MAX` 0.75, x (1 - 0.35 x night) (milky in the dark otherwise).
    Drawn flat (not warped with the raised ground): it lies only in low ground, where the lift is about 0.
  Looks only: sight and the fog of war are unchanged (making it cut sight would be a gameplay change: ask the mode).
  Recorder: `record-pools.js <repo> <out> village fog 6 fognight|fogdawn`.
- **Made 2026-11-19 (proposal items 4-6, owner's picks; video sent, verdict pending).** All drawing only, both modes, nothing in G
  (the look's own particles in `lookFxS`, src/lookfx.js); each its own switch (`?lookoff=alive`, `blasts`, `sidebar`; the three
  keys are added to LOOK by lookfx.js itself). Hooks, each marked "lookfx": ui.js drawOne (`lookAlive` after drawStructure),
  ui.js after lookSmoke (`lookFxOver`), ui.js drawRadar (`lookRadar(on)`), look.js cliffItems (`lookFxGround`: the update, then
  ground marks), look.js drawLook (`lookFxLights`). Recorder: `tools/look/record-fx.js <repo> <out> <map> <alive|blasts|sidebar> [s]`.
  - **Living structures** (`LOOK.alive`): stacks found from each type's voxel model (`aliveSpots`: the highest columns, at least
    70% of the top, 9 voxels apart; `ALIVE_STEAM` refinery 2, factory 2, power 2, apower 3). White steam from them (1.1 puffs a
    second a stack, 2.4 from a producing factory, x0.3 on low power; life 1.8-2.6 s, max `STEAM_MAX` 260; none below 60% health,
    where the look's dark smoke takes over). Power plants' glow breathes at their stacks (cool blue Allies, amber Soviets;
    stutters on low power). The Allied Radar Dome gets a small dish turning on its roof (the Soviet one already turns) with a
    green blink. While producing (own side and allies only, so nothing gives away the enemy's work): the War Factory's amber
    beacon sweeps twice a second, a Barracks / Helipad / Airfield's green door lamp blinks. Not below 30% health; defences none
    (owner's rule: no light from defences). **Build-up:** the game already builds each structure layer by layer from its model
    with scaffold and sparks over `BUILD_UP` (2.5 s, a rule shared with the server, so not changed to 1 s); the look adds a glowing
    plane in the team colour at the height reached, with lit corners, and a dust ring and dust puffs round the footprint when it is done.
  - **Bigger blasts** (`LOOK.blasts`): every new 'expl' effect the player can see (the game's own sizes 5-20 already follow the
    weapon and what was destroyed: shells 9, tanks 16, a structure's death a run of 10-18) gets: a core flash ('lighter', 0.14 s +),
    a fireball of 1-7 balls swelling, rising and cooling yellow > orange > soot (drawn normally, not added, so many at once stay
    fire-coloured), from size 10 a shockwave ring on the ground (pressure front and a dust ring, out to about 4-7 x size), debris
    chunks (0.55 per size, a share glowing hot) that fly, fall at 330 px/s2 and bounce (x0.35), dark smoke handed to lookSmoke's
    puffs, and a scorch mark (soot rays) that fades over `SCORCH_LIFE` 70 s (x0.7-1 by size; max `SCORCH_MAX` 120). Its light goes
    through drawLook's shared 'lighten' buffer, so overlapping blasts never pile up into white. Caps: `FX_MAX` 700 balls and cores,
    `DEBRIS_MAX` 260, `BLASTS_PER_FRAME` 10.
  - **Steel sidebar** (`LOOK.sidebar`): CSS injected by lookfx.js (`STEEL_CSS`, body class `lk-steel`): dark brushed plate with rows
    of rivets down both edges and along the top strip, a team-colour trim (`--accent`: blue Allies, red Soviets) on the sidebar's
    inner edge, under the top strip, round the radar, the power bar and along each build icon's foot; build icons framed (bevel,
    two rivets, a sheen); steel buttons with corner rivets; a hatched well behind the strips; the credits amber and the clock green
    on the glow of a display. The radar: a frame, scan lines, a slow scan bar, and a burst of green static (about 1.1 s, a rolling band)
    when it comes online. Same buttons, layout and hit areas (only colours, borders, shadows and pseudo-elements change).
- **Made 2026-11-19 (proposal items 7 and 8; videos sent, verdict pending).** Drawing only, both modes, nothing in G; each its
  own switch (`?lookoff=storms`, `?lookoff=structs`; keys added to LOOK by their own files). Recorder:
  `tools/look/record-look2.js <repo> <out> <map> <structs|storms> [s]` (one page; structures swapped per frame by `lookStructs.set`).
  - **Storms** (world.js `stormLevel` / `stormStrikes`, src/lookstorm.js `lookStorm`). **Their bolts are a rules change, both
    modes (owner, 2026-11-19: "yes to both but make the lightning more rare"); the rest is looks only.** Now and then a storm rolls
    in, planned from G.seed on the battle clock G.t (so the host, the server and every phone agree): the first after `STORM_FIRST`
    70-160 s, then every `STORM_GAP` 160-320 s, lasting `STORM_LEN` 70-110 s, building over `STORM_IN` 16 s, clearing over
    `STORM_OUT` 20 s. At its height (level above 0.6) each second has a `STORM_BOLT_P` 1/75 chance of a bolt (seeded per second):
    world.js `boltStrike`, as the rain's lightning (a visible bolt, a scorch, trees alight, a building or span burns for BOLT_BURN
    10 s losing BOLT_DMG 10%). The host decides (`G.remote` skips), guests get the bolt and its fires as usual; `G.stormT` (a number,
    saved). None on snow maps. Measured headless: 20 min on River Crossing, about 225 s of storm height, 3 bolts (about 1-2 a storm).
    - Looks (lookstorm.js, `?lookoff=storms` hides only these): under the rain a slate multiply (`STORM_DARK` 0.55 at the height,
      heavier toward the top of the screen) and a murk; the rain is drawWeather given a stand-in weather `{ kind, lvl, storm, real }`
      (art.js weatherLevel returns `w.lvl`) at 0.12 + 0.88 x the level, or the battle's own rain if heavier (its own lightning still
      runs from G.weather only). Sheet lightning, this phone's own (local clock, looks only): every `STORM_SKY_GAP` 4-10 s the
      scene flashes ('screen', up to `STORM_FLASH` 0.5 x 0.55-0.9, flicker 0.7 s) with distant thunder. Every bolt that lands on
      the screen (a new 'bolt' effect) gives a full flash and close thunder panned to it. No full-screen flash with reduced motion
      (`calmFlash`). On snow maps a blizzard (heavy snow, pale haze, no lightning).
    - History: first made looks only with a drawn bolt every 3.5-9 s ending in mid-air; owner: "cut back on the lightning bolts, sky
      can flash but I want the bolts to be rarer and actually strike the ground as before"; then asked whether storm bolts should
      hurt and burn as the rain's do: "yes to both" (both modes), rarer.
    - Hooks: ui.js where drawWeather is called (`lookStorm.weather`, `.dark`, `.flash`), art.js weatherLevel (`w.lvl`) and
      drawWeather (the stand-in skips its lightning), world.js update (`stormStrikes`), boltStrike(at) takes a cell (recorders).
      A game server for the look branch (online tests) must carry this world.js.
  - **Structures redesigned** (`src/lookstructs.js`; owner: "Let's get away from our toy structures look"). Studied from
    Tiberian Sun and Red Alert 2 screenshots (nothing copied); the principles: squat, wide and layered (stepped plinth, battered
    lower walls, set-back storeys, buttresses); real materials (weathered concrete with pour lines and joints, riveted plate,
    ribbed sheet, tar roofs; grime at the foot, rain streaks under top edges, rust); small detail at the right scale (pipes with
    flanges, vents, fans, ladders, railings, masts with beacons, floodlights, hazard stripes); the team colour as bands, stripes
    and plates, not whole roofs; a darker, muted palette with strong form shading; each role readable at a glance.
    - Stage 1 (done): new models for the Construction Yard, Barracks and War Factory of both sides, and the Allied Power Plant and
      Ore Refinery (`TS_MODELS`, kit `tsConc`, `tsBatter`, `tsPlinth`, `tsPlate`, `tsRibbed`, `tsBand` (3 voxels, the team colour),
      `tsRoofStripes`, `tsHazard`, `tsPipeX/Y/Z`, `tsRail`, `tsLadder`, `tsVent`, `tsFan`, `tsMast`, `tsFlood`, `tsWinX/Y`,
      `tsSandbags`, `tsHipRoof`; palette `TSC`). Every model ends with `tsWeather` (saturation x0.88, darker x0.97, near-white
      walls x0.86, speckle, mud on the lowest 4 voxels of side faces, rain streaks within 12 below a top edge, rust specks on
      steel). **Every other structure** (Soviet Power Plant and Refinery, Radar Domes, Advanced Power, Service Depot, Helipad,
      Airfield, Tech Centre, Outpost, the defences) gets `tsWeather` strong only (saturation x0.8, old white walls x0.74).
    - Left for the next stages: new models for the Soviet Power Plant and Refinery, then the Radar Domes, Advanced Power Plants,
      Depot, Helipad, Airfield, Tech Centre, Outpost; the defences last (their heads, models.js HEADS, are separate). Watch the
      team colour: with the darker grade the bands are smaller than the old roofs (make them wider if sides are hard to tell).
    - Kept, so other code still fits: ids, footprints, model boxes and hit areas; the yard's crane mast and jib pivot (SPINNERS.cy,
      CRANE_HOOK; roofs under the hook stay below 28); the War Factory's door opening (x 20-52, y 44-46, z 1-16: factoryDoor);
      the power plants' and refineries' stack tops (plantStacks: world.js smoke); flag poles (FLAG_SPOTS); the Soviet banner rods
      (BANNERS); the refinery's truck bay (x 24-44, open to the south).
    - **For the other look sessions:** window glass is still M_GLASS (structLamps, windowSpill find it: the factories now have
      glazed saw-tooth steps and slit windows, the yard a slanted control-room band), new masts carry an M_GLOW red beacon at
      their tops, and the stacks are still the highest points (aliveSpots steam). `STRUCTURES[type]` now goes through
      lookstructs.js (it checks LOOK.structs on each call); models.js is unchanged. If you add moving parts, read the anchors above.
    - Baked sprites: the sheets in sprites/ are of the earlier models, so while LOOK.structs is on from the start, baked
      pictures of structures are refused (lookstructs.js wraps spriteCache2.set and spriteAny.set) and these models are rendered
      while playing (as on a page opened from a file). Nothing rebaked: models.js is untouched, so `bake-sprites --check` is
      unaffected. If the look becomes the game: move the models into models.js and rebake.
- **Craters that dig the ground, made 2026-11-19 (owner: "ground marks depending on the explosion can make craters like in
  Tiberian Sun and actually affect the ground where units can go in them"; owner's picks: **both modes**, units dip and are
  slowed, heavy blasts only; video sent, verdict pending).** A rules change (world.js, terrain height section), on this branch only.
  - `G.dig` (Float32Array per cell, saved with G) is added to G.hgt's heights in `hgtAt`, so every height rule follows it: units
    drive down into a crater, climb out slower (slopeMul: 65% at the steepest), reach a little less and see a little less from the
    bottom (distTo, revealAround). Nothing is blocked. G.hgt itself is untouched (the painted hill shading and ground keys stay).
  - `craterAt` digs from rad `DIG_MIN` 5 (artillery 5, V2 9, bombs 8, aircraft crashing 9, tanks destroyed 5, the hit at
    world.js "craterAt(x, y, 6)"; not rifles, tank shells or flak) and a destroyed structure now leaves one (rad 6 + up to 4 by
    size; not 1-cell defences). `digCrater`: a bowl of radius 1 + rad / 6 cells, rad x `DIG_K` 0.55 deep (rad 9: about 4.5 of HG_MAX
    30 at the middle, 11 view px), a low rim (+12%), a cell no deeper than `DIG_MAX` 9; not in water, cliffs or under structures.
    A structure placed on dug ground fills it (`fillCraters`, from addBuilding). `G.craters` ([x, y, rad], the newest 400) for drawing.
  - Online: craterAt passes a 6th argument (1) to the `crater` mark, which the host relays as a decal event; net.js digs the
    guest's copy when it plays it. A server for the look branch is still needed before online tests (the look test page is
    single player).
  - **Look redone 2026-11-19** (owner: "Redo craters look at Tiberian Sun craters. In that video ours are all glitched out and it
    looked like a unit was driving through a hill"). Cause: the dip was drawn 2.5x deep through the raised ground's 32 px planar
    chunks, so crater rims became chunks that hide what is behind them (occ) and were drawn over units in the bowl; and the
    bowls were big round opaque discs. Now: craters are TS-sized (radius 0.6 + rad / 10 cells, rad x `DIG_K` 0.5 deep, cells
    no deeper than `DIG_MAX` 7; rules otherwise as above). The drawn ground leaves them out (look.js `gLift(x, y, noDig)`,
    used by hillFit; world.js `hgtAt(x, y, noDig)`), and what stands in a crater sinks `DIG_SHOW` 0.9 view px per unit of depth
    (up to about 6 px) into the painted pit. `lookCraters` (lookfx.js, `?lookoff=craters`): one of `CRATER_VAR` 6 pictures per
    crater (from its position), never turned: a ragged scorched hollow (outline from three sine waves), a faint soot halo, a
    ring of thrown earth and clods, the pit darkest at its heart, its wall on the sun's side (the screen's upper left, turned
    into world axes) in shade and the far wall lit, a soft lit lip; soft edges so overlapping craters run together; drawn at
    the ground's height, 3 x the bowl's radius. `lookDug` is now a no-op.
  - **Look redone again 2026-11-19** from the owner's Tiberian Sun snow screenshot (style reference only; original art): not a
    pit with a lip but a splat in a darker shade of the ground (cool blue-grey on snow, dark earth elsewhere). `craterPic(v, snow,
    big)`: 70 tapered, slightly bent streaks of all lengths thrown out from the middle (overlapping, so darkest there), clumps
    and loose splotches past the ends, a soft dark middle, fine dark and pale streaks; the big ones (rad >= 8: bombs, V2s,
    crashes, structures) also a ragged hollow and two broken rings round a deeper middle; pale flecks round the edge.
    `CRATER_VAR` 4 per kind, turned by the crater's position, 2.6 x the bowl's radius. The blasts' own scorch mark (lookfx)
    is left out where a crater was dug (its black soot hid the colour).
  - **Redrawn a third time 2026-11-19** (owner: "idk these still dont look good"): the splats read as soft stains, the reference's
    as holes. Now each picture is worked out pixel by pixel from a small height field and lit like the hills (`craterPic`): a
    round-ish hollow with 48 short spikes in its edge, uneven grooves running out, steps round a deeper middle in the big ones
    (rad >= 8), a low rim of thrown earth; each pixel's tone from its slope toward the sun (upper left of the screen, in world
    axes) and its depth (darker deeper), between the ground's own dark, middle and lit tones (snow: slate blue to white; else
    dark soil to dry earth), with grain; the rim pale, its edge a hard dither. 60 px (84 big) pictures drawn 1:1 in world
    pixels, scaled 0.8-1.25 by rad, without smoothing; not turned (lit from the sun's side).
- **Service Depot pad hidden on raised ground (owner, 2026-11-19: "the service depot repair cross on the ground wasn't level cause
  of the hill. Maybe remove it?"):** art.js padDecal draws nothing while `LOOK.hills` is on (the mark is still recorded, so saves
  and online play are unchanged; `?lookoff=hills` shows it again).
- **Lighting and weather per map, decided 2026-11-19 (owner picked "A": leave it as it is).** Offered: per-map defaults plus
  weather for A Bridge Too Far and Twin Lakes (none now), and a skirmish "Conditions" choice (time, weather). Kept as is: weather
  per map (rain 50% on Three Crossings, Lakeside, Village; snow 50% Snowbound, 60% Frostlight; none on A Bridge Too Far, Twin Lakes),
  day and night only on Crossroads Village and Frostlight Valley, mood per map, storms on rain maps, fog on Village.
- **Real-time lighting demo (WebGL), 2026-11-19 (owner: "show me a video example of how real time lighting would work ... if
  we went with webgl"; a demo only, nothing in the game changed):** `tools/look/webgl-light.html` (loads the game's data, voxel,
  models and art scripts) and `tools/look/record-webgl.js` (frames; needs Chromium's SwiftShader WebGL flags, in the script).
  Top half: the game's way now (renderVox sprites lit once by the fixed sun, a multiply darkness and 'lighter' glows). Bottom:
  a G-buffer per pixel from the same voxel models (`gbuf`: renderVox's projection, keeping each pixel's colour, material,
  turned normal, 3D position and occlusion), lit every frame by a WebGL2 shader: ambient and the sun by the day level, the
  sprites' cast shadows as a sun mask on the ground, up to 6 point lights (a flickering fire, a flare circling the factory,
  three blasts) with distance fall-off and facing, metal highlights, glowing parts. Not shown: shadows cast by the point lights.
  For the game this would mean: sprites baked as colour + normal + height pictures (about 3x the sprite memory), the view
  drawn through WebGL instead of 2D canvas (a large rewrite of art.js/ui.js drawing), and its cost measured on a phone.
- **TS test link for testers, 2026-11-19 (owner: "Update the test build for this new TS so I can start testing it", picked "Separate
  TS link"):** https://trdaniels90.github.io/mobile-rts/ts/ , the folder `ts/` on `main` (and `claude/cross-platform-game-k2d9lb`),
  built by `tools/look/build-ts.sh` from this branch: VERSION + '-ts' (the server and room codes check the version, so TS phones
  only play other TS phones, phone to phone; no team games), its own saved game (IndexedDB 'red-horizon-ts'), its own baked ground
  (`ts/grounds`), sprites, music and map pictures from the main site (`../`; the script stops if they differ from main), `<meta
  charset>` added (the single file has none). It registers no service worker of its own and its update check finds no
  `ts/src/version.js` (so no restart offer: testers reload). Match reports still go to Supabase, with the `-ts` version (filter
  them out of the leaderboard and stats if needed). The main game, the Windows app (its workflow only runs on src/version.js or
  desktop/) and the server are unchanged.
- **Next ideas offered to the owner (not started):**
  real terrain height (gameplay, a big project on its own branch; ask single player / online / both), a Tiberian Sun-style sidebar.
- **Before switching it on for players:** owner's OK; test the cost on a phone (the grade is 4 full-screen passes plus two half-size
  layers; cliffs add one picture per rock cell); an Options switch was offered; decide per map grade (snow maps colder, rain maps
  cloudier); day/night maps (village, frost) use drawNight instead, so merge the two; cliffs on the minimap and in the debrief are flat.

## Iso view (branch `claude/iso-view`, test only: not for players until the bugs are fixed, owner's call)

- Tiberian Sun style camera: the world is turned 45 degrees (cells show as diamonds) and seen from about 33 degrees.
  All in `VIEW` (voxel.js): `rot`, `elev`, `F` (ground squash), `VK` (height), `toView` / `fromView` (world to view plane and
  back), `liftPt` (the world point that shows h px straight up), `viewDepth` (draw order). A "no turn" option later = `rot` 0
  plus a sprite and ground bake for it.
- `renderVox` renders from that camera; `opts.flat` / `FLAT_PASS` render from straight above for things painted into the
  ground (rocks, wrecks), which the ground's transform then turns and squashes.
- ui.js `draw`: the battle is drawn through a world-to-view transform; `uprightCtx` (art.js) stands sprites (pictures with
  `_ox`/`_oy`) upright at their projected spot, and while `g.upright` (units onward) every picture, pixel and label too.
  Bars, brackets and labels are drawn on the view plane (`bldBox`, `unitSpot`). `cam.x/y` are on the view plane; taps,
  pinch, wheel, box select, double tap, radar outline, sounds and shakes convert. Saves keep `cam.view`; older saves are
  converted. Sprites and ground rebaked.
- **Fixed:** rising smoke and flames keep their climb as `fx.lift` (world.js `updateEffects`; spawn heights from chimneys,
  stacks and damage holes too) and ui.js draws them that high straight up the screen. Trees: `treesInView` (shadows, the
  list) and `drawTree` (art.js), sorted in with the units; the sway is a shear on the screen about the foot, leaning with
  the wind's left-right part as the camera sees it.
- **Fixed (effects):** explosion debris, loose wreckage (`frag`), blown-off turrets, ragdolls, crashing aircraft (and rotor),
  ejection seats, parachutes (canopy drawn in screen pixels), husk turrets, flames (stand on their spot) are drawn at their
  height with `liftPt`; sparks, promotion rings and flares carry `lift` (flares sink, their trail points keep `l`).
- **Fixed (shots):** `muzzle` returns `h` (the height it folds into y) and `aimH(t)` mirrors `aimY`; shells, rockets and
  missiles carry `x0, y0, h0` and `projH(p)` gives their height now (ui.js draws them at it); tracers and Tesla bolts carry
  `h0`/`h2`; sparks, flak bursts, hit explosions (`impact(.., h)`, marks now on the ground under the target), muzzle and
  barrel smoke and missile trails carry `lift`; muzzle flashes and bombs are lifted in art.js / ui.js. The game's own
  positions, ranges and hits are unchanged. The server must run the same version (shots carry three more numbers).
- **Fixed (walls, order, ground, edges, flames):** walls and gates are solid prisms (`drawWallIso` in art.js: a post and an
  arm per joined side; sandbags two courses, concrete with the owner's colour on top, wire posts and coils, gate pylons
  with lamps and a barrier that sinks with `open`), sorted with the units (kind 'wall'); `wallPic` is now only for the
  sidebar. Draw order: a structure sorts by its footprint's front corner, and anything within 1.5 cells that is nearer the
  camera than the closest footprint point is moved just after it. Ground: `G.ground.keep(fn)` limits tiles to those that
  show on the turned screen (`tilesIn(.., pad)`). Past the map's edge (owner's pick, option B of two shown as video):
  woods `RIM` (7) cells deep (`rimTrees`, `rimInView` in ui.js: the map's own tree pictures through `drawTree`, snowy pines on
  winter maps, none where the edge is water, 1.5 cells back on the two sides nearest the camera); the floor (`edgePic`) is the
  edge colour darkening to woodland, fading into a haze (`hazeRGB`, also the screen's background) from `FADE0` to `FADE1`
  cells out; `edgeSeam` softens the edge on the ground, `edgeVeil` and `edgeMist` (drifting wisps) go over the outer woods
  after the units. These trees never burn (owner: keep it so). `clampCam` keeps the screen's middle up to `EDGE_KEEP` (8)
  cells inside the map. Flame jets and the rally flag are drawn in screen pixels
  (`onScreen`, `screenDraw` in ui.js); the rally line stays on the ground.
- **Village (after the 2026.11.16.3 merge):** `standAt(g, x, y, h, fn)` (art.js) stands old-style pixel drawing up the
  screen at a world spot: villagers, hens, pigeons (in the air at their height), washing lines, a held house's flag and
  pips, structure flags. Banners are drawn as strips along their (turned) wall; the fountain's water and the lamps' glow
  and night lights are at their heights (`add(.., h)` in `drawNight`). Far-view tree blocks: see "Still trees in far views" below.
- **Draw cost on big screens (after 2026.11.17.4, looks only; match a90f56b1, 2560 x 1370 desktop, draw 5 to 13 ms a frame over
  33 min with bursts of 90-110 ms in big fights):** `uprightCtx` did a full `save()` / `restore()` for every upright picture, pixel and
  label (24,000 a frame in a zoomed-out fight); now it only swaps the transform and puts it back, and `drawTree` puts back only what it
  changes. ui.js `draw` also culls trees, rim trees, ore, units, effects and wisps by where they show on the screen (`onScr`), not
  only by the world box round the turned screen (about twice the screen's area), and draws the edge haze, rim and mist only when the
  screen itself shows past the map's edge (`past`). Village, widest zoom, mid-fight: trees drawn 7,700 to 3,400, effects 1,100 to 440.
  Same picture (checked culled against unculled, pixel for pixel on a still scene).
- **Still trees in far views** (after 2026.11.17.7, both modes, looks only; owner: zoomed out on the 2560 x 1370 desktop the game lags all the
  time): past `TREE_FAR_N` (700) trees on screen (back below `TREE_NEAR_N` 550), `isoTreeBlocks` (art.js, from ui.js `draw` after the tree lists)
  draws still trees from cached `TREE_BLOCK` (512 px) blocks of the view plane (the same at every zoom), each the shadows then the trees (living or
  burnt, upright, no sway) whose foot is in it, back to front, made with the game's own `treeShadows` / `drawTree` (`treeFrame` set to still), rim
  woods included. Blocks are drawn before the units, so in a far view a unit behind a tree shows in front of it, and a burning tree (still drawn one by
  one, out of its block) shows its flames over the trees in front of it. A block is redrawn when one of its trees catches fire or burns out; at most
  `TREE_BLOCK_BUILD` (3) are made a frame (the rest's trees drawn one by one meanwhile); unused for 5 s, dropped. `treesInView` / `rimInView` take
  `noShadow`; shadows are drawn by `isoTreeBlocks`. Village at 2560 x 1370, widest zoom: trees drawn one by one 3,266 to 0 (burning ones only), trees'
  share of drawing 64 to 12 ms here (software drawing); with the wind stilled the picture differs only round burning trees.
- **Wrecks, bodies, blown-off turrets in the ground** (after 2026.11.17.19, looks only): `standOnGround` (art.js) draws a mark as it
  looked standing on the view (upright sprites and pixels, `uprightCtx`) into a scratch picture through the view's turn and squash, then into
  the ground through the inverse (nearest pixel), so on screen it matches the live unit. Used by `bakeWreck` (the burnt iso sprites, as
  `drawHusk`; no longer `FLAT_PASS`), `bakeTurret` and `bakeRagdoll` (pools and scorch stay flat on the ground). Before, wrecks showed as flat
  dark slabs and bodies as smears. Old saves' marks redraw the new way. `ground-tiles.js`: tiles still match pixel for pixel.
- **Known bugs:** not tried on a real phone or online; washing lines lie across the screen, not along their house; the
  debrief and Field Manual pictures are unchanged.

## Spy Planes: Soviet Beriev A-50, Allied SR-71 (after 2026.11.18, looks only, both modes)

- Owner's request: the Soviet Spy Plane (power `spy`) is drawn as the A-50 AWACS: `il76Model(pal, true)` (models.js): the Il-76 airframe with a
  solid nose and refuelling probe, the tail glazing faired over, no paratroop doors, and a rotodome on two raked struts over the rear fuselage
  (pale, dark rim and panels, a band of side colour). Sprite key `'Y'` in `hullSprite`; the sidebar cameo
  use it too; the night lights have their own spots (`PLANE_LIGHTS.a50`: the Il-76's wingtips and tail, the beacon moved forward of the dome onto the spine, x 5). Speed, health and size (`r`) unchanged. Not baked (scripted); sprites and ground rebaked for the hash only.
- The Allied Spy Plane is the SR-71 Blackbird: `sr71Model(pal)` (models.js, redrawn from the owner's photo: a needle nose with broad flat chines flaring into the delta wing, big nacelles reaching ahead of the wing with long inlet spikes, tall inward-canted fins with
  a side-colour tip, the tail cone past the wing, matt charcoal with red walkway lines on the inner wing), sprite key `'X'`, cameo, and night lights `PLANE_LIGHTS.sr71` (wingtips, tail cone, spine).

## Recent mechanics (2026.10.31 and .31.1)

- **Defending jets** (`defendBase`, `pickRaider`, `updateAir`): each defending jet takes a raider
  no other defender has, makes one pass (a missile at an aircraft, or the bomb run, sets
  `u.rearming`), flies home, rearms fully and goes out again. Raider ids are in `team.raiders`.
  A jet whose raider dies picks the next free one.
- **Jets fly out to line up** (after 2026.11.12.8, both modes; `u.extT` in `updateAir`): a jet's turning circle (about 210 px
  for a MiG) is wider than its missile range (130), so a raider beside the Airfield was inside it and defending jets
  circled it without firing (owner's report: jets not defending the base). A jet that is closer than 1.6 turning radii
  and not facing the target flies straight out until it has room (2 radii + range + 40 px, at most 3 s), then comes
  round. `jet-defense.js` seeds 11-14: raiders killed 9 to 15, MiGs lost 12 to 10, worst time on a target without
  firing 60 to 16 s.
- **Scrambles are not player orders** (after 2026.11.12.8, both modes): `scramble` launches jets with `commandAttack`,
  which since 2026.11.12.1 marks a player's unit `manual` (`takeOver`), so after the first enemy air raid a player's jets
  sat out base defence and later scrambles (co-op match 265e31c8 / 60025946: York's jets 2-3 kills in 11 minutes). Now
  cleared right after. Staged co-op on Snowbound (two idle player bases with 3 Strike Jets each, two Normal computers):
  jet time defending 54-84 to 163-325 jet-seconds, shots 15-17 to 30-50. **Any game-side caller of the command
  functions on a player's units must clear `manual` the same way.**
- **Anti-air missiles** (`fireWeapon`, `updateProjectiles`): missiles and rockets fired at aircraft
  have fuel of `AA_FUEL` (1.5) times the weapon's range, `SAM_FUEL` (3) for SAM Sites, and burn out
  if the target lands. Missiles at ground targets are unchanged.
- **Infantry lanes** (`assignLane`, `laneOffsetPath`): infantry on a hunt or attack order march
  in their own lane off the route, and a loose wave gets a speed spread (`paceMul`). Each wave rolls
  once; `TIGHT_CHANCE` (0.3) of waves stay tight so V2 blasts still kill big groups.
  Ground vehicles (not Ore Trucks or deployables) get lanes too since 2026.11.03: wider
  (`LANE_VEH_LOOSE` 100, `LANE_VEH_TIGHT` 50) and a pace spread that only slows them. Measure with
  `node tools/sim/infantry-spread.js <repo> <runs> mtank`.
- **Computer on Normal and Hard** (`pincer`, `counter` in `DIFFICULTY`): two-pronged attacks
  (`aiPincerStart` / `aiPincer`: a wave splits, gathers 13 cells off either flank of the target, then
  closes in together) and counter-building (`aiCounter`: `team.counter` = inf / armor / turtle).
  Normal now targets 'weak' and holds bombs for big pushes too.
- **PvP guest must never create entities.** The guest runs effects, and anything an effect spawns
  with `addUnit` takes a low id that clashes with the host's, then `applySnapshot` crashes. Guard
  such spawns with `G.remote` (as `ejectPilot` does).
- **Damaged structures** (`damageModel`, `damagedSprite`, `damageSpots` in models.js;
  `structureDamageFx` in world.js): below 60% and 30% health every structure is drawn from a
  damaged copy of its own voxel model (holes, char, embers, rubble; heads char too), built one at
  a time in the background. Fire, smoke and falling pieces come out of the holes. They run in the
  effects pass, so the PvP guest works them out from the health it is sent and nothing extra goes
  over the network (their timers are in net.js `SKIP`).
- **App icon** is AI-generated (ChatGPT) art; credited in `CREDITS.md`.

## Map "Three Crossings" (after 2026.11.02.1, not released yet)

- `MAPS.river` in maps.js: a fixed layout traced from the owner's design `maps/designs/river.png` by
  `tools/map-from-image.py` (run-length `rows` plus `spawns`). Any map with `rows` is laid out by
  `genLayoutMap` (world.js) instead of the procedural `genMap`: ore fields come from touching ore
  cells, bridges from runs of bridge cells. Same map every game.
- One bridge in the middle; the north and south crossings are shallow fords (`'f'`, `--ford` in the tool):
  terrain 5 like a bridge (walkable) with `G.ford` set, painted in `paintTerrain` as a rocky bed under
  shallow water (`fordStone` lays out lit, rounded stones; a few boulder stamps; ragged edges). No speed penalty. Ford ends with no river up or down stream become bank.
- Gem fields (`gems` in `MAPS.river`, `[x, y, radius]`): one beside each start position, then ten in pairs
  (one per bank) by the bridge, the fords, the flanks and mid-bank. Placed only on open ground.
- Made for 2 v 2 (`teams`: west bank starts 0-3 against east bank 4-7); 2 v 2 itself is not built.
  A 1 v 1 puts one player on each bank (`newWorld` picks from opposite halves of `G.spawns`).
  The layout is not mirrored, so the banks are not exactly equal.
- Its rock (`'#'`) is painted into the ground as brown rocky ridges (`G.cliff` mask, `paintCliffs` in art.js:
  a height field from the cliff cells, shaded by slope, cached per cell). They only block; the game has no
  height or high-ground bonus.

## Jets: gun runs instead of bombs (after 2026.11.13.2, not released, both modes)

- Strike Jet and MiG no longer carry bombs (`bombs`/`bomb` gone from data.js, `u.bombs` is now `u.guns`). They have
  `gun` (`runs` 3 a sortie, `rounds` 14 SA shells of 12, `splash` 9 px, walked `walk` 70 px along the flight line
  through the target): `startStrafe` / `tickStrafe` in world.js, fired when a ground target is within `gun.range`
  (110) and nearly dead ahead, after the missiles. Deadly to infantry, light on vehicles, little against tanks and
  buildings. `strafe` is a host timer (netcore `SKIP`). The Strike Jet model's bombs are gone (sprites rebaked).
  Air-to-air missiles (`weapon2`, no `ground: false` now) are fired at ground targets once the ground-attack ones
  are spent; a jet goes home only when both kinds and its gun runs are used. On the way home it fires them only at aircraft. Headless check: 10 riflemen, one MiG with an Airfield, 90 s: 8 killed.

## Computer air strikes spaced out (after 2026.11.13.2, not released, skirmish and co-op)

- The computer's aircraft went out again as soon as two were rearmed (every 30-60 s). Now `launchGroups` holds them
  until `firstWave` has passed, then `AIR_STRIKE_GAP` (180 s, owner's pick, every difficulty) between jet strikes and
  between helicopter strikes (`team.airNext[kind]`). Its new aircraft no longer take off on their own when built
  (`spawnUnit`): they wait for the next strike. Base defence and scrambles are unaffected.

## OpenRA pace (after 2026.11.13, not released, both modes)

- Owner asked for a slower game, modelled on OpenRA's Red Alert (`mods/ra` rules at normal speed: 25 ticks a second,
  1024 units a cell). **Build time** is cost x 0.024 s (`buildTime` in data.js; was 0.012), as OpenRA's
  `BuildDurationModifier` 60. **Every unit's speed** is OpenRA's Speed x 25 / 1024 x `CELL` (rifle 32, light tank 66,
  medium 42, heavy 38, Mammoth 25, Ore Truck 42, Ranger = Jeep 96, Longbow 87, Hind 66, Strike Jet = Yak 104, MiG 131,
  Spy Plane = U2 219, Transport and Bomber = Badger 105; since 2026.11.13, both modes, Spy Plane 274 and Bomber 131, 1.25x at the owner's request, Transport unchanged). Cash, ore and combat unchanged.
- **Computer timing x 1.5:** `firstWave` 720 (Easy, Normal) / 540 (Hard), `bigFrom`, `waveGap`, the planner `gap`s
  (cap 900 in `aiGap`), `AI_GAP_MIN` 70, `AIR_STRIKE_GAP` 270. `ai-timing.js` 2 Normal games: first waves 535 to
  785 s. `jet-defense.js` seeds 11-12: raiders killed 12 to 10, MiGs lost 5 to 5.

## Flame Tower jet burns (2026.11.14.1, both modes)

- The new Flame Tower (PR #6) draws a steady jet of fire (ui.js `flameJet`). Now the jet does damage too: `flameBurn` in world.js,
  called from `updateBuilding` for a weapon with `jet` (`ftur`: `jet: { dps: 10, width: 7 }`, FIRE warhead). While the tower is
  engaging (target in range, a shot within a reload), every `JET_TICK` (0.25 s) each hostile ground unit within `width` px (plus
  its radius) of the line from the tower along its aim, out to the target, takes `dps x JET_TICK`; the target always does. Shots
  are unchanged. `burnT` is a host timer (netcore `SKIP`). Measured (staged: 10 riflemen or 4 light tanks attacking one tower):
  the burn adds about a quarter to the tower's damage (riflemen: 98 from the burn, 368 from shots; light tanks 12 and 56).
  Fights vary too much from run to run for kill counts to show it.

## Units gather at their own base, rally points, primary buildings (after 2026.11.14.3, not released, both modes)

- Owner's report: a Barracks and War Factory built at an Outpost by an ally's base sent their units back to the main base
  (`scatterSpot` picked a random building of the side). Now `scatterSpot(team, near)` uses only buildings within `BASE_REACH`
  (14 cells) of the producer (or, in `releaseIdle`, of the unit). Computer too.
- **Rally points** (`setRally(b, x, y)`, `b.rally`, `rallySpot`): Barracks and War Factories (`canRally`; not aircraft). New ground
  units go there (still `staged`, so Auto Attack launches them). UI: RALLY (next map tap, `beginRally`), NO RALLY, a dashed
  line and flag from the exit while selected (`drawRally`).
- **Primary building** (`setPrimary(b)`, `b.primary`): `spawnUnit` uses the primary producer of the type, else the newest as
  before. Double-tap the building or PRIMARY on the bar (shown with 2+ of the type); a PRIMARY tag is drawn on it.
- Both are orders in netcore `COMMANDS` (the server must run the same version) and plain fields on the building (saved, synced).
  `node tools/sim/rally.js <repo>`.

## More Airfields and Helicopter Bases build faster (2026.11.14.2, both modes)

- `producerBoost` (world.js) now covers every producer in `BOOSTED` (barracks, factory, helipad, airfield; since after 2026.11.17.9, owner's pick for both modes, Construction Yards for the structure queue, `cat`): `PRODUCER_BOOST`
  1x, 1.5x, 2x, 2.5x with 1 to 4+ of that building. Applies to the computer too. The Field Manual says so for all four.

## Units spread out in a fight (after 2026.11.13, not released, both modes)

- Owner's report: units always balled up when auto attacking or defending. Three causes, three fixes (world.js):
  **Approach spot** (`approachSpot`, `fanR`, `fanAngle`): `engage` used to path every attacker to the target's centre. Now each
  heads for a spot at 0.85 of its range on its own side, turned by `u.fan` (dealt by id) over an arc sized for its group
  (attackers in `atkOn`, or friends within 5 cells; `FAN_GAP_INF` 16 / `FAN_GAP_VEH` 31 px each, at most `FAN_MAX` +-1.95 rad); the bearing is fixed per target (`u.apT` id, `u.apA`).
  **Sliding** (`slideOut`, `SLIDE_MAX` 4 s): a unit that comes into reach beside a friend (within 20 px) steps along to its
  spot; infantry hold fire meanwhile, vehicles fire on the move. **Spacing** (`separate`): ground units keep 1.4 times their radii
  apart from allies, 1 from foes (was 0.85), push up to 3 px a step. **Fire spread** (`atkOn`, `pledge`, `overkill`, rebuilt in
  `buildGrid` each step, not saved): `acquire` and `defendBase` put a unit already as good as dead (next shots of its attackers
  >= 1.2 x its health) `OVERKILL` (3 cells) further back. The new unit fields are in netcore.js `SKIP`.
- `node tools/sim/bunching.js <repo> 10 90` (headless staged fight: Soviet hunters into an Allied base defence; friends within a
  V2 blast of each engaging unit): attackers 7.35 to 3.26 average, 6+ in one blast 67% to 10%, worst 19 to 13 (owner's in-between pick of three tunings shown as
  video: narrow +-1.5 rad / 13-26 px / 1.25 / 3 s gave 3.87, 19%; wide +-2.4 / 20-36 / 1.5 / 5 s gave 2.7, 4%);
  defenders were already about 2.4. Defenders kill more (7-8 of 24 attackers, was 6): the attackers still win every run.

## Soldiers drawn at 65%, front rank fires first (after 2026.11.18, both modes)

- **65% soldiers** (owner's pick after comparing Red Alert's real sprites, looks only): `INF_SCALE` (data.js) 0.65. `infSprite` renders the voxel models
  at that scale (`renderVox` option `fit`: offsets in the scaled picture's pixels); muzzles, `aimY` / `aimH`, recoil, flashes, ragdolls (`RAG_PTS` scaled,
  thinner limbs, smaller head), dropped weapons, blood pools, corpses, paratrooper shadows, selection brackets, health bars and rank chevrons follow.
  Sidebar pictures and villagers unchanged. Positions, ranges and spacing unchanged. Sprites rebaked.
- **Front rank** (owner's pick, both modes; the server must match): a soldier coming into reach in a crowd used to step out to his spot round the
  target (`slideOut`) for up to `SLIDE_MAX` (4 s) without firing. Now `frontRank(u, t)` (world.js) lets one with no friend in front of him (within
  `FRONT_NEAR` 30 px, nearer the target by `FRONT_GAP` 4 px, within `FRONT_CONE` 1.1 rad of his line to it) fire at once; only those behind step out first.
  Decided once per target (when `slideT` is 0). Staged 12 v 10 riflemen in sight, 12 seeds: wait from in reach to first shot 1.6 to 0.8 s, soldiers waiting
  over 0.8 s 4.4 to 2.9. `bunching.js` 4 x 90 s: attackers 3.44 to 3.64 friends in a V2 blast, 6+ 12% to 15% (a narrower cone, 22 px / 0.6 rad, gave 4.18 / 23%).
- Under consideration, not built: soldiers packed 3 a cell (formation gap 14, friendly soldier spacing 1.2 radii; MP4 shown to the owner).
- **Group moves stay as they are** (owner, after an MP4 of ours beside a Red Alert-style mock-up: soldiers setting off one by one in a file and packing
  five to a cell round the tapped cell). `formationSpots` (16 px square grid) and the spacing are unchanged.

## Saved online co-op battles (2 v AI, 3 v AI; not released, online co-op only; the server must match)

- Owner's picks: kept online, autosave plus "Save and leave", the leader seats players, a missing player's side can go to the computer.
- **Server** (server.js `Saves`, `saveBattle`, `loadSave`): a co-op battle gets `R.saveId` at start and is saved (`SaveGame.freeze` of the room's `G`,
  gzipped, about 40-200 KB) every `SAVE_EVERY` (120 s), when a player drops (the hold starts), when the room closes with everyone gone, and on `savequit`
  (any player: saves, sends `saved` with their name, closes the room, battle reported `how: 'saved'`). A battle that ends deletes its save. Stored in Supabase
  `coop_saves` (`supabase/coop-saves.sql`, applied 2026-11-18; server token functions like server.sql, 60 days kept), in memory without `SERVER_TOKEN`.
- **Who:** phones send `pids` (a signed-in account's id, `Account.uid`, and the phone's `Report.device`) with create and join. The leader's `saves` lists the
  newest 8 saves any player in the room was in; `load` sets `R.resume`: mode, map, difficulty and factions are fixed, each player sits in their old place
  (by pid), an empty human place shows whose it was (`had`) and the leader can give it to the computer (`mate`, any open player place). Saved again, that side
  stays the player's (`human`). Starting: `SaveGame.adopt` (save.js, the old load's fixups as `revive`; save.js is now in headless.js's SCRIPTS) rebuilds `G`,
  each side is set to player or computer, peers get a full resync, `start` carries `save` and `resume`.
- **Phones:** lobby "Saved co-op battles" (leader), a "Continuing a saved battle" note, Continue battle; pause menu "Save and leave" (tap twice, `Net.canSave`);
  on `saved` everyone goes back to the online page with a note (`UIBridge.saved`, `Report.park`: the match row stays open). A phone that played the battle
  carries on its own match row (`rh-coop-matches` in localStorage, `Report.resume(.., 'pve', partner)`).
- **Marks of battle:** the server records none (`HEADLESS`), so in a co-op battle netcore.js keeps every relayed decal (scorch, crater, rubble, wreck, pads) as
  `[name, packed args]` in `G.keepMarks` (newest `KEEP_MARKS` 8000; a 15-minute 3 v 3 makes about 2,600, 160 KB, 52 KB gzipped), saved with the battle; on
  continuing, the server sends them in one `marks` message and each phone draws them as relayed decals. Not kept: bodies and blown-off turrets (made on each
  phone by its effects), burnt trees' looks. A save from another version loads as skirmish saves do.
- `node tools/sim/server-coop-save.js <repo>` (raw sockets) and `node tools/sim/coop-save-ui.js <repo>` (two browser pages). Not yet tried on real phones or with the live table.

## Recent mechanics (2026.10.31.2)

- **Map:** "A Bridge Too Far" (`MAPS.bridge`, `src/maps.js`), 144 x 144 cells (`MAP` in data.js). The
  layout scales from an 88-cell design (`K`, `S96`, `FR` in world.js). Ore fields grow with the map
  (`FR` = MAP / 112, inner edge unchanged so building ground is kept); gem fields stay small. Four gem
  fields (two per side, the second out by the lake ends). Pictures in `maps/*.png` come from
  `node tools/make-map-previews.js <repo>`; rerun it after any layout change. The sims tap Skirmish,
  then Start on the map screen (`#maps [data-map-go]`).
- **Saves** record `size: MAP`; a save from another map size is ignored (Continue hidden).
- **Rangers:** `heliOnly` weapon flag (can hit helicopters, not jets, see `canHit`), fire every 1.3 s. The
  computer's home guard (`aiHomeGuard`) no longer counts them as anti-air.
- **Pilots** that come down on water drown (`landChute`).
- **Decided to leave:** helicopters answer base-defence calls only for raiders within 32 cells
  (`bd` in `defendBase`) while jets have no limit; the owner likes distant bases calling jets.
- **Possible follow-ups:** move the second gem fields further from start positions 2 and 6; push ore
  fields about 2 cells clear of the 14-cell building circles; record the map in match reports; check
  performance on a real phone and a long `pvp-air-inf.js` run on the 144 map; per-map `MAP` size
  once a second map exists.

## Released in 2026.11.02 (also damaged structures and the SAM pit)

- **Service Depot** (`depot` in `BUILD_DEFS`, `commandRepair` / `updateRepairOrder` in world.js): 1200
  credits, needs a War Factory, both modes. Ground vehicles drive onto its pad (the `exitCell`, drawn by
  `padDecal`) one at a time (`depot.svc`) and are repaired at the aircraft-pad rate and price; others
  wait beside it. REPAIR button for damaged vehicles, or tap the depot. Out of money, Ore Trucks leave
  at once and the computer's vehicles after 8 s. The computer builds one on every difficulty and sends
  damaged vehicles (only while it has over 400 credits, at most 4 queued per depot).
- **Win rule:** a side loses when it has no production building (`PRODUCTION`: cy, barracks, factory,
  helipad, airfield) and no Mobile Construction Yard (`mcvsOf`) left (`inTheFight`, `checkWin`). Once a
  side has no production building, the enemy is told where its Mobile Construction Yards are
  (`lastStand`, also in `enemyBaseKnown` and `aiWaveTarget`). Sims end games by destroying every
  production building.
- **Mobile Construction Yard** (`mcv` in `UNIT_DEFS`, `deploys: 'cy'`, `mcvModel`): 2500, needs a Service
  Depot, deploys anywhere with the Mobile Outpost's `deployFob`. The computer builds one only to replace
  a lost yard (`aiDriveMcv`: drives home, tries further out if it cannot unpack).
- **Computer outposts** (Normal and Hard): `ai.expand`, `ai.outpostGuns`, 1 to 3 refineries per
  Outpost (`o.refWant`, `o.refineries`), `defMax` up by 3.

## Camouflaged Pillbox (after 2026.11.02.1, both modes)

- The Allied Pillbox has `camo: true` in data.js. `camoHidden(b, viewer)` (world.js) is true for an enemy
  structure that is not `exposed`. Hidden means: not drawn, picked or shown on the minimap
  (`visibleToPlayer` in ui.js), not chosen by `acquire` or `targetable` (so the computer's attack logic
  ignores it), and the host never sends it to an online guest until it is exposed (`shown` in net.js).
- Exposed for `CAMO_REVEAL` (4 s) after an enemy ground unit comes within `CAMO_DETECT` (3 cells), after it
  fires, or after it takes damage. Always exposed while under construction. `exposed` is synced;
  `revealT` is a host timer (in net.js `SKIP`).
- It leaves no dirt pad (`addBuilding` skips `bibDecal` for `camo`). Its roof takes the colour of the
  ground (`groundColour` in art.js, `camoPal` in models.js): grass, dirt or a mix, in quarter steps.
- Tested with throwaway scripts: hidden/exposed/hidden again, and an online host/guest pair (the guest
  has no entry for a hidden host Pillbox, gets it when exposed, keeps `exposed` current afterwards).

## Errors and ping in a match (2026.11.04.1)

- The main loop (`frame` in ui.js) runs each part (update or `guestStep`, `hostTick`, draw, sidebar,
  radar) inside `guard`, and asks for the next frame first, so an error no longer freezes the game.
  Errors go to `Report.oops(where, e)`, with uncaught `error` and `unhandledrejection` events too: up to 6
  distinct ones per match, with a repeat count, end up in the match's `stats.errors` (sent with the
  heartbeat and the result). Find them with `select id, stats->'errors' from matches where stats ? 'errors'`.
- **Ping** (net.js `notePing`, `noteFrame`, `netStats`): each phone records its ping over the battle
  (average, worst, share over 250 and 500 ms) and per minute of battle (ping, worst, this phone's real
  frames per second, frames over 100 ms, units alive) in `stats.net`. High ping with low host fps in big
  fights means the host phone is overloaded; high ping at any battle size means the route between phones.
- **Frame rate in every battle** (after 2026.11.12.1, skirmish and online): `Report.noteFrame` (called from ui.js `frame`)
  keeps per-minute figures in `G.perf` (saved with the game), sent as `stats.frames`: `cores`, `w`, `h`, `dpr`, and per
  minute `fps`, `slow` (frames over 50 ms), `long` (over 100 ms), `worst` (ms), `upd` / `drw` (average ms a frame spends in
  the simulation and in `draw`), `jumps` (camera moved over half a screen in one frame, e.g. a minimap tap), `wait` (frames
  with ground tiles still painting on screen) and `units`; since 2026.11.12.4 also the worst of each part (`wu` simulation,
  `wd` draw, `wg` the ground's update, `wo` sidebar and radar, ms), `gnd` (average ms in the ground), `tiles` (finished)
  and `lx` (frames over 100 ms mostly spent outside the game's code: the browser collecting memory or compositing), and
  `lf`: the first 4 frames over 100 ms each minute, part by part, put down to the frame before the gap (`t`, `gap`, `upd`,
  `drw`, `gnd`, `spr` / `sprN` new sprites made and how many, `oth` sidebar and radar, `tiles`, `units`). Query:
  `select m->>'m' min, m->>'fps' fps, m->>'long' long, m->>'worst' worst, m->>'upd' upd, m->>'drw' drw, m->>'jumps' jumps, m->>'wait' wait, m->>'units' units from matches, jsonb_array_elements(stats->'frames'->'minutes') m where id::text like '<id>%'`.
- **Drawing by part** (after 2026.11.17.6, both modes, reports only): ui.js `draw` laps its parts into `drawParts` (art.js): `gnd` (ground,
  ore, wrecks), `list` (tree shadows, lists, sort), `tree`, `bld` (structures, houses, walls), `unit`, `misc` (village props, folk, hens),
  `edge` (haze past the map), `fx` (shots, effects), `air`, `bars` (bars, labels, shroud), `blit` (the view put on the screen), `night`,
  `wthr`, and counts `nTree`, `nUnit`, `nFx`. Each minute has `dp` (averages, ms) and `dw` (the minute's slowest drawing frame, with `t`);
  zeros are left out, and `dp` is trimmed first when a report is too big. The parts add up to `drw`. Query:
  `select m->>'m' min, m->>'drw' drw, m->'dp' avg, m->'dw' slowest from matches, jsonb_array_elements(stats->'frames'->'minutes') m where id::text like '<id>%'`.
- **Joining** (net.js `listen`, `knock`, `dropAttempt`, `retryable`; 2026.11.04.2):
  a connection attempt that fails before the lobby connects no longer kills the host's room. The host drops
  it and keeps listening, and a new hello replaces a stale attempt (before, the retry got "already has two
  players", so the host had to start a new room). The guest also keeps host ICE candidates that arrive
  before the offer. `tools/sim`-style check: a ghost guest that never answers, then a real guest.
  Still open: only STUN is configured, so some mobile networks may need a TURN relay.
- Added after PvP match 67484441 froze at about 22 minutes on both phones (stuck picture, no message,
  shortly after a big Auto Attack). Its cause is still unknown: look at `stats.errors` after the next one.

## Dedicated server and team battles (branch `claude/dedicated-server-2v2`, not released yet)

- **Server** (`server/server.js`, run in Node by `headless.js`: the game scripts in a `vm` context with stub
  canvases; their `const`/`let` names are read with `ctx.get('G')`). One context per room. Rooms by 4-letter
  code, up to 4 seats; seat 0 leads (picks battle, map, co-op difficulty). Battle runs at 30 steps a second,
  snapshots 10 a second per player (`NetCore.snapshots`). Holds while a player is away; after `WAIT_LIMIT`
  a 1 v 1 is lost, and in a team game the computer takes over the side (`handOver`, also on surrender); an
  alliance with no players left loses; if every player is gone when the wait runs out, the room just closes with no winner (`tick`). The server sets `G.me = -1` so every side's announcer lines go out.
- **Phones:** `net.js` tries `SERVER` (`wss://red-horizon-rts.fly.dev`, `?server=<url>` to override,
  `?server=off`) for 7 s on Host or Join; failing that, or on a version mismatch, 1 v 1 goes phone to phone
  as before. On the server both phones are guests (`role === 'guest'`), `lobby.via === 'server'`.
- **Machine size:** `performance-1x` (dedicated CPU, 2 GB) since 2026-11-05. On `shared-cpu-1x` a co-op battle
  (match 81ea382d, ~470 units) became a slideshow: a shared CPU is held to 6.25% of a core once its burst balance
  (5 s at each wake) is spent, and a 4-sided battle needs about a third of a core by mid-game. Billed only while
  awake. The beat and each battle's `perf` report CPU use (`cpu_pct`, `cpu_peak_pct`, machine in `CPU_KIND`).
- **Fly.io:** app `red-horizon-rts` (change it in `fly.toml` and `SERVER` together if taken), one machine
  (rooms are in memory), sleeps when idle and wakes on the next connection. Health: `GET /` returns the
  version and room count.
- **Deploying the game server:** the environment's setup script installs `flyctl` (in `~/.fly/bin`) and
  `FLY_API_TOKEN` is set in sessions. From the repository root: `flyctl deploy --remote-only --depot=false
  --ha=false`. `--depot=false` because Fly's default builder (Depot) rejects the session proxy's certificate;
  `--ha=false` keeps one machine. Then check `curl https://red-horizon-rts.fly.dev/` shows the new version.
  The app was created (personal org, `dfw`) and first deployed on 2026-11-04 from this branch.
- **Stats page reports** (`rpc`, `beat`, `reportBattle`, `noteError` in server.js; tables and functions in
  `supabase/server.sql`): with the `SERVER_TOKEN` Fly secret set, the server sends a status beat every minute
  (`server_status`: version, rooms, battles, players, memory, step time) and a `server_battles` row when a battle
  starts and when it ends (mode, map, players, winner, `how` incl. `abandoned`, up to 6 errors, `perf`: step ms,
  slow steps over 33 ms, peak units, snapshot KB/s per player, time held). Supabase keeps only the token's SHA-256
  (`server_secret`); the functions refuse any other token, and the tables are not readable through the API. Without
  the secret (tests, local runs) nothing is sent. The owner's stats page shows them in its "Game server" section.
- **Teams in the simulation:** `newWorld(..., sides)` takes up to four `{ faction, ally, ai, name }`. Sides
  with the same `ally` are a team: `hostile(a, b)` is the enemy test everywhere (never compare `team`
  directly for enemies), `alliedSides`, `foesOf`, `enemyUnitsOf`, `enemyBuildingsOf`. Allies share one fog
  array (`G.fog[a] === G.fog[b]`; save.js joins them up again on load). `enemyOf(team)` is the enemy side
  the AI fights now (nearest still in the fight, kept 20 s). A side with nothing left is `out`; the battle
  ends when one alliance is left, and `G.over.winner` is an **alliance** number (in a 1 v 1 the same as
  the side). In a 1 v 1 each side is its own alliance (`ally = id`), so old behaviour is unchanged.
- **Modes:** skirmish 1 v 1 or 2 v 2 (you and a computer ally; the map screen's `data-mode`); online
  `1v1`, `2v2` (four players) and `coop` (two players against two computer sides, reported as `pve` with
  its difficulty). Team games need the server. A 2 v 2 skirmish never offers the leaderboard.
- **Performance** (found with 4 sides): `G.grid` buckets entities every step (`buildGrid`, `nearBuckets`)
  so `acquire` only looks nearby; a unit with a second weapon and nothing in reach waits 0.3 s before
  looking again (it searched every frame). A 2 v 2 of four Hard computers peaks around 440 units and
  8 s of CPU per game minute on the dev container.
- **Team extras (2026.11.04.5):** teammates of the same faction get a second colour (`team.variant`, `FACTIONS[f].alt`, `drawVar` in models.js, set per draw in art.js); "Ally defeated"/"Enemy defeated" have voice clips (rendered with `scripts/make_voices.py`'s pipeline, Kokoro model from the kokoro-onnx releases); the debrief compares your whole alliance with all foes; the ALLY button (`setAssist`, `defendAllies` in world.js, `team.assist`, `u.garrison`/`u.assisting`) garrisons an ally's base, and computer allies help defend (Normal and Hard, ground units only).

## Beaten in a team game (after 2026.11.05, both modes)

- A side with no production left is `out`, but the battle goes on while an ally is in it. The phone then shows a card
  (`beaten` in ui.js): **Keep watching** (`G.watching`; `G.seen` becomes this device's own all-revealed array, the
  shared ally fog is untouched; online `Net.watch()` sends `watch`, and the server's peer gets `watch`, so `snapshot`
  in netcore.js sends the whole map) and the alliance's result counts; or **Debrief**: a loss now with `how = 'out'`
  (online `Net.surrender('out')`, the server's `handOver(.., 'out')`).
- The server sends a player it hands over (surrender or beaten) an `end` with the battle's log, so their debrief and
  match report have graphs (before, match a858b156 had none).
- Snapshots also carry the debrief log as it grows (`s.log` in netcore.js `snapshot`, applied in net.js `applySnapshot`),
  so a phone that ends a battle on its own (it could not reconnect) still has its graphs.

## Map "Crossroads Village" and village houses (after 2026.11.16, not released, both modes)

- `MAPS.village` in maps.js: grassland, **144 x 144**, `teamSize: 2`, 4 starts (west 0-1 against east 2-3), laid out by
  `python3 tools/make-village-map.py` (no design picture: one quarter worked out in code and mirrored both ways; it prints
  `spawns`, `gems`, `lots` and `rows` to paste over the entry). Big lakes on the north and south edges push west-east
  traffic through or beside the village (with plain ponds there, 14 minutes of computer play never fought in it).
  **The lakes reach the village** (owner's pick of A, after the first test: the computer hugged the water and almost never fought in the
  village): each lake has a stub down to the village's outer lane (`VARIANT=a`, now the generator's default; `old`, `b`, `c` for the other
  layouts), and the shore road is gone. Before, west-east armies took the open strip between lake and village; C (woods in the strip) did
  not work because the shore stays walkable. 12-minute 4-computer Hard games, units killed inside the village: seed 21 8 of 269 (3%) to
  165 of 327 (50%), seed 22 151 of 335 (45%) to 181 of 373 (49%); houses hurt 6 / 16 to 19 / 24. The routes along the north and south
  edges now run along the village's outer lane and the gate gems.
  **Ore** (owner: "add more ore", after 2026.11.16): four fields per start (three by the base, one forward toward the village),
  about 449,000 ore in all (224,000 per alliance's half; Three Crossings 197,000), and 8 gem fields (4 at the village's north
  and south gates, 4 beside the side ponds, moved off the water), about 48,000. Every field reachable from a start.
- **Houses** (`village: true`, `lots` = building plots `[x0, y0, x1, y1]` between the lanes): `genVillage` (world.js, called
  from `genMap` after `genLayoutMap`) rolls them from the battle's seed, so every battle has its own village and every copy
  (online guest, server) the same one with the same ids. One church (`church0`/`church1`: tower toward the square) on a
  plot beside the square, then houses of 2x2 to 4x2 along plot edges with a cell of yard all round.
- Like a bridge span: `kind: 'house'`, `team: -1`, `def: HOUSE` (data.js), **not in `G.entities`**, in `G.byId`
  (`registerSpans` and save.js put them back). Standing, its cells are `G.block`; down (`collapseHouse`), open, with
  rubble and smoulder marks. Hurt only by `houseBlast` (shells, rockets and missiles hitting the ground within
  `HOUSE_SPLASH` 12 px; artillery, V2, grenade, flame and bomb blasts within their splash) and by ATTACK GROUND on it
  (`commandAttackGround` picks `houseAt`). Never auto-targeted. Health 150 + 70 per cell (max 1000), church 1400.
- **Looks:** `type` is `'hv:<kind>:<w>:<h>:<look>'`; `houseModel` (models.js) rolls the whole design from that text
  (plaster, brick, stone or timber walls, one or two storeys, gabled or hipped tile, slate or thatch roof, windows,
  shutters, door, chimney, fence, garden) and `houseStructure` registers it in `STRUCTURES`, so `damagedSprite` works as
  for any structure. `HOUSE_LOOKS` (6) looks per footprint a battle. Not baked (made at run time). `houseFx` adds fire and
  smoke below 30%. Drawn in ui.js `draw` sorted with units, on explored ground (`houseSeen`), and on the radar.
- **Online:** snapshots carry `hv` (every house's health, 0 = down) whenever one changes; `applyHouses` on the copy.
  The server must run the same version.
- `node tools/sim/village.js <repo>`: same seed same village, blocking, reachability, no fire unasked, blast damage, ordered
  attack and collapse, the online copy and snapshot, a 14-minute computer 2 v 2. Save and continue checked in a browser.
- **Garrisons** (owner OK'd, both modes): `commandGarrison(units, house)` / `commandExit(units)` (netcore `COMMANDS`). Armed
  infantry (not Engineers) walk to `besideSpot` and `enterHouse` (`updateEnterHouse`): `u.inHouse` = the house, `h.team` /
  `h.n` (one side at a time, up to `h.cap`: 3-6 by size, church 10, fountain 0). Inside, the soldier stays an entity at the
  house's middle (enemies can aim at him; grid, fog and saves as usual) but is hidden (ui `visibleToPlayer`, box select,
  radar skip `inHouse`), skipped by `separate`, and runs `updateGarrison` instead of moving: fires with `GARRISON_REACH`
  (1 cell + half the house) more range. `damage` on him hurts the house in full and him by `GARRISON_COVER` (0.3). Any
  other order: `updateUnit` calls `leaveHouse` (out by `houseDoor`, south side first) and re-paths. `kill` leaves first (the
  body falls in the doorway). `collapseHouse` throws the garrison out, `GARRISON_FALL` (35%) of their health lost.
  UI: infantry selected + tap a house = go in; tap your held house = select its garrison; EXIT on the bar; enemy-held
  house tapped with fighters = attack it. A flag in the side's colour on the roof, a pip per soldier for your alliance,
  side colour on the radar. Snapshots: `hv` entries are `[health, side, count]`.
- **Shots from the windows** (owner's request, looks only): `muzzle(src, t)` for a garrisoned soldier is `windowSpot` (world.js):
  a window on the wall facing the target (FORT_INFO `wins` on the south and east faces, mirrored to the north and west walls;
  `box` = the walls), one of the two nearest by unit id, else the middle of that wall. Tracers, rockets and the MG Team's
  smoke start there. The server builds `houseModel` once per house type to learn its windows. Incoming fire still aims at
  the house's middle.
- **Garrison fixes** (owner OK'd, both modes; the server must match): soldiers inside fire full bursts (`shoot` in `updateGarrison`).
  `damage(.., splashed)`: a garrisoned soldier caught in a blast passes nothing on to his house when the house is hit on its own
  (`houseBlast` after shell, grenade, artillery and V2 blasts, `splash`), or a `Set` so each house is passed on once (jet strafing,
  falling debris, the Flame Tower's jet); before, a house of 4 took one grenade 5 times. Bullet splash (rifles, MG Team) skips
  soldiers in houses (the walls), since all of them stand on the house's middle. Staged (Crossroads Village, 3 riflemen and a
  Rocket Soldier inside, 6 runs, 90 s): 7 riflemen + a Grenadier attacking left 7.2 alive and killed the whole garrison before;
  now none left, 3.7 of 4 inside survive. 4 riflemen + 4 Grenadiers: 0.8 attackers left, 1.8 inside, the house fell once;
  8 Grenadiers take the house 4 of 6 times. Grenadiers, artillery and ATTACK GROUND are the answer to a held house.
- **Fortified look** (owner's request, RA2 garrisons as reference only): a held house is drawn from `fortSprite(type, stage)`
  (models.js `fortifyModel`: the house's own model, damaged or not, padded by `FORT_PAD` 10 px, with a two-tier sandbag
  wall round the plot (gap at the door), two coils of barbed wire on posts outside, bags in the windows up to a slit,
  ammunition boxes by the gate). Made in the background (`pumpFort`); the plain house shows until it is ready.
  `FORT_INFO` (filled by `houseModel` / `churchModel`) holds the door, windows and flag spot (roof ridge, church tower).
- **Computer** (`aiGarrison` in ai.js, `AI_GARRISON` Normal 2 / Hard 3 houses, from minute 4, every 15 s): idle staged
  infantry, 3 a house, in houses on its own half nearest the enemy. Its waves never take them (not staged).
- **Village life** (looks only, no network; skipped on the server, `G.me < 0`): a fountain (`fountainModel`, 4x4 house kind
  `fountain` in the middle of `square`, destructible, water drawn by `fountainWater`); `G.props` (`villageProps`): street
  lamps from MAPS `lamps` (glow, `lampGlowPic`), market stalls and benches on the square, barrels, crates, hay, carts;
  knocked over (`knockProp`) by blasts and passing vehicles (`villageLife`); chimney smoke from about 2 houses in 5
  (`m.chim` of the house model); pigeons (`G.birds`, `birdFlocks`, `flyBirds`, art.js `drawBirds`) round the fountain and on
  the church roof that take off at units, shots and blasts and come back after 20-45 s.
  More (after 2026.11.16, owner's "more life"): **villagers** (`G.folk`, `villagers`, `moveFolk`, art.js `drawFolk`: up to 16
  pixel figures walking `streetNet`, a graph of the lamps plus a ring round the fountain and points along the square's
  edges, joined where the straight line is clear) who run into the nearest free house (`scareFolk`) when an armed unit
  comes within 200 px or a blast within 260 px, and come out 25-55 s later once `G.calmAt` has passed; **hens** in four
  yards (`hens`, `moveHens`, `drawHen`) that scatter and come back; **washing lines** (`laundry` props in front of about
  3 houses in 10, swaying with `windNow`, hidden while the house is held); **sounds**: the church bell tolls 3-5 times
  every 2-3 minutes while calm and not held (`bell` in audio.js), sparrows chirp in the square (`chirp`). All looks and
  sound only, worked out on each phone (effects pass, `G.inFx`, so the host relays nothing).

## Map "Frostlight Valley", a 3 v 3 winter map with five villages (after 2026.11.17.14, not released, both modes)

- `MAPS.frost` in maps.js: **216 x 216**, `teamSize: 3`, west (starts 0-2) against east (3-5), `theme: 'snow'`, snow weather (0.6), `daynight`.
  Laid out by `python3 tools/make-winter-map.py [--png out.png]` (prints `squares`, `lamps`, `spawns`, `gems`, `lots`, `rows` to paste over the
  entry): every feature is listed for the west and turned half round the middle (`P`), and the tool asserts the halves match.
  Three roads (north, middle through a pass between two hills, south), a market town in the middle, a village on the north and south roads,
  two hamlets on the diagonal roads; frozen lakes between the routes. Lamps along every village lane and beside the main roads.
- **Hills:** the game has no height. A big blob of rock paints as a flat dark mass (`paintCliffs` saturates), so a hill is a ring of cliff
  (`'#'`) round woods and crags. Narrow ridges paint well.
- **Several villages** (`squares` in MAPS instead of `square`; `villageSquares(m)` in world.js): a fountain, market and pigeons on each square,
  a church on a 4 x 6+ plot within 3 cells of each square, villagers 8 + 8 per village (max 48). Crossroads Village rolls exactly as before.
- **Snow on roofs:** on a `snow` theme map house types end in `:s`; `houseModel` builds the plain house and `snowCover` (models.js) whitens the top
  of every voxel column from z 3. Fountains are left as they are (their water still shows).
- Checked: all six starts connect; `teams.js <repo> 1 10 frost 3v3` no errors, 74 s CPU, ~830 units by minute 8 (no waves yet by 10 min);
  `village.js` passes. Ground baked (`grounds/frost/`, ~8 MB); sprite manifest hash only (no pictures changed).

## Crossroads Village: day and night, rain (after 2026.11.16, both modes)

- `daynight: true` in `MAPS.village`. **Looks only:** `dayNight(t)` (art.js) gives `night` and `warm` (dusk/dawn) from the battle
  clock, a `DAY_LEN` (720 s, owner: "a little faster" than 900) day starting at `DAY_START` (0.3, morning): dusk about 5 min in, about 5 min of night, then dawn.
  Every phone has the same hour. `drawNight` (from ui.js `draw`, before the weather) multiplies an amber tint at dusk and
  dawn, and at night lays a dark blue layer (`nightCv`, up to 62%) with holes cut where there is light (`lightPic`): street
  lamps, about 3 in 5 house windows (`FORT_INFO` windows), every finished building, fires, blasts, bolts and bolt fires, then
  a faint warm glow over them. Lamps glow faintly by day (`nightLevel`). Sight, fog and combat are unchanged.
- **Aircraft lights** (after 2026.11.17.2, looks only): `navLights` (art.js, end of `drawNight`) draws every visible aircraft's lights over
  the darkness: red and green wingtips, a double-flash white tail strobe and a pulsing red beacon on planes; a beacon, tail light and
  side lights on helicopters. ui.js passes `visibleToPlayer` so hidden enemy aircraft stay hidden.
  The Bomber's lights come from its own model (`PLANE_LIGHTS`: B-1 / Tu-22M swept wingtips, fin top, spine; heights x `VK`); before, the
  generic transport spots left them floating off the wings.
  The paratrooper transports likewise (`PLANE_LIGHTS` c130 / il76, after 2026.11.17.6): the generic spots put the wingtips 22 px out
  near the ground (2 px up) while the wings are 24-25 out and 7-9 voxels up (the Il-76's swept well back), so the lights hung below the wings.
- Villagers walk home at nightfall (`dark` in `moveFolk`, `v.slow`) and stay in until morning; sparrows only by day.
- `weather: { kind: 'rain', chance: 0.5 }` as on Lakeside: rain, lightning and the bolts that land (gameplay, both modes,
  server must match). `boltStrike` can now hit a village house too (it burns for 10% of its health like a building).

## Map "Twin Lakes" (contributor's map by JGFortanelli, owner OK'd, not released)

- `MAPS.twinlakes` in maps.js: **132 x 132** cells, 4 start positions, `teamSize: 2` (1 v 1, 2 v 2, co-op). Two lakes run from the
  north-west to the south-east; the north-east (starts 0-1) fights the south-west (2-3) over the land between the lakes and
  a concrete bridge at each end (`bridge: 'concrete'`; two spans each, with an island in the middle). One gem field behind each start.
- Traced from `maps/designs/twinlakes.png` (75 cells), which was redrawn one colour per cell from the contributor's screenshot
  (cropped to the land plus 2 cells of water). Changes from the picture: the 6-cell bridges are 4 design cells wide (7 in
  the game) and the rails on their approaches are dirt road, so armies are not squeezed into 3 cells.
- Its ground is baked (`grounds/twinlakes/`), its preview is in `ART` and its picture in `FILES` in sw.js.
- Checked: all four starts connect; `node tools/sim/teams.js <repo> 1 10 twinlakes` (2 v 2 of computers: about 470 units by
  minute 8, every side sent a wave). The contributor confirmed the design is their own and chose to keep the name and the gem fields; the size is a first guess.
- Its id is `twinlakes` because the owner's Lakeside already uses `lakes`.
- Its south-east bridge's lower span is as long as it is wide (7 x 7 cells), and `genLayoutMap` drew a square run west-east. A square run now
  runs north-south when the water is to its west and east (world.js; the other maps have no square runs, their bakes are unchanged).

## Attack ground, bridges that can be destroyed, Engineers (contributor's change by JGFortanelli, not released, both modes, needs the owner's OK)

- **Attack ground** (`commandAttackGround(units, x, y)` in world.js; ATTACK GROUND on the selection bar for fighters, then a
  tap: `aimSpan` in ui.js; an enemy under the tap gets the usual attack order). On a standing bridge span it is an attack
  on the span. Anywhere else the target is a **spot**: a plain object (`kind: 'spot'`, `SPOT` in data.js, no id, not in
  `G.entities` or `G.byId`), never hurt (`damage` returns), shelled until another order. It travels in snapshots as plain
  data on the unit. Meant for buildable walls and gates later.
- **Bridges** per map: `breakable: true` in MAPS (only Twin Lakes so far). Fixed maps only (`genLayoutMap`): each run of
  bridge cells becomes a **span** (`addSpan`, `G.spans`), `SPAN` in data.js (6,000 health, structure armour).
- A span is **not in `G.entities`** (nothing targets, draws, counts or sends it as an entity) but it is in `G.byId`, so
  `commandAttack` and an online order can name it (`kind: 'span'`, `team: -1`). `registerSpans()` puts them back after
  `G.byId` is rebuilt (net.js `clearCopy`; save.js does the same on load). Both copies of an online battle lay out the
  same map, so span ids match. Old saves have no `G.spans`: their bridges cannot be destroyed.
- Only an ordered attack hurts it (`damage` has a branch for spans; `splash`, `acquire` and base defences never see it).
  `breakSpan`: its cells become water (`setSpan`: `G.terr` 4, `G.block` 1), ground units on it are killed, every moving
  ground unit re-paths, every human side hears "Bridge destroyed".
- **Engineer** (`engineer` in UNIT_DEFS, both factions, Barracks, 500 credits, 25 health, speed 32, sight 4, unarmed,
  `engineer: true`). `commandEngineer(units, target)`: a destroyed span, or a damaged finished structure of its own
  alliance (`engineerJob`). It walks to the nearest reachable free cell beside it (`besideSpot`), then `updateEngineer`
  rebuilds the span or restores the structure to full health at once and the Engineer is used up (`alive = false`, not a
  loss). UI: Engineers selected, tap the destroyed span or the damaged structure. No capturing of enemy structures.
  Its model is the infantry figure with an olive vest, knee pads, a spanner on the pack and a yellow toolbox, no weapon
  (`E` in `infModel`; listed with `pilot` wherever a rifle is left out).
- **The computer** (`aiBridges` in ai.js, every 10 s, every difficulty): while a span is down it sends each idle Engineer
  of its own to the nearest destroyed span it can walk to that no Engineer of its alliance is heading for, and trains
  one (never a second while one is alive or queued) when it holds 800 credits. It never attacks bridges and does not use
  Engineers on structures. Headless 2 v 2 of Hard computers on Twin Lakes with two spans destroyed at minute 4: both
  rebuilt within a minute, no errors in 12 minutes; each side trained one, so an Engineer or two is left over, waiting
  for the next span. Paying credits for a rebuild (`rebuildSpan`, the 45 s wait, the blue bar) is gone.
- **Online:** `commandAttackGround` and `commandEngineer` are in netcore `COMMANDS` (the server must run the same
  version); snapshots carry `sp` (`[health, standing]` per span, whenever it changes) and the copy
  applies it with `applySpans`.
- **Looks:** the bridge stays painted in the ground (and its bake); while a span is down `spanRuin` (art.js) draws water,
  a ragged stub at each end and broken pieces of the deck in the water over it, after the wrecks layer, so no marks are
  involved. Health bar on a span while hit or while a ground target is being picked; the minimap repaints span cells
  when one changes (`spanSig`). Sprites and ground were rebaked (models.js changed).
- `node tools/sim/bridges.js <repo>` (headless: ordered attack only, collapse, re-routing, attack ground, Engineers
  rebuilding and repairing, training at the Barracks, snapshot and remote orders, the computer training and sending one). A phone-sized
  browser run checked the button, the taps and the pictures. Not yet tried: two real phones online, and a save and
  continue in the browser. `tools/sim/production.js` fails on `main` too (not from this change).
- On a phone the selection bar wraps to two rows with ATTACK GROUND on it.

## Walls and gates (contributor's change by JGFortanelli, owner OK'd for both modes, not released; branch `friend/walls-gates`, on top of the bridges branch)

- **Not structures.** A map layer: `G.wall` (kind id per cell, `WALLS` / `WALL_BY_ID` in data.js), `G.wallTeam`, `G.wallHp`,
  `G.wallN` (how many stand), made by `ensureWalls()` (newWorld; save.js for older saves). Nothing that loops over
  buildings sees them: no power, no win rule, no base alarms, no auto targeting.
- **Kinds:** Sandbags (Allies, Barracks, $25, 100 health), Barbed Wire (Soviets, Barracks, $20, 40), Concrete Wall (both,
  War Factory, $100, 300), Gate (both, War Factory, $500, 600, three cells bought as one: see below). All need a Construction Yard (`wallAvailable`).
- **Blocking:** hard pieces (sandbags, concrete) set `G.block`, so every terrain test sees them. Wire and gates do not:
  `freeCell` asks `softBlocks(c)`, which goes by `MOVER`, the unit a path (`processPaths`) or a step (`tryMove`) is being
  worked out for: wire stops infantry, a gate stops whoever is not of its alliance, and with no unit named both stop
  everything. `canPlace` refuses any wall cell. A vehicle flattens the wire it drives over (`tryMove`).
- **Placing:** `placeWalls(team, kind, x0, y0, x1, y1)` lays `wallLine` (straight; a slant steps diagonally, one piece a step
  since 2026.11.17.6, see Diagonal walls below; at most `WALL_LINE_MAX` 40) on every cell `wallOk` allows (open ground, nothing on it, within the
  building range of one of the side's buildings), paying per piece as far as the money goes. Built at once.
  `sellWall(team, x, y)` takes down one of your own for half its price. In the UI the second tap must come at least `WALL_SELL_GAP` (600 ms) after the first, so a double tap or double click never sells.
- **Damage:** only ordered fire. `commandAttackGround` on a wall cell makes a spot target with `wall: cell`; `damage`
  passes it to `hitWall`, and the spot dies with the piece so the attackers stand down. Structure armour.
- **Shooting a way through** (`breachWalls`, each side every 4 s while walls stand; `wallInTheWay`): hunting units
  (Auto Attack, the computer's waves) whose way to the nearest enemy building is shut attack the first enemy wall or gate
  on the shortest way in (two floods: as the unit walks, then also through enemy walls), up to 3 groups a turn, units
  within `BREACH_REACH` 15 cells join. `u.breach` sends them back to the hunt after; `manual` is cleared (not a player's
  order). Direct orders are left alone.
- **Breaching units still fight** (after 2026.11.17.12, both modes; the server must match; owner's report: after beating one side, an Auto Attack army
  walked past the next side's defences and buildings to shoot a wall): a unit on a breach order (`u.breach`) takes anything hostile within its main gun's
  reach (`breachReach`) first, defences and structures included, and answers fire from within that reach; the wall only when nothing else is. Only in-reach
  targets, so the base behind the wall does not pull it round looking for a way in. A breacher whose wall falls goes back to the hunt even if its attack
  order is still up (before, it could be left standing guard). Staged (6 Heavy Tanks sent at a far wall, a Pillbox beside the way): first shot at it 22 s to 4 s.
- **Widening a gap** (after 2026.11.17.4, owner's request, both modes; the server must match): a hunting group of `BREACH_CROWD` (8)+ whose
  open way in squeezes through a gap (`wallInTheWay(u, goal, out)`: `out.choke`, an enemy wall within 2 cells on both sides of a cell of the
  way, within `CHOKE_NEAR` 25 cells) sends its nearest half that can hurt walls (warhead `bld` >= 0.25, so not rifles) to shoot the wall beside
  the gap while the rest go through; again each breach turn until it is wide. `breachWalls` also no longer lets a lead shut in by trees speak
  for its whole group (up to 6 tries a turn). Staged (60 units, a 29-cell walled area with a 1-cell gap, cy 14 cells inside): inside after
  30 s 28-36 to 44-48; yard damage by 90 s about the same.
- **The computer** (`aiWalls` in ai.js, Normal and Hard, from minute 5, with 1,200 credits to spare, every 15 s): five
  pieces across the enemy's line of approach, 2.6 cells in front of each ground defence (`b.walled`), never a ring.
  Sandbags or wire; Concrete on Hard with a War Factory. Cap 20 pieces (Normal), 36 (Hard). It builds no gates.
- **Online:** `placeWalls` and `sellWall` are in netcore `COMMANDS` (the server must run the same version). Snapshots
  carry `wl` (`[cell, kind, side, health]` for cells that changed, where the player can see or the wall is their
  alliance's, every fifth snapshot like ore); the copy applies it with `applyWalls`, and `clearWalls` on a resync.
- **Looks:** `wallPic` in art.js draws each piece on a canvas (by kind, joined sides, side colour, battered, gate open),
  no voxel models, so no sprite rebake. Redrawn after 2026.11.15.7 (looks only, not released, owner's ideas): the gate is two
  concrete pylons with a ribbed steel barrier that sinks into a slot in the ground (`open` is 0 to `GATE_STEPS`; ui.js
  `gateAnim` moves it over 0.35 s; lamps amber, green when down); sandbags are two staggered courses of single sacks. Drawn in ui.js `draw` after the wrecks layer, on explored ground. A gate shows
  open while a ground unit of its alliance is beside it (looks only). Grey dots on the radar, gates yellow.
- **The Gate is three cells, one purchase** (after 2026.11.15.7, owner OK'd for both modes, not released; the server must
  run the same version): $500, 600 health (was one cell, $250, 300). Its cells are kinds 4 (middle, west-east), 5 (middle,
  north-south: `gateV`) and 6 (an end: `gateEnd`); 5 and 6 are `part` kinds, never offered. `gateCells(c)` gives the whole
  gate from any of its cells. `wallLine('gate', x0, y0, x1, y1)`: (x0, y0) is the middle, north-south when the second cell
  is further off up or down than across. `placeWalls` lays all three or nothing; `hitWall` keeps one health on all three
  and takes them down together; `sellWall` removes all three for $250. UI (`placeTap`): tap the middle, it turns to fit a
  gap in a wall, tap the same cell again to turn it. Drawn as one (`gm` in `wallPic`: pylons only at the ends), opens as
  one (ui.js `draw`). A save's old one-cell gates stay as they are (a middle alone). `walls.js` covers it; a phone-sized
  browser run bought one each way from the sidebar and took one down.
- **A Gate over your own wall** (after 2026.11.16, owner OK'd, both modes; the server must match): `gateCellOk` (world.js) accepts a cell
  holding the side's own non-gate piece (`ownPiece`) as well as `wallOk` ground; `placeWalls` replaces those pieces and refunds half
  their price (`gateRefund`, owner's pick: as if sold), which also counts toward affording the Gate. Never over an enemy's piece or
  another gate. UI: tapped on your own wall, the gate lies along it (`placeTap`); the bar says "replacing your wall ($N back)".
  `walls.js` covers it.
- **UI:** `wl:<kind>` items at the end of the structures strip (`wallCameo`); `beginWall` / `wallBar` / `placeTap`: tap the
  start, tap the end (tap again to move it), BUILD; it stays in wall mode for the next line. Tap an enemy wall with
  fighters selected to attack it; tap your own twice with nothing selected to take it down.
- `node tools/sim/walls.js <repo>` (headless: rules and prices, each kind's blocking, gates and alliances, wire under
  tracks, ordered fire only, selling, hunters shooting through a walled-in base, snapshots and remote orders). A
  phone-sized browser run laid concrete, a gate and sandbags, walked a soldier through the gate and took a piece down.
  Not yet tried: two real phones online, and a save and continue in the browser.

- **Sandbag cover** (after 2026.11.17.11, owner's pick for both modes; the server must match): sandbags drawn smaller (`WALL_LOOK[1]` h 6.5, a 4; was 8, 6; darker sides and seams, each sack a shade apart by cell, `tone` in `drawWallIso`).
  `sandbagCover(u, sx, sy)` (world.js): an infantryman not in a house, beside a sandbag of his alliance that lies toward the shooter (within about 40 degrees,
  not point blank), takes `SANDBAG_COVER` (0.65) of the damage, on top of prone. `defendBase` gives defending infantry a spot behind the alliance's sandbags
  near the base (`sandbagCells`, `coverSpot`: the free cell on the far side of a bag from the raider, within `COVER_SEEK` 12 cells, raider within reach + 2 cells;
  `u.cover` `{ c, s }`, each spot one soldier, netcore `SKIP`); `engage` walks there, fights from it without sliding, waits there up to `COVER_WAIT` (8 s) for an
  out-of-reach target (then `coverBan` 20 s), and leaves when the bag falls, the defence ends or the target moves off. Computer too. Staged (8 riflemen defending
  behind a 9-bag line against 8 attacking riflemen, 6 seeds that fought): defenders left 2.2 average without bags, 6.2 with.
- **Diagonal walls** (after 2026.11.17.6, owner's pick for both modes; the server must match): in the iso view a wall straight across the
  screen is a diagonal on the grid, and it was laid as a staircase (two pieces a step, drawn as a saw-tooth). Now `wallLine` steps
  diagonally, so a diagonal costs half as many pieces. `cornerShut(a, b)` (world.js): a step between diagonal neighbours whose two
  shared cells are both blocked is shut; `findPath` already refused it, now `tryMove`, `los` (path shortcuts), `walkDistances` and the
  `aiFindSpot`-style flood do too (also between two buildings or rocks touching at a corner). Drawing: ui.js adds diagonal bits to the mask
  (16 NE, 32 SE, 64 SW, 128 NW: a piece touching another only at a corner); `drawWallIso` turns the post to lie along the wall and draws an arm
  to each joined corner (`prism`, any convex outline), so a run is one straight wall. Old staircase walls draw as before. `walls.js` covers it.
- **Diagonal gates** (after 2026.11.17.8, both modes; the server must match): a Gate can lie diagonally too, so it fits a diagonal wall (straight
  across the iso view; owner's report: walls straight, gates not). Middle kinds 7 (north-west to south-east, step `MAP + 1`) and 8 (north-east to
  south-west, `MAP - 1`), `gateStep`, `gateDiag` (world.js); `wallLine('gate', ..)` lies diagonally when the second cell is as far off both ways.
  Placing (`placeTap`): it lies along your own wall under the tap or across a gap two cells off, now in any of the four ways; tapping it again
  cycles them (`p.dir`). Drawn along its line (`drawWallIso`: cells corner to corner, CELL x sqrt 2 long), a diagonal wall runs into its ends (ui.js mask),
  and an end with a wall beyond gets a stub of that wall up to its pylon (with the owner's stripe on concrete). The computer's rings still use straight gates.

## Map "Snowbound", the first 3 v 3 map (a winter map), and per-map sizes (2026.11.11.2; bridges, weather 2026.11.12)

- `MAPS.snowbound` in maps.js: traced from the owner's design `maps/designs/snowbound.png` (126 cells, a lavender-ground palette:
  `tools/map-from-image.py` detects it; its light grey roads become dirt tracks) at **210 x 210** cells (5/3 of the design;
  168 until 2026.11.12, so older Snowbound saves no longer continue), `teamSize: 3`,
  three bridges over the long lake (`--bridge` boxes in the comment), 16 gem fields placed in twins by the half turn, and an
  ore field added in code for the north-west start (`ore` in MAPS, from `claude/ai-squads`). After a re-trace, rescale the
  `gems` and `ore` positions (x 210/168 last time) and snap them to open ground.
  **Winter look:** `theme: 'snow'` in MAPS (`mapTheme`, `snowy()` in art.js): paintTerrain's snow, slush, ice and cold water
  palettes, snowy rock in `paintCliffs`, snowy pines only (`scenery.snowPines`, `treeModel(.., snow)`), and the minimap
  (`terrainMini`), base pads (`bibDecal`) and Pillbox camouflage (`groundColour`). Saves repaint with the theme.
  **Concrete bridges:** `bridge: 'concrete'` in MAPS (`concreteBridge` in art.js; timber when not given).
  **Weather (looks only, both modes):** `weather: { kind, chance }` in MAPS (Snowbound snow, Three Crossings rain, each
  0.5). `rollWeather` in newWorld sets `G.weather` from the seed (both online phones agree; saved); `weatherLevel(w, G.t)`
  comes and goes in spells, 0.2 to 1; `drawWeather` (art.js) draws drops, splashes or flakes and a haze over the screen
  canvas after the view (ui.js `draw`). Nothing in the simulation reads it.
  North (starts 0-3) against south (4-7): the starts are listed north first, not in the tool's west-first order.
- **Each map has its own size:** `size` in `MAPS` (default 144, `mapSize(id)`). `MAP`, `WORLD`, `NCELLS` are `let` now and
  `setMapSize(n)` (world.js) sets them, the pathfinder's arrays and `GRID_N`; `newWorld` calls it, and `SaveGame.load`
  (saves record `map` and `size`). ui.js remakes its one-pixel-per-cell pictures (`mapPictures`). Anything new sized by the
  map must be made after `setMapSize`, never once at load. genMap's constants (`K`, `MID`, `FR`...) are for 144 only.
- **No size limit from the ground** since it is painted in tiles (below). Bigger maps cost CPU (paths, the server) and
  game length, not memory. A 240-cell test map started and scrolled like Snowbound.
- `node tools/sim/teams.js <repo> 1 8 snowbound 3v3`: at 210 cells (with the ai-squads computer) about 750 units by minute 6
  and 150 s of CPU for 8 game minutes here (111 s on the 168 map with the same computer): watch the server's `cpu_pct`.

## Computer refinery cap (after 2026.11.14.5, not released, both modes)

- Owner's request after match 553c3209: the computer sides out-mined the humans (4 to 7 refineries, up to 16 Ore Trucks, against 2 or 3).
  `aiRefCap(team)` in ai.js: the computer's refineries (every refinery step in `aiNextStructure`, Outpost refineries too) stop at the
  average count of the human sides still in the fight (`!isAI`, not `out`; at least 2). An Outpost's first refinery may go one over.
  No human in the game (sims, a handed-over side): no cap. Every refinery brings a free truck, so trucks are capped with it.
  Staged `lakes` 3 v 3 with one idle human side, Normal, 15 min: computers 3 refineries / 6 trucks each (was 4 to 7 / 6 to 10).
  A side the server hands to the computer counts as a computer from then on.

## Map "Lakeside", a 3 v 3 map (2026.11.14.3; enlarged to 192 after 2026.11.14.4, not released, both modes)

- **Enlarged to 192 x 192** (owner's pick, both modes): match 553c3209 (3 v AI, 29 min) ran out of ore on the 96 map: 58,000 ore a side at the start against 1.8 million harvested by six sides (regrowth), and the computers out-harvested the humans. The same design now traces at 2 x (`map-from-image.py lakes.png 96 192 --decks`), so ore is about 4 x (203,000 a side; Three Crossings 197,000). Spawns and gems are the old ones x 2 + 1 (gem radii 3.2 / 3.5). Saves of a 96-cell Lakeside no longer continue. `teams.js <repo> 1 12 lakes 3v3`: no errors, 68 s CPU for 12 minutes. The 96-cell notes below are the original.

- `MAPS.lakes`: traced 1:1 from `maps/designs/lakes.png` (96 design cells = **96 x 96** game cells, the size asked for),
  `teamSize: 3`, 6 starts: north (0-2) against south (3-5), nearly symmetric by a half turn; the design's two middle
  starts were removed at the owner's request. Concrete bridges. Name is a placeholder.
- Its bridges are diagonal: `--decks` in `tools/map-from-image.py` turns strips of the deck colour (100, 88, 84) and the
  rails touching them into bridge cells, and `genLayoutMap` fits a run of bridge cells within 22.5 degrees of a diagonal
  along its main axis (axis-aligned runs as before, so the other maps' bakes are unchanged).
- Ore as on Snowbound: the traced fields (every start has its own, so no `ore` entries), a gem field behind each start and
  two twin pairs. `teams.js <repo> 1 10 lakes 3v3`: no errors, fighting from minute 4, 72 s CPU for 10 minutes.
- Design drawn by C. Gibke (credited in `CREDITS.md`), found online. Permission to use it is not confirmed: the owner
  decides before release.

## The ground in tiles, and the marks of battle (2026.11.12)

- Before: the ground and the wrecks layer were each one WORLD x WORLD canvas (130 MB at 168 cells; iOS refuses canvases
  over 4096 px a side, so maps stopped at 170 cells), painted whole at battle start (21 s on Snowbound at 4x CPU throttle).
- Now (`makeGround`, `groundPainter` in art.js): `G.ground` paints `GROUND_TILE` (256 px) tiles as they come into view,
  32 rows at a time (`update(view, 6 ms, 3 ms ahead)` from ui.js `draw`; the ring round the view is painted ahead, so
  scrolling finds tiles ready; a tile not ready shows the minimap colours). Up to `max(140, 3 x on screen)` tiles are kept,
  least recently seen let go. Battle start: about 1.5 s at 4x throttle.
- **Marks:** `scorch`, `crater`, `rubble`, `bibDecal`, `padDecal`, `bakeWreck`, `bakeTurret`, `bakeRagdoll` (`MARK_FNS`)
  given `G.tctx` / `G.dctx` (now layer tokens, not canvases) record `[layer, name, args, box]` in `G.marks` and are drawn on
  the tiles there are; a tile painted later draws its marks again, in order. Each mark is drawn once into a scratch picture
  and copied onto tiles, so it is the same on either side of a tile edge. A wreck keeps its char seed; effects are copied
  (`markArgs`). Every pixel of the painter depends only on its position (`speck` hash, not a running random), so tiles
  match; bridges are drawn once each into their own picture; road ruts are worked out per pixel (`paintRuts`).
- **Ground workers** (after 2026.11.12.1, both modes): a tile's pixels (`groundPixels`, about 90% of the cost) are worked
  out in Web Workers (`groundWorkers`, 1 to 3, made from the functions' own source as a Blob, so no extra file); the main
  thread only puts them in a canvas, draws bridges and scenery (`decorate`) and then the marks a few at a time
  (`finishing`, `finishSome`; a busy battlefield tile can hold hundreds). A tile is shown only once all its marks are on.
  Anything `groundPixels` uses must be listed in `groundWorkers`. Without workers (game server, old browsers) the old
  main-thread strips are used. Jumping the camera on a 3 v 3 Snowbound at 1920 x 1080 and 4x CPU throttle: worst frame
  238 ms before, about 15 ms after. `bibDecal` now builds its pixels in one picture (it was a fillRect per pixel).
- **The first frame uses the workers too** (2026-11-20, not released, both modes, performance only): it used to paint
  everything on screen on the main thread, about 1.2 s at 4x CPU throttle, so the game froze for a second or more at
  launch (the battle behind the menu) and at the start of every match. Now the workers paint it while the deploying card
  (ui.js `loading`, which waits for `G.ground.missing === 0`, at most 3 s) is up. Worst long task at 4x throttle:
  launch 2.4 s to about 1.1 s, match start 1.6 s to about 0.5 s (plus `newWorld`, about 0.7 s, mostly the voxel trees in
  `buildScenery`, and the first `waterMasks`, about 0.2 s: what is left). A first frame given a huge budget (`ms >= 1e6`,
  as `tools/sim/ground-tiles.js` does) still paints synchronously.
- **Stutters while scrolling a big battle (2026.11.12.4, match 8f2b3d32 on a phone):** unit sprites are made the first time
  each model and facing is drawn (`sprite` in models.js), and a 3 v 3 has six colours, so scrolling into a big fight made
  dozens in one frame. Now held to `SPRITE_BUDGET` (5 ms) a frame (`spriteSpend`, reset in ui.js `draw`); past it the same
  model at another facing stands in (`spriteAny`), or nothing for a frame or two (`spriteBlank`) for a model never drawn
  (a 4x-throttled test had 26 new sprites, 327 ms, in one frame). `pumpDamaged` is exempt. Marks are exempt (`drawMark`), or a stand-in would be baked into the
  ground. Sidebar cameos are drawn a few at a time early in the battle (`warmCameos` in ui.js; a new building unlocking
  several items stalled a frame by 0.4 s). Tile canvases are reused (`spare`), `bibDecal` keeps one picture (`bibPic`).
  Phone-sized 3 v 3 at 4x throttle while tapping the radar: worst frame 317 to 133 ms, worst draw 230 to 75 ms.
- **Simulation spikes (after 2026.11.12.4, both modes; `simprof`-style: wrap world.js functions in the headless context
  and time each step):** a 10-minute 3 v 3 of computers had steps up to 287 ms. Causes and fixes: `aiApproachSpots` ran up
  to 26 `findPath`s in one step, now one `pathField` (a Dijkstra distance map, cached within the step; Float64, since
  Float32 rounding made it skip cells); `defendAllies` tested every enemy unit against every ally building every second
  (330,000 `distTo` a second, a tenth of all CPU), now a bounding box first; `damageSpots` built a model the first time a
  type was damaged (the server has none), now warmed one type a second in `structureDamageFx`; every side's `aiThink` and
  `launchGroups(team)` ran in the same step, now the sides take turns through the second (`T.aiI`, `T.grp`, `T.grpI`);
  `findPath`'s heuristic is 1.001 times octile (ties broken toward the goal: same lengths, about 28% faster). Worst step
  287 to 37 ms; 12 game minutes of a 3 v 3 cost 111 s of CPU (was 150 s for 8). Unit sprites are also made ahead
  (`warmSprites` in art.js, 2 ms a frame from ui.js: every facing of the hull and turret, and soldiers' common poses
  `WARM_POSES`, for the kind of unit nearest the view not done yet).
- **Zooming round a 3 v 3 (match 532b38f5, iPhone, 2026.11.12.5):** fine for 11 minutes, then 20 radar jumps zoomed out:
  642 tiles finished in a minute, single ground updates of 110 to 287 ms, 136 frames of stand-in. Not reproducible in
  Chromium here (worst ground step 17 ms; no WebKit in the container), so likely Safari canvas costs. Changes: `charred`
  (a wreck's char) is kept per sprite, `CHAR_LOOKS` (4) looks chosen by seed (it made a canvas and hundreds of
  source-atop fills for every wreck at every repaint); the burnt hull and turret of each vehicle type are warmed
  (`warmSprites`); the **preview**: the workers paint the whole ground at a quarter size when idle (`pv` jobs, tiles
  nearest the view first, finished tiles are copied in too), drawn smoothed as the stand-in instead of the minimap
  colours (`pvDone`; `blocky` counts tiles still on flat colours). Reports add `gp` / `gd` / `gm` / `gmk` (worst
  pixels put, scenery, single mark and its kind, ms) and `blk` (frames with flat stand-ins).
- **Match c49f975f (another tester's iPhone, Hard 3 v 3, 2026.11.12.5):** every long frame was in the ground update:
  one sprite made inside a mark taking 95-185 ms (`sprN` 1; the same sprites take under 20 ms in Chromium at 4x), or 2-3
  tiles finished at 100-160 ms with no sprites. Likely Safari pausing to collect memory where the game allocates. The
  workers' 256 KB pixel buffers now go back and forth (`bufs`, `buf` in the job, `pvBuf` in the worker) instead of a new one
  per tile. The `gp`/`gd`/`gm` figures of the next report will say which step is slow.
- **ground-tiles.js save and continue** saves the battle paused: the page's own loop ran the battle on between loading
  and looking (a computer side placed a building, +1 mark) once sides took turns thinking.
- **Baked sprites (after 2026.11.12.6, both modes):** `tools/bake-sprites.js` renders every unit (all facings, looks and soldier
  poses), every structure and the wrecks' burnt hulls and turrets, in each palette (`allies0-2`, `soviets0-2`: faction and
  team colour, and `burnt`), with the game's own code, into `sprites/<name>.webp` (lossless; solid pixels exact, see-through
  edges within 4/255) and `sprites/manifest.json` (key, place in the sheet, offsets, shadow). About 4.8 MB in all.
  `SpriteSheets` (art.js, so its changes need no rebake) loads the main colours and `burnt` at start and a battle's teammate colours from `newGround`,
  cutting them into `spriteCache2` as ImageBitmaps (about 1 s in the background); anything not loaded or not baked is
  rendered as before. Only over http(s) and `app:` (the Windows app): pages opened from a file (the tools/sim tests) keep
  rendering, since a picture loaded from a file cannot be read back. **Rebake after changing models.js, voxel.js or the
  FACTIONS colours** (`--check` compares a hash of those). The service worker caches the main sheets with the music
  (`ART`), the Windows app copies `sprites/`, and the owner's artifact needs them published as files like the music.
- **Deploying card (2026.11.12.7, both modes):** `loading` in ui.js holds a new, continued or online battle behind a
  "Deploying forces" card until `SpriteSheets.ready()` and `G.ground.missing === 0` (at least `LOAD_MIN`, at most
  `LOAD_MAX` 3 s; shown only after 120 ms). A skirmish does not run meanwhile; an online battle does (`Net.role`). Those
  frames are left out of the match report.
- **Pop-in (after 2026.11.13, both modes; match 258ad396, a 2560 x 1370 desktop at 120 fps with up to 1,136 frames a
  minute showing stand-ins):** tiles were let go past `max(140, 3 x on screen)` and repainted on the way back. Now a
  roomy computer (`GROUND_ROOMY` in art.js: Chrome's `deviceMemory` >= 8, or no touch screen, not a phone and 4+ cores)
  keeps every tile and, once the preview is done, has the workers paint the rest of the map in the background, nearest
  the view first (finished with the `ahead` time only). Snowbound: all 400 tiles in about 20 s, about 100-130 MB.
  Phones keep the old limit. On every device a tile that comes in where a stand-in was on screen fades in over it
  (`GROUND_FADE`, 250 ms, `t.born`) instead of popping.
- **Baked ground (2026.11.13.2, both modes):** the fixed maps (`rows` in MAPS: Snowbound, Three Crossings) paint with a fixed
  seed (`groundSeed`), so `tools/bake-ground.js` paints their ground once into `grounds/<map>/<i>.webp` (1024 px sheets,
  `GROUND_SHEET`, row by row, bridges and scenery included, lossy WebP 0.8, about 35 dB) plus `preview.webp` (quarter size)
  and `grounds/manifest.json` (about 12 MB in all). `GroundSheets` (art.js) loads the manifest at start; `newGround` uses a
  map's bake only if its `key` equals `groundKey(G)` (a hash of everything the ground is painted from), so a changed layout
  paints as before. In `makeGround`, `bk` cuts tiles from decoded sheets (`bakedFeed`, `finish` with `m.bmp`; a phone keeps
  12 sheets, 4 loading at once); the preview comes from the file. A sheet that fails to load falls back to painting
  (`bk.failed`, `Report.oops('groundSheet')`). Only over http(s) and `app:`, so tools/sim tests (file://) still paint.
  **Rebake** after changing the ground painting in art.js, scenery (models.js, voxel.js) or a fixed map
  (`node tools/bake-ground.js <repo> --check` in the release checklist). The service worker caches the manifest and
  previews (`ART`) and sheets as they are used; the Windows app copies `grounds/`; the owner's artifact needs them as files.
  4x-throttled phone-sized 3 v 3 here: start 3.6 to 2.9 s, stand-in frames while circling the map 26 to 20 (the
  container's workers are fast; on a phone painting costs far more).
- **Anything new drawn onto the ground** must be a function in `MARK_FNS` (deterministic from its arguments, with a box in
  `markBox`), never a draw on a canvas kept in G. The game server records no marks (`HEADLESS`).
- **Saves** keep `G.marks` (no pictures). An old save's two pictures are used as the ground (`legacy`, `G.legacyGround`,
  kept while that game goes on).
- `node tools/sim/ground-tiles.js <repo> [maps] [old checkout]`: a staged battle; live tiles = repainted tiles and 256 =
  512 px tiles (pixel for pixel), the whole map in one picture differs by blending rounding only (at most 3/255 on the
  ground); save and continue identical; an old save continues with the same scars.

## 3 v 3 and 3 v AI: the foundation (after 2026.11.11, not released)

- **Battles** are one table, `BATTLES` in maps.js (`size` = sides per alliance, `coop` = the other alliance is the
  computer's, `players` online): `1v1`, `2v2`, `coop` (2 v AI), `3v3`, `coop3` (3 v AI). The server reads it too
  (`MODES`, slots, room size, Switch team). Sides alternate between alliances: side i is in alliance i % 2.
- **Maps say what they are made for:** `teamSize` in `MAPS` (largest alliance; both maps are 2). `battleFits(map, mode)`
  gates the skirmish map screen's battles, the online lobby's battles and maps (cards that do not fit are disabled), and
  the server's `setup`. An alliance can never be larger than half the map's start positions. **To enable 3 v 3 on a map,
  give it `teamSize: 3`** (and at least 3 start positions per half). Snowbound is the first.
- **Testing on today's maps:** `?battles=all` in the address offers every battle that physically fits; the server takes
  `ANY_BATTLE=1`. `node tools/sim/teams.js <repo> 1 12 river 3v3` runs a computer-only 3 v 3 headless (on the dev
  container about 680 units and 16 s of CPU per game minute by minute 6, double a 2 v 2: watch the server's `cpu_pct`).
- **Skirmish 3 v 3:** you and two computer allies against three computers (`teamSides(f, size)` in ui.js).
- **Colours:** a third same-faction teammate is `variant` 2 with `FACTIONS[f].alt2` (Allies teal, Soviets purple).
- **Reports:** 3 v AI is `pve` like co-op, and team battles record `stats.size` (sides per alliance). Only 2-player co-op
  offers the co-op leaderboard (`online.coop === 'board'`); a 3-player board needs `get_leaderboard` to split by size.
- **Computer teammates in co-op (online, not released):** in `coop` and `coop3` the leader can give an open place on
  the players' team to the computer (lobby button Add computer / Open for a friend; `{ k: 'mate', slot }`, slot
  `mate: true` and `ai: true` in server.js). So two friends can play 3 v AI. Its difficulty is the co-op one. A co-op
  with a computer teammate is unranked (no co-op board). `node tools/sim/server-coop-mate.js <repo>`.
- Not done yet: the leaderboard split, and phones with six players for real (server load and the
  lobby on a small screen).

## Computer attacks, direct orders, team economy (2026.11.12.1, both modes)

- **Planner** (`planner: true` in `DIFFICULTY` Normal and Hard; Easy keeps fixed waves): after the base is found and
  `firstWave` has passed (480 s on Easy and Normal, 360 on Hard since 2026.11.12.4, 2 min later than before at the owner's
  request: harder on a phone; all devices, skirmish and co-op), each attack comes after `aiGap()` (`ai.gap`: mostly `short`, a `long` lull with `chance`, never over
  600 s), or at once when the units waiting reach `ARMY_FULL` (60%) of the army cap (at least `AI_GAP_MIN` after the last). A
  wave takes three quarters of what waits; from 12 units it splits into 2 squads, from 20 into 3 half the time.
- **Flanking** (`aiApproachSpots`, `aiGather`, `aiPincer`): each squad gathers 13-17 cells off the target on a side that is
  reachable, out of range of known guns, rarely straight ahead and not one of the last 4 used (`team.apHist`, bearings round the
  target's side's Construction Yard), then all close in together. `ai.approach` is the share that flank first (1 on both).
- **aiSquads:** a squad that started with 8+ units and is down to 35% of its worth against twice its strength pulls back; squads
  near home answer a defence `defendBase` reports as short (`team.defShort`). `defendBase` no longer recalls planner waves itself.
- **Raids were removed** on every difficulty (they almost never destroyed their target). `aiWaveTarget` attacks another found
  enemy when its chosen one (`enemyOf`) has not been found (team games).
- **Starved economy** (`aiStarved`: under `STARVED` 2,500 ore within 14 cells of its refineries and Outposts): the computer buys a
  Mobile Outpost with 250 credits (a third if need be) at the front of the queue and holds army production until it is out.
- **Aircraft avoid known anti-air** (`knownAA`, `aaCover`, `airPick` in world.js): hunting aircraft pick a building no detected AA
  covers (finished SAM/AA Gun on explored ground, AA units there; Rangers only count against helicopters), else the least
  covered; with an open target they also skip covered targets on the way (`airTarget`).
- **Direct orders** (`takeOver`, `u.manual`, `u.manualFrom`): move, guard, attack and the Attack button keep a player's unit out of
  Auto Attack, base defence, scrambles and the Ally button until Stop (`commandStop`). After an attack order, `releaseIdle` sends
  it home to rejoin once it has stood idle `MANUAL_IDLE` (180 s). Never set for the computer.
- **Team-game ore** (`growOre`): `ORE_REGROW_PER_SIDE` cells per field per tick for each side, and cells under a third full grow
  twice as fast. Maps can add ore fields in code: `ore: [[x, y, r]]` in `MAPS` (Snowbound has one by the north-west start).
- Sims: `ai-timing.js` (wave times, how waves went in), `teams.js` (prints `how`), `ore-econ.js` (ore and income every 5 min),
  `aa-avoid.js`, `manual-override.js`, `ai-starved.js`. 2 v 2 of Hard computers: no winner in 35 min, as with the old AI.

## Auto Attack target picker (2026.11.12.1, both modes)

- In a battle with more than one enemy side, AUTO opens a picker (`autoPicker` in ui.js): each enemy side by name, faction
  and colour name, disabled until its base is scouted (`enemyBaseKnown(tid, side)`) or once beaten; plus Nearest enemy, Auto
  attack off and Cancel. A 1 v 1 keeps the plain toggle. The picked side's colour shows as a stripe on the button (`.aimed`).
- `setAuto(team, on, side)` sets `team.focusSide` (synced in netcore `TEAM`; the guest's order passes the number). `chosenFoe(team)`
  is that side while it is in the fight and known; `enemyOf` returns it first, and `nearestEnemyBuilding` keeps hunters to its
  buildings (others are still fought on the way). Units already hunting another side drop their raid focus.
- Computer (`aiPickFoe` in ai.js, every 30 s): Easy nearest (`focusSide = null`); Normal and Hard score each scouted foe by
  distance, seen strength (army plus known guns) against its own, allies already on it (+0.5 each, so allies gang up) and
  stickiness. A 3 v 3 of Hard computers on Snowbound: each alliance on one foe, the first side out at 9.7 min, then all moved on.

## Giving credits to an ally (2026.11.12.8, from PR #4 by JGFortanelli, team games in both modes)

- `sendCredits(team, toSide, amount)` in world.js: only to another side of the same alliance that is not `out`, cut down
  to what the sender has; both sides hear a line (`say`). `toSide` is a side number, because netcore.js turns any team
  in a remote order into the sender's own. Totals in `stats.given` / `stats.received` (go out with match reports).
- The GIVE button (`giveBtn`, the `#give` card in ui.js) shows in team games: each ally still in the fight and
  `GIVE_AMOUNTS` (500, 1000, 2500), plus a typed whole amount per ally (`giveTyped`). No tax or cooldown. The computer never gives or asks.
- Online it is one more entry in `COMMANDS` (netcore.js), so the server must run the same version.

## Mac app (`desktop/`, after 2026.11.15.6, not released, needs a Mac to test)

- Unsigned `.dmg` and `.zip` (universal, ad-hoc signed by `scripts/adhoc-sign.js`, so Gatekeeper needs right-click > Open once), built by the
  `mac` job in `.github/workflows/desktop.yml` after the Windows job, on the same release. `npm run dist:mac` builds locally (on a Mac).
- **No electron-updater on Mac** (Squirrel.Mac needs a signature). `desktop/content-update.js` updates the game's files instead: the `mac` job
  uploads `content-manifest.json` (every file in `desktop/game` with SHA-256, game version, `shell` version) to the release; the app reads the
  newest release that has one every 30 min, builds the new files in `userData/content/<ver>.part` (unchanged files copied, changed ones fetched
  from the Pages site and hash-checked, so a deploy that has not finished is retried later), then offers a restart. `pickBase` in main.js uses the
  downloaded copy if newer than the bundled one; one that never finished loading is ignored (`bad`). Windows is unchanged.
- **When a game update needs a newer `main.js` / `preload.js`**, raise `SHELL_API` in content-update.js and `SHELL` in `scripts/make-manifest.js`
  together: older Mac apps then show "download the new app" instead of updating.
- **Runner** (after 2026.11.17.14): the `mac` job runs on `macos-15-intel`. On `macos-latest` (Apple Silicon) it was never picked up from 2026.11.17.8 to .14
  ("not acquired by Runner", GitHub capacity), so Mac apps got no updates. To rebuild only the Mac side of a version already out on Windows: run the
  workflow by hand with `mac_only` (the `build` job is skipped).
- Tested here only with a stubbed Electron (`pickBase`, staging, restart offer, unconfirmed-boot fallback); the packaged app is untested.

## Soundtrack (separate files since 2026.11.03.9)

- Four recorded tracks, shuffled: Industry, War, Smash, Rain. Each is an MP3 in `music/<name>.mp3`, listed in `SONGS`
  in `audio.js` with `rec: '<name>'`. `Music.loadRec` fetches the file (`music/<id>.mp3`) and decodes it on demand;
  if the fetch or decode fails the song is skipped (`recFailed`). `Music.nextSong` deals a shuffled deck (no immediate
  repeat), `Music.newMatch` (called from `startMission` and the online start in ui.js) opens a match on a random
  track. Only the playing track is kept decoded (about 60 to 100 MB).
- **Adding a track:** put `music/<name>.mp3` in the repo, add it to `SONGS` in `audio.js` and to `TRACKS` in `sw.js`
  (the service worker downloads the tracks in the background after install, so the soundtrack works offline), credit
  it in `CREDITS.md`.
- **The single-file build no longer contains the music.** For the owner's artifact, build to `.build/index.html`,
  copy `music/` to `.build/music/`, and publish with the Artifact tool's `files` map
  (`"music/<name>.mp3": ".build/music/<name>.mp3"`) alongside the page, so the page's relative `music/...` URLs work.
  Each file may be up to 16 MB; the page is now about 2.5 MB. Later releases only need to resend the page
  (files left out are kept). Remove `.build` afterwards.
- The owner supplies the tracks (credited in `CREDITS.md`). Convert with ffmpeg: `loudnorm=I=-16:TP=-1.5`,
  a 2.5 s fade out, 44.1 kHz stereo, 96 kbps.
- Volume sliders (`musicVol`, `sfxVol` in `Sound.settings`, `setVolume`) scale the buses; full is the original mix.

## Windows app (`desktop/`)

- `main.js` serves the game from `app://game/` (not `file://`, so match reports work and `fetch` of the music works;
  no service worker, since `ui.js` only registers it on http). `scripts/prep.js` copies the game into `desktop/game`
  (gitignored) and sets the app version from `src/version.js` as `YEAR.MMDD.N` (semver cannot hold `2026.11.07`).
- Local test: `cd desktop && npm install && npm start`. Installer: `npm run dist` (Windows). CI does the release.
- The installer is unsigned, so Windows SmartScreen warns on first run until a code-signing certificate is added.
- The app's game version equals the web version, so it matches the game server.

## Claude token tracker (2026.11.16)

- A Stop hook (`.claude/settings.json`) runs `node tools/claude-usage.js` after every Claude turn: it reads the session's
  transcript (and subagent transcripts), one row per Claude reply (input, output, cache read, cache write, model, branch),
  and upserts them by message id into Supabase `claude_usage` via `log_claude_usage` (`supabase/claude-usage.sql`). Never fails
  the hook. `node tools/claude-usage.js <transcript.jsonl> --dry` prints a session summary.
- The table is not readable through the API; `claude_usage_report(days)` returns totals only (per day, last 40 sessions, per model).
- Dashboard: https://claude.ai/artifact/SBZjzKFR33gmneBDGY3su4 (slug `cbee14e8-11b5-4a4a-bd7d-ec0a90da7d73`, source
  `tools/claude-usage.html`), live through the owner's Supabase connector (`execute_sql`), else the snapshot baked into the page.

## Next: PvP

Agreed with the owner, built in stages. Profiles shipped in 2026.10.29; stages 1 to 3 shipped in
2026.10.29.1 (online battles). Later releases: 2026.10.29.2 leaderboard scores (best score per
commander per difficulty, `match_score`), 2026.10.29.3 save and continue a skirmish.

1. **Either side can be "you".** Done. Replaced the "human is side 0" assumptions with a local viewer
   side. That covers the camera, fog (`G.seen` vs `G.aiSeen`), selection, the sidebar, notices,
   sounds and the debrief. Test it on one device before any networking.
2. **Online play.** Done, in `src/net.js`. How it works:
   - The host plays side 0 and the guest side 1. Both build the map from the same seed. The guest's
     copy has `G.remote` set: it never simulates, and `damage()` does nothing there.
   - About 10 snapshots a second carry only the entity fields that changed (host timers are left
     out), new effects, fog and ore changes, team state, and events (sounds, shakes, ground marks,
     the guest's announcer lines). Things set off inside `updateEffects` (`G.inFx`) are left out,
     because the guest runs the effects itself. Nothing is sent about the host's side, or about
     effects, shots and sounds, in ground the guest has not uncovered. A big battle costs about 15 KB/s.
   - The guest's orders: `net.js` wraps the order functions (`commandMove`, `startProduction`,
     `placeStructure`, `setAuto` and the rest) and sends them to the host. The host only accepts
     them for the guest's own units.
   - `matches.opponent` holds the other player's name; the game may now insert that column.
   Original plan:
   - The host's device runs the battle and the guest's device sends orders.
   - The host sends state snapshots several times a second.
   - The connection is phone to phone over WebRTC, with Supabase Realtime only for introductions
     (signalling). Supabase's free plan caps relayed messages at about 2 million a month, so it
     cannot carry whole matches.
   - Players meet with a 4-letter room code, then pick sides in a lobby.
   - Each match records to `matches` with `mode = 'pvp'`.
3. **Hardening.** Done:
   - A heartbeat every second (the ping shows at the top, next to the opponent's name). After 6
     seconds of silence, or when the channel closes, both phones hold the battle (`G.hold`) and
     show "Waiting for your opponent". The guest knocks on the room code again, the host listens,
     and on reconnecting the host sends a full snapshot (`full`).
   - A phone going to sleep sends `away`, so the other side holds at once.
   - After 2 minutes of waiting, whoever stayed wins (`G.over.how = 'left'`). A phone that was
     asleep that long loses when it wakes.
   - Quitting an online battle is surrendering (`how = 'quit'`). Rematch returns both players to
     the lobby on the same connection.
   - Still to do: real phones over cellular, and a relay (TURN) only if direct connections fail.
   Original plan:
   - Pause with "waiting for opponent" when a phone locks or a connection drops, and resume on
     reconnect.
   - Rematch and quitting.
   - Real phones over cellular. Add a relay server (TURN, such as Cloudflare's free tier) only if
     direct connections fail.
4. **Later:** ranked play, matchmaking and a PvP leaderboard.

**Online rules (agreed, not built yet):** balance can differ between single player and online.
Plan: an "online rules" table in `src/data.js` listing only the stats that differ. It is applied
to the unit, structure and power stats in place when an online battle starts and restored when
it ends, so net.js keeps matching rules by identity. Behaviour changes check the battle's
online flag. The Field Manual notes any stat that differs online. Build it with the first
online-only change.

Lockstep (both devices simulating) was rejected. The simulation uses `Math.random` and
frame-time maths everywhere, so it is not deterministic.

## Defend ally: pick the ally, answer units outside the base (after 2026.11.14.8, not released, team games, both modes)

- With 2+ allies the ALLY button opens a picker (`allyPicker` in ui.js); `setAssist(team, on, side)` stores `team.assistSide` (synced; the guest's order carries the side). `assistAlly(team)` is the picked ally (else the first). A human's units go to and defend only that one; picking another moves the garrison over. The computer still answers any ally's call.
- `defendAllies` also treats an enemy unit as a threat when it is shooting at an ally's unit within `R2` (22 cells) of that ally's buildings (raiders at the base were 14 cells). `node tools/sim/ally-defend.js <repo>` (3 v 3 on Lakeside): old code never answered raiders at the second ally and killed 1 of 2 units hitting a unit outside the base; now 3 of 3 and 2 of 2.

## Tech Center (after 2026.11.15.1, not released, both modes)

- `tech` in `BUILD_DEFS` (both factions, 3x3, 1500 credits, 1000 health, -100 power, needs a Radar Dome). Unlocks the top-tier
  units through their `req`: Mammoth Tank (`['tech']`), Artillery (`['dome', 'tech']`), Attack Helicopter (`['tech']`). The Hind and
  V2 are not gated. A new Helicopter Base gives its free helicopter only if it is `available` (so no free Apache before a Tech Center).
  Models (redrawn at the owner's request: elegant, lots of glass, Red Alert as inspiration only): `STRUCTURES.tech` (Allied glass
  campus: curtain-walled tower and hall with roof lights, geodesic glass dome, glazed entrance canopy) and `SOVIET.tech` (institute:
  arched windows behind a portico, two glazed towers, a drum of windows under a ribbed glass dome with lantern and star spire,
  and a bronze worker statue with raised fist and banner on a granite plinth at the foot of the steps). Sprites rebaked; ground bakes only got a new key.
- Computer: `['tech', 1]` after the Service Depot in `aiNextStructure`; vehicle picks it cannot build yet fall back (Mammoth to Heavy
  Tank, Artillery to Medium Tank); helicopters only when `available`. Headless 1 v 1 on A Bridge Too Far: Tech Center at 370 s (Hard)
  and 580 s (Easy), then helicopters, Artillery and Mammoths.
- The owner plans to use it later for per-unit upgrades bought there and for new units. Online, the server must run the same version.

## Tech Center upgrades and the Comanche (after 2026.11.17.1, not released, owner OK'd for both modes)

- **Upgrades** (`UPGRADES` in data.js: name, cost, `time` s, factions, `unlocks`, `desc`): researched at a Tech Center, one at a time per side
  (`startResearch` / `cancelResearch` / `updateResearch` in world.js, both in netcore `COMMANDS`; the server must run the same version). Paid as it
  goes like production (half speed on low power, `G.diff.speed` for the computer). `team.research` `{ id, progress, spent, stalled }` and
  `team.upgrades` `{ id: true }` are plain data (saved; netcore `TEAM`). Owner's rules: a finished upgrade is kept for the battle even if every
  Tech Center falls; research under way when the last one falls (or is sold) is cancelled and refunded. A unit with `upgrade: '<id>'` is
  `available` only once researched (`hasUpgrade`), and needs nothing else from the Tech Center. Later upgrades can change existing units' stats.
- **UI:** UPGRADES on a finished Tech Center's selection bar (shows the percentage while researching) opens the `#upgrades` card (`openUpgrades`,
  `upFill` in ui.js): Research (the button names what it unlocks, e.g. "Comanche · $1500 · 60 s") / Cancel / Researched. A blue bar under each Tech Center while research runs. "Upgrade complete" is text only (no voice clip yet).
- **Comanche** (`comanche` in UNIT_DEFS, Allies, Helicopter Base, $1500, 180 health, speed 100, sight 8, `standoff`; upgrade "Comanche program" $1500, 60 s):
  needs a free pad like any helicopter (`padRoom`). `standoffFight` (world.js) instead of the plain helicopter attack: it holds near the edge of the
  weapon's reach (`STANDOFF_FAR` 0.92), backs away nose-on below `STANDOFF_NEAR` (0.8; was 0.6) at `BACK_SPEED` (0.55 x speed). Looks as far as its missiles
  reach (`airTarget`). **Chain gun** (`weapon`: 4-round bursts of 11, range 190 (was 150; owner: outrange the MG Team's 150 and the Rocket Soldier's 180), splash 8, warhead `CG`, 15 bursts a sortie): `spareTanks`, so `canHit`
  skips tanks (`isTank`: `draw === 'tank'`) while it has missiles; `airWeapons` swaps in `anyTarget(w)` (the same gun without the flag) once they are spent.
  **Missiles** (`weapon2`: 4, 120 HF, range 210, `tanksOnly`, `lock` 1 s, `bay`): the bays open (`u.bay` 0 to 1 over `BAY_OPEN` 0.4 s, synced, while
  `u.bayHold`), a lock builds while it faces the target (`u.lock`, `u.lockOn`, host timers in netcore `SKIP`), one missile per `rof` (cd2). `fireWeapon`'s `bay`
  branch launches from the side bays in turn (`bayN`), the missile falls clear for `BAY_DROP` (0.22 s, `dropStep`, also run by the guest's `flyShots`) and lights
  with a puff, then flies as any missile. No nose flash for those (`shots` is put back).
- **Looks:** `comancheModel(pal, bay)` (models.js, reworked from photos of the real RAH-66 at the owner's request: stealth grey tinted with the side's colour, faceted body with a dark chine line, flat wedge nose and long chain gun, big angular tandem canopy, wide engine hump with intakes and a tall hub fairing, thick boom, big round fan shroud, tall fin with T-tail and end fins; rotor drawn higher; doors flat out
  with a missile on each when open), `BAY_STEPS` 2, key `'A' + key + 'b' + step` in `hullSprite`; baked (`looks` in bake-sprites.js) and warmed; five-blade
  rotor (art.js); cameo with the bays open. Sprites and ground key rebaked.
- **Computer** (ai.js, Normal and Hard: `aiOf(team).planner`): researches any upgrade it can once it has a Tech Center and 2,500 to spare; Allied
  helicopters are then Comanches 45% of the time (65% when countering armour). Two 18-minute Hard 1 v 1s: researched at 411 / 476 s, up to 2 Comanches, no errors.
- `node tools/sim/comanche.js <repo>`: research cost and refund, kept without a Tech Center, pads full, bays and lock (first missile 1.2 s after coming into
  reach), no gun at tanks while missiles last, missiles 471 of 480 damage, the gun on tanks after (6 bursts, 53 damage), gun only on infantry from 138 px,
  backing off. Staged (2 Comanches, 45 s): 9 of 10 riflemen, 1 of 3 Heavy Tanks killed, no losses; against 6 riflemen + 3 Rocket Soldiers both
  Comanches are lost (RedEye reach 180 is past the gun's 150) for one kill. Balance not tuned further: owner's call.
- **Hunting fixes** (after 2026.11.17.4, both modes; the server must match): with its gun spent and no tank in missile reach it flies home to
  rearm (`gunSpent` in `updateAir`; before, it flew on to the enemy base with only tank missiles and hung there without a shot), and on Auto
  Attack it fights every unit it meets, even under known anti-air (`open` in `airTarget`). Scratch hunt run (2 Comanches, 8 units on the way):
  5 of 8 killed and both lost before, 8 of 8 and none lost after. Landed aircraft's ammunition pips are drawn with `standAt` (a stray black
  bar on the turned view) and a load over 6 is a gauge.
- **Comanches on an ordered target, missiles, spacing** (after 2026.11.17.6, both modes; the server must match; owner: Comanches bunched over an
  enemy base doing nothing): with an attack order on a building it emptied its gun, then could neither hit the building (missiles are for
  tanks) nor go home (`gunSpent` saw a tank or Ore Truck in missile reach) and hovered for good. Now `airTarget` keeps an ordered target only
  while a weapon can hit it, else takes a missile target in reach or goes home. With only missiles left it looks `MISSILE_SEEK` (2) x their
  reach for one before going home (it used to fly home with all 4 beside tanks just out of reach). `spreadHelis` eases friendly helicopters
  holding on a target `HELI_SPACE` (34 px) apart. Staged: refinery attack with a tank and truck beside it, the truck killed by missiles (none
  fired before); a hunt into a base, both Heavy Tanks hit after the gun (none before). `comanche.js` passes.
- **Comanches defend from the pad** (after 2026.11.17.6, both modes; owner: they sat on the pad while the base was attacked): a helicopter
  rearming or repairing on its pad was left out of `defendBase` until fully loaded (the Comanche loads 15 bursts, then 4 missiles). Now a
  landed helicopter answers a raid with `padReady` (half its health, half a load of gun or missiles) and a weapon that can hit one of the
  raiders (`airWeapons`, so a Comanche with only tank missiles waits for its gun against infantry). Jets are unchanged (one pass, full rearm).
- **Missiles at Ore Trucks** (owner's request, both modes; the server must match): `missileMark` (world.js) = tanks and Ore Trucks; `tanksOnly`
  missiles fire at both and the `spareTanks` gun leaves both to them while it has missiles. A Comanche against a parked Ore Truck: all 4 missiles,
  then the gun, 600 to 70 health in 12 s. Field Manual says so.
- Field Manual: Comanche entry (Aircraft), Tech Center text, "Needs" shows the upgrade.
- **Comanche balance** (after 2026.11.17.9, owner's pick for both modes; the server must match): its stats are unchanged, but it costs $2000 (was 1500),
  and SAM Site and AA Gun range is 195 (was 180 / 170; 220, 200 and 190 tried), past its gun (190), so it can no longer strip a defended base from outside
  reach. This affects every aircraft. Staged (2 Comanches ordered onto a powered SAM Site, 60 s, 3 seeds): before, the SAM fell every time and 1-2 Comanches
  lived; at 200 both are lost every time and the SAM keeps about 60% (the same at 220: against buildings only the gun counts). 3 Comanches lose too (SAM 15% left), 4 win with 2 left. At 190 the SAM lost every time (2 Comanches both lived). At 195: 2 Comanches won 1 of 2 runs, 3 lost both (SAM 15% left), 4 won with 2 left. `comanche.js` passes.
- **Tesla Tank** (Soviets, owner's pick for their upgrade; `ttank` in UNIT_DEFS, War Factory; upgrade `teslatank` "Tesla program" $1500, 60 s): OpenRA's
  TTNK numbers ($1350, 450 health, light armour, speed 50), `draw: 'tank'` (so it counts as a tank: the Comanche's missiles go for it), size `tesla`.
  Weapon: Tesla bolt, 75 TESLA, every 2.4 s, range 140, ground only, no power needed. `teslaTurret` (models.js, reworked at the owner's request: a big steel dome with a copper band and a glowing cap on a low armoured drum, blue insulators; was copper windings on a
  mast, blue insulators, glowing ball); `muzzle` fires from the cap (`TESLA_TOP` 10). The computer adds it to its Soviet vehicle picks once researched.
  `node tools/sim/tesla-tank.js <repo>`: Soviets only, locked until researched, kills a rifleman, 132 damage to a Heavy Tank in 5 s, never fires at a helicopter.

## Transport helicopters and Air Assault (after 2026.11.17.11, ON HOLD: not released, owner OK'd for both modes; the server must match)

- **ON HOLD (owner, 2026-11-17): keep this work but do not put it in any build (artifact, test build, Windows/Mac app, game server)
  until the owner says so.** Hidden behind a switch: `setTransports(false)` in data.js (`TRANSPORTS`) leaves `chinook` / `halo` with no
  factions (nobody can build them, so no Air Assault button), `aiOf` drops `lift` (no computer air assaults, no extra Helicopter Bases) and the
  Field Manual leaves them out. Releasing them = change that line to `setTransports(true)`. `transport.js` and `ai-lift.js` turn it on. Open question
  when it comes back: computer drops die within a minute in computer-only games (see the tuning notes below); next ideas were trying it
  against a person, a counter-drop (fly when the enemy army is seen away from home), or skipping paired drops when the wave is outnumbered.

- **Units** (data.js, Helicopter Base, $1000, unarmed, `lift: true`, `carry: 8`): Chinook (Allies, 320 health, speed 75) and Halo Transport
  (Soviets, after the Mi-26, 360 health, speed 70). Models `chinookModel` / `haloModel` (models.js); rotors from `ROTORS` in art.js (the Chinook's
  two turn opposite ways, the Halo's has 8 blades); green pips for soldiers aboard (own alliance only). Sprites rebaked.
- **Passengers are plain data** on the transport (`u.cargo`: type, hp, rank, kills, kw, born), like jets in reserve: boarding sets `alive = false`
  (not a loss), `unloadOne` makes them again with `addUnit` (host only). Shot down loaded: all aboard count as lost (`kill`).
- **Orders** (world.js `updateLift`, `u.order.type 'lift'`): step `pick` (land at x, y, wait for boarders), `go` (fly and land), `drop` (one out every
  `LIFT_DROP_GAP`, then home; empty, it parks there). A guard order on the pad flies home and is repaired there (`padRepair`, split out of `updateAir`).
  Any other order (Auto Attack, hunt) sends it home: it never joins attacks, base defence or scrambles.
- **Controls (option 1):** infantry selected + tap your transport = `commandBoard` (it comes down beside them, or they walk to it where it is parked).
  Transport selected + tap the ground = `commandMove` → `liftTo` (drop and go home, or park if empty). UNLOAD HERE on the selection bar.
- **Air Assault (owner's idea):** `as:assault` in the left strip once the side has a transport (`ASSAULT` in data.js). Tap it, tap where to land:
  `commandAirAssault(team, x, y)` takes a free transport (`liftReady`), the Barracks with the most idle infantry within `ASSAULT_REACH` (14 cells),
  up to 8 of them dealt round-robin by kind (`assaultCrew`: no Engineers, nobody busy or ordered to hold), at least `ASSAULT_MIN` (4). It lands below
  the Barracks, waits up to `LIFT_WAIT` (25 s), flies, unloads (player's troops guard the spot, `manual`; the computer's hunt) and goes home.
  No recharge. Online both commands are in netcore `COMMANDS`; the guest checks `assaultPlan` locally for the button.
- **Computer, by personality** (owner's picks, Normal and Hard; `lift` in `AI_STYLES`, `aiAirAssault` in ai.js; Easy has none). A transport is queued
  first while a pad is free; with every pad taken it builds another Helicopter Base (`aiLiftPad`, up to 3; owner: attack helicopters are never held back). **Rusher:** 1 transport from 0.4 x `firstWave`; every wave takes a drop behind its
  target (`aiLiftWithWave`, `pair: 'behind'`) plus drops of its own every ~100 s (`aiLiftSolo`), rifle-heavy (`prefer`). **Raider:** 2 transports,
  drops every ~90 s behind refineries, power, Outposts and Ore Trucks it can see, landing on the far side from its base, never crossing known
  anti-air's reach and 1.25 x clear of it where it lands (`aaWide`), rockets and grenadiers first. **Balanced:** a drop with each planned wave on its
  flank, full loads only. **Turtle:** `aiLiftDefend` flies idle infantry from the main base to an outlying building (18+ cells from its main yard)
  with raiders at it; they hold there (`unloadOne` mode `guard`); attacks by air only with a wave its stall rule sent (`stallOnly`). Paired drops
  board at launch (taken out of the wave) and wait on the ground (`order.goAt`, kept up by `aiLiftTiming`) to land as the wave's lead gets within
  `LIFT_LAND` (6) cells; spots are tried round the target until one is clear of known anti-air. Hard: a quarter less between drops of their own.
  Allies: no drop within `LIFT_ALLY_R` (10 cells) of an ally's drop of the last minute (`G.liftDrops`). `node tools/sim/ai-lift.js <repo> [minutes]`.
  **Tuning (owner OK'd, after every drop died within a minute):** drops land `LIFT_OFF` (10-12 cells) from the target (was 4-9); soldiers dropped
  with a wave hold the spot (`unloadOne` mode `wait`, `u.liftWait`, netcore `SKIP`) until the wave engages (`aiLiftRelease`: a wave unit fighting or
  within `LIFT_ENGAGED` 8 cells of the target, or the wave gone; at most `LIFT_HOLD_MAX` 75 s), and paired drops land as the wave's lead is
  `LIFT_LAND` (6; was 14: owner, so defenders are busy with the wave) cells out, or at once if the wave is already fighting, and those soldiers attack on landing; the raider weighs Ore Trucks in the open and refineries, Outposts and power away from a main base `LIFT_OUT_W` (4) x
  and lands 4 cells off those (in-base targets: 10-12 cells beyond); balanced pairs only with waves of `minWave` (15)+.
- Owner's choice: everyone gets both controls (no PC / phone split). `node tools/sim/transport.js <repo>` (boarding, drop, parking, Air Assault mix,
  shot down, a forged online order, a Normal computer flying one: 8 men at about 11 min). Not yet tried: two real phones online, save and continue
  with soldiers aboard in a browser.

## APCs (not released, owner's picks for both modes; the server must match)

- `apc` (Allies, a tracked box with a gunner standing in the hatch at an M2 .50 cal) and `btr` (Soviets, an eight-wheeled boat-hulled carrier with a small
  heavy-MG turret), both named APC, War Factory, OpenRA's numbers: $850, 300 health, heavy armour, speed 83, 5 aboard (`carry`, `apc: true`). Heavy MG
  (`sound: 'hmg'`: cal50 / dshk), hits helicopters, not jets. One type per side because wrecks are drawn from the type alone.
- **Boarding** reuses the transport helicopters' code (and is not behind their `TRANSPORTS` switch): infantry selected + tap your APC = `commandBoard`;
  `updateBoard` walks them to the APC wherever it is and `climbIn` (plain data in `u.cargo`). UNLOAD HERE = `commandUnload` (netcore `COMMANDS`): it
  stops and lets one out every `APC_DROP_GAP` (`updateUnload`, `unloadOne`; another order stops it). Pips for those aboard (`cargoPips` in art.js).
- **Destroyed with soldiers aboard** (owner's pick, `apcEscape` from `kill`, host only, not while a beaten side is wiped): each gets out with `APC_ESCAPE`
  (0.5) chance at `APC_ESCAPE_HP` (half) the health they had, not under the player's orders; the rest count as lost. The vehicle's own crew may still bail out.
- **Looks:** `apcHull` / `apcTurret(pal, frame)` and `btrHull` / `btrTurret` (models.js, hulls built with the turret ring at the origin, so turret offset 0);
  the gun kicks back on alternate rounds of a burst (`apcFrame`: `fireT` and `shots` parity, frame 1, baked); a wreck's turret has no gunner. Sprites rebaked.
- **Computer** (every personality and difficulty; `aiApcs` in ai.js): up to `APC_MAX` (2, raider 3) in its vehicle picks; an APC waiting at home takes idle
  staged infantry aboard (no Engineers) and goes out with a wave; loaded in the field it unloads when hurt under half, fighting, hit, or with known enemies within
  `APC_UNLOAD_R` (7 cells), then hunts (`u.apcBack`). Home APCs that join a defence unload too.
- **Engineers capture** (owner's picks, both modes; the server must match): `engineerJob` takes a finished enemy structure (not a hidden Pillbox), any kind,
  Construction Yards included; `updateEngineer` calls `captureBuilding(b, team)` at once and the Engineer is used up. **A Construction Yard takes `CAPTURE_CY`
  (8 s, owner's pick)**: `b.capture` (0 to 1, synced) and `b.capU` (netcore `SKIP`); reset when the Engineer dies, leaves or is sent elsewhere (`updateBuilding`),
  one Engineer at a time, "Construction Yard under capture" for the owner, a flashing yellow bar over it (ui.js). The structure keeps its health, takes the
  new owner's side and faction (so its look and colours; faction-only types such as the Tesla Coil draw fine in either), and lets go of the old owner's rally,
  primary, docking trucks, based aircraft and a vehicle at its door; the old side counts a building lost (and loses its upgrades with its last Tech Center),
  the new one `stats.captured`. UI: Engineers selected + tap an enemy structure (the rest of the selection attacks it).
- **Engineer raids** (Raider only, Normal and Hard; `aiEngRaid`): from 0.6 x its first-wave time, every `ENG_RAID_GAP` (150 s) + up to 60: trains 2 Engineers and
  an APC if short, loads 2 Engineers + up to 3 soldiers, drives to the least covered spot round the best known enemy structure (`aiEngTarget`: `ENG_VALUE` worth
  over known guns and seen armed units covering the spot, 12 spots round each), unloads, Engineers capture, soldiers attack it. Engineers left in the field go
  for the nearest enemy structure within 15 cells. `team.engRaid` is plain data (saved).
- `node tools/sim/apc.js <repo> [minutes]`: boarding, the sixth soldier left out, driving, unloading, a forged online order, 40 kills with 5 aboard (about half get
  out, at half health), capture of a power plant and a Construction Yard (the side is out), and a Normal 1 v 1 (balanced against raider): both build and ride APCs,
  raids happen (1 capture in one 20-minute run, 0 with 3 raids in another). `bridges.js`: an enemy Engineer now captures instead of repairing.

## Unit veterancy (after 2026.11.14.12, not released, both modes)

- Owner's request, OpenRA's Red Alert rules (`^GainsExperience` in its `mods/ra/rules/defaults.yaml`). `VET` in data.js: a unit is
  promoted when `killWorth` (cost of what it destroyed, already kept for the debrief) reaches 2, 4, 8, 16 times its own cost.
  `u.rank` 1-4 (4 = Elite): damage dealt x 1.05 / 1.1 / 1.2 / 1.3 and taken x 0.95 / 0.9 / 0.85 / 0.75 (both in `damage`), reload
  x 0.95 / 0.9 / 0.85 / 0.75 (where `u.cd` is set from `rof`), ground speed x 1.05 / 1.1 / 1.2 / 1.4 (`followPath`, `slideOut`;
  **aircraft keep their speed**, their turning-circle maths depends on it). Elite heals 5% every 4 s after 5 s unhit (`vetHeal`).
- `promote` (world.js, from `kill`): only armed units that cost something (`gainsRank`: not Ore Trucks, support planes, pilots'
  free spawns or structures); a gold ring effect and "Unit promoted" / "Unit promoted to elite" (text only, no voice clip yet,
  at most every 12 s). The computer's units earn ranks too; the AI does not reason about them.
- `rank` is a plain unit field: saved, and synced to online guests (so the server must run the same version); `healT` is a host
  timer (netcore `SKIP`). Drawn by `drawRank` in ui.js for every visible ranked unit (gold chevrons, a star for Elite; enemy
  ranks show too) and named in the selection bar. Field Manual row "Veterancy".
- **Voice lines** (after 2026.11.15, owner's pick over a chime or trumpet, which were tried and removed): "Unit promoted." and
  "Unit promoted to elite." in `src/voices.js` (`eva:unit promoted`, `eva:unit promoted to elite`), rendered alone with
  `scripts/make_voices.py`'s `render()` and settings (`af_heart`, 0.93, `EVA_FX`), so the other clips were left as they were. Only
  the unit's owner hears them (`notify`), online guests too.
- Not done: ranks in the debrief.

## Computer waves, Soviet tank costs, OpenRA armour multipliers (after 2026.11.14.12, not released, both modes)

- **Computer (Normal and Hard):** `defMax` 11 to 6 / 15 to 8, `outpostGuns` 2 to 1 / 3 to 2; a planner wave sends every waiting unit
  (was three quarters) and waits until the army is `WAVE_HOLD` (half) of its cap by count or worth. Computer-only games still never
  end (1 v 1 run to 75 min): waves of 35 to 59 units die within about 100 s of contact, and both sides attack at the same moment.
- **Owner's picks from an OpenRA comparison:** Heavy Tank 950 to 1150, Mammoth 1700 to 2000 (OpenRA's costs). Warheads: `RF` (rifle;
  was SA) 1 / 0.27 / 0.07 / 0.07 for inf / light / heavy / bld, `GR` (Grenadier; was HE) 0.6 / 0.25 / 0.25 / 1, `ART` 0.9 / 0.9 / 0.25 / 0.75 (only the tank figure is OpenRA's; the full OpenRA row was tried and put back).
- Measured after (Hard computers, 20 min): Soviets still lead 8 of 8 1 v 1 on `bridge` and 10 of 10 faction-against-faction 2 v 2 on
  `twinlakes` (either seat); by value lost (4 games) Allies 372,000 to Soviets 283,000. Unit kill counts alone overstate it: Allies field more cheap infantry.

## Artillery 200 health, rifle splash (after 2026.11.15.2, not released, both modes)

- Owner's picks after staged fights (equal credits, `bridge`, 6 seeds, 180 s; open-ground script not in the repo) showed the Allies losing most matchups.
  Artillery health 120 to 200; Rifle Infantry (both sides) bullets splash `splash: 14` px on hostile ground units beside the target
  (`fireWeapon`, bullet branch: full damage at the target, half at the edge, RF multipliers). Before / after: Artillery vs V2 Allies won 0 of 6
  to 6 of 6 (left 2,258 / 4,612 to 5,321 / 3,603); Mixed army 1 to 2 of 6 (left 1,590 / 3,305 to 2,343 / 2,700); Rifles vs Grenadiers still 1 of 6;
  tank rows moved by noise only. Soviet infantry and Mammoths still win most of the rest.
  Then Artillery health 200 to 190 (owner: it won every fight): Artillery vs V2 Allies won 4 of 8 (left 3,828 / 4,096), Mixed 1 of 8, Infantry only 3 of 8,
  Medium vs Mammoth 1 of 8, Rifles vs Grenadiers 1 of 8. Runs vary a lot with 6 to 8 seeds, so treat 1 or 2 wins as noise.
  Then Rifle Infantry range 70 to 120 px (5 cells, OpenRA's M1Carbine; both sides): Rifles vs Grenadiers 1 to 3 of 8 (left 1,866 / 1,866), Mixed 1 to 3 of 8, Infantry only 2 of 8.
  Grenadier splash is the main lever for infantry (22 px: rifles won 2 of 10; 12 px: 7 of 10; 6 px, OpenRA's: 9 of 10): not changed yet.
  OpenRA infantry share cells (`SharesCell` on the foot locomotor, up to 5 per cell), so they do clump; ours keep 1.4 radii apart.
  Then Grenadier splash 22 to 14 px (owner's pick): Rifles vs Grenadiers Allies won 7 of 8 (left 2,683 / 1,498), Mixed 4 of 8, Infantry only 3 of 8, Artillery vs V2 3 of 8,
  Medium vs Mammoth 2 of 8, Medium vs Heavy 5 of 8, Light vs Heavy 4 of 8, Rockets vs Mammoth 4 of 8, Rangers + Light vs Heavy 1 of 8.

## Trees sway in the wind and burn (after 2026.11.15.6, not released, both modes, looks only)

- Trees are no longer painted into the ground (or its bake): `groundPainter`'s `prepare` puts them in `P.trees` (same random stream, so
  rocks and bushes are where they were), `newGround` keeps them in `G.ground.trees` (sorted by y; none on the server or for an old
  save's legacy ground), and `drawTrees` (art.js, called from ui.js `draw` before the units) draws them and their shadows each frame.
  Each leans with `windNow()` (world.js, the wind that already blows smoke), harder in rain or snow (`weatherLevel`), with a gust rolling
  across the woods downwind and a little flutter: a shear about the tree's foot. Pines are stiffer, burnt trees hardly move.
- **Burning** (world.js `igniteTrees`, `treeFires`): an `expl` effect of size 9 or more sets the trees within `max(12, 1.4 x size)` px
  alight when it goes off (in `updateEffects`, so each phone does it from the explosions it sees; `litFx` is a WeakSet, not a field, so
  the host never sends it). Each burning tree may catch each neighbour within 16 px (`TREE_SPREAD` 0.22, a few seconds later), so a fire
  spreads a little and dies out. It burns `TREE_BURN` (9) s engulfed (`treeHeat`: ablaze in about 1 s, dies down over the last 3 s; `treeFlames` draws the tree's own shape in rising, flickering flame, 4 frames cached per tree picture, plus flame and smoke effects over the crown), fading into a burnt tree (`burntTreeModel`: a thick charred trunk and limbs with grey ash on top, so it shows against dark woods;
  in models.js, `scenery.burntTrees` / `burntPines`), then leaves a scorch mark (14 px). `G.treeFire` (tree number -> time it caught) and
  `G.treeHot` are plain data, so saves keep burnt trees. Ground rebaked (`groundKey` has a `live-trees` token); sprites rebaked for the hash only.

- **Far views (after 2026.11.16.2, both modes, looks only):** on a big PC screen zoomed right out, Crossroads Village had about 2,900
  trees in view, each drawn with its own sway transform (about 12,000 draw calls, 23 ms a frame); rain was 0.6 ms. Past `TREE_FAR_N`
  (700) trees in view, `drawTreeBlocks` (art.js) draws still and burnt trees, upright, from cached `TREE_BLOCK` (512 px) blocks, redrawn
  when one of their trees catches fire or burns out and dropped 5 s after the last far view; burning trees are still drawn one by one.
  Rain splashes are capped with the view like the drops. Phones never get that many trees in view.

## Soviet radar dish turns, new build-up for every structure (after 2026.11.16.5, not released, both modes; the server must match)

- **Build-up takes `BUILD_UP` (2.5 s, data.js; was 1.4)** after placing: the one gameplay change (owner's pick). `node tools/sim/teams.js <repo> 1 8 bridge 1v1`
  before and after: same 25 buildings at minute 8, so the computer is not held up.
- **`SPINNERS`** (models.js, next to `HEADS`, same layout, kept apart because `HEADS` is keyed by type only and world.js `muzzle` reads it): the Soviet Radar's mesh antenna
  and feed horn (`radarDish`) are no longer in the building's model (the cameo still has them, still). `spinnerSprite(type, faction, angle, stage)`; art.js `drawStructure` draws it on
  its pedestal. `dishAngle` (art.js; a `Map` by building id, never a field on `b`): `DISH_SPEED` 0.9 rad/s, turns from the first frame after the build-up (its 32 facings are made during the build-up, `drawBuildUp`), stops at damage stage 2 and on low power (a new Radar can put a side on low power until it has more plants).
  Not baked. The Allied Radar Dome's small dish does not turn yet (owner's call).
- **`drawBuildUp`** (art.js) replaces the old row crop for `buildT < 1` and selling (`sellT / 1.2`, backwards): the footprint's diamond as a pad with a dashed outline, a scaffold of poles
  and rails at the corners (Allies yellow, Soviets red-brown; back sides before the building, front after), the structure's own model cut at a rising height (`buildSprite`,
  `BUILD_STEPS` 6 layers, made one at a time in the background by `pumpBuild`, warmed by `warmBuild` when an item is READY in the sidebar, dropped by `dropBuildSprites` after 30 s unused;
  not baked), welding sparks, dust at the corners, a white sheen at the end. Until a layer is made the finished sprite sinks into the pad, clipped to the footprint's front edges.
  Everything comes from `k`, the building's id and `G.t`: no state, no effects.

## Construction Yard crane (after 2026.11.17.2, not released, both modes, looks only)

- The tower crane's jib (both factions) is a turning part, `SPINNERS.cy` (models.js `towerJib`; only the cameo keeps it in the model).
  art.js `craneState` / `drawCraneHook` (kept by building id, never on the building): when its side places a structure within
  `CRANE_REACH` (16 cells), the jib swings to it (`CRANE_SPEED`), the hook (`CRANE_HOOK`) works up and down while it goes up, never
  into the yard's roof, an amber lamp blinks at the tip, and `CRANE_HOLD` (2 s) after the build-up it swings home (angle 0 = rest).

## Flags fly in the wind (after 2026.11.16, both modes, looks only)

- The modelled flags (Allied Ore Refinery, Allied and Soviet Outposts) keep only their poles in models.js; the cloth is drawn
  live by `drawFlag` (art.js) from `FLAG_SPOTS` (pole x, y, top, cloth length, height, Soviet star) in `drawStructure`. It
  streams downwind with `windNow()` (world.js), waves faster and harder in a gust, droops when the wind drops, and is
  foreshortened (never under 60% of its width) when the wind blows up or down the screen. The village garrison flags use it
  too. Sprites rebaked (the Allied refinery; Outposts are not in the sheets).
- **Banners** (Soviet Construction Yard, Refinery, Barracks, War Factory, Tech Center): `BANNERS` in models.js holds each one
  (`[x0, x1, face y, top, length]`); the models keep only the steel rod (`bannersV`) and `drawBanners` (art.js, from
  `drawStructure`) draws the cloth: its lower end swings sideways with the wind's east-west push, a ripple runs down it
  (faster in a gust), dark hem, gold star. Soviet sprites rebaked.

## Rain on Lakeside, lightning (after 2026.11.15.6, not released, both modes, looks and sound only)

- Lakeside has `weather: { kind: 'rain', chance: 0.5 }` (A Bridge Too Far and Twin Lakes still have none, owner's call).
- **Lightning** in any rain (`lightning`, `lightningAt` in art.js, from `drawWeather`): each second of battle clock rolls from the weather's
  seed, so every online phone flashes together; none under level 0.45, up to `LIGHTNING_RATE` (0.05 a second) in the heaviest rain. Every strike:
  a double screen flash (skipped with prefers-reduced-motion, `calmFlash`) and `thunder` (audio.js FX: crack and a 4 s rolling rumble on a looped
  noise source) 0.25 to 1.85 s later. No bolt is drawn for these.
- **Bolts that land** (owner's request, **both modes, gameplay**; world.js `lightningStrikes`, `boltStrike`, host only, so the server must run the
  same version): `BOLT_SHARE` (0.35) of strikes (the 4th number of `lightningAt`) come down as a visible bolt (the `bolt` effect, drawn in art.js
  `drawEffect`) on a random cell of dry land anywhere on the map, every cell as likely (owner: "anywhere on the map"); whatever is there takes it: a finished
  building of any side, a standing bridge span (only maps with `breakable` bridges have spans), a wood or open ground. 2,000 strikes on Lakeside at the start: even over the
  map's quarters (lakes aside), 0.2% buildings, 4% woods. It
  leaves an `expl` (size 12: the trees round it catch) and a scorch, and a fire in `G.bolts` (saved) that burns `BOLT_BURN` (10) s with flames
  and smoke; a building or span hit loses `BOLT_DMG` (10%) of its full health over the burn (`damage(.., 'GR', null)`: no attacker, no alarm).
  Checked: forced strikes every second for a minute (60 bolts, 40 trees burnt, no errors); a hit Construction Yard lost exactly 10% in 10 s.

## Stuck trucks and Outposts, defeated sides blow up (after 2026.11.15.5, not released, both modes)

- **Dock deadlock** (`dockProgress`, `DOCK_PATIENCE` 5 s, `DOCK_BAN` 8 s): a truck holding a refinery's dock claim but getting no nearer lost it to
  nobody and blocked the queue for minutes (Snowbound 2 v 2: 154 stuck-truck samples to 36). `findPath` returned the raw goal when start and the nearest
  open cell were the same cell, so a goal inside water or rock left a unit pushing at the shore for ever (computer Outposts on Twin Lakes, 195 samples to 11);
  it now returns that open cell. `aiDriveStalled` (ai.js): a driving Outpost or Construction Yard idle 20 s unpacks where it stands or picks a new goal.
  `node tools/sim/stuck.js <repo> [minutes] [map] [1v1|2v2]` lists units idle 20 s on an order.
- **Defeated sides** (`startWipe`, `tickWipe`, `t.wipe`): when a side goes `out`, each unit and building blows up at its own moment over 5 s. No survivors
  (`WIPING` stops crew, pilots and building escapees) and not counted in the debrief's losses. A beaten player's "Keep watching" sees the empty base.
  `node tools/sim/wipe-out.js <repo>`.

## Stuck-unit diagnostics (after 2026.11.15.6, not released, both modes)

- Owner's report (Twin Lakes 2 v 2, red attacked while they attacked, a computer side's army went to defend and sat shooting without moving, one soldier
  in the middle "walking" in place) could not be reproduced: 400 random long paths all arrive; a staged raid on one base had its ally's 58 defenders go out
  and none stick; a tight ball of 100 riflemen walks off, and 10 walkers leave a ball of 120 idle ones in 20 s; the squad gather (`aiPincer`) times out.
- So `stuckWatch` (world.js, every 15 s, host only): a computer ground unit with somewhere to go (hunt/attack/move, `assisting`, a path) that has not moved
  6 px in `STUCK_AFTER` (30 s) with nothing in weapon reach is written by `Report.oops('stuck1'..'stuck3', ...)`: at most 3 per match, 60 s apart. Query
  `select id, stats->'errors' from matches where stats->'errors' @> '[{"where":"stuck1"}]'`. The `stack` field holds JSON for up to 2 units: type, side, cell, order,
  `as` assisting, `df` defending, `sg` staged, `dest` (cells), `np` needPath, `pl`/`pi` path length and index, `sn` stuckN, `mv` moving, `tg` [target type, distance],
  `foe` enemy units within 8 cells, `fr` friends within 2, `pin` in a pincer squad. 12 minutes of a 2 v 2 on Twin Lakes: no reports (no false alarms).

## Stall recovery and squad leaders (after 2026.11.15.6, not released, both modes; ideas from OpenRA's bot)

- Compared with OpenRA's `SquadManagerBotModule` / `GroundStates` (bleed branch): theirs drops a squad's order after about 2.5 s without progress and picks a
  target again, keeps a squad round a leader (its slowest unit) and regroups strays on it, and sends defenders only from near the attack. Ours is stronger on
  strategy (flanks, foe scoring, counter-building), so only the first two were taken.
- **Stall recovery** (`stuckWatch`, `unstick`, `STUCK_AFTER` 10 s, checked every 5 s; every difficulty, host only): a computer ground unit with somewhere to go that has not
  moved 6 px, has nothing in weapon reach and is not waiting for a leader: the first stall clears its target and path and re-issues the order (`u.stallN` 1); the
  second sends it home (`scatterSpot`, staged) to rejoin the next wave. `stallN` goes back to 0 when it moves. The first 3 stalls of a match still go to `stats.errors`
  as `stuck1..3` (field `st` is the stall count). Wedged-unit test: re-picked at about 15 s, sent home at about 25 s.
- **Squad leader** (`aiLeader` in ai.js, called from `aiSquads` once a second, Normal and Hard only: Easy has no squads): the slowest unit (nearest the middle if several)
  leads. A unit more than `LEADER_R` (6) + 1.5 x sqrt(n) cells ahead of it toward the target holds still for 2.5 s at a time (`u.waitLeader`, read in `updateUnit`),
  at most `LEADER_MAX` 20 s, then goes on and is not held again for `LEADER_BAN` 30 s. Nothing holds once any unit of the squad has a target or was hit in the last 8 s.
  Measured (24 mixed units sent at an empty base on `bridge`): worst front-to-back stretch 988 to 646 px, the first arrival is slower, 24 of 24 arrived (22 without).
  12 min of a 2 v 2 on Twin Lakes and 8 min of a 3 v 3 on Snowbound: no errors, 32 s CPU for the 3 v 3.

## Path churn: the computer keeps its route (after 2026.11.15.6, not released, both modes)

- Found with the stall recovery on Twin Lakes 2 v 2 (a defender with a destination and no path, `need` true, place 37 of 108 in `G.pathQueue`): in a big fight the computer
  called `goTo` about 140 times a second (`defendBase` / `defendAllies` re-send every defender after a moving target each second), and every call threw away the unit's path and
  put it at the back of the queue, so units spent the time waiting for a route (waits up to 1.5 s, restarted each second). `goTo(u, x, y, force)` now keeps a computer unit's route
  (or its place in the queue) while the new goal is within `max(REROUTE_MIN 3 cells, REROUTE_FRAC 0.15 of the way left)` of the old one and the route is under `REROUTE_AGE` (4 s)
  old (`u.pathT`, set in `processPaths`), so walls, buildings and bridges that change are picked up. `force` (stuck units in `checkStuck`) always re-routes. Humans' orders are unchanged.
  Units waiting for a route per game: about 8,800 samples to 4,800 (3 runs each, 12 min, Twin Lakes 2 v 2); route searches a second in the fight 143 to 100.
- Open: a computer V2 Launcher wedged for 40 s inside its own walled base (path of 5 points, next point 25 px away, free cells around it); seen once in about ten 12-minute runs, the stall
  recovery cannot help (it was already heading for its scatter spot). Not reproduced a second time.
- **PR #11 (walls and gates, JGFortanelli) is merged into this branch** (merge commit). `tools/sim/walls.js` is flaky on its own, with or without this branch: 'a line of wire' fails about
  half the runs (placement depends on trees), 'hunters shoot a way through' 2 in 16.

## MG Team: heavy machine gun infantry (after 2026.11.16, not released, owner OK'd for both modes)

- `hmg` in UNIT_DEFS (both factions, Barracks, $400, 150 health, speed 26, sight 7, `r` 7): one unit drawn as two men. Allies carry an
  M2 .50 cal (low tripod), Soviets a DShK 12.7 mm (two-wheeled carriage, shield). Weapon: SA bursts of 6 x 12, range 150, splash 10,
  `air` + `heliOnly` (helicopters, not jets), sound `mg`.
- **Set up to fire** (`setup` 1.5 s, `pack` 1 s; `u.setup` 0 to 1, a plain synced and saved field): `setUpGun` (world.js) in `engage`
  before firing, and whenever it stands still with no target (it digs in on its own). `followPath` packs it up before it walks;
  `slideOut` is skipped once it has begun. Set up it takes `PRONE_COVER` damage (never goes prone) and `separate` hardly pushes it.
- Drawn by `hmgModel` (models.js; `stampModel` merges two `infModel` figures, internal types `hmgG` gunner and `hmgL` loader):
  frames 0 and walks carrying, 4 setting up or packing, 5/7 set up. art.js `drawUnit` picks by `u.setup`. Dies as two ragdolls.
  Sprites and ground rebaked. Field Manual entry; the computer trains some (`mgs` in ai.js: 12%, 30% against infantry).
- `node tools/sim/mg-team.js <repo>`: first shot after about 1.5-1.9 s, half damage set up, no movement while packing. Tuned with a
  staged fight: 2 set-up teams against 8 riflemen (equal cost) won 6 of 8 (100 health / 9 damage won 0 of 8).
- **Sound and smoke** (owner's request): `sound: 'hmg'` -> `weaponSound` plays `cal50` (Allies) or `dshk` (Soviets), recorded
  layers in audio.js `COMBO` (the `mg` clip pitched down to 0.62 / 0.72 under a short pitched-up `cannon` thump; the DShK adds the
  SKS crack), synthesised `FX.cal50` / `FX.dshk` if the recordings are missing. No new recordings, so CREDITS.md is unchanged.
  `fireWeapon` puffs light smoke from the muzzle every round and, 40% of rounds, a slower wisp off the hot barrel.
- Online: the server must run the same version.

## Computer personalities (after 2026.11.16.5, not released, Normal and Hard, both modes)

- Owner's report: on Normal every computer side attacked at the same moment. Measured (headless 2 v 2 on Twin Lakes): all four first
  waves at 724-725 s. Cause: `firstWave` is the same for every side, and by then each had ~92 units, past `ARMY_FULL`, which skipped the
  random `aiGap` timer; after that, waves went whenever the army refilled (6 of 7 before their timer), so the timer never mattered.
- **Timer fix (all styles):** a full army now halves what is left of the wait once (`team.fullCut`) instead of skipping it.
- **Styles** (`AI_STYLES`, `aiStyle`, `aiOf(team)` in ai.js): each computer side rolls `team.style` (rusher, turtle, raider, balanced) the first
  time it thinks (also a side the server hands over) and keeps it (saved). **A pick is completely random** (since 2026.11.17.14: `STYLE_DUP_CHANCE` 0.1 keeps a roll that matches an ally's style, else it is rolled again among the unused ones, so allies rarely share one); enemies may too.
  `aiOf(team)` is the difficulty's `ai` settings with the style applied (cached per difficulty and style); every team-scoped `G.diff.ai` in
  ai.js (and the air-strike gate in world.js `launchGroups`) reads it. Easy (no planner) has no styles. Hidden from players; Field Manual says they exist.
  Rusher: first wave -180 s, waves at 30% of the cap, waits x 0.6, 2 fewer defences, half the walls, one held house fewer.
  Turtle (owner: scout sooner, attack a bit earlier; 2 v 2 Twin Lakes: both turtles attacked by 16-18 min, before one never did in 24): +90 s (was +210), waves at 75%, waits x 1.2 (was 1.4); every style scouts from the difficulty's `firstWave`, 3 more defences, +1 Outpost gun, walls x 1.6, one more house, splits only from 18 / 30 units.
  Raider: waves at 40%, air strikes x 0.6 apart, splits from 8 (3 squads from 12, 75%), targets refineries, power and Outposts (x 1.5) and avoids guns more.
- Measured after (Normal, headless; scratch script, not in the repo): 1 v 1 first waves 915 / 1039 s; 2 v 2 first waves 597, 921, 1164, 1382 s
  (rusher, raider, turtle, turtle); 3 v 3 Lakeside 678 (rusher), 811, 832 (balanced), 956 (raider), 1010 (turtle). Allies' styles differed every run.
  Balanced's first wave is now 12:45-15:45 on Normal (was 12:00 exactly). The server must run the same version.

## Computer allies spread out, then gang up together (after 2026.11.17.1, not released, every difficulty, both modes)

- Owner's report (match 2d652450, Normal 2 v 2): both enemy computers attacked only them until beaten (the old `aiPickFoe` gave +0.5
  for a foe an ally was on). Now `aiPickFoe` (ai.js, every 30 s) has two phases per alliance. **Spread:** `aiSpreadPlan` gives each
  computer side (in side order) the nearest found enemy no earlier one has taken, so each player base gets its own attacker; an enemy
  whose base is still hidden is not counted, so two may share the one found meanwhile. **Gang:** once the alliance's computers have sent
  `SPREAD_WAVES` (3) waves each on average (`team.waves`; a turtle sends few, so the total counts), `aiGangPlan` rolls one enemy for the
  whole alliance at random, kept `GANG_HOLD` (360 s) or until beaten, in `G.gang[ally]` (plain data, saved). Owner's picks:
  **the leader** is more likely (weight 1 + strength / strongest's; strength = all armed units' and buildings' cost, not just what it has seen:
  20 extra Medium Tanks on one side made it 62% of picks), and **a breather**: a side that lost a Construction Yard in the last `BREATHER`
  (150 s, `team.cyLostT` set in `kill`) is not picked while anyone else can be, and a gang on it breaks up at the next look (within 30 s). Easy now spreads too (was nearest). Headless Normal 2 v 2 on Twin Lakes: four different targets until minute 28,
  then one alliance on one foe. The server must run the same version.
- **Scouting every base** (after 2026.11.17.18, both modes; the server must match; owner's match b76bd95e, 3 v 3: all three enemy computers attacked only him for 33 min,
  his allies lost no building): a computer stopped scouting at the first enemy base it found, and the spread / gang picks only count found bases, so an alliance
  that had found one player sent everything at that player. Now `aiLaunch` keeps one scout out (`aiScout(team, [], true)`: an idle staged unit, not one waiting
  for a wave; a lost one replaced at most every `SCOUT_AGAIN` 60 s) until every enemy base is found, waves going meanwhile; scouts skip allies' starts, and a
  scout leaving home goes to its k-th nearest start (k = its rank among its alliance's computers). Headless Normal 3 v 3 on Snowbound: before, all three of an
  alliance on side 0 from minute 10 to 14; after, every base found by minute 14 and each computer on its own foe.
- Match reports now record each side's `ally`, `style` and `waves` in `stats.teams` (and `style` in the server's `players`).
- Fire effects lifted past x < 0 picked `flameFrames[-n]` (art.js `drawEffect`): 631 draw errors in that match's last 80 s. Fixed.

## Turtles attack when stalled, more guns, ring their second base; computer army cap 100 (after 2026.11.17.9, not released, both modes)

- Owner's report (match 688f49e9, Normal 2 v 2 on Crossroads Village): the turtle had sent 0 waves at 21 minutes. It waits for `hold` (75%) of its
  army cap, and the player kept killing its units (185 lost), so it never got there; its army piled up by its outlying Barracks and War Factory.
- **Stall release** (`stallAfter` 240 s, `stallMin` 18 in `AI_STYLES.turtle`, `aiLaunch`): once the wave timer (`team.attackAt`) is 4 minutes past
  with no wave, a turtle goes with whatever has gathered if that is 18 units or more.
- **More anti-air** (owner): `aaAdd` 2 on both the starting count and the cap (`aa`, `aaMax` in `aiOf`): a Normal turtle 3 SAMs / AA Guns from the start, up to 5 once it sees aircraft; Hard 4 to 7.
- **More guns:** `defAdd` 3 to 5, and it tops them up from 800 credits (`defRich`; others 1,500). Second base: 4 guns (`guns2`; others 2).
- **Second base ring** (`ring2`): `aiRing` also plans `team.ring2` (`aiPlanRing(team, yard, at, reach)` round the buildings within 12 cells of the
  second yard, `yard` = its id, replanned for a new yard) once `aiBase2Next` wants nothing more there or `RING2_AFTER` (240 s) after the yard
  unpacked (`team.b2At`; one structure at a time shared with the main base is slow), after the main ring is paid for
  (`aiBuildRing` returns false when money runs short).
- **Army cap** (owner): `ARMY_UNITS` 80 to 100 (Easy, Hard), Normal `armyUnits` 90 to 100. Wave sizes that are shares of it grow with it.
- The server must run the same version.

## Turtles: bigger army, better defended; Tesla hits vehicles harder (after 2026.11.17.12, owner's picks for both modes; the server must match)

- **Turtle** (`AI_STYLES.turtle` in ai.js): timing unchanged (owner: not sooner, a bigger army instead): `armyMul` 1.3, its army cap is 130 units and 1.3 x the
  worth (`aiOf`); the extra 30 stay at home to defend (owner's pick): `aiLaunch` measures waves against the usual cap and never sends the newest `keep` units. Defences: `defAdd` 8 (was 5: about 3 more ground guns), `aaAdd` 4 (was 2: a Normal turtle
  5 anti-air from the start, up to 7), `guns2` 5 at a second base (was 4).
- **TESLA warhead** (Tesla Coil and Tesla Tank, data.js): light 1.0 to 1.2, heavy 0.9 to 1.3 (+40% against tanks; owner chose the Tesla Tank too). A Coil bolt does
  130 to a tank (was 90). `tesla-tank.js`: 201 damage to a Heavy Tank in 5 s (was 132). Headless 2 v 2 of Normal computers on Twin Lakes, 14 min: no errors.

## Computer base rings, breaching a long way round (after 2026.11.16.5, not released, Normal and Hard, both modes)

- Owner's pick (by personality): `aiRing` / `aiPlanRing` in ai.js. A turtle from minute 6, a balanced computer from minute 12 once it holds
  3,000 credits (with a War Factory) plans `team.ring` once (plain data, saved): a rectangle `RING_MARGIN` (3) cells round its main base's
  buildings (within 16 cells of its start), skipped past `RING_MAX` (200) cells. Sides facing the enemy first; each side's Gate first (middle
  cell nearest the side's middle with open ground in front and behind, `mids`), then Concrete runs either side of it, paid from what it holds
  above `RING_KEEP` (turtle 800, balanced 2,000), every 15 s. Ring builders lay no `aiWalls` short lines; rushers and raiders keep them.
  Cells it cannot wall (ore, water, rock, buildings, units standing there until they move) stay open, so most rings have a gap or two.
- **Breaching a long way round** (`wallInTheWay` in world.js, both modes, human Auto Attack and computer waves): besides a shut way, a way round
  longer than `BREACH_DETOUR` (1.6) x the way through enemy walls + `BREACH_SLACK` (12) cells counts as walled off (BFS steps of both floods).
- Measured (headless, Normal): 1 v 1 `bridge` turtle 70 pieces + 4 gates by minute 9, income unhurt; 2 v 2 `twinlakes` (2 turtles, 2 balanced)
  all four ringed by minute 14 (69-90 pieces). Staged: a turtle's ring (83 pieces, guns and units removed), 24 Soviet units on a human's Auto
  Attack outside it: 21 breaching at 20 s, 16 inside by 40 s, base gone by 120 s. `walls.js` passes. With computers alone, turtles and
  balanced sides attack little in 24 minutes (2 v 2: 0-3 waves each; turtles late to scout since they scout only after `firstWave`).

## Computer second bases (after 2026.11.16.5, not released, Normal and Hard, both modes)

- Owner's pick ("full expansion", by personality): `team.exp2` rolled once (`EXPAND_CHANCE` balanced 0.8, raider 0.8, turtle 0.5, rusher 0.25).
  From `EXPAND_FROM` (600 s), with its main yard standing (`aiMainYard`: a yard within `BASE2_SEP` 18 cells of its start), no second yard
  (`aiBase2`), MCV cost + 2,000 credits, not starved: it picks `aiExpandField` (richest field with 3,000+ ore on its own half, 20+ cells
  from its start, no yard of its own within 18 + r + 4, no known enemy building within 15), stores it in `team.expField` and buys an MCV
  (no queue jump; `EXPAND_RETRY` 300 s between tries). `aiDriveMcv`: an MCV built while the main yard stands has `u.expand` and unpacks
  at the field's home side (r + 4 cells out); otherwise it rebuilds at home as before.
- `aiBase2Next`: refinery, power, Barracks, gun, 2nd refinery, War Factory, 2nd gun, AA once it has seen aircraft (counted within 12 cells
  of the second yard; refineries still under `aiRefCap` + 1). In `aiThink` every other structure goes there (`team.alt2`); `team.buildAt`
  ({ id, type }) makes `aiFindSpot(team, type, at)` anchor on that yard. `aiFindSpot` otherwise anchors on the main yard.
- Headless (exp2 forced): 1 v 1 `bridge` both yards up at about 11-12 min, full second base by 18 min; 2 v 2 `twinlakes` 3 of 4 expanded
  (one found no field). A first version let an MCV whose field stopped qualifying unpack at home (a raider ended with 4 yards): fixed with `expField`.

## Rusher forward base (after 2026.11.17.12, owner's picks for both modes; the server must match)

- A rusher no longer builds the own-half second base (`EXPAND_CHANCE.rusher` 0). Once it has found an enemy base (`enemyBaseKnown`), with its main yard
  up, MCV cost + 1,000 credits and not starved, it buys an MCV for `aiForwardSpot` (ai.js): `FWD_DIST` (35) cells from the nearest known enemy building
  toward its own start (up to about 45 degrees either way), clear of every known enemy building by 31 cells and of known guns by their reach + `FWD_GUNS` (6),
  reachable by land (`walkDistances`), near ore preferred. `team.expField` gets `fwd: true`; `aiDriveMcv` drives to the spot itself; `aiBase2Next` builds power,
  Barracks, War Factory, a gun, a refinery only with ore within 10 cells, more guns, AA. New units come from the newest producer, so out of the forward base.
  Retries `EXPAND_RETRY` (300 s) after it is lost. Headless Normal 1 v 1 (rusher against balanced): `bridge` forward yard at 14 min, 31 cells from the nearest
  enemy building, rusher won at 26 min; `twinlakes` yard at 13-14 min, 43 cells off (it unpacked short of its spot), rusher won at 20 min.

## Computer allies answer calls later and from nearer (after 2026.11.15.7, not released, both modes)

- Owner's request: attacking one computer always brought the other's army at once. In `defendAllies` (world.js) a computer ally now sends only idle units within `AI_ALLY_REACH` (35 cells of the raiders, was 70)
  and only after the ally's base has been under attack for `AI_ALLY_DELAY` (10 s, `team.allyT`, a host timer cleared once the area is calm; units already assisting are not held). Humans' Ally button is unchanged.
  Checked headless (2 v 2 of computers, three raiders at one base): an ally 14 cells off answers between 9 and 13 s, one 67 cells off never comes; `ally-defend.js` unchanged.

## Defenders kept waiting for routes (after 2026.11.16.4, not released, both modes)

- Owner's report (Crossroads Village): units sent to defend an ally, or leaving the base on Auto Attack, stopped in a pile and moved again after a while.
  Cause: `defendAllies` / `defendBase` re-send `goTo` to every defender about once a second as the raider moves, and for a human's unit each call threw away
  its route and put it at the back of `G.pathQueue` (the computer's units already kept theirs). Staged (Village, 70 units sent to an ally, raiders arriving):
  30 to 46 units stood waiting for a route for about 26 s; now 0 to 9.
- `goTo(u, x, y, force, auto)`: `auto` (the game's own re-sends in `defendAllies` and `defendBase`) gives a human's unit the computer's route-keeping rule.
  Player orders still re-route at once. `processPaths` serves a human's unit first (within the first 64 queued) so a big computer wave cannot hold an army in the queue.
- Ruled out: the infantry lanes (100 units leaving a base on Village: biggest group within a cell 17.7 with lanes, 19.2 without) and the fight fan (`approachSpot`),
  which needs a target in sight. Not reproduced: a pile in front of the base after Auto Attack with no enemy in sight; a phone's slower route-finding is the guess.
- **Pile diagnostic** (`pileWatch` in world.js, every 5 s with `stuckWatch`, host only, reports only, both modes): 20+ of a human side's ground units with no target within 40 px, 70% not moving, some with a destination or waiting for a route, for 10 s.
  The first 3 a match (60 s apart) go to `stats.errors` as `pile1..3`; `stack` is JSON: `n`, `c` cell, `np` waiting for a route, `mv`, `dd`, `ord`, `ty`, `q` path queue length, `rock` blocked cells within 3 cells, `auto`, `assist`, `old`, `sn`.
  Query: `select id, stats->'errors' from matches where stats->'errors' @> '[{"where":"pile1"}]'`. Staged: a forced heap reports (all 23 waiting for a route); a 100-unit Auto Attack march and a defend-and-return of 70 units report nothing.
- The owner's piles were on Crossroads Village (2026.11.16.3), on the land strips between a lake and the village, which the lakes reaching the village (2026.11.16.3) funnel armies through; a Lakeside run with 150 units showed no heap.
- **The real cause of the piles: route corners** (after 2026.11.16.4, both modes). A column shares its route's corner points, and `followPath` needed a unit within 7 px of
  each before it turned, while `separate` keeps friends 1.4 radii apart: in a crowd units could not reach the point and milled round it, moving but going nowhere, until
  the others had gone (staged Auto Attack on Village: 11 of 24 piled units on one corner at 10-30 px, the pile in the same 2 cells for 10-15 s, on open ground). Now
  within `CORNER_R` (1.5 cells) of a corner a unit with a clear `los` to the next point takes the corner (`u.cornerT`, checked every 4 steps; netcore `SKIP`).
  100 units on Auto Attack with three computer sides marching, 75 s, 2 seeds: worst pile within 40 px 31-33 to 19-22, average 20 to 14, the army 56 to 74 cells out.
  `bunching.js` 4 x 90 s unchanged (3.32, 7.7% six or more, worst 10), `rally.js` and `village.js` pass. Slowing `findPath` to phone speed did not change the piles,
  so the route queue (above) was a smaller part of it.

## Defenders running back and forth (after 2026.11.17.4, not released, both modes; the server must match)

- Owner's screenshot (Crossroads Village, night): a computer side's units in a strip between woods by its Helipad and Tesla Coils, running back and
  forth; match a90f56b1 reported `stuck1..3` there (staged and assisting units, moving but no further on in 10 s, 17-25 friends within 2 cells).
- **Main cause:** `defendBase` gives a defender a raider up to 32 cells off every second; the unit's own look round (`updateUnit` think) dropped any
  target past 1.5 x sight (or far from its guard spot), took a nearer enemy and `engage` routed it there; next second the raider again. Each switch
  threw the route away, so defenders turned round every second. Now a target that is in `team.raiders` is kept by a `defending` unit (`told`).
  `flip.js`-style count (goTos alternating between defence and engage within 1.5 s, 20-min Normal 2 v 2s on Village): 8,464 to 2,007 and 15,160 to 1,240.
- **Crowds:** a unit that gets no nearer its next route point for `SQUEEZE_AFTER` (1.5 s) walks through its allies for `SQUEEZE_FOR` (3 s)
  (`u.prog`, `u.squeezeT`, skipped in `separate`; friends in its way are moved aside); a waiting unit (guard order) stuck within 4 cells of its spot
  settles where it is; a guard unit shoved off its spot does not walk back when a friend stands there now (`spotTaken`); `scatterSpot` only uses
  `roomyCell`s (3 x 3 free, not in a gap under 4 cells wide), so waiting units no longer park in the gaps between woods.
- `ally-defend.js`, `rally.js` pass; `bunching.js` 4 x 90 s: 3.28 average, 10% six or more, worst 9 (unchanged).

## Units sent to one spot get a cell each (after 2026.11.17.18, not released, both modes; the server must match)

- Owner's report (match b76bd95e, Frostlight 3 v 3, Normal): green (a balanced Allied computer) kept a pile of units by its Airfield; they walked into it,
  and Rocket Soldiers pushed out walked back in. Cause: defenders going back after a defence (`defendBase`, `defendAllies`) all had the same post, the
  rally point (hunting units pulled into a defence get `rallyPoint`), and `aiSquads` retreats, `aiScoutDone` and the wave gather (`aiGather`, random within
  1.5 cells) did the same. Now `spotDealer(team)` (world.js) gives each unit its own open cell round the point (flood over open ground, nearest first,
  skipping cells friends stand on or wait for; vehicles keep a cell clear round them). `aiPincer` counts a group there within `max(5, 2 + sqrt(n))` cells.
  Headless Frostlight 3 v 3 (sides styled as in that match, 22 min): green's 15-20-unit piles on its rally point (23 samples) to none.
  `ally-defend.js`, `rally.js` pass; `teams.js` 2 v 2 Twin Lakes 12 min, no errors.

## V2 rocket raised to fire (after 2026.11.16.4, not released, owner OK'd for both modes)

- The rocket lies flat on the truck's bed and is raised on its rail before it fires, like the MG Team's set-up: `setup: 1.5`, `pack: 1` on
  `v2rl` (data.js), the same `u.setup` field (0 to 1, synced and saved) and `setUpGun` in `engage`; `followPath` lowers it before the truck
  moves. It lowers on its own 3 s after its last target (`u.lowT`, a host timer in netcore `SKIP`). The MG-only parts stay infantry-only
  (digging in when idle, `PRONE_COVER`, the cameo scale). First shot 1.5 s after the order (was as soon as the truck faced the target).
- `v2Model(pal, loaded, up)` (models.js): the rail pivots on its rear end up to `V2_RAISE` (0.85 rad), with a ram; `V2_STEPS` (3) + 1 looks,
  keyed `'W' + key + loaded + step` in `hullSprite`, all baked (`looks` in bake-sprites.js and `warmSprites`). Sprites and ground key rebaked.
  The server must run the same version.

## War Factory door opens (contributor's change by JGFortanelli, not released, both modes)

- The door opens first, then the vehicle rolls out. `spawnUnit` for a ground unit from a War Factory sets `b.doorAt` (a plain
  field, saved and synced) and queues the vehicle in `G.doorQ` (plain data, saved); `updateDoors` (world.js, from `update`)
  makes it `DOOR_UP` (0.5 s) later with `spawnUnit(team, type, from)`. So a vehicle arrives 0.5 s after it is built (host only;
  the server must run the same version). A second vehicle while the door is up keeps it up (`doorOpen` gives where it is).
- The new vehicle carries `outT`, `outX`, `outY` (synced); art.js `drawUnit` draws it rolling from the doorway to where it
  stands and coming out of the dark over `EMERGE` (0.6 s), then calls `drawUnitBody`. The simulation's position is unchanged.
- `drawStructure` draws `factoryDoorSprite(faction, step)` (models.js `factoryDoor`, `DOOR_STEPS` 5) over the door: a shutter
  that rolls up over `DOOR_UP`, stays open `DOOR_HOLD` 1.4 s, rolls down over `DOOR_DOWN` 0.7 s, the dark hall below it.
  The structure's own model is unchanged.

## Bigger paratrooper drops, Airborne division, upgrades lost with the Tech Center (after 2026.11.17.12, not released, owner's picks for both modes; the server must match)

- `POWERS.para.squad` is 10 soldiers (was 7): Allies 7 Rifle + 3 Rocket, Soviets 5 Rifle + 3 Grenadier + 2 Rocket. `dropTroops` lands squads over 8
  on a 22 px ring (was 16) and staggers the chutes 0.14 s (was 0.18).
- **Airborne division** (`para2` in `UPGRADES`, both factions, $1500, 60 s): `launchPower` sends a second transport 70 px to one side and 50 px
  behind, dropping its own squad there: 20 soldiers a drop. The computer researches it like the others (ai.js).
- **Upgrades are lost with the last Tech Center** (owner's rule, replaces "kept for the battle"): `kill` clears `team.upgrades` when a side's last
  Tech Center is destroyed or sold ("Upgrades lost", text only). Queued Comanches / Tesla Tanks wait until re-researched; units already built stay.
  Field Manual updated; `comanche.js` checks the new rule.

## Close Air Support: A-10 Warthog / Su-25 Frogfoot (2026.11.17.18, owner's picks for both modes; the server must match)

- Three Tech Center upgrades in order (`UPGRADES` cas1 $2000 60 s, cas2 $3000 90 s, cas3 $4000 120 s; `needs` the tier before, `req: 'airfield'`, checked in
  `canResearch`; the upgrade card shows "Needs ..." while locked; `desc` may be per faction). cas1 adds the Airfield power `POWERS.cas` (240 s, `upgrade: 'cas1'`:
  `hasPower` gates the sidebar, charging and `powerReady`); cas2 / cas3 send 2 / 3 planes (`casPlanes`), 60 px to either side and 45 px behind the lead.
  Lost with the last Tech Center like every upgrade.
- Planes (`a10` Allies, `su25` Soviets via `CAS_PLANE`; scripted, 520 / 480 health, can be shot down): `updateCas` (world.js, from `updateFlight`). Each makes
  `passes` (2) runs over its spot: on the way in, from `msl.range` (560 px), `perPass` (2) long-range guided anti-tank missiles (AGM-65 Maverick / Kh-29L: `atgm: true`, HF 160 / 165, splash 26, speed 540; not rockets: see below) at vehicles in the area (`r` 150 px;
  `casPick`: heavy vehicles, other vehicles, defences, other buildings, infantry; a different one each where it can), then one gun run (`startStrafe` /
  `tickStrafe` with its own `gun`: 26 AT shells of 28-30, splash 11, walked 96 px) at the best target nearly dead ahead within 170 px; then `CAS_OUT` px on,
  turns (`flyJet`) and comes back; after the last run it flies off. Camouflaged Pillboxes not exposed and garrisoned soldiers are skipped.
- **ATGM missiles** (`w.atgm`, owner: they flew like rockets): `fireWeapon`'s bay branch launches them from a wing pylon 9 px out (left and right in turn), dropped clear for `BAY_DROP` (`dropStep`), then they climb and dive onto the target (`p.arc`, up to 46 px, added in `projH` so the guest and `ui.js` follow), 540 px/s, a long white contrail (life 2.2 s, every 0.02 s), drawn as a slim white body with a dark seeker and a bright motor (ui.js). The hit is `atgmBlast`: full damage to the target, a size-14 explosion with debris, smoke, a small shake, scorch and crater, splash half damage within 26 px, `houseBlast`. `cas.js` (Allies, 1 / 2 / 3 planes): 1,370 / 1,730 / 2,490 vehicle damage, 1 / 3 / 5 of 6 killed.
- Computer: researches the tiers like any upgrade (Normal and Hard); fires at the biggest seen group of 3+ enemy vehicles (`aiCasTarget`), else the thickest part of the base.
- Looks: `a10Model` / `su25Model` (models.js, sprite keys 'G' / 'U', not baked: scripted); power cameo. Sprites rebaked for the hash only. "Air support ready" is text only (no voice clip).
- `node tools/sim/cas.js <repo> [allies|soviets]`: rules, then 1 / 2 / 3 planes against 6 tanks + 3 riflemen in the open (Allies: 1,170 / 1,615 / 2,400 vehicle damage
  of 2,500, 0 / 3 / 4 of 6 killed), and 3 planes beside a SAM Site.

## Captured structures stop being attacked by the captor's side (bug fix, not released, both modes)

- Owner's report: an ally captured an enemy Tech Center while the owner's units were attacking it, and they destroyed it anyway. `captureBuilding` only stood
  down the old owner's units. Now every unit and gun no longer hostile to it drops it as a target; an attack order on it ends (a human side's unit holds where it
  stands, as when a target dies; a computer's goes back to hunting), and a shell or missile in flight does it no harm (`capturedFriend` in `updateProjectiles`
  and `atgmBlast`). Headless 2 v 2: before, 901 to 344 health in 15 s after the capture; after, no damage.

## Computer APCs bail out; bigger Close Air Support area (not released, owner's picks for both modes; the server must match)

- `aiApcs` (ai.js): each computer APC rolls `a.bail` once (`APC_BAIL` 0.5). One that rolled it, with soldiers aboard, below `APC_BAIL_HP` (35%) and hit in
  the last 2 s unloads them whatever it is doing (driving out, going home, defending); Engineer raids keep their own 40% drop. Before, it unloaded only below
  half health while attacking or defending. Headless: 23 of 40 rolled it, all unloaded at 30%, none at 60%, cargo out within 3 s.
- `POWERS.cas.r` (data.js) 150 to 225 px: the circle you pick with and the area the planes look for targets in (`casFoes`), and the computer's cluster count.

## Computer escape MCV to an ally's base (not released, owner's picks for both modes, every difficulty; the server must match)

- Owner's request: in a team game a computer that thinks it is about to be beaten builds an MCV and sends it to an ally's base to rebuild.
- `aiEvac` (ai.js, from `aiThink`): `team.evac` rolled once by personality (`EVAC_CHANCE`: turtle 0.7, balanced 0.5, raider 0.4, rusher 0.25; no style = balanced).
  Triggers once a battle (`team.evacDone`) when it has a yard, an ally with a yard (`alliesOf`, `aiAllyYard`), no MCV out or queued, a quarter of the MCV's cost (`EVAC_PAY`; it pays as it builds: first version waited for the full 2,500, which a
  losing computer never had, so none escaped in two 40-minute 2 v 2s), and either a yard
  below half health hit in the last `EVAC_HIT` (10) s, or at most `EVAC_LEFT` (40%) of its most buildings (`team.peakB`, 5+) left with `EVAC_FOES` (3) enemy
  ground units within `EVAC_NEAR` (14) cells of its yard. It picks the ally with the most buildings (`team.evacFor`), buys the MCV and moves it to the front of the queue.
- `aiDriveMcv` hands that MCV (`u.evac`, the ally's side) to `aiDriveEvac`: `EVAC_OFF` (8) cells from the ally's yard on the side away from the ally's enemy, further
  out and turned after each failed try; another ally if that one has lost its yard, home as usual if none has one. The new yard is a second base (`aiBase2`) while the
  home yard stands, and the only yard once it falls.
- `node tools/sim/evac.js <repo> [diff] [map] [seed]` (forced at 10 min, Normal 2 v 2 Twin Lakes): MCV out at 62 s, unpacked 8 cells from the ally's yard at 131 s,
  outpost, refinery, power and Barracks round it 2 min later.

## Computer comeback: sells off to rebuild its Ore Refinery and War Factory (after 2026.11.17.13, not released, Normal and Hard, both modes; the server must match)

- `aiRebuild` / `aiRebuildChain` (ai.js, from `aiThink`): a computer that once had a refinery (`team.hadRef`) or a War Factory (`team.hadFactory`), has none now, still has
  a Construction Yard and cannot pay for the missing chain (power if it has none, the refinery, then the War Factory) sells a building every 3 s (`sellStructure`; defences
  first, then the dearest of the rest, its Barracks, Helipads and Airfields only when nothing else is left; never the yard, power, refineries, Outposts or War Factories)
  until credits plus pending sales cover it, then builds the chain in that order before anything else (`team.rebuild`). The refinery brings a free Ore Truck.
  `node tools/sim/rebuild.js <repo> [diff] [factory|refinery|both]`: Normal, 0 credits, trucks gone at 10 min: factory back in 73 s, refinery 85 s, both 118 s.

## Turtles: a late big push and help for allies; refinery cap +1 (2026.11.17.18, owner's picks for both modes; the server must match)

- From the owner's 8 latest Normal wins (0 buildings lost in 5, enemy turtles sent no wave in 5 of 7 games, enemy computers mined about 60% of his ore).
- **Refinery cap** (`REF_CAP_OVER` 1 in ai.js `aiRefCap`): the computer may have one refinery more than the human sides' average.
- **Big push** (`pushEvery` 480, `pushMin` 12 in `AI_STYLES.turtle`, `aiLaunch`): at most 8 min after its last wave (or its first-wave time) a turtle goes
  with every unit gathered, its home reserve (`keep`) too, as a big wave (strike units), then digs in again. Normal turtle: first push about 21.5 min.
- **Answers its allies** (`allyReach` 120 cells, `allyDelay` 4 s, `allyNeed` 2.5 x the raiders' worth; world.js `defendAllies` reads them through `aiOf`,
  other styles keep `AI_ALLY_REACH` 35, `AI_ALLY_DELAY` 10, 1.5).
- Headless Normal 2 v 2 (balanced + rusher against two forced turtles, 28 min, 3 seeds on Twin Lakes / Lakeside): turtle waves at 1152-1633 s (pushes at 1290-1291),
  up to 28-136 turtle units at once defending an ally; no errors.

## Defences build in their own slot (not released, both modes; the server must match)

- Owner's request: a power plant and a Pillbox can be built at the same time. `catOf` (data.js) gives `defense: true` structures the category `'defense'`: `team.queues.defense` is a second single slot like `queues.structure` (`isBuildCat`), with its own progress, READY and placing (`placeStructure` picks the slot by type). Same Construction Yard boost. The computer does it too (`aiThink` places and starts per slot; `aiNextStructure(team, c, slot)` picks defences for the defence slot and everything else for the main slot, power first when a defence needs it; what is queued counts as built). Headless 1 v 1 `bridge`, 8 min: no errors, `rebuild.js` unchanged. `pendingStructure` (world.js) still gives either queued item. Old saves have no `queues.defense` (treated as empty).

## Smoother big fights: fixed simulation steps, tree blocks kept (after 2026.11.19, not released, both modes, performance only)

Owner's match ea39d315 (3 v 3, 40 min, a 120 Hz PC at 2560 x 1370): 117 fps early, 50 to 60 once 700+ units were out, and
20 to 37 frames over 50 ms a minute in the big fights (minutes 16, 17, 21, 22, 30).
- **Fixed steps** (`ui.js` frame, `STEP`, `Smooth`): the battle is stepped at 1/30 s whatever the screen's rate (the game server
  and the tests already were). Before, every frame ran `update(dt)`, and a step costs nearly the same however short, so a
  120 Hz screen did about 3 x the work: a 16-minute 3 v 3 on Lakeside cost 577 ms of CPU per game second at 120 steps a second,
  184 at 30 (Frostlight 744 against 243). Between steps `Smooth` draws units, shots and effects part of the way from where
  they were before the last step (x, y, headings turned the short way, height, roll, walk cycle, shots' and effects'
  progress) and `G.t` likewise, then puts every value back straight after `draw` (in a `finally`), so nothing else ever
  sees them. Moves of over 4 cells in a step are jumps and are not blended. Drawing is at most one step (33 ms) behind. Not
  for an online guest (`guestStep` glides its own copy). Checked: hashing every unit, shot and effect after each step and
  after each frame's drawing gives the same values (only the draw sort key `_key` differs).
- **Tree blocks** (`art.js` isoTreeBlocks, far views): blocks are made for up to `TREE_BLOCK_MS` (5 ms) a frame (at least 3,
  as before) and kept `TREE_BLOCK_KEEP` (30 s, was 5 s) up to twice the blocks a screen shows (at least 24), least recently
  used dropped first. The slowest frames of the match drew 2,000 to 3,500 trees one by one after a jump (minimap taps:
  up to 8 a minute), with 20 to 33 ms in `list`. Returning to a spot looked at in the last 30 s now uses the blocks at once
  (headless test: 4,000 to 7,000 trees one by one before, none after). Memory: a block is 640 x 640 (1.6 MB).

## Computer bases only where the army can get out; Close Air Support planes no longer circle at the map edge (not released, both modes)

- `aiOpenSite` (ai.js): a base spot must be reachable on the ground from the main yard (`walkDistances`) with at least `OPEN_MIN` of the
  11x11 cells round it drivable and connected. Used by `aiExpandField` (also: road at most twice the straight line plus 20 cells) and by the
  escape MCV's spot (`aiDriveEvac`, which tries nearby angles and distances for an open one). The forward base already checked reachability.
  (Not confirmed which of these built the base in the owner's snow-map screenshot, so all are covered.)
- Close Air Support (`updateCas`, world.js): a strike on an area near the map edge left the plane circling for ever, because `flyJet` pins it
  inside the world and the area ended up inside its turning circle. A turn that takes over `CAS_TURN_MAX` (6) seconds is given up and the plane leaves.
  Checked by flying an A-10 at three edge spots: before, two still flew after 90 s; after, all left.

## Ally picker was invisible (not released, team games, both modes)

- With 2+ allies the Ally button builds `#allyPick` (`allyPicker`, ui.js), but style.css only styled `#autoPick`, so the card was never shown and the button seemed to do nothing (owner, 3 v AI online). `#allyPick` now shares the overlay rules. With one ally the button still toggles at once.

## WebGL renderer (`src/gl.js`, from branch `claude/webgl`, merged into `claude/ts-look` 2026-11-20)

The whole battlefield is drawn by WebGL2 when it can; `?gl=off` (and no WebGL2, a lost context, or `GLR.paused`) draws
it the 2D way as before. Drawing only: rules, saves and online play do not change. The full history, measurements and
reasons are in `plans/webgl-renderer.md`; the short version:

- **How:** the ground is a mesh lifted by the hills (tiles as textures). From the ground to the HUD, ui.js draw draws
  into a stand-in for the view canvas (`GLR.listBegin`): pictures become quads (atlases, normal-map twins), solid
  rectangles, thin and thick straight lines, convex shapes and whole ellipses become coloured quads and triangles, big
  gradient fills are drawn small and stretched, and anything else (curves, clipped drawing, unusual blends) is cut out of
  a 2D layer into a per-frame atlas, in its place in the order. `GLR.listDepth` sets what is tested against the hills'
  depth. `GLR.listEnd` draws the scene (colour and normals), the light pass (the look's mood, the night, lights from
  `lookDayLights` / `nightLights`, the side of a picture or a hill facing a light lit more, the sun where it is in the
  day on day/night maps), then what goes over the light (lamps, weather, storms) and the HUD; `GLR.present` puts it on
  its own canvas (`#gl`) under the game's.
- **Switches:** `?gl=off` the 2D way; `?gl=flatlight` no normal-map lighting; `?gl=nosun` the baked sun; `?gl=normals`
  shows the normal maps; `?glstats` (or `#glstats`) a speed readout with a 2D / WebGL button.
- **Baked normal maps:** `tools/bake-normals.js <repo> [--check]` writes `normals/` in the sprite sheets' layout (team
  colours share one sheet; structures are left out while lookstructs.js redraws them). **Rebake after every
  `tools/bake-sprites.js`**, and after a change to gl.js `nrmPic` (`--check` says so). Releases publish `normals/` with
  `sprites/` (CLAUDE.md, Releasing step 4; tools/look/build-ts.sh copies it). Missing or stale, the game works them out
  in play (at most 3 ms a frame).
- **Do not change** `src/models.js` or `src/voxel.js` for it (the sprite bake's check hashes them): gl.js wraps
  `renderVox` and `sprite` to know which model a picture came from.
- **Checking:** `tools/look/gl-compare.js <repo> <prefix> <map> [fight|fightfx] [rain|snow]` draws one paused moment the 2D
  way and with WebGL (flat light, sun off: about 1-2% of pixels differ, the hills' sampling) and lit.
- **Phone:** the owner's iPhone: 60 fps zoomed all the way out at the start of a battle (16 before the zoomed-out fixes).
- **Crash guard and the Options switch (2026.11.20, a tester's RTX 5080 in the Windows app on Electron 33: placing a
  structure flashed the window black, no sound; `?gl=off` played).** `localStorage` `rh-gl-live` is set by `R.present`
  while WebGL draws on a visible page and cleared on `pagehide`, on the page being hidden and on a lost context. Found
  set at launch, the page died drawing with WebGL: `rh-gl` becomes `'off'` (the 2D way), `rh-gl-crash` keeps the time,
  `GLR.crashed` is true, the menu's **WebGL graphics** button says why, and match reports carry `frames.glCrash`.
  The button (`GLR.pref`) takes effect at the next launch. `?gl=off` still forces the 2D way for one load.
- The Windows app (`desktop/main.js`) loads the page again on `render-process-gone` (up to 3 times), so a crash comes
  back to the menu in the 2D way instead of a black window; Electron went from 33 to 45 in the same change (newer
  Chromium and ANGLE for new graphics cards). Checked under xvfb with Playwright's `_electron` and
  `forcefullyCrashRenderer()`.
- **The black box (2026.11.20.4; 2026.11.20.3 still went black on the RTX 5080).** `report.js` keeps a match's last
  moments in `localStorage` `rh-crumb` every second (`Report.crumb(what)` events: start, `placed <type>` from
  `placeStructure`, `gl ...` from gl.js (context lost or restored, a stage switched off, the first frame drawn), errors;
  plus `GLR.gpu` (the unmasked renderer string), quads, calls, heap, screen) with `open: true`, written `false` on
  `pagehide` and on the page being hidden. Found open at launch: `rpc/match_crash` (`supabase/schema.sql`) puts it in
  the match row as `stats.crash`. The Windows app logs `render-process-gone`, `child-process-gone` (GPU) and
  `unresponsive` to `userData/crash-log.json` with the exit code; `preload.js` gives the game `rhDesktop.crashLog()`
  (the log, emptied as read, the driver from `app.getGPUInfo('basic')`, Electron and Chrome versions), sent along.
  Query: `select started_at, stats->'crash' from matches where stats ? 'crash' order by started_at desc`.
  Tested with Playwright's `_electron` and `forcefullyCrashRenderer()`; route the Supabase host so no test rows land.
- **The crash itself (2026.11.20.5): a memory leak in WebGL frames.** The black box's report (crashed 41 s in, the page,
  exit code -36861, which is only "no crash handler") led to it: with WebGL the page grew ~100 KB a frame at 1280x720,
  linearly (476 -> 1495 MB in 220 s; 2D flat at ~400 MB). Chrome's memory-infra dump showed one growing `malloc`
  directMap block. Cause: `ui.js` draw never fills or clears the view canvas when WebGL draws the frame (`glWill`), yet a
  few things still draw on it, so Chrome kept every recorded command on that never-shown canvas. Fix: a full
  `clearRect` of it each WebGL frame (flat at ~450 MB over 4 min). At the tester's 3576x2022 and 115 fps it was
  hundreds of MB a second. Also: ground meshes in buffers made once (`meshOf`), `drawQuads` fills a kept buffer with
  `bufferSubData`. Finding a leak like it again: sample the renderer's RSS (`ps`) with WebGL on and `?gl=off`, then
  turn WebGL calls into no-ops one kind at a time (MB per 1000 frames), and dump `disabled-by-default-memory-infra`.

## Flat starting bases: low ground or a broad hilltop (2026-11-20, not released, both modes)

Owner: "The ai doesn't really know how to make walls with the hills in the base, I saw an ore factory in between the walls.
Let's make it so the starting bases are always flat either on low ground or they're starting on a huge hilltop."
- world.js `makeHeights`: the ground is level out to `BASE_FLAT` (21) cells from every start (a whole base and the computer's
  wall ring, `aiPlanRing`: buildings within 16 cells plus `RING_MARGIN` 3), easing into the hills over `BASE_EASE` (9). Before,
  only 8 cells were level (fading by 13): 20-65% of the ground within 16 cells of a start was off-level on most maps.
- All starts on a map alike (no side gets the high ground): low ground (0), or with `startHill: true` in `MAPS` a hilltop at
  `HG_MAX`, used only if every start is at least `BASE_FLAT` + 5 cells from water (heights fall to 0 at shores), else low.
  **Crossroads Village** is the hilltop map (water 27 cells from each start); every other map is low ground (water 10-19 cells
  from most starts, too close for a level hilltop).
- Hills left on land (cells over 3 px): Bridge 33% -> 8% (8 starts on a small map), River 45 -> 21, Snowbound 49 -> 35,
  Lakeside 43 -> 26, Twin Lakes 44 -> 21, Frostlight 51 -> 40, Village 51 -> 78 (the four hilltops).
- Baked grounds rebaked (hill shading). Saves keep the heights they were made with. Online: the server must be redeployed
  with it (heights are worked out on each copy).

## Map check: cliffs, routes, ore (2026-11-20, `tools/sim/map-check.js`)

Owner: "Check all the maps and make sure cliffs are correct and don't block off routes, make sure all the ore and gems are
fine." Every map (Bridge Crossing over several seeds) passes: every start reaches every other over open ground (Twin Lakes
also with its bridges down), none only through one-cell gaps; every ore and gem cell is open ground and reachable; each
start has an ore field 10-31 cells away. Open pockets nothing reaches are left as they are: forest corners (Bridge),
clearings behind trees at map edges (Frost, Lakes), a strip behind a creek loop and a cliff at Snowbound's west edge; none
holds ore or a start. Fixed (looks only, look.js cliffLookFor): the tall crags now agree with the rules cell by cell: rock
fades off ore and gem cells it reached (Twin Lakes 32,85, Snowbound 152,139) and off open cells it mostly covered (River
90,82, Snowbound 132,37), and a blocked cliff cell its rock hardly reached gets a boulder (River 105,86). Costs 16-42 ms
once a battle on a desktop. Rules, saves and online play unchanged.


## Freezes in the match report (after 2026.11.20, not released, both modes, reporting only)

Owner: the screen would not move for a few seconds at the start of a 3 v 3 on the phone (match 5e6aa20b, 2026.11.20, WebGL).
The report showed nothing: the minutes leave out gaps over a second (a pause looks the same) and nothing was noted while
the Deploying forces card held the battle. Now `stats.frames` also has `fz` (up to 8 frames that came 0.4 s or more after
the one before, also while loading, `st` 'load', or paused; not when the phone was locked or the app put away: `hidAt`;
each with the previous frame's simulation, drawing, ground, sprites made, other work, tiles finished, ground tiles still
missing, WebGL or not, and drawing by part when drawing took over 100 ms), `fzN` and `fzMs` (all of them), `load` (how
long the card held, `full`: LOAD_MAX ran out with the ground or sheets not ready) and `gl`; and `stats.map` the map id.
Headless (desktop CPU): Frostlight 3 v 3 at a phone's 440 x 894 x 3 runs out the 3 s card with ground still missing (as the
phone did: 21 frames with stand-in ground after the card); A Bridge Too Far once had a 750 ms frame under the card,
534 ms of it the ground. No freeze of seconds reproduced headless (SwiftShader WebGL is slow on every frame).

## Start-of-battle freezes on the iPhone with WebGL (2026.11.21.1, both modes, looks and reporting only)

Owner: "Started a new skirmish on mobile. Game was unresponsive for a few seconds and jumped around." Match f0ee3edc
(2026.11.21, Frostlight, iPhone 440 x 894, WebGL): 4 frames 2.7-4.1 s late in the first 2 s of the battle (14.3 s in all),
the game's own code ~3 ms in each, so the stall is in the graphics process. Match 75f2808a (2026.11.20.1, Frostlight, WebGL)
the same (4, 13.7 s); after them 59-60 fps. The Deploying card had given up at 3 s (`load.full`), so the battle ran and the
camera leapt after each freeze (a pan applies the finger's moves queued during the stall all at once). The shaders are tiny,
so it is probably not their compiling; not reproduced headless.
- **Card holds until smooth** (`ui.js` loading): after the sheets and ground are ready (or LOAD_MAX), it stays until
  `SETTLE_MS` (600 ms) has passed without a frame 250 ms late, at most `SETTLE_MAX` (20 s). Covers the screen, so no touches
  reach the camera. `frames.load.slow`: late frames under the card. Headless: a 3 s stall at 0.3 s held the battle at 0:00
  until 4.6 s, then it ran.
- **What the GPU got** (`gl.js` R.ev, wrapped gl calls; `report.js` glEv): each `fz` row has `ge` for the frame before the
  freeze: `tx`/`txMB` textures made, `up`/`upMB` uploads, `pg` programs linked, `fb` framebuffers/renderbuffers, `bl` blend
  states first used; and the **probe**: while the card is up and 5 s after (`GLR.probe`), gl.js `sync` reads one pixel after
  each stage so the page waits for the GPU there, and adds the ms waited: `wPre` (before this frame's drawing), `wFlush`
  (atlas uploads), `wScene`, `wLight`, `wOver`, `wPres`. A freeze in one of them shows in `drw` and that `w...`; a freeze
  in none happened after the frame was handed over (the compositor). Released to the owner's build as 2026.11.21.1. Query: `select started_at, stats->'frames'->'load', stats->'frames'->'fz' from matches order by started_at desc`.

## A paused battle is not redrawn under the menu (2026.11.21.2, both modes, looks and speed only)

Owner (iPhone, WebGL): "Even the menus have a delay." The menu is see-through, and the paused battle under it (and the
battle behind the start menu) was drawn in full every frame, WebGL light pass included. `ui.js` frame: with `G.paused`, the
menu shown and no online battle, the battle is drawn once and then kept on the screen (`stillKey`: screen size, DPR,
camera) until the menu closes or that key changes. Headless (SwiftShader, 440 x 894): the page under the menu went
from 16-24 frames a second to 60, no WebGL frames drawn; the battle still shows behind the menu, after a rotation too.

## Phones draw at 2x, not 3x (after 2026.11.20, not released, both modes, looks and heat only)

Owner: "while playing my phone is getting really hot"; picked "Draw at 2x on phones" (over a 30 fps battery saver). `ui.js`
layout: `DPR` is at most 2 on a touch screen (`(pointer: coarse)`), 3 elsewhere as before. An iPhone at 440 x 894 CSS px drew
the battle at 1320 x 2088 (2.76 MP, twice a frame with the WebGL light pass's normals); now 880 x 1392 (1.22 MP, 56% fewer).
Everything sized by `DPR` follows (view, WebGL canvas, radar, snapZ).

## Pop-in when jumping round the map with WebGL (after 2026.11.21.2, not released, both modes, looks and memory only)

Owner (iPhone): "Clicking around the map on my current mobile game causes a lot of the ground and textures to pop in."
- **Ground:** the 2D way had the blurred quarter-size preview as the stand-in and a fade (`GROUND_FADE`), but the WebGL
  ground (gl.js `R.ground`) showed the flat one-pixel-a-cell colours and snapped tiles in. Now `G.ground.gl` also gives
  `preview`, `pvN`, `pvHas`, `PV`, `fade`; gl.js uploads the preview as texture unit 4 (again when more is done, at most
  twice a second, and once complete) and the shader uses it where it was done (`uPvOn`), fading a tile in over it (`uFade`:
  from its first upload on screen, or art.js `t.born`). The few new uploads a frame left over go to painted tiles just off
  screen, so a scroll finds them on the GPU.
- **Crags** (look.js `cliffItems`): made on screen within `CLIFF_MS` (4 ms, at least 9) a frame, then those within
  `CLIFF_AHEAD` (320 px) of the screen; one made on screen fades in over `CLIFF_FADE` (250 ms). They were kept for the
  whole battle: every cliff cell of Snowbound is 16,365 pictures, ~172 MB (Lakes 88, Frostlight 59, River 43). A phone
  (`!GROUND_ROOMY`) now keeps `CLIFF_KEEP` (3500, ~35 MB), the least recently seen let go.
- Checked headless (SwiftShader, 440 x 894 touch, Snowbound, camera jumped to far corners): the first frame after a jump
  shows the preview instead of flat blocks; no errors.

## Cliffs block direct fire; no flame on the Soviet refinery (after 2026.11.21.2, not released)
- **Cliffs block fire (both modes; the server must match):** owner, 2026-11-21: "tanks/soldiers are shooting through cliffs".
  world.js `clearShot(a, t, w)`: the line from shooter to target (a structure: its nearest edge), checked every third of a cell,
  is blocked by a ridge cell of `G.cliff` (`ridgeCells`: a cliff cell with 2 or more cliff neighbours, so lone boulders do not
  block; cached per map). Lobbed rounds (`LOBBED`: artillery, V2, grenades) and anything to or from the air are never blocked.
  Used in `acquire` (blocked targets are skipped), `engage` (a unit that picked a target itself lets it go; one ordered to attack
  it, or after a structure, drives toward it until the line is clear: `u.round` keeps it going round when the way takes it out
  of reach), garrisoned soldiers and base defences (re-acquire when blocked). Only the layout maps have `G.cliff`.
  Headless check: tank 4 cells from a rifleman across a River ridge fired at 0.4 s before, never through it after.
- **Soviet Ore Refinery:** the flame on its corner flare stack (a glowing blob on a thin pipe, read as a stray fire on the
  roof) removed from the model and `tools/blender/refinery.py`; sprites and normal maps rebaked.

## Phone crash 17 minutes into a 3 v 3 (2026-11-21, not released, phones' memory, both modes)
Owner: "My phone game crashed, phone was also getting a little hot". Match cff0d72a (2026.11.21.2, Frostlight 3 v 3, iPhone
440 x 894, WebGL): the page died while open and on screen at 17:07 with 909 entities; 54-60 fps to the end (no slowdown first),
so most likely iOS ending the page for memory. After it, gl.js switches WebGL off by itself (`rh-gl-live`).
- Measured headless as an iPhone (UA, no deviceMemory, so not `GROUND_ROOMY`; 440 x 894, DPR 3, 3 v 3 Frostlight, camera
  jumping every 6 s; scratch script, not in tools/sim): at 18 min canvases ~107 MB (ground tiles ~45 MB, ~3,700 sprites made
  on the fly, mostly infantry frames in six colours, never let go: +2.5 MB a minute), WebGL textures ~160 MB (mostly the
  3 sprite atlases and their normal-map twins filling up to their cap, 33.5 MB a page), JS heap ~80 MB. No runaway leak found.
- Fixed on the way: gl.js `spriteTex` textures (pictures too big for the atlases) were never deleted; now freed after
  `TEX_IDLE` (600) frames unused. Little change in this test.
- **Owner picked "lighter memory on phones"** (not the 30 fps saver). Phones only (`!GROUND_ROOMY`):
  - ui.js `SPRITE_KEEP` (1500): sprites made in play (canvases; baked ImageBitmaps never) are let go least lately drawn first,
    none drawn in the last `SPRITE_IDLE` (10 s), checked every 120 frames (`trimSprites`, `sprite` wrapped to stamp use).
  - gl.js `ATL_N` 2 atlas pages on phones (3 elsewhere): 33.5 MB less.
  - gl.js (all devices): when every page was full and drawn from each frame none was ever emptied again, and every new
    picture got its own texture for the rest of the battle (634 at 18 min). Now `atlWipe` empties the page filled longest ago
    at the next frame's start. `TEX_IDLE` is 10 s. Counters `R.atlEmptied`, `R.atlFull`.
  - Same headless 3 v 3 at 18 min: textures 125 MB (was 160), 188 textures (634 with 2 pages before the wipe fix), sprites
    made in play trimmed back to about 1,500 (were 3,700 and rising), canvases 7,200 (were 9,900). No errors.

## Own units invisible after 2026.11.21.3; automatic resolution on phones (2026-11-21, not released, looks only, both modes)
- **Invisible units:** owner (Allies, resumed 3 v 3): "all of my units were invisible ... I could select them and my buildings
  and ally units and buildings were visible". The rebake for the refinery moved 456 sprites in `sprites/allies0.webp` (6-12 in
  the other sheets). Sheets were fetched by bare name, so a browser holding the old sheet image cut it with the new manifest's
  layout. Not reproduced headless (fresh caches). Fix (art.js): manifests fetched `cache: 'no-cache'`; each sheet asked for with
  its bake's hash (`sprites/x.webp?h=<hash>`, normals `?h=`, ground `?k=<key>.<code>`); sw.js falls back to a cached copy
  without the query when offline (`ignoreSearch`). The Windows app's protocol ignores the query.
- **Automatic resolution (phones only):** owner picked it after a hot iPhone fell to 15-19 fps late in a 3 v 3. ui.js
  `autoRes`: every `AUTO_WIN` (3 s) of running battle, if over `AUTO_SLOW` (25%) of frames came over `SLOW_MS` (45 ms) apart,
  `DPR_STEPS` 2 -> 1.5 -> 1; under `AUTO_OK` (3%) for `upWait` (20 s, doubling to 5 min if it has to step down again within
  30 s of stepping up) it steps back up. Low Power Mode's 30 fps (33 ms) does not count as slow. Each new battle starts at 2.
  Match report crumbs `res 1.5x (down, 40% slow)`. Headless: a 60 ms busy loop a frame took it 2 -> 1.5 -> 1; cheap frames
  again climbed back to 1.5 then 2 about 20 s apart.

## Street lamps only on roads and in villages; brighter days on day/night maps (2026-11-21, not released, looks only, both modes)
Owner: "It's just hard to tell when it's daylight. Also for all maps and all maps going forward. Can we remove street lights
away from bases? Unless the bases have a main road next to them? Street lights should only be on roads and villages".
- **Map lamps** (world.js `villageProps`, MAPS `lamps`): kept only in a village (a house within `LAMP_VILLAGE` 3 cells) or
  beside a dirt road (`LAMP_ROAD` 4), and in a base (within `LAMP_BASE` 16 cells of a spawn) only right at a road's edge
  (`LAMP_EDGE` 1.6). Frostlight 238 -> 220 (the 18 where the roads enter the bases); Crossroads Village keeps its 40.
  Applies to every map's lamp list, now and later. Old saves keep the lamps they had (G.props is saved).
- **Look-only lamps** (look.js `poolLampsFor`): the ring of 7 round each start position (every map) is gone; those beside
  `G.road` lines (the generated map) stay.
- **Daylight** (look.js `dayLift`, `DAY_LIFT`): on every map with `daynight` the mood's tint, shade and vignette are lighter
  by day and the grade nearer white (both renderers use lookMood); nights as before. Checked by screenshots at noon and
  midnight on Frostlight and Crossroads Village (WebGL).
