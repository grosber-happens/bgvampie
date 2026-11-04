/**
 * Spor Ormanı and kasaba models made in Blender, packed by tools/assets/pack-spor.mjs. Each .glb holds
 * <name>_LOD0/1/2; some also hold parts that only show up close (enoki spores, the puffball's body and spore
 * cloud). Placed by hand in the map planner.
 */
import type { AnimationGroup } from '@babylonjs/core/Animations/animationGroup';
import type { AssetContainer } from '@babylonjs/core/assetContainer';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Scene } from '@babylonjs/core/scene';
import { SPOR_KINDS, baseHeight, sporInstanced, type Obj, type SporKind } from './mapgen/generate';
import type { World } from './world';
import { loadRegionModel } from './gltf';
import { loadLodModel } from './models';
import type { LodModel } from './planner/build';

const urls = import.meta.glob('./assets/spor/*.glb', { query: '?url', import: 'default', eager: true }) as Record<string, string>;
export const sporUrl = (k: string): string | undefined => urls[`./assets/spor/${k}.glb`];

/** Distances (m) where LOD1, LOD2 take over and where the model disappears. */
const LOD_AT = [45, 120, 450];
/** Bigger models stay longer: LOD distances grow with the footprint past this radius (m). */
const LOD_REF_R = 6;
const LOD_NAME = /_LOD(\d)$/;

/**
 * Spor Ormanı models as LodModels at their real size, for MapView.useModels: the planner draws every kind
 * this way; the game only the kinds that `only` keeps (the thin-instanced ones).
 */
export async function sporLodModels(scene: Scene, only: (k: SporKind) => boolean = () => true): Promise<[SporKind, LodModel][]> {
  return Promise.all(
    (Object.keys(SPOR_KINDS) as SporKind[]).filter(only).map(async (k) => {
      const m = await loadLodModel(scene, sporUrl(k)!, 1);
      return [k, { ...m, scale: 1 }] as [SporKind, LodModel];
    }),
  );
}

/** One full model in the world. */
export type SporPlaced = {
  o: Obj;
  k: SporKind;
  root: TransformNode;
  /** Ground the model stands on (lift included). */
  y: number;
  /** Clips by name (the puffball: nefes, patla, toparlan). */
  anims: Map<string, AnimationGroup>;
};

type Placed = SporPlaced & { levels: TransformNode[][]; at: number[]; level: number };

/**
 * Houses, bridges, landmarks and the animated kinds as full models. The level shown is picked by distance
 * every few frames: one group of nodes per level, so multi-material models switch as a whole.
 */
export async function placeSpor(scene: Scene, world: World): Promise<SporPlaced[]> {
  const objs = (world.mapObjects ?? []).filter((o) => o.k in SPOR_KINDS && !sporInstanced(o.k));
  if (!objs.length || !world.field) return [];
  const kinds = [...new Set(objs.map((o) => o.k as SporKind))];
  const containers = new Map<SporKind, AssetContainer>(await Promise.all(kinds.map(async (k) => [k, await loadRegionModel(sporUrl(k)!, scene)] as const)));
  const placed: Placed[] = [];
  for (const o of objs) {
    const k = o.k as SporKind;
    const n = placed.length;
    const inst = containers.get(k)!.instantiateModelsToScene((name) => `${name}#${n}`, false);
    // The glTF root keeps its own axis flip; a parent node places, turns and scales it.
    const root = new TransformNode(`${k}#${n}`, scene);
    const y = baseHeight(world.field, o);
    root.position.set(o.x, y, o.z);
    root.rotation.y = o.r;
    root.scaling.setAll(o.s);
    const glRoot = inst.rootNodes[0] as TransformNode;
    glRoot.parent = root;
    const levels: TransformNode[][] = [[], [], []];
    for (const node of glRoot.getChildren((c): c is TransformNode => c instanceof TransformNode, true)) {
      const base = node.name.replace(/#\d+$/, '');
      const m = LOD_NAME.exec(base);
      // LOD levels may sit side by side in the .blend: each goes back to the origin (the collision baker does the same).
      if (m) node.position.x = node.position.z = 0;
      levels[m ? Math.min(2, Number(m[1])) : 0].push(node);
    }
    for (let l = 1; l < 3; l++) if (!levels[l].length) levels[l] = levels[l - 1];
    for (const m of root.getChildMeshes(false)) {
      m.receiveShadows = true;
      m.isPickable = false;
    }
    for (const node of levels[0]) for (const m of [node, ...node.getChildMeshes(false)]) if (m instanceof Mesh && m.getTotalVertices() > 0) world.shadows.addShadowCaster(m);
    const far = Math.max(1, (SPOR_KINDS[k].r * o.s) / LOD_REF_R);
    const anims = new Map(inst.animationGroups.map((g) => [g.name.replace(/#\d+$/, ''), g] as const));
    for (const g of inst.animationGroups) g.stop();
    placed.push({ o, k, root, y, anims, levels, at: LOD_AT.map((d) => d * far), level: -1 });
  }
  let frame = 0;
  scene.onBeforeRenderObservable.add(() => {
    const cam = scene.activeCamera;
    if (!cam || frame++ % 6) return;
    const c = cam.globalPosition;
    for (const p of placed) {
      const d = Math.hypot(p.o.x - c.x, p.o.z - c.z);
      const level = d < p.at[0] ? 0 : d < p.at[1] ? 1 : d < p.at[2] ? 2 : 3;
      if (level === p.level) continue;
      p.level = level;
      const show = new Set(level < 3 ? p.levels[level] : []);
      for (const group of p.levels) for (const node of group) node.setEnabled(show.has(node));
    }
  });
  return placed;
}

/** Game maps: swap the planner stand-ins of thin-instanced Spor kinds for their Blender models once loaded. */
export async function useSporModels(scene: Scene, world: World): Promise<number> {
  const view = world.view;
  if (!view || !(world.mapObjects ?? []).some((o) => sporInstanced(o.k))) return 0;
  const list = await sporLodModels(scene, (k) => sporInstanced(k));
  for (const [k, m] of list) view.useModels(k, [m]);
  return list.length;
}
