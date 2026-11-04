/**
 * Indoors, the roof goes away: when the player stands under a ceiling inside an enterable building,
 * a clip plane cuts that building (and only that building) just below the ceiling, so the camera
 * sees into the room from above. The planner's interior designer cuts the same way.
 */
import { Plane } from '@babylonjs/core/Maths/math.plane';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import { enterable } from './interiors';
import type { SporPlaced } from './spor';
import { ceilingHeight, type Box } from './world';

export const ROOF = {
  /** A ceiling counts when it is at most this far above the head (m). */
  reach: 6,
  /** The cut sits this far under the ceiling (m). */
  under: 0.05,
};

export function setupRoofCut(scene: Scene, placed: SporPlaced[], boxes: Box[]) {
  const houses = placed.filter((p) => enterable(p.k));
  let active: SporPlaced | null = null;
  let plane: Plane | null = null;
  for (const h of houses) {
    for (const m of h.root.getChildMeshes()) {
      if (!(m instanceof Mesh)) continue;
      m.onBeforeRenderObservable.add(() => {
        if (active === h) scene.clipPlane = plane;
      });
      m.onAfterRenderObservable.add(() => {
        if (active === h) scene.clipPlane = null;
      });
    }
  }
  const probe = new Vector3();
  return {
    /** The height everything of the current building is cut at, or null outdoors. */
    get cut(): number | null {
      return active && plane ? -plane.d : null;
    },
    update(pos: Vector3, height: number) {
      active = null;
      if (!houses.length) return;
      let best = Infinity;
      for (const h of houses) {
        const d = (h.o.x - pos.x) ** 2 + (h.o.z - pos.z) ** 2;
        const r = h.o.s * 12;
        if (d < r * r && d < best) [best, active] = [d, h];
      }
      if (!active) return;
      probe.copyFrom(pos);
      const c = ceilingHeight(probe, 0.3, height, boxes);
      if (c > pos.y + height + ROOF.reach) {
        active = null;
        return;
      }
      plane = new Plane(0, 1, 0, -(c - ROOF.under));
    },
  };
}
