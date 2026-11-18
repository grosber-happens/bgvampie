/**
 * The map's effect regions in the game (mapgen/fx.ts): where the player stands sets how thick the fog and
 * the painted air spores are, easing in over a second or two so a region's rim never pops.
 */
import type { Scene } from '@babylonjs/core/scene';
import { FX, fxAt, type FxValues } from './mapgen/fx';
import { SPORE_FX, makeSporeCloud } from './sporfx';
import type { Atmosphere } from './planner/atmos';
import type { World } from './world';

/** Spor Ormanı pigments: rose madder and a pale mint. */
const SPORE_COLORS = ['#e98fc0', '#a8dcc8'];

export type RegionFx = { update(dt: number, x: number, z: number, y: number): void };

/** With an Atmosphere (planner maps) the region thickens its height fog; otherwise the scene's flat fog. */
export function setupRegionFx(scene: Scene, world: World, atmos: Atmosphere | null = null): RegionFx {
  const field = world.field;
  if (!field || !world.mapFile) return { update() {} };
  const file = world.mapFile;
  const baseFog = scene.fogDensity;
  const baseSpores = Number(file.atmos?.spores ?? 1);
  const weights = (x: number, z: number) => field.weights(x, z);
  const now: FxValues = fxAt(file.fx, 0, 0, weights);
  const want: FxValues = { ...now };
  // Smaller than the planner's cloud: the game only needs the air around the player.
  const spores = makeSporeCloud(scene, SPORE_COLORS, 1500);
  spores.minEmitBox.set(-45, 0, -45);
  spores.maxEmitBox.set(45, 18, 45);
  let t = 0;
  const apply = () => {
    if (atmos) atmos.setLocal({ ...now, spores: 0 });
    else scene.fogDensity = baseFog * now.fog;
    spores.emitRate = SPORE_FX.rate * 0.5 * baseSpores * now.spores;
  };
  apply();
  return {
    update(dt, x, z, y) {
      (spores.emitter as { set(x: number, y: number, z: number): void }).set(x, y - 3, z);
      t += dt;
      if (t > 0.25) {
        t = 0;
        fxAt(file.fx, x, z, weights, want);
      }
      const k = Math.min(1, dt / FX.ease);
      now.spores += (want.spores - now.spores) * k;
      now.fog += (want.fog - now.fog) * k;
      apply();
    },
  };
}
