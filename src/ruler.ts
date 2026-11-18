/**
 * Scale ruler (M in a match): a pole marked every 0.5 m stands beside the player, with a red ring at the
 * character's height, and a line under the timer gives the numbers: character height, the free height over
 * the head (a door's height when you stand in its opening) and the nearest house's drawn scale.
 * So sizes are checked by measuring, not by eye.
 */
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { Scene } from '@babylonjs/core/scene';
import { kindScale } from './mapgen/generate';
import { t } from './i18n';
import type { SporPlaced } from './spor';
import { ceilingHeight, type Box } from './world';

export const RULER = {
  /** Pole height and band length (m). */
  height: 6,
  band: 0.5,
  /** Where the pole stands: this far to the player's right (m). */
  side: 1.1,
  /** A house counts as nearby within this many meters (times its scale). */
  near: 24,
};

type Who = { pos: Vector3; yaw: number; height: number; radius: number };

/** `look`: the character's drawn height (m), shown and marked by the red ring. */
export function createRuler(scene: Scene, boxes: Box[], label: HTMLElement, look: number) {
  const root = new TransformNode('ruler', scene);
  const mat = (hex: string) => {
    const m = new StandardMaterial(`ruler-${hex}`, scene);
    m.disableLighting = true;
    m.emissiveColor = Color3.FromHexString(hex);
    return m;
  };
  const light = mat('#f4efe2'), dark = mat('#2b2b33'), red = mat('#ff3b3b');
  for (let i = 0; i * RULER.band < RULER.height; i++) {
    const seg = MeshBuilder.CreateCylinder(`ruler-${i}`, { diameter: i % 2 ? 0.07 : 0.09, height: RULER.band, tessellation: 8 }, scene);
    seg.position.y = (i + 0.5) * RULER.band;
    seg.material = i % 2 ? light : dark;
    seg.parent = root;
  }
  const ring = MeshBuilder.CreateTorus('ruler-head', { diameter: 0.34, thickness: 0.04, tessellation: 16 }, scene);
  ring.material = red;
  ring.parent = root;
  for (const m of root.getChildMeshes()) m.isPickable = false;
  root.setEnabled(false);
  let on = false;
  let houses: SporPlaced[] = [];

  return {
    get on() {
      return on;
    },
    setHouses(list: SporPlaced[]) {
      houses = list.filter((h) => h.k.startsWith('ev_'));
    },
    toggle() {
      on = !on;
      root.setEnabled(on);
      label.classList.toggle('hidden', !on);
    },
    update(p: Who) {
      if (!on) return;
      const right = new Vector3(Math.cos(p.yaw), 0, -Math.sin(p.yaw));
      root.position.copyFrom(p.pos.add(right.scale(RULER.side)));
      ring.position.y = look;
      const c = ceilingHeight(p.pos, p.radius, p.height, boxes);
      const over = Number.isFinite(c) ? `${(c - p.pos.y).toFixed(2)} m` : '—';
      let house = '';
      let best = Infinity;
      for (const h of houses) {
        const d = Math.hypot(h.o.x - p.pos.x, h.o.z - p.pos.z);
        if (d < best && d < h.o.s * RULER.near) {
          best = d;
          const f = kindScale(h.k);
          house = t('rulerHouse', { k: h.k, s: h.o.s.toFixed(2), f: f.toFixed(2) });
        }
      }
      label.textContent = `${t('ruler', { h: look.toFixed(2), c: over })}${house ? ` · ${house}` : ''}`;
    },
  };
}
