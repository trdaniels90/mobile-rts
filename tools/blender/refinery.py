"""Ore Refinery (Allied and Soviet), modelled in Blender and voxelized for the game.
python3 -I tools/blender/refinery.py <out_dir>
  ->  refinery_allies.js, refinery_soviets.js (builders for the BLENDER:refinery_* blocks in src/models.js, spliced with
      splice.py), the two .preview.js files for preview-structure.js, and refinery_*.blend.
Same 3 x 2 cell footprint as before (72 x 48 voxels, box -2..74 x -2..50, z 0..40). Trucks dock at the cell south of
the middle, so both models open their bay and hazard apron to the south (y = 48)."""
import math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from voxlib import Scene, greedy_boxes, emit

CONC, SEAM, ROOF, ROOFD, STEEL, IRON, GUN, BIB = '#a39e91', '#878275', '#77746a', '#67645b', '#7f8480', '#5b5d58', '#34362f', '#6e6352'
WALL, WALLD, ORE, ORED, OLIVE, GLASS, YEL, BLK = '#d6d3c9', '#b9b6ac', '#d2a62a', '#9a7414', '#56603b', '#35505f', '#d0a426', '#1c1c1a'
out = sys.argv[1]
os.makedirs(out, exist_ok=True)
BOX = (-2, -2, 74, 50, 40)


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


# ======================================================================== Soviet
v = Scene()
v.cube((36, 24, 0.5), (72, 48, 1), CONC, 'rough', name='slab')
v.cube((36, 24, 0.3), (74, 50, 0.6), BIB, 'rough', name='bib')
# the hall: a concrete block with a stepped plinth, pilasters, a tar roof and a main-colour parapet
v.cube((22, 24, 8.5), (40, 40, 15), CONC, 'rough', name='hall')
v.cube((22, 24, 2.0), (41, 41, 2), SEAM, 'rough', name='plinth')
for x in range(2, 43, 8):
    for y in (4, 44):
        v.cube((x, y, 8.5), (2.2, 1.4, 14), SEAM, 'rough', name='pilaster')
for y in range(4, 45, 8):
    for x in (2, 42):
        v.cube((x, y, 8.5), (1.4, 2.2, 14), SEAM, 'rough', name='pilaster_side')
v.cube((22, 24, 16.5), (40, 40, 1), ROOF, 'rough', name='roof')
for (cx, cy, sx, sy) in ((22, 4.5, 40, 1), (22, 43.5, 40, 1), (2.5, 24, 1, 40), (41.5, 24, 1, 40)):
    v.cube((cx, cy, 17.5), (sx, sy, 1), 'main', 'matte', name='parapet')
v.cube((22, 43.9, 15.8), (40, 1.2, 1.0), 'dark', 'matte', name='cornice')
# roof clutter: ventilators, a hatch and a transformer box
for x in (8, 15):
    v.cube((x, 38, 19), (4, 4, 3), STEEL, 'metal', name='vent')
    v.tube((x, 38, 20.5), (x, 38, 22), 2.4, IRON, 'metal', name='vent_cap', verts=12)
v.cube((10, 12, 19), (6, 8, 3), IRON, 'metal', name='hatch')
hopper(v, 31, 16, 17.5, OLIVE, 'hopper')
# front: roll-up bay door, window band, hazard apron
v.cube((36, 44.4, 6), (13, 1.0, 9.5), BLK, 'matte', name='bay_door')
for i in range(5):
    v.cube((36, 44.9, 2.6 + i * 1.9), (13, 0.4, 0.5), '#2c2c28', 'metal', name='bay_slat')
v.cube((36, 44.9, 11.8), (16, 1.6, 1.2), 'dark', 'matte', name='bay_lintel')
for i in range(5):
    v.cube((6 + i * 4.6, 44.5, 11), (3.6, 1.0, 3.4), GLASS, 'glass', name='window')
v.cube((36, 46.4, 12.6), (18, 3.4, 1.0), GUN, 'metal', name='canopy')
for x in (27.4, 44.6):
    v.cube((x, 47.6, 6.5), (1.2, 1.2, 11), IRON, 'metal', name='canopy_post')
apron(v, 28, 44, 'apron')
lamp(v, 3, 46, 'lamp_a')
lamp(v, 58, 46, 'lamp_b')
# the silos and their feed
silo(v, 52, 12, 7, 32, 25, 'silo1')
silo(v, 65, 22, 6, 26, 19, 'silo2')
conveyor(v, (36, 13.5, 20), (49, 13.5, 31), 'conveyor')
pipes(v, 42, 61, 30, 7, 'pipe')
v.tube((61, 30, 7), (61, 27.2, 7), 1.7, IRON, 'metal', name='pipe_flange', verts=12)
pipes(v, 4, 42, 2.4, 11.5, 'wallpipe')
vb = greedy_boxes(v.voxelize(*(BOX[:2] + BOX[2:4] + (BOX[4],))))
v.save_blend(os.path.join(out, 'refinery_soviets.blend'))
# decorations that follow the side's colours stay procedural (the same helpers as the other Soviet buildings)
soviet_extra = [
    "starTop(m, 13, 28, 7, pal.main);",
    "starFront(m, 15, 44, 4.5, 2.6, pal.main);",
    "bannerV(m, 4, 8, 44, 15, 7, pal);",
]

# ======================================================================== Allied
a = Scene()
a.cube((36, 24, 0.5), (72, 48, 1), '#b2ada1', 'rough', name='slab')
a.cube((36, 24, 0.3), (74, 50, 0.6), BIB, 'rough', name='bib')
# the hall: pale walls, a long glass band, flat roof with a deep team-colour fascia and a raised skylight monitor
a.cube((22, 24, 8.5), (40, 40, 15), WALL, 'matte', name='hall')
a.cube((22, 24, 1.8), (41, 41, 1.6), WALLD, 'matte', name='plinth')
for x in range(10, 41, 10):
    a.cube((x, 44.3, 8.5), (1.6, 0.9, 14), WALLD, 'matte', name='column')
for i in range(3):
    a.cube((8 + i * 10, 44.5, 10.4), (8, 0.8, 4.4), GLASS, 'glass', name='window')
a.cube((22, 24, 16.2), (41.4, 41.4, 0.9), 'dark', 'matte', name='fascia_low')
a.cube((22, 24, 17.1), (40.6, 40.6, 1.0), 'main', 'matte', name='fascia')
a.cube((22, 24, 17.5), (37.6, 37.6, 0.8), ROOF, 'rough', name='roof')
a.cube((12, 24, 19.0), (14, 20, 2.6), '#e9e6dc', 'matte', name='monitor')
a.cube((12, 24, 20.5), (15, 21, 0.6), 'main', 'matte', name='monitor_cap')
for i in range(4):
    a.cube((7 + i * 3.4, 14.0, 19.2), (2.4, 0.8, 1.6), GLASS, 'glass', name='monitor_glass')
# a roof dish
a.tube((14, 36, 17.8), (14, 36, 21.5), 0.9, STEEL, 'metal', name='dish_mast')
a.sphere((14, 36, 24.0), (3.6, 3.6, 1.6), '#e4e2d8', 'metal', rot=(0, -35, 0), name='dish')
a.tube((14, 36, 24.0), (16.6, 36, 27.2), 0.35, IRON, 'metal', name='dish_feed')
hopper(a, 31, 17, 17.9, STEEL, 'hopper')
# bay door and hazard apron
a.cube((36, 44.4, 6), (13, 1.0, 9.5), '#46484a', 'metal', name='bay_door')
for i in range(5):
    a.cube((36, 44.9, 2.6 + i * 1.9), (13, 0.4, 0.5), '#5b5d58', 'metal', name='bay_slat')
a.cube((36, 44.9, 11.6), (16, 1.6, 1.2), 'main', 'matte', name='bay_lintel')
a.cube((36, 46.4, 12.6), (18, 3.4, 1.0), WALL, 'matte', name='canopy')
for x in (27.4, 44.6):
    a.cube((x, 47.6, 6.5), (1.2, 1.2, 11), WALLD, 'matte', name='canopy_post')
apron(a, 28, 44, 'apron')
lamp(a, 3, 46, 'lamp_a')
lamp(a, 58, 46, 'lamp_b')
# two domed white storage tanks on a round pad, joined by pipes to the hall
a.tube((57, 24, 1), (57, 24, 1.8), 16, '#b2ada1', 'rough', name='tank_pad', verts=36)


def tank(s, x, y, r, h, tag):
    s.tube((x, y, 1.8), (x, y, h), r, '#e4e2d8', 'metal', name=tag, verts=28)
    s.tube((x, y, h - 7), (x, y, h - 3.8), r + 0.6, 'main', 'matte', name=tag + '_band', verts=28)
    for z in (6, 12):
        s.tube((x, y, z), (x, y, z + 0.7), r + 0.4, '#b9b6ac', 'rough', name=tag + '_ring', verts=28)
    s.sphere((x, y, h), (r, r, r * 0.55), '#cfd2cf', 'metal', name=tag + '_dome')
    s.tube((x, y, h + r * 0.45), (x, y, h + r * 0.45 + 2.4), 1.0, STEEL, 'metal', name=tag + '_vent')
    s.cube((x - r - 0.5, y, h / 2), (1.2, 1.6, h - 3), STEEL, 'metal', name=tag + '_ladder')


tank(a, 52, 15, 7, 28, 'tank1')
tank(a, 62, 33, 6.5, 22, 'tank2')
conveyor(a, (38, 16, 21), (47, 15, 29), 'conveyor')
pipes(a, 42, 56, 30, 7, 'pipe')
a.tube((56, 30, 7), (58, 31.6, 7), 1.6, IRON, 'metal', name='pipe_flange', verts=12)
pipes(a, 4, 42, 2.4, 11.5, 'wallpipe')
ab = greedy_boxes(a.voxelize(*(BOX[:2] + BOX[2:4] + (BOX[4],))))
a.save_blend(os.path.join(out, 'refinery_allies.blend'))
allied_extra = [
    "starFront(m, 16, 44, 4.5, 2.6, pal.main);",
    "bannerV(m, 4, 8, 44, 15, 7, pal);",
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
