"""Spor Ormanı asset kit: giant mushroom cluster, single mushrooms, moss mound, red sprouts.

Everything is built from simple primitives with code (no imported meshes).
Colors live in vertex colors with one shared material, so each asset is one draw call.
Each asset is exported as one .glb holding <name>_LOD0, _LOD1 and _LOD2.

Run (Blender 4.2+ or the `bpy` pip module):
  blender -b -P tools/blender/spor_ormani.py -- <out_dir> [--render]
  python3 tools/blender/spor_ormani.py <out_dir> [--render]

Units: 1 Blender unit = 1 m. Characters are about 1.8 m tall.
"""
import math
import os
import random
import sys

import bpy  # must come before bmesh when run as a pip module
import bmesh

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mathutils import Vector, Matrix

# ---------------------------------------------------------------- numbers
# Soft watercolor palette (linear-ish RGB, alpha 1). Muted versions of the
# reference's neon colors.
PAL = {
    'cap_top': (0.95, 0.60, 0.28),     # peach amber
    'cap_edge': (0.86, 0.40, 0.44),    # dusty rose
    'cap_alt': (0.76, 0.72, 0.32),     # olive gold
    'gill_in': (0.30, 0.52, 0.62),     # muted teal
    'gill_out': (0.58, 0.44, 0.70),    # lavender
    'rim': (0.95, 0.75, 0.45),         # pale gold lip
    'spot': (0.97, 0.88, 0.70),        # cream
    'spot_ring': (0.88, 0.58, 0.35),
    'stem_a': (0.93, 0.86, 0.78),      # cream
    'stem_b': (0.72, 0.62, 0.80),      # lilac band
    'stem_c': (0.55, 0.72, 0.76),      # sea glass band
    'stem_d': (0.92, 0.66, 0.62),      # blush band
    'moss_a': (0.78, 0.45, 0.22),      # burnt orange
    'moss_b': (0.62, 0.33, 0.20),
    'moss_c': (0.85, 0.62, 0.32),
    'sprout_a': (0.74, 0.30, 0.28),    # muted red
    'sprout_b': (0.90, 0.55, 0.40),
}
# Rim color for each cap color, so caps in one cluster read apart.
CAP_EDGE = {'cap_top': 'cap_edge', 'cap_alt': 'cap_top', 'cap_edge': 'gill_out'}
LOD_RATIOS = (1.0, 0.35, 0.1)   # Decimate ratio per LOD level
SEED = 7

# Cluster layout: (x, y, stem height, cap radius, lean x, lean y, palette)
CLUSTER = [
    (0.0, 0.0, 22.0, 11.0, 1.2, 0.6, 'cap_top'),
    (-8.5, -2.5, 13.0, 5.2, -2.2, -0.8, 'cap_alt'),
    (-4.5, 3.8, 9.5, 3.8, -1.0, 1.4, 'cap_edge'),
    (4.5, -5.5, 6.0, 2.6, 1.0, -1.2, 'cap_top'),
    (-12.5, 2.0, 7.5, 4.2, -1.6, 0.4, 'cap_alt'),
]
SINGLES = {  # name: (stem height, cap radius, palette)
    'mantar_kucuk': (2.4, 1.2, 'cap_edge'),
    'mantar_orta': (6.0, 2.8, 'cap_top'),
    'mantar_buyuk': (12.0, 5.5, 'cap_alt'),
}


def mix(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def jitter(c, amt, rnd):
    return tuple(min(1, max(0, v + rnd.uniform(-amt, amt))) for v in c)


# ---------------------------------------------------------------- mesh helpers
class Builder:
    """Collects verts/faces/colors, then becomes one mesh object."""

    def __init__(self):
        self.bm = bmesh.new()
        self.col = self.bm.loops.layers.color.new('Col')
        self.mat = 0   # 0 = vertex color material, 1 = glow (windows, lanterns)

    def grid(self, rings, close_u=True, colors=None, skip=None):
        """rings: list of lists of Vector (same length). colors: same shape."""
        bm = self.bm
        vs = [[bm.verts.new(p) for p in ring] for ring in rings]
        n = len(rings[0])
        for i in range(len(rings) - 1):
            for j in range(n if close_u else n - 1):
                k = (j + 1) % n
                if skip and skip(i, j):
                    continue
                f = bm.faces.new((vs[i][j], vs[i][k], vs[i + 1][k], vs[i + 1][j]))
                f.material_index = self.mat
                f.smooth = True
                if colors:
                    cs = (colors[i][j], colors[i][k], colors[i + 1][k], colors[i + 1][j])
                    for loop, c in zip(f.loops, cs):
                        loop[self.col] = (*c, 1.0)
        return vs

    def cap_fan(self, ring_verts, center, color, flip=False):
        c = self.bm.verts.new(center)
        n = len(ring_verts)
        for j in range(n):
            a, b = ring_verts[j], ring_verts[(j + 1) % n]
            f = self.bm.faces.new((c, b, a) if flip else (c, a, b))
            f.material_index = self.mat
            f.smooth = True
            for loop in f.loops:
                loop[self.col] = (*color, 1.0)

    def add_blob(self, center, radius, scale, color, rnd, subdiv=1, normal=None, noise=0.15):
        """Small displaced icosphere (spots, moss lumps)."""
        tmp = bmesh.new()
        bmesh.ops.create_icosphere(tmp, subdivisions=subdiv, radius=radius)
        rot = Matrix.Identity(3)
        if normal is not None:
            rot = Vector((0, 0, 1)).rotation_difference(normal).to_matrix()
        sc = Matrix.Diagonal(scale)
        m = {}
        for v in tmp.verts:
            p = v.co * (1 + rnd.uniform(-noise, noise))
            m[v] = self.bm.verts.new(rot @ (sc @ p) + Vector(center))
        for f in tmp.faces:
            nf = self.bm.faces.new([m[v] for v in f.verts])
            nf.material_index = self.mat
            nf.smooth = True
            for loop in nf.loops:
                z = (loop.vert.co - Vector(center)).dot(rot @ Vector((0, 0, 1)))
                t = max(0, min(1, 0.5 + z / (radius * scale[2] * 2 + 1e-6)))
                loop[self.col] = (*mix(color[0], color[1], t), 1.0)
        tmp.free()

    def to_object(self, name):
        me = bpy.data.meshes.new(name)
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces)
        self.bm.to_mesh(me)
        self.bm.free()
        ob = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(ob)
        ob.data.materials.append(shared_material())
        if any(p.material_index == 1 for p in me.polygons):
            ob.data.materials.append(glow_material())
        return ob


_MAT = None


def shared_material():
    global _MAT
    if _MAT:
        return _MAT
    m = bpy.data.materials.new('spor_vertex')
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes['Principled BSDF']
    attr = nt.nodes.new('ShaderNodeVertexColor')
    attr.layer_name = 'Col'
    nt.links.new(attr.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.85
    _MAT = m
    return m


_GLOW = None


def glow_material():
    global _GLOW
    if _GLOW:
        return _GLOW
    m = bpy.data.materials.new('spor_glow')
    m.use_nodes = True
    bsdf = m.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (1.0, 0.82, 0.45, 1)
    bsdf.inputs['Emission Color'].default_value = (1.0, 0.78, 0.40, 1)
    bsdf.inputs['Emission Strength'].default_value = 2.5
    _GLOW = m
    return m


# ---------------------------------------------------------------- parts
def stem(b, base, height, r_base, r_top, lean, rnd, segs=18, rings=22):
    """Curved, tapered stem with pastel bands. Returns top center and top tangent."""
    base = Vector(base)
    lean = Vector((lean[0], lean[1], 0))
    # quadratic bezier: base -> mid (pushed sideways) -> top
    top = base + Vector((0, 0, height)) + lean
    side_kick = Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), 0)) * height * 0.10
    c1 = base + Vector((0, 0, height * 0.33)) - lean * 0.6 + side_kick
    c2 = base + Vector((0, 0, height * 0.66)) + lean * 1.8 - side_kick
    bands = [PAL['stem_a'], PAL['stem_b'], PAL['stem_c'], PAL['stem_d']]
    phase = rnd.uniform(0, 6.28)
    pts, cols = [], []
    for i in range(rings + 1):
        t = i / rings
        u = 1 - t
        p = u ** 3 * base + 3 * u * u * t * c1 + 3 * u * t * t * c2 + t ** 3 * top
        d = (3 * u * u * (c1 - base) + 6 * u * t * (c2 - c1) + 3 * t * t * (top - c2)).normalized()
        # flared base, slight swell near top
        r = r_top + (r_base - r_top) * (1 - t) ** 2.2 + r_top * 0.15 * math.sin(t * math.pi)
        side = d.cross(Vector((0, 1, 0))).normalized()
        if side.length < 0.1:
            side = Vector((1, 0, 0))
        up = d.cross(side).normalized()
        ring, rc = [], []
        for j in range(segs):
            a = j / segs * math.tau
            wob = 1 + 0.06 * math.sin(3 * a + t * 5 + phase) + 0.04 * math.sin(7 * a)
            ring.append(p + (side * math.cos(a) + up * math.sin(a)) * r * wob)
            # vertical streaks + soft horizontal bands
            band = (math.sin(t * 9 + phase + 0.6 * math.sin(a * 2)) + 1) / 2
            k = int((t * 3.5 + phase) % 4)
            c = mix(bands[k], bands[(k + 1) % 4], band)
            c = mix(c, PAL['stem_a'], 0.25 + 0.2 * math.sin(a * 5) ** 2)
            rc.append(jitter(c, 0.02, rnd))
        pts.append(ring)
        cols.append(rc)
    vs = b.grid(pts, colors=cols)
    b.cap_fan(vs[0], base - Vector((0, 0, 0.05)), PAL['stem_a'], flip=True)
    return top, d


def cap(b, center, radius, palette, rnd, segs=72, gills=36):
    """Domed cap with curled rim, ridged underside (gills) and raised spots."""
    center = Vector(center)
    h = radius * 0.55
    phase = rnd.uniform(0, 6.28)
    top_rows, under_rows = 12, 8
    top_col, base_col = PAL[palette], PAL[CAP_EDGE[palette]]

    def R(a):
        return radius * (1 + 0.05 * math.sin(3 * a + phase) + 0.03 * math.sin(5 * a + phase * 2))

    # top surface: center -> rim
    rings, cols = [], []
    for i in range(1, top_rows + 1):
        t = i / top_rows
        ring, rc = [], []
        for j in range(segs):
            a = j / segs * math.tau
            r = R(a) * t
            z = h * (1 - t ** 2.4) + h * 0.06 * math.sin(4 * a + phase) * t
            ring.append(center + Vector((math.cos(a) * r, math.sin(a) * r, z)))
            blot = 0.5 + 0.5 * math.sin(2 * a + phase + 3 * t) * math.sin(5 * t + a)
            c = mix(top_col, base_col, min(1, t ** 3 + 0.25 * blot))
            rc.append(jitter(c, 0.02, rnd))
        rings.append(ring)
        cols.append(rc)
    # rim lip curls down and in
    for (dr, dz, k) in ((1.04, -0.10, 0.0), (1.02, -0.22, 0.5), (0.95, -0.24, 1.0)):
        ring, rc = [], []
        for j in range(segs):
            a = j / segs * math.tau
            r = R(a) * dr
            ring.append(center + Vector((math.cos(a) * r, math.sin(a) * r, h * dz)))
            rc.append(mix(PAL['rim'], PAL['gill_out'], k))
        rings.append(ring)
        cols.append(rc)
    # underside: rim -> stem, with gill ridges
    for i in range(1, under_rows + 1):
        t = i / under_rows
        ring, rc = [], []
        for j in range(segs):
            a = j / segs * math.tau
            r = R(a) * 0.95 * (1 - t * 0.85)
            ridge = abs(math.sin(gills * a / 2)) ** 3
            z = h * (-0.24 + 0.30 * t) - ridge * h * 0.16 * (1 - t) ** 0.7
            ring.append(center + Vector((math.cos(a) * r, math.sin(a) * r, z)))
            c = mix(PAL['gill_out'], PAL['gill_in'], t)
            rc.append(mix(c, PAL['rim'], ridge * 0.45 * (1 - t)))
        rings.append(ring)
        cols.append(rc)
    vs = b.grid(rings, colors=cols)
    b.cap_fan(vs[0], center + Vector((0, 0, h)), top_col, flip=True)
    b.cap_fan(vs[-1], center + Vector((0, 0, h * 0.08)), PAL['gill_in'])

    # spots: flattened blobs with a darker ring under a cream dome
    n_spots = int(8 + radius * 3)
    for _ in range(n_spots):
        t = rnd.uniform(0.15, 0.85)
        a = rnd.uniform(0, math.tau)
        r = R(a) * t
        z = h * (1 - t ** 2.4)
        p = center + Vector((math.cos(a) * r, math.sin(a) * r, z))
        # approximate surface normal from the dome slope
        slope = h * 2.4 * t ** 1.4 / radius
        nrm = Vector((math.cos(a) * slope, math.sin(a) * slope, 1)).normalized()
        s = radius * rnd.uniform(0.05, 0.11)
        b.add_blob(p, s, (1.2, 1.2, 0.35), (PAL['spot_ring'], PAL['spot_ring']), rnd, 1, nrm, 0.05)
        b.add_blob(p + nrm * s * 0.25, s * 0.65, (1, 1, 0.45), (PAL['spot_ring'], PAL['spot']), rnd, 1, nrm, 0.05)


def mushroom(b, base, height, radius, palette, lean, rnd):
    top, d = stem(b, base, height, radius * 0.32, radius * 0.17, lean, rnd)
    cap(b, top - Vector((0, 0, radius * 0.05)), radius, palette, rnd)
    # skirt (ring) under the cap, like the reference
    sk_c = top - d * height * 0.18
    rings, cols = [], []
    for k, (dr, dz) in enumerate(((0.19, 0.0), (0.33, -0.10), (0.36, -0.22))):
        ring, rc = [], []
        for j in range(28):
            a = j / 28 * math.tau
            wav = 1 + 0.12 * math.sin(a * 9)
            ring.append(sk_c + Vector((math.cos(a), math.sin(a), 0)) * radius * dr * (wav if k else 1)
                        + Vector((0, 0, radius * dz)))
            rc.append(mix(PAL['rim'], PAL['cap_edge'], k / 2))
        rings.append(ring)
        cols.append(rc)
    b.grid(rings, colors=cols)


def moss_mound(b, center, radius, rnd, lumps=None):
    """Low hill: a lumpy dome covered with soft moss tufts."""
    lumps = lumps or int(radius * 9)
    center = Vector(center)
    hgt = radius * 0.16
    ph = rnd.uniform(0, 6.28)

    def surf(t, a):
        bump = 1 + 0.12 * math.sin(3 * a + ph) + 0.08 * math.sin(7 * a + t * 6)
        return hgt * (1 - t * t) * bump

    segs, rows = 40, 8
    rings, cols = [], []
    for i in range(1, rows + 1):
        t = i / rows
        ring, rc = [], []
        for j in range(segs):
            a = j / segs * math.tau
            rr = radius * t * (1 + 0.08 * math.sin(4 * a + ph))
            ring.append(center + Vector((math.cos(a) * rr, math.sin(a) * rr, surf(t, a) - 0.05 * t)))
            rc.append(jitter(mix(PAL['moss_a'], PAL['moss_b'], t), 0.04, rnd))
        rings.append(ring)
        cols.append(rc)
    vs = b.grid(rings, colors=cols)
    b.cap_fan(vs[0], center + Vector((0, 0, hgt)), PAL['moss_a'], flip=True)
    for _ in range(lumps):
        a = rnd.uniform(0, math.tau)
        t = math.sqrt(rnd.random()) * 0.95
        r = radius * t
        p = center + Vector((math.cos(a) * r, math.sin(a) * r, surf(t, a)))
        s = radius * rnd.uniform(0.06, 0.13) * (1.2 - t * 0.5)
        c0 = rnd.choice((PAL['moss_a'], PAL['moss_b'], PAL['moss_c']))
        b.add_blob(p, s, (1, 1, 0.55), (PAL['moss_b'], c0), rnd, 1, None, 0.25)


def sprouts(b, center, count, height, rnd, spread=1.0):
    """Bunch of thin curved leaves (the red shoots at the reference's edges)."""
    center = Vector(center)
    for _ in range(count):
        a = rnd.uniform(0, math.tau)
        base = center + Vector((math.cos(a), math.sin(a), 0)) * rnd.uniform(0, spread)
        hgt = height * rnd.uniform(0.6, 1.1)
        bend = Vector((math.cos(a), math.sin(a), 0)) * hgt * rnd.uniform(0.15, 0.45)
        w = hgt * 0.07
        rings, cols = [], []
        for i in range(7):
            t = i / 6
            p = base + Vector((0, 0, hgt * t)) + bend * t * t
            r = w * (1 - t) ** 0.8 + 0.01
            ring = [p + Vector((math.cos(q / 5 * math.tau), math.sin(q / 5 * math.tau), 0)) * r for q in range(5)]
            rings.append(ring)
            cols.append([mix(PAL['sprout_a'], PAL['sprout_b'], t)] * 5)
        b.grid(rings, colors=cols)


# ---------------------------------------------------------------- assets
def build_cluster(rnd):
    b = Builder()
    moss_mound(b, (-3, 0, -0.3), 13, rnd)
    for (x, y, h, r, lx, ly, pal) in CLUSTER:
        mushroom(b, (x, y, 0), h, r, pal, (lx, ly), rnd)
    for p in ((-15, -6, 0), (9, 6, 0), (-2, -11, 0), (12, -2, 0)):
        sprouts(b, p, 7, 1.6, rnd, 1.2)
    return b.to_object('mantar_kumesi')


def build_single(name, h, r, pal, rnd):
    b = Builder()
    moss_mound(b, (0, 0, -0.1), r * 0.9, rnd, lumps=int(r * 6) + 6)
    mushroom(b, (0, 0, 0), h, r, pal, (r * 0.08, 0), rnd)
    return b.to_object(name)


def build_moss(rnd):
    b = Builder()
    moss_mound(b, (0, 0, -0.2), 4, rnd)
    return b.to_object('yosun_tumsek')


def build_sprouts(rnd):
    b = Builder()
    sprouts(b, (0, 0, 0), 11, 1.8, rnd, 0.6)
    return b.to_object('kizil_filiz')


# ---------------------------------------------------------------- LOD + export
def make_lods(ob):
    """Returns [LOD0, LOD1, LOD2] objects; LOD1/2 are decimated copies."""
    base_name = ob.name
    ob.name = base_name + '_LOD0'
    out = [ob]
    for i, ratio in enumerate(LOD_RATIOS[1:], start=1):
        cp = ob.copy()
        cp.data = ob.data.copy()
        cp.name = f'{base_name}_LOD{i}'
        bpy.context.scene.collection.objects.link(cp)
        mod = cp.modifiers.new('dec', 'DECIMATE')
        mod.ratio = ratio
        bpy.context.view_layer.objects.active = cp
        for o in bpy.context.selected_objects:
            o.select_set(False)
        cp.select_set(True)
        bpy.ops.object.modifier_apply(modifier='dec')
        out.append(cp)
    return out


def tri_count(ob):
    return sum(len(p.vertices) - 2 for p in ob.data.polygons)


def export(objs, path):
    for o in bpy.context.view_layer.objects:
        o.select_set(o in objs)
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True,
                              export_apply=True, export_animations=False)


# ---------------------------------------------------------------- preview render
def setup_render(res=(1280, 720)):
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.samples = 32
    sc.cycles.use_denoising = True
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.view_settings.view_transform = 'Standard'
    w = bpy.data.worlds.new('dusk')
    w.use_nodes = True
    bg = w.node_tree.nodes['Background']
    grad = w.node_tree.nodes.new('ShaderNodeTexGradient')
    ramp = w.node_tree.nodes.new('ShaderNodeValToRGB')
    coord = w.node_tree.nodes.new('ShaderNodeTexCoord')
    sep = w.node_tree.nodes.new('ShaderNodeSeparateXYZ')
    w.node_tree.links.new(coord.outputs['Window'], sep.inputs[0])
    ramp.color_ramp.elements[0].color = (0.96, 0.76, 0.52, 1)
    ramp.color_ramp.elements[1].color = (0.30, 0.48, 0.58, 1)
    w.node_tree.links.new(sep.outputs['Y'], ramp.inputs[0])
    w.node_tree.links.new(ramp.outputs['Color'], bg.inputs['Color'])
    bg.inputs['Strength'].default_value = 0.7
    sc.world = w
    sun = bpy.data.lights.new('sun', 'SUN')
    sun.energy = 3.0
    sun.color = (1.0, 0.88, 0.72)
    sun.angle = math.radians(8)
    so = bpy.data.objects.new('sun', sun)
    so.rotation_euler = (math.radians(50), math.radians(10), math.radians(-35))
    sc.collection.objects.link(so)
    # ground disc
    bpy.ops.mesh.primitive_circle_add(vertices=64, radius=120, fill_type='NGON')
    g = bpy.context.active_object
    g.name = 'preview_ground'
    gm = bpy.data.materials.new('ground')
    gm.use_nodes = True
    gm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.55, 0.42, 0.30, 1)
    gm.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 1
    g.data.materials.append(gm)
    # player blockout (1.85 m) inside its see-through hitbox capsule, see olcek.py
    import olcek
    fig = olcek.player_blockout('preview_oyuncu')
    cap = olcek.hitbox_capsule('preview_hitbox')
    cap.parent = fig
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    sc.collection.objects.link(cam)
    sc.camera = cam
    return cam, fig


def render(cam, fig, objs, target, fig_pos, path, zoom=1.0, view=(0.5, -1.0)):
    for o in bpy.data.objects:
        if o.type == 'MESH' and not o.name.startswith('preview_'):
            o.hide_render = o not in objs
    fig.location = Vector(fig_pos)
    bpy.context.view_layer.update()
    wb = [o.matrix_world @ Vector(v) for o in objs for v in o.bound_box]
    lo = Vector((min(v.x for v in wb), min(v.y for v in wb), 0))
    hi = Vector((max(v.x for v in wb), max(v.y for v in wb), max(v.z for v in wb)))
    tgt = Vector(target) + Vector((0, 0, hi.z * 0.5))
    # low camera looking slightly up, so the gills show like in the reference
    cam.data.lens = 28
    rad = 0.5 * math.sqrt((hi.x - lo.x) ** 2 + (hi.y - lo.y) ** 2 + hi.z ** 2)
    dist = rad / math.tan(cam.data.angle_y / 2) * 1.05 * zoom
    cam.location = Vector((tgt.x, tgt.y, 0)) + Vector((view[0], view[1], 0)).normalized() * dist + Vector((0, 0, hi.z * 0.18 + 1.5))
    cam.rotation_euler = (tgt - cam.location).to_track_quat('-Z', 'Y').to_euler()
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


# ---------------------------------------------------------------- main
def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
    out_dir = os.path.abspath(argv[0] if argv else 'spor_ormani_out')
    do_render = '--render' in argv
    os.makedirs(out_dir, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    rnd = random.Random(SEED)

    assets = {'mantar_kumesi': build_cluster(rnd)}
    for name, (h, r, pal) in SINGLES.items():
        assets[name] = build_single(name, h, r, pal, rnd)
    assets['yosun_tumsek'] = build_moss(rnd)
    assets['kizil_filiz'] = build_sprouts(rnd)

    # lay the assets out in a row in the .blend so they are easy to inspect
    x = 0.0
    lods = {}
    for name, ob in assets.items():
        lods[name] = make_lods(ob)
        print(name, 'tris per LOD:', [tri_count(o) for o in lods[name]])
        export(lods[name], os.path.join(out_dir, name + '.glb'))
    for name, objs in lods.items():
        if name == 'mantar_kumesi':
            continue
        x += 40
        for o in objs:
            o.location.x = x
    for name, objs in lods.items():   # hide LOD1/2 in the viewport
        for o in objs[1:]:
            o.hide_set(True)
            o.hide_render = True

    if do_render:
        cam, fig = setup_render()
        prev = os.path.join(out_dir, 'onizleme')
        os.makedirs(prev, exist_ok=True)
        c = lods['mantar_kumesi'][0]
        render(cam, fig, [c], (0, 0, 0), (6, -9, 0), os.path.join(prev, 'mantar_kumesi.png'))
        singles = [lods[n][0] for n in ('mantar_kucuk', 'mantar_orta', 'mantar_buyuk', 'yosun_tumsek', 'kizil_filiz')]
        for i, o in enumerate(singles):   # temporary lineup for one shot
            o.location.x = (-14, -8, 2, 14, 21)[i]
        render(cam, fig, singles, (3, 0, 0), (-11, -3, 0), os.path.join(prev, 'tekli_assetler.png'))
        # LOD comparison of the cluster: LOD0, LOD1, LOD2 side by side
        for i, o in enumerate(lods['mantar_kumesi']):
            o.hide_render = False
            o.location.x = (i - 1) * 34
        render(cam, fig, lods['mantar_kumesi'], (0, 0, 0), (-34, -12, 0), os.path.join(prev, 'lod_karsilastirma.png'))
        for i, o in enumerate(lods['mantar_kumesi']):
            o.location.x = 0
            o.hide_render = i > 0
        for i, o in enumerate(singles):
            o.location.x = 40 * (i + 1)
        for n in ('preview_ground', 'cam', 'sun'):
            bpy.data.objects[n].hide_set(True)

    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out_dir, 'spor_ormani.blend'))


if __name__ == '__main__':
    main()
