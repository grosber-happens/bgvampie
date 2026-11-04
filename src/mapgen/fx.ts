/**
 * Effect regions of a map: how thick the air spores, the fog and the firefly swarms are at each point.
 * The planner paints them (circle regions or whole landscapes, each with its own percentages); the
 * planner's atmosphere and the game read the values where the camera or the player stands.
 * Pure data, no Babylon: the sim and tests can use it too.
 */

/** Shares of the map's base effect: 1 = 100%. */
export type FxValues = { spores: number; fog: number; fireflies: number };

/** A region: a circle with a soft rim, or every place where one landscape (BIOMES index) rules. */
export type FxZone = FxValues & ({ shape: 'circle'; x: number; z: number; r: number } | { shape: 'biome'; b: number });

/** `outside`: the values away from every region. Later regions win where regions overlap. */
export type MapFx = { outside: FxValues; zones: FxZone[] };

export const FX = {
  /** Outside the regions: no air spores, full fog, every firefly. Spores only where a region asks for them. */
  outside: { spores: 0, fog: 1, fireflies: 1 } as FxValues,
  /** What a new region starts with. */
  zone: { spores: 1, fog: 1, fireflies: 1 } as FxValues,
  /** New circle region radius (m), and the share of the radius that fades out at the rim. */
  radius: 60,
  rim: 0.3,
  /** Slider range for every share (0–300%). */
  max: 3,
  /** Seconds the game and planner take to ease into a region's values (no popping at the rim). */
  ease: 1.5,
};

export const defaultFx = (): MapFx => ({ outside: { ...FX.outside }, zones: [] });

/** Landscape weights at a point (Field.weights), for landscape regions. */
export type BiomeWeights = (x: number, z: number) => ArrayLike<number>;

/** Effect values at a point. */
export function fxAt(fx: MapFx | undefined, x: number, z: number, weights?: BiomeWeights, out: FxValues = { spores: 0, fog: 0, fireflies: 0 }): FxValues {
  const base = fx?.outside ?? FX.outside;
  out.spores = base.spores;
  out.fog = base.fog;
  out.fireflies = base.fireflies;
  if (!fx) return out;
  let w: ArrayLike<number> | null = null;
  for (const zone of fx.zones) {
    let k: number;
    if (zone.shape === 'circle') {
      const d = Math.hypot(x - zone.x, z - zone.z);
      if (d >= zone.r) continue;
      const inner = zone.r * (1 - FX.rim);
      k = d <= inner ? 1 : 1 - smooth((d - inner) / (zone.r - inner));
    } else {
      if (!weights) continue;
      w ??= weights(x, z);
      k = w[zone.b] ?? 0;
    }
    if (k <= 0) continue;
    out.spores += (zone.spores - out.spores) * k;
    out.fog += (zone.fog - out.fog) * k;
    out.fireflies += (zone.fireflies - out.fireflies) * k;
  }
  return out;
}

const smooth = (t: number) => t * t * (3 - 2 * t);

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Check an `fx` block from a map file. Returns undefined when it is missing or broken. */
export function parseFx(data: unknown, biomes: number): MapFx | undefined {
  if (typeof data !== 'object' || data === null) return undefined;
  const d = data as Record<string, unknown>;
  const vals = (v: unknown): FxValues | null => {
    const o = v as Record<string, unknown> | null;
    if (!o || !num(o.spores) || !num(o.fog) || !num(o.fireflies)) return null;
    return { spores: Math.max(0, o.spores), fog: Math.max(0, o.fog), fireflies: Math.max(0, o.fireflies) };
  };
  const outside = vals(d.outside);
  if (!outside || !Array.isArray(d.zones)) return undefined;
  const zones: FxZone[] = [];
  for (const z of d.zones as Record<string, unknown>[]) {
    const v = vals(z);
    if (!v) return undefined;
    if (z.shape === 'circle' && num(z.x) && num(z.z) && num(z.r) && z.r > 0) zones.push({ ...v, shape: 'circle', x: z.x, z: z.z, r: z.r });
    else if (z.shape === 'biome' && num(z.b) && z.b >= 0 && z.b < biomes) zones.push({ ...v, shape: 'biome', b: Math.floor(z.b) });
    else return undefined;
  }
  return { outside, zones };
}
