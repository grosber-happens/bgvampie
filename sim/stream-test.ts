/**
 * Checks the chunk streaming and LOD rules in src/mapgen/stream.ts (no Babylon):
 *   node --experimental-strip-types --no-warnings sim/stream-test.ts
 * A player walking back and forth across a band edge must not flicker between levels,
 * and a chunk between the load and unload radius must stay as it is.
 */
import { STREAM, lodFor, loadRadiusForFog, streamChunks, strideSteps, type Rect } from '../src/mapgen/stream.ts';

let fails = 0;
const check = (ok: boolean, what: string) => {
  if (!ok) fails++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
};

// LOD with hysteresis: pacing ±10 m around the 50 m band never changes the level once set.
const band = STREAM.objectBands[0];
let lod = lodFor(band - 5, -1, STREAM.objectBands);
let flips = 0;
for (let i = 0; i < 200; i++) {
  const d = band + (i % 2 ? 10 : -10);
  const next = lodFor(d, lod, STREAM.objectBands);
  if (next !== lod) flips++;
  lod = next;
}
check(flips === 0, `no LOD flicker pacing ±10 m around ${band} m (flips: ${flips})`);
check(lodFor(band + STREAM.hysteresis + 1, 0, STREAM.objectBands) === 1, 'LOD drops once past band + hysteresis');
check(lodFor(band - STREAM.hysteresis - 1, 1, STREAM.objectBands) === 0, 'LOD rises once inside band - hysteresis');
check(lodFor(5000, 0, STREAM.objectBands) === STREAM.objectBands.length, 'a far jump goes straight to the last level');

// Streaming radii: a chunk between load and unload keeps its state.
const chunk: Rect = { x0: 0, z0: 0, x1: 10, z1: 10 };
const mid = (STREAM.load + STREAM.unload) / 2;
check(streamChunks([chunk], () => false, -mid, 5, STREAM.load, STREAM.unload).load.length === 0, 'unloaded chunk between radii stays unloaded');
check(streamChunks([chunk], () => true, -mid, 5, STREAM.load, STREAM.unload).unload.length === 0, 'loaded chunk between radii stays loaded');
check(streamChunks([chunk], () => true, -STREAM.unload - 1, 5, STREAM.load, STREAM.unload).unload.length === 1, 'loaded chunk past unload radius is freed');
const near: Rect = { x0: 0, z0: 0, x1: 1, z1: 1 }, far: Rect = { x0: 100, z0: 0, x1: 101, z1: 1 };
check(streamChunks([far, near], () => false, 0, 0, 500).load[0] === near, 'loads come nearest first');

check(loadRadiusForFog(0.012) === STREAM.minLoad || loadRadiusForFog(0.012) > 150, 'default fog keeps a sane load radius');
check(loadRadiusForFog(0.0001) === STREAM.maxLoad, 'clear air is capped at maxLoad');
check(strideSteps(10, 4).join() === '0,4,8,10', 'terrain stride keeps the last grid point');

console.log(fails ? `${fails} failed` : 'all passed');
process.exit(fails ? 1 : 0);
