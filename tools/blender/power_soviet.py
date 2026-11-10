"""Soviet Power Plant (2 x 2 cells), modelled in Blender and voxelized for the game.
python3 -I tools/blender/power_soviet.py <out_dir>  ->  power_soviets.js (BLENDER:power_soviets block), .preview.js, .blend
A Stalinist-era station, no coal and no chimneys: an ochre turbine hall with white pilasters, arched windows and a
star on the pediment under a green tin roof, a hyperbolic cooling tower breathing steam, and a switchyard with
lattice pylons and a transformer bank."""
import math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from voxlib import Scene, greedy_boxes, emit

CONC, SEAM, STEEL, IRON, GUN, BIB = '#a39e91', '#878275', '#7f8480', '#5b5d58', '#34362f', '#6e6352'
OCHRE, OCHRED, WHITE, TIN, GLASS, BLK = '#cdbf8e', '#b3a574', '#e4e2d8', '#4f5a4b', '#2c4452', '#1c1c1a'
out = sys.argv[1]
os.makedirs(out, exist_ok=True)
BOX = (-2, -2, 50, 50, 52)

s = Scene()
s.cube((24, 24, 0.5), (48, 48, 1), '#8a8579', 'rough', name='slab')
s.cube((24, 24, 0.3), (50, 50, 0.6), BIB, 'rough', name='bib')

# ---- turbine hall (front): ochre stucco, rusticated base, pilasters, arched windows, green tin gable roof
HX0, HX1, HY0, HY1 = 2, 46, 28, 46
s.cube((24, 37, 7.5), (44, 18, 13), OCHRE, 'rough', name='hall')
s.cube((24, 37, 2.2), (45, 19, 2.4), OCHRED, 'rough', name='base')
s.cube((24, 45.4, 13.4), (46, 1.8, 1.0), WHITE, 'matte', name='cornice')
for x in (4, 14, 34, 44):
    s.cube((x, 45.6, 7.5), (2.4, 1.2, 12), WHITE, 'matte', name='pilaster')
for x in (9, 39):                                 # tall arched windows
    s.cube((x, 45.4, 7.4), (4, 0.9, 6.6), GLASS, 'glass', name='window')
    s.tube((x, 45.0, 10.6), (x, 45.9, 10.6), 2.0, GLASS, 'glass', name='arch', verts=14)
    s.cube((x, 45.9, 4.2), (5, 1.0, 0.6), WHITE, 'matte', name='sill')
for x in (19, 29):
    s.cube((x, 45.4, 6.6), (3, 0.9, 5), GLASS, 'glass', name='window_c')
s.prism([(1, 27), (47, 27), (47, 47), (1, 47)], [(1, 36), (47, 36), (47, 38), (1, 38)], 14, 19.5, TIN, 'metal', name='roof')
s.cube((24, 37, 19.9), (46, 2.2, 0.8), 'main', 'matte', name='ridge')
ang = math.degrees(math.atan2(5.5, 9))
for k in range(0, 47, 6):
    s.cube((1.8 + k, 31.6, 16.8), (0.6, 0.6, 10.5), BLK, 'metal', rot=(-ang, 0, 0), name='roof_seam_s')
    s.cube((1.8 + k, 42.4, 16.8), (0.6, 0.6, 10.5), BLK, 'metal', rot=(ang, 0, 0), name='roof_seam_n')
for x in (10, 38):                                # roof ventilators
    s.cube((x, 37, 22), (5, 4, 3.4), IRON, 'metal', name='roof_vent')
    s.cube((x, 37, 24.0), (6, 5, 0.7), TIN, 'metal', name='roof_vent_cap')
# portico: steps, door, pediment with the star
s.cube((24, 47.6, 1.5), (14, 3, 1.0), CONC, 'rough', name='steps')
s.cube((24, 45.4, 4.2), (6.4, 0.9, 6.6), '#3a2a22', 'matte', name='door')
for x in (19.6, 28.4):
    s.tube((x, 46.8, 1.5), (x, 46.8, 14), 1.1, WHITE, 'matte', name='portico_column', verts=12)
s.cube((24, 46.8, 14.7), (12, 2.6, 1.0), WHITE, 'matte', name='portico_beam')
s.prism([(17.5, 45.5), (30.5, 45.5), (30.5, 48.0), (17.5, 48.0)], [(22.6, 45.5), (25.4, 45.5), (25.4, 48.0), (22.6, 48.0)], 15.2, 20.0, WHITE, 'matte', name='pediment')
# flagpole with a red flag, front left
s.tube((3, 47, 1), (3, 47, 34), 0.5, STEEL, 'metal', name='flagpole', verts=8)
s.cube((7.2, 47, 31.4), (8.4, 0.5, 5), 'main', 'matte', name='flag')
s.sphere((3, 47, 34.4), (0.8, 0.8, 0.8), '#d0a426', 'metal', name='finial')

# ---- hyperbolic cooling tower (back left), steam above
for z in range(1, 38, 2):
    r = 7.0 + 4.0 * ((z - 22) / 21.0) ** 2
    s.tube((14, 14, z), (14, 14, z + 2.1), r, '#b9b6ac', 'rough', name='shell', verts=32)
s.tube((14, 14, 36), (14, 14, 38.4), 8.6, 'main', 'matte', name='shell_band', verts=32)
s.tube((14, 14, 1), (14, 14, 3), 12.2, SEAM, 'rough', name='shell_foot', verts=32)
s.tube((14, 25.5, 4), (14, 28.5, 4), 2.2, STEEL, 'metal', name='cw_pipe', verts=14)
s.tube((27, 14, 4), (14 + 11, 14, 4), 2.2, STEEL, 'metal', name='cw_pipe_b', verts=14)

# ---- switchyard (back right): transformer bank and two lattice pylons with insulator strings
s.cube((38, 12, 3.0), (14, 8, 4), IRON, 'metal', name='transformer')
for x in (33.5, 38, 42.5):
    s.tube((x, 12, 5), (x, 12, 9.5), 1.0, WHITE, 'matte', name='bushing', verts=10)
for i in range(7):
    s.cube((31.5 + i * 2.5, 7.4, 3.0), (0.6, 1.2, 3.4), '#46473f', 'metal', name='fin')
s.tube((38, 12, 5), (38, 12, 7), 4.6, GUN, 'metal', name='conservator', verts=14)
for (px, py) in ((34, 22), (42, 22)):
    for (dx, dy) in ((-2.2, -2.2), (2.2, -2.2), (-2.2, 2.2), (2.2, 2.2)):
        s.tube((px + dx, py + dy, 1), (px, py, 30), 0.45, STEEL, 'metal', name='pylon_leg', verts=6)
    for z in (8, 15, 22):
        w = 2.2 * (1 - z / 32)
        s.cube((px, py, z), (2 * w + 0.6, 2 * w + 0.6, 0.5), STEEL, 'metal', name='pylon_ring')
    for (z, hw) in ((27, 7), (20, 6)):
        s.cube((px, py, z), (2 * hw, 0.7, 0.7), STEEL, 'metal', name='pylon_arm')
        for sgn in (-1, 1):
            s.tube((px + sgn * (hw - 0.6), py, z), (px + sgn * (hw - 0.6), py, z - 2.6), 0.5, '#d8d4c4', 'matte', name='insulator', verts=6)
s.tube((34, 22, 27), (42, 22, 27), 0.25, BLK, 'metal', name='line', verts=4)
# lamps
for (x, y) in ((46, 47), (46, 25)):
    s.tube((x, y, 1), (x, y, 11), 0.5, IRON, 'metal', name='lamp_pole', verts=8)
    s.cube((x, y, 11.4), (2.6, 1.4, 0.8), GUN, 'metal', name='lamp')

bx = greedy_boxes(s.voxelize(*BOX))
s.save_blend(os.path.join(out, 'power_soviets.blend'))
extra = ["starFront(m, 24, 47, 17.2, 2.2, pal.main);"]
body = ['    ' + l for l in emit(bx).split('\n')] + ['    ' + l for l in extra]
fn = "    const m = new VModel(%d, %d, %d, %d, %d);\n%s\n    return m;\n" % (BOX + ('\n'.join(body),))
with open(os.path.join(out, 'power_soviets.js'), 'w') as f:
    f.write("// Generated by tools/blender/power_soviet.py (Blender model, voxelized)\n")
    f.write("  power(pal) {\n%s  },\n" % fn)
with open(os.path.join(out, 'power_soviets.preview.js'), 'w') as f:
    f.write("SOVIET.power = function (pal) {\n%s};\n" % fn)
print('boxes', len(bx))
