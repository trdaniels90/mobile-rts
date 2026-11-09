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
# 1950s-60s Western industry: a sandstone hall under a corrugated gabled roof with a glazed lantern, a riveted steel
# water tower on braced legs, a block of concrete grain-elevator silos with a conveyor gallery, drums, a flagpole.
SAND_W, BRK, TIN = '#cbbf9c', '#8a5a40', '#7b7e78'
a = Scene()
a.cube((36, 24, 0.5), (72, 48, 1), '#a8a396', 'rough', name='slab')
a.cube((36, 24, 0.3), (74, 50, 0.6), BIB, 'rough', name='bib')
a.cube((24, 32, 7.5), (43, 24, 13), SAND_W, 'rough', name='hall')
a.cube((24, 32, 3.0), (44, 25, 4), BRK, 'rough', name='brick_plinth')
for x in range(2, 46, 7):
    a.cube((x, 44.2, 7.5), (1.8, 1.1, 12.5), WALLD, 'rough', name='pilaster')
a.cube((24, 44.6, 13.4), (44, 1.4, 1.2), 'dark', 'matte', name='cornice')
a.prism([(1, 19), (47, 19), (47, 45), (1, 45)], [(1, 31), (47, 31), (47, 33), (1, 33)], 13, 21.5, 'main', 'metal', name='gable')
a.cube((24, 32, 22.2), (46, 2.4, 0.8), 'dark', 'matte', name='ridge_cap')
ang = math.degrees(math.atan2(8.5, 12))
for k in range(0, 47, 5):                       # corrugation seams down both slopes
    a.cube((1.8 + k, 38.6, 17.4), (0.7, 0.7, 14.8), 'dark', 'matte', rot=(ang, 0, 0), name='seam_s')
    a.cube((1.8 + k, 25.4, 17.4), (0.7, 0.7, 14.8), 'dark', 'matte', rot=(-ang, 0, 0), name='seam_n')
a.cube((24, 32, 24.6), (30, 6, 3.4), SAND_W, 'rough', name='lantern')
a.prism([(8, 28.6), (40, 28.6), (40, 35.4), (8, 35.4)], [(8, 31), (40, 31), (40, 33), (8, 33)], 26.2, 28.4, 'dark', 'metal', name='lantern_roof')
for i in range(6):
    a.cube((11 + i * 5.2, 28.8, 24.8), (3.6, 0.6, 2.2), GLASS, 'glass', name='lantern_glass')
    a.cube((11 + i * 5.2, 35.2, 24.8), (3.6, 0.6, 2.2), GLASS, 'glass', name='lantern_glass_n')
for x in (10, 38):
    a.tube((x, 24, 18), (x, 24, 22.6), 1.6, STEEL, 'metal', name='cowl', verts=12)
    a.sphere((x, 24, 23.0), (2.4, 2.4, 1.4), TIN, 'metal', name='cowl_cap')
# front: tall multi-pane windows, the bay door, a loading canopy on posts
for i in range(4):
    a.cube((7 + i * 5.2, 44.6, 8), (3.6, 0.8, 5.4), GLASS, 'glass', name='window')
    a.cube((7 + i * 5.2, 44.8, 8), (0.5, 0.6, 5.4), WALLD, 'matte', name='mullion')
    a.cube((7 + i * 5.2, 44.8, 8), (3.6, 0.6, 0.5), WALLD, 'matte', name='transom')
a.cube((36, 44.4, 5.2), (13, 1.0, 8.4), '#4a4a44', 'metal', name='bay_door')
for i in range(5):
    a.cube((36, 44.9, 2.0 + i * 1.7), (13, 0.4, 0.5), '#5b5d58', 'metal', name='bay_slat')
a.cube((36, 44.9, 9.8), (15.4, 1.6, 1.2), 'dark', 'matte', name='bay_lintel')
a.cube((36, 46.6, 11), (18, 3.6, 0.9), 'main', 'metal', name='canopy')
for x in (27.4, 44.6):
    a.cube((x, 47.6, 6), (1.2, 1.2, 10), IRON, 'metal', name='canopy_post')
apron(a, 28, 44, 'apron')
lamp(a, 60, 46, 'lamp_b')
# flagpole, front left
a.tube((4, 46.5, 1), (4, 46.5, 26), 0.5, STEEL, 'metal', name='flagpole', verts=8)
a.cube((7.6, 46.5, 23.6), (6.4, 0.5, 4), 'main', 'matte', name='flag')
a.sphere((4, 46.5, 26.4), (0.8, 0.8, 0.8), '#d0a426', 'metal', name='flag_finial')
# steel water tower on braced legs, back right
for ang_ in (45, 135, 225, 315):
    c, s_ = math.cos(math.radians(ang_)), math.sin(math.radians(ang_))
    a.tube((13 + 5.6 * c, 10 + 5.6 * s_, 1), (13 + 5.2 * c, 10 + 5.2 * s_, 22), 0.9, IRON, 'metal', name='wt_leg', verts=8)
for z in (7, 14):
    for k in range(4):
        a0, a1 = math.radians(45 + 90 * k), math.radians(135 + 90 * k)
        a.tube((13 + 5.5 * math.cos(a0), 10 + 5.5 * math.sin(a0), z), (13 + 5.3 * math.cos(a1), 10 + 5.3 * math.sin(a1), z + 7), 0.45, IRON, 'metal', name='wt_brace', verts=6)
a.tube((13, 10, 21), (13, 10, 22.2), 6.8, IRON, 'metal', name='wt_floor', verts=24)
a.tube((13, 10, 22), (13, 10, 31), 6.4, '#aab4b1', 'metal', name='wt_tank', verts=24)
for z in (24.5, 28.5):
    a.tube((13, 10, z), (13, 10, z + 0.5), 6.7, IRON, 'metal', name='wt_hoop', verts=24)
a.tube((13, 10, 26), (13, 10, 28.4), 6.7, 'main', 'matte', name='wt_band', verts=24)
a.prism([(13 + 6.8 * math.cos(i * math.pi / 6), 10 + 6.8 * math.sin(i * math.pi / 6)) for i in range(12)], [(13 + 0.8 * math.cos(i * math.pi / 6), 10 + 0.8 * math.sin(i * math.pi / 6)) for i in range(12)], 31, 36.5, '#5b5d58', 'metal', name='wt_roof')
a.tube((13, 10, 36), (13, 10, 39), 0.4, STEEL, 'metal', name='wt_finial', verts=6)
a.cube((13, 16.3, 12), (1.3, 0.9, 22), IRON, 'metal', name='wt_ladder')
# concrete silo block with a headhouse, and its conveyor gallery to the hall
for (x, y) in ((54, 31), (63, 31), (54, 40), (63, 40)):
    a.tube((x, y, 1), (x, y, 24), 4.5, '#b3ada0', 'rough', name='silo', verts=24)
    for z in (6, 12, 18):
        a.tube((x, y, z), (x, y, z + 0.7), 4.9, SEAM, 'rough', name='silo_hoop', verts=24)
    a.tube((x, y, 19), (x, y, 22), 4.9, 'main', 'matte', name='silo_band', verts=24)
a.cube((58.5, 35.5, 26.6), (17, 18, 5.4), SAND_W, 'rough', name='headhouse')
a.prism([(49.5, 26.5), (67.5, 26.5), (67.5, 44.5), (49.5, 44.5)], [(52, 33), (65, 33), (65, 38), (52, 38)], 29.2, 32.4, 'dark', 'metal', name='headhouse_roof')
for x in (54, 63):
    a.cube((x, 26.4, 26.8), (3.4, 0.6, 2.4), GLASS, 'glass', name='head_window')
a.tube((49, 33, 27), (46, 32, 19.5), 2.2, STEEL, 'metal', name='gallery', verts=4, spin=45)
for t_ in (0.35, 0.7):
    px, pz = 49 - 3 * t_, 27 - 7.5 * t_
    a.cube((px, 33, (pz - 1) / 2 + 0.5), (1.2, 3.4, pz - 1), IRON, 'metal', name='gallery_leg')
# oil drums and a rail wagon load of ore by the dock
for (x, y) in ((67, 21), (69.5, 22.5), (67.5, 24.5), (70, 25)):
    a.tube((x, y, 1), (x, y, 4.6), 1.5, '#8b4535' if (x + y) % 2 else '#4a5a3a', 'metal', name='drum', verts=12)
a.cube((20, 47.2, 1.6), (22, 1.2, 1.2), IRON, 'metal', name='rail_a')
a.cube((20, 49.0, 1.6), (22, 1.2, 1.2), IRON, 'metal', name='rail_b')
ab = greedy_boxes(a.voxelize(*BOX))
a.save_blend(os.path.join(out, 'refinery_allies.blend'))
allied_extra = [
    "starFront(m, 20, 44, 5, 2.4, pal.main);",
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
