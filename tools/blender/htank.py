"""Soviet Heavy Tank, modelled in Blender and voxelized for the game.
python3 -I tools/blender/htank.py <out_dir>  ->  htank.js (heavyHull / heavyTurret for models.js), *.blend
Hull box: x -13..14, y -10..11, z 0..8 (front +x). Turret box: x -9..21, y -9..9, z 0..9, pivot 0,0 (sits on the hull at z 6);
guns at y +-3.6 reaching x 20 (the muzzle flash and shell origin assume it). Colours 'main'/'light'/'dark'/'deep' are the
bright Soviet red (HEAVY_RED) for the Soviets and the burnt palette for wrecks."""
import math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from voxlib import Scene, greedy_boxes, emit

RUBBER, STEEL, BLACK, SLEEVE, OLIVE, WHITE = '#1f0f0c', '#6b6e6a', '#16120f', '#2a2420', '#5a5d3a', '#e8e6dc'
out = sys.argv[1]
os.makedirs(out, exist_ok=True)

# ------------------------------------------------------------------ hull
h = Scene()
for s in (-1, 1):
    h.cube((0.0, s * 6.0, 2.0), (20.0, 4.0, 4.0), RUBBER, 'rough', name='track')                      # track run
    for x in (-10.2, 10.2):                                                                          # big wheels at both ends
        h.tube((x, s * 6.0 - 2.0, 2.4), (x, s * 6.0 + 2.0, 2.4), 2.5, RUBBER, 'rough', name='end_wheel')
        h.tube((x, s * 7.0, 2.4), (x, s * 7.5, 2.4), 1.2, STEEL, 'metal', name='hub')
    h.cube((-0.5, s * 7.5, 3.8), (19.0, 1.0, 2.6), 'main', 'metal', name='side_armour')              # thick side skirt
    h.cube((-0.5, s * 7.5, 2.4), (19.0, 1.0, 0.8), 'dark', 'metal', name='side_armour_foot')
    for x in range(-8, 9, 3):
        h.cube((x, s * 7.5, 4.0), (0.8, 1.0, 2.2), 'dark', 'metal', name='armour_rib')                # bolted ribs
    h.cube((9.4, s * 7.5, 4.0), (1.6, 1.0, 2.4), 'light', 'metal', name='skirt_front')
h.cube((0, 0, 1.0), (21.0, 12.0, 2.0), 'deep', 'rough', name='underside')
h.cube((-0.5, 0, 3.5), (20.0, 12.0, 3.0), 'main', 'metal', name='hull')
h.cube((-1.0, 0, 5.1), (18.0, 13.0, 1.2), 'main', 'metal', name='deck')
h.cube((10.0, 0, 4.7), (4.6, 13.0, 1.5), 'light', 'metal', rot=(0, 28, 0), name='glacis')            # sloped front plate
h.cube((11.6, 0, 2.4), (1.2, 12.0, 3.2), 'dark', 'metal', name='nose')
h.cube((-8.4, 0, 5.9), (4.6, 10.0, 0.7), 'dark', 'metal', name='engine_deck')
for x in (-10.0, -8.8, -7.6, -6.4):
    h.cube((x, 0, 6.15), (0.6, 8.0, 0.5), 'deep', 'matte', name='louvre')
for y in (-1.4, 1.4):
    h.tube((-11.4, y, 3.8), (-11.4, y, 7.0), 0.85, '#3a3836', 'metal', name='exhaust', verts=10)
for y in (-5.0, 5.0):
    h.tube((-8.0, y - 1.8, 6.9), (-8.0, y + 1.8, 6.9), 1.2, OLIVE, 'matte', name='fuel_drum', verts=12)
for s in (-1, 1):
    h.cube((12.5, s * 5.0, 3.9), (0.7, 1.4, 1.0), '#d9c374', 'metal', name='headlight')
hb = greedy_boxes(h.voxelize(-13, -10, 14, 11, 8))
h.save_blend(os.path.join(out, 'htank_hull.blend'))

# ------------------------------------------------------------------ turret
t = Scene()
t.tube((-2.0, 0, 0.0), (-2.0, 0, 1.4), 6.3, 'dark', 'metal', name='ring', verts=28)
t.cube((-2.2, 0, 2.2), (11.0, 12.6, 3.6), 'main', 'metal', name='body')
t.cube((-8.2, 0, 2.2), (3.0, 10.6, 3.2), 'main', 'metal', name='bustle')
t.cube((3.1, 0, 2.3), (3.4, 11.6, 3.4), 'light', 'metal', rot=(0, -20, 0), name='front_slope')
for s in (-1, 1):
    t.cube((3.2, s * 5.5, 2.3), (3.2, 3.2, 3.4), 'main', 'metal', rot=(0, 0, 45), name='chamfer')   # chamfered front corners
t.cube((-2.2, 0, 4.1), (10.0, 11.4, 0.6), 'main', 'metal', name='roof')
t.cube((4.4, 0, 2.2), (2.0, 8.6, 3.0), 'dark', 'metal', name='mantlet')
t.cube((-8.2, 0, 3.2), (3.2, 8.0, 0.6), OLIVE, 'matte', name='stowage')
t.tube((-3.5, -3.2, 4.0), (-3.5, -3.2, 5.3), 1.95, 'dark', 'metal', name='cupola', verts=16)       # commander's cupola
t.tube((-3.5, -3.2, 5.0), (-3.5, -3.2, 5.6), 2.15, 'light', 'metal', name='cupola_ring', verts=16)
t.tube((-3.5, -3.2, 5.4), (-3.5, -3.2, 5.9), 1.3, 'dark', 'matte', name='cupola_lid', verts=12)
t.tube((-3.0, -3.2, 6.1), (0.2, -3.2, 6.1), 0.55, BLACK, 'metal', name='mg', verts=8)             # machine gun on the cupola
t.tube((-3.5, 3.2, 4.0), (-3.5, 3.2, 4.7), 1.85, 'dark', 'metal', name='loader_rim', verts=16)    # loader's hatch
t.tube((-3.5, 3.2, 4.5), (-3.5, 3.2, 5.0), 1.35, 'dark', 'matte', name='loader_lid', verts=12)
for y in (-3.6, 3.6):
    t.tube((3.0, y, 2.2), (20.0, y, 2.2), 1.45, BLACK, 'metal', name='barrel')
    t.tube((3.5, y, 2.2), (9.0, y, 2.2), 1.85, SLEEVE, 'metal', name='sleeve')
    t.tube((12.0, y, 2.2), (14.6, y, 2.2), 1.75, SLEEVE, 'metal', name='extractor')
    t.tube((17.4, y, 2.2), (20.0, y, 2.2), 1.9, '#0d0a08', 'metal', name='muzzle_brake')
t.tube((-6.8, 5.0, 3.0), (-6.8, 5.0, 8.5), 0.55, WHITE, 'metal', name='aerial', verts=8)
tb = greedy_boxes(t.voxelize(-9, -9, 21, 9, 9))
t.save_blend(os.path.join(out, 'htank_turret.blend'))

def body(b):
    return '\n'.join('  ' + l for l in emit(b).replace('pal.', 'P.').split('\n'))
hull_js = ("function heavyHull(pal, s) {\n  const P = pal.key === 'soviets' ? HEAVY_RED : pal;\n  const m = new VModel(-13, -10, 14, 11, 8);\n"
           + body(hb) + "\n  return m;\n}\n")
tur_js = ("function heavyTurret(pal, s) {\n  const P = pal.key === 'soviets' ? HEAVY_RED : pal;\n  const m = new VModel(-9, -9, 21, 9, 9);\n"
          + body(tb) + "\n  return m;\n}\n")
open(os.path.join(out, 'htank.js'), 'w').write("// Generated by tools/blender/htank.py (Blender model, voxelized)\n" + hull_js + tur_js)
print('hull boxes', len(hb), 'turret boxes', len(tb))
