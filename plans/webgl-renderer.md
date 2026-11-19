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

## Parity list (what the 2D renderer draws, to tick off)

Ground tiles and marks, hills, edge haze past the map, ore, shroud and fog of war, trees and their shadows, cliffs and their
shadows, structures (build-up, damage, doors, cranes, dishes, flags, banners, lamps), walls, houses, props, villagers, hens,
units (hulls, turrets, infantry poses, aircraft and their shadows), husks, bodies, effects, shots, the flame jet, the look's
smoke, blasts, steam, craters, tank tracks, light pools and lamp posts, ground dressing, water, weather, storms, fog, clouds,
day and night, selection and HUD bits, the placement ghost, the minimap (stays 2D).
