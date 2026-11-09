"""Ore Refinery (Allied and Soviet), modelled in Blender and voxelized for the game.
python3 -I tools/blender/refinery.py <out_dir>
  ->  refinery_allies.js, refinery_soviets.js (builders for the BLENDER:refinery_* blocks in src/models.js, spliced with
      splice.py), the two .preview.js files for preview-structure.js, and refinery_*.blend.
Same 3 x 2 cell footprint as before (72 x 48 voxels, box -2..74 x -2..50, z 0..56). Trucks dock at the cell south of
the middle, so both models open their bay and hazard apron to the south (y = 48)."""
import math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from voxlib import Scene, greedy_boxes, emit

CONC, SEAM, ROOF, ROOFD, STEEL, IRON, GUN, BIB = '#a39e91', '#878275', '#77746a', '#67645b', '#7f8480', '#5b5d58', '#34362f', '#6e6352'
WALL, WALLD, ORE, ORED, OLIVE, GLASS, YEL, BLK = '#d6d3c9', '#b9b6ac', '#d2a62a', '#9a7414', '#56603b', '#35505f', '#d0a426', '#1c1c1a'
out = sys.argv[1]
os.makedirs(out, exist_ok=True)
BOX = (-2, -2, 74, 50, 56)


def silo(s, x, y, r, h, band_lo, tag):
    """A banded storage silo with a dome, seam rings, a ladder and a side-coloured band."""
    s.tube((x, y, 1), (x, y, h), r, CONC, 'rough', name=tag, verts=28)
    for z in range(6, h, 6):
        s.tube((x, y, z), (x, y, z + 0.8), r + 0.5, SEAM, 'rough', name=tag + '_ring', verts=28)
    s.tube((x, y, band_lo), (x, y, band_lo + 3.4), r + 0.7, 'main', 'matte', name=tag + '_band', verts=28)
    s.tube((x, y, 1), (x, y, 2.6), r + 1.2, SEAM, 'rough', name=tag + '_foot', verts=28)
    s.sphere((x, y, h), (r, r, 3.2), STEEL, 'metal', name=tag + '_dome')
    s.tube((x, y, h + 2.4), (x, y, h + 4.6), 1.1, STEEL, 'metal', name=tag + '_vent')
    s.cube((x, y + r + 0.6, h / 2), (1.4, 0.8, h - 3), IRON, 'metal', name=tag + '_ladder')


def hopper(s, cx, cy, z0, col, tag):
    """An ore intake funnel standing on the roof, brim full of ore."""
    oct_lo = [(cx + 5.5 * math.cos(a * math.pi / 4 + math.pi / 8), cy + 4.5 * math.sin(a * math.pi / 4 + math.pi / 8)) for a in range(8)]
    oct_hi = [(cx + 8.2 * math.cos(a * math.pi / 4 + math.pi / 8), cy + 6.6 * math.sin(a * math.pi / 4 + math.pi / 8)) for a in range(8)]
    s.prism(oct_lo, oct_hi, z0, z0 + 5.5, col, 'metal', name=tag)
    s.sphere((cx, cy, z0 + 5.0), (7.2, 5.8, 1.6), ORE, 'rough', name=tag + '_ore')
    s.sphere((cx - 1.5, cy + 1, z0 + 6.2), (3.4, 2.6, 1.2), ORED, 'rough', name=tag + '_ore2')
    s.tube((cx, cy, z0 + 4.4), (cx, cy, z0 + 5.4), 8.4, IRON, 'metal', name=tag + '_rim', verts=8, spin=22.5)


def conveyor(s, a, b, tag):
    """An inclined square housing on trestles from a to b."""
    s.tube(a, b, 2.3, STEEL, 'metal', name=tag, verts=4, spin=45)
    n = 3
    for i in range(1, n + 1):
        t = i / (n + 1)
        p = [a[k] + (b[k] - a[k]) * t for k in range(3)]
        s.tube((p[0], p[1] - 1.8, 1), (p[0], p[1] - 1.8, p[2] - 1.5), 0.8, IRON, 'metal', name=tag + '_leg', verts=6)
        s.tube((p[0], p[1] + 1.8, 1), (p[0], p[1] + 1.8, p[2] - 1.5), 0.8, IRON, 'metal', name=tag + '_leg', verts=6)


def pipes(s, x0, x1, y, z, tag):
    s.tube((x0, y, z), (x1, y, z), 1.2, STEEL, 'metal', name=tag, verts=14)
    for x in range(int(x0) + 6, int(x1), 12):
        s.tube((x, y, z - 1.4), (x, y, z + 1.4), 1.8, IRON, 'metal', name=tag + '_clamp', verts=14)


def apron(s, x0, x1, tag):
    """Hazard stripes on the dock apron (y 44..48) and a pair of bollards."""
    for i, x in enumerate(range(x0, x1, 2)):
        s.cube((x + 1, 46, 1.25), (2, 4, 0.5), YEL if i % 2 == 0 else BLK, 'matte', name=tag + '_stripe')
    for x in (x0 - 1.5, x1 + 1.5):
        s.tube((x, 46, 1), (x, 46, 4.2), 0.9, YEL, 'matte', name=tag + '_bollard', verts=10)


def lamp(s, x, y, tag):
    s.tube((x, y, 1), (x, y, 11), 0.5, IRON, 'metal', name=tag + '_pole', verts=8)
    s.cube((x, y, 11.4), (2.6, 1.4, 0.8), GUN, 'metal', name=tag + '_lamp')
    s.cube((x, y, 10.9), (2.0, 1.0, 0.3), '#ffe9a0', 'glow', name=tag + '_bulb')



def column(s, x, y, r, h, tag, bands=(10, 20, 30)):
    """A distillation column: slim tower, platform rings with rails, a side-coloured band, a domed top and a ladder cage."""
    s.tube((x, y, 1), (x, y, h), r, '#8c8f8b', 'metal', name=tag, verts=24)
    for z in bands:
        if z < h - 4:
            s.tube((x, y, z), (x, y, z + 0.7), r + 2.2, IRON, 'metal', name=tag + '_deck', verts=24)
            s.tube((x, y, z + 1.6), (x, y, z + 2.0), r + 2.2, STEEL, 'metal', name=tag + '_rail', verts=24)
    for z in range(5, h - 3, 7):
        s.tube((x, y, z), (x, y, z + 0.8), r + 0.5, SEAM, 'rough', name=tag + '_ring', verts=24)
    s.tube((x, y, h - 9), (x, y, h - 5.5), r + 0.7, 'main', 'matte', name=tag + '_band', verts=24)
    s.sphere((x, y, h), (r, r, r * 0.8), STEEL, 'metal', name=tag + '_dome')
    s.cube((x, y + r + 0.9, h / 2), (1.6, 1.0, h - 4), IRON, 'metal', name=tag + '_ladder')
    s.tube((x, y, 1), (x, y, 3), r + 1.5, SEAM, 'rough', name=tag + '_foot', verts=24)


# ======================================================================== Soviet
# Back (north): three distillation columns tied by a pipe bridge, a flare stack. Middle: a low hall carrying the ore
# hopper. East: a big spherical tank on legs, a bullet tank and a banded smokestack. South: the dock bay.
v = Scene()
v.cube((36, 24, 0.5), (72, 48, 1), CONC, 'rough', name='slab')
v.cube((36, 24, 0.3), (74, 50, 0.6), BIB, 'rough', name='bib')
v.cube((22, 33, 6.5), (40, 22, 11), CONC, 'rough', name='hall')
v.cube((22, 33, 2.0), (41, 23, 2), SEAM, 'rough', name='plinth')
for x in range(2, 43, 8):
    v.cube((x, 44, 6.5), (2.2, 1.4, 10), SEAM, 'rough', name='pilaster')
v.cube((22, 33, 12.5), (40, 22, 1), ROOF, 'rough', name='roof')
for (cx, cy, sx, sy) in ((22, 22.5, 40, 1), (22, 43.5, 40, 1), (2.5, 33, 1, 22), (41.5, 33, 1, 22)):
    v.cube((cx, cy, 13.5), (sx, sy, 1.2), 'main', 'matte', name='parapet')
v.cube((22, 43.9, 11.8), (40, 1.2, 1.0), 'dark', 'matte', name='cornice')
hopper(v, 13, 32, 13.4, OLIVE, 'hopper')
conveyor(v, (13, 27, 18), (10, 14, 24), 'conveyor')
for x in (30, 36):
    v.cube((x, 38, 15), (3.6, 3.6, 3.4), STEEL, 'metal', name='vent')
# front: bay, windows
v.cube((36, 44.4, 5.6), (13, 1.0, 9), BLK, 'matte', name='bay_door')
for i in range(5):
    v.cube((36, 44.9, 2.4 + i * 1.8), (13, 0.4, 0.5), '#2c2c28', 'metal', name='bay_slat')
v.cube((36, 44.9, 10.8), (16, 1.6, 1.2), 'dark', 'matte', name='bay_lintel')
for i in range(4):
    v.cube((20 + i * 3.8, 44.5, 8), (3.0, 1.0, 3.0), GLASS, 'glass', name='window')
v.cube((36, 46.4, 12), (18, 3.4, 1.0), GUN, 'metal', name='canopy')
for x in (27.4, 44.6):
    v.cube((x, 47.6, 6), (1.2, 1.2, 10), IRON, 'metal', name='canopy_post')
apron(v, 28, 44, 'apron')
lamp(v, 3, 46, 'lamp_a')
lamp(v, 58, 46, 'lamp_b')
# the columns, the pipe bridge between them and the flare
column(v, 10, 9, 4.5, 46, 'col1', (12, 24, 36))
column(v, 24, 9, 4.0, 40, 'col2', (12, 24, 32))
column(v, 37, 9, 3.5, 33, 'col3', (14, 26))
for z, y in ((29, 9), (21, 9.8), (16, 8.2)):
    v.tube((10, y, z), (37, y, z), 1.1, STEEL, 'metal', name='bridge', verts=12)
for x in (17, 30):
    v.cube((x, 9, 10), (1.2, 1.2, 18), IRON, 'metal', name='bridge_leg')
v.tube((4, 22, 1), (4, 22, 51), 0.9, IRON, 'metal', name='flare', verts=8)
v.tube((4, 22, 40), (4, 9, 40), 0.5, IRON, 'metal', name='flare_stay', verts=6)
v.tube((4, 22, 47), (4, 22, 51.2), 1.7, '#3a3a36', 'metal', name='flare_tip', verts=10)
v.sphere((4, 22, 53.4), (2.2, 2.2, 3.4), '#ff8a2a', 'glow', name='flare_flame')
v.sphere((4, 22, 55.0), (1.1, 1.1, 1.8), '#ffe08a', 'glow', name='flare_core')
# east: a big spherical tank on legs, a bullet tank, a banded smokestack
v.sphere((60, 14, 19), (10, 10, 10), '#9aa09c', 'metal', name='sphere_tank')
v.tube((60, 14, 19), (60, 14, 19.8), 10.4, 'main', 'matte', name='sphere_band', verts=32)
for k in range(6):
    a = k / 6 * math.tau + 0.3
    v.tube((60 + 7.4 * math.cos(a), 14 + 7.4 * math.sin(a), 1), (60 + 6.6 * math.cos(a), 14 + 6.6 * math.sin(a), 15), 0.9, IRON, 'metal', name='sphere_leg', verts=8)
v.tube((60, 14, 28.5), (60, 14, 32), 1.0, STEEL, 'metal', name='sphere_vent', verts=8)
v.tube((50, 36, 6.5), (68, 36, 6.5), 5.2, '#8c8f8b', 'metal', name='bullet', verts=20)
v.sphere((50, 36, 6.5), (3.2, 5.2, 5.2), '#8c8f8b', 'metal', name='bullet_end_a')
v.sphere((68, 36, 6.5), (3.2, 5.2, 5.2), '#8c8f8b', 'metal', name='bullet_end_b')
v.tube((58, 36, 6.5), (60, 36, 6.5), 5.6, 'main', 'matte', name='bullet_band', verts=20)
for x in (53, 65):
    v.cube((x, 36, 2.2), (2.4, 9, 2.4), IRON, 'metal', name='saddle')
v.tube((48, 27, 1), (48, 27, 38), 3.0, '#4a4743', 'rough', name='smokestack', verts=20)
for z in (26, 30, 34):
    v.tube((48, 27, z), (48, 27, z + 2.2), 3.25, 'main', 'matte', name='stack_band', verts=20)
v.tube((48, 27, 37.6), (48, 27, 38.8), 3.5, BLK, 'metal', name='stack_lip', verts=20)
pipes(v, 41, 55, 27, 8, 'pipe')
pipes(v, 4, 42, 21, 10.5, 'rackpipe')
v.tube((42, 27, 8), (60, 24, 8), 1.2, STEEL, 'metal', name='pipe_to_sphere', verts=12)
vb = greedy_boxes(v.voxelize(*BOX))
v.save_blend(os.path.join(out, 'refinery_soviets.blend'))
soviet_extra = [
    "starTop(m, 30, 33, 5, pal.main);",
    "starFront(m, 12, 44, 5, 2.6, pal.main);",
]

# ======================================================================== Allied
# A bright white campus: a tall control tower with a big dish, a blue sloped-roof hall, a glass-banded processing
# dome, a cluster of domed tanks. South: the dock bay.
a = Scene()
a.cube((36, 24, 0.5), (72, 48, 1), '#b2ada1', 'rough', name='slab')
a.cube((36, 24, 0.3), (74, 50, 0.6), BIB, 'rough', name='bib')
a.cube((24, 33, 6.5), (44, 22, 11), WALL, 'matte', name='hall')
a.cube((24, 33, 1.8), (45, 23, 1.6), WALLD, 'matte', name='plinth')
a.prism([(1, 21.5), (47, 21.5), (47, 44.5), (1, 44.5)], [(7, 27), (41, 27), (41, 38), (7, 38)], 12, 19, 'main', 'metal', name='roof')
a.cube((24, 32.5, 19.4), (34, 2.0, 1.0), 'light', 'metal', name='ridge')
for x in range(8, 42, 8):
    a.cube((x, 44.3, 6), (1.6, 0.9, 10), WALLD, 'matte', name='column')
for i in range(4):
    a.cube((8 + i * 8, 44.5, 8), (5.6, 0.8, 3.6), GLASS, 'glass', name='window')
hopper(a, 14, 33, 15, STEEL, 'hopper')
a.cube((36, 44.4, 5.6), (13, 1.0, 9), '#46484a', 'metal', name='bay_door')
for i in range(5):
    a.cube((36, 44.9, 2.4 + i * 1.8), (13, 0.4, 0.5), '#5b5d58', 'metal', name='bay_slat')
a.cube((36, 44.9, 10.8), (16, 1.6, 1.2), 'main', 'matte', name='bay_lintel')
a.cube((36, 46.4, 12), (18, 3.4, 1.0), WALL, 'matte', name='canopy')
for x in (27.4, 44.6):
    a.cube((x, 47.6, 6), (1.2, 1.2, 10), WALLD, 'matte', name='canopy_post')
apron(a, 28, 44, 'apron')
lamp(a, 3, 46, 'lamp_a')
lamp(a, 60, 46, 'lamp_b')
# control tower with a blue glass band and a big dish
a.cube((11, 11, 17), (13, 13, 34), WALL, 'matte', name='tower')
a.cube((11, 11, 1.6), (14.5, 14.5, 1.6), WALLD, 'matte', name='tower_plinth')
for z in (10, 18, 26):
    a.cube((11, 11, z), (13.8, 13.8, 4.0), GLASS, 'glass', name='tower_glass')
    a.cube((11, 11, z + 2.6), (14.6, 14.6, 1.0), 'main', 'matte', name='tower_slab')
a.cube((11, 11, 34.4), (15.4, 15.4, 1.6), 'main', 'matte', name='tower_cap')
a.cube((11, 11, 36), (9, 9, 2), WALL, 'matte', name='tower_top')
a.tube((11, 11, 36), (11, 11, 42), 0.8, STEEL, 'metal', name='dish_mast', verts=8)
a.sphere((11, 11, 44.4), (7.2, 7.2, 3.0), '#eceae0', 'metal', rot=(0, -30, 0), name='dish')
a.tube((11, 11, 44.4), (16, 11, 50.5), 0.5, IRON, 'metal', name='dish_feed', verts=6)
a.sphere((16.4, 11, 50.9), (1.0, 1.0, 1.0), '#ffe9a0', 'glow', name='dish_tip')
a.tube((17.5, 11, 24), (36, 11, 24), 1.2, STEEL, 'metal', name='skybridge', verts=12)
# a glass-banded dome over the processing floor, and domed tanks behind
a.tube((58, 32, 1), (58, 32, 2.2), 14.5, '#b2ada1', 'rough', name='dome_pad', verts=36)
a.sphere((58, 32, 2.2), (12, 12, 15), '#dfe3df', 'metal', name='dome')
a.tube((58, 32, 4), (58, 32, 6.4), 12.4, 'main', 'matte', name='dome_band_lo', verts=36)
a.tube((58, 32, 11), (58, 32, 12.4), 12.0, 'dark', 'matte', name='dome_band_mid', verts=36)
a.sphere((58, 32, 17.4), (3.6, 3.6, 3.0), '#eceae0', 'metal', name='dome_cap')
a.tube((58, 32, 19), (58, 32, 25), 0.7, STEEL, 'metal', name='dome_mast', verts=8)
a.cube((58, 19.8, 5), (5, 1.2, 7), '#46484a', 'metal', name='dome_door')


def tank(s, x, y, r, h, tag):
    s.tube((x, y, 1.8), (x, y, h), r, '#e4e2d8', 'metal', name=tag, verts=24)
    s.tube((x, y, h - 8), (x, y, h - 4.4), r + 0.7, 'main', 'matte', name=tag + '_band', verts=24)
    for z in (7, 14):
        s.tube((x, y, z), (x, y, z + 0.7), r + 0.4, '#b9b6ac', 'rough', name=tag + '_ring', verts=24)
    s.sphere((x, y, h), (r, r, r * 0.6), '#cfd2cf', 'metal', name=tag + '_dome')
    s.tube((x, y, h + r * 0.5), (x, y, h + r * 0.5 + 2.4), 0.9, STEEL, 'metal', name=tag + '_vent', verts=8)
    s.cube((x, y + r + 0.5, h / 2), (1.4, 1.0, h - 4), STEEL, 'metal', name=tag + '_ladder')


tank(a, 32, 9, 5.5, 34, 'tank1')
tank(a, 45, 9, 5.0, 28, 'tank2')
tank(a, 58, 9, 4.6, 22, 'tank3')
for x in (32, 45):
    a.tube((x + 3, 9, 21), (x + 10, 9, 21), 0.9, STEEL, 'metal', name='tank_link', verts=8)
conveyor(a, (14, 28, 20), (30, 12, 27), 'conveyor')
pipes(a, 4, 22, 21, 10.5, 'rackpipe')
ab = greedy_boxes(a.voxelize(*BOX))
a.save_blend(os.path.join(out, 'refinery_allies.blend'))
allied_extra = [
    "starFront(m, 12, 44, 5, 2.6, pal.main);",
]


def builder(boxes, extra):
    body = ['    ' + l for l in emit(boxes).split('\n')] + ['    ' + l for l in extra]
    return "    const m = new VModel(%d, %d, %d, %d, %d);\n%s\n    return m;\n" % (BOX + ('\n'.join(body),))


for name, boxes, extra, target in (('allies', ab, allied_extra, 'STRUCTURES_SHARED'), ('soviets', vb, soviet_extra, 'SOVIET')):
    b = builder(boxes, extra)
    with open(os.path.join(out, 'refinery_%s.js' % name), 'w') as f:
        f.write("// Generated by tools/blender/refinery.py (Blender model, voxelized)\n")
        f.write("  refinery(pal) {\n%s  },\n" % b)
    with open(os.path.join(out, 'refinery_%s.preview.js' % name), 'w') as f:
        f.write("%s.refinery = function (pal) {\n%s};\n" % (target, b))
    print(name, 'boxes', len(boxes))
