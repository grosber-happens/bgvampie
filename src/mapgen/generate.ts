/**
 * Procedural map for one Harvest (match) in Ufuk-i Kehribar: terrain height, landscape weights and
 * object placement from a few sliders and a seed. Pure data, no Babylon: the planner draws it,
 * and the game (or a server) can rebuild the exact same map from the saved file.
 *
 * Landscapes follow design/dunya-tasarimi.md §4/§7: Kızıl Kanyon in the middle, and clockwise from
 * north Spor Ormanı → Asma Köyler → Turkuaz Lagün → Kehribar Kumu → Kemik Şehir. Borders are soft
 * and wobbly; there are no hard region lines.
 */
import { clamp, fbm, noise2, ridged, rng, smooth } from './noise';
import { VENDOR, placeVendors, vendorCount } from './vendors.ts';

export const BIOMES = [
  { id: 'kanyon', name: 'Kızıl Kanyon', ground: ['#5d6f8f', '#9fb4c9', '#e8eef2'], accent: '#c8333a' },
  { id: 'spor', name: 'Spor Ormanı', ground: ['#5f8a4a', '#8dbf6a', '#c3d98a'], accent: '#f06ea9' },
  { id: 'asma', name: 'Asma Köyler', ground: ['#4d6b3d', '#7d9a52', '#b7b56a'], accent: '#3fb8af' },
  { id: 'lagun', name: 'Turkuaz Lagün', ground: ['#c9b28a', '#e6d3a8', '#f2e8d5'], accent: '#3fb8af' },
  { id: 'kum', name: 'Kehribar Kumu', ground: ['#d9855a', '#eda36f', '#f6c58f'], accent: '#ff7a1a' },
  { id: 'kemik', name: 'Kemik Şehir', ground: ['#6e6a6c', '#8f8783', '#b9aea2'], accent: '#e0412b' },
] as const;
export type BiomeId = (typeof BIOMES)[number]['id'];
export const NB = BIOMES.length;

export type Params = {
  seed: number;
  /** Side of the playable square, in meters. */
  size: number;
  /** Hill height multiplier. */
  relief: number;
  /** Noise frequency: higher = busier terrain. */
  roughness: number;
  /** Water level in meters (the lagoon sits below 0). */
  water: number;
  /** Depth of the canyon cuts. */
  canyon: number;
  /** How much the landscape borders wobble. */
  warp: number;
  /** Size of the central canyon, as a fraction of the map. */
  core: number;
  /** Densities, 0 = none, 1 = normal. */
  trees: number;
  mushrooms: number;
  giants: number;
  mech: number;
  ruins: number;
  rocks: number;
  dots: number;
  /** Size multiplier for every placed object. */
  scale: number;
  /** 0 none, 1 mirror left/right, 2 mirror both axes (fair 4-way). */
  symmetry: 0 | 1 | 2;
  /** Which landscapes are in this Harvest. */
  biomes: boolean[];
  cathedral: boolean;
  colossus: boolean;
  /** Kurbağa Loncası vendor machines: 1 = the automatic count for this map size (vendors.ts), 0 = none. */
  vendors?: number;
};

export const DEFAULT_PARAMS: Params = {
  seed: 1907,
  size: 4000,
  relief: 1,
  roughness: 1,
  water: 0,
  canyon: 1,
  warp: 0.55,
  core: 0.16,
  trees: 1,
  mushrooms: 1,
  giants: 1,
  mech: 1,
  ruins: 1,
  rocks: 1,
  dots: 1,
  scale: 1,
  symmetry: 0,
  biomes: [true, true, true, true, true, true],
  cathedral: true,
  colossus: true,
  vendors: 1,
};

export type Category = 'trees' | 'mushrooms' | 'giants' | 'mech' | 'ruins' | 'rocks' | 'dots' | 'landmark';

/**
 * Every object kind. aff = how likely it is in each landscape (kanyon, spor, asma, lagün, kum, kemik).
 * cell = spacing of the placement grid, r = footprint radius at scale 1 (keeps things from overlapping).
 */
/**
 * Spor Ormanı Blender models (src/spor.ts), placed by hand in the planner, never scattered.
 * r: planner footprint. solid: collision box half size and height (trunk/stem only; null = none yet).
 */
export const SPOR_KINDS = {
  ev_kule: { name: 'Mantar ev: kule', cat: 'landmark', r: 8, solid: [2.4, 20] },
  ev_genis: { name: 'Mantar ev: geniş', cat: 'landmark', r: 9, solid: [3.0, 15] },
  ev_kulube: { name: 'Mantar ev: kulübe', cat: 'landmark', r: 8, solid: [2.2, 10.5] },
  kopru_tas: { name: 'Taş köprü', cat: 'ruins', r: 13, solid: null },
  kopru_tas_yikik: { name: 'Yıkık taş köprü', cat: 'ruins', r: 13, solid: null },
  kopru_ahsap: { name: 'Ahşap köprü', cat: 'ruins', r: 10, solid: null },
  mantar_kumesi: { name: 'Dev mantar kümesi', cat: 'mushrooms', r: 14, solid: [2.0, 22] },
  mantar_buyuk: { name: 'Büyük mantar', cat: 'mushrooms', r: 5.5, solid: [1.3, 12] },
  mantar_orta: { name: 'Orta mantar', cat: 'mushrooms', r: 2.8, solid: [0.7, 6] },
  mantar_kucuk: { name: 'Küçük mantar', cat: 'mushrooms', r: 1.2, solid: [0.3, 2.4] },
  enoki_buyuk: { name: 'Enoki (büyük)', cat: 'mushrooms', r: 0.5, solid: null },
  enoki_orta: { name: 'Enoki (orta)', cat: 'mushrooms', r: 0.4, solid: null },
  enoki_kucuk: { name: 'Enoki (küçük)', cat: 'mushrooms', r: 0.3, solid: null },
  enoki_seyrek: { name: 'Enoki (seyrek)', cat: 'mushrooms', r: 0.3, solid: null },
} as const satisfies Record<string, { name: string; cat: Category; r: number; solid: readonly [number, number] | null }>;
export type SporKind = keyof typeof SPOR_KINDS;

function sporKinds() {
  const out = {} as { [K in SporKind]: { name: string; cat: Category; aff: readonly number[]; cell: number; r: number; s: readonly [number, number] } };
  for (const k of Object.keys(SPOR_KINDS) as SporKind[]) {
    const d = SPOR_KINDS[k];
    out[k] = { name: d.name, cat: d.cat, aff: [0, 0, 0, 0, 0, 0], cell: 0, r: d.r, s: [1, 1] };
  }
  return out;
}

export const KINDS = {
  agac: { name: 'Yuvarlak ağaç', cat: 'trees', aff: [0.15, 0.5, 0.7, 0.5, 0.03, 0.3], cell: 9, r: 2.2, s: [0.8, 1.4] },
  moebius: { name: 'Düz tepeli ağaç', cat: 'trees', aff: [0, 0.35, 1, 0.3, 0.05, 0.1], cell: 11, r: 2.5, s: [0.8, 1.6] },
  cam: { name: 'Karlı çam', cat: 'trees', aff: [1, 0, 0.15, 0, 0, 0], cell: 7, r: 1.6, s: [0.7, 1.5] },
  cicek: { name: 'Dev çiçek', cat: 'mushrooms', aff: [0, 0.7, 0.3, 0.2, 0.05, 0], cell: 9, r: 1.2, s: [0.7, 1.4] },
  mantar: { name: 'Mantar', cat: 'mushrooms', aff: [0.05, 1, 0.4, 0.15, 0.05, 0.1], cell: 7, r: 1.6, s: [0.6, 1.6] },
  kume: { name: 'Mantar kümesi', cat: 'mushrooms', aff: [0.05, 0.9, 0.5, 0.2, 0, 0.2], cell: 8, r: 1.4, s: [0.7, 1.3] },
  devmantar: { name: 'Kule mantar', cat: 'giants', aff: [0, 1, 0.45, 0, 0, 0], cell: 30, r: 7, s: [0.8, 1.35] },
  yuruyenev: { name: 'Yürüyen ev', cat: 'giants', aff: [0, 0.25, 0.4, 0.3, 0.45, 0.15], cell: 60, r: 7, s: [0.9, 1.2] },
  bahcivan: { name: 'Bahçıvan robot', cat: 'mech', aff: [0.2, 0.7, 0.7, 0.5, 0.4, 0.4], cell: 14, r: 1.2, s: [0.8, 1.2] },
  disli: { name: 'Gömülü dişli', cat: 'mech', aff: [0.4, 0.1, 0.1, 0.25, 0.6, 0.7], cell: 18, r: 3, s: [0.7, 1.6] },
  boru: { name: 'Kızıl Öz borusu', cat: 'mech', aff: [1, 0, 0, 0.15, 0.2, 0.6], cell: 16, r: 4, s: [0.8, 1.3] },
  fener: { name: 'Fener direği', cat: 'mech', aff: [0.3, 0.15, 0.55, 0.3, 0.25, 1], cell: 13, r: 0.6, s: [0.9, 1.2] },
  anten: { name: 'Anten kulesi', cat: 'mech', aff: [0.3, 0.05, 0.3, 0.2, 0.4, 0.6], cell: 40, r: 2.5, s: [0.8, 1.3] },
  kazan: { name: 'Buhar kazanı', cat: 'mech', aff: [0.6, 0.05, 0.1, 0.2, 0.3, 0.6], cell: 24, r: 2.6, s: [0.8, 1.3] },
  monoteker: { name: 'Monoteker', cat: 'mech', aff: [0.1, 0.1, 0.2, 0.3, 0.8, 0.4], cell: 34, r: 1.6, s: [0.9, 1.2] },
  kafa: { name: 'Taş dev kafa', cat: 'ruins', aff: [0, 0, 0, 0.3, 0.7, 0.6], cell: 46, r: 6, s: [0.8, 1.5] },
  el: { name: 'Taş el', cat: 'ruins', aff: [0, 0, 0, 0.15, 1, 0.1], cell: 30, r: 4, s: [0.8, 1.5] },
  kubbe: { name: 'Kil kubbe ev', cat: 'ruins', aff: [0, 0, 0, 0.2, 1, 0], cell: 16, r: 3.4, s: [0.8, 1.4] },
  blok: { name: 'Brütalist blok', cat: 'ruins', aff: [0, 0, 0, 0.1, 0.05, 1], cell: 17, r: 5, s: [0.8, 1.6] },
  kopru: { name: 'Asılı otoyol', cat: 'ruins', aff: [0, 0, 0, 0.05, 0.15, 0.8], cell: 42, r: 9, s: [0.9, 1.2] },
  tabela: { name: 'Neon tabela', cat: 'ruins', aff: [0, 0, 0.1, 0, 0.1, 0.8], cell: 20, r: 1, s: [0.8, 1.2] },
  kapsul: { name: 'Kapsül ev', cat: 'ruins', aff: [0, 0.15, 1, 0.2, 0, 0], cell: 18, r: 2.4, s: [0.8, 1.3] },
  kapi: { name: 'Kızıl kapı', cat: 'ruins', aff: [1, 0, 0, 0, 0.1, 0], cell: 30, r: 3.5, s: [0.8, 1.4] },
  kemer: { name: 'Şelaleli kemer', cat: 'ruins', aff: [0, 0, 0, 1, 0, 0.05], cell: 36, r: 6, s: [0.8, 1.4] },
  kaya: { name: 'Kaya', cat: 'rocks', aff: [0.8, 0.3, 0.45, 0.5, 0.55, 0.3], cell: 9, r: 1.5, s: [0.5, 2.2] },
  yosun: { name: 'Yüzlü yosun', cat: 'rocks', aff: [0, 0.8, 0.4, 0.1, 0, 0], cell: 22, r: 3, s: [0.7, 1.5] },
  nokta: { name: 'Puantiye', cat: 'dots', aff: [0, 1, 0.1, 0, 0, 0], cell: 3.2, r: 0.6, s: [0.4, 1.6] },
  katedral: { name: 'Kızıl Katedral', cat: 'landmark', aff: [0, 0, 0, 0, 0, 0], cell: 0, r: 16, s: [1, 1] },
  dev: { name: 'Düşmüş Dev', cat: 'landmark', aff: [0, 0, 0, 0, 0, 0], cell: 0, r: 30, s: [1, 1] },
  /** Bouncy morel jump pad (bounce.ts): placed by hand in the planner, never scattered. */
  morel: { name: 'Zıplama mantarı', cat: 'mushrooms', aff: [0, 0, 0, 0, 0, 0], cell: 0, r: 0.6, s: [1, 1] },
  /** Spor Ormanı grass patch (cimen.ts): the game scatters dark grass clumps over a circle of radius r × size. */
  cimen: { name: 'Çimen alanı', cat: 'mushrooms', aff: [0, 0, 0, 0, 0, 0], cell: 0, r: 6, s: [1, 1] },
  /** Firefly swarm (cimen.ts): glowing lights that wander over a circle of radius r × size, near the player only. */
  atesbocegi: { name: 'Ateş böcekleri', cat: 'mushrooms', aff: [0, 0, 0, 0, 0, 0], cell: 0, r: 8, s: [1, 1] },
  ...sporKinds(),
  satici: { name: 'Satıcı makinesi', cat: 'landmark', aff: [0, 0, 0, 0, 0, 0], cell: 0, r: VENDOR.r, s: [1, 1] },
  sansli: { name: 'Şanslı makine', cat: 'landmark', aff: [0, 0, 0, 0, 0, 0], cell: 0, r: VENDOR.r, s: [1, 1] },
} as const satisfies Record<string, { name: string; cat: Category; aff: readonly number[]; cell: number; r: number; s: readonly [number, number] }>;
export type Kind = keyof typeof KINDS;
export const KIND_LIST = Object.keys(KINDS) as Kind[];

/** One placed thing. No y: it always sits on the terrain, so terrain edits carry objects along. */
export type Obj = { k: Kind; x: number; z: number; s: number; r: number; v: number; m?: 1 };

/** Hand edits on top of the generated map, applied in order. */
export type Op =
  | { t: 'add'; o: Obj }
  | { t: 'erase'; x: number; z: number; r: number }
  | { t: 'lift'; x: number; z: number; r: number; a: number }
  /** Move the object of kind k standing at (x, z) to (nx, nz), and resize it to ns when given. */
  | { t: 'move'; k: Kind; x: number; z: number; nx: number; nz: number; ns?: number };

/** Mirror a point into the generated half/quarter. */
function canon(sym: number, x: number, z: number): [number, number] {
  if (sym >= 1) x = -Math.abs(x);
  if (sym >= 2) z = -Math.abs(z);
  return [x, z];
}

/** Terrain height and landscape weights for one parameter set. */
export class Field {
  readonly p: Params;
  private sites: { b: number; x: number; z: number; k: number }[] = [];
  private lifts: Extract<Op, { t: 'lift' }>[];
  private flat: { x: number; z: number; r: number; h: number }[] = [];
  /** Scratch distances for weights(), one per site. */
  private ds = new Float64Array(NB + 1);

  constructor(p: Params, ops: Op[] = []) {
    this.p = p;
    this.lifts = ops.filter((o): o is Extract<Op, { t: 'lift' }> => o.t === 'lift');
    const r = rng(p.seed * 13 + 5);
    const R = p.size * 0.33;
    const a0 = (r() - 0.5) * 0.9;
    // Ring order clockwise from north (+z): spor, asma, lagün, kum, kemik.
    for (let i = 0; i < 5; i++) {
      const a = a0 + (i / 5) * Math.PI * 2 + (r() - 0.5) * 0.35;
      const rad = R * (0.85 + r() * 0.3);
      this.sites.push({ b: i + 1, x: Math.sin(a) * rad, z: Math.cos(a) * rad, k: 1 });
    }
    this.sites.push({ b: 0, x: 0, z: 0, k: 0.16 / Math.max(0.02, p.core) });
    this.sites = this.sites.filter((s) => p.biomes[s.b]);
    if (!this.sites.length) this.sites.push({ b: 1, x: 0, z: 0, k: 1 });
    // Flatten the ground under landmarks so they stand level.
    for (const o of landmarks(p)) this.flat.push({ x: o.x, z: o.z, r: KINDS[o.k].r * o.s * 1.1, h: NaN });
    for (const f of this.flat) f.h = this.rawHeight(f.x, f.z);
  }

  /** Landscape weights (sum 1) at a point. */
  weights(x: number, z: number, out = new Float32Array(NB)): Float32Array {
    const p = this.p;
    [x, z] = canon(p.symmetry, x, z);
    const s = p.size;
    const wx = x + p.warp * s * 0.14 * fbm(x / s * 3.1, z / s * 3.1, p.seed + 71, 3);
    const wz = z + p.warp * s * 0.14 * fbm(x / s * 3.1 + 9, z / s * 3.1 - 4, p.seed + 91, 3);
    out.fill(0);
    let dmin = Infinity;
    const sites = this.sites;
    const ds = this.ds;
    for (let i = 0; i < sites.length; i++) {
      const st = sites[i];
      const d = Math.hypot(wx - st.x, wz - st.z) * st.k;
      ds[i] = d;
      if (d < dmin) dmin = d;
    }
    const blend = s * 0.035;
    let sum = 0;
    for (let i = 0; i < sites.length; i++) {
      const w = Math.exp(-(ds[i] - dmin) / blend);
      out[sites[i].b] += w;
      sum += w;
    }
    for (let i = 0; i < NB; i++) out[i] /= sum;
    return out;
  }

  /** Index of the strongest landscape at a point. */
  biome(x: number, z: number): number {
    const w = this.weights(x, z);
    let best = 0;
    for (let i = 1; i < NB; i++) if (w[i] > w[best]) best = i;
    return best;
  }

  private w = new Float32Array(NB);

  private rawHeight(x0: number, z0: number): number {
    const p = this.p;
    const [x, z] = canon(p.symmetry, x0, z0);
    const w = this.weights(x0, z0, this.w);
    const f = p.roughness / 70;
    const sd = p.seed;
    const base = fbm(x * f, z * f, sd, 4) * 6 * p.relief;
    let h = 0;
    if (w[0] > 0.001) {
      const valley = Math.pow(1 - Math.abs(noise2(x * f * 0.8, z * f * 0.8, sd + 3)), 6);
      h += w[0] * (7 * p.relief + base * 0.6 + 4 * p.relief * ridged(x * f * 2, z * f * 2, sd + 4) - p.canyon * 13 * valley);
    }
    if (w[1] > 0.001) h += w[1] * (1.5 + base + 2.2 * p.relief * fbm(x * f * 2.6, z * f * 2.6, sd + 5, 3));
    if (w[2] > 0.001) h += w[2] * (4.5 * p.relief + base * 1.4 + 5 * p.relief * ridged(x * f * 1.3, z * f * 1.3, sd + 6));
    if (w[3] > 0.001) {
      const isl = smooth(0.25, 0.55, fbm(x * f * 2.2, z * f * 2.2, sd + 8, 3));
      h += w[3] * (-2.6 + base * 0.3 + isl * 3.6);
    }
    if (w[4] > 0.001) {
      const dune = Math.sin((x * 0.8 + z * 0.6) * f * 7 + 3.2 * fbm(x * f, z * f, sd + 11, 3));
      h += w[4] * (1 + base * 0.45 + 1.9 * p.relief * dune * dune);
    }
    if (w[5] > 0.001) {
      const t = 2 + base * 1.1;
      const step = 2.6;
      const q = Math.round(t / step) * step;
      h += w[5] * (q + (t - q) * 0.2);
    }
    for (const l of this.lifts) {
      const d2 = ((x0 - l.x) ** 2 + (z0 - l.z) ** 2) / (l.r * l.r);
      if (d2 < 4) h += l.a * Math.exp(-d2 * 2.2);
    }
    return h;
  }

  height(x: number, z: number): number {
    let h = this.rawHeight(x, z);
    for (const f of this.flat) {
      const d = Math.hypot(x - f.x, z - f.z);
      if (d < f.r * 1.6) h = h + (f.h - h) * (1 - smooth(f.r, f.r * 1.6, d));
    }
    return h;
  }

  /** Steepness (rise per meter) at a point. */
  slope(x: number, z: number): number {
    const e = 1.2;
    const dx = this.height(x + e, z) - this.height(x - e, z);
    const dz = this.height(x, z + e) - this.height(x, z - e);
    return Math.hypot(dx, dz) / (2 * e);
  }
}

/** Landmarks have fixed spots so the terrain can flatten under them before anything is placed. */
function landmarks(p: Params): Obj[] {
  const out: Obj[] = [];
  const r = rng(p.seed * 7 + 3);
  if (p.cathedral && p.biomes[0]) out.push({ k: 'katedral', x: 0, z: 0, s: 1, r: r() * Math.PI * 2, v: 0 });
  if (p.colossus) {
    // The Fallen Giant lies across a landscape border, off center (design §11.1).
    const a = r() * Math.PI * 2;
    const d = p.size * 0.22;
    const x = Math.sin(a) * d, z = Math.cos(a) * d;
    const [cx, cz] = canon(p.symmetry, x, z);
    out.push({ k: 'dev', x: cx, z: cz, s: 1, r: a + Math.PI / 2 + (r() - 0.5), v: 0 });
  }
  return out;
}

/** Where objects may not overlap: a coarse grid of circles. */
class Occupancy {
  private cells = new Map<number, { x: number; z: number; r: number }[]>();
  private key(i: number, j: number) {
    return (i + 4096) * 8192 + (j + 4096);
  }
  free(x: number, z: number, r: number) {
    const C = 8;
    const i0 = Math.floor((x - r - 16) / C), i1 = Math.floor((x + r + 16) / C);
    const j0 = Math.floor((z - r - 16) / C), j1 = Math.floor((z + r + 16) / C);
    for (let i = i0; i <= i1; i++)
      for (let j = j0; j <= j1; j++)
        for (const c of this.cells.get(this.key(i, j)) ?? []) if ((c.x - x) ** 2 + (c.z - z) ** 2 < (c.r + r) ** 2) return false;
    return true;
  }
  add(x: number, z: number, r: number) {
    const k = this.key(Math.floor(x / 8), Math.floor(z / 8));
    let list = this.cells.get(k);
    if (!list) this.cells.set(k, (list = []));
    list.push({ x, z, r });
  }
}

/** Big things first so small ones fill around them. */
const ORDER: Kind[] = ['devmantar', 'yuruyenev', 'kafa', 'kopru', 'kemer', 'blok', 'el', 'anten', 'kapi', 'kazan', 'kubbe', 'boru', 'disli', 'kapsul', 'monoteker', 'yosun', 'moebius', 'agac', 'cam', 'mantar', 'kume', 'cicek', 'bahcivan', 'fener', 'tabela', 'kaya', 'nokta'];

/** Kinds that may stand in shallow water. */
const WET: Partial<Record<Kind, number>> = { kemer: 3, kaya: 1.2, kafa: 2.5, disli: 1, agac: 0.3 };

/** Build the generated objects for these parameters (no hand edits). */
export function generate(field: Field, p: Params = field.p): Obj[] {
  // Objects grow on the natural terrain, without hand lifts: a terrain stroke moves objects up or down
  // but never re-rolls the map, which keeps sculpting fast on a 4 km map.
  field = new Field(p);
  const out: Obj[] = landmarks(p);
  const occ = new Occupancy();
  for (const o of out) occ.add(o.x, o.z, KINDS[o.k].r * o.s);
  const half = p.size / 2;
  // Vendor machines: dry, flat spots spread evenly, at least one per landscape (vendors.ts).
  const vMult = p.vendors ?? 1;
  if (vMult > 0) {
    const big = out.map((o) => ({ x: o.x, z: o.z, r: KINDS[o.k].r * o.s + 6 }));
    const spots = placeVendors({
      size: p.size,
      seed: p.seed,
      count: Math.max(1, Math.round(vendorCount(p.size) * vMult)),
      symmetry: p.symmetry,
      ok: (x, z) => field.height(x, z) > p.water + 0.4 && field.slope(x, z) < 0.35 && !big.some((b) => (b.x - x) ** 2 + (b.z - z) ** 2 < b.r * b.r),
      region: (x, z) => field.biome(x, z),
      regions: BIOMES.map((_, i) => i).filter((i) => p.biomes[i]),
    });
    const vr = rng(p.seed * 53 + 11);
    for (const v of spots) {
      // Face the map center, so the screen greets people walking in.
      out.push({ k: 'satici', x: v.x, z: v.z, s: 1, r: Math.atan2(-v.x, -v.z) + (vr() - 0.5) * 0.6, v: v.id });
      occ.add(v.x, v.z, VENDOR.r + 2);
    }
  }
  const w = new Float32Array(NB);
  // With symmetry, only generate the canonical half/quarter, then mirror.
  const xMax = p.symmetry >= 1 ? 0 : half;
  const zMax = p.symmetry >= 2 ? 0 : half;
  const gen: Obj[] = [];
  ORDER.forEach((k, ki) => {
    const def = KINDS[k];
    const dens = p[def.cat as Exclude<Category, 'landmark'>] as number;
    if (dens <= 0) return;
    const r = rng(p.seed * 977 + ki * 131 + 17);
    const cell = def.cell * (k === 'nokta' ? 1 : Math.sqrt(p.scale));
    for (let gx = -half; gx < xMax; gx += cell)
      for (let gz = -half; gz < zMax; gz += cell) {
        const x = gx + r() * cell, z = gz + r() * cell;
        const roll = r(), sr = r(), rr = r(), vr = r();
        field.weights(x, z, w);
        let aff = 0;
        for (let i = 0; i < NB; i++) aff += w[i] * def.aff[i];
        // Patchy clumps: forests and villages, not an even sprinkle.
        const clump = 0.55 + 0.9 * smooth(-0.35, 0.45, fbm(x / 38, z / 38, p.seed + ki * 7, 2));
        if (roll > clamp(dens * aff * clump * 0.75, 0, 0.97)) continue;
        const h = field.height(x, z);
        const wet = WET[k];
        if (h < p.water + 0.15 && (wet === undefined || h < p.water - wet)) continue;
        if (field.slope(x, z) > (k === 'kaya' ? 1.4 : k === 'nokta' ? 0.5 : 0.75)) continue;
        const s = (def.s[0] + sr * (def.s[1] - def.s[0])) * (k === 'nokta' ? 1 : p.scale);
        const rad = def.r * s;
        if (k !== 'nokta' && !occ.free(x, z, rad)) continue;
        if (Math.abs(x) > half - rad || Math.abs(z) > half - rad) continue;
        if (k !== 'nokta') occ.add(x, z, rad);
        gen.push({ k, x, z, s, r: rr * Math.PI * 2, v: Math.floor(vr * 1000) });
      }
  });
  for (const o of gen) {
    out.push(o);
    const r = KINDS[o.k].r * o.s;
    if (p.symmetry >= 1 && o.x < -r * 0.5) out.push({ ...o, x: -o.x, r: -o.r });
    if (p.symmetry >= 2 && o.z < -r * 0.5) {
      out.push({ ...o, z: -o.z, r: Math.PI - o.r });
      if (o.x < -r * 0.5) out.push({ ...o, x: -o.x, z: -o.z, r: Math.PI + o.r });
    }
  }
  return out;
}

/** Apply hand edits in order: placements add, erase circles remove everything under them. */
export function applyOps(objs: Obj[], ops: Op[]): Obj[] {
  let list = objs.slice();
  for (const op of ops) {
    if (op.t === 'add') list.push(op.o);
    else if (op.t === 'erase') list = list.filter((o) => (o.x - op.x) ** 2 + (o.z - op.z) ** 2 > op.r * op.r);
    else if (op.t === 'move') {
      const i = list.findIndex((o) => o.k === op.k && Math.abs(o.x - op.x) < MOVE_EPS && Math.abs(o.z - op.z) < MOVE_EPS);
      if (i >= 0) list[i] = { ...list[i], x: op.nx, z: op.nz, s: op.ns ?? list[i].s };
    }
  }
  return list;
}

/** How close a move op's (x, z) must be to the object it moves, in meters. */
const MOVE_EPS = 0.05;

/** Saved map file (planner export, and what the game will load later). */
export type MapFile = { v: 1; gen: Params; ops: Op[]; atmos?: Record<string, number | string | boolean> };
