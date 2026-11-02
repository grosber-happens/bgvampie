"""Player scale lock: one capsule for every species, plus the building rules sized to it.

PLAYER mirrors the game code. Keep them in sync:
  radius, height -> src/core.ts makeUnit (radius 0.45, height 1.85)
  step           -> src/world.ts STEP_HEIGHT (0.4)

Run alone to export the blockout: python3 tools/blender/olcek.py <out_dir>
"""
import math
import os
import sys

import bpy  # noqa: F401  (must load before bmesh/mathutils in the pip module)
from mathutils import Vector
from mathutils.bvhtree import BVHTree

PLAYER = dict(radius=0.45, height=1.85, step=0.4)

# Building rules derived from the capsule (meters).
RULES = dict(
    door_w=1.6,         # clear opening: capsule 0.9 + 0.35 each side
    door_h=2.5,         # 1.85 + head room for a hop
    ceiling=3.0,        # rooms: room to jump indoors
    headroom=2.4,       # any walkable floor to whatever is above it
    balcony_depth=2.0,  # two players can pass
    rail_h=1.1,
    riser=0.3,          # stair step height, below STEP_HEIGHT so stairs need no jump
    tread=0.6,
    stair_w=1.4,
    sill=1.0,           # window sill height above its floor
)

SKIN = (0.80, 0.66, 0.55)
CLOTH = (0.25, 0.30, 0.38)
CLOTH2 = (0.55, 0.32, 0.26)
FROG = (0.42, 0.55, 0.30)
FROG_BELLY = (0.88, 0.78, 0.48)
BRASS = (0.78, 0.58, 0.28)
STEEL = (0.38, 0.40, 0.44)
BONE = (0.90, 0.86, 0.76)
SHELL = (0.24, 0.42, 0.46)

# Owner rule (2026-11-02): all three species share the frog's height and girth,
# so all of them fill the same capsule. Humans and insects get cosmetic bulk
# (a back shell, a dead wing) to read right at that size. Cosmetic parts never
# change the hitbox; thin tips (antennae, chimney) may poke out of it.


def _start():
    import spor_ormani as so
    return so.Builder()


def blokaj_balcik(name='blokaj_balcik'):
    """Mechanical frog: wide, low center of mass, fills the capsule."""
    b, R = _start(), _R()
    H = PLAYER['height']
    b.add_blob((0, 0, 0.82), 0.42, (1.0, 0.85, 1.55), (FROG, FROG), R, 2, None, 0)      # body
    b.add_blob((0, -0.12, 0.72), 0.3, (0.95, 0.6, 1.4), (FROG_BELLY, FROG_BELLY), R, 2, None, 0)  # belly
    b.add_blob((0, -0.02, 1.48), 0.36, (1.15, 0.95, 0.7), (FROG, FROG), R, 2, None, 0)  # head
    for s in (-1, 1):
        b.add_blob((s * 0.2, -0.16, H - 0.14), 0.12, (1, 1, 1), (BRASS, BRASS), R, 2, None, 0)  # eye rings
        b.add_blob((s * 0.2, -0.24, H - 0.14), 0.07, (1, 1, 1), (BONE, BONE), R, 1, None, 0)
        b.add_blob((s * 0.3, -0.05, 0.16), 0.2, (1.1, 1.5, 0.75), (FROG, FROG), R, 2, None, 0)  # haunches
        so_tube(b, [Vector((s * 0.38, 0, 1.25)), Vector((s * 0.46, -0.05, 0.95)), Vector((s * 0.44, -0.12, 0.62))],
                [0.08, 0.07, 0.06], BRASS)                                            # cast arms
    b.add_blob((0, 0.28, 1.15), 0.24, (1.1, 0.7, 1.2), (BRASS, BRASS), R, 2, None, 0)   # back boiler
    return b.to_object(name)


def blokaj_yamali(name='blokaj_yamali'):
    """Half-mechanical human, bulked to the frog's girth with a coat and a back shell."""
    b, R = _start(), _R()
    H = PLAYER['height']
    head_r = H * 0.065
    for s in (-1, 1):
        x = s * 0.13
        so_tube(b, [Vector((x, 0, 0.06)), Vector((x, 0, 0.48)), Vector((x, 0, 0.92))], [0.08, 0.09, 0.12], CLOTH)
        b.add_blob((x, -0.05, 0.05), 0.08, (1, 1.8, 0.6), (CLOTH2, CLOTH2), R, 1, None, 0)
    so_tube(b, [Vector((0, 0, 0.55)), Vector((0, 0, 1.0)), Vector((0, 0, 1.47))], [0.34, 0.27, 0.3], CLOTH2)  # long coat
    for s in (-1, 1):
        sh = Vector((s * 0.33, 0, 1.43))
        arm = STEEL if s > 0 else CLOTH2   # one mechanical arm
        so_tube(b, [sh, sh + Vector((s * 0.06, 0, -0.3)), sh + Vector((s * 0.08, -0.05, -0.62))], [0.08, 0.07, 0.06], arm)
        b.add_blob(sh + Vector((s * 0.08, -0.05, -0.68)), 0.06, (1, 1, 1.2), (SKIN, SKIN), R, 1, None, 0)
    b.add_blob((0, 0.3, 1.12), 0.3, (1.25, 0.55, 1.35), (STEEL, STEEL), R, 2, None, 0)  # riveted back shell
    so_tube(b, [Vector((0, 0, 1.47)), Vector((0, 0, 1.58))], 0.07, SKIN)
    b.add_blob((0, -0.01, H - head_r * 1.15), head_r, (0.9, 1.0, 1.15), (SKIN, SKIN), R, 2, None, 0)
    return b.to_object(name)


def blokaj_katip(name='blokaj_katip'):
    """Wingless insect, four arms; a beetle shell and stub wings fill out the frog's girth."""
    b, R = _start(), _R()
    H = PLAYER['height']
    for s in (-1, 1):
        x = s * 0.12
        so_tube(b, [Vector((x, 0, 0.04)), Vector((x * 1.4, 0, 0.45)), Vector((x, 0, 0.9))], [0.04, 0.05, 0.06], BONE)
    b.add_blob((0, 0, 0.92), 0.2, (1.0, 0.9, 1.1), (BONE, BONE), R, 2, None, 0)          # abdomen
    so_tube(b, [Vector((0, 0, 1.0)), Vector((0, 0, 1.3)), Vector((0, 0, 1.52))], [0.14, 0.16, 0.13], BONE)
    for z in (1.42, 1.2):   # four arms
        for s in (-1, 1):
            sh = Vector((s * 0.15, -0.02, z))
            so_tube(b, [sh, sh + Vector((s * 0.2, -0.05, -0.2)), sh + Vector((s * 0.25, -0.12, -0.48))], [0.035, 0.03, 0.025], BONE)
    b.add_blob((0, 0.2, 1.1), 0.38, (1.15, 0.55, 1.4), (SHELL, SHELL), R, 2, None, 0)  # beetle shell
    for s in (-1, 1):   # dead stub wings under the shell edge
        b.add_blob((s * 0.36, 0.22, 1.3), 0.22, (0.35, 0.6, 1.3), (SHELL, BONE), R, 1, None, 0)
    b.add_blob((0, -0.02, H - 0.17), 0.15, (0.85, 0.9, 1.1), (BONE, BONE), R, 2, None, 0)  # head
    for s in (-1, 1):   # antennae: outside the hitbox, never hit
        so_tube(b, [Vector((s * 0.05, -0.08, H - 0.06)), Vector((s * 0.18, -0.12, H + 0.15)), Vector((s * 0.3, -0.05, H + 0.28))],
                0.012, (0.2, 0.18, 0.2), 4)
    return b.to_object(name)


def player_blockout(name='oyuncu_blokaj'):
    """Default preview figure: the frog, since it defines the size."""
    return blokaj_balcik(name)


def hitbox_capsule(name='oyuncu_hitbox'):
    """The gameplay capsule as a see-through mesh."""
    r, h = PLAYER['radius'], PLAYER['height']
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=h - 2 * r, location=(0, 0, h / 2), vertices=20)
    cyl = bpy.context.active_object
    for z in (r, h - r):
        bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=(0, 0, z), segments=20, ring_count=10)
    caps = bpy.context.selected_objects
    for o in bpy.context.view_layer.objects:
        o.select_set(o is cyl or o.name.startswith('Sphere'))
    bpy.context.view_layer.objects.active = cyl
    bpy.ops.object.join()
    cyl.name = name
    m = bpy.data.materials.new('hitbox')
    m.use_nodes = True
    bsdf = m.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (0.31, 0.70, 0.75, 1)
    bsdf.inputs['Alpha'].default_value = 0.25
    m.surface_render_method = 'BLENDED'
    cyl.data.materials.append(m)
    del caps
    return cyl


def headroom(ob, points):
    """Smallest free height straight up from each floor point to the mesh."""
    deps = bpy.context.evaluated_depsgraph_get()
    tree = BVHTree.FromObject(ob, deps)
    best, where = math.inf, None
    for p in points:
        hit = tree.ray_cast(Vector(p) + Vector((0, 0, 0.05)), Vector((0, 0, 1)), 50)
        if hit[0] is not None and hit[3] + 0.05 < best:
            best, where = hit[3] + 0.05, hit[0]
    if where is not None and best < RULES['headroom']:
        print('  lowest hit at', tuple(round(c, 2) for c in where))
    return best


class _R:  # deterministic stand-in for random.Random in add_blob (noise 0)
    def uniform(self, a, b):
        return 0.0


def so_tube(b, pts, radius, color, segs=8):
    rings, cols = [], []
    n = len(pts)
    for i, p in enumerate(pts):
        d = (pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]).normalized()
        side = d.cross(Vector((1, 0, 0))).normalized()
        up = d.cross(side).normalized()
        r = radius[i] if isinstance(radius, (list, tuple)) else radius
        rings.append([p + (side * math.cos(a) + up * math.sin(a)) * r for a in (j / segs * math.tau for j in range(segs))])
        cols.append([color] * segs)
    vs = b.grid(rings, colors=cols)
    b.cap_fan(vs[0], pts[0], color, flip=True)
    b.cap_fan(vs[-1], pts[-1], color)


if __name__ == '__main__':
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import spor_ormani as so
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
    out = os.path.abspath(argv[0] if argv else 'olcek_out')
    os.makedirs(out, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    objs = []
    for i, fn in enumerate((blokaj_balcik, blokaj_yamali, blokaj_katip)):
        fig = fn()
        cap = hitbox_capsule(fig.name + '_hitbox')
        fig.location.x = cap.location.x = (i - 1) * 1.6
        bpy.context.view_layer.update()
        bb = [fig.matrix_world @ Vector(v) for v in fig.bound_box]
        print(fig.name, 'height', round(max(v.z for v in bb), 2), 'width', round(max(v.x for v in bb) - min(v.x for v in bb), 2))
        objs += [fig, cap]
    so.export(objs, os.path.join(out, 'oyuncu_olcek.glb'))
    if '--render' in argv:
        cam, f0 = so.setup_render()
        f0.hide_render = True
        for c in f0.children:
            c.hide_render = True
        so.render(cam, f0, objs, (0, 0, 0), (0, 0, 0), os.path.join(out, 'turler_hitbox.png'), zoom=0.85, view=(1.0, -0.8))
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out, 'oyuncu_olcek.blend'))
