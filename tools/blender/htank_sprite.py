"""Soviet Heavy Tank as a smooth Blender model, rendered into pre-rendered sprite sheets for the game (pilot).
python3 -I tools/blender/htank_sprite.py <out_dir> [facings=32]
  -> <out_dir>/hull.png, turret.png, shadow.png  (8 columns of 126 x 126 cells, one per facing, facing 0 = east, turning clockwise)
     htank.blend, preview.png
Needs `pip install bpy pillow`; Cycles on the CPU.

Projection: the game draws a point (x, y, z) at screen (x, y - z). That is a 45-degree tilted orthographic view whose depth is stretched
by 1.4142, so each cell is rendered at 45 degrees and stretched vertically. The sun is the game's (voxel.js LIGHT), and the ground shadow is
the game's too (a point at height z falls (+0.827 z, -0.293 z) on the ground). Cell origin (the unit's ground position) is the cell's centre.
Rendering factor R = 3 sprite pixels per game pixel."""
import math, os, sys
import bpy, bmesh
import numpy as np
from mathutils import Vector
from PIL import Image

out = sys.argv[1]
NF = int(sys.argv[2]) if len(sys.argv) > 2 else 32
CELL, R, COLS = 126, 3, 8
SS = 2                                   # render at 2x and reduce
os.makedirs(out, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene

def lin(c):
    c = c / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
def col(h):
    return (lin(int(h[1:3], 16)), lin(int(h[3:5], 16)), lin(int(h[5:7], 16)), 1.0)

def material(name, hexcol, metal=0.0, rough=0.5, bump=0.0, scale=60.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; b = nt.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = col(hexcol); b.inputs['Metallic'].default_value = metal; b.inputs['Roughness'].default_value = rough
    if bump > 0:                                           # fine surface texture: tiny bumps in the paint
        n = nt.nodes.new('ShaderNodeTexNoise'); n.inputs['Scale'].default_value = scale; n.inputs['Detail'].default_value = 4
        bp = nt.nodes.new('ShaderNodeBump'); bp.inputs['Strength'].default_value = bump; bp.inputs['Distance'].default_value = 0.3
        nt.links.new(n.outputs['Fac'], bp.inputs['Height']); nt.links.new(bp.outputs['Normal'], b.inputs['Normal'])
    return m

RED = material('red', '#c9170d', 0.25, 0.42, 0.25)
RED_LIGHT = material('red_light', '#e0503f', 0.2, 0.45, 0.25)
RED_DARK = material('red_dark', '#7c0c07', 0.25, 0.5, 0.2)
BLACK = material('black', '#16120f', 0.6, 0.35, 0.1)
HATCH = material('hatch', '#0b0302', 0.1, 0.6)
RUBBER = material('rubber', '#1c1a17', 0.0, 0.9, 0.3, 120.0)
WHEEL = material('wheel', '#3b3a34', 0.7, 0.45)
WHITE = material('white', '#f2f0e8', 0.0, 0.5)
TIP = material('tip', '#c01810', 0.0, 0.5)

def finish(obj, mat, bevel=0.3, angle=38.0):
    """Bevel the edges so they catch the light, then smooth-shade everything except the sharp creases."""
    bpy.context.view_layer.objects.active = obj
    for o in bpy.context.selected_objects:
        o.select_set(False)
    obj.select_set(True)
    if bevel > 0:
        md = obj.modifiers.new('bevel', 'BEVEL'); md.width = bevel; md.segments = 2; md.limit_method = 'ANGLE'; md.angle_limit = math.radians(30)
        bpy.ops.object.modifier_apply(modifier='bevel')
    bm = bmesh.new(); bm.from_mesh(obj.data)
    bm.normal_update()
    for e in bm.edges:
        if len(e.link_faces) == 2 and e.calc_face_angle(0.0) > math.radians(angle):
            e.smooth = False
    for f in bm.faces:
        f.smooth = True
    bm.to_mesh(obj.data); bm.free()
    obj.data.materials.clear(); obj.data.materials.append(mat)
    return obj

# ---- parts in GAME coordinates (x forward, y south, z up); built with y negated because Blender's y points north ----
P = lambda x, y, z: (x, -y, z)
hull_objs, turret_objs = [], []

def box(group, x0, y0, z0, x1, y1, z1, mat, bevel=0.3):
    bpy.ops.mesh.primitive_cube_add(size=1, location=P((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2))
    o = bpy.context.object; o.scale = (x1 - x0, y1 - y0, z1 - z0)
    bpy.ops.object.transform_apply(scale=True)
    group.append(finish(o, mat, bevel)); return o

def tube(group, a, b, r, mat, bevel=0.0, verts=32):
    a, b = Vector(P(*a)), Vector(P(*b)); d = b - a
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=d.length, location=(a + b) / 2)
    o = bpy.context.object; o.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()
    bpy.ops.object.transform_apply(rotation=True)
    group.append(finish(o, mat, bevel)); return o

def ellipsoid(group, c, radii, mat):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=1, location=P(*c))
    o = bpy.context.object; o.scale = radii; bpy.ops.object.transform_apply(scale=True)
    group.append(finish(o, mat, 0.0, 90.0)); return o

def prism(group, bottom, top, z0, z1, mat, bevel=0.35):
    bm = bmesh.new()
    for x, y in bottom: bm.verts.new(P(x, y, z0))
    for x, y in top: bm.verts.new(P(x, y, z1))
    bmesh.ops.convex_hull(bm, input=bm.verts[:])
    me = bpy.data.meshes.new('prism'); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new('prism', me); bpy.context.collection.objects.link(o)
    group.append(finish(o, mat, bevel)); return o

# hull: tall-ish long red slab, pale deck, dark treads with wheels
for s in (-1, 1):
    box(hull_objs, -13, s * 7 - 1.2, 0, 9.5, s * 7 + 1.2, 2.2, RUBBER, 0.8)                           # tread run
    for x in range(-11, 8, 3):
        tube(hull_objs, (x, s * 7.9, 1.2), (x, s * 8.3, 1.2), 1.15, WHEEL, 0.1, 24)                  # road wheels
box(hull_objs, -14, -8, 2, 10, 8, 5, RED, 0.4)                                                        # body
prism(hull_objs, [(8.6, -7.2), (8.6, 7.2), (11.4, 6.0), (11.4, -6.0)], [(8.6, -6.0), (8.6, 6.0), (9.6, 5.2), (9.6, -5.2)], 2.0, 5.0, RED_LIGHT)   # sloped nose
box(hull_objs, -13, -6.4, 5, 8.6, 6.4, 6.2, RED_LIGHT, 0.35)                                          # pale deck
for x in (-8.0, -3.0, 2.0):
    box(hull_objs, x, -6.3, 6.2, x + 0.3, 6.3, 6.35, RED_DARK, 0.0)                                   # panel lines
for s in (-1, 1):
    box(hull_objs, -14, s * 6.8 - 0.4, 4.6, 10, s * 6.8 + 0.4, 5.2, RED_LIGHT, 0.15)                  # pale edge plates
box(hull_objs, -13, -3, 6.2, -10, 3, 7.2, RED_DARK, 0.3)                                              # engine hatch
for y in (-2, -0.6, 0.8, 2):
    box(hull_objs, -12.6, y - 0.15, 7.2, -10.4, y + 0.15, 7.3, BLACK, 0.0)

# turret: faceted shield shape, flat top, two black oval hatches, short thick twin guns, white rod with a red tip
BASE = [(-9.0, -6.9), (-9.0, 6.9), (-6.5, 8.0), (-0.5, 8.0), (3.4, 5.8), (5.6, 4.3), (5.6, -4.3), (3.4, -5.8), (-0.5, -8.0), (-6.5, -8.0)]
TOP = [(-8.0, -5.7), (-8.0, 5.7), (-6.0, 6.7), (-0.5, 6.7), (2.8, 4.7), (4.6, 3.4), (4.6, -3.4), (2.8, -4.7), (-0.5, -6.7), (-6.0, -6.7)]
prism(turret_objs, BASE, TOP, 0.0, 3.8, RED, 0.45)
for y in (-3.3, 3.3):
    ellipsoid(turret_objs, (-2.6, y, 3.8), (2.1, 2.9, 0.75), HATCH)
box(turret_objs, -8, -1.5, 3.4, -6, 1.5, 4.6, RED_LIGHT, 0.3)
for y in (-2.6, 2.6):
    tube(turret_objs, (4.0, y, 1.8), (14.0, y, 1.8), 1.7, BLACK, 0.0, 32)
    tube(turret_objs, (4.0, y, 1.8), (7.5, y, 1.8), 2.1, BLACK, 0.25, 32)
    tube(turret_objs, (12.2, y, 1.8), (14.0, y, 1.8), 2.0, BLACK, 0.25, 32)
tube(turret_objs, (-6.0, 4.8, 3.6), (-6.0, 4.8, 8.0), 0.85, WHITE, 0.0, 16)
tube(turret_objs, (-6.0, 4.8, 8.0), (-6.0, 4.8, 9.0), 0.9, TIP, 0.0, 16)

hull_pivot = bpy.data.objects.new('hull_pivot', None); bpy.context.collection.objects.link(hull_pivot)
tur_pivot = bpy.data.objects.new('tur_pivot', None); bpy.context.collection.objects.link(tur_pivot)
for o in hull_objs: o.parent = hull_pivot
for o in turret_objs: o.parent = tur_pivot

# ---- the game's sun, soft sky, orthographic camera at 45 degrees from the south
toward = Vector((-0.62, -0.22, 0.75)).normalized()                      # y is north here
sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); bpy.context.collection.objects.link(sun)
sun.data.energy = 4.2; sun.data.angle = math.radians(6)
sun.rotation_euler = (-toward).to_track_quat('-Z', 'Y').to_euler()
sc.world = bpy.data.worlds.new('w'); sc.world.use_nodes = True
bg = sc.world.node_tree.nodes['Background']; bg.inputs[0].default_value = (0.62, 0.68, 0.78, 1); bg.inputs[1].default_value = 0.55
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); bpy.context.collection.objects.link(cam)
cam.data.type = 'ORTHO'; cam.data.ortho_scale = CELL / R
tilt = math.radians(45)
cam.rotation_euler = (tilt, 0, 0); cam.location = (0, -100 * math.sin(tilt), 100 * math.cos(tilt)); cam.data.clip_end = 500
sc.camera = cam
RW = CELL * SS; RH = round(CELL / math.sqrt(2) * SS)
sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 40; sc.cycles.use_denoising = False
sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = RW, RH, 100
sc.render.film_transparent = True; sc.view_settings.view_transform = 'Standard'
sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'
tmp = os.path.join(out, '_cell.png')
sc.render.filepath = tmp

def render_cell():
    bpy.ops.render.render(write_still=True)
    im = Image.open(tmp).convert('RGBA'); im.load()
    return im.resize((CELL, CELL), Image.LANCZOS)

def set_visible(objs, on):
    for o in objs: o.hide_render = not on

# shadow: the group flattened onto the ground with the game's light (x + 0.827 z, y north + 0.293 z)
SHADOW_MAT = bpy.data.materials.new('shadow'); SHADOW_MAT.use_nodes = True
SHADOW_MAT.node_tree.nodes.clear()
em = SHADOW_MAT.node_tree.nodes.new('ShaderNodeEmission'); em.inputs['Color'].default_value = (0, 0, 0, 1)
outn = SHADOW_MAT.node_tree.nodes.new('ShaderNodeOutputMaterial'); SHADOW_MAT.node_tree.links.new(em.outputs[0], outn.inputs[0])
def shadow_object(objs):
    dg = bpy.context.evaluated_depsgraph_get()
    verts, faces, base = [], [], 0
    for o in objs:
        me = o.data
        for v in me.vertices:
            w = o.matrix_world @ v.co
            verts.append((w.x + 0.827 * w.z, w.y + 0.293 * w.z, 0.02))
        for p in me.polygons:
            faces.append(tuple(base + i for i in p.vertices))
        base += len(me.vertices)
    sm = bpy.data.meshes.new('shadow'); sm.from_pydata(verts, [], faces)
    so = bpy.data.objects.new('shadow', sm); bpy.context.collection.objects.link(so); so.data.materials.append(SHADOW_MAT)
    return so

hull_sheet = Image.new('RGBA', (COLS * CELL, (NF // COLS) * CELL)); tur_sheet = hull_sheet.copy(); sh_sheet = hull_sheet.copy()
for i in range(NF):
    a = i * 2 * math.pi / NF
    hull_pivot.rotation_euler.z = -a; tur_pivot.rotation_euler.z = -a      # game angles turn clockwise on screen, Blender's turn counter-clockwise
    bpy.context.view_layer.update()
    pos = ((i % COLS) * CELL, (i // COLS) * CELL)
    set_visible(hull_objs, True); set_visible(turret_objs, False)
    hull_sheet.paste(render_cell(), pos)
    set_visible(hull_objs, False); set_visible(turret_objs, True)
    tur_sheet.paste(render_cell(), pos)
    set_visible(hull_objs, False); set_visible(turret_objs, False)
    so = shadow_object(hull_objs)                                           # the hull's shadow, as the voxel sprite has
    sh = render_cell()
    bpy.data.objects.remove(so, do_unlink=True)
    sh_sheet.paste(sh, pos)
    print('facing', i, flush=True) if i % 8 == 0 else None
hull_sheet.save(os.path.join(out, 'hull.png')); tur_sheet.save(os.path.join(out, 'turret.png')); sh_sheet.save(os.path.join(out, 'shadow.png'))
# a quick contact sheet: hull + turret over a grass-coloured ground, 8 facings
prev = Image.new('RGBA', (8 * CELL, CELL), (92, 107, 58, 255))
for k in range(8):
    f = k * (NF // 8); pos = ((f % COLS) * CELL, (f // COLS) * CELL); box_ = (pos[0], pos[1], pos[0] + CELL, pos[1] + CELL)
    cell = Image.new('RGBA', (CELL, CELL), (0, 0, 0, 0))
    sh = sh_sheet.crop(box_); sh.putalpha(sh.getchannel('A').point(lambda v: int(v * 0.45)))
    cell.alpha_composite(sh)
    cell.alpha_composite(hull_sheet.crop(box_))
    t = tur_sheet.crop(box_); a = f * 2 * math.pi / NF
    off = (round(-1 * math.cos(a) * R), round(-1 * math.sin(a) * R - 6 * R))   # the game's turret offset: 1 behind the hull centre, 6 up
    cell.alpha_composite(t, (off[0], off[1]))
    prev.alpha_composite(cell, (k * CELL, 0))
prev.save(os.path.join(out, 'preview.png'))
os.remove(tmp)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out, 'htank_smooth.blend'))
print('done', NF, 'facings')
