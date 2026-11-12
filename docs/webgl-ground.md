# Plan: the ground on the GPU (WebGL)

Status: proposal, not started. Written 2026-11-12. Visual only, the same in single player and online.

## Why

Since 2026.11.12 the ground is painted in 256 px tiles as they come into view (`makeGround`, `groundPainter`,
`groundWorkers` in `src/art.js`). That solved the size and memory limits (iOS will not make a canvas over 4096 px a
side; Snowbound is 210 cells x 24 px = 5,040 px), but painting and finishing tiles costs CPU during the battle, and
testers report lag.

Every pixel of the ground is already worked out from its position alone (the `speck` hash, noise grids from the map's
seed). That is exactly how a GPU shader works, so the GPU can paint a tile in well under a millisecond instead of
the tens of milliseconds a worker spends on `groundPixels`.

**First check the cause.** The one iPhone report with frame figures (match 8f2b3d32, 2026.11.12.3) averages 59-60 fps
with about 3 ms of work a frame; the lag is single stutters (13 frames over 100 ms in minute 10, worst 475 ms), and
minutes with tiles still painting barely stuttered. Other suspects are unit and building pictures rendered the first
time they are needed (`renderVox` through `spriteCache2`), garbage collection with 500+ units, and marks being
finished onto tiles. The stutter check (time per part in every frame over 100 ms, in `stats.frames`) should show
whether the ground is the main cause before this work starts. If it is not, fix the real cause first.

## The idea in one paragraph

Keep `makeGround`'s design (tiles, the marks index, least recently seen tiles let go, the same `G.ground` interface)
and change only who paints a tile: a WebGL2 shader renders the ground into a GPU texture, then bridges, scenery and
marks are stamped on as textured quads. A tile is ready the same frame it is asked for, so nothing paints during play
in the background and the minimap-colour stand-in should never show.

## What stays the same

- The look: the art is pixel art drawn at one pixel per world pixel into the `view` canvas, then scaled up
  (`draw` in `ui.js`). The GL ground renders at the same one pixel per world pixel, so nothing gets softer or sharper.
- `G.marks` and `MARK_FNS`: marks are still data, drawn in order, deterministic from their arguments. Saves and online
  play are untouched (the game server records no marks and never draws).
- `G.ground.update(...)` and `G.ground.draw(g, layer, ...)`: callers in `ui.js` do not change.
- The current CPU tiles stay as the fallback: no WebGL2 (old devices), the context is lost, or `HEADLESS`.

## How it is built

### 1. The ground shader (the main work)

Port `groundPixels` (`src/art.js`) to a WebGL2 fragment shader. Its inputs become textures, made once per battle after
`setMapSize`:

| Today (CPU) | On the GPU |
|---|---|
| Per-cell fields (`dirt`, `water`, `ford`, cliffs, terrain), sampled bilinearly | `MAP x MAP` textures with linear filtering (or bilinear done by hand in the shader, to match exactly) |
| Noise grids from `rng(seed)` (`grid(s)`, `noise`) | Small float textures, the same numbers uploaded |
| `GRASS_TILE` (128 x 128 blade pattern) | A 128 x 128 texture, repeating |
| Palettes (`GRASS`, `EARTH`, `SANDS`, `WATER`, snow variants) | Uniforms |
| `speck(x, y)` integer hash | The same hash in GLSL with `uint` maths (WebGL2 only) |
| Road ruts (`paintRuts`) | Per tile, the road segments that reach it as a uniform array; the shader tests each pixel against them |
| Cliffs (`paintCliffs`: height field from cliff cells, shaded by slope) | A cliff-height texture per cell, shaded per pixel in the shader |
| Ford stones (`fordStone`) | The same function in GLSL |

Use `highp` floats and integer pixel positions everywhere (phone GPUs lose precision far from the map's corner).
Expect small colour differences from the CPU version (rounding), not a different look.

### 2. Tiles on the GPU

- Each tile is a 256 x 256 texture with a framebuffer (two per tile: ground and the wrecks layer `'d'`, the second only
  when a mark needs it, as now). A tile is about 256 KB of GPU memory; the GPU shares the phone's memory, so keep the
  cache small: the view plus one ring of tiles is enough when painting is this fast.
- Painting a tile: one shader pass for the ground, then bridges and scenery stamps (from `groundPainter`'s `prepare`:
  bridge pictures and scenery sprites uploaded once as textures), then its marks in order.
- Marks: keep drawing each mark once into a scratch picture with the existing 2D functions (that is already how
  marks are kept identical across tile edges), upload it as a texture, and stamp it onto every tile it reaches. All of
  `scorch`, `crater`, `bakeWreck`, `bibDecal` and the rest are reused unchanged. A busy tile with hundreds of marks
  is hundreds of quads: a fraction of a millisecond.
- The workers (`groundWorkers`) are no longer needed on devices with WebGL2.

### 3. Getting the GL picture on screen

Two options; try the first, measure on an iPhone, and fall back to the second if it is slow.

1. **Copy into the view canvas.** `G.ground.draw` does `v.drawImage(glCanvas, ...)` for each layer. No change to how
   the screen is put together. Risk: Safari may stall copying a WebGL canvas into a 2D one.
2. **Stack the canvases.** The GL canvas sits under the screen canvas; the 2D `view` is cleared transparent instead
   of black, and the GL canvas draws the ground and the wrecks layer for the same camera. The ore is then drawn by
   GL too (or the wrecks layer is drawn after ore in the 2D view as now), so the order stays ground, ore, wrecks,
   units.

### 4. Things to handle

- **Lost context:** iOS can drop the GPU context when the app goes to the background. Listen for `webglcontextlost` and
  `webglcontextrestored`, then rebuild the textures and repaint tiles (everything comes from data, so nothing is lost).
- **Old saves** (`legacy` ground pictures): keep using the CPU path for those games.
- **Weather** (`drawWeather`) stays 2D on the screen canvas.

## Steps and tests

| Step | What | Check |
|---|---|---|
| 0 | Stutter check in the frame reports | A couple of real iPhone battles say the ground is a main cause |
| 1 | Shader for the base ground (no ruts, cliffs or fords) behind a flag (`?ground=gl`) | Side by side with CPU tiles in headless Chromium (it has WebGL2 through SwiftShader): differences of a few levels per colour at most |
| 2 | Ruts, cliffs, fords, snow theme, bridges and scenery | `tools/sim/ground-tiles.js` extended to compare GL and CPU tiles on every map |
| 3 | Marks stamped onto GPU tiles | Live vs repainted tiles identical; save and continue identical |
| 4 | Screen output (option 1, then 2 if needed), lost context | A real iPhone on Snowbound 3 v 3: frame reports show `wait` at 0 and fewer long frames |
| 5 | On by default where WebGL2 works; CPU tiles kept as fallback | Release notes, `CLAUDE.md` section updated |

Rough size: two or three sessions. Step 1 is the riskiest (matching the look); steps 3 to 5 reuse most of today's code.

## Later, once this is in

- **Burning trees:** scenery is baked into tiles now (`decorate`). Drawing trees as their own sprites each frame on the
  GPU would let a tree change to burning, then burnt, cheaply. That needs tree state in `G` (saved; sent online by the
  host), and a decision on whether fire affects gameplay (ask which mode).
- Ore and gems drawn by the GPU, if ore drawing shows up in the frame figures on big maps.
