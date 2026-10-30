/**
 * Where the Kurbağa Loncası vendor machines stand. Pure: the planner, the game and the
 * balance simulator all place them with the same rule.
 *
 * How many: enough that from anywhere on the map the nearest machine is at most about
 * `cover` meters away (a hex grid with spacing cover·√3 reaches every point within `cover`).
 * With the run speed of 8.5 m/s and sprint x1.55 that is about a 15 second run at worst
 * and 10 seconds on average. Every landscape gets at least one machine.
 * The numbers were picked with the simulator (sim/shop-test.ts, docs/SHOP.md).
 *
 * Where: best-candidate sampling (each new machine takes the candidate farthest from the
 * machines already placed), so they spread evenly without a visible grid. Spots must be dry,
 * flat and away from the map edge and from big landmarks.
 */
import { rng } from './noise.ts';

export const VENDOR = {
  /** Target distance to the nearest machine anywhere on the map (meters). */
  cover: 200,
  /** Never fewer than this many machines. */
  min: 4,
  max: 60,
  /** Keep this share of the map side free along the edge. */
  edge: 0.06,
  /** Footprint radius of a machine (meters). */
  r: 2.6,
  /** Candidates tried per machine (more = more even spread). */
  candidates: 24,
};

/** Number of machines for a square map of this side (meters). */
export function vendorCount(size: number, cover = VENDOR.cover): number {
  const hexArea = 2.598 * cover * cover;
  return Math.max(VENDOR.min, Math.min(VENDOR.max, Math.round((size * size) / hexArea)));
}

export type VendorSpot = { x: number; z: number; id: number };

export type VendorOpts = {
  size: number;
  seed: number;
  /** Override the automatic count. */
  count?: number;
  cover?: number;
  /** Can a machine stand here (dry, flat, free)? */
  ok?: (x: number, z: number) => boolean;
  /** Landscape index at a point; each landscape in `regions` gets at least one machine. */
  region?: (x: number, z: number) => number;
  regions?: number[];
  /** 0 none, 1 mirror left/right, 2 mirror both axes (keeps the map fair). */
  symmetry?: 0 | 1 | 2;
};

export function placeVendors(o: VendorOpts): VendorSpot[] {
  const half = o.size / 2;
  const lim = half - o.size * VENDOR.edge;
  const sym = o.symmetry ?? 0;
  // At least one machine per landscape (design: a Kurbağa Loncası shop in every piece of the world).
  const total = Math.max(o.count ?? vendorCount(o.size, o.cover), sym ? 0 : o.regions?.length ?? 0);
  // With symmetry, place in the canonical half/quarter and mirror.
  const parts = sym === 2 ? 4 : sym === 1 ? 2 : 1;
  const n = Math.max(1, Math.round(total / parts));
  const xMax = sym >= 1 ? -VENDOR.r * 2 : lim;
  const zMax = sym >= 2 ? -VENDOR.r * 2 : lim;
  const r = rng(o.seed * 31 + 977);
  const ok = o.ok ?? (() => true);
  const placed: { x: number; z: number }[] = [];
  const sample = (want?: number) => {
    for (let i = 0; i < 400; i++) {
      const x = -lim + r() * (xMax + lim);
      const z = -lim + r() * (zMax + lim);
      if (!ok(x, z)) continue;
      if (want !== undefined && o.region && o.region(x, z) !== want) continue;
      return { x, z };
    }
    return null;
  };
  const farthest = (want?: number) => {
    let best: { x: number; z: number } | null = null;
    let bd = -1;
    for (let c = 0; c < VENDOR.candidates; c++) {
      const s = sample(want);
      if (!s) continue;
      let d = Infinity;
      for (const p of placed) d = Math.min(d, Math.hypot(p.x - s.x, p.z - s.z));
      // Mirrored copies count as neighbours too.
      if (sym >= 1) d = Math.min(d, Math.abs(s.x) * 2);
      if (sym >= 2) d = Math.min(d, Math.abs(s.z) * 2);
      if (d > bd) (bd = d), (best = s);
    }
    return best;
  };
  // One machine per landscape first (biggest gap first), then fill the rest.
  if (o.region && o.regions) for (const g of o.regions) if (placed.length < n) {
    const s = farthest(g);
    if (s) placed.push(s);
  }
  while (placed.length < n) {
    const s = farthest();
    if (!s) break;
    placed.push(s);
  }
  const out: VendorSpot[] = [];
  for (const p of placed) {
    out.push({ x: p.x, z: p.z, id: out.length });
    if (sym >= 1) out.push({ x: -p.x, z: p.z, id: out.length });
    if (sym >= 2) {
      out.push({ x: p.x, z: -p.z, id: out.length });
      out.push({ x: -p.x, z: -p.z, id: out.length });
    }
  }
  return out;
}

/** Distance from a point to the nearest machine. */
export function nearestVendor(spots: VendorSpot[], x: number, z: number): { v: VendorSpot | null; d: number } {
  let v: VendorSpot | null = null;
  let d = Infinity;
  for (const s of spots) {
    const k = Math.hypot(s.x - x, s.z - z);
    if (k < d) (d = k), (v = s);
  }
  return { v, d };
}
