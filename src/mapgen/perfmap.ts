/**
 * The performance test map (ROADMAP Faz 1): a full 4×4 km Harvest with denser objects than a
 * normal map, so chunk streaming, LOD and instancing are measured on the worst case.
 * Pure data, no Babylon. Play it with `?map=perf`, measure it on `perf.html`.
 */
import { DEFAULT_PARAMS, type MapFile } from './generate';

export const PERF_MAP: MapFile = {
  v: 1,
  gen: { ...DEFAULT_PARAMS, seed: 4040, size: 4000, trees: 1.3, mushrooms: 1.5, giants: 1.2, rocks: 1.3, dots: 1 },
  ops: [],
};

/**
 * The camera path for the measurement: a loop at head height that crosses Spor Ormanı (the densest
 * mushroom forest), the canyon in the middle and two other landscapes. Points are x, z in meters.
 */
export const PERF_PATH: [number, number][] = [
  [0, 1500], [300, 900], [150, 300], [0, 0], [-500, -200], [-1100, -700], [-600, -1300], [400, -900], [1200, -300], [900, 700], [0, 1500],
];
