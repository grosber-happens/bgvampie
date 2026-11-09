#!/usr/bin/env node
/**
 * Collision boxes for the walkable region models (houses, bridges, the passage, the statue, maze walls,
 * the camp tent, floating rocks, climbable rocks and trees).
 *
 *   node tools/assets/bake-collision.mjs [only-name ...]
 *
 * Reads the packed models in src/assets/spor and samples each LOD0 surface:
 * - upward faces become thin floor slabs (room floors, stairs, balconies, decks, rock tops),
 * - steep faces become wall boxes (shells, railings, columns), split at floor heights so stair risers
 *   never merge into one wall.
 * Writes src/assets/spor/carpisma.json: {kind: base64 of little-endian Int16 centimeters, 6 per box:
 * x, z, hw, hd, y0, y1} in the model's own meters (src/collide.ts decodes it),
 * in the game's axes (the glTF loader turns models 180 degrees about y, so glTF x and z flip... see GAME()).
 * Then checks that every house can be walked into from outside at ground level (a 2D flood fill
 * around the player capsule); a house that fails is reported.
 *
 * Port of tools/blender/spor_carpisma.py (same rules), so it needs no Blender.
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.resolve(HERE, '..', '..', 'src', 'assets', 'spor');
const OUT = path.join(DIR, 'carpisma.json');

/** Models that get baked boxes. Everything else uses the simple trunk box in SPOR_KINDS (or none). */
export const BAKED = [
  'ev_kule', 'ev_genis', 'ev_kulube', 'ev_iki_kat', 'ev_uc_kat', 'ev_cam_kule', 'ev_cam_ikiz', 'ev_cam_genis', 'ev_mozaik', 'ev_vitray',
  'kopru_tas', 'kopru_tas_yikik', 'kopru_ahsap', 'kopru_gaudi_mozaik', 'kopru_gaudi_viyaduk', 'kopru_gecit_12', 'kopru_gecit_20', 'kopru_gecit_20_kat', 'kopru_gecit_28',
  'gecit_duz', 'gecit_kavis', 'gecit_son',
  'heykel_mantar_kadin', 'heykel_kaide', 'labirent_duvar_a', 'labirent_duvar_b', 'labirent_duvar_c', 'labirent_dugum_a', 'labirent_dugum_b',
  'kamp_cadir',
  'ucan_blok_kucuk', 'ucan_blok_orta', 'ucan_ada', 'ucan_kaya', 'ucan_basamak', 'ucan_ikiz', 'ucan_sivri', 'ucan_harabe',
  'tas_buyuk', 'tas_kaya', 'tas_yarik', 'tas_grup', 'tas_dengeli', 'tas_dikili', 'tas_kemer', 'tas_sivri', 'tas_yassi', 'blok_yikik_duvar', 'blok_kesme',
  'agac_tapinak', 'agac_lingzhi',
];
/**
 * Everything else that stands in the way: mushrooms, trees, props, camp kit, lamps. Their shape is voxelized
 * (filled inside, merged into as few boxes as fit the budget) so collision follows the model, not one
 * stem box. Budget = most boxes per model; kinds placed by the thousand get small budgets.
 * Kinds left out stay walk-through (grass, enoki, tiny mushrooms, sprouts, pebbles, maze floor tiles).
 */
export const SOLID = {
  mantar_kucuk: 60, mantar_orta: 120, mantar_buyuk: 260, mantar_kumesi: 900,
  mantar_kume_1: 700, mantar_kume_2: 400, mantar_kume_3: 260, mantar_kume_4: 140, mantar_kume_5: 300,
  agac_isik_sogut: 1200, agac_gokkusagi: 1200, agac_masal_mesesi: 1200, agac_yelpaze: 1200, agac_kizil_semsiye: 1200, agac_denizanasi: 1200, agac_kehribar: 1200,
  tas_orta: 120, yosun_tumsek: 120,
  kamp_ates: 120, kurutma_cerceve: 200, kurutma_tepsi: 120, sepet_grubu: 120, kamp_tezgah: 200, kamp_araba: 300, kamp_oturak: 60, kamp_fener: 60, kamp_kupler: 120,
  lamba_sokak: 80, lamba_cift: 100, lamba_bahce: 60, kasa: 40, fici: 80, kutuk: 80, cit: 120, odun_yigini: 120, tabela_ahsap: 60,
};
/** Voxel sizes tried in turn (horizontal, vertical), finest first, until a model fits its budget. */
const VOXEL = [[0.15, 0.15], [0.2, 0.2], [0.3, 0.25], [0.4, 0.3], [0.5, 0.4], [0.7, 0.5], [1, 0.7]];

/** Round mushroom houses: their door frames poke into the doorway, so openDoors clears it. */
const ROUND = ['ev_kule', 'ev_genis', 'ev_kulube', 'ev_iki_kat', 'ev_uc_kat'];
/** Houses checked for an open way in at ground level. */
const HOUSES = BAKED.filter((k) => k.startsWith('ev_') || k === 'kamp_cadir');

const C = {
  cell: 0.25, // floor grid cell (m); flat 2x2 blocks are merged into one
  wallCell: 0.25, // wall grid cell (m): finer, so doorways and diagonal parts stay open
  sample: 0.15, // surface sample spacing (m)
  up: 0.55, // normal y above this = floor
  slab: 0.35, // floor slab thickness
  wallMin: 0.35, // walls shorter than this are stepped over anyway
  maxSamples: 6_000_000,
};
/** Player capsule and step (src/core.ts, src/world.ts) for the way-in check. */
const PLAYER = { r: 0.45, h: 1.85, step: 0.4 };

/** glTF (x, y, z) -> game (-x, y, z): the loader's root turns the model half a turn about y. */
const GAME = (x, y, z) => [-x, y, z];

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });

function mulPoint(m, x, y, z) {
  return [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
}

/** LOD0 triangles in game axes as a flat Float64Array (9 numbers each). */
async function triangles(kind) {
  const doc = await io.read(path.join(DIR, `${kind}.glb`));
  const lod0 = doc.getRoot().listNodes().find((n) => /_LOD0$/.test(n.getName()));
  if (!lod0) throw new Error(`${kind}: no LOD0`);
  // The loader keeps LOD0 where it is; models.ts and spor.ts move it back to the origin in x/z.
  const t = lod0.getWorldTranslation();
  const out = [];
  const walk = (n) => {
    const mesh = n.getMesh();
    if (mesh) {
      const m = n.getWorldMatrix();
      for (const p of mesh.listPrimitives()) {
        if (p.getMode() !== 4) continue;
        const pos = p.getAttribute('POSITION');
        const idx = p.getIndices();
        const v = [0, 0, 0];
        const count = idx ? idx.getCount() : pos.getCount();
        for (let i = 0; i < count; i++) {
          pos.getElement(idx ? idx.getScalar(i) : i, v);
          const w = mulPoint(m, v[0], v[1], v[2]);
          out.push(...GAME(w[0] - t[0], w[1], w[2] - t[2]));
        }
      }
    }
    n.listChildren().forEach(walk);
  };
  walk(lod0);
  return Float64Array.from(out);
}

/** Seeded random (same samples every run). */
function rng(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

/** Surface samples: points (x, y, z) and the normal's y, area-weighted, plus every vertex. */
function samples(tri) {
  const n = tri.length / 9;
  let total = 0;
  const ks = new Int32Array(n), nys = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * 9;
    const ax = tri[o + 3] - tri[o], ay = tri[o + 4] - tri[o + 1], az = tri[o + 5] - tri[o + 2];
    const bx = tri[o + 6] - tri[o], by = tri[o + 7] - tri[o + 1], bz = tri[o + 8] - tri[o + 2];
    const cx = ay * bz - az * by, cy = az * bx - ax * bz, cz = ax * by - ay * bx;
    const len = Math.hypot(cx, cy, cz);
    nys[i] = len > 1e-12 ? cy / len : 0;
    ks[i] = Math.ceil(len / 2 / C.sample ** 2) + 1;
    total += ks[i] + 3;
  }
  const scale = total > C.maxSamples ? C.maxSamples / total : 1;
  const P = [], NY = [];
  const r = rng(1);
  for (let i = 0; i < n; i++) {
    const o = i * 9;
    const k = Math.max(1, Math.round(ks[i] * scale));
    for (let j = 0; j < k; j++) {
      let u = r(), w = r();
      if (u + w > 1) { u = 1 - u; w = 1 - w; }
      P.push(
        tri[o] + (tri[o + 3] - tri[o]) * u + (tri[o + 6] - tri[o]) * w,
        tri[o + 1] + (tri[o + 4] - tri[o + 1]) * u + (tri[o + 7] - tri[o + 1]) * w,
        tri[o + 2] + (tri[o + 5] - tri[o + 2]) * u + (tri[o + 8] - tri[o + 2]) * w,
      );
      NY.push(nys[i]);
    }
    // vertices too, so thin parts are never missed
    for (let c = 0; c < 3; c++) {
      P.push(tri[o + c * 3], tri[o + c * 3 + 1], tri[o + c * 3 + 2]);
      NY.push(nys[i]);
    }
  }
  return { P, NY };
}

/** Split sorted heights into groups wherever the gap is bigger than `gap`. */
function clusters(z, gap) {
  const s = Float64Array.from(z).sort();
  const out = [];
  let cur = [];
  for (let i = 0; i < s.length; i++) {
    if (cur.length && s[i] - cur[cur.length - 1] > gap) { out.push(cur); cur = []; }
    cur.push(s[i]);
  }
  if (cur.length) out.push(cur);
  return out;
}

function boxesFor(tri) {
  const { P, NY } = samples(tri);
  const out = [];
  const N = NY.length;
  // floor heights per wall cell (clustered), used to split walls at stair treads
  const topsAt = new Map();
  const key = (i, j) => `${i},${j}`;
  for (let i = 0; i < N; i++) {
    if (NY[i] <= C.up) continue;
    const k = key(Math.floor(P[i * 3] / C.wallCell), Math.floor(P[i * 3 + 2] / C.wallCell));
    let l = topsAt.get(k);
    if (!l) topsAt.set(k, (l = []));
    l.push(P[i * 3 + 1]);
  }
  for (const [k, v] of topsAt) topsAt.set(k, clusters(v, 0.1).map((g) => g[g.length - 1] + 1e-3));

  const full = new Map();
  for (const floor of [true, false]) {
    const cell = floor ? C.cell : C.wallCell;
    const cells = new Map();
    for (let i = 0; i < N; i++) {
      const isFloor = NY[i] > C.up;
      if (floor ? !isFloor : Math.abs(NY[i]) > C.up) continue;
      const ix = Math.floor(P[i * 3] / cell), iz = Math.floor(P[i * 3 + 2] / cell);
      const k = key(ix, iz);
      let l = cells.get(k);
      if (!l) cells.set(k, (l = { ix, iz, p: [] }));
      l.p.push(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
    }
    for (const { ix, iz, p } of cells.values()) {
      const ys = [];
      for (let i = 1; i < p.length; i += 3) ys.push(p[i]);
      if (floor) {
        const gs = clusters(ys, 0.1);
        if (gs.length === 1) {
          full.set(key(ix, iz), { ix, iz, h: gs[0][gs[0].length - 1] }); // merged below when its neighbours match
          continue;
        }
        for (const g of gs) {
          const lo = g[0], h = g[g.length - 1];
          let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
          for (let i = 0; i < p.length; i += 3) {
            if (p[i + 1] < lo || p[i + 1] > h) continue;
            x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]);
            z0 = Math.min(z0, p[i + 2]); z1 = Math.max(z1, p[i + 2]);
          }
          // the sampled area grown by half a sample step, kept inside the cell
          x0 = Math.max(x0 - C.sample / 2, ix * cell); x1 = Math.min(x1 + C.sample / 2, (ix + 1) * cell);
          z0 = Math.max(z0 - C.sample / 2, iz * cell); z1 = Math.min(z1 + C.sample / 2, (iz + 1) * cell);
          out.push([(x0 + x1) / 2, (z0 + z1) / 2, (x1 - x0) / 2, (z1 - z0) / 2, h - C.slab, h]);
        }
        continue;
      }
      // cut at floor tops in this cell, so stacked stair risers never merge into a wall
      const tops = topsAt.get(key(ix, iz)) ?? [];
      for (const g0 of clusters(ys, 0.5)) {
        const cuts = tops.filter((t) => g0[0] < t && t < g0[g0.length - 1]).sort((a, b) => a - b);
        const parts = [];
        let cur = [];
        let ci = 0;
        for (const y of g0) {
          while (ci < cuts.length && y >= cuts[ci]) { parts.push(cur); cur = []; ci++; }
          cur.push(y);
        }
        parts.push(cur);
        for (const g of parts) {
          if (!g.length || g[g.length - 1] - g[0] < C.wallMin) continue;
          const lo = g[0], hi = g[g.length - 1];
          let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
          for (let i = 0; i < p.length; i += 3) {
            if (p[i + 1] < lo || p[i + 1] > hi) continue;
            x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]);
            z0 = Math.min(z0, p[i + 2]); z1 = Math.max(z1, p[i + 2]);
          }
          out.push([(x0 + x1) / 2, (z0 + z1) / 2, Math.max((x1 - x0) / 2, 0.05), Math.max((z1 - z0) / 2, 0.05), lo, hi]);
        }
      }
    }
  }
  // single-height floor cells: merge into the biggest flat rectangles (rows along x, then equal rows along z)
  const done = new Set();
  const same = (ix, iz, h) => {
    const f = full.get(key(ix, iz));
    return f && !done.has(key(ix, iz)) && Math.abs(f.h - h) < 0.05;
  };
  const cellsSorted = [...full.values()].sort((a, b) => a.iz - b.iz || a.ix - b.ix);
  for (const { ix, iz, h } of cellsSorted) {
    if (done.has(key(ix, iz))) continue;
    let ix2 = ix;
    while (same(ix2 + 1, iz, h)) ix2++;
    let iz2 = iz;
    const rowOk = (z) => {
      for (let i = ix; i <= ix2; i++) if (!same(i, z, h)) return false;
      return true;
    };
    while (rowOk(iz2 + 1)) iz2++;
    let top = -Infinity;
    for (let j = iz; j <= iz2; j++)
      for (let i = ix; i <= ix2; i++) {
        done.add(key(i, j));
        top = Math.max(top, full.get(key(i, j)).h);
      }
    out.push([((ix + ix2 + 1) / 2) * C.cell, ((iz + iz2 + 1) / 2) * C.cell, ((ix2 - ix + 1) / 2) * C.cell, ((iz2 - iz + 1) / 2) * C.cell, top - C.slab, top]);
  }
  const r2 = (v) => Math.round(v * 100) / 100;
  return out.map((b) => b.map(r2));
}

/**
 * Can the player walk in at ground level? Flood fill a 0.1 m grid of the ground storey (feet at the
 * lowest floor near the center) from the outside, through wall boxes grown by the capsule radius.
 */
function wayIn(boxes) {
  const G = 0.1;
  let ext = 0;
  for (const [x, z, hw, hd] of boxes) ext = Math.max(ext, Math.abs(x) + hw, Math.abs(z) + hd);
  ext += 2;
  // Floor height at the middle: the lowest slab top near the center (the ground storey).
  const mid = boxes.filter(([x, z, hw, hd, , y1]) => Math.abs(x) < 2.5 + hw && Math.abs(z) < 2.5 + hd && y1 < 1.6);
  const feet = mid.length ? Math.min(...mid.map((b) => b[5])) : 0;
  const n = Math.ceil((ext * 2) / G);
  const block = new Uint8Array(n * n);
  for (const [x, z, hw, hd, y0, y1] of boxes) {
    if (y1 <= feet + PLAYER.step || y0 >= feet + PLAYER.h) continue;
    const i0 = Math.max(0, Math.floor((x - hw - PLAYER.r + ext) / G)), i1 = Math.min(n - 1, Math.floor((x + hw + PLAYER.r + ext) / G));
    const j0 = Math.max(0, Math.floor((z - hd - PLAYER.r + ext) / G)), j1 = Math.min(n - 1, Math.floor((z + hd + PLAYER.r + ext) / G));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) block[j * n + i] = 1;
  }
  const seen = new Uint8Array(n * n);
  const q = [0];
  seen[0] = 1;
  while (q.length) {
    const c = q.pop();
    const i = c % n, j = (c - i) / n;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + di, b = j + dj;
      if (a < 0 || b < 0 || a >= n || b >= n) continue;
      const k = b * n + a;
      if (seen[k] || block[k]) continue;
      seen[k] = 1;
      q.push(k);
    }
  }
  // Reached any open cell within 4.5 m of the center?
  let inside = 0, reached = 0;
  const c0 = Math.floor(ext / G);
  for (let j = c0 - 45; j <= c0 + 45; j++)
    for (let i = c0 - 45; i <= c0 + 45; i++) {
      if (block[j * n + i]) continue;
      inside++;
      if (seen[j * n + i]) reached++;
    }
  if (process.env.WAY_DEBUG) {
    // Debug picture: black = blocked, grey = reached from outside, white = open but not reached.
    const img = Buffer.alloc(n * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) img[(n - 1 - j) * n + i] = block[j * n + i] ? 0 : seen[j * n + i] ? 170 : 255;
    fs.writeFileSync(path.join(process.env.WAY_DEBUG, `${wayIn.kind}.pgm`), Buffer.concat([Buffer.from(`P5 ${n} ${n} 255\n`), img]));
  }
  return { feet, inside, reached };
}

/**
 * Clear doorways in a round house. Frame trim pokes into the 1.6 m doorway (cosmetic, like the old
 * Blender baker's door list), and wall boxes are a little wider than the trim, so the way in closes.
 * For every storey floor, look round the trunk shell for the widest angle with no wall from knee to
 * head height, then drop the wall boxes of that doorway (1.6 m wide, 2.5 m tall, through the shell).
 */
function openDoors(boxes) {
  const DOOR_W = 1.6, DOOR_H = 2.5;
  // The ground storey: the lowest slab top near the middle (as in wayIn).
  const mid = boxes.filter(([x, z, hw, hd, , y1]) => Math.abs(x) < 2.5 + hw && Math.abs(z) < 2.5 + hd && y1 < 1.6);
  const fl = mid.length ? Math.min(...mid.map((b) => b[5])) : 0;
  // Every round house's street door faces Blender -80..-95 degrees = game +z (atan2 70..110 degrees).
  // Along that fan, the doorway is the 1 degree ray that meets the least wall from knee to head height.
  const walls = boxes.filter(([, , , , y0, y1]) => y0 < fl + 1.6 && y1 > fl + 0.6 && y1 - y0 > 0.3);
  let best = { a: Math.PI / 2, hits: Infinity };
  for (let deg = 70; deg <= 110; deg += 1) {
    const a = (deg * Math.PI) / 180, ux = Math.cos(a), uz = Math.sin(a);
    let hits = 0;
    for (const [x, z, hw, hd] of walls) {
      const along = x * ux + z * uz, side = -x * uz + z * ux;
      if (along > 1 && along < 10 && Math.abs(side) < Math.max(hw, hd) + 0.1) hits++;
    }
    if (hits < best.hits) best = { a, hits };
  }
  // Clear the trim on both sides of that ray, from just outside the trunk (its stair column stays) out
  // past the room wall. Porch steps are lower than knee height, so they stay.
  const ux = Math.cos(best.a), uz = Math.sin(best.a);
  const shell = 3.4;
  const keep = boxes.filter(([x, z, hw, hd, y0, y1]) => {
    if (y1 <= fl + 0.45 || y0 >= fl + DOOR_H) return true;
    const along = x * ux + z * uz, side = -x * uz + z * ux;
    const reach = Math.min(hw, hd);
    return !(Math.abs(side) - reach < DOOR_W / 2 && along > shell && along < 10);
  });
  return { boxes: keep, angle: (best.a * 180) / Math.PI, shell, opened: boxes.length - keep.length };
}

/**
 * Solid boxes for a model you cannot walk into: surface samples mark voxels, each horizontal layer is
 * filled inside (anything the outside cannot reach), then voxels merge into boxes (runs along x, equal
 * runs along z, equal rectangles up y). Each box then shrinks to the samples it holds, so it hugs the
 * surface closer than the voxel grid.
 */
function solidBoxes(tri, budget) {
  const { P } = samples(tri);
  const N = P.length / 3;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let i = 0; i < N; i++) {
    x0 = Math.min(x0, P[i * 3]); x1 = Math.max(x1, P[i * 3]);
    y0 = Math.min(y0, P[i * 3 + 1]); y1 = Math.max(y1, P[i * 3 + 1]);
    z0 = Math.min(z0, P[i * 3 + 2]); z1 = Math.max(z1, P[i * 3 + 2]);
  }
  let best = null;
  for (const [g, gy] of VOXEL) {
    // one empty voxel of margin round the model so the outside flood fill reaches all round it
    const nx = Math.ceil((x1 - x0) / g) + 3, nz = Math.ceil((z1 - z0) / g) + 3, ny = Math.ceil((y1 - y0) / gy) + 1;
    const ox = x0 - g, oz = z0 - g;
    const at = (i, j, k) => (k * nz + j) * nx + i;
    const vox = new Uint8Array(nx * ny * nz);
    const cellOf = new Int32Array(N);
    for (let p = 0; p < N; p++) {
      const i = Math.min(nx - 1, Math.floor((P[p * 3] - ox) / g)), j = Math.min(nz - 1, Math.floor((P[p * 3 + 2] - oz) / g));
      const k = Math.min(ny - 1, Math.floor((P[p * 3 + 1] - y0) / gy));
      vox[(cellOf[p] = at(i, j, k))] = 1;
    }
    // fill each layer's inside
    const seen = new Uint8Array(nx * nz);
    for (let k = 0; k < ny; k++) {
      seen.fill(0);
      const q = [0];
      seen[0] = 1;
      while (q.length) {
        const c = q.pop();
        const i = c % nx, j = (c - i) / nx;
        for (const [a, b] of [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]]) {
          if (a < 0 || b < 0 || a >= nx || b >= nz) continue;
          const c2 = b * nx + a;
          if (seen[c2] || vox[at(a, b, k)]) continue;
          seen[c2] = 1;
          q.push(c2);
        }
      }
      for (let c = 0; c < nx * nz; c++) if (!seen[c]) vox[k * nx * nz + c] = 1;
    }
    // greedy merge: x runs, then z, then y
    const owner = new Int32Array(nx * ny * nz).fill(-1);
    const boxes = [];
    for (let k = 0; k < ny; k++)
      for (let j = 0; j < nz; j++)
        for (let i = 0; i < nx; i++) {
          if (!vox[at(i, j, k)] || owner[at(i, j, k)] >= 0) continue;
          let i2 = i;
          while (i2 + 1 < nx && vox[at(i2 + 1, j, k)] && owner[at(i2 + 1, j, k)] < 0) i2++;
          const rowFree = (jj, kk) => {
            for (let a = i; a <= i2; a++) if (!vox[at(a, jj, kk)] || owner[at(a, jj, kk)] >= 0) return false;
            return true;
          };
          let j2 = j;
          while (j2 + 1 < nz && rowFree(j2 + 1, k)) j2++;
          let k2 = k;
          const layerFree = (kk) => {
            for (let b = j; b <= j2; b++) if (!rowFree(b, kk)) return false;
            return true;
          };
          while (k2 + 1 < ny && layerFree(k2 + 1)) k2++;
          const id = boxes.length;
          for (let kk = k; kk <= k2; kk++) for (let b = j; b <= j2; b++) for (let a = i; a <= i2; a++) owner[at(a, b, kk)] = id;
          boxes.push({ i, i2, j, j2, k, k2, b: [Infinity, -Infinity, Infinity, -Infinity, Infinity, -Infinity] });
        }
    if (boxes.length > budget && g !== VOXEL[VOXEL.length - 1][0]) continue;
    // shrink each box to the samples inside it (boxes with none, deep inside, keep their voxel size)
    for (let p = 0; p < N; p++) {
      const bb = boxes[owner[cellOf[p]]].b;
      const x = P[p * 3], y = P[p * 3 + 1], z = P[p * 3 + 2];
      if (x < bb[0]) bb[0] = x; if (x > bb[1]) bb[1] = x;
      if (z < bb[2]) bb[2] = z; if (z > bb[3]) bb[3] = z;
      if (y < bb[4]) bb[4] = y; if (y > bb[5]) bb[5] = y;
    }
    const half = C.sample / 2;
    best = boxes.map(({ i, i2, j, j2, k, k2, b }) => {
      let bx0 = ox + i * g, bx1 = ox + (i2 + 1) * g, bz0 = oz + j * g, bz1 = oz + (j2 + 1) * g, by0 = y0 + k * gy, by1 = y0 + (k2 + 1) * gy;
      // keep a face where the box meets a filled neighbour (inside), shrink only faces on the outside
      const open = (a, bb2, kk) => a < 0 || bb2 < 0 || kk < 0 || a >= nx || bb2 >= nz || kk >= ny || !vox[at(a, bb2, kk)];
      const faceOpen = (fn) => { for (let kk = k; kk <= k2; kk++) for (let bb2 = j; bb2 <= j2; bb2++) for (let a = i; a <= i2; a++) if (fn(a, bb2, kk)) return true; return false; };
      if (b[0] !== Infinity) {
        if (faceOpen((a, bb2, kk) => a === i && open(a - 1, bb2, kk))) bx0 = Math.max(bx0, b[0] - half);
        if (faceOpen((a, bb2, kk) => a === i2 && open(a + 1, bb2, kk))) bx1 = Math.min(bx1, b[1] + half);
        if (faceOpen((a, bb2, kk) => bb2 === j && open(a, bb2 - 1, kk))) bz0 = Math.max(bz0, b[2] - half);
        if (faceOpen((a, bb2, kk) => bb2 === j2 && open(a, bb2 + 1, kk))) bz1 = Math.min(bz1, b[3] + half);
        if (faceOpen((a, bb2, kk) => kk === k && open(a, bb2, kk - 1))) by0 = Math.max(by0, b[4]);
        if (faceOpen((a, bb2, kk) => kk === k2 && open(a, bb2, kk + 1))) by1 = Math.min(by1, b[5]);
      }
      return [(bx0 + bx1) / 2, (bz0 + bz1) / 2, Math.max(0.03, (bx1 - bx0) / 2), Math.max(0.03, (bz1 - bz0) / 2), by0, Math.max(by1, by0 + 0.05)];
    });
    best.voxel = g;
    break;
  }
  const r2 = (v) => Math.round(v * 100) / 100;
  const out = best.map((b) => b.map(r2));
  out.voxel = best.voxel;
  return out;
}

const only = new Set(process.argv.slice(2));
/** Boxes <-> the packed string (Int16 centimeters, little-endian, base64). */
const encode = (boxes) => {
  const a = new Int16Array(boxes.length * 6);
  boxes.forEach((b, i) => b.forEach((v, j) => (a[i * 6 + j] = Math.round(v * 100))));
  return Buffer.from(a.buffer).toString('base64');
};
const decode = (str) => {
  const buf = Buffer.from(str, 'base64');
  const a = new Int16Array(buf.buffer, buf.byteOffset, buf.length / 2);
  const out = [];
  for (let i = 0; i < a.length; i += 6) out.push(Array.from(a.subarray(i, i + 6), (v) => v / 100));
  return out;
};
const data = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
for (const k of Object.keys(data)) if (typeof data[k] === 'string') data[k] = decode(data[k]);
for (const k of Object.keys(data)) if (!BAKED.includes(k) && !(k in SOLID)) delete data[k];
for (const [kind, budget] of Object.entries(SOLID)) {
  if (only.size && !only.has(kind)) continue;
  if (!fs.existsSync(path.join(DIR, `${kind}.glb`))) {
    console.warn(`skip ${kind}: no model`);
    continue;
  }
  const tri = await triangles(kind);
  const boxes = solidBoxes(tri, budget);
  data[kind] = boxes;
  console.log(`${kind.padEnd(22)} ${String(tri.length / 9).padStart(7)} tris -> ${String(boxes.length).padStart(6)} boxes (voxel ${boxes.voxel} m)`);
}
for (const kind of BAKED) {
  if (only.size && !only.has(kind)) continue;
  const tri = await triangles(kind);
  let boxes = boxesFor(tri);
  if (ROUND.includes(kind)) {
    const d = openDoors(boxes);
    boxes = d.boxes;
    if (process.env.WAY_DEBUG) console.log(`  door at ${d.angle.toFixed(0)} deg, shell ${d.shell.toFixed(2)} m, ${d.opened} boxes cleared`);
  }
  data[kind] = boxes;
  let note = '';
  if (HOUSES.includes(kind)) {
    wayIn.kind = kind;
    const w = wayIn(boxes);
    note = w.reached ? `way in ok (floor ${w.feet.toFixed(2)}, ${w.reached}/${w.inside} cells)` : `NO WAY IN at floor ${w.feet.toFixed(2)} (${w.inside} open cells inside)`;
  }
  console.log(`${kind.padEnd(22)} ${String(tri.length / 9).padStart(7)} tris -> ${String(boxes.length).padStart(6)} boxes ${note}`);
}
fs.writeFileSync(OUT, JSON.stringify(Object.fromEntries(Object.entries(data).map(([k, v]) => [k, encode(v)]))));
console.log(`wrote ${path.relative(process.cwd(), OUT)} (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)`);
