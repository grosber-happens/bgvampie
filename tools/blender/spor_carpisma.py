"""Collision boxes for walkable Spor Ormanı models (houses, bridges).

Samples each model's LOD0 surface on a 0.5 m grid:
- upward faces become thin floor slabs (room floors, stairs, balconies, bridge decks, cap tops),
- steep faces become wall boxes (trunk shell, railings, furniture).
Writes src/assets/spor/carpisma.json: {kind: [[x, z, hw, hd, y0, y1], ...]} in the model's own
units, x/z already in the game's frame (the glTF loader's root turns the model 180 degrees).

Run: python3 tools/blender/spor_carpisma.py
"""
import json
import os

import math
import sys

import bpy
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import spor_mantar_ev as ev  # noqa: E402
from olcek import RULES  # noqa: E402

KINDS = ['ev_kule', 'ev_genis', 'ev_kulube', 'kopru_tas', 'kopru_tas_yikik', 'kopru_ahsap']
CELL = 0.5          # floor grid cell (m); flat 2x2 blocks are merged into one
WALL_CELL = 0.25    # wall grid cell (m): finer, so doorways and diagonal parts stay open
SAMPLE = 0.15       # surface sample spacing (m)
UP = 0.55           # normal z above this = floor
SLAB = 0.35         # floor slab thickness
WALL_MIN = 0.35     # walls shorter than this are stepped over anyway
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'src', 'assets', 'spor')


def tris_of(kind):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT, kind + '.glb'))
    ob = next(o for o in bpy.data.objects if o.type == 'MESH' and o.name.startswith(kind + '_LOD0'))
    me = ob.evaluated_get(bpy.context.evaluated_depsgraph_get()).to_mesh()
    me.calc_loop_triangles()
    mw = np.array(ob.matrix_world)
    v = np.array([mw[:3, :3] @ np.array(p.co) + mw[:3, 3] for p in me.vertices])
    t = np.array([lt.vertices[:] for lt in me.loop_triangles])
    return v[t]  # (n, 3, 3) Blender z-up


def samples(tri):
    a, b, c = tri[:, 0], tri[:, 1], tri[:, 2]
    n = np.cross(b - a, c - a)
    area = np.linalg.norm(n, axis=1) / 2
    nz = n[:, 2] / np.maximum(area * 2, 1e-9)
    k = np.ceil(area / SAMPLE ** 2).astype(int) + 1
    idx = np.repeat(np.arange(len(tri)), k)
    rng = np.random.default_rng(1)
    u, w = rng.random(len(idx)), rng.random(len(idx))
    flip = u + w > 1
    u[flip], w[flip] = 1 - u[flip], 1 - w[flip]
    p = a[idx] + (b - a)[idx] * u[:, None] + (c - a)[idx] * w[:, None]
    # vertices too, so thin parts are never missed
    p = np.vstack([p, a, b, c])
    nzs = np.concatenate([nz[idx], nz, nz, nz])
    return p, nzs


def clusters(z, gap):
    z = np.sort(z)
    cut = np.where(np.diff(z) > gap)[0]
    return np.split(z, cut + 1)


def doors(kind):
    """Doorways as (center, facing angle, depth, floor z). Their clear size is RULES door_w x door_h;
    frame trim that pokes into it is left out of the collision, like other cosmetic parts."""
    spec = ev.HOUSES.get(kind)
    if not spec:
        return []
    rr = spec['room'][0]
    out = [(ev.polar(rr - 0.12, spec['door_angle']), spec['door_angle'], 1.6, 0.0)]
    if spec['balcony']:
        entry = ev.stair_plan(spec)[0]
        bz, bdeg = spec['balcony'][0], spec['balcony'][1]
        for deg, z in ((entry, 0.0), (bdeg, bz)):
            out.append((ev.tpolar(spec, ev.trunk_radius_at(spec, z + 1) - ev.WALL / 2, deg, z), deg, ev.WALL + 1.0, z))
    return out


def in_door(b, dl):
    for c, deg, depth, z in dl:
        a = math.radians(deg)
        dx, dy = b[0] - c.x, b[1] - c.y
        along = dx * math.cos(a) + dy * math.sin(a)
        side = -dx * math.sin(a) + dy * math.cos(a)
        if abs(along) < depth / 2 and abs(side) < RULES['door_w'] / 2 and b[5] > z + 0.4 and b[4] < z + RULES['door_h']:
            return True
    return False


def boxes_for(kind):
    p, nz = samples(tris_of(kind))
    out = []
    up = nz > UP
    # floor heights per wall cell (clustered), used to split walls at stair treads
    tops_at = {}
    for key, z in zip(map(tuple, np.floor(p[up][:, :2] / WALL_CELL).astype(int)), p[up][:, 2]):
        tops_at.setdefault(key, []).append(z)
    tops_at = {k: [g.max() + 1e-3 for g in clusters(np.array(v), 0.1)] for k, v in tops_at.items()}
    full = {}
    for cell, mask, floor in ((CELL, up, True), (WALL_CELL, np.abs(nz) <= UP, False)):
        q = p[mask]
        ci = np.floor(q[:, :2] / cell).astype(int)
        order = np.lexsort((ci[:, 1], ci[:, 0]))
        ci, q = ci[order], q[order]
        keys, start = np.unique(ci, axis=0, return_index=True)
        ends = list(start[1:]) + [len(ci)]
        for (ix, iy), s, e in zip(keys, start, ends):
            cp = q[s:e]
            if floor:
                gs = clusters(cp[:, 2], 0.1)
                if len(gs) == 1:
                    full[(ix, iy)] = gs[0].max()   # merged below when its neighbours match
                    continue
                for g in gs:
                    h = g.max()
                    sel = cp[(cp[:, 2] >= g[0]) & (cp[:, 2] <= h)]
                    # the sampled area grown by half a sample step, kept inside the cell
                    x0 = max(sel[:, 0].min() - SAMPLE / 2, ix * cell)
                    x1 = min(sel[:, 0].max() + SAMPLE / 2, (ix + 1) * cell)
                    y0 = max(sel[:, 1].min() - SAMPLE / 2, iy * cell)
                    y1 = min(sel[:, 1].max() + SAMPLE / 2, (iy + 1) * cell)
                    out.append([(x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2, (y1 - y0) / 2, h - SLAB, h])
                continue
            # cut at floor tops in this cell, so stacked stair risers never merge into a wall
            tops = tops_at.get((ix, iy), ())
            for g0 in clusters(cp[:, 2], 0.5):
                for g in np.split(g0, np.searchsorted(g0, sorted(t for t in tops if g0[0] < t < g0[-1]))):
                    if len(g) == 0 or g[-1] - g[0] < WALL_MIN:
                        continue
                    sel = cp[(cp[:, 2] >= g[0]) & (cp[:, 2] <= g[-1])]
                    x0, x1 = sel[:, 0].min(), sel[:, 0].max()
                    y0, y1 = sel[:, 1].min(), sel[:, 1].max()
                    out.append([(x0 + x1) / 2, (y0 + y1) / 2, max((x1 - x0) / 2, 0.05), max((y1 - y0) / 2, 0.05), g[0], g[-1]])
    # single-height floor cells: merge flat 2x2 blocks into one slab
    done = set()
    for (ix, iy), h in full.items():
        if (ix, iy) in done:
            continue
        bx, by = ix - ix % 2, iy - iy % 2
        quad = [(bx + i, by + j) for i in (0, 1) for j in (0, 1)]
        hs = [full.get(c) for c in quad]
        if all(v is not None and abs(v - h) < 0.05 for v in hs) and not done.intersection(quad):
            done.update(quad)
            out.append([(bx + 1) * CELL, (by + 1) * CELL, CELL, CELL, max(hs) - SLAB, max(hs)])
        else:
            done.add((ix, iy))
            out.append([(ix + 0.5) * CELL, (iy + 0.5) * CELL, CELL / 2, CELL / 2, h - SLAB, h])
    dl = doors(kind)
    out = [b for b in out if not in_door(b, dl)]
    # Blender (x, y, z) -> game local (-x, height z, -y): the glTF loader's root turns the model 180 degrees.
    return [[round(-b[0], 2), round(-b[1], 2), round(b[2], 2), round(b[3], 2), round(b[4], 2), round(b[5], 2)] for b in out]


if __name__ == '__main__':
    data = {}
    for k in KINDS:
        data[k] = boxes_for(k)
        print(k, len(data[k]))
    with open(os.path.join(ROOT, 'carpisma.json'), 'w') as f:
        json.dump(data, f, separators=(',', ':'))
