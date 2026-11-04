#!/usr/bin/env node
/**
 * Numbers the planner's interior designer needs, measured from the packed models:
 * - floors: for every enterable building, the heights (m) of its covered floors (a floor with a ceiling
 *   or another floor above it, so roofs and cap tops are left out), lowest first,
 * - centers: the middle of each of those floors (x, z in game axes), where the designer camera looks,
 * - props: for every interior prop (src/assets/spor/ic), its footprint (w, d), height h and `top`:
 *   the height of its biggest flat upward face (the seat of a chair, the top of a table).
 *
 *   node tools/assets/bake-interior.mjs
 *
 * Writes src/assets/spor/ic/ic.json. Run it after tools/assets/pack-spor.mjs.
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.resolve(HERE, '..', '..', 'src', 'assets', 'spor');
const OUT = path.join(DIR, 'ic', 'ic.json');

/** Buildings you can furnish. */
export const ENTERABLE = ['ev_kule', 'ev_genis', 'ev_kulube', 'ev_iki_kat', 'ev_uc_kat', 'ev_cam_kule', 'ev_cam_ikiz', 'ev_cam_genis', 'ev_mozaik', 'ev_vitray', 'kamp_cadir'];

const C = {
  bin: 0.05, // height histogram bin (m)
  up: 0.95, // normal y above this = flat floor
  cell: 0.5, // cover grid cell (m)
  cover: [1.9, 9], // a floor counts when something is this far above it (m)
  floorArea: 5, // least covered area for a floor (m²)
  floorGap: 2.3, // floors closer than this merge (m)
  floorShare: 0.15, // and at least this share of the biggest floor's area
  seatMin: 0.15, // a prop's `top` is searched above this height (m)
};

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });

const mul = (m, x, y, z) => [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];

/** LOD0 triangles, centered like the game does (LOD0 back at the origin in x/z), in glTF axes. */
async function triangles(file) {
  const doc = await io.read(file);
  const lod0 = doc.getRoot().listNodes().find((n) => /_LOD0$/.test(n.getName()));
  if (!lod0) throw new Error(`${file}: no LOD0`);
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
          const w = mul(m, v[0], v[1], v[2]);
          out.push(w[0] - t[0], w[1], w[2] - t[2]);
        }
      }
    }
    n.listChildren().forEach(walk);
  };
  walk(lod0);
  return Float64Array.from(out);
}

/** Each triangle: centroid, area, normal y. */
function faces(tri) {
  const n = tri.length / 9;
  const f = [];
  for (let i = 0; i < n; i++) {
    const o = i * 9;
    const ax = tri[o + 3] - tri[o], ay = tri[o + 4] - tri[o + 1], az = tri[o + 5] - tri[o + 2];
    const bx = tri[o + 6] - tri[o], by = tri[o + 7] - tri[o + 1], bz = tri[o + 8] - tri[o + 2];
    const cx = ay * bz - az * by, cy = az * bx - ax * bz, cz = ax * by - ay * bx;
    const len = Math.hypot(cx, cy, cz);
    if (len < 1e-12) continue;
    f.push({
      x: (tri[o] + tri[o + 3] + tri[o + 6]) / 3,
      y: (tri[o + 1] + tri[o + 4] + tri[o + 7]) / 3,
      z: (tri[o + 2] + tri[o + 5] + tri[o + 8]) / 3,
      a: len / 2,
      ny: cy / len,
      lo: Math.min(tri[o + 1], tri[o + 4], tri[o + 7]),
    });
  }
  return f;
}

function floors(f) {
  // Lowest surface heights per grid cell, for the "is it covered" test.
  const grid = new Map();
  const key = (x, z) => `${Math.floor(x / C.cell)},${Math.floor(z / C.cell)}`;
  for (const t of f) {
    const k = key(t.x, t.z);
    let list = grid.get(k);
    if (!list) grid.set(k, (list = []));
    list.push(t.lo);
  }
  const hist = new Map();
  const covered = [];
  for (const t of f) {
    if (t.ny < C.up) continue;
    const above = grid.get(key(t.x, t.z)) ?? [];
    if (!above.some((y) => y > t.y + C.cover[0] && y < t.y + C.cover[1])) continue;
    covered.push(t);
    const b = Math.round(t.y / C.bin);
    hist.set(b, (hist.get(b) ?? 0) + t.a);
  }
  if (process.env.FLOOR_DEBUG) {
    const h4 = new Map();
    for (const [b, a] of hist) h4.set(Math.round(b * C.bin * 4) / 4, (h4.get(Math.round(b * C.bin * 4) / 4) ?? 0) + a);
    console.log([...h4].sort((p, q) => p[0] - q[0]).filter(([, a]) => a > 1).map(([y, a]) => `${y}:${a.toFixed(0)}`).join(' '));
  }
  // Floors: heights whose ±15 cm band holds the most covered flat area within a meter around them.
  const near = (y, r) => {
    let sum = 0;
    for (let b = Math.round((y - r) / C.bin); b <= Math.round((y + r) / C.bin); b++) sum += hist.get(b) ?? 0;
    return sum;
  };
  // Strongest bands first; a floor needs a share of the biggest floor's area and room above the others.
  const cands = [...hist.keys()].map((b) => ({ y: b * C.bin, a: near(b * C.bin, 0.15), own: hist.get(b) }));
  const most = Math.max(0, ...cands.map((c) => c.a));
  cands.sort((p, q) => q.a - p.a || q.own - p.own);
  const out = [];
  for (const c of cands) if (c.a >= Math.max(C.floorArea, most * C.floorShare) && out.every((y) => Math.abs(y - c.y) >= C.floorGap)) out.push(c.y);
  const ys = out.sort((p, q) => p - q);
  // Each floor's middle: the area-weighted center of its covered floor faces, in game axes (x is mirrored).
  const centers = ys.map((y) => {
    let a = 0, x = 0, z = 0;
    for (const t of covered) if (Math.abs(t.y - y) <= 0.15) [a, x, z] = [a + t.a, x + t.x * t.a, z + t.z * t.a];
    return [Math.round((-x / a) * 100) / 100, Math.round((z / a) * 100) / 100];
  });
  return { ys: ys.map((y) => Math.round(y * 100) / 100), centers };
}

function prop(f) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const t of f) {
    x0 = Math.min(x0, t.x); x1 = Math.max(x1, t.x);
    z0 = Math.min(z0, t.z); z1 = Math.max(z1, t.z);
    y0 = Math.min(y0, t.lo); y1 = Math.max(y1, t.y);
  }
  const hist = new Map();
  for (const t of f) {
    if (t.ny < C.up || t.y < y0 + C.seatMin) continue;
    const b = Math.round(t.y / 0.03);
    hist.set(b, (hist.get(b) ?? 0) + t.a);
  }
  let top = null, best = 0;
  for (const [b, a] of hist) if (a > best) [best, top] = [a, b * 0.03];
  const r = (v) => Math.round(v * 100) / 100;
  return { w: r(x1 - x0), d: r(z1 - z0), h: r(y1 - y0), top: top === null ? null : r(top - y0), area: r(best) };
}

const result = { floors: {}, centers: {}, props: {} };
for (const k of ENTERABLE) {
  const file = path.join(DIR, `${k}.glb`);
  if (!fs.existsSync(file)) continue;
  const fl = floors(faces(await triangles(file)));
  result.floors[k] = fl.ys;
  result.centers[k] = fl.centers;
  console.log(`${k.padEnd(14)} floors ${result.floors[k].join(', ')}`);
}
for (const file of fs.readdirSync(path.join(DIR, 'ic')).filter((f) => f.endsWith('.glb')).sort()) {
  const name = file.replace(/\.glb$/, '');
  result.props[name] = prop(faces(await triangles(path.join(DIR, 'ic', file))));
}
console.log(`${Object.keys(result.props).length} props`);
fs.writeFileSync(OUT, JSON.stringify(result, null, 0).replace(/\],"/g, '],\n"').replace(/\},"/g, '},\n"'));
