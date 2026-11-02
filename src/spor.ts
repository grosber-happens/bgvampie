/**
 * Spor Ormanı models made in Blender (tools/blender/*.py). Each .glb holds <name>_LOD0/1/2;
 * enoki clusters also hold <name>_spor (glowing spores). Placed by hand in the map planner.
 */
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Scene } from '@babylonjs/core/scene';
import '@babylonjs/loaders/glTF';
import { SPOR_KINDS, baseHeight, sporInstanced, type SporKind } from './mapgen/generate';
import type { World } from './world';
import { loadLodModel } from './models';
import type { LodModel } from './planner/build';

const urls = import.meta.glob('./assets/spor/*.glb', { query: '?url', import: 'default', eager: true }) as Record<string, string>;

/** Distances (m) where LOD1, LOD2 take over and where the model disappears. */
const LOD_AT = [45, 120, 450];

/**
 * Spor Ormanı models as LodModels at their real size, for MapView.useModels: the planner draws every kind
 * this way; the game only the kinds that `only` keeps (the thin-instanced ones).
 */
export async function sporLodModels(scene: Scene, only: (k: SporKind) => boolean = () => true): Promise<[SporKind, LodModel][]> {
  return Promise.all(
    (Object.keys(SPOR_KINDS) as SporKind[]).filter(only).map(async (k) => {
      const m = await loadLodModel(scene, urls[`./assets/spor/${k}.glb`], 1);
      return [k, { ...m, scale: 1 }] as [SporKind, LodModel];
    }),
  );
}

export async function placeSpor(scene: Scene, world: World): Promise<number> {
  // Houses and bridges only: the rest is thin-instanced by the map view (see sporInstanced).
  const objs = (world.mapObjects ?? []).filter((o) => o.k in SPOR_KINDS && !sporInstanced(o.k));
  if (!objs.length || !world.field) return 0;
  const kinds = [...new Set(objs.map((o) => o.k as SporKind))];
  const containers = new Map(
    await Promise.all(kinds.map(async (k) => [k, await LoadAssetContainerAsync(urls[`./assets/spor/${k}.glb`], scene, { pluginExtension: '.glb' })] as const)),
  );
  let n = 0;
  for (const o of objs) {
    const k = o.k as SporKind;
    const inst = containers.get(k)!.instantiateModelsToScene((name) => `${name}#${n}`, false);
    // The glTF root keeps its own axis flip; a parent node places, turns and scales it.
    const place = new TransformNode(`${k}#${n}`, scene);
    place.position.set(o.x, baseHeight(world.field, o), o.z);
    place.rotation.y = o.r;
    place.scaling.setAll(o.s);
    (inst.rootNodes[0] as TransformNode).parent = place;
    const meshes = place.getChildMeshes(false).filter((m): m is Mesh => m instanceof Mesh);
    const lod = (i: number) => meshes.find((m) => m.name.startsWith(`${k}_LOD${i}#`));
    const [l0, l1, l2] = [lod(0), lod(1), lod(2)];
    if (l0) {
      if (l1) l0.addLODLevel(LOD_AT[0], l1);
      if (l2) l0.addLODLevel(LOD_AT[1], l2);
      l0.addLODLevel(LOD_AT[2], null);
    }
    for (const m of meshes) {
      m.receiveShadows = true;
      if (m === l0) world.shadows.addShadowCaster(m);
    }
    n++;
  }
  return n;
}

/** Game maps: swap the planner stand-ins of thin-instanced Spor kinds for their Blender models once loaded. */
export async function useSporModels(scene: Scene, world: World): Promise<number> {
  const view = world.view;
  if (!view || !(world.mapObjects ?? []).some((o) => sporInstanced(o.k))) return 0;
  const list = await sporLodModels(scene, (k) => sporInstanced(k));
  for (const [k, m] of list) view.useModels(k, [m]);
  return list.length;
}
