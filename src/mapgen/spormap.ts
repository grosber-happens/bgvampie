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
import type { MapFx } from './fx';
import { MAZE, MAZE_KINDS } from './labirent';
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
  villageRadius: 36,
  villageClear: 62,
  /** Mushroom houses are placed this much bigger than their models (owner, 2026-11-09: houses read too
   * small next to the 1.90 m character). Furniture inside keeps its own size. */
  mushroomHouseScale: 1.3,
  mushroomHouses: ['ev_kule', 'ev_genis', 'ev_kulube', 'ev_iki_kat', 'ev_uc_kat'] as Kind[],
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
  /** The mushroom-woman statue inside its mycelium maze (a 56 m square), and the clear ring round it. */
  maze: [-470, 470] as [number, number],
  mazeClear: 40,
  /** The nomad mushroom pickers' camp and its clear radius. */
  camp: [-210, -30] as [number, number],
  campClear: 22,
  /** A small town of plaster, glass and mosaic houses, as many as fit round a square. */
  town: [280, -90] as [number, number],
  townRadius: 34,
  townClear: 62,
  townHouses: ['ev_iki_kat', 'ev_uc_kat', 'ev_cam_kule', 'ev_mozaik', 'ev_cam_ikiz', 'ev_vitray', 'ev_cam_genis'] as Kind[],
  /** The temple tree on its own hill, with floating rocks round it. */
  temple: [520, 80] as [number, number],
  templeClear: 30,
  /** Fantastical trees through the forest: grid cell, chance. */
  treeCell: 75,
  treeChance: 0.3,
  trees: ['agac_isik_sogut', 'agac_gokkusagi', 'agac_masal_mesesi', 'agac_yelpaze', 'agac_kizil_semsiye', 'agac_denizanasi', 'agac_lingzhi', 'agac_kehribar'] as Kind[],
  /** Floating rock clusters: grid cell, chance, and the kinds. */
  floatCell: 170,
  floatChance: 0.3,
  floats: ['ucan_blok_kucuk', 'ucan_blok_orta', 'ucan_kaya', 'ucan_basamak', 'ucan_ikiz', 'ucan_ada', 'ucan_sivri', 'ucan_harabe'] as Kind[],
  /**
   * Models that were only in the planner before: extra creek bridges, rocks, small mushrooms, blue
   * puffballs, giant cluster variants, village props and lamps, and a showcase clearing for the pieces that
   * need a hand-made spot (balcony bridges, mycelium tunnel). These passes run after the rest, so the
   * older layout keeps its seed.
   */
  moreBridges: [
    { at: 0.05, k: 'kopru_gaudi_mozaik' },
    { at: 0.70, k: 'kopru_gaudi_viyaduk' },
  ],
  rockCell: 48,
  rockChance: 0.3,
  rocks: ['tas_cakil', 'tas_orta', 'tas_yassi', 'tas_buyuk', 'tas_dikili', 'tas_kaya', 'tas_dengeli', 'tas_yarik', 'tas_grup', 'tas_kemer', 'tas_sivri', 'blok_kesme', 'blok_yikik_duvar'] as Kind[],
  smallCell: 34,
  smallChance: 0.18,
  smalls: ['mantar_semsiye', 'mantar_murekkep', 'mantar_huni', 'mantar_mercan', 'mantar_cin'] as Kind[],
  puffCell: 170,
  puffChance: 0.3,
  clusterCell: 160,
  clusterChance: 0.35,
  clusters: ['mantar_kume_1', 'mantar_kume_2', 'mantar_kume_3', 'mantar_kume_4', 'mantar_kume_5'] as Kind[],
  /** Props round each village and the town square, at this distance from the middle. */
  props: ['lamba_sokak', 'lamba_cift', 'lamba_bahce', 'kasa', 'fici', 'sepet_mantar', 'tabela_ahsap', 'kutuk', 'cit', 'odun_yigini', 'kavanoz_ates'] as Kind[],
  propRing: 17,
  /** Showcase clearing (x, z) and its clear radius. */
  showcase: [0, -560] as [number, number],
  showcaseClear: 45,
  /**
   * Effect regions: thin spores outside, thick spores, fog and fireflies in the villages, the camp
   * and round the statue (percent of the atmosphere preset, see mapgen/fx.ts).
   */
  fx: {
    outside: { spores: 0.25, fog: 1, fireflies: 1 },
    village: { r: 75, spores: 1.6, fog: 1.2, fireflies: 1.4 },
    maze: { r: 70, spores: 2.2, fog: 1.5, fireflies: 1.2 },
    camp: { r: 45, spores: 1.2, fog: 1, fireflies: 2 },
  },
};

type Pt = { x: number; z: number };

/** Creek center line, north (+z) to south. */
/** Placement scale of a house kind (mushroom houses are placed bigger, see SPOR_MAP.mushroomHouseScale). */
const houseScale = (k: Kind) => (SPOR_MAP.mushroomHouses.includes(k) ? SPOR_MAP.mushroomHouseScale : 1);

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
      const s = houseScale(k);
      add(k, x, z, s, a + Math.PI + (r() - 0.5) * 0.4, KINDS[k].r * s + 2);
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

  // The statue in its maze. The Blender layout turns into game axes: x = -x, z = -y, yaw = -rotation.
  // The plinth is a map object; the figure on it is the boss (src/heykel.ts), standing as a statue until woken.
  {
    const [mx, mz] = M.maze;
    add('heykel_kaide', mx, mz, 1, 0, 0);
    for (const [ki, bx, by, rot] of MAZE) add(MAZE_KINDS[ki], mx - bx, mz - by, 1, (-rot * Math.PI) / 180, 0);
    take(mx, mz, M.mazeClear);
  }

  // The nomad camp: the tent, a fire in front, drying racks, baskets, a cart and seats round the fire.
  {
    const [cx, cz] = M.camp;
    const yaw = r() * Math.PI * 2;
    const at = (d: number, a: number) => [cx + Math.sin(yaw + a) * d, cz + Math.cos(yaw + a) * d] as const;
    const put = (k: Kind, d: number, a: number, turn = 0) => {
      const [x, z] = at(d, a);
      add(k, x, z, 1, yaw + a + Math.PI + turn, 0);
    };
    put('kamp_cadir', 0, 0, Math.PI);
    const [fx, fz] = at(9, 0);
    add('kamp_ates', fx, fz, 1, 0, 0);
    for (let i = 0; i < 3; i++) {
      const a = (i - 1) * 0.9;
      // Seats beyond the fire, facing it.
      add('kamp_oturak', fx + Math.sin(yaw + a) * 3, fz + Math.cos(yaw + a) * 3, 1, yaw + a + Math.PI, 0);
    }
    put('kurutma_cerceve', 8, 1.2);
    put('kurutma_tepsi', 9, -1.3);
    put('mantar_dizisi', 7, 2);
    put('sepet_grubu', 6, -0.9);
    put('sepet_sirt', 5.5, 0.7);
    put('kamp_tezgah', 7, -2.1);
    put('kamp_kupler', 7.6, -2.5);
    put('kamp_araba', 10, 2.7, Math.PI / 2);
    put('kamp_fener', 5, 0.35);
    take(cx, cz, M.campClear);
  }

  // The small town: houses round a square, facing in.
  {
    const [tx, tz] = M.town;
    const n = M.townHouses.length;
    M.townHouses.forEach((k, h) => {
      const a = (h / n) * Math.PI * 2 + (r() - 0.5) * 0.2;
      add(k, tx + Math.sin(a) * M.townRadius, tz + Math.cos(a) * M.townRadius, houseScale(k), a + Math.PI, 0);
    });
    for (let m = 0; m < 2; m++) add('morel', tx + (m ? 6 : -6), tz, 1, r() * 6.28, 0);
    add('cimen', tx, tz, 2.4, 0, 0);
    take(tx, tz, M.townClear);
  }

  // The temple tree with floating rocks drifting round it.
  {
    const [px, pz] = M.temple;
    add('agac_tapinak', px, pz, 1, r() * 6.28, 0);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + r() * 0.5, d = 20 + r() * 8;
      add(M.floats[Math.floor(r() * M.floats.length)], px + Math.sin(a) * d, pz + Math.cos(a) * d, 0.9 + r() * 0.4, r() * 6.28, 0);
    }
    take(px, pz, M.templeClear);
  }

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

  // Fantastical trees, alone in the forest.
  for (let gx = -half; gx < half; gx += M.treeCell)
    for (let gz = -half; gz < half; gz += M.treeCell) {
      const x = gx + r() * M.treeCell, z = gz + r() * M.treeCell;
      const k = pick(M.trees), s = 0.85 + r() * 0.35, rad = KINDS[k].r * s;
      if (r() > M.treeChance || !inside(x, z, rad) || !dry(x, z) || field.slope(x, z) > 0.5) continue;
      if (creekDist(line, x, z) < M.creek.clear + rad || nearVillage(x, z, M.villageClear + rad) || !free(x, z, rad)) continue;
      add(k, x, z, s, r() * 6.28, rad);
    }

  // Floating rock clusters over glades.
  for (let gx = -half; gx < half; gx += M.floatCell)
    for (let gz = -half; gz < half; gz += M.floatCell) {
      const x = gx + r() * M.floatCell, z = gz + r() * M.floatCell;
      if (r() > M.floatChance || !inside(x, z, 20)) continue;
      const n = 2 + Math.floor(r() * 3);
      for (let i = 0; i < n; i++) add(pick(M.floats), x + (r() - 0.5) * 18, z + (r() - 0.5) * 18, 0.8 + r() * 0.5, r() * 6.28, 0);
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

  // Extra bridges over the creek, the same way as the first ones.
  for (const b of M.moreBridges) {
    const i = Math.min(line.length - 2, Math.max(1, Math.round(b.at * (line.length - 1))));
    const p = line[i], a = line[i - 1], c = line[i + 1];
    const tx = c.x - a.x, tz = c.z - a.z;
    const len = Math.hypot(tx, tz);
    const nx = -tz / len, nz = tx / len;
    add(b.k as Kind, p.x, p.z, 1, Math.atan2(-nz, nx), KINDS[b.k as Kind].r + 4);
  }

  // The showcase clearing: balcony bridges side by side and the mycelium tunnel in a row.
  {
    const [sx, sz] = M.showcase;
    // Clear the forest that grew there first.
    for (let i = ops.length - 1; i >= 0; i--) {
      const op = ops[i];
      if (op.t === 'add' && (op.o.x - sx) ** 2 + (op.o.z - sz) ** 2 < M.showcaseClear ** 2) ops.splice(i, 1);
    }
    const spans: Kind[] = ['kopru_gecit_12', 'kopru_gecit_20', 'kopru_gecit_20_kat', 'kopru_gecit_28'];
    spans.forEach((k, i) => add(k, sx - 24 + i * 16, sz + 14, 1, Math.PI / 2, 0));
    add('gecit_son', sx - 12, sz - 14, 1, 0, 0);
    add('gecit_duz', sx, sz - 14, 1, 0, 0);
    add('gecit_kavis', sx + 12, sz - 14, 1, 0, 0);
    take(sx, sz, M.showcaseClear);
  }

  // Village and town props: lamps, crates, barrels, baskets, a sign, logs, a fence and firefly jars round the square.
  [...M.villages, M.town].forEach(([vx, vz]) => {
    M.props.forEach((k, i) => {
      const a = (i / M.props.length) * Math.PI * 2 + r() * 0.3;
      const x = vx + Math.sin(a) * M.propRing, z = vz + Math.cos(a) * M.propRing;
      if (free(x, z, KINDS[k].r)) add(k, x, z, 1, a + Math.PI, KINDS[k].r);
    });
  });

  // Giant cluster variants in the groves.
  for (let gx = -half; gx < half; gx += M.clusterCell)
    for (let gz = -half; gz < half; gz += M.clusterCell) {
      const x = gx + r() * M.clusterCell, z = gz + r() * M.clusterCell;
      const k = pick(M.clusters), s = 0.85 + r() * 0.25, rad = KINDS[k].r * s;
      if (r() > M.clusterChance || !inside(x, z, rad) || !dry(x, z) || field.slope(x, z) > 0.6) continue;
      if (creekDist(line, x, z) < M.creek.clear + rad || nearVillage(x, z, M.villageClear + rad) || !free(x, z, rad * 0.8)) continue;
      add(k, x, z, s, r() * 6.28, rad * 0.8);
    }

  // Rocks and cut stones, more of them near the creek.
  for (let gx = -half; gx < half; gx += M.rockCell)
    for (let gz = -half; gz < half; gz += M.rockCell) {
      const x = gx + r() * M.rockCell, z = gz + r() * M.rockCell;
      const k = pick(M.rocks), s = 0.8 + r() * 0.5, rad = KINDS[k].r * s;
      const wet = creekDist(line, x, z) < 45 ? 0.25 : 0;
      if (r() > M.rockChance + wet || !inside(x, z, rad) || !dry(x, z) || !free(x, z, rad)) continue;
      add(k, x, z, s, r() * 6.28, rad);
    }

  // Small forest mushrooms in clumps, like the enoki.
  for (let gx = -half; gx < half; gx += M.smallCell)
    for (let gz = -half; gz < half; gz += M.smallCell) {
      const x = gx + r() * M.smallCell, z = gz + r() * M.smallCell;
      if (r() > M.smallChance * (0.4 + forest(x, z))) continue;
      const k = pick(M.smalls), n = 3 + Math.floor(r() * 4);
      for (let i = 0; i < n; i++) {
        const ex = x + (r() - 0.5) * 3, ez = z + (r() - 0.5) * 3;
        if (!inside(ex, ez, 2) || !dry(ex, ez) || !free(ex, ez, 0.3)) continue;
        add(k, ex, ez, 0.8 + r() * 0.5, r() * 6.28, 0.3);
      }
    }

  // Blue puffballs, two or three together.
  for (let gx = -half; gx < half; gx += M.puffCell)
    for (let gz = -half; gz < half; gz += M.puffCell) {
      const x = gx + r() * M.puffCell, z = gz + r() * M.puffCell;
      if (r() > M.puffChance || !inside(x, z, 5) || !dry(x, z)) continue;
      const n = 2 + Math.floor(r() * 2);
      for (let i = 0; i < n; i++) {
        const ex = x + (r() - 0.5) * 4, ez = z + (r() - 0.5) * 4;
        if (!dry(ex, ez) || !free(ex, ez, 0.6)) continue;
        add('mantar_mavi_patlak', ex, ez, 0.9 + r() * 0.3, r() * 6.28, 0.6);
      }
    }

  const zone = (x: number, z: number, v: { r: number; spores: number; fog: number; fireflies: number }) => ({ shape: 'circle' as const, x, z, ...v });
  const fx: MapFx = {
    outside: { ...M.fx.outside },
    zones: [
      ...M.villages.map(([x, z]) => zone(x, z, M.fx.village)),
      zone(M.town[0], M.town[1], M.fx.village),
      zone(M.maze[0], M.maze[1], M.fx.maze),
      zone(M.camp[0], M.camp[1], M.fx.camp),
    ],
  };
  return { v: 1, gen, ops, fx };
}

/** Objects the test map adds, by kind (for the docs and quick checks). */
export function countKinds(map: MapFile): Record<string, number> {
  const out: Record<string, number> = {};
  for (const op of map.ops) if (op.t === 'add') out[op.o.k] = (out[op.o.k] ?? 0) + 1;
  return out;
}

