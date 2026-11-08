"""Blender -> game voxel models. Build parts in voxel units (1 Blender unit = 1 voxel; x east,
y south, z up, same axes as VModel in src/voxel.js), then voxelize and emit builder code.

Each part has a colour: a hex string, or 'main'/'light'/'dark'/'deep' (the faction palette),
and a material: matte, metal, glass, glow, rough (the game's M_* kinds).
Run with:  python3 -I aagun.py <out_dir>   (needs `pip install bpy`)
"""
import math
import bpy
import bmesh
from mathutils import Vector, Euler
from mathutils.bvhtree import BVHTree

MATS = {'matte': 'M_MATTE', 'metal': 'M_METAL', 'glass': 'M_GLASS', 'glow': 'M_GLOW', 'rough': 'M_ROUGH'}
TEAM = ('main', 'light', 'dark', 'deep')


RAY = Vector((0.9231, 0.3517, 0.1573)).normalized()   # odd direction: never grazes an edge


def inside(tree, p):
    """Ray parity: a point is inside a closed mesh when a ray from it crosses the surface an odd number of times."""
    n, o = 0, p
    while True:
        loc, _, _, _ = tree.ray_cast(o, RAY)
        if loc is None:
            break
        n += 1
        o = loc + RAY * 1e-4
    return n % 2 == 1


class Scene:
    def __init__(self):
        bpy.ops.wm.read_factory_settings(use_empty=True)
        self.parts = []   # (object, colour, material), later parts paint over earlier ones

    def _add(self, obj, col, mat, name):
        obj.name = name or obj.name
        bpy.context.view_layer.update()
        self.parts.append((obj, col, mat))
        return obj

    def cube(self, c, size, col, mat='matte', rot=(0, 0, 0), name=None):
        bpy.ops.mesh.primitive_cube_add(size=1, location=c, rotation=[math.radians(a) for a in rot])
        o = bpy.context.object
        o.scale = size
        return self._add(o, col, mat, name)

    def sphere(self, c, radii, col, mat='matte', rot=(0, 0, 0), name=None):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=10, radius=1, location=c,
                                             rotation=[math.radians(a) for a in rot])
        o = bpy.context.object
        o.scale = radii
        return self._add(o, col, mat, name)

    def tube(self, a, b, r, col, mat='metal', name=None, verts=20):
        """A cylinder from point a to point b."""
        a, b = Vector(a), Vector(b)
        d = b - a
        bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=d.length, location=(a + b) / 2)
        o = bpy.context.object
        o.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()
        return self._add(o, col, mat, name)

    def save_blend(self, path):
        for o, col, mat in self.parts:
            m = bpy.data.materials.new(o.name + '_mat')
            h = col if col.startswith('#') else {'main': '#5b7fb0', 'light': '#97b4da', 'dark': '#36547c', 'deep': '#1d2f48'}[col]
            m.diffuse_color = tuple(int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)) + (1,)
            o.data.materials.append(m)
        bpy.ops.wm.save_as_mainfile(filepath=path)

    # ---- voxelizing -------------------------------------------------------------------------
    def voxelize(self, x0, y0, x1, y1, d):
        bvhs = []
        for o, col, mat in self.parts:
            bm = bmesh.new()
            bm.from_mesh(o.data)
            bm.transform(o.matrix_world)
            bmesh.ops.triangulate(bm, faces=bm.faces[:])
            bm.normal_update()
            bvhs.append(BVHTree.FromBMesh(bm))
            bm.free()
        W, H = x1 - x0, y1 - y0
        grid = {}
        for z in range(d):
            for y in range(y0, y1):
                for x in range(x0, x1):
                    p = Vector((x + 0.5003, y + 0.5002, z + 0.5001))   # off the exact face planes
                    hit = None
                    for i, t in enumerate(bvhs):
                        if inside(t, p):
                            hit = i      # the last part that contains the point wins
                    if hit is not None:
                        grid[(x, y, z)] = (self.parts[hit][1], self.parts[hit][2])
        return grid


def greedy_boxes(grid):
    """Merge voxels of one colour+material into boxes: [(x0,y0,z0,x1,y1,z1,col,mat)]."""
    left = dict(grid)
    out = []
    for key in sorted(left, key=lambda k: (k[2], k[1], k[0])):
        if key not in left:
            continue
        x, y, z = key
        v = left[key]
        x1 = x
        while left.get((x1 + 1, y, z)) == v:
            x1 += 1
        y1 = y
        while all(left.get((xx, y1 + 1, z)) == v for xx in range(x, x1 + 1)):
            y1 += 1
        z1 = z
        while all(left.get((xx, yy, z1 + 1)) == v for xx in range(x, x1 + 1) for yy in range(y, y1 + 1)):
            z1 += 1
        for zz in range(z, z1 + 1):
            for yy in range(y, y1 + 1):
                for xx in range(x, x1 + 1):
                    del left[(xx, yy, zz)]
        out.append((x, y, z, x1 + 1, y1 + 1, z1 + 1, v[0], v[1]))
    return out


def js_color(c):
    return 'pal.' + c if c in TEAM else "'" + c + "'"


def emit(boxes, var='m'):
    return '\n'.join('%s.box(%d, %d, %d, %d, %d, %d, %s, %s);' % (var, x0, y0, z0, x1, y1, z1, js_color(c), MATS[m])
                     for x0, y0, z0, x1, y1, z1, c, m in boxes)
