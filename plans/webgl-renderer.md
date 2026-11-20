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

## Parity list (what the 2D renderer draws, to tick off)

Ground tiles and marks, hills, edge haze past the map, ore, shroud and fog of war, trees and their shadows, cliffs and their
shadows, structures (build-up, damage, doors, cranes, dishes, flags, banners, lamps), walls, houses, props, villagers, hens,
units (hulls, turrets, infantry poses, aircraft and their shadows), husks, bodies, effects, shots, the flame jet, the look's
smoke, blasts, steam, craters, tank tracks, light pools and lamp posts, ground dressing, water, weather, storms, fog, clouds,
day and night, selection and HUD bits, the placement ghost, the minimap (stays 2D).
