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



# ======================================================================== Soviet
# Heavy industry: a wide dark smelter hall under a sawtooth roof, fat brick chimneys breathing smoke, an inclined ore
# conveyor from a heap on the east side, a flare stack. Squat, grimy, asymmetric; no tall slim towers.
BRICK, DCONC = '#8b4535', '#7d786d'
v = Scene()
v.cube((36, 24, 0.5), (72, 48, 1), '#8a8579', 'rough', name='slab')
v.cube((36, 24, 0.3), (74, 50, 0.6), BIB, 'rough', name='bib')
v.cube((24, 28, 8), (44, 32, 14), DCONC, 'rough', name='hall')
v.cube((24, 28, 2.0), (45, 33, 2), SEAM, 'rough', name='plinth')
for x in range(2, 47, 8):
    v.cube((x, 44, 8), (2.4, 1.6, 13), SEAM, 'rough', name='buttress_front')
for y in range(12, 45, 8):
    v.cube((46, y, 8), (1.6, 2.4, 13), SEAM, 'rough', name='buttress_east')
v.cube((24, 43.8, 14.4), (44, 1.6, 1.2), 'main', 'matte', name='cornice')
for k in range(4):                              # sawtooth roof: glass faces north, sloped steel faces south
    y0 = 12 + 8 * k
    v.prism([(2, y0), (46, y0), (46, y0 + 8), (2, y0 + 8)], [(2, y0), (46, y0), (46, y0 + 1.2), (2, y0 + 1.2)], 15, 21, ROOFD, 'metal', name='tooth')
    v.cube((24, y0 - 0.25, 18), (43.6, 0.6, 5.4), GLASS, 'glass', name='tooth_glass')
    v.cube((24, y0 + 0.4, 21.3), (44, 1.6, 0.6), 'main', 'matte', name='tooth_cap')
v.cube((36, 44.4, 5.6), (13, 1.0, 9), BLK, 'matte', name='bay_door')
for i in range(5):
    v.cube((36, 44.9, 2.4 + i * 1.8), (13, 0.4, 0.5), '#2c2c28', 'metal', name='bay_slat')
v.cube((36, 44.9, 10.8), (16, 1.6, 1.2), 'dark', 'matte', name='bay_lintel')
for x in (18, 22.5, 27):                         # lit furnace slits on the front
    v.cube((x, 44.5, 6), (3, 1.0, 4), '#ffb040', 'glow', name='furnace_slit')
    v.cube((x, 44.3, 8.4), (4, 1.4, 0.8), BLK, 'metal', name='furnace_hood')
v.cube((36, 46.6, 12), (18, 3.4, 1.0), GUN, 'metal', name='canopy')
for x in (27.4, 44.6):
    v.cube((x, 47.6, 6), (1.2, 1.2, 10), IRON, 'metal', name='canopy_post')
apron(v, 28, 44, 'apron')
lamp(v, 3, 46, 'lamp_a')
# chimneys with smoke
for (x, y, r, h, tag) in ((54, 12, 5.0, 50, 'chim1'), (66, 14, 4.0, 42, 'chim2')):
    v.tube((x, y, 1), (x, y, h), r, BRICK, 'rough', name=tag, verts=24)
    v.tube((x, y, 1), (x, y, 4), r + 1.2, SEAM, 'rough', name=tag + '_foot', verts=24)
    for z in (h - 11, h - 6):
        v.tube((x, y, z), (x, y, z + 2.4), r + 0.35, 'main', 'matte', name=tag + '_band', verts=24)
    v.tube((x, y, h - 0.6), (x, y, h + 1.2), r + 0.8, BLK, 'metal', name=tag + '_lip', verts=24)
    for i, (dx, dy, dz, rr) in enumerate(((1, 0, 5.5, 3.0), (3.5, 0, 10.5, 3.8), (7, 0, 15.5, 4.4))):
        v.sphere((x + dx, y + dy, h + dz), (rr, rr, rr * 0.8), '#9a9895' if i < 2 else '#b4b2ae', 'matte', name=tag + '_smoke')
# flare stack
v.tube((5, 6, 1), (5, 6, 52), 1.5, IRON, 'metal', name='flare', verts=8)
v.tube((5, 6, 48), (5, 6, 51.5), 1.7, '#3a3a36', 'metal', name='flare_tip', verts=10)
v.sphere((5, 6, 53.6), (2.2, 2.2, 3.4), '#ff8a2a', 'glow', name='flare_flame')
v.sphere((5, 6, 55.2), (1.1, 1.1, 1.8), '#ffe08a', 'glow', name='flare_core')
# ore heap, a crusher bunker, and the inclined conveyor up to the hall roof
v.sphere((64, 36, 1.6), (9, 7, 5.5), ORE, 'rough', name='heap')
v.sphere((60, 38, 1.6), (5, 4.5, 3.5), ORED, 'rough', name='heap2')
v.cube((62, 28, 4), (8, 8, 6), IRON, 'metal', name='crusher')
v.cube((62, 28, 7.4), (6, 6, 1), STEEL, 'metal', name='crusher_lid')
conveyor(v, (60, 26, 8), (47, 24, 19), 'conveyor')
v.cube((46, 24, 19.5), (3, 5, 2.4), STEEL, 'metal', name='conveyor_head')
for z, y in ((9, 31), (11.5, 33)):
    v.tube((46.5, y, z), (56, y, z), 1.1, STEEL, 'metal', name='rack_pipe', verts=12)
vb = greedy_boxes(v.voxelize(*BOX))
v.save_blend(os.path.join(out, 'refinery_soviets.blend'))
soviet_extra = [
    "bannerV(m, 4, 9, 44, 14, 7, pal);",
    "starFront(m, 13.5, 44, 5, 2.4, pal.main);",
]

# ======================================================================== Allied
# Sleek and round: a white hub under a pale glass dome with blue rings, a control tower and dish, two ball tanks on
# pedestals, an elevated tube linking them. Bright and curved; no sawtooth, no chimneys.
LBLUE = '#bcd4e8'
a = Scene()
a.cube((36, 24, 0.5), (72, 48, 1), '#b2ada1', 'rough', name='slab')
a.cube((36, 24, 0.3), (74, 50, 0.6), BIB, 'rough', name='bib')
a.tube((34, 24, 1), (34, 24, 11), 17, WALL, 'matte', name='hub', verts=40)
a.tube((34, 24, 1), (34, 24, 2.6), 17.8, WALLD, 'matte', name='hub_plinth', verts=40)
a.tube((34, 24, 5.5), (34, 24, 7), 17.4, 'main', 'matte', name='hub_band_lo', verts=40)
a.tube((34, 24, 10.6), (34, 24, 12.2), 17.9, 'main', 'matte', name='hub_rim', verts=40)
a.sphere((34, 24, 12.2), (14.5, 14.5, 9), LBLUE, 'metal', name='dome')
for ang in range(0, 360, 45):
    a.tube((34, 24, 12.4), (34 + 14.6 * math.cos(math.radians(ang)), 24 + 14.6 * math.sin(math.radians(ang)), 12.4), 0.5, 'main', 'matte', name='dome_rib', verts=6)
a.tube((34, 24, 12.2), (34, 24, 22), 0.9, STEEL, 'metal', name='dome_mast', verts=8)
a.sphere((34, 24, 21.4), (3.0, 3.0, 2.2), '#eceae0', 'metal', name='dome_cap')
a.sphere((34, 24, 23.8), (1.1, 1.1, 1.1), '#ffe9a0', 'glow', name='dome_light')
# bay annex on the south face: the door the trucks use
a.cube((36, 40, 5.5), (18, 12, 9), WALL, 'matte', name='annex')
a.cube((36, 40, 10.4), (19.4, 13.4, 1.4), 'main', 'matte', name='annex_roof')
a.cube((36, 44.4, 5.4), (13, 1.0, 8.6), '#46484a', 'metal', name='bay_door')
for i in range(5):
    a.cube((36, 44.9, 2.4 + i * 1.7), (13, 0.4, 0.5), '#5b5d58', 'metal', name='bay_slat')
a.cube((36, 46.4, 12), (18, 3.4, 1.0), WALL, 'matte', name='canopy')
for x in (27.4, 44.6):
    a.cube((x, 47.6, 6), (1.2, 1.2, 10), WALLD, 'matte', name='canopy_post')
apron(a, 28, 44, 'apron')
lamp(a, 3, 46, 'lamp_a')
lamp(a, 62, 46, 'lamp_b')
# ore intake on the east flank, fed up into the hub
a.cube((53, 24, 4), (6, 8, 6), STEEL, 'metal', name='intake')
hopper(a, 53, 24, 7, '#46484a', 'hopper')
conveyor(a, (50, 24, 14), (40, 24, 20), 'conveyor')
# control tower and dish (back west)
a.cube((9, 9, 15), (11, 11, 30), WALL, 'matte', name='tower')
a.cube((9, 9, 1.6), (12.5, 12.5, 1.6), WALLD, 'matte', name='tower_plinth')
for z in (9, 16, 23):
    a.cube((9, 9, z), (11.8, 11.8, 3.6), GLASS, 'glass', name='tower_glass')
    a.cube((9, 9, z + 2.4), (12.6, 12.6, 0.9), 'main', 'matte', name='tower_slab')
a.cube((9, 9, 30.4), (13.4, 13.4, 1.6), 'main', 'matte', name='tower_cap')
a.tube((9, 9, 31), (9, 9, 38), 0.8, STEEL, 'metal', name='dish_mast', verts=8)
a.sphere((9, 9, 40.2), (6.4, 6.4, 2.8), '#eceae0', 'metal', rot=(0, -30, 0), name='dish')
a.tube((9, 9, 40.2), (13.6, 9, 46), 0.45, IRON, 'metal', name='dish_feed', verts=6)
a.sphere((14, 9, 46.4), (0.9, 0.9, 0.9), '#ffe9a0', 'glow', name='dish_tip')
# two ball tanks on pedestals, one tall one short, joined by an elevated tube
for (x, y, r, z, tag) in ((60, 8, 7.5, 21, 'ball1'), (36, 6, 5.5, 17, 'ball2')):
    a.sphere((x, y, z), (r, r, r), '#eceae0', 'metal', name=tag)
    a.tube((x, y, z), (x, y, z + 0.9), r + 0.2, 'main', 'matte', name=tag + '_band', verts=32)
    a.tube((x, y, 1), (x, y, z - r + 1), 2.4, '#9ba1a3', 'metal', name=tag + '_stem', verts=16)
    a.tube((x, y, 1), (x, y, 3), 4.2, WALLD, 'matte', name=tag + '_foot', verts=20)
    a.tube((x, y, z + r - 0.6), (x, y, z + r + 2.2), 0.8, STEEL, 'metal', name=tag + '_vent', verts=8)
a.tube((41.5, 7, 17), (52.5, 8, 17), 1.2, STEEL, 'metal', name='ball_link', verts=12)
a.tube((14, 9, 14), (30.5, 6, 14), 1.1, STEEL, 'metal', name='tower_link', verts=12)
ab = greedy_boxes(a.voxelize(*BOX))
a.save_blend(os.path.join(out, 'refinery_allies.blend'))
allied_extra = [
    "starFront(m, 18, 44, 5, 2.6, pal.main);",
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
