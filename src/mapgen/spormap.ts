/**
 * The Spor Ormanı test map: a 1.5×1.5 km mushroom forest built only from our own Blender models
 * (SPOR_KINDS, morels, grass and fireflies). It is the game's default world; `?map=city` still plays
 * the old city block. Pure data, no Babylon: the layout is rebuilt from the seed on every load, so
 * the same file opens in the planner (export it with tools/maps/export-spor.mjs).
 *
 * Layout: a creek meanders north to south with bridges over it, four small mushroom-house villages
 * sit in clearings, and the rest is forest of giant, big, medium and small mushrooms with moss
 * mounds, red sprouts, enoki clumps, dark grass and firefly swarms. Numbers live in SPOR_MAP.
 */
import { DEFAULT_PARAMS, Field, KINDS, generate, type Kind, type MapFile, type Op } from './generate';
import { fbm, rng } from './noise';

export const SPOR_MAP = {
  seed: 1515,
  size: 1500,
  relief: 1.3,
  /** Water plane height: only the creek bed (and a few low hollows) sit below it. */
  water: -2.6,
  creek: {
    /** Lift spacing along the creek, lift radius and depth (lifts overlap, so the bed is about 1.4× deeper). */
    step: 6,
    r: 8,
    depth: -3.2,
    /** Side-to-side swing of the meander in meters, and its wavelength. */
    swing: 140,
    wave: 520,
    /** Nothing tall grows this close to the creek's center line. */
    clear: 16,
  },
  /** Bridge spots as fractions along the creek. */
  bridges: [
    { at: 0.14, k: 'kopru_tas' },
    { at: 0.31, k: 'kopru_ahsap' },
    { at: 0.47, k: 'kopru_tas_yikik' },
    { at: 0.62, k: 'kopru_tas' },
    { at: 0.79, k: 'kopru_ahsap' },
    { at: 0.92, k: 'kopru_tas_yikik' },
  ],
  /** Village clearings (x, z): three or four houses round a small square. */
  villages: [
    [-380, 330],
    [330, 420],
    [360, -330],
    [-300, -380],
  ] as [number, number][],
  villageRadius: 30,
  villageClear: 55,
  /** Forest: [kind, grid cell in m, base chance, forest-noise weight]. Bigger first. */
  forest: [
    ['mantar_kumesi', 110, 0.25, 0.5],
    ['mantar_buyuk', 34, 0.45, 1],
    ['mantar_orta', 19, 0.45, 1],
    ['mantar_kucuk', 13, 0.4, 0.8],
    ['yosun_tumsek', 40, 0.35, 0.5],
    ['kizil_filiz', 24, 0.35, 0.6],
  ] as [Kind, number, number, number][],
  /** Enoki clumps (3–6 clusters each) and ground cover, one roll per grid cell. */
  enokiCell: 26,
  enokiChance: 0.35,
  grassCell: 30,
  grassChance: 0.35,
  fireflyCell: 70,
  fireflyChance: 0.3,
  /** Bouncy morels scattered in the forest, besides two in each village. */
  morelCell: 120,
  morelChance: 0.4,
};

type Pt = { x: number; z: number };

/** Creek center line, north (+z) to south. */
function creekLine(): Pt[] {
  const { size } = SPOR_MAP;
  const { swing, wave, step } = SPOR_MAP.creek;
  const half = size / 2 + 60;
  const pts: Pt[] = [];
  for (let z = half; z >= -half; z -= step) {
    const x = Math.sin((z / wave) * Math.PI * 2 + 0.7) * swing + fbm(z / 300, 3.3, SPOR_MAP.seed + 2, 2) * 60 - 40;
    pts.push({ x, z });
  }
  return pts;
}

/** Nearest distance from a point to the creek line. */
function creekDist(line: Pt[], x: number, z: number): number {
  let d = Infinity;
  for (const p of line) {
    const q = (p.x - x) ** 2 + (p.z - z) ** 2;
    if (q < d) d = q;
  }
  return Math.sqrt(d);
}

/** Build the map file. Deterministic: the same numbers always give the same forest. */
export function buildSporMap(): MapFile {
  const M = SPOR_MAP;
  const gen = {
    ...DEFAULT_PARAMS,
    seed: M.seed,
    size: M.size,
    relief: M.relief,
    water: M.water,
    // Only our Blender models: no kit trees, rocks, mech, ruins, giants or dots.
    trees: 0,
    mushrooms: 0,
    giants: 0,
    mech: 0,
    ruins: 0,
    rocks: 0,
    dots: 0,
    biomes: [false, true, false, false, false, false],
    cathedral: false,
    colossus: false,
    vendors: 1,
  };
  const ops: Op[] = [];
  const line = creekLine();
  for (const p of line) ops.push({ t: 'lift', x: Math.round(p.x * 10) / 10, z: p.z, r: M.creek.r, a: M.creek.depth });
  const field = new Field(gen, ops);
  const half = M.size / 2;
  const r = rng(M.seed * 31 + 7);

  // Taken ground: circles nothing else may overlap.
  const taken: { x: number; z: number; r: number }[] = [];
  const grid = new Map<number, { x: number; z: number; r: number }[]>();
  const G = 32;
  const gk = (i: number, j: number) => (i + 1000) * 4000 + (j + 1000);
  const free = (x: number, z: number, rad: number) => {
    const i0 = Math.floor((x - rad - 40) / G), i1 = Math.floor((x + rad + 40) / G);
    const j0 = Math.floor((z - rad - 40) / G), j1 = Math.floor((z + rad + 40) / G);
    for (let i = i0; i <= i1; i++)
      for (let j = j0; j <= j1; j++) for (const c of grid.get(gk(i, j)) ?? []) if ((c.x - x) ** 2 + (c.z - z) ** 2 < (c.r + rad) ** 2) return false;
    return true;
  };
  const take = (x: number, z: number, rad: number) => {
    const c = { x, z, r: rad };
    taken.push(c);
    const k = gk(Math.floor(x / G), Math.floor(z / G));
    let l = grid.get(k);
    if (!l) grid.set(k, (l = []));
    l.push(c);
  };
  const add = (k: Kind, x: number, z: number, s: number, rot: number, solidR = KINDS[k].r * s) => {
    ops.push({ t: 'add', o: { k, x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100, s: Math.round(s * 100) / 100, r: Math.round(rot * 1000) / 1000, v: Math.floor(r() * 1000) } });
    if (solidR > 0) take(x, z, solidR);
  };

  // Vendor machines come from the generator; keep the forest off them.
  for (const o of generate(field)) if (o.k === 'satici' || o.k === 'sansli') take(o.x, o.z, 6);

  // Bridges across the creek, the span (model x axis) at right angles to the water.
  for (const b of M.bridges) {
    const i = Math.min(line.length - 2, Math.max(1, Math.round(b.at * (line.length - 1))));
    const p = line[i], a = line[i - 1], c = line[i + 1];
    const tx = c.x - a.x, tz = c.z - a.z;
    const len = Math.hypot(tx, tz);
    const nx = -tz / len, nz = tx / len;
    add(b.k as Kind, p.x, p.z, 1, Math.atan2(-nz, nx), KINDS[b.k as Kind].r + 4);
  }

  // Villages: houses round a square, facing in, with two morels and a little glow.
  const houses: Kind[] = ['ev_kule', 'ev_genis', 'ev_kulube'];
  M.villages.forEach(([vx, vz], vi) => {
    const n = 3 + (vi % 2);
    const a0 = r() * Math.PI * 2;
    for (let h = 0; h < n; h++) {
      const a = a0 + (h / n) * Math.PI * 2 + (r() - 0.5) * 0.3;
      const k = houses[(vi + h) % houses.length];
      const x = vx + Math.sin(a) * M.villageRadius, z = vz + Math.cos(a) * M.villageRadius;
      add(k, x, z, 1, a + Math.PI + (r() - 0.5) * 0.4, KINDS[k].r + 2);
    }
    for (let m = 0; m < 2; m++) {
      const a = a0 + Math.PI / n + m * Math.PI;
      add('morel', vx + Math.sin(a) * 9, vz + Math.cos(a) * 9, 1, r() * 6.28, 1.5);
    }
    add('cimen', vx, vz, 2.2, 0, 0);
    add('atesbocegi', vx + 4, vz - 3, 1.4, 0, 0);
    for (let e = 0; e < 6; e++) {
      const a = r() * Math.PI * 2, d = 14 + r() * 6;
      add(pick(['enoki_kucuk', 'enoki_orta', 'enoki_buyuk', 'enoki_seyrek']), vx + Math.sin(a) * d, vz + Math.cos(a) * d, 1, r() * 6.28, 0.6);
    }
  });

  function pick<T>(list: T[]): T {
    return list[Math.floor(r() * list.length)];
  }
  const inside = (x: number, z: number, m: number) => Math.abs(x) < half - m && Math.abs(z) < half - m;
  const nearVillage = (x: number, z: number, d: number) => M.villages.some(([vx, vz]) => (vx - x) ** 2 + (vz - z) ** 2 < d * d);
  const dry = (x: number, z: number) => field.height(x, z) > M.water + 0.5;
  /** Forest density 0..1: thick groves and open glades. */
  const forest = (x: number, z: number) => Math.max(0, Math.min(1, 0.55 + 1.3 * fbm(x / 160, z / 160, M.seed + 41, 3)));

  for (const [k, cell, chance, fw] of M.forest) {
    const def = KINDS[k];
    const [s0, s1] = k === 'mantar_kumesi' ? [0.85, 1.1] : k === 'mantar_buyuk' ? [0.75, 1.15] : [0.7, 1.3];
    for (let gx = -half; gx < half; gx += cell)
      for (let gz = -half; gz < half; gz += cell) {
        const x = gx + r() * cell, z = gz + r() * cell;
        const roll = r(), s = s0 + r() * (s1 - s0), rot = r() * Math.PI * 2;
        const p = chance * (1 - fw + fw * forest(x, z) * 1.6);
        if (roll > p) continue;
        const rad = def.r * s;
        if (!inside(x, z, rad) || !dry(x, z) || field.slope(x, z) > 0.6) continue;
        if (creekDist(line, x, z) < M.creek.clear + rad) continue;
        if (nearVillage(x, z, M.villageClear + rad)) continue;
        if (!free(x, z, rad * 0.8)) continue;
        add(k, x, z, s, rot, rad * 0.8);
      }
  }

  // Enoki clumps: a few clusters around a point, often at the foot of a mushroom.
  const enoki: Kind[] = ['enoki_seyrek', 'enoki_kucuk', 'enoki_orta', 'enoki_buyuk'];
  for (let gx = -half; gx < half; gx += M.enokiCell)
    for (let gz = -half; gz < half; gz += M.enokiCell) {
      const x = gx + r() * M.enokiCell, z = gz + r() * M.enokiCell;
      if (r() > M.enokiChance * (0.4 + forest(x, z))) continue;
      const n = 3 + Math.floor(r() * 4);
      for (let i = 0; i < n; i++) {
        const ex = x + (r() - 0.5) * 4, ez = z + (r() - 0.5) * 4;
        if (!inside(ex, ez, 2) || !dry(ex, ez) || !free(ex, ez, 0.4)) continue;
        add(pick(enoki), ex, ez, 0.8 + r() * 0.5, r() * 6.28, 0.4);
      }
    }

  // Dark grass patches (walk-through) and firefly swarms, thicker along the creek and in glades.
  for (let gx = -half; gx < half; gx += M.grassCell)
    for (let gz = -half; gz < half; gz += M.grassCell) {
      const x = gx + r() * M.grassCell, z = gz + r() * M.grassCell;
      const wet = creekDist(line, x, z) < 50 ? 0.35 : 0;
      if (r() > M.grassChance + wet || !inside(x, z, 8) || !dry(x, z)) continue;
      add('cimen', x, z, 1 + r() * 1.2, 0, 0);
    }
  for (let gx = -half; gx < half; gx += M.fireflyCell)
    for (let gz = -half; gz < half; gz += M.fireflyCell) {
      const x = gx + r() * M.fireflyCell, z = gz + r() * M.fireflyCell;
      const wet = creekDist(line, x, z) < 60 ? 0.4 : 0;
      if (r() > M.fireflyChance + wet || !inside(x, z, 10)) continue;
      add('atesbocegi', x, z, 1 + r() * 0.6, 0, 0);
    }

  // Bouncy morels in the forest.
  for (let gx = -half; gx < half; gx += M.morelCell)
    for (let gz = -half; gz < half; gz += M.morelCell) {
      const x = gx + r() * M.morelCell, z = gz + r() * M.morelCell;
      if (r() > M.morelChance || !inside(x, z, 5) || !dry(x, z) || !free(x, z, 1.5)) continue;
      add('morel', x, z, 1, r() * 6.28, 1.5);
    }

  return { v: 1, gen, ops };
}

/** Objects the test map adds, by kind (for the docs and quick checks). */
export function countKinds(map: MapFile): Record<string, number> {
  const out: Record<string, number> = {};
  for (const op of map.ops) if (op.t === 'add') out[op.o.k] = (out[op.o.k] ?? 0) + 1;
  return out;
}

