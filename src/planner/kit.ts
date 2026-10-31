/**
 * The primitive kit: every map object is a handful of boxes, cylinders, cones and spheres.
 * Each kind below is a small recipe; the builder turns all parts into thin instances
 * (one draw call per shape and material), so thousands of objects stay cheap.
 */
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { rng } from '../mapgen/noise';
import type { Kind, Obj } from '../mapgen/generate';

/** Centered: box, sphere, torus, rock. Standing on y = 0: cyl, cone, taper, hemi. */
export type Shape = 'box' | 'cyl' | 'cone' | 'taper' | 'sphere' | 'hemi' | 'torus' | 'rock';
export type Mat = 'clay' | 'glow';
export type V3 = [number, number, number];

export interface Sink {
  part(shape: Shape, mat: Mat, r: number, g: number, b: number, m: Matrix): void;
}

const hexCache = new Map<string, V3>();
function rgb(hex: string): V3 {
  let c = hexCache.get(hex);
  if (!c) {
    const n = parseInt(hex.slice(1), 16);
    c = [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
    hexCache.set(hex, c);
  }
  return c;
}

const tmpS = new Vector3(), tmpP = new Vector3(), tmpQ = new Quaternion();

/** Draws parts in an object's local space (meters, y up). */
export class Draw {
  readonly rand: () => number;
  constructor(private sink: Sink, readonly base: Matrix, seed: number, private jitter = 0.1) {
    this.rand = rng(seed + 1);
  }
  /** A pick from a list, stable for this object. */
  pick<T>(list: readonly T[]): T {
    return list[Math.floor(this.rand() * list.length)];
  }
  between(a: number, b: number) {
    return a + this.rand() * (b - a);
  }
  part(shape: Shape, color: string, p: V3, s: V3, rot: V3 = [0, 0, 0], glow = false) {
    tmpS.set(s[0], s[1], s[2]);
    tmpP.set(p[0], p[1], p[2]);
    Quaternion.FromEulerAnglesToRef(rot[0], rot[1], rot[2], tmpQ);
    const local = Matrix.Compose(tmpS, tmpQ, tmpP);
    const c = rgb(color);
    const k = glow ? 1 : 1 + (this.rand() - 0.5) * this.jitter * 2;
    this.sink.part(shape, glow ? 'glow' : 'clay', c[0] * k, c[1] * k, c[2] * k, local.multiply(this.base));
  }
  glow(shape: Shape, color: string, p: V3, s: V3, rot: V3 = [0, 0, 0]) {
    this.part(shape, color, p, s, rot, true);
  }
  /** A child space: offset, turn and scale (for clusters and composite landmarks). */
  sub(p: V3, s = 1, rotY = 0, rot: V3 = [0, rotY, 0]): Draw {
    tmpS.set(s, s, s);
    tmpP.set(p[0], p[1], p[2]);
    Quaternion.FromEulerAnglesToRef(rot[0], rot[1], rot[2], tmpQ);
    const d = new Draw(this.sink, Matrix.Compose(tmpS, tmpQ, tmpP).multiply(this.base), Math.floor(this.rand() * 1e9), this.jitter);
    return d;
  }
  /** A cylinder from point a to point b (legs, cables, pipes). */
  rod(color: string, a: V3, b: V3, d: number, glow = false) {
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
    const len = Math.hypot(dx, dy, dz);
    // Rotate +y onto the direction.
    const dir = new Vector3(dx / len, dy / len, dz / len);
    const up = Vector3.Up();
    const axis = Vector3.Cross(up, dir);
    const ang = Math.acos(Math.max(-1, Math.min(1, Vector3.Dot(up, dir))));
    const q = axis.lengthSquared() < 1e-8 ? (dy < 0 ? Quaternion.RotationAxis(Vector3.Right(), Math.PI) : Quaternion.Identity()) : Quaternion.RotationAxis(axis.normalize(), ang);
    const local = Matrix.Compose(new Vector3(d, len, d), q, new Vector3(a[0], a[1], a[2]));
    const c = rgb(color);
    this.sink.part('cyl', glow ? 'glow' : 'clay', c[0], c[1], c[2], local.multiply(this.base));
  }
}

// ---- Palette (design/dunya-tasarimi.md §6) --------------------------------------------------
const P = {
  sun: '#ff7a1a', amber: '#ffb347', koi: '#e0412b', bone: '#f2e8d5', teal: '#3fb8af', pink: '#f06ea9',
  ink: '#2b1e3f', moss: '#8dbf6a', rose: '#e2475c', paper: '#f3ead7',
  bark: '#6b4a3a', darkBark: '#4a3330', leaf: ['#6f9e4f', '#8dbf6a', '#4f7d3e', '#a3c46a'],
  metal: '#8a8f98', darkMetal: '#4d5058', brass: '#b88a3e', rust: '#8a4b2f', terracotta: '#c4643a',
  concrete: '#8f8783', stone: '#b4a99e', sand: '#d6b48a', red: '#b8303a', snow: '#e8eef2',
};

type Recipe = (d: Draw, o: Obj, biome: number) => void;

/** Spots on a mushroom cap (Kusama polka dots). */
function capDots(d: Draw, y: number, rad: number, h: number, color: string, n: number) {
  for (let i = 0; i < n; i++) {
    const th = d.between(0.25, 1.25);
    const ph = d.between(0, Math.PI * 2);
    const sx = Math.sin(th) * Math.cos(ph), sz = Math.sin(th) * Math.sin(ph), sy = Math.cos(th);
    const ds = rad * d.between(0.12, 0.22);
    d.part('sphere', color, [sx * rad * 0.99, y + sy * h * 0.99, sz * rad * 0.99], [ds, ds * 0.45, ds], [Math.atan2(sz, sy) * 0.8, 0, -Math.atan2(sx, sy) * 0.8]);
  }
}

function mushroom(d: Draw, height: number, capD: number, capColor: string, dotColor: string) {
  const lean = d.between(-0.12, 0.12);
  d.part('taper', P.bone, [0, 0, 0], [capD * 0.22, height, capD * 0.22], [0, 0, lean]);
  const topX = -Math.sin(lean) * height;
  const cy = Math.cos(lean) * height * 0.96;
  const h = capD * d.between(0.32, 0.5);
  d.part('cyl', '#d9c7a8', [topX, cy - 0.05, 0], [capD * 0.92, 0.12, capD * 0.92]);
  const cap = d.sub([topX, cy, 0], 1, 0, [0, 0, lean * 0.7]);
  cap.part('hemi', capColor, [0, 0, 0], [capD, h, capD]);
  capDots(cap, 0, capD / 2, h, dotColor, Math.round(capD * 2.2 + 3));
}

function tree(d: Draw, leaf: string) {
  const h = d.between(2.4, 3.6);
  d.part('taper', P.bark, [0, 0, 0], [0.55, h, 0.55]);
  for (let i = 0; i < 3 + Math.floor(d.rand() * 2); i++) {
    const r = d.between(1.3, 2.1);
    const a = d.rand() * Math.PI * 2, off = i === 0 ? 0 : d.between(0.6, 1.3);
    d.part('sphere', i === 0 ? leaf : d.pick(P.leaf), [Math.cos(a) * off, h + r * 0.55 + d.between(-0.3, 0.8), Math.sin(a) * off], [r * 2, r * 1.8, r * 2]);
  }
}

function legs(d: Draw, n: number, rad: number, hip: number, knee: number, color: string, thick: number) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.PI / n;
    const ca = Math.cos(a), sa = Math.sin(a);
    const k: V3 = [ca * rad * 0.75, knee, sa * rad * 0.75];
    d.rod(color, [ca * rad * 0.25, hip, sa * rad * 0.25], k, thick);
    d.rod(color, k, [ca * rad, 0, sa * rad], thick * 0.8);
    d.part('sphere', P.darkMetal, k, [thick * 1.6, thick * 1.6, thick * 1.6]);
  }
}

/** Little Gardener robot: a flowerpot head on spider legs (design §5). */
function gardener(d: Draw) {
  legs(d, 4, 1.1, 0.9, 1.3, P.metal, 0.09);
  d.part('sphere', P.darkMetal, [0, 0.95, 0], [0.55, 0.45, 0.55]);
  d.part('taper', P.terracotta, [0, 1.95, 0], [0.9, -0.85, 0.9]);
  d.part('cyl', '#5a3a2a', [0, 1.9, 0], [0.82, 0.06, 0.82]);
  d.part('sphere', d.pick(P.leaf), [0, 2.15, 0], [0.7, 0.6, 0.7]);
  if (d.rand() < 0.6) d.part('sphere', d.pick([P.pink, P.amber, P.rose]), [0.15, 2.45, 0.1], [0.28, 0.28, 0.28]);
  d.glow('sphere', P.teal, [0, 1.35, 0.4], [0.18, 0.18, 0.12]);
  d.rod(P.metal, [0.3, 1.2, 0], [0.75, 1.6, 0.2], 0.05);
  d.part('cone', P.brass, [0.75, 1.6, 0.2], [0.18, 0.25, 0.18], [0, 0, -0.6]);
}

function gear(d: Draw, rad: number, color: string, teeth = 12) {
  d.part('cyl', color, [0, -0.35, 0], [rad * 2, 0.7, rad * 2]);
  d.part('cyl', P.darkMetal, [0, -0.45, 0], [rad * 0.5, 0.9, rad * 0.5]);
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * Math.PI * 2;
    d.part('box', color, [Math.cos(a) * rad * 1.05, 0, Math.sin(a) * rad * 1.05], [rad * 0.28, 0.7, rad * 0.32], [0, -a, 0]);
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    d.part('cyl', P.darkMetal, [Math.cos(a) * rad * 0.55, -0.4, Math.sin(a) * rad * 0.55], [rad * 0.35, 0.8, rad * 0.35]);
  }
}

function house(d: Draw, w: number, h: number, wall: string, roof: string) {
  d.part('box', wall, [0, h / 2, 0], [w, h, w * 0.85]);
  d.part('cone', roof, [0, h, 0], [w * 1.25, w * 0.55, w * 1.1], [0, Math.PI / 4, 0]);
  for (let i = 0; i < 3; i++) d.glow('box', P.amber, [(i - 1) * w * 0.3, h * 0.55, w * 0.43], [w * 0.14, h * 0.22, 0.05]);
  d.part('box', P.koi, [w * 0.5, h * 0.3, 0], [0.05, h * 0.55, w * 0.22]);
}

/**
 * Kurbağa Loncası vendor machine: a clay kiosk carried like a frog's shell-house
 * (design/dunya-tasarimi.md §5). Screen on local +z, which faces the map center.
 * The game builds the same shape in src/vendor.ts.
 */
export function vendorMachine(d: Draw) {
  d.part('box', P.stone, [0, 0.15, 0], [2.2, 0.3, 2]);
  for (const x of [-0.75, 0.75]) for (const z of [-0.5, 0.5]) d.part('hemi', P.sun, [x, 0.3, z], [0.55, 0.3, 0.7]);
  d.part('box', P.sun, [0, 1.25, 0], [1.5, 1.9, 1.2]);
  d.part('box', P.ink, [0, 1.5, 0.6], [1.15, 0.85, 0.04]);
  d.glow('box', P.teal, [0, 1.5, 0.62], [1, 0.7, 0.04]);
  d.glow('box', P.amber, [0.5, 0.85, 0.62], [0.18, 0.26, 0.04]);
  d.part('box', P.darkMetal, [0, 0.55, 0.64], [0.9, 0.16, 0.16]);
  const shell = d.sub([0, 2.2, -0.05]);
  shell.part('hemi', P.amber, [0, 0, 0], [1.9, 1.1, 1.6]);
  capDots(shell, 0, 0.95, 1.1, P.koi, 7);
  for (const x of [-0.42, 0.42]) {
    d.part('sphere', P.bone, [x, 2.95, 0.42], [0.5, 0.5, 0.5]);
    d.part('sphere', P.ink, [x, 2.97, 0.62], [0.22, 0.22, 0.12]);
  }
  d.rod(P.brass, [0.6, 2.6, -0.4], [0.75, 3.9, -0.5], 0.06);
  d.glow('sphere', P.amber, [0.75, 4, -0.5], [0.32, 0.32, 0.32]);
  d.rod(P.brass, [-0.78, 0.6, 0], [-0.78, 2.1, 0], 0.08);
  d.rod(P.brass, [0.78, 0.6, 0.2], [0.78, 2.1, 0.2], 0.08);
}

const RECIPES: Record<Kind, Recipe> = {
  satici(d) {
    vendorMachine(d);
  },
  agac(d, o, b) {
    const leaf = o.v % 7 === 0 ? '#e98a3a' : b === 2 ? d.pick(['#4f9e8a', '#6fb08a', '#8dbf6a']) : d.pick(P.leaf);
    tree(d, leaf);
  },
  moebius(d, o) {
    // Moebius trees: one tall bare trunk, flat plates of canopy.
    const h = d.between(5, 8.5);
    const lean = d.between(-0.08, 0.08);
    d.part('taper', P.darkBark, [0, 0, 0], [0.45, h, 0.45], [lean, 0, -lean]);
    const top: V3 = [Math.sin(lean) * h, h, Math.sin(lean) * h];
    const col = o.v % 5 === 0 ? P.teal : o.v % 5 === 1 ? '#d9a75a' : d.pick(['#9cc46a', '#86b35d', '#b2cf74']);
    const r = d.between(2.4, 3.6);
    d.part('cyl', '#3d5b3a', [top[0], top[1] - 0.25, top[2]], [r * 2.04, 0.3, r * 2.04]);
    d.part('cyl', col, [top[0], top[1], top[2]], [r * 2, 0.7, r * 2]);
    if (d.rand() < 0.6) {
      const a = d.rand() * Math.PI * 2;
      const y = h * d.between(0.5, 0.7);
      const px = Math.cos(a) * 1.4, pz = Math.sin(a) * 1.4;
      d.rod(P.darkBark, [0, y - 0.6, 0], [px, y, pz], 0.2);
      d.part('cyl', col, [px, y, pz], [r * 1.1, 0.5, r * 1.1]);
    }
  },
  cam(d) {
    const h = d.between(1.5, 2.2);
    d.part('taper', P.darkBark, [0, 0, 0], [0.4, h, 0.4]);
    let y = h * 0.6, w = d.between(2.6, 3.2);
    for (let i = 0; i < 3; i++) {
      d.part('cone', '#3d5b5e', [0, y, 0], [w, w * 0.9, w], [0, d.rand() * 3, 0]);
      d.part('cone', P.snow, [0, y + w * 0.45, 0], [w * 0.5, w * 0.46, w * 0.5]);
      y += w * 0.55;
      w *= 0.72;
    }
  },
  cicek(d) {
    const h = d.between(2.5, 4.5);
    const mid: V3 = [d.between(-0.4, 0.4), h * 0.5, d.between(-0.4, 0.4)];
    const top: V3 = [d.between(-0.6, 0.6), h, d.between(-0.6, 0.6)];
    d.rod('#5f8a4a', [0, 0, 0], mid, 0.16);
    d.rod('#5f8a4a', mid, top, 0.14);
    d.part('sphere', '#6f9e4f', [mid[0] + 0.35, mid[1], mid[2]], [0.8, 0.12, 0.4], [0, 0, 0.4]);
    const petal = d.pick([P.pink, P.rose, '#f6a0c8', P.amber]);
    const n = 6;
    const head = d.sub(top, 1, 0, [d.between(-0.5, 0.5), 0, d.between(-0.5, 0.5)]);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      head.part('sphere', petal, [Math.cos(a) * 0.55, 0, Math.sin(a) * 0.55], [0.85, 0.16, 0.5], [0, -a, 0]);
    }
    head.part('sphere', '#ffd25e', [0, 0.06, 0], [0.5, 0.3, 0.5]);
  },
  mantar(d, o, b) {
    const capColor = b === 2 ? d.pick([P.teal, P.amber, P.koi]) : d.pick([P.koi, P.koi, P.pink, '#d94f8a', P.amber, P.teal]);
    const dot = capColor === P.bone ? P.koi : d.pick([P.bone, P.bone, '#fff4d6', P.ink]);
    mushroom(d, d.between(1.2, 3.2), d.between(1.8, 3.6), capColor, dot);
  },
  kume(d) {
    const n = 3 + Math.floor(d.rand() * 3);
    const col = d.pick([P.amber, P.pink, P.bone, P.koi]);
    for (let i = 0; i < n; i++) {
      const a = d.rand() * Math.PI * 2, r = i === 0 ? 0 : d.between(0.5, 1.3);
      const s = i === 0 ? 1 : d.between(0.4, 0.75);
      mushroom(d.sub([Math.cos(a) * r, 0, Math.sin(a) * r], s), d.between(0.6, 1.4), d.between(1.1, 1.7), col, i % 2 ? P.ink : P.bone);
    }
  },
  devmantar(d, o) {
    // Tower mushroom: hollowed into a house, windows up the stem, a balcony ring (design §4 Spor Ormanı).
    const h = d.between(16, 26);
    const capD = d.between(13, 19);
    const capColor = o.v % 3 === 0 ? P.pink : o.v % 3 === 1 ? P.koi : '#d94f8a';
    d.part('taper', P.bone, [0, -0.5, 0], [4.6, h + 0.5, 4.6]);
    // Root flare.
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + d.rand();
      d.part('sphere', '#e6d7bb', [Math.cos(a) * 2.2, 0.3, Math.sin(a) * 2.2], [2.4, 1.6, 1.4], [0, -a, 0]);
    }
    d.part('cyl', '#d9c7a8', [0, h - 0.3, 0], [capD * 0.9, 0.4, capD * 0.9]);
    const capH = capD * 0.42;
    d.part('hemi', capColor, [0, h, 0], [capD, capH, capD]);
    capDots(d, h, capD / 2, capH, P.bone, 16);
    // Windows spiralling up.
    for (let i = 0; i < 9; i++) {
      const a = i * 1.9;
      const y = 2.5 + (i / 9) * (h - 5);
      const r = 2.3 - (y / h) * 0.6;
      d.glow('box', P.amber, [Math.cos(a) * r, y, Math.sin(a) * r], [0.7, 1, 0.7], [0, -a, 0]);
    }
    d.part('box', P.ink, [0, 1.1, 2.25], [1.3, 2.2, 0.4]);
    // Balcony ring with railing posts.
    const by = h * 0.55;
    d.part('cyl', '#a8835a', [0, by, 0], [8, 0.35, 8]);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      d.part('cyl', '#6b4a3a', [Math.cos(a) * 3.8, by, Math.sin(a) * 3.8], [0.12, 1, 0.12]);
    }
    d.part('torus', '#6b4a3a', [0, by + 1, 0], [7.6, 0.4, 7.6]);
    // Lanterns hanging under the cap.
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      const r = capD * 0.38;
      d.rod(P.ink, [Math.cos(a) * r, h - 0.2, Math.sin(a) * r], [Math.cos(a) * r, h - 1.6, Math.sin(a) * r], 0.04);
      d.glow('sphere', P.amber, [Math.cos(a) * r, h - 1.8, Math.sin(a) * r], [0.5, 0.6, 0.5]);
    }
  },
  yuruyenev(d) {
    // A Gardener's walking house with a tree growing on its back.
    legs(d, 6, 6, 5.2, 6.8, P.darkMetal, 0.45);
    d.part('sphere', P.metal, [0, 5.5, 0], [5.5, 2.4, 5.5]);
    d.part('cyl', P.brass, [0, 5.2, 0], [5.8, 0.5, 5.8]);
    house(d.sub([0, 6.2, 0], 1, 0.3), 4.2, 3.2, '#c98b5a', P.koi);
    d.part('box', '#c98b5a', [-1.6, 7, -1], [1.6, 1.6, 1.6]);
    d.part('cyl', P.rust, [1.4, 9, -0.6], [0.5, 2.6, 0.5]);
    d.part('cone', P.darkMetal, [1.4, 11.6, -0.6], [0.8, 0.6, 0.8]);
    tree(d.sub([-1.7, 7.8, -1.1], 0.75), d.pick(P.leaf));
    d.glow('sphere', P.teal, [0, 4.7, 2.6], [0.5, 0.5, 0.3]);
    d.glow('sphere', P.teal, [0.8, 4.7, 2.5], [0.3, 0.3, 0.2]);
  },
  bahcivan(d) {
    gardener(d);
  },
  disli(d, o) {
    const rad = d.between(2.4, 3.6);
    const g = d.sub([0, rad * 0.55, 0], 1, 0, [Math.PI / 2 + d.between(-0.35, 0.35), 0, d.between(-0.2, 0.2)]);
    gear(g, rad, o.v % 2 ? P.rust : P.brass);
    if (d.rand() < 0.5) gear(d.sub([rad * 1.2, 0.3, rad * 0.6], 0.45, 0, [0.15, 0, 0.1]), rad, P.rust, 10);
  },
  boru(d) {
    // Kızıl Öz pipeline: blood-energy pipes with glowing bands.
    const L = d.between(7, 11);
    const y = d.between(1, 2.2);
    d.part('cyl', P.rust, [-L / 2, y, 0], [1.1, L, 1.1], [0, 0, -Math.PI / 2]);
    for (let i = 0; i <= 3; i++) {
      const x = -L / 2 + (i / 3) * L;
      d.part('cyl', P.darkMetal, [x - 0.15, y, 0], [1.45, 0.3, 1.45], [0, 0, -Math.PI / 2]);
      d.part('box', P.darkMetal, [x, y / 2, 0], [0.3, y, 1.4]);
    }
    for (let i = 0; i < 3; i++) d.glow('cyl', P.koi, [-L / 2 + ((i + 0.5) / 3) * L - 0.25, y, 0], [1.15, 0.5, 1.15], [0, 0, -Math.PI / 2]);
    d.part('cyl', P.rust, [L / 2, -0.5, 0], [1.1, y + 0.5, 1.1]);
    d.part('sphere', P.rust, [L / 2, y, 0], [1.1, 1.1, 1.1]);
    d.part('cyl', P.brass, [-L / 2 - 0.1, y - 0.6, 0], [0.4, 1.2, 0.4]);
    d.glow('sphere', P.koi, [-L / 2 - 0.1, y + 0.7, 0], [0.35, 0.35, 0.35]);
  },
  fener(d) {
    const h = d.between(3.6, 4.6);
    d.part('box', P.ink, [0, 0.25, 0], [0.6, 0.5, 0.6]);
    d.part('cyl', P.ink, [0, 0, 0], [0.16, h, 0.16]);
    d.part('box', P.ink, [0.45, h - 0.1, 0], [1, 0.1, 0.1]);
    d.part('cone', P.ink, [0.9, h - 0.3, 0], [0.55, 0.3, 0.55]);
    d.glow('sphere', P.amber, [0.9, h - 0.45, 0], [0.34, 0.38, 0.34]);
  },
  anten(d) {
    const h = d.between(11, 16);
    const w = 1.6;
    const corners: V3[] = [[w, 0, w], [-w, 0, w], [-w, 0, -w], [w, 0, -w]];
    for (const c of corners) d.rod(P.darkMetal, c, [c[0] * 0.2, h, c[2] * 0.2], 0.14);
    for (let i = 1; i < 5; i++) {
      const t = i / 5, s = (1 - t * 0.8) * w * 2;
      d.part('box', P.metal, [0, h * t, 0], [s, 0.1, s]);
    }
    d.part('hemi', P.bone, [0.6, h * 0.8, 0], [2.4, 0.7, 2.4], [0, 0, -1.1]);
    d.part('cyl', P.metal, [0, h, 0], [0.08, 2.5, 0.08]);
    d.glow('sphere', P.koi, [0, h + 2.6, 0], [0.35, 0.35, 0.35]);
    d.glow('sphere', P.koi, [0, h * 0.6, 0.9], [0.22, 0.22, 0.22]);
  },
  kazan(d) {
    const L = d.between(4, 6);
    d.part('box', P.darkMetal, [0, 0.4, 0], [L * 0.8, 0.8, 2.6]);
    d.part('cyl', P.brass, [-L / 2, 1.9, 0], [3, L, 3], [0, 0, -Math.PI / 2]);
    d.part('sphere', P.brass, [L / 2, 1.9, 0], [1.2, 3, 3]);
    for (let i = 0; i < 3; i++) d.part('torus', P.rust, [-L / 2 + (i + 0.5) * (L / 3), 1.9, 0], [3.1, 0.3, 3.1], [0, 0, Math.PI / 2]);
    d.part('cyl', P.darkMetal, [-L * 0.25, 3.2, 0], [0.7, 2.6, 0.7]);
    d.part('cone', P.darkMetal, [-L * 0.25, 5.8, 0], [1.2, -0.6, 1.2]);
    d.glow('cyl', P.amber, [L / 2 + 0.55, 1.9, 0], [0.7, 0.1, 0.7], [0, 0, -Math.PI / 2]);
    d.rod(P.rust, [L * 0.2, 3.2, 0.6], [L * 0.6, 3.8, 2.6], 0.3);
    d.rod(P.rust, [L * 0.6, 3.8, 2.6], [L * 0.6, 0, 3.4], 0.3);
  },
  monoteker(d, o) {
    // Courier unicycles: blue monowheel or the orange ball-car (design §5).
    if (o.v % 2) {
      d.part('torus', P.ink, [0, 1.6, 0], [3.2, 0.7, 3.2], [0, 0, Math.PI / 2]);
      d.part('cyl', '#3a6ea5', [0, 1.6, -0.35], [2.2, 0.7, 2.2], [Math.PI / 2, 0, 0]);
      d.part('box', '#3a6ea5', [0, 2.6, 0.3], [0.6, 1.4, 1.6], [0.4, 0, 0]);
      d.part('box', P.ink, [0, 3.35, -0.1], [0.6, 0.2, 1]);
      d.glow('sphere', P.teal, [0, 2.4, 1.2], [0.3, 0.3, 0.2]);
    } else {
      d.part('sphere', P.sun, [0, 1.5, 0], [3, 3, 3]);
      d.part('torus', P.ink, [0, 1.5, 0], [3.05, 0.25, 3.05], [0, 0, Math.PI / 2]);
      d.glow('sphere', P.teal, [0, 2.1, 1.1], [1.3, 0.8, 0.9]);
      d.part('cyl', P.darkMetal, [0, 2.9, -0.6], [0.06, 1.6, 0.06]);
      d.glow('sphere', P.koi, [0, 4.5, -0.6], [0.2, 0.2, 0.2]);
    }
  },
  kafa(d, o, b) {
    // A half-buried giant stone head, turned on its side.
    const stone = b === 4 ? P.sand : P.stone;
    const tilt = d.between(0.4, 1.3) * (o.v % 2 ? 1 : -1);
    const h = d.sub([0, 1.5, 0], 1, 0, [d.between(-0.3, 0.2), 0, tilt]);
    h.part('sphere', stone, [0, 2.6, 0], [7, 8.5, 7.5]);
    h.part('box', stone, [0, 2.6, 3.4], [1.4, 3, 1.6], [-0.15, 0, 0]);
    h.part('box', stone, [0, 4.4, 3.1], [5.2, 0.9, 1.2]);
    h.part('sphere', P.ink, [-1.4, 3.6, 3.15], [1.4, 0.8, 0.8]);
    h.part('sphere', P.ink, [1.4, 3.6, 3.15], [1.4, 0.8, 0.8]);
    h.part('box', '#8a7f78', [0, 0.6, 3.2], [2.6, 0.35, 0.8]);
    if (d.rand() < 0.6) h.part('hemi', '#7d9a52', [-1.5, 6.4, -1], [3.6, 1.2, 3.6], [0.3, 0, 0.4]);
    if (d.rand() < 0.5) h.glow('sphere', P.teal, [1.4, 3.6, 3.4], [0.35, 0.35, 0.2]);
  },
  el(d, o, b) {
    // Stone hands reaching out of the sand.
    const stone = b === 4 ? P.sand : P.stone;
    const tilt = d.between(-0.25, 0.25);
    const h = d.sub([0, -1, 0], 1, 0, [tilt, 0, d.between(-0.2, 0.2)]);
    h.part('box', stone, [0, 2.2, 0], [3.2, 4.4, 1.5]);
    const fingers = [-1.15, -0.4, 0.35, 1.1];
    fingers.forEach((x, i) => {
      const len = [2.6, 3.2, 3, 2.3][i] * d.between(0.9, 1.1);
      const bend = d.between(0.1, 0.7);
      h.part('cyl', stone, [x, 4.2, 0], [0.7, len * 0.55, 0.7]);
      h.part('sphere', stone, [x, 4.2 + len * 0.55, 0], [0.72, 0.72, 0.72]);
      h.part('cyl', stone, [x, 4.2 + len * 0.55, 0], [0.62, len * 0.45, 0.62], [bend, 0, 0]);
    });
    h.part('cyl', stone, [-1.7, 1.8, 0.2], [0.75, 2.4, 0.75], [0, 0, 0.7]);
    h.part('cyl', stone, [0, -2, 0], [2.4, 2.4, 1.6]);
  },
  kubbe(d, o) {
    // Clay dome house, red door (design §4 Kehribar Kumu).
    const w = d.between(5, 7);
    const col = o.v % 3 === 0 ? P.bone : o.v % 3 === 1 ? '#e0864a' : '#d9a06a';
    d.part('cyl', '#c98b5a', [0, 0, 0], [w * 1.05, 0.8, w * 1.05]);
    d.part('hemi', col, [0, 0.7, 0], [w, w * 0.7, w]);
    d.part('box', P.red, [0, 1.2, w * 0.48], [1.2, 2.2, 0.5]);
    d.part('hemi', P.red, [0, 2.3, w * 0.48], [1.2, 0.5, 0.5], [Math.PI / 2, 0, 0]);
    for (let i = 0; i < 3; i++) {
      const a = 1.2 + i * 1.3;
      d.glow('sphere', P.amber, [Math.cos(a) * w * 0.42, 2.2, Math.sin(a) * w * 0.42], [0.5, 0.5, 0.5]);
    }
    if (d.rand() < 0.5) d.part('cyl', '#c98b5a', [w * 0.2, w * 0.6, -w * 0.1], [0.6, 1.4, 0.6]);
    // A low curving terrace wall.
    for (let i = 0; i < 6; i++) {
      const a = Math.PI + i * 0.35;
      d.part('box', '#c98b5a', [Math.cos(a) * w * 0.85, 0.4, Math.sin(a) * w * 0.85], [1.4, 0.8, 0.4], [0, -a + Math.PI / 2, 0]);
    }
  },
  blok(d, o) {
    // Brutalist megablock with lit window strips (design §4 Kemik Şehir).
    const w = d.between(6, 9), dp = d.between(6, 9);
    const h = d.between(10, 24);
    d.part('box', P.concrete, [0, h / 2, 0], [w, h, dp]);
    const floors = Math.floor(h / 3);
    for (let f = 1; f < floors; f++) {
      const y = f * 3;
      d.part('box', '#6e6a6c', [0, y, 0], [w + 0.3, 0.35, dp + 0.3]);
      for (let side = 0; side < 2; side++) {
        const lit = d.rand() < 0.35;
        const z = (side ? -1 : 1) * (dp / 2 + 0.02);
        if (lit) d.glow('box', d.rand() < 0.8 ? P.amber : P.teal, [d.between(-w / 4, w / 4), y + 1.4, z], [d.between(1, w * 0.5), 1, 0.06]);
        else d.part('box', P.ink, [0, y + 1.4, z], [w * 0.8, 0.9, 0.05]);
      }
    }
    // Cantilevered top slab, broken corner, and a rooftop mast.
    d.part('box', '#a29a92', [w * 0.2, h + 1.5, 0], [w * 1.3, 3, dp * 0.8]);
    d.part('box', P.concrete, [-w * 0.45, h + 0.4, dp * 0.4], [2, 2, 2], [0.4, 0.3, 0.2]);
    d.part('cyl', P.darkMetal, [w * 0.4, h + 3, -dp * 0.2], [0.12, 4, 0.12]);
    if (o.v % 3 === 0) d.glow('sphere', P.koi, [w * 0.4, h + 7, -dp * 0.2], [0.3, 0.3, 0.3]);
  },
  kopru(d) {
    // A hanging highway fragment on pillars, one end broken and drooping.
    const L = 26, y = d.between(7, 10);
    d.part('box', P.concrete, [0, y, 0], [L, 1, 6]);
    d.part('box', '#6e6a6c', [0, y + 0.8, 2.9], [L, 0.6, 0.25]);
    d.part('box', '#6e6a6c', [0, y + 0.8, -2.9], [L, 0.6, 0.25]);
    for (const x of [-L * 0.3, L * 0.2]) {
      d.part('box', P.concrete, [x, y / 2, 0], [2, y, 2.6]);
      d.part('box', '#a29a92', [x, y - 0.8, 0], [3, 1, 6.4]);
    }
    d.part('box', P.concrete, [L / 2 + 4, y - 2.2, 0], [9, 1, 6], [0, 0, -0.45]);
    d.part('box', P.concrete, [-L / 2 - 2, y * 0.5, 0.6], [6, 1, 6], [0.2, 0, 1.05]);
    for (let i = 0; i < 4; i++) d.glow('box', P.amber, [-L / 2 + 4 + i * 6, y - 0.6, 3.05], [0.6, 0.15, 0.06]);
    d.part('box', P.rust, [d.between(-6, 6), y + 1.1, 1], [3.6, 1.6, 1.8], [0, d.between(-0.3, 0.3), 0]);
  },
  tabela(d) {
    const h = d.between(3, 5);
    const col = d.pick([P.rose, P.teal, P.amber, P.pink]);
    d.part('box', P.ink, [0, h / 2, 0], [0.3, h, 0.3]);
    d.part('box', P.ink, [0, h + 0.8, 0], [3.4, 1.9, 0.3]);
    d.glow('box', col, [0, h + 0.8, 0.17], [3, 1.5, 0.05]);
    d.part('box', P.ink, [-0.6, h + 0.85, 0.21], [0.4, 1.1, 0.04]);
    d.part('box', P.ink, [0.5, h + 0.7, 0.21], [0.9, 0.3, 0.04]);
  },
  kapsul(d, o) {
    // Egg capsule houses on stilts (design §4 Asma Köyler).
    const lift = d.between(2.5, 4.5);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      d.rod(P.darkBark, [Math.cos(a) * 1.4, 0, Math.sin(a) * 1.4], [Math.cos(a) * 0.6, lift + 0.8, Math.sin(a) * 0.6], 0.22);
    }
    const col = o.v % 2 ? P.bone : '#e6c7a2';
    d.part('sphere', col, [0, lift + 1.9, 0], [3.4, 4, 3.4]);
    d.glow('torus', P.teal, [0, lift + 2.2, 0], [3.42, 0.3, 3.42]);
    d.glow('sphere', P.amber, [0, lift + 2.2, 1.55], [1, 1, 0.5]);
    d.part('cone', P.teal, [0, lift + 3.7, 0], [1.2, 0.8, 1.2]);
    // Rope ladder.
    for (let i = 0; i < 4; i++) d.part('box', '#a8835a', [0, 0.5 + i * (lift / 4), 1.8 - i * 0.12], [0.8, 0.08, 0.12]);
    d.rod('#a8835a', [-0.4, 0, 1.85], [-0.4, lift, 1.4], 0.04);
    d.rod('#a8835a', [0.4, 0, 1.85], [0.4, lift, 1.4], 0.04);
  },
  kapi(d) {
    // Red temple gate of the canyon.
    const h = d.between(7, 10), w = d.between(5, 7);
    d.part('box', P.ink, [-w / 2, 0.4, 0], [1.6, 0.8, 1.6]);
    d.part('box', P.ink, [w / 2, 0.4, 0], [1.6, 0.8, 1.6]);
    d.part('cyl', P.red, [-w / 2, 0, 0], [0.9, h, 0.9]);
    d.part('cyl', P.red, [w / 2, 0, 0], [0.9, h, 0.9]);
    d.part('box', P.red, [0, h * 0.78, 0], [w + 1.2, 0.6, 0.7]);
    d.part('box', P.red, [0, h + 0.3, 0], [w + 3, 0.8, 1]);
    d.part('box', P.ink, [0, h + 0.9, 0], [w + 3.6, 0.4, 1.3]);
    d.part('box', P.ink, [-(w + 3.6) / 2, h + 1.2, 0], [1.2, 0.4, 1.3], [0, 0, -0.4]);
    d.part('box', P.ink, [(w + 3.6) / 2, h + 1.2, 0], [1.2, 0.4, 1.3], [0, 0, 0.4]);
    d.glow('box', P.amber, [0, h * 0.78 + 1, 0], [0.8, 1, 0.3]);
  },
  kemer(d) {
    // A great arch in the lagoon with a thin waterfall.
    const r = d.between(5, 7);
    d.part('torus', P.bone, [0, 0, 0], [r * 2, 2.4, r * 2], [Math.PI / 2, 0, 0]);
    d.part('box', P.bone, [0, r + 0.6, 0], [r * 1.4, 1.2, 2.2]);
    d.part('box', '#bfe8e4', [r * 0.3, r * 0.5, 1.15], [1.2, r, 0.1]);
    d.part('cyl', '#d6f1ee', [r * 0.3, -0.2, 1.4], [2.2, 0.3, 1.6]);
    d.part('hemi', '#7d9a52', [-r * 0.3, r + 1.2, 0], [3, 0.8, 2]);
  },
  kaya(d, o, b) {
    const col = b === 0 ? d.pick(['#5d6f8f', '#7d86a3']) : b === 4 ? d.pick(['#c06a4a', '#d9855a']) : b === 5 ? '#8a8486' : d.pick(['#7c7286', '#8b8f7a', '#6f7d6a']);
    d.part('rock', col, [0, 0.35, 0], [d.between(1.6, 2.6), d.between(1, 2), d.between(1.6, 2.6)], [d.rand() * 3, d.rand() * 3, d.rand() * 3]);
    if (d.rand() < 0.5) d.part('rock', col, [d.between(1, 1.6), 0.1, d.between(-1, 1)], [1, 0.8, 1], [d.rand() * 3, d.rand() * 3, 0]);
    if (b === 0) d.part('hemi', P.snow, [0, 1, 0], [1.6, 0.5, 1.6]);
    if (b === 1 || b === 2) d.part('hemi', '#7d9a52', [0, 0.95, 0], [1.6, 0.4, 1.4], [0.2, 0, 0.1]);
  },
  yosun(d) {
    // A moss hill with a sleepy face.
    const w = d.between(4, 6);
    d.part('hemi', '#6a9a4a', [0, -0.3, 0], [w, w * 0.6, w * 0.9]);
    d.part('hemi', '#8dbf6a', [w * 0.15, w * 0.25, 0], [w * 0.6, w * 0.3, w * 0.55]);
    const ez = w * 0.42;
    for (const x of [-w * 0.15, w * 0.15]) {
      d.part('sphere', P.bone, [x, w * 0.2, ez], [0.7, 0.45, 0.3]);
      d.part('sphere', P.ink, [x, w * 0.18, ez + 0.12], [0.35, 0.2, 0.15]);
    }
    d.part('sphere', '#e98aa0', [0, w * 0.08, ez + 0.05], [0.8, 0.2, 0.2]);
  },
  nokta(d) {
    const col = d.pick([P.bone, P.bone, '#fff4d6', P.pink, '#ffd25e', P.koi]);
    d.part('cyl', col, [0, -0.02, 0], [1, 0.08, 1]);
  },
  katedral(d) {
    // Kızıl Katedral: the Counts' bell foundry in the heart of the canyon.
    d.part('box', '#5a4044', [0, 0.6, 0], [26, 1.2, 30]);
    d.part('box', '#5a4044', [0, 1.6, 0], [22, 1, 26]);
    d.part('box', P.red, [0, 2.1 + 6, 0], [11, 12, 20]);
    d.part('cone', '#7a1f2a', [0, 14, 0], [13, 6, 22]);
    const spire = (x: number, z: number, h: number, w: number) => {
      d.part('cyl', P.red, [x, 2.1, z], [w, h, w]);
      d.part('torus', P.ink, [x, 2.1 + h * 0.7, z], [w * 1.15, 0.5, w * 1.15]);
      d.part('cone', P.ink, [x, 2.1 + h, z], [w * 1.2, h * 0.55, w * 1.2]);
      d.glow('sphere', P.koi, [x, 2.1 + h * 1.55 + 0.4, z], [0.6, 0.6, 0.6]);
    };
    spire(-6, -9, 16, 3.4);
    spire(6, -9, 16, 3.4);
    spire(-6, 9, 12, 2.6);
    spire(6, 9, 12, 2.6);
    spire(0, -12, 26, 4.4);
    // Rose window and bell.
    d.glow('torus', P.koi, [0, 10, 10.05], [5, 0.6, 5], [Math.PI / 2, 0, 0]);
    d.glow('sphere', P.amber, [0, 10, 10], [2.2, 2.2, 0.3]);
    d.part('box', P.ink, [0, 4.6, 10.1], [3, 5, 0.4]);
    d.part('cone', P.brass, [0, 24, -12], [3, -2.6, 3]);
    // Blood pipes running out of the foundry.
    for (const s of [-1, 1]) {
      d.part('cyl', P.rust, [s * 6, 3, 12], [1.2, 14, 1.2], [Math.PI / 2, 0, 0]);
      for (let i = 0; i < 3; i++) d.glow('cyl', P.koi, [s * 6, 3, 15 + i * 3.5], [1.25, 0.6, 1.25], [Math.PI / 2, 0, 0]);
    }
    for (let i = 0; i < 6; i++) d.part('box', '#5a4044', [0, 0.8 - i * 0.18, 16 + i * 1.1], [8, 0.4, 1.2]);
  },
  dev(d) {
    // Düşmüş Dev: a fallen colossus, half stone, half machine (design §11.1). Lies along local x.
    const stone = P.stone, moss = '#7d9a52';
    // Head, face up, turned a little.
    const head = d.sub([24, 3, 0], 1, 0, [0, 0, 0.25]);
    head.part('sphere', stone, [0, 2, 0], [11, 12, 10]);
        head.part('box', stone, [-1, 7.5, 0], [3, 3, 2.2], [0, 0, 0.3]);
    head.part('sphere', P.ink, [-3.2, 6.4, -2.2], [1.8, 1.2, 1.8]);
    head.part('sphere', P.ink, [-3.2, 6.4, 2.2], [1.8, 1.2, 1.8]);
    head.glow('sphere', P.teal, [-3.6, 6.6, 2.2], [0.6, 0.5, 0.6]);
    head.part('hemi', moss, [1, 7.5, -1], [6, 1.6, 5]);
    // Torso with an open rib cage.
    d.part('sphere', stone, [6, 2.2, 0], [20, 8, 14]);
    for (let i = 0; i < 6; i++) d.part('torus', P.bone, [-1 + i * 3, 5, 0], [12 - Math.abs(i - 2.5) * 1.2, 1, 9], [Math.PI / 2, Math.PI / 2, 0]);
    d.part('box', P.darkMetal, [7, 6, 0], [10, 0.6, 1.4]);
    d.glow('box', P.teal, [7, 6.35, 0], [9, 0.12, 0.3]);
    gear(d.sub([3, 6.4, 2.5], 0.7, 0, [0.3, 0, 0.2]), 2.6, P.brass);
    d.glow('sphere', P.koi, [10, 5.6, -2], [1.6, 1.6, 1.6]);
    // Arms: one along the ground, one raised with an open hand.
    d.part('cyl', stone, [14, 1.5, -8], [3, 14, 3], [0, 0.5, Math.PI / 2]);
    d.part('sphere', stone, [2, 1.5, -12], [4, 3, 5]);
    d.rod(stone, [13, 3, 7], [10, 10, 12], 3);
    d.part('sphere', stone, [10, 10, 12], [3.4, 3.4, 3.4]);
    d.rod(stone, [10, 10, 12], [6, 16, 13], 2.6);
    for (let i = 0; i < 4; i++) d.rod(stone, [6, 16, 13], [4.4 + i * 0.9, 19.5 - Math.abs(i - 1.5) * 0.5, 12 + i * 0.6], 0.7);
    // Broken legs with exposed machinery.
    d.part('cyl', stone, [-4, 2, -3], [4.2, 14, 4.2], [0, 0.15, Math.PI / 2]);
    d.part('cyl', stone, [-4, 2, 4], [4.2, 11, 4.2], [0, -0.2, Math.PI / 2]);
    d.part('cyl', P.darkMetal, [-15, 2, 5.5], [2.4, 4, 2.4], [0, -0.2, Math.PI / 2]);
    d.glow('cyl', P.teal, [-19.2, 2, 6.4], [2, 0.3, 2], [0, -0.2, Math.PI / 2]);
    d.part('rock', stone, [-24, 1, -3], [5, 4, 5], [0.4, 0.2, 0.7]);
    d.part('rock', stone, [-22, 0.5, 8], [3, 2.4, 3], [0.1, 0.8, 0.2]);
    d.part('hemi', moss, [4, 7, -3], [8, 1.4, 6]);
  },
};

/** Draw one map object into the sink. `y` is the ground height under it. */
export function drawObject(sink: Sink, o: Obj, y: number, biome: number) {
  tmpS.set(o.s, o.s, o.s);
  tmpP.set(o.x, y, o.z);
  Quaternion.FromEulerAnglesToRef(0, o.r, 0, tmpQ);
  const base = Matrix.Compose(tmpS, tmpQ, tmpP);
  const d = new Draw(sink, base, o.v * 7919 + Math.floor(o.x * 13) + Math.floor(o.z * 7));
  RECIPES[o.k](d, o, biome);
}
