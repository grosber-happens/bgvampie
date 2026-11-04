/**
 * Interior props (src/assets/spor/ic, Spor Ormanı and Gaudí furniture) drawn in the buildings that have a
 * layout (mapgen/interior.ts). One thin-instance batch per prop part, so a town full of furnished houses
 * costs a few draw calls. The game furnishes the map's buildings once; the planner's interior designer
 * redraws as you edit.
 */
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import '@babylonjs/core/Meshes/thinInstanceMesh';
import type { Scene } from '@babylonjs/core/scene';
import { SPOR_KINDS, baseHeight } from './mapgen/generate';
import { furnToWorld, layoutFor } from './mapgen/interior';
import { loadLodModel } from './models';
import type { LodModel } from './planner/build';
import type { Box, World } from './world';
import icData from './assets/spor/ic/ic.json';

const urls = import.meta.glob('./assets/spor/ic/*.glb', { query: '?url', import: 'default', eager: true }) as Record<string, string>;

export type PropSize = { w: number; d: number; h: number; top: number | null };
/** Measured by tools/assets/bake-interior.mjs: floors (and each floor's middle) per enterable building, sizes per prop. */
export const IC = icData as unknown as { floors: Record<string, number[]>; centers: Record<string, [number, number][]>; props: Record<string, PropSize> };
export const PROP_NAMES = Object.keys(IC.props).filter((k) => urls[`./assets/spor/ic/${k}.glb`]);

/** Buildings the interior designer opens. */
export const enterable = (k: string) => k in IC.floors;

/** A prop placed in the world. */
export type Placed = { k: string; x: number; y: number; z: number; r: number; s: number };

export class InteriorView {
  private models = new Map<string, Promise<LodModel>>();
  private batches = new Map<string, Mesh[]>();
  private version = 0;
  onCasters: (meshes: Mesh[]) => void = () => {};

  constructor(private scene: Scene) {}

  private model(k: string): Promise<LodModel> {
    let m = this.models.get(k);
    if (!m) this.models.set(k, (m = loadLodModel(this.scene, urls[`./assets/spor/ic/${k}.glb`], 1)));
    return m;
  }

  /** Draw exactly these props (replacing what was drawn). */
  async set(list: Placed[]): Promise<void> {
    const v = ++this.version;
    const byKind = new Map<string, Placed[]>();
    for (const p of list) {
      if (!urls[`./assets/spor/ic/${p.k}.glb`]) continue;
      let arr = byKind.get(p.k);
      if (!arr) byKind.set(p.k, (arr = []));
      arr.push(p);
    }
    const loaded = await Promise.all([...byKind.keys()].map(async (k) => [k, await this.model(k)] as const));
    if (v !== this.version) return; // a newer set() is on its way
    for (const [k, meshes] of this.batches) if (!byKind.has(k)) meshes.forEach((m) => m.setEnabled(false));
    const tmp = new Matrix();
    for (const [k, model] of loaded) {
      const items = byKind.get(k)!;
      let meshes = this.batches.get(k);
      if (!meshes) {
        meshes = model.lods[0].map((part, i) => {
          const m = part.clone(`ic-${k}-${i}`, null, true, false) as Mesh;
          m.makeGeometryUnique();
          m.isPickable = false;
          m.receiveShadows = true;
          m.alwaysSelectAsActiveMesh = true;
          return m;
        });
        this.batches.set(k, meshes);
        this.onCasters(meshes);
      }
      const buf = new Float32Array(items.length * 16);
      items.forEach((p, i) => {
        Matrix.ComposeToRef(new Vector3(p.s, p.s, p.s), Quaternion.RotationYawPitchRoll(p.r, 0, 0), new Vector3(p.x, p.y, p.z), tmp);
        tmp.copyToArray(buf, i * 16);
      });
      for (const m of meshes) {
        m.setEnabled(true);
        m.thinInstanceSetBuffer('matrix', buf, 16, false);
      }
    }
  }
}

/** Every furnished building's props in world space (the map's templates and per-house overrides). */
export function placedProps(world: Pick<World, 'field' | 'mapObjects' | 'mapFile'>): Placed[] {
  const ints = world.mapFile?.interiors;
  if (!ints || !world.field) return [];
  const out: Placed[] = [];
  for (const o of world.mapObjects ?? []) {
    if (!(o.k in SPOR_KINDS) || !enterable(o.k)) continue;
    const list = layoutFor(ints, o);
    if (!list.length) continue;
    const y = baseHeight(world.field, o);
    for (const f of list) out.push({ k: f.k, ...furnToWorld(o, y, f) });
  }
  return out;
}

/** Rugs and thin things you walk over; everything else is a solid box. */
const WALK_OVER = 0.12;

/** Collision boxes for props (axis-aligned around each prop's turned footprint). */
export function propBoxes(list: Placed[]): Box[] {
  const out: Box[] = [];
  for (const p of list) {
    const size = IC.props[p.k];
    if (!size || size.h < WALK_OVER) continue;
    const c = Math.abs(Math.cos(p.r)), sn = Math.abs(Math.sin(p.r));
    const hw = (size.w / 2) * p.s, hd = (size.d / 2) * p.s;
    out.push({ x: p.x, z: p.z, hw: c * hw + sn * hd, hd: sn * hw + c * hd, y0: p.y, y1: p.y + size.h * p.s });
  }
  return out;
}

/** Game: furnish every building that has a layout. Boxes go in at once; the models arrive when loaded. */
export async function furnishInteriors(scene: Scene, world: World): Promise<number> {
  const list = placedProps(world);
  if (!list.length) return 0;
  world.boxes.push(...propBoxes(list));
  const view = new InteriorView(scene);
  view.onCasters = (meshes) => meshes.forEach((m) => world.shadows.addShadowCaster(m));
  await view.set(list);
  return list.length;
}
