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

WALL = 0.3   # trunk wall thickness: the inside is the back of the outside, smaller by this much

HP = {  # house palette, soft watercolor versions of the reference
    'bark': (0.44, 0.31, 0.24), 'bark_dk': (0.28, 0.19, 0.16), 'bark_lt': (0.58, 0.44, 0.34),
    'cap': (0.74, 0.27, 0.27), 'cap_lt': (0.88, 0.46, 0.34), 'cap_dk': (0.46, 0.20, 0.32),
    'gill': (0.52, 0.24, 0.30), 'gill_lt': (0.70, 0.38, 0.36),
    'plaster': (0.90, 0.83, 0.70), 'timber': (0.36, 0.24, 0.18), 'door': (0.30, 0.19, 0.14),
    'stone': (0.66, 0.62, 0.55), 'stone_dk': (0.50, 0.47, 0.42),
    'vine': (0.30, 0.46, 0.26), 'vine_lt': (0.46, 0.62, 0.32),
    'blue': (0.36, 0.44, 0.72), 'blue_lt': (0.56, 0.62, 0.86),
    'iron': (0.14, 0.13, 0.15), 'glow': (1.0, 0.85, 0.5),
    # interior: the stem's colors, darker and warmer
    'in_wall': (0.62, 0.44, 0.34), 'in_wall_dk': (0.46, 0.31, 0.25),
    'floor': (0.56, 0.38, 0.24), 'floor_dk': (0.44, 0.29, 0.18), 'bone': (0.88, 0.82, 0.70),
}

# Shapes. Heights in meters. caps: (x, y, z, radius, height ratio, tilt deg, droop)
HOUSES = {
    'ev_kule': dict(
        trunk=(20.0, 3.0, 2.1), room=(4.6, 3.4), door_angle=-90, bend=0.13, bend_ph=3.5, twist=1.6,
        caps=[(0, 0, 3.7, 6.6, 0.38, 6, 0.9), (1.4, 0.8, 6.6, 4.8, 0.40, -12, 0.8),
              (-0.8, -0.4, 15.2, 7.0, 0.34, 12, 1.2), (0.3, 0.2, 19.6, 10.5, 0.34, -9, 1.8)],
        windows=[(5.6, -60), (8.4, 150), (9.0, 40), (13.6, -60), (17.4, 60)],
        balcony=(10.6, -110, 3.6, 150), shelves=[(5.5, 20), (11.5, 100), (14.0, 200)],
        vines=3, lantern=(-6.5, -5.0)),
    'ev_genis': dict(
        trunk=(15.0, 3.6, 2.4), room=(5.8, 3.6), door_angle=-80, bend=0.10, bend_ph=2.2, twist=1.0,
        caps=[(0.8, 0.4, 6.9, 7.5, 0.36, -11, 1.1), (0.0, 0.0, 15.4, 13.0, 0.32, 8, 2.2)],
        windows=[(4.6, -40), (5.0, -130), (12.2, 160), (12.0, 20), (11.0, 150)],
        balcony=(9.6, -90, 4.4, 260), shelves=[(4.8, 60), (12.8, -140)],
        vines=4, lantern=(7.0, -6.0)),
    'ev_kulube': dict(
        trunk=(10.5, 2.6, 2.1), room=(5.0, 3.2), door_angle=-95, bend=0.08, bend_ph=4.0, twist=1.4,
        caps=[(0, 0, 3.4, 8.2, 0.40, 5, 1.2), (0.4, 0.3, 10.4, 7.6, 0.38, -12, 1.4)],
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


def trunk_off(spec, z):
    """Sideways offset of the trunk's center line at height z (0 at the ground).
    One S-curve per house, shared by the trunk and everything attached to it."""
    h = spec['trunk'][0]
    t = max(0.0, min(1.2, z / h))
    a, ph = spec.get('bend', 0.1) * h, spec.get('bend_ph', 0.0)
    w = t ** 1.3
    return Vector((a * w * math.sin(t * 3.4 + ph), a * 0.8 * w * math.sin(t * 2.6 + ph + 1.7), 0))


def tpolar(spec, r, deg, z=0.0):
    return polar(r, deg, z) + trunk_off(spec, z)


def polar(r, deg, z=0.0):
    a = math.radians(deg)
    return Vector((math.cos(a) * r, math.sin(a) * r, z))


# ---------------------------------------------------------------- parts
def trunk(b, spec, rnd, max_flare=99.0, openings=()):
    """Hollow bark trunk: grooved outer skin, plain inner wall WALL m inside it.
    openings: (deg, z0, z1, width_m) holes cut through both skins (doors, windows)."""
    height, r_base, r_top = spec['trunk']
    segs, rings = 32, max(20, int(height / 0.5))
    ph = rnd.uniform(0, 6.28)
    roots = [rnd.uniform(0, 360) for _ in range(5)]
    pts, cols = [], []
    for i in range(rings + 1):
        t = i / rings
        sway = trunk_off(spec, height * t)
        twist = t * spec.get('twist', 1.2)
        r = r_top + (r_base - r_top) * (1 - t) ** 1.6
        ring, rc = [], []
        for j in range(segs):
            a = j / segs * math.tau
            groove = math.sin(9 * a + twist * 9 + ph) * 0.5 + 0.5
            flare = sum(max(0, math.cos(a - math.radians(q))) ** 8 for q in roots) * max(0, 1 - t * 6) * min(r_base * 0.7, max_flare)
            rr = r * (1 - 0.07 * groove) + flare
            ring.append(sway + Vector((math.cos(a) * rr, math.sin(a) * rr, height * t - 0.2)))
            c = so.mix(HP['bark_lt'], HP['bark_dk'], groove)
            rc.append(so.jitter(so.mix(c, HP['bark'], 0.4), 0.03, rnd))
        pts.append(ring)
        cols.append(rc)
    def skip(i, j):
        z = height * (i + 0.5) / rings - 0.2
        a = (j + 0.5) / segs * 360
        r = trunk_radius_at(spec, z)
        for deg, z0, z1, w in openings:
            half = math.degrees(w / 2 / r)
            if z0 <= z <= z1 and abs((a - deg + 180) % 360 - 180) <= half:
                return True
        return False

    vs = b.grid(pts, colors=cols, skip=skip)
    b.cap_fan(vs[-1], Vector((0, 0, height)) + trunk_off(spec, height), HP['bark'])
    # inner wall (reversed winding so it faces the shaft)
    inner, icol = [], []
    for i in range(rings + 1):
        z = height * i / rings - 0.2
        r = trunk_radius_at(spec, z) - WALL
        ring = [polar(r, j / segs * 360, z) + trunk_off(spec, z) for j in range(segs)]
        inner.append(ring[::-1])
        icol.append([so.mix(HP['in_wall'], HP['in_wall_dk'], 0.5 + 0.5 * math.sin(z * 1.3 + j)) for j in range(segs)])
    b.grid(inner, colors=icol, skip=lambda i, j: skip(i, segs - 1 - j))
    # reveal: close the wall thickness around each opening with timber
    for deg, z0, z1, w in openings:
        r = trunk_radius_at(spec, (z0 + z1) / 2) - WALL / 2
        rot = zrot(deg)
        c = polar(r, deg, 0) + trunk_off(spec, (z0 + z1) / 2)
        for s in (-1, 1):
            box(b, c + rot @ Vector((0, s * (w / 2 + 0.06), (z0 + z1) / 2)), (WALL + 0.25, 0.14, z1 - z0), HP['timber'], rot)
        for z in (z0, z1):
            box(b, c + rot @ Vector((0, 0, z)), (WALL + 0.25, w + 0.26, 0.14), HP['timber'], rot)


def roof_cap(b, center, radius, hr, tilt, droop, rnd, shade=0.0, segs=64, gills=40, spec=None):
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

    prof = [(i / 10, h * (1 - (i / 10) ** 1.1) - droop * 0.5 * (i / 10) ** 3) for i in range(1, 11)]
    prof += [(1.03, -droop * 0.45), (1.02, -droop), (0.97, -droop * 1.05)]
    rings, cols = [], []
    for k, (t, z) in enumerate(prof):
        ring, rc = [], []
        for j in range(segs):
            a = j / segs * math.tau
            # uneven sag: one side hangs lower, plus a soft wave along the rim
            wave = (0.22 * math.sin(5 * a + ph) - 0.55 * max(0, math.cos(a - ph * 1.3)) ** 2) * t ** 2 * droop
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
    def inside_trunk(p):
        if spec is None or p.z > spec['trunk'][0] - 0.25:   # above the trunk top the cap stays whole
            return False
        d = p - trunk_off(spec, p.z)
        return math.hypot(d.x, d.y) < trunk_radius_at(spec, p.z) - WALL / 2

    def skip(i, j):  # cut the hole the trunk passes through, so the shaft stays clear
        k = (j + 1) % segs
        c = (rings[i][j] + rings[i][k] + rings[i + 1][j] + rings[i + 1][k]) / 4
        return inside_trunk(c)

    vs = b.grid(rings, colors=cols, skip=skip)
    top, under = center + rot @ Vector((0, 0, h)), center + rot @ Vector((0, 0, h * 0.15))
    if not inside_trunk(top):
        b.cap_fan(vs[0], top, HP['cap_lt'], flip=True)
    if not inside_trunk(under):
        b.cap_fan(vs[-1], under, HP['gill'])


def room(b, radius, height, door_deg, rnd, r_trunk):
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
    roof = [[polar(rr_, a0 + span * j / segs, height) for j in range(segs + 1)] for rr_ in (radius + 0.3, r_trunk - WALL / 2)]
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


def window(b, pos_deg, z, surf_r, rnd, hood=True, off=None):
    """Small window with frame, shutters and glowing glass, facing outwards."""
    r = zrot(pos_deg)
    c = polar(surf_r, pos_deg, z) + (off if off is not None else Vector())
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
    floor_pts = [tpolar(spec, r_in + 0.7 + k * (depth - 1.4) / 2, deg + d, z) for d in (-span / 3, 0, span / 3) for k in (0, 1, 2)]
    n = max(6, int(span / 12))
    a0 = deg - span / 2
    deck = [[tpolar(spec, r_in, a0 + span * j / n, z) for j in range(n + 1)],
            [tpolar(spec, r_out, a0 + span * j / n, z) for j in range(n + 1)]]
    deck_lo = [[p - Vector((0, 0, 0.25)) for p in row] for row in deck]
    b.grid([deck[0], deck[1], deck_lo[1], deck_lo[0]], close_u=False,
           colors=[[HP['timber']] * (n + 1)] * 4)
    for j in range(n + 1):
        a = a0 + span * j / n
        box(b, tpolar(spec, r_out - 0.1, a, z + RULES['rail_h'] / 2), (0.14, 0.14, RULES['rail_h']), HP['timber'])
        if j % 2 == 0:  # brackets under the deck
            tube(b, [tpolar(spec, r_in, a, z - 2.2), tpolar(spec, r_out - 0.3, a, z - 0.2)], 0.1, HP['timber'], 5)
    rail = [tpolar(spec, r_out - 0.1, a0 + span * j / (n * 2), z + RULES['rail_h']) for j in range(n * 2 + 1)]
    tube(b, rail, 0.08, HP['timber'], 5)
    rail2 = [p - Vector((0, 0, 0.5)) for p in rail]
    tube(b, rail2, 0.05, HP['timber'], 4)
    # balcony door into the trunk, same size as the ground door
    dw, dh = RULES['door_w'], RULES['door_h']
    rot = zrot(deg)
    c = tpolar(spec, trunk_radius_at(spec, z + 1.2) * 0.92, deg, z)
    box(b, c + rot @ Vector((0.4, 0, dh + 0.35)), (0.7, dw + 0.6, 0.12), HP['cap_dk'], rot @ Matrix.Rotation(math.radians(-20), 3, 'Y'))
    return floor_pts


def shelf_mushroom(b, z, deg, spec, rnd):
    """Cluster of blue bracket mushrooms on the trunk."""
    for k in range(3):
        a = deg + rnd.uniform(-15, 15)
        rr = trunk_radius_at(spec, z) * 0.95
        s = rnd.uniform(0.6, 1.1)
        p = tpolar(spec, rr + s * 0.5, a, z + k * 0.45 - 0.5)
        b.add_blob(p, s, (1.0, 0.9, 0.22), (HP['blue'], HP['blue_lt']), rnd, 2, None, 0.08)


def vines(b, spec, count, rnd):
    h = spec['trunk'][0]
    for v in range(count):
        ph = rnd.uniform(0, math.tau)
        turns = rnd.uniform(0.8, 1.6)
        pts = []
        for i in range(40):
            t = i / 39
            z = spec['room'][1] + 0.3 + t * (h - spec['room'][1]) * rnd.uniform(0.85, 0.95)
            a = ph + t * turns * math.tau
            rr = trunk_radius_at(spec, z) + 0.12
            pts.append(Vector((math.cos(a) * rr, math.sin(a) * rr, z)) + trunk_off(spec, z))
        tube(b, pts, [0.16 - 0.08 * i / 39 for i in range(40)], HP['vine'], 5, HP['vine_lt'])
        for i in range(4, 40, 6):
            b.add_blob(pts[i], 0.28, (1.4, 0.8, 0.3), (HP['vine'], HP['vine_lt']), rnd, 1, None, 0.1)
    # hanging vines off cap rims
    for (x, y, z, rad, hr, tilt, droop) in spec['caps']:
        for _ in range(int(rad / 2.5)):
            a = rnd.uniform(0, math.tau)
            top = Vector((x, y, z - droop * 0.9)) + trunk_off(spec, z) + Vector((math.cos(a), math.sin(a), 0)) * rad * 0.97
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


# ---------------------------------------------------------------- interior
STEP_DEG = 34   # spiral stair: degrees per step (tread about 0.6 m at mid radius)


def stair_plan(spec):
    """Spiral from the ground arch up to the balcony landing. Returns
    (entry angle, [(angle, top z), ...], landing z, landing arc start)."""
    bz, bdeg = spec['balcony'][0], spec['balcony'][1]
    n = math.ceil(bz / RULES['riser'])
    rise = bz / n
    a_end = bdeg - 25                      # last step ends at the edge of the balcony door
    steps = [(a_end - (n - k) * STEP_DEG, k * rise) for k in range(1, n + 1)]
    entry = steps[0][0] - STEP_DEG * 1.2   # ground arch sits just before the first step
    return entry, steps, bz, a_end - 2


def interior(b, spec, rnd):
    """Ground room fit-out, shaft floor, spiral stair and landing. Returns check points."""
    rr, rh = spec['room']
    pts = {'room': [], 'stair': []}
    # ground room: parquet floor ring and bone-white vault ribs under the ceiling
    segs = 48
    rings, cols = [], []
    for r in (trunk_radius_at(spec, 0) - 0.05, rr - 0.1):
        rings.append([polar(r, j / segs * 360, 0.02) for j in range(segs)])
        cols.append([HP['floor'] if j % 2 else HP['floor_dk'] for j in range(segs)])
    b.grid(rings, colors=cols)
    for j in range(0, 360, 30):
        r0, r1 = trunk_radius_at(spec, rh), rr - 0.2
        tube(b, [polar(r0, j, rh - 0.05), polar((r0 + r1) / 2, j + 6, rh - 0.35), polar(r1, j, rh - 0.6)], 0.09, HP['bone'], 5)
    # mushroom-shaped hearth opposite the door
    hd = spec['door_angle'] + 180
    pts['room'] = [polar((trunk_radius_at(spec, 0) + rr) / 2, j + 15, 0.02) for j in range(0, 360, 30)
                   if abs((j + 15 - hd + 180) % 360 - 180) > 40]   # the hearth corner is furniture
    b.add_blob(polar(rr - 0.7, hd, 1.0), 0.7, (1.1, 0.8, 1.4), (HP['stone_dk'], HP['stone']), rnd, 2, None, 0.05)
    b.add_blob(polar(rr - 0.9, hd, 2.2), 0.9, (1.3, 1.0, 0.45), (HP['cap_dk'], HP['cap']), rnd, 2, None, 0.05)
    b.mat = 1
    box(b, polar(rr - 1.35, hd, 0.55), (0.3, 0.8, 0.5), HP['glow'], zrot(hd), mat=1)
    b.mat = 0
    if not spec['balcony']:
        return pts
    entry, steps, lz, land0 = stair_plan(spec)
    # shaft floor
    z0 = 0.02
    sr = trunk_radius_at(spec, 0) - WALL
    ring = [polar(sr, j / 24 * 360, z0) + trunk_off(spec, 0) for j in range(24)]
    b.grid([ring, [trunk_off(spec, 0) + Vector((0, 0, z0))] * 24], colors=[[HP['floor']] * 24] * 2)
    # bone column up the middle, following the trunk's curve
    post = [trunk_off(spec, z) + Vector((0, 0, z)) for z in [lz * k / 8 for k in range(9)]]
    tube(b, post, [0.32] + [0.24] * 7 + [0.3], HP['bone'], 8)
    b.add_blob(post[-1] + Vector((0, 0, 0.9)), 0.3, (1, 1, 1.3), (HP['bone'], HP['bone']), rnd, 1, None, 0)  # newel knob, rail height
    # steps: wedge blocks from the post to the shaft wall
    for a, z in steps:
        r_out = trunk_radius_at(spec, z) - WALL - 0.05
        w = r_out - 0.25
        assert w >= RULES['stair_w'], f'stair too narrow at z={z:.1f}: {w:.2f} m'
        mid = (0.25 + r_out) / 2
        tread = math.radians(STEP_DEG) * mid + 0.08
        box(b, tpolar(spec, mid, a, z - RULES['riser'] / 2), (w, tread, RULES['riser']),
            HP['floor'] if int(a / STEP_DEG) % 2 else HP['floor_dk'], zrot(a))
        pts['stair'].append(tpolar(spec, mid, a, z))
    # landing at balcony level: a short arc in front of the doorway. It must stay
    # short, the stair's last turn runs underneath it (the headroom check guards this)
    arc = 52
    n = 16
    r_out = trunk_radius_at(spec, lz) - WALL - 0.02
    deck = [[tpolar(spec, r, land0 + arc * j / n, lz) for j in range(n + 1)] for r in (0.2, r_out)]
    low = [[p - Vector((0, 0, 0.12)) for p in row] for row in deck]
    b.grid([deck[0], deck[1], low[1], low[0]], close_u=False, colors=[[HP['floor']] * (n + 1)] * 4)
    pts['stair'].append(tpolar(spec, (0.25 + r_out) / 2, spec['balcony'][1], lz))
    return pts, entry


# ---------------------------------------------------------------- house
def build_house(name, spec, rnd):
    b = so.Builder()
    h, rb, rt = spec['trunk']
    rr, rh = spec['room']
    dw, dh = RULES['door_w'], RULES['door_h']
    openings = []
    stair = None
    if spec['balcony']:
        bz, bdeg = spec['balcony'][0], spec['balcony'][1]
        entry = stair_plan(spec)[0]
        openings += [(entry % 360, 0.0, dh, dw), (bdeg % 360, bz, bz + dh, dw)]
    for w in spec['windows']:
        if len(w) == 2:
            openings.append((w[1] % 360, w[0] - 0.5, w[0] + 0.5, 0.75))
    trunk(b, spec, rnd, 0.0, openings)
    room(b, rr, rh, spec['door_angle'], rnd, trunk_radius_at(spec, rh))
    inside = interior(b, spec, rnd)
    if isinstance(inside, tuple):
        inside = inside[0]
    for i, c in enumerate(spec['caps']):
        shade = (0.55, 0.1, 0.75, 0.25)[i % 4] if i < len(spec['caps']) - 1 else 0.05
        roof_cap(b, Vector(c[:3]) + trunk_off(spec, c[2]), c[3], c[4], c[5], c[6], rnd, shade, spec=spec)
    for w in spec['windows']:
        z, deg = w[0], w[1]
        on_wall = len(w) > 2
        surf = rr + 0.05 if on_wall else trunk_radius_at(spec, z) * 0.92
        window(b, deg, z, surf, rnd, off=None if on_wall else trunk_off(spec, z))
    checks = {'room': inside['room']}
    if inside['stair']:
        checks['stair'] = inside['stair']
    if spec['balcony']:
        checks['balcony'] = balcony(b, *spec['balcony'], spec)
    for z, deg in spec['shelves']:
        shelf_mushroom(b, z, deg, spec, rnd)
    vines(b, spec, spec['vines'], rnd)
    lantern(b, *spec['lantern'])
    for _ in range(26):  # moss lumps round the outside of the wall only
        a = rnd.uniform(0, 360)
        p = polar(rr + rnd.uniform(0.3, 2.6), a, -0.1)
        c0 = rnd.choice((so.PAL['moss_a'], so.PAL['moss_b'], so.PAL['moss_c']))
        b.add_blob(p, rnd.uniform(0.35, 0.7), (1, 1, 0.5), (so.PAL['moss_b'], c0), rnd, 1, None, 0.25)
    ob = b.to_object(name)
    # scale check: free height above every walkable floor (room, stair, landing, balcony)
    for where, pts in checks.items():
        hr = headroom(ob, pts)
        print(f'{name}: {where} headroom {hr:.2f} m (rule {RULES["headroom"]})')
        assert hr >= RULES['headroom'], f'{name}: {where} headroom too low'
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
        # cutaways: a copy of each house sliced in half to show the stair and rooms
        cuts = []
        for name, objs in lods.items():
            cp = objs[0].copy()
            cp.data = objs[0].data.copy()
            cp.name = name + '_kesit'
            bpy.context.scene.collection.objects.link(cp)
            bm = bmesh.new()
            bm.from_mesh(cp.data)
            off = trunk_off(HOUSES[name], HOUSES[name]['balcony'][0] / 2)
            bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, off.y + 0.6, 0),
                                   plane_no=(0, -1, 0), clear_outer=True)
            bm.to_mesh(cp.data)
            bm.free()
            cp.location.x = xs[name] * 0.85
            cuts.append(cp)
        for name, objs in lods.items():
            objs[0].hide_render = True
        so.render(cam, fig, cuts, (3, 0, 0), (-21, -6, 0), os.path.join(prev, 'kesit_ic_mekan.png'), zoom=0.5, view=(0.15, -1.0))
        for c in cuts:
            bpy.data.objects.remove(c)
        for name, objs in lods.items():
            objs[0].location.x = xs[name]
            objs[0].hide_render = False
        for n in ('preview_ground', 'cam', 'sun'):
            bpy.data.objects[n].hide_set(True)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out_dir, 'spor_mantar_ev.blend'))


if __name__ == '__main__':
    main()
