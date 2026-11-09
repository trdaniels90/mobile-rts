"""Grass for the ground, modelled in Blender: a tileable field of curved, tapered blades rendered from above
with the game's light, reduced to a tile of tone values the terrain painter uses.
python3 -I tools/blender/grass.py <out_dir> [tile=128] [blades=2600]   ->  grass_render.png, grass_tile.txt (tile*tile digits 0-9), grass.js (the constant for art.js), grass_tile_preview.png
(Cycles on the CPU; takes a minute.)"""
import math, os, random, sys
import bpy, bmesh
import numpy as np
from mathutils import Vector

out = sys.argv[1]
T = int(sys.argv[2]) if len(sys.argv) > 2 else 128          # tile size in game pixels
NB = int(sys.argv[3]) if len(sys.argv) > 3 else 6500        # blades per tile
SS = 3                                                      # supersampling
os.makedirs(out, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
rnd = random.Random(11)

# ---- blades: six rings, tapering, bending over; wrapped copies so the tile repeats seamlessly
verts, faces, cols = [], [], []
def hsv(h, s, v):
    import colorsys
    return colorsys.hsv_to_rgb(h, s, v)
def blade(bx, by):
    L = rnd.uniform(3.2, 7.5)                                # length in game pixels
    yaw = rnd.uniform(0, 2 * math.pi)
    th0 = math.radians(rnd.uniform(8, 38))                   # lean from vertical at the base
    bend = math.radians(rnd.uniform(25, 70))                 # bends further over towards the tip
    w0 = rnd.uniform(0.55, 0.95)
    hue = rnd.uniform(0.22, 0.31); sat = rnd.uniform(0.55, 0.8); val = rnd.uniform(0.3, 0.55)
    dirx, diry = math.cos(yaw), math.sin(yaw)
    px, py = -diry, dirx
    ring = []
    x, y, z = bx, by, 0.0
    n = 6
    for i in range(n):
        t = i / (n - 1)
        th = th0 + bend * t
        if i:
            seg = L / (n - 1)
            x += dirx * math.sin(th) * seg; y += diry * math.sin(th) * seg; z += math.cos(th) * seg
        w = w0 * (1 - 0.92 * t) * 0.5
        c = hsv(hue + 0.02 * t, sat - 0.1 * t, min(1, val * (0.65 + 0.9 * t)))
        base = len(verts)
        verts.append((x + px * w, y + py * w, z)); verts.append((x - px * w, y - py * w, z))
        cols.append(c); cols.append(c)
        ring.append(base)
    for i in range(n - 1):
        a, b = ring[i], ring[i + 1]
        faces.append((a, a + 1, b + 1, b))
for _ in range(NB):
    bx, by = rnd.uniform(0, T), rnd.uniform(0, T)
    # same blade geometry at every wrapped offset: rebuild with the same random state
    state = rnd.getstate()
    for ox in (-T, 0, T):
        for oy in (-T, 0, T):
            if -8 < bx + ox < T + 8 and -8 < by + oy < T + 8:
                rnd.setstate(state)
                blade(bx + ox, by + oy)
    rnd.setstate(state); [rnd.random() for _ in range(8)]
mesh = bpy.data.meshes.new('blades'); mesh.from_pydata(verts, [], faces)
attr = mesh.color_attributes.new('c', 'FLOAT_COLOR', 'POINT')
for i, c in enumerate(cols):
    attr.data[i].color = (c[0], c[1], c[2], 1)
obj = bpy.data.objects.new('blades', mesh); bpy.context.collection.objects.link(obj)
ground = bpy.data.objects.new('ground', bpy.data.meshes.new('g')); bpy.context.collection.objects.link(ground)
gm = ground.data; gm.from_pydata([(-40, -40, -0.01), (T + 40, -40, -0.01), (T + 40, T + 40, -0.01), (-40, T + 40, -0.01)], [], [(0, 1, 2, 3)])

def mat(name, rough):
    m = bpy.data.materials.new(name); m.use_nodes = True
    return m
m = mat('blade', 0.8); nt = m.node_tree; nt.nodes.clear()
ca = nt.nodes.new('ShaderNodeVertexColor'); ca.layer_name = 'c'
bs = nt.nodes.new('ShaderNodeBsdfDiffuse'); o = nt.nodes.new('ShaderNodeOutputMaterial')
nt.links.new(ca.outputs[0], bs.inputs[0]); nt.links.new(bs.outputs[0], o.inputs[0])
obj.data.materials.append(m)
g = mat('earth', 1.0); nt = g.node_tree; nt.nodes.clear()
bs = nt.nodes.new('ShaderNodeBsdfDiffuse'); bs.inputs[0].default_value = (0.03, 0.045, 0.02, 1); o = nt.nodes.new('ShaderNodeOutputMaterial')
nt.links.new(bs.outputs[0], o.inputs[0]); ground.data.materials.append(g)

# ---- the game's sun (voxel.js LIGHT = [-0.62, 0.22, 0.75] toward the light, y south); here y is up the picture
toward = Vector((-0.62, -0.22, 0.75)).normalized()
sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); bpy.context.collection.objects.link(sun)
sun.data.energy = 3.2; sun.data.angle = math.radians(8)
sun.rotation_euler = (-toward).to_track_quat('-Z', 'Y').to_euler()
sc = bpy.context.scene
sc.world = bpy.data.worlds.new('w'); sc.world.use_nodes = True
sc.world.node_tree.nodes['Background'].inputs[0].default_value = (0.55, 0.62, 0.7, 1); sc.world.node_tree.nodes['Background'].inputs[1].default_value = 0.35
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); bpy.context.collection.objects.link(cam)
cam.data.type = 'ORTHO'; cam.data.ortho_scale = T; cam.location = (T / 2, T / 2, 40); cam.rotation_euler = (0, 0, 0)
sc.camera = cam
sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 24; sc.cycles.use_denoising = False
sc.render.resolution_x = sc.render.resolution_y = T * SS; sc.render.resolution_percentage = 100
sc.view_settings.view_transform = 'Standard'
sc.render.filepath = os.path.join(out, 'grass_render.png'); sc.render.image_settings.file_format = 'PNG'
bpy.ops.render.render(write_still=True)

# ---- reduce to a tile of tone values (0-9): luminance, box-filtered to game pixels, stretched
img = bpy.data.images.load(os.path.join(out, 'grass_render.png'))
a = np.array(img.pixels[:], dtype=np.float32).reshape(T * SS, T * SS, 4)[..., :3]
lum = (0.3 * a[..., 0] + 0.59 * a[..., 1] + 0.11 * a[..., 2])[::-1]            # Blender rows run bottom-up
lum = lum.reshape(T, SS, T, SS).mean(axis=(1, 3))
lo, hi = np.percentile(lum, 2), np.percentile(lum, 98)
tone = np.clip((lum - lo) / (hi - lo), 0, 1)
open(os.path.join(out, 'grass_tile.txt'), 'w').write(''.join(str(min(9, int(v * 10))) for v in tone.flatten()))
prev = np.zeros((T, T, 4), dtype=np.float32)
prev[..., 0] = 0.12 + tone * 0.25; prev[..., 1] = 0.2 + tone * 0.4; prev[..., 2] = 0.08 + tone * 0.14; prev[..., 3] = 1
pi = bpy.data.images.new('p', T, T); pi.pixels = prev[::-1].flatten().tolist(); pi.filepath_raw = os.path.join(out, 'grass_tile_preview.png'); pi.file_format = 'PNG'; pi.save()
open(os.path.join(out, 'grass.js'), 'w').write('// Generated by tools/blender/grass.py (Blender blade field, %dx%d tones 0-9)\nconst GRASS_TILE = \'' % (T, T) + open(os.path.join(out, 'grass_tile.txt')).read() + '\';\nconst GRASS_TILE_N = %d;\n' % T)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out, 'grass.blend'))
print('tile', T, 'blade verts', len(verts))
