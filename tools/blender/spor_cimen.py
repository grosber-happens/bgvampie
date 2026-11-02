"""Spor Ormanı: dark green grass clumps and fireflies.

Grass: bent blades from one root, deep green with a watercolor wash (vertex colors only,
one double-sided material, one draw call). Made to be instanced thousands of times, so
every clump stays tiny. LODs are rebuilt with less detail (not decimated):
  LOD0 4-segment blades, LOD1 2 segments and ~55% of blades, LOD2 one triangle per blade
  and ~25% of blades (wider, so the clump keeps its mass from far away).
Normals are bent toward the sky so a clump shades like one soft mass, not like cards.

Fireflies (ates_bocegi.glb): a tiny body with a glowing tail, nodes
  ates_bocegi_LOD0 (body + wings), ates_bocegi_isik (the glowing tail, glow material)
In the game a firefly is mostly its light: one additive particle sprite (isik_lekesi.png,
a soft watercolor blot) per firefly; the mesh is only drawn within a few meters.

Run (bpy pip module 5.1, or Blender 4.2+):
  python3 spor_cimen.py <out_dir> [--render]

Units: 1 Blender unit = 1 m. Player capsule is 1.85 m tall (olcek.py).
"""
import math
import os
import random
import sys

import bpy  # must come before bmesh when run as a pip module
import bmesh  # noqa: F401

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mathutils import Vector

import spor_ormani as so

# ---------------------------------------------------------------- numbers
PAL = {
    'root': (0.050, 0.120, 0.060),    # near black green at the soil
    'deep': (0.090, 0.240, 0.110),    # forest green
    'moss': (0.160, 0.360, 0.130),    # moss green
    'teal': (0.080, 0.270, 0.200),    # cool blue-green wash
    'olive': (0.290, 0.380, 0.120),   # warm olive tips, used sparingly
}
FIREFLY_COLOR = (0.85, 1.0, 0.42)    # warm lime-gold
FIREFLY_EMIT = 6.0

# Detail per LOD: segments per blade, share of blades kept, width boost
LOD_DETAIL = (
    dict(segs=4, keep=1.0, widen=1.0),
    dict(segs=2, keep=0.55, widen=1.35),
    dict(segs=1, keep=0.25, widen=2.1),
)

# Variants: blades, clump radius (m), blade height range (m), blade width (m)
VARIANTS = {
    'cimen_kucuk': dict(blades=26, radius=0.14, h=(0.22, 0.42), w=0.032, seed=31),
    'cimen_orta': dict(blades=44, radius=0.22, h=(0.30, 0.62), w=0.036, seed=32),
    'cimen_genis': dict(blades=70, radius=0.38, h=(0.26, 0.55), w=0.036, seed=33),
    'cimen_uzun': dict(blades=34, radius=0.20, h=(0.55, 0.95), w=0.032, seed=34),
}
UP_BEND = 0.75   # how far normals lean to straight up (0 = true blade normal)


def mix(a, b, t):
    return so.mix(a, b, t)


# ---------------------------------------------------------------- grass
def layout(v):
    """One blade list shared by all LODs, so the LODs match."""
    rnd = random.Random(v['seed'])
    blades = []
    for i in range(v['blades']):
        a = rnd.uniform(0, math.tau)
        r = v['radius'] * math.sqrt(rnd.random())
        base = Vector((math.cos(a) * r, math.sin(a) * r, 0))
        h = rnd.uniform(*v['h']) * (1.0 - 0.35 * r / v['radius'])   # taller in the middle
        out = Vector((math.cos(a), math.sin(a), 0))
        lean_dir = (out * 0.8 + Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), 0)) * 0.5).normalized()
        lean = rnd.uniform(0.15, 0.55) * (0.5 + r / v['radius'])
        face = rnd.uniform(0, math.tau)
        tint = rnd.random()
        tip = PAL['olive'] if tint > 0.88 else (PAL['teal'] if tint < 0.3 else PAL['moss'])
        tip = so.jitter(tip, 0.025, rnd)
        blades.append(dict(base=base, h=h, lean_dir=lean_dir, lean=lean, face=face,
                           w=v['w'] * rnd.uniform(0.75, 1.25), tip=tip, rank=rnd.random()))
    return blades


def blade_point(bl, t):
    """Point on a curved blade: rises, then droops along lean_dir."""
    h, lean = bl['h'], bl['lean']
    z = h * (t - 0.18 * lean * t * t)
    off = bl['lean_dir'] * (h * lean * t * t)
    return bl['base'] + off + Vector((0, 0, z))


def build_lod(name, v, blades, d):
    b = so.Builder()
    keep = sorted(blades, key=lambda bl: bl['rank'])[:max(3, round(len(blades) * d['keep']))]
    for bl in keep:
        side = Vector((math.cos(bl['face']), math.sin(bl['face']), 0)) * bl['w'] * d['widen'] * 0.5
        segs = d['segs']
        rings, cols = [], []
        for s in range(segs + 1):
            t = s / segs
            p = blade_point(bl, t)
            taper = (1 - t) ** 0.8 if s < segs else 0.0
            sw = side * max(taper, 0.0)
            c = mix(PAL['root'], PAL['deep'], min(1, t * 2.2)) if t < 0.45 else mix(PAL['deep'], bl['tip'], (t - 0.45) / 0.55)
            if s == segs:
                rings.append([p, p + side * 0.02])
            else:
                rings.append([p - sw, p + sw])
            cols.append([c, c])
        b.grid(rings, close_u=False, colors=cols)
    ob = b.to_object(name)
    grass_finish(ob)
    return ob


_GRASS = None


def grass_material():
    global _GRASS
    if _GRASS:
        return _GRASS
    m = bpy.data.materials.new('cimen_vertex')
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes['Principled BSDF']
    attr = nt.nodes.new('ShaderNodeVertexColor')
    attr.layer_name = 'Col'
    nt.links.new(attr.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.9
    m.use_backface_culling = False   # glTF doubleSided
    _GRASS = m
    return m


def grass_finish(ob):
    """Own double-sided material, normals bent up so the clump shades softly."""
    me = ob.data
    me.materials.clear()
    me.materials.append(grass_material())
    up = Vector((0, 0, 1))
    loop_normals = []
    for poly in me.polygons:
        n = poly.normal.copy()
        if n.z < 0:
            n = -n
        bent = (n * (1 - UP_BEND) + up * UP_BEND).normalized()
        loop_normals.extend([bent] * poly.loop_total)
    me.normals_split_custom_set(loop_normals)


def build_variant(name, v):
    blades = layout(v)
    return [build_lod(f'{name}_LOD{i}', v, blades, d) for i, d in enumerate(LOD_DETAIL)]


# ---------------------------------------------------------------- firefly
_FF = None


def firefly_material():
    global _FF
    if _FF:
        return _FF
    m = bpy.data.materials.new('ates_isik')
    m.use_nodes = True
    bsdf = m.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (*FIREFLY_COLOR, 1)
    bsdf.inputs['Emission Color'].default_value = (*FIREFLY_COLOR, 1)
    bsdf.inputs['Emission Strength'].default_value = FIREFLY_EMIT
    _FF = m
    return m


def build_firefly():
    """About 3 cm long (a bit larger than life so it reads in game). Head points +Y."""
    rnd = random.Random(41)
    body = so.Builder()
    shell = ((0.10, 0.08, 0.07), (0.20, 0.14, 0.10))
    body.add_blob((0, 0.006, 0.0), 0.006, (0.75, 1.3, 0.6), shell, rnd, subdiv=2, noise=0.03)
    body.add_blob((0, 0.016, 0.001), 0.0035, (1, 1, 0.9), ((0.30, 0.12, 0.08), (0.45, 0.20, 0.10)), rnd, subdiv=1, noise=0.03)
    # wings: two soft leaf shapes, folded back at a slight angle
    wing_c = ((0.55, 0.52, 0.40), (0.75, 0.72, 0.58))
    for sx in (-1, 1):
        root = Vector((sx * 0.0015, 0.011, 0.0045))
        tip = Vector((sx * 0.012, -0.012, 0.0075))
        axis = tip - root
        perp = Vector((axis.y, -axis.x, 0)).normalized() * 0.0045
        a, b = root + axis * 0.4 - perp, root + axis * 0.4 + perp
        body.grid([[root, root + Vector((0, 0, 1e-4))], [a, b], [tip, tip + Vector((0, 0, 1e-4))]], close_u=False,
                  colors=[[wing_c[0]] * 2, [wing_c[1]] * 2, [wing_c[1]] * 2])
    lod0 = body.to_object('ates_bocegi_LOD0')
    for p in lod0.data.polygons:
        p.use_smooth = True
    glow = so.Builder()
    glow.add_blob((0, -0.008, -0.001), 0.007, (0.85, 1.0, 0.8),
                  (FIREFLY_COLOR, mix(FIREFLY_COLOR, (1, 1, 0.9), 0.4)), rnd, subdiv=2, noise=0.02)
    tail = glow.to_object('ates_bocegi_isik')
    tail.data.materials.clear()
    tail.data.materials.append(firefly_material())
    return [lod0, tail]


def blot_texture(path, size=128):
    """Soft watercolor blot for the firefly particle: bright core, uneven pigment rim."""
    import numpy as np
    from PIL import Image
    rng = np.random.default_rng(7)
    y, x = np.mgrid[0:size, 0:size] / (size - 1) * 2 - 1
    ang = np.arctan2(y, x)
    r = np.sqrt(x * x + y * y)
    wob = 1 + 0.06 * np.sin(ang * 3 + 0.7) + 0.04 * np.sin(ang * 7 + 2.1)
    rr = r / (0.92 * wob)
    core = np.exp(-(rr / 0.22) ** 2)
    halo = np.clip(1 - rr, 0, 1) ** 2.2 * 0.55
    rim = np.exp(-((rr - 0.78) / 0.09) ** 2) * 0.08   # pigment edge, like a dried wash
    # soft paper grain: low-res noise scaled up smoothly (no visible blocks)
    small = Image.fromarray(((rng.normal(0, 1, (12, 12)) * 0.25 + 0.5).clip(0, 1) * 255).astype(np.uint8))
    grain = (np.asarray(small.resize((size, size), Image.BICUBIC)) / 255.0 - 0.5) * 0.12
    a = np.clip((core + halo + rim) * (1 + grain * 2), 0, 1) * np.clip((1 - rr) * 8, 0, 1)
    img = np.zeros((size, size, 4))
    img[..., 0:3] = 1.0
    img[..., 3] = a
    Image.fromarray((img * 255).astype(np.uint8), 'RGBA').save(path)


# ---------------------------------------------------------------- preview
def scatter_field(sets, radius, count, rnd, avoid):
    """Preview only: linked copies of LOD0 clumps over a disc."""
    names = list(sets)
    weights = [3, 4, 2, 1]
    n = 0
    tries = 0
    while n < count and tries < count * 4:
        tries += 1
        a = rnd.uniform(0, math.tau)
        r = radius * math.sqrt(rnd.random())
        p = Vector((math.cos(a) * r, math.sin(a) * r, 0))
        if any((p - c).length < cr for c, cr in avoid):
            continue
        src = sets[rnd.choices(names, weights)[0]][0]
        ob = bpy.data.objects.new(f'preview_cimen_{n}', src.data)
        ob.location = p
        ob.rotation_euler.z = rnd.uniform(0, math.tau)
        s = rnd.uniform(0.8, 1.3)
        ob.scale = (s, s, s * rnd.uniform(0.85, 1.15))
        bpy.context.scene.collection.objects.link(ob)
        n += 1


def setup_scene(night):
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.samples = 40
    sc.cycles.use_denoising = True
    sc.render.resolution_x, sc.render.resolution_y = 1280, 720
    sc.view_settings.view_transform = 'Standard'
    w = bpy.data.worlds.new('w')
    w.use_nodes = True
    bg = w.node_tree.nodes['Background']
    bg.inputs['Color'].default_value = (0.08, 0.11, 0.20, 1) if night else (0.88, 0.80, 0.66, 1)
    bg.inputs['Strength'].default_value = 0.3 if night else 0.9
    sc.world = w
    sun = bpy.data.lights.new('sun', 'SUN')
    sun.energy = 0.18 if night else 3.0
    sun.color = (0.6, 0.7, 1.0) if night else (1.0, 0.88, 0.72)
    sun_ob = bpy.data.objects.new('sun', sun)
    sun_ob.rotation_euler = (math.radians(55), math.radians(10), math.radians(-35))
    sc.collection.objects.link(sun_ob)
    bpy.ops.mesh.primitive_circle_add(vertices=64, radius=40, fill_type='NGON')
    g = bpy.context.active_object
    g.name = 'preview_ground'
    gm = bpy.data.materials.new('ground')
    gm.use_nodes = True
    gm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.16, 0.17, 0.09, 1)
    gm.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 1
    g.data.materials.append(gm)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    sc.collection.objects.link(cam)
    sc.camera = cam
    return cam


def shoot(cam, loc, target, lens, path):
    cam.data.lens = lens
    cam.location = Vector(loc)
    cam.rotation_euler = (Vector(target) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


_HALO = None


def halo_material(tex_path):
    """Preview: the particle sprite as Cycles sees it (additive glow through the blot alpha)."""
    global _HALO
    if _HALO:
        return _HALO
    m = bpy.data.materials.new('preview_hale')
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        if n.type != 'OUTPUT_MATERIAL':
            nt.nodes.remove(n)
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = bpy.data.images.load(tex_path)
    em = nt.nodes.new('ShaderNodeEmission')
    em.inputs['Color'].default_value = (*FIREFLY_COLOR, 1)
    em.inputs['Strength'].default_value = 2.5
    tr = nt.nodes.new('ShaderNodeBsdfTransparent')
    add = nt.nodes.new('ShaderNodeAddShader')
    mixn = nt.nodes.new('ShaderNodeMixShader')
    nt.links.new(tex.outputs['Alpha'], mixn.inputs[0])
    nt.links.new(tr.outputs[0], mixn.inputs[1])
    nt.links.new(em.outputs[0], add.inputs[0])
    nt.links.new(tr.outputs[0], add.inputs[1])
    nt.links.new(add.outputs[0], mixn.inputs[2])
    nt.links.new(mixn.outputs[0], nt.nodes['Material Output'].inputs['Surface'])
    _HALO = m
    return m


def halo(p, size, cam, tex_path, name):
    bpy.ops.mesh.primitive_plane_add(size=size, location=p)
    h = bpy.context.active_object
    h.name = name
    h.data.materials.append(halo_material(tex_path))
    c = h.constraints.new('TRACK_TO')
    c.target = cam
    c.track_axis = 'TRACK_Z'
    c.up_axis = 'UP_Y'
    return h


def fireflies(ff, count, rnd, area, cam, tex_path, scale=1.0):
    """Preview: copies of the firefly plus a small point light each, so the glow spills."""
    for i in range(count):
        p = Vector((rnd.uniform(*area[0]), rnd.uniform(*area[1]), rnd.uniform(0.3, 1.8)))
        for src in ff:
            ob = bpy.data.objects.new(f'preview_ff_{i}_{src.name}', src.data)
            ob.location = p
            ob.rotation_euler = (rnd.uniform(-0.3, 0.3), 0, rnd.uniform(0, math.tau))
            ob.scale = (scale,) * 3
            bpy.context.scene.collection.objects.link(ob)
        li = bpy.data.lights.new(f'pl_ff_{i}', 'POINT')
        li.energy = 0.9
        li.color = FIREFLY_COLOR
        li.shadow_soft_size = 0.03
        lo = bpy.data.objects.new(f'preview_pl_ff_{i}', li)
        lo.location = p
        bpy.context.scene.collection.objects.link(lo)
        halo(p, rnd.uniform(0.14, 0.24), cam, tex_path, f'preview_hale_{i}')


# ---------------------------------------------------------------- main
def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
    out_dir = os.path.abspath(argv[0] if argv else 'cimen_out')
    do_render = '--render' in argv
    night = '--night' in argv
    glb_dir = os.path.join(out_dir, 'glb')
    os.makedirs(glb_dir, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)

    sets = {}
    for name, v in VARIANTS.items():
        sets[name] = build_variant(name, v)
        print(name, 'tris LOD0/1/2:', [so.tri_count(o) for o in sets[name]])
    ff = build_firefly()
    print('ates_bocegi tris:', [so.tri_count(o) for o in ff])
    bpy.context.view_layer.update()
    for name, objs in sets.items():
        so.export(objs, os.path.join(glb_dir, name + '.glb'))
    so.export(ff, os.path.join(glb_dir, 'ates_bocegi.glb'))
    blot_texture(os.path.join(glb_dir, 'isik_lekesi.png'))

    x = 0.0
    for name, objs in sets.items():
        for o in objs:
            o.location.x = x
            if o.name.endswith(('_LOD1', '_LOD2')):
                o.hide_set(True)
                o.hide_render = True
        x += 1.0
    for o in ff:
        o.location = Vector((x, 0, 0.5))

    if do_render:
        prev = os.path.join(out_dir, 'onizleme')
        os.makedirs(prev, exist_ok=True)
        cam = setup_scene(night)
        import olcek
        fig = olcek.player_blockout('preview_oyuncu')
        fig.location = Vector((-0.4, 0.6, 0))
        for o in ff:
            o.hide_render = True
        # field: hide the source row, scatter linked copies
        for objs in sets.values():
            for o in objs:
                o.hide_render = True
        scatter_field(sets, 7.0, 900, random.Random(5), [(Vector((-0.4, 0.6, 0)), 0.45)])
        tag = '_gece' if night else ''
        if night:
            tex = os.path.join(glb_dir, 'isik_lekesi.png')
            fireflies(ff, 26, random.Random(9), ((-3.5, 3.5), (-0.5, 5.0)), cam, tex)
            shoot(cam, (0.8, -4.2, 1.2), (0.0, 1.0, 0.7), 34, os.path.join(prev, 'cimen_atesbocegi_gece.png'))
            # close look at one firefly
            for o in list(bpy.data.objects):
                if o.name.startswith('preview_') and o.name not in ('preview_ground',):
                    o.hide_render = True
            for o in ff:
                o.hide_render = False
                o.location = Vector((0, 0, 0.3))
            cam.location = Vector((0.06, -0.1, 0.35))
            halo(Vector((0, -0.008, 0.299)), 0.035, cam, tex, 'preview_hale_yakin')
            li = bpy.data.lights.new('pl_close', 'POINT')
            li.energy = 0.05
            li.color = FIREFLY_COLOR
            lo = bpy.data.objects.new('preview_pl_close', li)
            lo.location = Vector((0, -0.012, 0.31))
            bpy.context.scene.collection.objects.link(lo)
            bpy.context.scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = 1.2
            shoot(cam, (0.06, -0.1, 0.35), (0, 0, 0.3), 50, os.path.join(prev, 'atesbocegi_yakin.png'))
        else:
            shoot(cam, (0.8, -4.2, 1.3), (0.0, 1.0, 0.6), 34, os.path.join(prev, 'cimen_alan.png'))
            # variants and LODs: 4 variants in a row, LOD0/1/2 behind each other
            for o in list(bpy.data.objects):
                if o.name.startswith(('preview_cimen_', 'preview_oyuncu')):
                    o.hide_render = True
            for i, (name, objs) in enumerate(sets.items()):
                for j, o in enumerate(objs):
                    o.hide_render = False
                    o.location = Vector(((i - 1.5) * 0.9, 20 + j * 0.9, 0))
            shoot(cam, (0, 17.4, 1.3), (0, 20.9, 0.25), 32, os.path.join(prev, 'cimen_varyant_lod.png'))
        return  # preview runs do not overwrite the .blend

    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out_dir, 'spor_cimen.blend'))


if __name__ == '__main__':
    main()
