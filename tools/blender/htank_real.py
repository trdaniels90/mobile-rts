"""Realism test: the Soviet Heavy Tank modelled in detail with weathered physically based materials, rendered as large stills.
python3 -I tools/blender/htank_real.py <out_dir> [width=1400] [samples=128]   ->  real_3q.png, real_side.png, real_rear.png, htank_real.blend
Not used by the game: it is a still to judge the look. Cycles on the CPU, a Nishita sky for light, a perspective camera."""
import math, os, sys
import bpy, bmesh
import numpy as np
from PIL import Image
from mathutils import Vector, Euler
EXPOSURE = 1.0

out = sys.argv[1]
RW = int(sys.argv[2]) if len(sys.argv) > 2 else 1400
SAMPLES = int(sys.argv[3]) if len(sys.argv) > 3 else 128
RH = round(RW * 0.64)
os.makedirs(out, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene

def lin(c):
    c = c / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
def col(h):
    return (lin(int(h[1:3], 16)), lin(int(h[3:5], 16)), lin(int(h[5:7], 16)), 1.0)

# ------------------------------------------------------------------ weathered materials (all procedural)
def N(nt, kind, **kw):
    n = nt.nodes.new(kind)
    for k, v in kw.items():
        setattr(n, k, v)
    return n
def L(nt, a, b):
    nt.links.new(a, b)
def mix(nt, fac, a, b, kind='RGBA'):
    m = nt.nodes.new('ShaderNodeMix'); m.data_type = kind
    ia, ib, io = (6, 7, 2) if kind == 'RGBA' else (2, 3, 0)
    if isinstance(fac, (int, float)): m.inputs[0].default_value = fac
    else: L(nt, fac, m.inputs[0])
    for idx, v in ((ia, a), (ib, b)):
        if isinstance(v, (tuple, list)): m.inputs[idx].default_value = v
        elif isinstance(v, (int, float)): m.inputs[idx].default_value = v
        else: L(nt, v, m.inputs[idx])
    return m.outputs[io]
def rng(nt, val, a, b, c=0.0, d=1.0, clamp=True):
    m = N(nt, 'ShaderNodeMapRange'); m.clamp = clamp
    m.inputs['From Min'].default_value = a; m.inputs['From Max'].default_value = b; m.inputs['To Min'].default_value = c; m.inputs['To Max'].default_value = d
    L(nt, val, m.inputs['Value']); return m.outputs['Result']
def mul(nt, a, b):
    m = N(nt, 'ShaderNodeMath', operation='MULTIPLY')
    for i, v in enumerate((a, b)):
        if isinstance(v, (int, float)): m.inputs[i].default_value = v
        else: L(nt, v, m.inputs[i])
    return m.outputs[0]

def weathered(name, base, rough=0.6, metal=0.0, wear=1.0, dirt=1.0, mud=1.0, rust=0.0, bump=0.25, edge='#58524a'):
    if os.environ.get('NOWEAR'): wear = dirt = mud = rust = 0.0     # debugging: the bare paint
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; nt.nodes.clear()
    out_n = N(nt, 'ShaderNodeOutputMaterial'); bsdf = N(nt, 'ShaderNodeBsdfPrincipled')
    L(nt, bsdf.outputs[0], out_n.inputs[0])
    bsdf.inputs['Specular IOR Level'].default_value = 0.22 if metal < 0.5 else 0.5     # paint reflects less sky
    geo = N(nt, 'ShaderNodeNewGeometry'); tc = N(nt, 'ShaderNodeTexCoord')
    big = N(nt, 'ShaderNodeTexNoise'); big.inputs['Scale'].default_value = 2.5; big.inputs['Detail'].default_value = 6
    mid = N(nt, 'ShaderNodeTexNoise'); mid.inputs['Scale'].default_value = 11; mid.inputs['Detail'].default_value = 10
    fine = N(nt, 'ShaderNodeTexNoise'); fine.inputs['Scale'].default_value = 140; fine.inputs['Detail'].default_value = 5
    streak = N(nt, 'ShaderNodeTexNoise'); streak.inputs['Scale'].default_value = 7; streak.inputs['Detail'].default_value = 6
    mp = N(nt, 'ShaderNodeMapping'); mp.inputs['Scale'].default_value = (3.0, 3.0, 0.35)
    for n_ in (big, mid, fine): L(nt, tc.outputs['Object'], n_.inputs['Vector'])
    L(nt, tc.outputs['Object'], mp.inputs['Vector']); L(nt, mp.outputs[0], streak.inputs['Vector'])
    ao = N(nt, 'ShaderNodeAmbientOcclusion'); ao.inputs['Distance'].default_value = 1.4; ao.samples = 8
    bev = N(nt, 'ShaderNodeBevel'); bev.inputs['Radius'].default_value = 0.14; bev.samples = 6
    dot = N(nt, 'ShaderNodeVectorMath', operation='DOT_PRODUCT'); L(nt, bev.outputs[0], dot.inputs[0]); L(nt, geo.outputs['Normal'], dot.inputs[1])
    edge_m = rng(nt, dot.outputs['Value'], 0.995, 0.93)                                    # edges: where the bevelled normal leans away
    chip = mul(nt, edge_m, rng(nt, mid.outputs['Fac'], 0.36, 0.52, 0.0, 1.0)); chip = mul(nt, chip, wear * 1.5)
    crev = rng(nt, ao.outputs['AO'], 0.85, 0.15)                                            # crevices: ambient occlusion
    dust = mul(nt, mul(nt, crev, rng(nt, big.outputs['Fac'], 0.3, 0.7, 0.4, 1.0)), dirt)
    sep = N(nt, 'ShaderNodeSeparateXYZ'); L(nt, geo.outputs['Position'], sep.inputs[0])
    low = rng(nt, sep.outputs['Z'], 5.0, 0.3, 0.0, 1.0)                                     # low down: mud thrown up from the ground
    mudm = mul(nt, mul(nt, low, rng(nt, mid.outputs['Fac'], 0.25, 0.55, 0.3, 1.4)), mud)
    rustm = mul(nt, rng(nt, streak.outputs['Fac'], 0.52, 0.72), rust)
    nz = N(nt, 'ShaderNodeSeparateXYZ'); L(nt, geo.outputs['Normal'], nz.inputs[0])
    topdust = mul(nt, mul(nt, rng(nt, nz.outputs['Z'], 0.6, 1.0, 0.0, 0.3), rng(nt, mid.outputs['Fac'], 0.35, 0.65, 0.3, 1.0)), dirt)   # dust settled on upward faces
    flake = mul(nt, rng(nt, fine.outputs['Fac'], 0.60, 0.66), wear * 0.7)                    # speckles of paint flaked off
    sun = rng(nt, big.outputs['Fac'], 0.3, 0.7, 0.0, 0.28)                                      # sun-faded patches
    c = mix(nt, sun, col(base), col('#a0503f') if sum(col(base)[:3]) > 0.15 else col(base))
    c = mix(nt, mul(nt, rustm, rng(nt, big.outputs['Fac'], 0.4, 0.6)), c, col('#6b3a1c'))
    c = mix(nt, flake, c, col('#3e3a35'))
    c = mix(nt, chip, c, col(edge))
    c = mix(nt, dust, c, col('#5e4c3a'))
    c = mix(nt, topdust, c, col('#7a6650'))
    c = mix(nt, mudm, c, col('#5a4630'))
    L(nt, c, bsdf.inputs['Base Color'])
    r = mix(nt, 1.0, rough, rough, 'FLOAT')
    r = mix(nt, chip, r, 0.38, 'FLOAT'); r = mix(nt, dust, r, 0.95, 'FLOAT'); r = mix(nt, topdust, r, 0.92, 'FLOAT'); r = mix(nt, mudm, r, 1.0, 'FLOAT')
    L(nt, r, bsdf.inputs['Roughness'])
    mt = mix(nt, chip, metal, 0.85, 'FLOAT'); mt = mix(nt, mul(nt, dust, 1.0), mt, 0.0, 'FLOAT'); mt = mix(nt, mudm, mt, 0.0, 'FLOAT'); mt = mix(nt, topdust, mt, 0.0, 'FLOAT')
    L(nt, mt, bsdf.inputs['Metallic'])
    bp = N(nt, 'ShaderNodeBump'); bp.inputs['Strength'].default_value = bump; bp.inputs['Distance'].default_value = 0.2
    hgt = mix(nt, mudm, fine.outputs['Fac'], mid.outputs['Fac'], 'FLOAT')
    L(nt, hgt, bp.inputs['Height']); L(nt, bp.outputs[0], bsdf.inputs['Normal'])
    return m

PAINT = weathered('paint', '#7a170d', 0.55, 0.0, wear=1.0, dirt=1.0, mud=1.0, rust=0.35)
PAINT_LIGHT = weathered('paint_light', '#93301f', 0.55, 0.0, wear=1.0, dirt=1.0, mud=0.9, rust=0.25)
PAINT_DARK = weathered('paint_dark', '#4a120b', 0.6, 0.0, wear=0.8, dirt=1.0, mud=1.0, rust=0.3)
STEEL = weathered('steel', '#3a3d3f', 0.45, 0.85, wear=0.0, dirt=0.8, mud=0.8, rust=0.25, bump=0.15)
GUN = weathered('gun', '#26282a', 0.38, 0.9, wear=0.0, dirt=0.5, mud=0.0, rust=0.1, bump=0.1)
TRACK = weathered('track', '#2f302e', 0.55, 0.8, wear=1.0, dirt=1.2, mud=1.4, rust=0.7, bump=0.3, edge='#8a857a')
RUBBER = weathered('rubber', '#1a1a19', 0.85, 0.0, wear=0.0, dirt=1.0, mud=1.2, rust=0.0, bump=0.2)
OLIVE = weathered('canvas', '#4b5130', 0.9, 0.0, wear=0.0, dirt=1.3, mud=1.0, rust=0.0, bump=0.35)
WHITE = weathered('white', '#cfcac0', 0.6, 0.0, wear=1.0, dirt=1.2, mud=0.3, rust=0.1, bump=0.1)
REDTIP = weathered('redtip', '#8a1a10', 0.6, 0.0, wear=1.0, dirt=0.6, mud=0.0, rust=0.0, bump=0.1)
GLASS = bpy.data.materials.new('glass'); GLASS.use_nodes = True
gb = GLASS.node_tree.nodes['Principled BSDF']; gb.inputs['Base Color'].default_value = col('#16201c'); gb.inputs['Roughness'].default_value = 0.08; gb.inputs['Metallic'].default_value = 0.0

# ------------------------------------------------------------------ geometry helpers (x forward, y left, z up)
def finish(obj, mat, bevel=0.25, angle=35.0):
    bpy.context.view_layer.objects.active = obj
    for o in bpy.context.selected_objects: o.select_set(False)
    obj.select_set(True)
    if bevel > 0:
        md = obj.modifiers.new('bevel', 'BEVEL'); md.width = bevel; md.segments = 3; md.limit_method = 'ANGLE'; md.angle_limit = math.radians(30)
        bpy.ops.object.modifier_apply(modifier='bevel')
    bm = bmesh.new(); bm.from_mesh(obj.data); bm.normal_update()
    for e in bm.edges:
        if len(e.link_faces) == 2 and e.calc_face_angle(0.0) > math.radians(angle): e.smooth = False
    for f in bm.faces: f.smooth = True
    bm.to_mesh(obj.data); bm.free()
    obj.data.materials.clear(); obj.data.materials.append(mat)
    return obj
def cube(x0, y0, z0, x1, y1, z1, mat, bevel=0.25, rot=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2))
    o = bpy.context.object; o.scale = (x1 - x0, y1 - y0, z1 - z0); bpy.ops.object.transform_apply(scale=True)
    if rot: o.rotation_euler = rot; bpy.ops.object.transform_apply(rotation=True)
    return finish(o, mat, bevel)
def tube(a, b, r, mat, bevel=0.0, verts=32):
    a, b = Vector(a), Vector(b); d = b - a
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=d.length, location=(a + b) / 2)
    o = bpy.context.object; o.rotation_euler = d.to_track_quat('Z', 'Y').to_euler(); bpy.ops.object.transform_apply(rotation=True)
    return finish(o, mat, bevel)
def ball(c, radii, mat):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=1, location=c)
    o = bpy.context.object; o.scale = radii; bpy.ops.object.transform_apply(scale=True)
    return finish(o, mat, 0.0, 90.0)
def prism(bottom, top, z0, z1, mat, bevel=0.3):
    bm = bmesh.new()
    for x, y in bottom: bm.verts.new((x, y, z0))
    for x, y in top: bm.verts.new((x, y, z1))
    bmesh.ops.convex_hull(bm, input=bm.verts[:])
    me = bpy.data.meshes.new('prism'); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new('prism', me); bpy.context.collection.objects.link(o)
    return finish(o, mat, bevel)
def bolts(points, z, r, mat, h=0.18):
    for x, y in points:
        tube((x, y, z), (x, y, z + h), r, mat, 0.0, 10)

# ------------------------------------------------------------------ hull
for s in (-1, 1):
    # track: a stadium loop of individual links around the sprocket (rear) and idler (front)
    xr, xf, rr, rz = -11.5, 9.0, 2.5, 2.5
    run = xf - xr; arc = math.pi * rr; per = 2 * run + 2 * arc; n = int(per / 0.95); pitch = per / n
    link = cube(-0.4, -1.45, -0.22, 0.4, 1.45, 0.22, TRACK, 0.07)
    horn = cube(-0.12, -0.35, 0.2, 0.12, 0.35, 0.55, STEEL, 0.04)
    pin = tube((-0.5, -1.5, 0.0), (-0.5, 1.5, 0.0), 0.16, STEEL, 0.0, 10)
    for i in range(n):
        d = i * pitch
        if d < run: x, z, th = xr + d, 0.0, 0.0
        elif d < run + arc: a = (d - run) / rr - math.pi / 2; x, z, th = xf + rr * math.cos(a), rz + rr * math.sin(a), a + math.pi / 2
        elif d < 2 * run + arc: x, z, th = xf - (d - run - arc), 2 * rr, math.pi
        else: a = (d - 2 * run - arc) / rr + math.pi / 2; x, z, th = xr + rr * math.cos(a), rz + rr * math.sin(a), a + math.pi / 2
        for proto in (link, horn, pin):
            o = proto.copy(); o.data = proto.data; bpy.context.collection.objects.link(o)
            o.location = (x, s * 7.1, z); o.rotation_euler = (0, -th, 0)
    for proto in (link, horn, pin): bpy.data.objects.remove(proto, do_unlink=True)
    for x in (-8.0, -5.0, -2.0, 1.0, 4.0, 7.0):                                        # road wheels with bolted hubs
        tube((x, s * 6.0, 2.3), (x, s * 7.9, 2.3), 1.75, STEEL, 0.1, 32)
        tube((x, s * 7.7, 2.3), (x, s * 8.15, 2.3), 0.85, PAINT_DARK, 0.06, 20)
        for k in range(6):
            a = k * math.pi / 3; tube((x + 0.55 * math.cos(a), s * 8.1, 2.3 + 0.55 * math.sin(a)), (x + 0.55 * math.cos(a), s * 8.3, 2.3 + 0.55 * math.sin(a)), 0.1, STEEL, 0.0, 8)
    tube((xr, s * 6.0, rz), (xr, s * 7.9, rz), 2.45, STEEL, 0.1, 32)                    # drive sprocket
    tube((xf, s * 6.0, rz), (xf, s * 7.9, rz), 2.3, STEEL, 0.1, 32)                     # idler
    cube(-14, s * 6.6 - 0.1, 5.0, 10.4, s * 8.5, 5.45, PAINT, 0.2)                      # mudguard over the track
    for k in range(5):                                                                  # side armour plates, hung from the guard
        x0 = -13.6 + k * 4.9
        cube(x0, s * 8.1, 2.9, x0 + 4.6, s * 8.45, 4.95, PAINT, 0.15)
        bolts([(x0 + 0.5, s * 8.45), (x0 + 4.1, s * 8.45)], 3.6, 0.15, STEEL)
cube(-13.5, -6.3, 1.6, 9.5, 6.3, 4.8, PAINT, 0.4)                                       # lower hull
cube(-13.2, -6.6, 4.8, 8.6, 6.6, 6.1, PAINT_LIGHT, 0.35)                                # upper hull and deck
prism([(8.4, -6.8), (8.4, 6.8), (11.6, 5.6), (11.6, -5.6)], [(8.4, -6.0), (8.4, 6.0), (9.6, 5.2), (9.6, -5.2)], 1.7, 4.9, PAINT_LIGHT, 0.3)   # glacis
cube(9.7, -3.0, 4.9, 10.4, 3.0, 5.3, STEEL, 0.1)                                        # tow bar
for x in (-8.0, -3.0, 2.0, 6.0):
    cube(x, -6.5, 6.1, x + 0.22, 6.5, 6.28, PAINT_DARK, 0.04)                           # weld seams across the deck
bolts([(x, y) for x in (-12.5, -6.0, 0.5, 7.5) for y in (-6.2, 6.2)], 6.1, 0.17, STEEL)
cube(-13.2, -5.0, 6.1, -8.8, 5.0, 7.0, PAINT_DARK, 0.25)                                # engine deck
for i in range(9):
    cube(-12.8 + i * 0.42, -4.4, 7.0, -12.8 + i * 0.42 + 0.22, 4.4, 7.2, STEEL, 0.03)  # grille slats
for y in (-3.2, 3.2):                                                                   # exhausts with heat shields
    tube((-13.4, y, 5.6), (-13.4, y, 7.4), 0.55, STEEL, 0.0, 16); tube((-13.4, y, 6.4), (-13.4, y, 7.6), 0.75, PAINT_DARK, 0.0, 16)
for y in (-4.2, 4.2):                                                                   # fuel drums with rolling hoops
    tube((-10.0, y - 1.6, 7.9), (-10.0, y + 1.6, 7.9), 1.05, OLIVE, 0.05, 32)
    for k in (-1.0, 0.0, 1.0): tube((-10.0, y + k * 1.1 - 0.06, 7.9), (-10.0, y + k * 1.1 + 0.06, 7.9), 1.12, STEEL, 0.0, 32)
cube(-7.5, -2.6, 6.1, -4.2, 2.6, 7.1, OLIVE, 0.45)                            # tarpaulin roll and straps
for x in (-7.0, -4.8): cube(x, -2.7, 6.9, x + 0.25, 2.7, 7.25, STEEL, 0.05)
cube(3.5, 6.2, 6.1, 7.5, 6.65, 6.45, STEEL, 0.1); tube((3.4, 6.45, 6.35), (7.6, 6.45, 6.35), 0.12, OLIVE, 0.0, 8)   # shovel and its handle on the right fender
for y in (-5.6, 5.6):                                                                   # headlights with guards
    tube((9.2, y, 5.4), (9.9, y, 5.4), 0.55, STEEL, 0.05, 20); tube((9.85, y, 5.4), (9.95, y, 5.4), 0.42, GLASS, 0.0, 20)
    cube(9.1, y - 0.75, 5.7, 10.1, y + 0.75, 5.85, STEEL, 0.03)

# ------------------------------------------------------------------ turret
TZ = 6.15
BASE = [(-9.0, -6.9), (-9.0, 6.9), (-6.5, 8.0), (-0.5, 8.0), (3.4, 5.8), (5.6, 4.3), (5.6, -4.3), (3.4, -5.8), (-0.5, -8.0), (-6.5, -8.0)]
TOP = [(-8.0, -5.7), (-8.0, 5.7), (-6.0, 6.7), (-0.5, 6.7), (2.8, 4.7), (4.6, 3.4), (4.6, -3.4), (2.8, -4.7), (-0.5, -6.7), (-6.0, -6.7)]
tube((-2.0, 0, TZ - 0.2), (-2.0, 0, TZ + 0.5), 7.6, STEEL, 0.1, 48)                      # turret ring
prism(BASE, TOP, TZ, TZ + 3.9, PAINT, 0.4)
for y in (-1, 1):                                                                        # weld seams down the roof
    cube(-7.6, y * 3.3 - 0.1, TZ + 3.88, 4.0, y * 3.3 + 0.1, TZ + 4.05, PAINT_DARK, 0.03)
cube(5.1, -4.0, TZ + 0.5, 6.9, 4.0, TZ + 3.3, PAINT_DARK, 0.5)                           # mantlet
cube(-8.6, -4.6, TZ + 0.5, -6.4, 4.6, TZ + 3.2, PAINT_DARK, 0.35)                        # stowage bin on the back of the turret
for y in (-2.9, 2.9): cube(-8.7, y - 0.12, TZ + 0.6, -8.45, y + 0.12, TZ + 3.1, STEEL, 0.04)
for y in (-2.6, 2.6):                                                                    # twin guns
    tube((5.0, y, TZ + 1.9), (14.2, y, TZ + 1.9), 1.45, GUN, 0.0, 40)
    tube((4.8, y, TZ + 1.9), (7.8, y, TZ + 1.9), 1.85, GUN, 0.2, 40)                      # thick breech housing
    tube((9.6, y, TZ + 1.9), (11.4, y, TZ + 1.9), 1.65, GUN, 0.12, 40)                   # fume extractor
    tube((12.6, y, TZ + 1.9), (14.4, y, TZ + 1.9), 1.7, STEEL, 0.25, 40)                # muzzle brake
    for k in range(3): cube(12.9 + k * 0.5, y - 2.0, TZ + 1.9 - 0.12, 13.1 + k * 0.5, y + 2.0, TZ + 1.9 + 0.12, GUN, 0.02)   # its slots
# the cupola and the loader's hatch
tube((-3.5, -3.0, TZ + 3.8), (-3.5, -3.0, TZ + 4.9), 2.15, PAINT_DARK, 0.15, 36)
tube((-3.5, -3.0, TZ + 4.6), (-3.5, -3.0, TZ + 5.1), 2.0, STEEL, 0.1, 36)
for k in range(8):                                                                       # vision blocks round the cupola
    a = k * math.pi / 4 + 0.2
    cube(-3.5 + 2.05 * math.cos(a) - 0.3, -3.0 + 2.05 * math.sin(a) - 0.3, TZ + 4.7, -3.5 + 2.05 * math.cos(a) + 0.3, -3.0 + 2.05 * math.sin(a) + 0.3, TZ + 5.2, GLASS, 0.04)
tube((-3.5, -3.0, TZ + 5.0), (-3.5, -3.0, TZ + 5.4), 1.55, PAINT_DARK, 0.1, 32)
tube((-3.5, -3.0, TZ + 5.6), (-0.6, -3.0, TZ + 5.9), 0.22, GUN, 0.0, 12)                # machine gun
cube(-3.9, -3.2, TZ + 5.6, -3.3, -2.8, TZ + 6.3, STEEL, 0.04)
tube((-3.5, 3.0, TZ + 3.8), (-3.5, 3.0, TZ + 4.5), 1.95, PAINT_DARK, 0.15, 36)         # loader's hatch
tube((-3.5, 3.0, TZ + 4.4), (-3.5, 3.0, TZ + 4.9), 1.5, PAINT, 0.12, 36)
cube(-3.9, 2.9, TZ + 4.9, -3.1, 3.1, TZ + 5.2, STEEL, 0.04)
for s in (-1, 1):                                                                        # smoke grenade launchers on the front corners
    for k in range(3): tube((3.0 + k * 0.0, s * (5.0 + k * 0.55), TZ + 2.6), (4.0, s * (5.0 + k * 0.55), TZ + 3.0), 0.28, STEEL, 0.0, 12)
tube((-6.0, 4.8, TZ + 3.8), (-6.0, 4.8, TZ + 4.3), 0.5, STEEL, 0.0, 16)                  # the antenna: base, white mast, red tip
tube((-6.0, 4.8, TZ + 4.3), (-6.0, 4.8, TZ + 9.2), 0.2, WHITE, 0.0, 12)
tube((-6.0, 4.8, TZ + 8.5), (-6.0, 4.8, TZ + 9.2), 0.22, REDTIP, 0.0, 12)

# ------------------------------------------------------------------ ground, sky, cameras
bpy.ops.mesh.primitive_plane_add(size=400, location=(0, 0, 0)); gnd = bpy.context.object
gm = bpy.data.materials.new('ground'); gm.use_nodes = True; nt = gm.node_tree; nt.nodes.clear()
o_ = N(nt, 'ShaderNodeOutputMaterial'); b_ = N(nt, 'ShaderNodeBsdfPrincipled'); L(nt, b_.outputs[0], o_.inputs[0])
tcg = N(nt, 'ShaderNodeTexCoord')
n1 = N(nt, 'ShaderNodeTexNoise'); n1.inputs['Scale'].default_value = 0.35; n1.inputs['Detail'].default_value = 8
n2 = N(nt, 'ShaderNodeTexNoise'); n2.inputs['Scale'].default_value = 3.0; n2.inputs['Detail'].default_value = 10
n3 = N(nt, 'ShaderNodeTexNoise'); n3.inputs['Scale'].default_value = 30.0; n3.inputs['Detail'].default_value = 6
vo = N(nt, 'ShaderNodeTexVoronoi'); vo.inputs['Scale'].default_value = 16.0
for n_ in (n1, n2, n3, vo): L(nt, tcg.outputs['Object'], n_.inputs['Vector'])
earth = mix(nt, rng(nt, n2.outputs['Fac'], 0.3, 0.7), col('#4a3322'), col('#7a5c3c'))
grass = mix(nt, rng(nt, n1.outputs['Fac'], 0.52, 0.62), earth, col('#3f4c25'))
stones = mix(nt, rng(nt, vo.outputs['Distance'], 0.075, 0.04), grass, col('#7a7264'))
L(nt, stones, b_.inputs['Base Color']); b_.inputs['Roughness'].default_value = 0.93
bp = N(nt, 'ShaderNodeBump'); bp.inputs['Strength'].default_value = 0.6; bp.inputs['Distance'].default_value = 0.4
hh = mix(nt, 0.5, n3.outputs['Fac'], vo.outputs['Distance'], 'FLOAT'); L(nt, hh, bp.inputs['Height']); L(nt, bp.outputs[0], b_.inputs['Normal'])
gnd.data.materials.append(gm)

w = bpy.data.worlds.new('sky'); sc.world = w; w.use_nodes = True; wn = w.node_tree; wn.nodes.clear()
sky = N(wn, 'ShaderNodeTexSky'); sky.sky_type = 'MULTIPLE_SCATTERING'; sky.sun_elevation = math.radians(40); sky.sun_rotation = math.radians(250); sky.sun_disc = False; sky.air_density = 1.0
bgn = N(wn, 'ShaderNodeBackground'); bgn.inputs['Strength'].default_value = 0.3; wo = N(wn, 'ShaderNodeOutputWorld')
L(wn, sky.outputs[0], bgn.inputs[0]); L(wn, bgn.outputs[0], wo.inputs[0])
sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); bpy.context.collection.objects.link(sun)
sun.data.energy = 3.4; sun.data.angle = math.radians(0.9); sun.data.color = (1.0, 0.93, 0.82)

cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); bpy.context.collection.objects.link(cam)
cam.data.lens = 42; sc.camera = cam
sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = SAMPLES
try:
    sc.cycles.use_denoising = True; sc.cycles.denoiser = 'OPENIMAGEDENOISE'
except Exception as e:
    print('no denoiser', e)
sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = RW, RH, 100
sc.view_settings.view_transform = 'Raw'      # render linear 16-bit and tone map below
sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_depth = '16'; sc.render.image_settings.color_mode = 'RGB'
VIEWS = {'3q': ((29, 27, 12.5), (-1.5, 0, 4.2)), 'side': ((-1, 46, 7.5), (-1.5, 0, 4.4)), 'rear': ((-33, -24, 13), (-1.0, 0, 4.2))}
for name, (loc, tgt) in VIEWS.items():
    cam.location = loc
    h = Vector((loc[0] - tgt[0], loc[1] - tgt[1], 0)).normalized(); c_, s_ = math.cos(math.radians(55)), math.sin(math.radians(55))
    toward = Vector((h.x * c_ - h.y * s_, h.x * s_ + h.y * c_, 0)) * 0.72 + Vector((0, 0, 0.69))   # the key light: from the camera's left and above
    sun.rotation_euler = (-toward).to_track_quat('-Z', 'Y').to_euler()
    cam.rotation_euler = (Vector(tgt) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    raw = os.path.join(out, '_raw_%s.png' % name)
    sc.render.filepath = raw
    bpy.ops.render.render(write_still=True)
    bi = bpy.data.images.load(raw); bi.colorspace_settings.name = 'Non-Color'                   # the linear values as written
    arr = np.array(bi.pixels[:], dtype=np.float32).reshape(RH, RW, 4)[::-1, :, :3]
    bpy.data.images.remove(bi)
    x = arr * EXPOSURE
    print('p50/p99', float(np.percentile(x, 50)), float(np.percentile(x, 99)), flush=True)
    x = x * (1 + x / 6.0) / (1 + x)                                               # a soft shoulder (extended Reinhard): keeps red red
    x = np.clip(x, 0, 1); x = np.where(x <= 0.0031308, 12.92 * x, 1.055 * np.power(x, 1 / 2.4) - 0.055)
    Image.fromarray((np.clip(x, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGB').save(os.path.join(out, 'real_%s.png' % name))
    os.remove(raw)
    print('rendered', name, flush=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out, 'htank_real.blend'))
