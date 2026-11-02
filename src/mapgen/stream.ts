/**
 * Chunk streaming and LOD decisions for big maps. Pure data, no Babylon: the game, the planner and
 * the sim (or a server) share the same rules. The map view in src/planner/build.ts does the drawing.
 *
 * Two rules keep things from flickering when the player stands on a border:
 * - Streaming has two radii. A chunk loads inside `load` and is freed only outside `unload`.
 * - LOD has a hysteresis band: a level changes only once the distance is `hysteresis` meters past a band.
 */

export const STREAM = {
  /** Object chunks load (are built and drawn) within this distance of the player, in meters. */
  load: 420,
  /** ...and are freed only beyond this one. Must be larger than `load`. */
  unload: 560,
  /** At most this many chunk builds per frame, nearest first, so walking never stalls a frame. */
  buildsPerFrame: 2,
  /** Load radius follows the fog: never closer than this... */
  minLoad: 220,
  /** ...nor farther than this. */
  maxLoad: 1100,
  /** Object LOD bands: LOD0 under 50 m, LOD1 under 150 m, LOD2 beyond. */
  objectBands: [50, 150],
  /** Parts smaller than this (meters, longest side) are skipped at each LOD; glowing parts always draw. */
  minPart: [0, 0.25, 0.6],
  /** Terrain LOD bands: full detail under 450 m, then every 2nd, 4th and 8th grid point. */
  terrainBands: [450, 1000, 1900],
  /** A level changes only this far past its band, in meters. */
  hysteresis: 25,
  /** Terrain skirts hang this far below chunk edges, hiding cracks between chunks of different detail. */
  skirt: 6,
};

/** Grid step for each terrain LOD. */
export const TERRAIN_STRIDE = [1, 2, 4, 8];

/** Axis-aligned square on the ground. */
export type Rect = { x0: number; z0: number; x1: number; z1: number };

/** Distance from a point to the nearest point of a rect (0 inside). */
export function rectDistance(r: Rect, x: number, z: number): number {
  const dx = Math.max(r.x0 - x, 0, x - r.x1);
  const dz = Math.max(r.z0 - z, 0, z - r.z1);
  return Math.hypot(dx, dz);
}

/**
 * LOD level for a distance. `current` is the level shown now (-1 when nothing is shown yet);
 * from there the level moves only once the distance is `hysteresis` past a band edge.
 */
export function lodFor(dist: number, current: number, bands: readonly number[], hysteresis = STREAM.hysteresis): number {
  if (current < 0) {
    let l = 0;
    while (l < bands.length && dist > bands[l]) l++;
    return l;
  }
  let l = Math.min(current, bands.length);
  while (l < bands.length && dist > bands[l] + hysteresis) l++;
  while (l > 0 && dist < bands[l - 1] - hysteresis) l--;
  return l;
}

/**
 * How far one sees through exponential-squared fog of this density, in meters (where less than
 * 2% of an object still shows). The load radius follows it, clamped to minLoad..maxLoad.
 */
export function loadRadiusForFog(density: number): number {
  const seen = density > 0 ? 2 / density : Infinity;
  return Math.max(STREAM.minLoad, Math.min(STREAM.maxLoad, seen * 1.15));
}

/** The unload radius for a load radius: same ratio as STREAM.unload / STREAM.load. */
export function unloadRadius(load: number): number {
  return load * (STREAM.unload / STREAM.load);
}

export type StreamChange<T> = { load: T[]; unload: T[] };

/**
 * Decide which chunks to load and free for a viewer at (x, z). `loaded` says whether a chunk is
 * loaded now. Loads come back nearest first, so a caller with a per-frame budget fills in from the
 * player outwards.
 */
export function streamChunks<T extends Rect>(chunks: readonly T[], loaded: (c: T) => boolean, x: number, z: number, load: number, unload = unloadRadius(load)): StreamChange<T> {
  const toLoad: [number, T][] = [];
  const toUnload: T[] = [];
  for (const c of chunks) {
    const d = rectDistance(c, x, z);
    const on = loaded(c);
    if (!on && d <= load) toLoad.push([d, c]);
    else if (on && d > unload) toUnload.push(c);
  }
  toLoad.sort((a, b) => a[0] - b[0]);
  return { load: toLoad.map((e) => e[1]), unload: toUnload };
}

/** Indices of grid points 0..cells kept at this stride (the last point always stays). */
export function strideSteps(cells: number, stride: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < cells; i += stride) out.push(i);
  out.push(cells);
  return out;
}
