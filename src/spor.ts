/**
 * Spor Ormanı models made in Blender (tools/blender/*.py). Each .glb holds <name>_LOD0/1/2;
 * enoki clusters also hold <name>_spor (glowing spores). Placed by hand in the map planner.
 */
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Scene } from '@babylonjs/core/scene';
import '@babylonjs/loaders/glTF';
import { SPOR_KINDS, type SporKind } from './mapgen/generate';
import type { World } from './world';

const urls = import.meta.glob('./assets/spor/*.glb', { query: '?url', import: 'default', eager: true }) as Record<string, string>;

/** Distances (m) where LOD1, LOD2 take over and where the model disappears. */
const LOD_AT = [45, 120, 450];

export async function placeSpor(scene: Scene, world: World): Promise<number> {
  const objs = (world.mapObjects ?? []).filter((o) => o.k in SPOR_KINDS);
  if (!objs.length || !world.field) return 0;
  const kinds = [...new Set(objs.map((o) => o.k as SporKind))];
  const containers = new Map(
    await Promise.all(kinds.map(async (k) => [k, await LoadAssetContainerAsync(urls[`./assets/spor/${k}.glb`], scene, { pluginExtension: '.glb' })] as const)),
  );
  let n = 0;
  for (const o of objs) {
    const k = o.k as SporKind;
    const inst = containers.get(k)!.instantiateModelsToScene((name) => `${name}#${n}`, false);
    const root = inst.rootNodes[0] as TransformNode;
    root.position.set(o.x, world.field.height(o.x, o.z), o.z);
    root.rotationQuaternion = null;
    root.rotation.y = o.r;
    root.scaling.scaleInPlace(o.s);
    const meshes = root.getChildMeshes(false).filter((m): m is Mesh => m instanceof Mesh);
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
