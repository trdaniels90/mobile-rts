"""Soviet Advanced Power Plant (3 x 3 cells), modelled in Blender and voxelized for the game.
python3 -I tools/blender/apower_soviet.py <out_dir>  ->  apower_soviets.js (BLENDER:apower_soviets block), .preview.js, .blend
The grand version of power_soviet.py: a long Stalinist turbine hall with a columned portico, a stepped
wedding-cake tower and star-topped spire over the middle, two hyperbolic cooling towers with steam behind,
and a switchyard of lattice pylons and transformers. No coal, no chimneys."""
import math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from voxlib import Scene, greedy_boxes, emit

CONC, SEAM, STEEL, IRON, GUN, BIB = '#a39e91', '#878275', '#7f8480', '#5b5d58', '#34362f', '#6e6352'
OCHRE, OCHRED, WHITE, TIN, GLASS, BLK = '#cdbf8e', '#b3a574', '#e4e2d8', '#4f5a4b', '#2c4452', '#1c1c1a'
out = sys.argv[1]
os.makedirs(out, exist_ok=True)
BOX = (-2, -2, 74, 74, 64)
s = Scene()
s.cube((36, 36, 0.5), (72, 72, 1), '#8a8579', 'rough', name='slab')
s.cube((36, 36, 0.3), (74, 74, 0.6), BIB, 'rough', name='bib')

# ---- the hall (front): y 40..70
s.cube((36, 55, 7.5), (68, 30, 13), OCHRE, 'rough', name='hall')
s.cube((36, 55, 2.2), (69, 31, 2.4), OCHRED, 'rough', name='base')
s.cube((36, 69.4, 13.4), (68, 1.8, 1.0), WHITE, 'matte', name='cornice')
for x in range(4, 69, 8):
    s.cube((x, 69.6, 7.5), (2.4, 1.2, 12), WHITE, 'matte', name='pilaster')
for x in (8, 16, 24, 48, 56, 64):
    s.cube((x, 69.4, 7.4), (4, 0.9, 6.6), GLASS, 'glass', name='window')
    s.tube((x, 69.0, 10.6), (x, 69.9, 10.6), 2.0, GLASS, 'glass', name='arch', verts=14)
for x in (4, 68):                                  # end pavilions, slightly higher
    s.cube((x, 55, 10), (8, 30, 18), OCHRE, 'rough', name='pavilion')
    s.cube((x, 55, 19.3), (9, 31, 0.8), TIN, 'metal', name='pavilion_cap')
s.prism([(8, 39), (64, 39), (64, 71), (8, 71)], [(8, 54), (64, 54), (64, 56), (8, 56)], 14, 20.5, TIN, 'metal', name='roof')
s.cube((36, 55, 20.9), (56, 2.2, 0.8), 'main', 'matte', name='ridge')
ang = math.degrees(math.atan2(6.5, 15))
for k in range(0, 56, 7):
    s.cube((8.5 + k, 47, 17.4), (0.6, 0.6, 16), BLK, 'metal', rot=(-ang, 0, 0), name='seam_n')
    s.cube((8.5 + k, 63, 17.4), (0.6, 0.6, 16), BLK, 'metal', rot=(ang, 0, 0), name='seam_s')
# portico
s.cube((36, 71.8, 1.5), (22, 3, 1.0), CONC, 'rough', name='steps')
s.cube((36, 69.4, 4.6), (8, 0.9, 7.2), '#3a2a22', 'matte', name='door')
for x in (28, 33, 39, 44):
    s.tube((x, 71.0, 1.5), (x, 71.0, 15), 1.2, WHITE, 'matte', name='portico_column', verts=12)
s.cube((36, 71.0, 15.7), (20, 3, 1.0), WHITE, 'matte', name='portico_beam')
s.prism([(25, 70), (47, 70), (47, 72.6), (25, 72.6)], [(33.6, 70), (38.4, 70), (38.4, 72.6), (33.6, 72.6)], 16.2, 22.0, WHITE, 'matte', name='pediment')
# ---- central tower: three tiers and a spire with a star
s.cube((36, 54, 22), (26, 18, 16), OCHRE, 'rough', name='tier1')
for x in range(25, 48, 7):
    s.cube((x, 44.8, 22), (2, 1.2, 15), WHITE, 'matte', name='tier1_pilaster')
s.cube((36, 54, 30.4), (28, 20, 1.2), 'main', 'matte', name='tier1_cap')
s.cube((36, 54, 36), (16, 11, 10), OCHRE, 'rough', name='tier2')
for x in (30, 36, 42):
    s.cube((x, 48.4, 36), (3, 0.8, 6), GLASS, 'glass', name='tier2_window')
s.cube((36, 54, 41.4), (18, 13, 1.2), 'main', 'matte', name='tier2_cap')
s.cube((36, 54, 46), (8, 6, 8), OCHRE, 'rough', name='tier3')
s.prism([(31, 50), (41, 50), (41, 58), (31, 58)], [(35.2, 53.2), (36.8, 53.2), (36.8, 54.8), (35.2, 54.8)], 50, 56, TIN, 'metal', name='tier3_roof')
s.tube((36, 54, 56), (36, 54, 60), 0.5, '#d0a426', 'metal', name='spire', verts=8)
s.sphere((36, 54, 60.4), (2.6, 0.9, 2.6), 'main', 'matte', rot=(0, 0, 0), name='spire_star')
for (cx, cy) in ((24, 46), (48, 46), (24, 62), (48, 62)):     # corner turrets on tier 1
    s.cube((cx, cy, 31.6), (2.8, 2.8, 3), OCHRE, 'rough', name='turret')
    s.prism([(cx - 1.6, cy - 1.6), (cx + 1.6, cy - 1.6), (cx + 1.6, cy + 1.6), (cx - 1.6, cy + 1.6)], [(cx - .3, cy - .3), (cx + .3, cy - .3), (cx + .3, cy + .3), (cx - .3, cy + .3)], 33, 36, TIN, 'metal', name='turret_roof')
# flagpoles
for x in (3, 69):
    s.tube((x, 72, 1), (x, 72, 36), 0.5, STEEL, 'metal', name='flagpole', verts=8)
    s.cube((x + 4.2, 72, 33.4), (8.4, 0.5, 5), 'main', 'matte', name='flag')
    s.sphere((x, 72, 36.4), (0.8, 0.8, 0.8), '#d0a426', 'metal', name='finial')


def cooling_tower(cx, cy, tag):
    for z in range(1, 38, 2):
        r = 7.0 + 4.0 * ((z - 22) / 21.0) ** 2
        s.tube((cx, cy, z), (cx, cy, z + 2.1), r, '#b9b6ac', 'rough', name=tag + '_shell', verts=32)
    s.tube((cx, cy, 36), (cx, cy, 38.4), 8.6, 'main', 'matte', name=tag + '_band', verts=32)
    s.tube((cx, cy, 1), (cx, cy, 3), 12.2, SEAM, 'rough', name=tag + '_foot', verts=32)


cooling_tower(16, 18, 'ct1')
cooling_tower(46, 18, 'ct2')
for x in (16, 46):
    s.tube((x, 29, 4), (x, 40, 4), 2.2, STEEL, 'metal', name='cw_pipe', verts=14)
s.tube((16, 30, 7), (46, 30, 7), 1.4, STEEL, 'metal', name='cw_header', verts=12)
# ---- switchyard (east): transformers and three pylons
for y in (8, 22):
    s.cube((64, y, 3.0), (10, 8, 4), IRON, 'metal', name='transformer')
    for dy in (-3, 0, 3):
        s.tube((64 + dy, y, 5), (64 + dy, y, 9.5), 1.0, WHITE, 'matte', name='bushing', verts=10)
    s.tube((64, y, 5), (64, y, 7), 3.6, GUN, 'metal', name='conservator', verts=14)
    for i in range(5):
        s.cube((60.4 + i * 1.8, y - 4.4, 3.0), (0.6, 1.2, 3.4), '#46473f', 'metal', name='fin')
for (px, py) in ((62, 34), (70, 34), (66, 2)):
    for (dx, dy) in ((-2.2, -2.2), (2.2, -2.2), (-2.2, 2.2), (2.2, 2.2)):
        s.tube((px + dx, py + dy, 1), (px, py, 30), 0.45, STEEL, 'metal', name='pylon_leg', verts=6)
    for z in (8, 15, 22):
        w = 2.2 * (1 - z / 32)
        s.cube((px, py, z), (2 * w + 0.6, 2 * w + 0.6, 0.5), STEEL, 'metal', name='pylon_ring')
    for (z, hw) in ((27, 5.5), (20, 4.5)):
        s.cube((px, py, z), (2 * hw, 0.7, 0.7), STEEL, 'metal', name='pylon_arm')
        for sgn in (-1, 1):
            s.tube((px + sgn * (hw - 0.6), py, z), (px + sgn * (hw - 0.6), py, z - 2.6), 0.5, '#d8d4c4', 'matte', name='insulator', verts=6)
for (x, y) in ((70, 70), (54, 38)):
    s.tube((x, y, 1), (x, y, 11), 0.5, IRON, 'metal', name='lamp_pole', verts=8)
    s.cube((x, y, 11.4), (2.6, 1.4, 0.8), GUN, 'metal', name='lamp')

bx = greedy_boxes(s.voxelize(*BOX))
s.save_blend(os.path.join(out, 'apower_soviets.blend'))
extra = ["starFront(m, 36, 72, 18.4, 2.4, pal.main);"]
body = ['    ' + l for l in emit(bx).split('\n')] + ['    ' + l for l in extra]
fn = "    const m = new VModel(%d, %d, %d, %d, %d);\n%s\n    return m;\n" % (BOX + ('\n'.join(body),))
with open(os.path.join(out, 'apower_soviets.js'), 'w') as f:
    f.write("// Generated by tools/blender/apower_soviet.py (Blender model, voxelized)\n")
    f.write("  apower(pal) {\n%s  },\n" % fn)
with open(os.path.join(out, 'apower_soviets.preview.js'), 'w') as f:
    f.write("SOVIET.apower = function (pal) {\n%s};\n" % fn)
print('boxes', len(bx))
