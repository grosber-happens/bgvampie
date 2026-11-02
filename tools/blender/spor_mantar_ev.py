"""Spor Ormanı mushroom houses, exterior only (interior comes later).

Three shapes from one builder:
  ev_kule   tall tower: round ground room, stacked shelf caps, trunk windows, balcony
  ev_genis  wide house: thick trunk under one huge cap, a mid cap and a wrap balcony
  ev_kulube low cottage: half-timbered room under a broad low cap, short trunk

The ground room has a real door opening (door_w x door_h from olcek.RULES) so an interior can be
attached later. Reuses the mesh helpers and LOD/export code in spor_ormani.py.

Run: python3 tools/blender/spor_mantar_ev.py <out_dir> [--render]
"""
import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import spor_ormani as so  # noqa: E402
from olcek import RULES, headroom  # noqa: E402
import bpy  # noqa: E402
import bmesh  # noqa: E402
from mathutils import Vector, Matrix  # noqa: E402

HP = {  # house palette, soft watercolor versions of the reference
    'bark': (0.44, 0.31, 0.24), 'bark_dk': (0.28, 0.19, 0.16), 'bark_lt': (0.58, 0.44, 0.34),
    'cap': (0.74, 0.27, 0.27), 'cap_lt': (0.88, 0.46, 0.34), 'cap_dk': (0.46, 0.20, 0.32),
    'gill': (0.52, 0.24, 0.30), 'gill_lt': (0.70, 0.38, 0.36),
    'plaster': (0.90, 0.83, 0.70), 'timber': (0.36, 0.24, 0.18), 'door': (0.30, 0.19, 0.14),
    'stone': (0.66, 0.62, 0.55), 'stone_dk': (0.50, 0.47, 0.42),
    'vine': (0.30, 0.46, 0.26), 'vine_lt': (0.46, 0.62, 0.32),
    'blue': (0.36, 0.44, 0.72), 'blue_lt': (0.56, 0.62, 0.86),
    'iron': (0.14, 0.13, 0.15), 'glow': (1.0, 0.85, 0.5),
}

# Shapes. Heights in meters. caps: (x, y, z, radius, height ratio, tilt deg, droop)
HOUSES = {
    'ev_kule': dict(
        trunk=(19.0, 2.4, 1.3), room=(4.6, 3.4), door_angle=-90,
        caps=[(0, 0, 3.7, 6.6, 0.36, 4, 0.7), (2.0, 1.0, 6.8, 4.8, 0.38, -8, 0.5),
              (-1.2, -0.6, 13.6, 7.4, 0.34, 6, 0.8), (0.4, 0.3, 18.2, 10.5, 0.32, -3, 1.2)],
        windows=[(5.6, -60), (8.4, 150), (11.6, 40), (15.4, -70), (16.0, 60)],
        balcony=(9.8, -110, 3.6, 150), shelves=[(5.5, 20), (11.5, 100), (14.0, 200)],
        vines=3, lantern=(-6.5, -5.0)),
    'ev_genis': dict(
        trunk=(15.0, 3.6, 2.4), room=(5.8, 3.6), door_angle=-80,
        caps=[(1.0, 0.5, 6.9, 7.5, 0.34, -5, 0.8), (0.0, 0.0, 15.0, 13.0, 0.30, 4, 1.4)],
        windows=[(4.6, -40), (5.0, -130), (12.2, 160), (12.0, 20), (11.0, 150)],
        balcony=(9.6, -90, 4.4, 260), shelves=[(4.8, 60), (12.8, -140)],
        vines=4, lantern=(7.0, -6.0)),
    'ev_kulube': dict(
        trunk=(10.5, 2.0, 1.4), room=(5.0, 3.2), door_angle=-95,
        caps=[(0, 0, 3.4, 8.2, 0.38, 3, 1.0), (0.6, 0.4, 10.2, 5.2, 0.40, -6, 0.6)],
        windows=[(1.6, -45, 'wall'), (1.6, -140, 'wall'), (1.6, 30, 'wall'), (8.6, 20)],
        balcony=(6.6, -90, 2.6, 140), shelves=[(5.6, 60)],
        vines=2, lantern=(-5.5, -6.0)),
}


# ---------------------------------------------------------------- small helpers
def box(b, center, size, color, rot=None, mat=0):
    tmp = bmesh.new()
    bmesh.ops.create_cube(tmp, size=1.0)
    rot = rot or Matrix.Identity(3)
    sc = Matrix.Diagonal(size)
    m = {v: b.bm.verts.new(rot @ (sc @ v.co) + Vector(center)) for v in tmp.verts}
    for f in tmp.faces:
        nf = b.bm.faces.new([m[v] for v in f.verts])
        nf.material_index = mat
        nf.smooth = False
        for loop in nf.loops:
            loop[b.col] = (*color, 1.0)
    tmp.free()


def tube(b, pts, radius, color, segs=6, color2=None):
    """Tube along points; radius may be a number or a list."""
    rings, cols = [], []
    n = len(pts)
    for i, p in enumerate(pts):
        p = Vector(p)
        d = (Vector(pts[min(i + 1, n - 1)]) - Vector(pts[max(i - 1, 0)])).normalized()
        side = d.cross(Vector((0, 0, 1)))
        if side.length < 0.1:
            side = d.cross(Vector((1, 0, 0)))
        side.normalize()
        up = d.cross(side).normalized()
        r = radius[i] if isinstance(radius, (list, tuple)) else radius
        rings.append([p + (side * math.cos(a) + up * math.sin(a)) * r
                      for a in (j / segs * math.tau for j in range(segs))])
        c = so.mix(color, color2, i / (n - 1)) if color2 else color
        cols.append([c] * segs)
    b.grid(rings, colors=cols)


def zrot(deg):
    return Matrix.Rotation(math.radians(deg), 3, 'Z')


def polar(r, deg, z=0.0):
    a = math.radians(deg)
    return Vector((math.cos(a) * r, math.sin(a) * r, z))


# ---------------------------------------------------------------- parts
def trunk(b, height, r_base, r_top, rnd, max_flare=99.0):
    """Bark trunk with grooves and root flares."""
    segs, rings = 28, 20
    ph = rnd.uniform(0, 6.28)
    roots = [rnd.uniform(0, 360) for _ in range(5)]
    pts, cols = [], []
    for i in range(rings + 1):
        t = i / rings
        sway = Vector((math.sin(t * 2.2 + ph), math.cos(t * 1.7 + ph), 0)) * height * 0.025 * t
        r = r_top + (r_base - r_top) * (1 - t) ** 1.6
        ring, rc = [], []
        for j in range(segs):
            a = j / segs * math.tau
            groove = math.sin(9 * a + t * 3 + ph) * 0.5 + 0.5
            flare = sum(max(0, math.cos(a - math.radians(q))) ** 8 for q in roots) * max(0, 1 - t * 6) * min(r_base * 0.7, max_flare)
            rr = r * (1 - 0.07 * groove) + flare
            ring.append(sway + Vector((math.cos(a) * rr, math.sin(a) * rr, height * t - 0.2)))
            c = so.mix(HP['bark_lt'], HP['bark_dk'], groove)
            rc.append(so.jitter(so.mix(c, HP['bark'], 0.4), 0.03, rnd))
        pts.append(ring)
        cols.append(rc)
    vs = b.grid(pts, colors=cols)
    b.cap_fan(vs[-1], Vector((0, 0, height)), HP['bark'])


def roof_cap(b, center, radius, hr, tilt, droop, rnd, shade=0.0, segs=64, gills=40):
    """Wide shelf cap: shallow cone, thick drooping rim, ridged underside."""
    center = Vector(center)
    h = radius * hr
    ph = rnd.uniform(0, 6.28)
    rot = Matrix.Rotation(math.radians(tilt), 3, Vector((math.cos(ph), math.sin(ph), 0)))
    # shade 0 = crimson/orange, 1 = plum
    c_lt = so.mix(HP['cap_lt'], HP['cap'], shade * 0.6)
    c_mid = so.mix(HP['cap'], HP['cap_dk'], shade * 0.8)

    def R(a):
        return radius * (1 + 0.06 * math.sin(3 * a + ph) + 0.035 * math.sin(7 * a + ph))

    prof = [(i / 10, h * (1 - (i / 10) ** 1.3)) for i in range(1, 11)]
    prof += [(1.03, -droop * 0.45), (1.02, -droop), (0.97, -droop * 1.05)]
    rings, cols = [], []
    for k, (t, z) in enumerate(prof):
        ring, rc = [], []
        for j in range(segs):
            a = j / segs * math.tau
            wave = 0.18 * math.sin(5 * a + ph) * t * droop
            ring.append(center + rot @ Vector((math.cos(a) * R(a) * t, math.sin(a) * R(a) * t, z + wave)))
            streak = 0.5 + 0.5 * math.sin(a * 23 + ph) * math.sin(a * 7)
            if k < 10:
                c = so.mix(c_lt, c_mid, min(1, t * 1.2))
                c = so.mix(c, HP['cap_dk'], 0.3 * streak * t)
            else:
                c = so.mix(c_lt, HP['cap_dk'], (k - 10) / 2)
            rc.append(so.jitter(c, 0.02, rnd))
        rings.append(ring)
        cols.append(rc)
    for i in range(1, 7):
        t = i / 6
        ring, rc = [], []
        for j in range(segs):
            a = j / segs * math.tau
            ridge = abs(math.sin(gills * a / 2)) ** 3
            rr = R(a) * 0.97 * (1 - t * 0.88)
            z = -droop * 1.05 * (1 - t) + h * 0.15 * t - ridge * 0.18 * (1 - t)
            ring.append(center + rot @ Vector((math.cos(a) * rr, math.sin(a) * rr, z)))
            rc.append(so.mix(HP['gill'], HP['gill_lt'], ridge * (1 - t)))
        rings.append(ring)
        cols.append(rc)
    vs = b.grid(rings, colors=cols)
    b.cap_fan(vs[0], center + rot @ Vector((0, 0, h)), HP['cap_lt'], flip=True)
    b.cap_fan(vs[-1], center + rot @ Vector((0, 0, h * 0.15)), HP['gill'])


def room(b, radius, height, door_deg, rnd):
    """Round half-timbered ground room around the trunk, with a door opening."""
    segs = 36
    dw, dh = RULES['door_w'], RULES['door_h']
    gap = math.degrees(math.atan2(dw / 2 + 0.2, radius)) * 2   # clear opening = door_w
    a0 = door_deg + gap / 2
    span = 360 - gap
    rows = [0.0, 0.5, height * 0.45, height * 0.9, height]
    rings, cols = [], []
    for z in rows:
        ring, rc = [], []
        for j in range(segs + 1):
            a = a0 + span * j / segs
            ring.append(polar(radius, a, z))
            rc.append(HP['stone'] if z < 0.6 else so.jitter(HP['plaster'], 0.025, rnd))
        rings.append(ring)
        cols.append(rc)
    b.grid(rings, close_u=False, colors=cols)
    # inner face so the wall reads as solid from the doorway
    inner = [[polar(radius - 0.25, a0 + span * j / segs, z) for j in range(segs + 1)] for z in (0.0, height)]
    b.grid(inner[::-1], close_u=False, colors=[[HP['plaster']] * (segs + 1)] * 2)
    # flat ring roof from the trunk to the wall top (hidden when a cap sits over it)
    roof = [[polar(rr_, a0 + span * j / segs, height) for j in range(segs + 1)] for rr_ in (radius + 0.3, radius * 0.3)]
    b.grid(roof, close_u=False, colors=[[HP['cap_dk']] * (segs + 1), [HP['cap']] * (segs + 1)])
    # stone plinth, timber posts and beams
    for j in range(0, segs + 1, 3):
        a = a0 + span * j / segs
        box(b, polar(radius + 0.05, a, height * 0.55), (0.22, 0.18, height * 0.9), HP['timber'], zrot(a))
    for z in (0.55, height * 0.45, height * 0.95):
        for j in range(segs):
            a = a0 + span * (j + 0.5) / segs
            box(b, polar(radius + 0.06, a, z), (0.16, radius * math.radians(span / segs) + 0.05, 0.18),
                HP['timber'], zrot(a))
    # door: frame, open leaf, threshold, little awning
    dpos = polar(radius, door_deg)
    r = zrot(door_deg)
    for s in (-1, 1):
        box(b, dpos + r @ Vector((0, s * (dw / 2 + 0.08), dh / 2)), (0.4, 0.16, dh), HP['timber'], r)
    box(b, dpos + r @ Vector((0, 0, dh + 0.1)), (0.4, dw + 0.4, 0.22), HP['timber'], r)
    if dh + 0.3 < height:  # plaster above the door up to the wall top
        box(b, dpos + r @ Vector((0, 0, (dh + 0.2 + height) / 2)), (0.3, dw + 0.3, height - dh - 0.2), HP['plaster'], r)
    leaf_rot = zrot(door_deg + 70)
    box(b, dpos + r @ Vector((0.5, dw / 2 - 0.1, dh / 2)), (0.08, dw * 0.8, dh - 0.1), HP['door'], leaf_rot)
    box(b, dpos + r @ Vector((0.5, 0, 0.08)), (0.9, dw + 0.2, 0.16), HP['stone_dk'], r)
    box(b, dpos + r @ Vector((1.0, 0, 0.0)), (0.7, dw + 0.5, 0.14), HP['stone'], r)
    sp = b.bm  # awning: half cone over the door
    del sp
    for k in range(7):
        y = -1.0 + k / 3
        box(b, dpos + r @ Vector((0.45, y * dw / 1.5, dh + 0.45 - abs(y) * 0.25)), (0.9, 0.4, 0.1), HP['cap_dk'],
            r @ Matrix.Rotation(math.radians(-18), 3, 'Y'))


def window(b, pos_deg, z, surf_r, rnd, hood=True):
    """Small window with frame, shutters and glowing glass, facing outwards."""
    r = zrot(pos_deg)
    c = polar(surf_r, pos_deg, z)
    box(b, c + r @ Vector((0.05, 0, 0)), (0.3, 1.05, 1.3), HP['timber'], r)
    b.mat = 1
    box(b, c + r @ Vector((0.16, 0, 0)), (0.12, 0.75, 1.0), HP['glow'], r, mat=1)
    b.mat = 0
    box(b, c + r @ Vector((0.24, 0, 0)), (0.06, 0.08, 1.0), HP['timber'], r)
    box(b, c + r @ Vector((0.24, 0, 0)), (0.06, 0.75, 0.08), HP['timber'], r)
    box(b, c + r @ Vector((0.25, 0, -0.62)), (0.35, 1.2, 0.1), HP['timber'], r)
    if hood:
        box(b, c + r @ Vector((0.35, 0, 0.82)), (0.75, 1.5, 0.12), HP['cap_dk'],
            r @ Matrix.Rotation(math.radians(-22), 3, 'Y'))


def trunk_radius_at(spec, z):
    h, rb, rt = spec['trunk']
    t = max(0, min(1, z / h))
    return rt + (rb - rt) * (1 - t) ** 1.6


def balcony(b, z, deg, depth, span, spec):
    """Curved wooden platform with posts and rail, wrapped round the trunk."""
    r_in = trunk_radius_at(spec, z) * 0.9
    depth = max(depth, RULES['balcony_depth'])
    r_out = r_in + depth
    # walkable sample points: skip the strip hugging the trunk (vines, door hood live there)
    floor_pts = [polar(r_in + 0.7 + k * (depth - 1.0) / 2, deg + d, z) for d in (-span / 3, 0, span / 3) for k in (0, 1, 2)]
    n = max(6, int(span / 12))
    a0 = deg - span / 2
    deck = [[polar(r_in, a0 + span * j / n, z) for j in range(n + 1)],
            [polar(r_out, a0 + span * j / n, z) for j in range(n + 1)]]
    deck_lo = [[p - Vector((0, 0, 0.25)) for p in row] for row in deck]
    b.grid([deck[0], deck[1], deck_lo[1], deck_lo[0]], close_u=False,
           colors=[[HP['timber']] * (n + 1)] * 4)
    for j in range(n + 1):
        a = a0 + span * j / n
        box(b, polar(r_out - 0.1, a, z + RULES['rail_h'] / 2), (0.14, 0.14, RULES['rail_h']), HP['timber'])
        if j % 2 == 0:  # brackets under the deck
            tube(b, [polar(r_in, a, z - 2.2), polar(r_out - 0.3, a, z - 0.2)], 0.1, HP['timber'], 5)
    rail = [polar(r_out - 0.1, a0 + span * j / (n * 2), z + RULES['rail_h']) for j in range(n * 2 + 1)]
    tube(b, rail, 0.08, HP['timber'], 5)
    rail2 = [p - Vector((0, 0, 0.5)) for p in rail]
    tube(b, rail2, 0.05, HP['timber'], 4)
    # balcony door into the trunk, same size as the ground door
    dw, dh = RULES['door_w'], RULES['door_h']
    rot = zrot(deg)
    c = polar(trunk_radius_at(spec, z + 1.2) * 0.92, deg, z)
    for s in (-1, 1):
        box(b, c + rot @ Vector((0.1, s * (dw / 2 + 0.08), dh / 2)), (0.3, 0.16, dh), HP['timber'], rot)
    box(b, c + rot @ Vector((0.1, 0, dh + 0.1)), (0.3, dw + 0.4, 0.2), HP['timber'], rot)
    box(b, c + rot @ Vector((0.05, 0, dh / 2)), (0.12, dw, dh), HP['door'], rot)
    b.mat = 1
    box(b, c + rot @ Vector((0.12, 0, dh * 0.72)), (0.04, dw * 0.5, 0.5), HP['glow'], rot, mat=1)
    b.mat = 0
    box(b, c + rot @ Vector((0.4, 0, dh + 0.35)), (0.7, dw + 0.6, 0.12), HP['cap_dk'], rot @ Matrix.Rotation(math.radians(-20), 3, 'Y'))
    return floor_pts


def shelf_mushroom(b, z, deg, spec, rnd):
    """Cluster of blue bracket mushrooms on the trunk."""
    for k in range(3):
        a = deg + rnd.uniform(-15, 15)
        rr = trunk_radius_at(spec, z) * 0.95
        s = rnd.uniform(0.6, 1.1)
        p = polar(rr + s * 0.5, a, z + k * 0.45 - 0.5)
        b.add_blob(p, s, (1.0, 0.9, 0.22), (HP['blue'], HP['blue_lt']), rnd, 2, None, 0.08)


def vines(b, spec, count, rnd):
    h = spec['trunk'][0]
    for v in range(count):
        ph = rnd.uniform(0, math.tau)
        turns = rnd.uniform(0.8, 1.6)
        pts = []
        for i in range(40):
            t = i / 39
            z = 0.3 + t * h * rnd.uniform(0.85, 0.95)
            a = ph + t * turns * math.tau
            rr = trunk_radius_at(spec, z) + 0.12
            pts.append(Vector((math.cos(a) * rr, math.sin(a) * rr, z)))
        tube(b, pts, [0.16 - 0.08 * i / 39 for i in range(40)], HP['vine'], 5, HP['vine_lt'])
        for i in range(4, 40, 6):
            b.add_blob(pts[i], 0.28, (1.4, 0.8, 0.3), (HP['vine'], HP['vine_lt']), rnd, 1, None, 0.1)
    # hanging vines off cap rims
    for (x, y, z, rad, hr, tilt, droop) in spec['caps']:
        for _ in range(int(rad / 2.5)):
            a = rnd.uniform(0, math.tau)
            top = Vector((x, y, z - droop * 0.9)) + Vector((math.cos(a), math.sin(a), 0)) * rad * 0.97
            ln = rnd.uniform(1.5, 4.0)
            pts = [top + Vector((math.sin(t * 3) * 0.2, 0, -t * ln)) for t in (i / 8 for i in range(9))]
            tube(b, pts, [0.09 - 0.07 * i / 8 for i in range(9)], HP['vine'], 4, HP['vine_lt'])
            b.add_blob(pts[-1], 0.22, (1.4, 0.8, 0.4), (HP['vine'], HP['vine_lt']), rnd, 1, None, 0.1)


def lantern(b, x, y):
    """Curled iron post with a hanging lantern."""
    base = Vector((x, y, 0))
    pts = [base + Vector((0, 0, z)) for z in (0, 1, 2, 3, 3.8)]
    for i in range(1, 14):  # curl over the top
        a = i / 13 * math.pi * 1.6
        rr = 0.9 * (1 - i / 20)
        pts.append(base + Vector((math.sin(a) * rr, 0, 3.8 + (1 - math.cos(a)) * rr * 0.5 + math.sin(a) * 0.3)))
    tube(b, pts, 0.07, HP['iron'], 6)
    hang = base + Vector((0.9, 0, 3.9))
    tube(b, [hang, hang - Vector((0, 0, 0.5))], 0.02, HP['iron'], 4)
    c = hang - Vector((0, 0, 0.85))
    box(b, c, (0.38, 0.38, 0.5), HP['iron'])
    b.mat = 1
    box(b, c, (0.42, 0.3, 0.4), HP['glow'], mat=1)
    box(b, c, (0.3, 0.42, 0.4), HP['glow'], mat=1)
    b.mat = 0
    box(b, c + Vector((0, 0, 0.3)), (0.5, 0.5, 0.08), HP['iron'])
    box(b, base + Vector((0, 0, 0.1)), (0.45, 0.45, 0.2), HP['stone_dk'])


# ---------------------------------------------------------------- house
def build_house(name, spec, rnd):
    b = so.Builder()
    h, rb, rt = spec['trunk']
    rr, rh = spec['room']
    trunk(b, h, rb, rt, rnd, max(0.0, rr - rb - 0.6))
    room(b, rr, rh, spec['door_angle'], rnd)
    for i, c in enumerate(spec['caps']):
        shade = (0.55, 0.1, 0.75, 0.25)[i % 4] if i < len(spec['caps']) - 1 else 0.05
        roof_cap(b, c[:3], c[3], c[4], c[5], c[6], rnd, shade)
    for w in spec['windows']:
        z, deg = w[0], w[1]
        surf = rr + 0.05 if len(w) > 2 else trunk_radius_at(spec, z) * 0.92
        window(b, deg, z, surf, rnd)
    checks = {}
    if spec['balcony']:
        checks['balcony'] = balcony(b, *spec['balcony'], spec)
    for z, deg in spec['shelves']:
        shelf_mushroom(b, z, deg, spec, rnd)
    vines(b, spec, spec['vines'], rnd)
    lantern(b, *spec['lantern'])
    so.moss_mound(b, (0, 0, -0.35), rr + 2.5, rnd, lumps=18)
    ob = b.to_object(name)
    # scale check: free height above the balcony deck (room floor is checked once the interior exists)
    if 'balcony' in checks:
        hr = headroom(ob, checks['balcony'])
        print(f'{name}: balcony headroom {hr:.2f} m (rule {RULES["headroom"]})')
        assert hr >= RULES['headroom'], f'{name}: balcony headroom too low'
    return ob


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
    out_dir = os.path.abspath(argv[0] if argv else 'spor_mantar_ev_out')
    os.makedirs(out_dir, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    rnd = random.Random(11)
    lods = {}
    for name, spec in HOUSES.items():
        ob = build_house(name, spec, rnd)
        lods[name] = so.make_lods(ob)
        print(name, 'tris per LOD:', [so.tri_count(o) for o in lods[name]])
        so.export(lods[name], os.path.join(out_dir, name + '.glb'))
    for name, objs in lods.items():
        for o in objs[1:]:
            o.hide_set(True)
            o.hide_render = True
    if '--render' in argv:
        cam, fig = so.setup_render()
        prev = os.path.join(out_dir, 'onizleme')
        os.makedirs(prev, exist_ok=True)
        xs = {'ev_kule': 0, 'ev_genis': 30, 'ev_kulube': -24}
        for name, objs in lods.items():
            objs[0].location.x = xs[name]
        lod0 = [lods[n][0] for n in lods]
        so.render(cam, fig, lod0, (3, 0, 0), (-3, -9, 0), os.path.join(prev, 'mantar_evler.png'), zoom=0.62)
        for name, objs in lods.items():
            so.render(cam, fig, [objs[0]], (xs[name], 0, 0), (xs[name] - 2, -7.5, 0),
                      os.path.join(prev, name + '.png'))
        for name, objs in lods.items():
            objs[0].location.x = xs[name]
        for n in ('preview_ground', 'cam', 'sun'):
            bpy.data.objects[n].hide_set(True)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out_dir, 'spor_mantar_ev.blend'))


if __name__ == '__main__':
    main()
