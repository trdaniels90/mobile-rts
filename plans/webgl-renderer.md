# Plan: a full WebGL renderer (branch `claude/webgl`)

Status: started 2026-11-19. Owner's picks: real-time lighting as in the demo (`tools/look/webgl-light.html`, video of
2026-11-19), done as a **full WebGL renderer** (not a lighting layer over the 2D canvas), on its own branch `claude/webgl`
made from `claude/ts-look` (take its changes in now and then: `git merge origin/claude/ts-look`). Drawing only: rules, saves
and online play do not change, so no mode question. It merges back into `claude/ts-look` once it draws everything the 2D
renderer does, at least as fast on a phone.

## Why a full renderer

- **Real lighting:** every pixel lit every frame from its surface direction (the voxel models' normals), by the sun, the
  map's mood, night and every fire, blast, lamp and window (the demo).
- **Depth instead of painter's tricks:** hills hiding units (the `occ` chunks redrawn over the sorted list), structures
  over units (`_key` nudges), crater dips and tall cliffs all come out of one depth buffer.
- **Speed:** the 2D path redraws hundreds of chunk images, pictures and particles a frame on the CPU; the GPU draws them in
  a few batched calls.

## Shape of it

- `src/gl.js` (new): the WebGL2 context on its own canvas under the 2D one, shaders, texture atlases, batches. `?gl=off`, a
  missing WebGL2 or a lost context: the 2D renderer exactly as now (kept until the GL one has proven itself on phones).
- **Space:** world (x, y) and a height h (view px up): screen = toView(x, y) - (0, h); depth from `viewDepth(x, y)` and h, so
  nearer things (further down the screen, higher up) win. Pictures stand upright (camera-facing quads) with per-pixel depth
  from their height map, so a tank on a hillside or in a crater meets the ground correctly.
- **Ground:** a mesh on the cell grid lifted by the drawn height (`gLift`), textured with the existing ground tiles
  (`makeGround`'s canvases, uploaded as they are painted; later painted on the GPU, `docs/webgl-ground.md`), marks layer on
  top, fog and shroud as a texture.
- **Pictures:** units, structures, trees, cliffs, walls, ore from texture atlases: colour + normal + height per pixel.
  `renderVox` gains a G-buffer output (as `gbuf` in the demo); baked sprite sheets need matching normal sheets (bake tool).
- **Effects:** shots, smoke, fire, blasts, debris, weather, water as instanced particles.
- **Lighting:** deferred: a G-buffer (colour, normal, position), then a light pass with the sun and mood (replacing
  `drawLook`), night (replacing `drawNight`) and a list of point lights from the battle (fires, blasts, lamps, windows,
  Tesla, muzzle flashes; defences none, owner's rule). Later maybe shadows from the strongest lights.
- **On top, still 2D:** selection brackets, health bars, labels, the placement grid, rally lines (a transparent overlay
  canvas: text and thin lines are easier there).

## Stages (each its own video for the owner, before/after with `?gl=off`)

1. **Core and ground.** gl.js; the ground mesh with hills, tiles as textures, the shroud; the 2D renderer draws everything
   else on a transparent canvas above it (a temporary hybrid). Check: the same picture as `?gl=off`, frame time.
2. **Pictures.** Units, structures, trees, cliffs, walls, ore in GL with depth; normal + height maps from renderVox at run
   time. The 2D canvas keeps only the HUD bits.
3. **Effects.** Shots, explosions, the look's smoke, blasts, debris, steam, weather, water, fog.
4. **Lighting.** The deferred light pass: sun, mood, night, point lights (the demo's look in the game).
5. **Finish.** Baked normal sheets, phone measurements (iPhone first), the missing pieces from the parity list, then merge
   into `claude/ts-look`.

## Progress

- **Stage 1 (2026-11-19): the ground in WebGL** (`src/gl.js`, `GLR.ground`, called from ui.js draw before the 2D ground).
  The tiles (`G.ground.gl`: a new accessor in art.js makeGround; tiles carry `ver`, bumped when painted or marked, so they
  are uploaded again) are textures (at most `TEX_MAX` 140, least recently drawn let go; up to 6 new uploads a frame, the
  stand-in until then), laid on a mesh every `GL_STEP` 16 world px lifted by `gLift(x, y, true)`, depth from viewDepth so a
  hill hides the ground behind it. The wrecks layer and the look's soft patches (soft-light, as hillPatch) in the shader.
  The finished ground is put into the 2D view canvas (`drawImage` of the GL canvas), so everything after it is unchanged;
  ore is drawn over it in 2D, and the hill chunks that hide units (`occs`) are still the 2D ones. Checked
  (`tools/look/gl-compare.js`): the same picture as `?gl=off` on Twin Lakes and River Crossing, no errors.
  **To measure on a phone:** copying the GL canvas into the 2D canvas can make the GPU wait (seen as "GPU stall due to
  ReadPixels" in headless Chromium's software GL, where the ground took 23-31 ms against 6-8 ms in 2D; not a real GPU). This
  hybrid is a step: from stage 2 the pictures move into WebGL and the 2D canvas only keeps the HUD bits on top.

- **Stage 2a (2026-11-19): the sorted list's pictures in WebGL** (`GLR.listBegin` / `listDepth` / `listEnd`, from ui.js
  draw). While the list draws, a stand-in for the view canvas (a Proxy over a 2D layer) records every drawImage as a quad,
  worked out exactly as art.js uprightCtx draws it (and trees' own sheared draw through `_rawDraw`), with its alpha and
  'lighter' adding; anything else (pixels, lines, paths, text, other blends) goes to the 2D layer. listEnd draws the quads in
  the list's order over the ground (one texture per picture, kept in a WeakMap; premultiplied alpha), each tested against
  the ground's depth at its sort key + a margin (structures 2, units 10, trees 14, cliffs 16 view px) without writing
  depth, then puts the GL canvas and the layer into the view canvas. The hill chunks redrawn over units (`reHill`) are not
  needed with it: the ground's depth hides what is behind a crest. Checked in one page, the same frame both ways
  (`GLR.paused`, `tools/look/gl-compare.js <repo> <prefix> <map> [fight]`): about 1% of pixels differ (texture sampling
  on the bent ground), Twin Lakes and a 9-minute River Crossing with about 700 pictures in WebGL, no errors.
  Known for now: the 2D layer's bits (flags, sparks, crane cables, the infantry's pixels drawn as rects) are over all the
  pictures, so one behind a unit shows through it; two copies of the GL canvas into 2D a frame (phone cost unknown).
  **Fixed 2026-11-20 (owner: "Fix the previous 2 things"):** (1) the 2D layer's bits are cut out of it, at the box each
  drawing call covers (paths, rects, text tracked through the stand-in), into a per-frame atlas (`ATLAS` 1024 px squares,
  big boxes in 512 px pieces) before the next picture or list item, and drawn as quads in their own place in the order:
  nothing shows through what stands in front of it. Blends WebGL does: source-over, lighter, multiply, screen (others go
  through the layer, counted in `GLR.unsupported`: none seen). (2) One copy a frame: the ground stays in the GL canvas,
  recording starts right after it (ore with depth, husks and bodies with depth, then the ground marks: tank tracks,
  shadows, fog sheets, craters, without depth), and listEnd puts the whole frame into the view once. Measured headless
  (software GL): the ground's lap 1-3 ms (was 23-35 ms with two copies); 1.0-1.5% of pixels differ, as before; up to 1,353
  quads a frame in a battle.
  **Next (2b):** normal and height maps for the pictures (renderVox's G-buffer output, and normal sheets for the baked
  sprites), atlases instead of a texture per picture.

- **Stage 2b (2026-11-20): atlases and normal maps.** Pictures up to `PIC_MAX` 400 px go into `ATL_N` 3 atlases of `ATL`
  2048 px (shelves, texSubImage2D into place; when all are full the least recently drawn is emptied and refilled as
  pictures are drawn); larger ones keep their own texture. Quads are drawn in runs of the same texture and blend, alpha per
  vertex: a Twin Lakes frame of about 1,200 quads in 19-20 calls (was one call a quad). Each atlas has a twin of the same
  layout for normal maps: red and green the surface's direction turned with the view (x right, y toward the camera), blue
  the height (3 per voxel), alpha 0 where there is none. `nrmPic` works one out from the picture's voxel model (the same
  projection, painter's order and size as voxel.js renderVox, the middle sample of each pixel, not averaged), at most
  `NRM_MS` 3 ms a frame, when a picture is first drawn. Which model a picture came from: gl.js wraps `renderVox` (every
  voxel picture: `img._vox`; its cast shadow `_shade`, flat, none needed) and `sprite` (baked sprites, tagged when first
  asked for). **models.js and voxel.js are not changed** (the baked sprites' check hashes them). `?gl=normals` shows the
  normal maps instead of the colours. Pictures not from a model (glows, flames, the 2D bits, lamp posts, cliffs' and
  tanks' tracks) have none: lit flat in stage 4. Checked: the same picture as the 2D way (1.4% of pixels, as before).

- **Stage 3 (2026-11-20): effects in WebGL** (owner: "Start stage 3"). The recording now runs past the list to the end of
  the aircraft (ui.js draw: `GLR.listEnd` after the birds), so the look's smoke, embers and fog over the units (look.js
  `lookSmoke`), the bigger blasts, steam and debris (lookfx.js `lookFxOver`), the haze past the map's edge, the flame jet,
  shots and tracers, the game's effects (explosions, smoke, fire, flak, sparks, bolts) and aircraft with their shadows are
  WebGL quads, and the frame is put into the view once after them. Shots, effects and the flame jet are tested against the
  ground's depth at their spot (+10 view px; the jet at its turret), so a hill in front hides them; smoke, the haze and
  aircraft are over everything (depth null), as in 2D. Two fixes in the recorder: (1) 2D bits drawn with a blend WebGL does
  (a glow drawn 'lighter', a 'screen' flash) are cut out with that blend, not as plain paint (the layer is cut whenever
  the blend changes; other blends still act on the layer as it is); (2) a picture stretched with smoothing on (the edge's
  haze) is sampled smooth (a LINEAR sampler for its run). Blasts keep their own 2D drawing code, so the owner's rules hold
  as before (overlapping blasts do not pile into white: same blend, same alpha; defences give off no light).
  Checked (`tools/look/gl-compare.js <repo> <prefix> bridge fightfx`, new: the camera on the most blasts and smoke, six
  blasts and fires set off there): 1.1% of pixels differ (the bent ground's sampling, as before), no page errors,
  `GLR.unsupported` empty; River Crossing after 9 minutes of fighting 0.9%. Counts: 960-1,610 quads a frame in 31-63 calls,
  11-26 of them cut-out 2D bits (`GLR.bits`). The effects are mostly pictures already (blast frames, puffs), so no particle
  batch is needed yet.
  **Left 2D for stage 4:** the weather (rain, snow) and the storms' darkening and lightning (lookstorm.js) are drawn on the
  screen canvas after `drawNight` / `drawLook`, at screen resolution; drawn in the view before them, rain would be darkened
  by the night and lose its screen-sharp lines. They move with the night and mood into the light pass (stage 4).
  HUD bits (brackets, bars, labels, rally lines, placement), the shroud and the minimap stay 2D on top, as planned.

- **Stage 4 (2026-11-20): the light pass, with the weather and storms** (owner: "start stage 4 and include the weather and
  storms in stage 4"). The ground and the pictures are drawn into the scene's framebuffer (gl.js `sceneFb`): colour, and a
  second layer with the pictures' normals (from the normal atlases; written only by pictures laid over, rgb 0 where there
  is none). The light pass (`lightPass`, shader FS3) then draws the scene into the canvas lit as the 2D way lit the screen
  after the view: look.js drawLook (the map's mood: saturation, grade, the low sun's soft-light gradient, haze, cloud
  shadows, the shade with holes, the glow, the pools by day, the vignette) and art.js drawNight (dusk's amber, the
  darkness with holes, the warm light), from the same light lists (new: `lookDayLights` and `nightLights`, split out of
  drawLook and drawNight, which use them as before) splatted with the same pictures into four half-size buffers: holes
  (red drawLook's, green the night's; dst x (1 - alpha), as destination-out), glow (MAX blend: each spot as bright as its
  brightest light, so overlapping blasts never pile up into white), the night's warm light (added), the pools (screened).
  Defences give off no light (the lists, unchanged).
  **New with WebGL:** where a picture has a normal map, the side facing a light gets more of it (up to x1.75) and the side
  turned away a little less (down to x0.7): the light's direction at a pixel is the slope of the light buffers, weighted by
  how clear it is, less on tops; on average as bright as 2D. `GLR.nrmK` (0.85; `?gl=flatlight` 0: flat, as 2D).
  Then what goes over the light is recorded through the same stand-in into the canvas (`L.over` from ui.js, in the view's
  pixels, k = 1): the lamps and beacons (drawLamps / drawLampsAlone), navigation lights, the AA searchlight, the pools by
  night, the storm's darkening, rain and snow (drawWeather) and lightning (lookstorm.js dark / flash); the screen pass in
  ui.js skips all of these when `GLR.lit`. The land past the map's edge is drawn into the scene too (depth 1: only where
  there is no ground), so it is lit.
  Changes from the 2D way, on purpose: the HUD bits and the shroud are drawn after the light (health bars and brackets no
  longer darkened at night or graded; unexplored ground stays black under haze); rain, snow and lamps are drawn in the
  view's pixels and scaled up with it (on a 3x phone rain streaks are about a third thicker, as pixel art like the rest).
  Checked (`tools/look/gl-compare.js`, now three shots: `_off` 2D, `_on` WebGL with flat light, `_lit` with the normal
  maps; a 6th argument `rain` / `snow` sets the weather): Twin Lakes 1.5% of pixels differ (flat) / 2.3% (lit); Village
  at night in rain after a 9-minute battle 1.3% / 1.6% (the rest is the rain's streaks); Bridge blasts and smoke
  1.4-2.1% / 2.2-2.6% (blasts' own flicker between shots); no errors, `GLR.unsupported` empty. Counts: 950-1,220 quads
  in the scene, 250-365 light splats into the buffers, 90-125 quads over the light, 35-95 draw calls a frame.
  **Next (stage 5):** the sun per pixel would need unlit colours (the voxel pictures are lit by renderVox, so N.L from the
  sun on top would light them twice); ground normals from the hills; measurements on a phone; then merge into
  `claude/ts-look`.

## Parity list (what the 2D renderer draws, to tick off)

Ground tiles and marks, hills, edge haze past the map, ore, shroud and fog of war, trees and their shadows, cliffs and their
shadows, structures (build-up, damage, doors, cranes, dishes, flags, banners, lamps), walls, houses, props, villagers, hens,
units (hulls, turrets, infantry poses, aircraft and their shadows), husks, bodies, effects, shots, the flame jet, the look's
smoke, blasts, steam, craters, tank tracks, light pools and lamp posts, ground dressing, water, weather, storms, fog, clouds,
day and night, selection and HUD bits, the placement ghost, the minimap (stays 2D).
