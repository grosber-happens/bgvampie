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
import type { MapFx } from './fx';
import type { Interiors } from './interior';

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
 * Spor Ormanı and kasaba Blender models (src/spor.ts, packed by tools/assets/pack-spor.mjs), placed by hand
 * in the planner, never scattered. r: planner footprint. group: planner palette group.
 * solid: 'baked' = walkable collision (floors, stairs, walls) from src/assets/spor/carpisma.json (tools/assets/bake-collision.mjs),
 * [half size, height] = one stem box, null = walk-through. A kind with a baked solid shape (bake-collision.mjs
 * SOLID: mushrooms, trees, camp kit, props) collides with that shape whatever this says. lift: floats this many meters over the ground.
 * full: always a full model (animated or walkable inside), never thin-instanced.
 */
export const SPOR_KINDS = {
  ev_kule: { name: 'Mantar ev: kule', cat: 'landmark', group: 'ev', r: 8.9, solid: 'baked' },
  ev_genis: { name: 'Mantar ev: geniş', cat: 'landmark', group: 'ev', r: 10.9, solid: 'baked' },
  ev_kulube: { name: 'Mantar ev: kulübe', cat: 'landmark', group: 'ev', r: 7.7, solid: 'baked' },
  ev_iki_kat: { name: 'Mantar ev: iki katlı', cat: 'landmark', group: 'ev', r: 6.8, solid: 'baked' },
  ev_uc_kat: { name: 'Mantar ev: üç katlı', cat: 'landmark', group: 'ev', r: 7.4, solid: 'baked' },
  ev_cam_kule: { name: 'Cam ev: kule', cat: 'landmark', group: 'ev', r: 6.1, solid: 'baked' },
  ev_cam_ikiz: { name: 'Cam ev: ikiz', cat: 'landmark', group: 'ev', r: 5.4, solid: 'baked' },
  ev_cam_genis: { name: 'Cam ev: geniş', cat: 'landmark', group: 'ev', r: 6.2, solid: 'baked' },
  ev_mozaik: { name: 'Gaudí ev: mozaik', cat: 'landmark', group: 'ev', r: 4.9, solid: 'baked' },
  ev_vitray: { name: 'Gaudí ev: vitray', cat: 'landmark', group: 'ev', r: 7.9, solid: 'baked' },
  kopru_tas: { name: 'Taş köprü', cat: 'ruins', group: 'kopru', r: 13.0, solid: 'baked' },
  kopru_tas_yikik: { name: 'Yıkık taş köprü', cat: 'ruins', group: 'kopru', r: 13.0, solid: 'baked' },
  kopru_ahsap: { name: 'Ahşap köprü', cat: 'ruins', group: 'kopru', r: 7.9, solid: 'baked' },
  kopru_gaudi_mozaik: { name: 'Gaudí köprü: mozaik', cat: 'ruins', group: 'kopru', r: 15.0, solid: 'baked' },
  kopru_gaudi_viyaduk: { name: 'Gaudí köprü: viyadük', cat: 'ruins', group: 'kopru', r: 13.0, solid: 'baked' },
  kopru_gecit_12: { name: 'Balkon köprüsü 12 m', cat: 'ruins', group: 'kopru', r: 6.2, solid: 'baked', full: true },
  kopru_gecit_20: { name: 'Balkon köprüsü 20 m', cat: 'ruins', group: 'kopru', r: 10.2, solid: 'baked', full: true },
  kopru_gecit_20_kat: { name: 'Balkon köprüsü 20 m, kat çıkan', cat: 'ruins', group: 'kopru', r: 10.1, solid: 'baked', full: true },
  kopru_gecit_28: { name: 'Balkon köprüsü 28 m', cat: 'ruins', group: 'kopru', r: 14.1, solid: 'baked', full: true },
  gecit_duz: { name: 'Miselyum geçit: düz', cat: 'ruins', group: 'anit', r: 5.1, solid: 'baked', full: true },
  gecit_kavis: { name: 'Miselyum geçit: kavis', cat: 'ruins', group: 'anit', r: 5.5, solid: 'baked', full: true },
  gecit_son: { name: 'Miselyum geçit: giriş', cat: 'ruins', group: 'anit', r: 5.4, solid: 'baked', full: true },
  heykel_mantar_kadin: { name: 'Mantar kadın heykeli', cat: 'landmark', group: 'anit', r: 5.7, solid: 'baked' },
  labirent_duvar_a: { name: 'Labirent duvarı A', cat: 'ruins', group: 'anit', r: 1.3, solid: 'baked' },
  labirent_duvar_b: { name: 'Labirent duvarı B', cat: 'ruins', group: 'anit', r: 1.3, solid: 'baked' },
  labirent_duvar_c: { name: 'Labirent duvarı C (ışıklı)', cat: 'ruins', group: 'anit', r: 1.3, solid: 'baked' },
  labirent_dugum_a: { name: 'Labirent direği A', cat: 'ruins', group: 'anit', r: 0.8, solid: 'baked' },
  labirent_dugum_b: { name: 'Labirent direği B', cat: 'ruins', group: 'anit', r: 0.9, solid: 'baked' },
  labirent_yol_a: { name: 'Labirent yolu A', cat: 'rocks', group: 'anit', r: 1.5, solid: null },
  labirent_yol_b: { name: 'Labirent yolu B', cat: 'rocks', group: 'anit', r: 1.5, solid: null },
  mantar_kumesi: { name: 'Dev mantar kümesi', cat: 'mushrooms', group: 'mantar', r: 14.1, solid: [2.0, 22] },
  mantar_kume_1: { name: 'Mantar kümesi 1', cat: 'mushrooms', group: 'mantar', r: 10.4, solid: [2.0, 22] },
  mantar_kume_2: { name: 'Mantar kümesi 2', cat: 'mushrooms', group: 'mantar', r: 5.7, solid: [1.4, 12] },
  mantar_kume_3: { name: 'Mantar kümesi 3', cat: 'mushrooms', group: 'mantar', r: 4.1, solid: [1.0, 8] },
  mantar_kume_4: { name: 'Mantar kümesi 4', cat: 'mushrooms', group: 'mantar', r: 2.8, solid: [0.6, 5] },
  mantar_kume_5: { name: 'Mantar kümesi 5', cat: 'mushrooms', group: 'mantar', r: 4.8, solid: [1.0, 7] },
  mantar_buyuk: { name: 'Büyük mantar', cat: 'mushrooms', group: 'mantar', r: 5.3, solid: [1.3, 12] },
  mantar_orta: { name: 'Orta mantar', cat: 'mushrooms', group: 'mantar', r: 2.7, solid: [0.7, 6] },
  mantar_kucuk: { name: 'Küçük mantar', cat: 'mushrooms', group: 'mantar', r: 1.2, solid: [0.3, 2.4] },
  mantar_semsiye: { name: 'Mor şemsiye mantar', cat: 'mushrooms', group: 'mantar', r: 0.3, solid: null },
  mantar_murekkep: { name: 'Mürekkep mantarı', cat: 'mushrooms', group: 'mantar', r: 0.3, solid: null },
  mantar_huni: { name: 'Altın huni mantar', cat: 'mushrooms', group: 'mantar', r: 0.3, solid: null },
  mantar_mercan: { name: 'Mercan mantar', cat: 'mushrooms', group: 'mantar', r: 0.3, solid: null },
  mantar_cin: { name: 'Kızıl cin mantarı', cat: 'mushrooms', group: 'mantar', r: 0.3, solid: null },
  mantar_mavi_patlak: { name: 'Mavi puf (patlar, can verir)', cat: 'mushrooms', group: 'mantar', r: 0.5, solid: null, full: true },
  enoki_buyuk: { name: 'Enoki (büyük)', cat: 'mushrooms', group: 'mantar', r: 0.4, solid: null },
  enoki_orta: { name: 'Enoki (orta)', cat: 'mushrooms', group: 'mantar', r: 0.3, solid: null },
  enoki_kucuk: { name: 'Enoki (küçük)', cat: 'mushrooms', group: 'mantar', r: 0.3, solid: null },
  enoki_seyrek: { name: 'Enoki (seyrek)', cat: 'mushrooms', group: 'mantar', r: 0.3, solid: null },
  kizil_filiz: { name: 'Kızıl filiz', cat: 'mushrooms', group: 'mantar', r: 0.8, solid: null },
  agac_isik_sogut: { name: 'Işık söğüdü', cat: 'trees', group: 'agac', r: 3.8, solid: [0.9, 6] },
  agac_tapinak: { name: 'Tapınak ağacı', cat: 'trees', group: 'agac', r: 13.6, solid: 'baked' },
  agac_gokkusagi: { name: 'Gökkuşağı ağacı', cat: 'trees', group: 'agac', r: 5.0, solid: [0.9, 6] },
  agac_masal_mesesi: { name: 'Masal meşesi', cat: 'trees', group: 'agac', r: 4.5, solid: [1.0, 6] },
  agac_yelpaze: { name: 'Yelpaze ağacı', cat: 'trees', group: 'agac', r: 4.4, solid: [0.6, 8] },
  agac_kizil_semsiye: { name: 'Kızıl şemsiye ağacı', cat: 'trees', group: 'agac', r: 4.8, solid: [0.7, 6] },
  agac_denizanasi: { name: 'Denizanası ağacı', cat: 'trees', group: 'agac', r: 3.0, solid: [0.7, 5] },
  agac_lingzhi: { name: 'Lingzhi ağacı (tırmanılır)', cat: 'trees', group: 'agac', r: 6.4, solid: 'baked' },
  agac_kehribar: { name: 'Kehribar ağacı', cat: 'trees', group: 'agac', r: 4.0, solid: [0.9, 6] },
  yosun_tumsek: { name: 'Yosun tümseği', cat: 'rocks', group: 'tas', r: 3.6, solid: null },
  tas_cakil: { name: 'Çakıl', cat: 'rocks', group: 'tas', r: 0.8, solid: null },
  tas_orta: { name: 'Orta taş', cat: 'rocks', group: 'tas', r: 1.2, solid: [0.9, 0.9] },
  tas_yassi: { name: 'Yassı taş', cat: 'rocks', group: 'tas', r: 1.6, solid: 'baked' },
  tas_buyuk: { name: 'Büyük taş', cat: 'rocks', group: 'tas', r: 2.5, solid: 'baked' },
  tas_dikili: { name: 'Dikili taş', cat: 'rocks', group: 'tas', r: 1.2, solid: 'baked' },
  tas_kaya: { name: 'Kaya', cat: 'rocks', group: 'tas', r: 3.5, solid: 'baked' },
  tas_dengeli: { name: 'Dengeli taşlar', cat: 'rocks', group: 'tas', r: 1.2, solid: 'baked' },
  tas_yarik: { name: 'Yarık kaya', cat: 'rocks', group: 'tas', r: 2.0, solid: 'baked' },
  tas_grup: { name: 'Taş grubu', cat: 'rocks', group: 'tas', r: 2.0, solid: 'baked' },
  tas_kemer: { name: 'Taş kemer', cat: 'rocks', group: 'tas', r: 2.8, solid: 'baked' },
  tas_sivri: { name: 'Sivri taşlar', cat: 'rocks', group: 'tas', r: 1.6, solid: 'baked' },
  blok_kesme: { name: 'Kesme blok', cat: 'ruins', group: 'tas', r: 0.9, solid: 'baked' },
  blok_yikik_duvar: { name: 'Yıkık duvar', cat: 'ruins', group: 'tas', r: 2.8, solid: 'baked' },
  ucan_blok_kucuk: { name: 'Uçan blok (küçük)', cat: 'rocks', group: 'ucan', r: 0.8, solid: 'baked', lift: 5 },
  ucan_blok_orta: { name: 'Uçan blok (orta)', cat: 'rocks', group: 'ucan', r: 1.6, solid: 'baked', lift: 7 },
  ucan_kaya: { name: 'Uçan kaya', cat: 'rocks', group: 'ucan', r: 1.5, solid: 'baked', lift: 6 },
  ucan_basamak: { name: 'Uçan basamaklar', cat: 'rocks', group: 'ucan', r: 3.5, solid: 'baked', lift: 4 },
  ucan_ikiz: { name: 'Uçan ikiz kaya', cat: 'rocks', group: 'ucan', r: 3.3, solid: 'baked', lift: 7 },
  ucan_ada: { name: 'Uçan ada', cat: 'rocks', group: 'ucan', r: 3.8, solid: 'baked', lift: 9 },
  ucan_sivri: { name: 'Uçan sivri kaya', cat: 'rocks', group: 'ucan', r: 2.6, solid: 'baked', lift: 13 },
  ucan_harabe: { name: 'Uçan harabe', cat: 'rocks', group: 'ucan', r: 3.2, solid: 'baked', lift: 9 },
  kamp_cadir: { name: 'Kamp çadırı (girilir)', cat: 'landmark', group: 'kamp', r: 5.2, solid: 'baked' },
  kamp_ates: { name: 'Kamp ateşi', cat: 'mech', group: 'kamp', r: 1.2, solid: [0.9, 0.5] },
  kurutma_cerceve: { name: 'Kurutma çerçevesi', cat: 'mech', group: 'kamp', r: 1.5, solid: null },
  kurutma_tepsi: { name: 'Kurutma tepsisi', cat: 'mech', group: 'kamp', r: 0.9, solid: null },
  mantar_dizisi: { name: 'Mantar dizisi (ip)', cat: 'mech', group: 'kamp', r: 1.5, solid: null },
  sepet_sirt: { name: 'Sırt sepeti', cat: 'mech', group: 'kamp', r: 0.3, solid: null },
  sepet_grubu: { name: 'Sepet grubu', cat: 'mech', group: 'kamp', r: 0.8, solid: null },
  kamp_tezgah: { name: 'Kamp tezgâhı', cat: 'mech', group: 'kamp', r: 0.8, solid: [0.9, 1.0] },
  kamp_araba: { name: 'Kamp arabası', cat: 'mech', group: 'kamp', r: 1.8, solid: [1.0, 1.6] },
  kamp_oturak: { name: 'Kütük oturak', cat: 'mech', group: 'kamp', r: 0.7, solid: null },
  kamp_fener: { name: 'Kamp feneri', cat: 'mech', group: 'kamp', r: 0.5, solid: null },
  kamp_kupler: { name: 'Küpler', cat: 'mech', group: 'kamp', r: 0.6, solid: null },
  lamba_sokak: { name: 'Sokak lambası', cat: 'mech', group: 'esya', r: 0.7, solid: [0.2, 3.5] },
  lamba_cift: { name: 'Çift lamba', cat: 'mech', group: 'esya', r: 1.0, solid: [0.2, 3.8] },
  lamba_bahce: { name: 'Bahçe lambası', cat: 'mech', group: 'esya', r: 0.4, solid: null },
  kasa: { name: 'Sandık', cat: 'mech', group: 'esya', r: 0.4, solid: [0.42, 0.8] },
  fici: { name: 'Fıçı', cat: 'mech', group: 'esya', r: 0.4, solid: [0.4, 0.95] },
  sepet_mantar: { name: 'Mantar sepeti', cat: 'mech', group: 'esya', r: 0.3, solid: null },
  tabela_ahsap: { name: 'Ahşap tabela', cat: 'mech', group: 'esya', r: 0.7, solid: null },
  kutuk: { name: 'Kütük', cat: 'mech', group: 'esya', r: 0.7, solid: [0.7, 0.9] },
  cit: { name: 'Çit', cat: 'mech', group: 'esya', r: 1.3, solid: null },
  odun_yigini: { name: 'Odun yığını', cat: 'mech', group: 'esya', r: 0.5, solid: [0.55, 0.8] },
  kavanoz_ates: { name: 'Ateş böceği kavanozu', cat: 'mech', group: 'esya', r: 0.3, solid: null },
} as const satisfies Record<string, SporDef>;
type SporDef = { name: string; cat: Category; group: SporGroup; r: number; solid: 'baked' | readonly [number, number] | null; lift?: number; full?: boolean };
export type SporGroup = 'ev' | 'kopru' | 'anit' | 'mantar' | 'agac' | 'tas' | 'ucan' | 'kamp' | 'esya';
const sporDef = (k: string): SporDef | undefined => (SPOR_KINDS as Record<string, SporDef>)[k];
export type SporKind = keyof typeof SPOR_KINDS;

/**
 * Ground height an object stands on. Bridges rest on their banks: the lower of the two ground heights
 * near the span ends (the model's x axis), so a bridge over a creek never sinks to the creek bed.
 * Everything else stands on the ground at its center.
 */
export function baseHeight(field: Field, o: Obj): number {
  if (!o.k.startsWith('kopru_')) return field.height(o.x, o.z) + (sporDef(o.k)?.lift ?? 0);
  const d = SPOR_KINDS[o.k as SporKind].r * 0.85 * o.s;
  const c = Math.cos(o.r) * d, sn = Math.sin(o.r) * d;
  return Math.min(field.height(o.x + c, o.z - sn), field.height(o.x - c, o.z + sn));
}

/**
 * Spor kinds drawn with thin instances and streamed like the kit objects (mushrooms, rocks, props, maze pieces).
 * Houses, bridges, landmarks and `full` kinds are few, walkable or animated, so spor.ts places them as full models.
 */
export const sporInstanced = (k: string): boolean => {
  const d = sporDef(k);
  return !!d && !d.full && d.cat !== 'landmark' && d.group !== 'ev' && d.group !== 'kopru';
};

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

/** Editing numbers for the planner and map loading. */
export const EDIT = {
  /** Grid cell for finding hand edits and objects near a point, in meters. */
  cell: 16,
  /** Undo steps the planner keeps. */
  undoSteps: 120,
  /** An undo that touches more areas than this redraws the whole map instead (one pass beats thousands of small ones). */
  undoMaxAreas: 400,
  /** WASD flying keeps its height; it climbs only to keep the planner camera this far above the ground, in meters. */
  flyClearance: 3,
};
const cellOf = (v: number) => Math.floor(v / EDIT.cell);
/** One number per grid cell; fine for maps up to ~500 km. */
const cellKey = (i: number, j: number) => (i + 32768) * 65536 + (j + 32768);

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
  /** Hand lifts by grid cell (EDIT.cell meters), in op order, so a height sample only visits nearby lifts. */
  private liftGrid = new Map<number, Extract<Op, { t: 'lift' }>[]>();
  private flat: { x: number; z: number; r: number; h: number }[] = [];
  /** Scratch distances for weights(), one per site. */
  private ds = new Float64Array(NB + 1);

  constructor(p: Params, ops: Op[] = []) {
    this.p = p;
    for (const o of ops) {
      if (o.t !== 'lift') continue;
      // A lift reaches 2r (see rawHeight); file it under every cell that reach overlaps.
      const reach = o.r * 2;
      const i0 = cellOf(o.x - reach), i1 = cellOf(o.x + reach), j0 = cellOf(o.z - reach), j1 = cellOf(o.z + reach);
      for (let j = j0; j <= j1; j++)
        for (let i = i0; i <= i1; i++) {
          const key = cellKey(i, j);
          const list = this.liftGrid.get(key);
          if (list) list.push(o);
          else this.liftGrid.set(key, [o]);
        }
    }
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
    const lifts = this.liftGrid.get(cellKey(cellOf(x0), cellOf(z0)));
    if (lifts) for (const l of lifts) {
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
  if (!ops.length) return objs.slice();
  // Objects by grid cell, so an erase or a move only looks at its neighbourhood instead of the whole map.
  // Same result as walking the list for every op: erase drops every object in reach at that point,
  // move takes the first match in list order, adds go to the end.
  const list = objs.slice();
  const alive = new Uint8Array(list.length + ops.length).fill(1);
  const grid = new Map<number, number[]>();
  const put = (i: number) => {
    const key = cellKey(cellOf(list[i].x), cellOf(list[i].z));
    const cell = grid.get(key);
    if (cell) cell.push(i);
    else grid.set(key, [i]);
  };
  const near = (x: number, z: number, r: number, fn: (i: number) => void) => {
    const i0 = cellOf(x - r), i1 = cellOf(x + r), j0 = cellOf(z - r), j1 = cellOf(z + r);
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const cell = grid.get(cellKey(i, j));
        if (cell) for (const k of cell) if (alive[k]) fn(k);
      }
  };
  for (let i = 0; i < list.length; i++) put(i);
  for (const op of ops) {
    if (op.t === 'add') {
      list.push(op.o);
      put(list.length - 1);
    } else if (op.t === 'erase') {
      near(op.x, op.z, op.r, (k) => {
        const o = list[k];
        if ((o.x - op.x) ** 2 + (o.z - op.z) ** 2 <= op.r * op.r) alive[k] = 0;
      });
    } else if (op.t === 'move') {
      let best = -1;
      near(op.x, op.z, MOVE_EPS, (k) => {
        const o = list[k];
        if ((best < 0 || k < best) && o.k === op.k && Math.abs(o.x - op.x) < MOVE_EPS && Math.abs(o.z - op.z) < MOVE_EPS) best = k;
      });
      if (best < 0) continue;
      // Move it in place (it keeps its spot in the list) and refile it under its new cell.
      const was = grid.get(cellKey(cellOf(list[best].x), cellOf(list[best].z)))!;
      was.splice(was.indexOf(best), 1);
      list[best] = { ...list[best], x: op.nx, z: op.nz, s: op.ns ?? list[best].s };
      put(best);
    }
  }
  return list.filter((_, i) => alive[i]);
}

/** How close a move op's (x, z) must be to the object it moves, in meters. */
const MOVE_EPS = 0.05;

/**
 * Saved map file (planner export, and what the game loads). fx: effect regions (mapgen/fx.ts).
 * interiors: furniture layouts for enterable buildings (mapgen/interior.ts).
 */
export type MapFile = { v: 1; gen: Params; ops: Op[]; atmos?: Record<string, number | string | boolean>; fx?: MapFx; interiors?: Interiors };
