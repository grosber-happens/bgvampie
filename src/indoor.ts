/**
 * Indoors: the player is inside an enterable building when a ceiling of that building is close above
 * the head. The camera then moves in to a close over-the-shoulder view that fits the room (main.ts,
 * INDOOR_CAM); nothing of the building is cut away, you walk in with the character.
 */
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { enterable } from './interiors';
import type { SporPlaced } from './spor';
import { ceilingHeight, type Box } from './world';

export const INDOOR = {
  /** A ceiling counts when it is at most this far above the head (m). */
  reach: 5,
  /** A building is looked at when the player is within this many meters (times its scale) of it. */
  near: 14,
};

export function setupIndoor(placed: SporPlaced[], boxes: Box[]) {
  const houses = placed.filter((p) => enterable(p.k));
  let active: SporPlaced | null = null;
  let ceiling: number | null = null;
  const probe = new Vector3();
  return {
    /** The ceiling over the player while indoors, or null outdoors. */
    get ceiling(): number | null {
      return ceiling;
    },
    update(pos: Vector3, height: number) {
      active = null;
      ceiling = null;
      let best = Infinity;
      for (const h of houses) {
        const d = (h.o.x - pos.x) ** 2 + (h.o.z - pos.z) ** 2;
        const r = h.o.s * INDOOR.near;
        if (d < r * r && d < best) [best, active] = [d, h];
      }
      if (!active) return;
      probe.copyFrom(pos);
      const c = ceilingHeight(probe, 0.3, height, boxes);
      if (c <= pos.y + height + INDOOR.reach) ceiling = c;
    },
  };
}
