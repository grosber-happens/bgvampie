/**
 * Blender region assets with built-in LODs. A .glb from the Blender scripts holds one node per level,
 * named `<name>_LOD0`, `<name>_LOD1`, `<name>_LOD2` (near to far). This loads them as a LodModel that
 * the map view draws with thin instances and its own LOD bands (src/mapgen/stream.ts).
 */
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import { Matrix } from '@babylonjs/core/Maths/math.vector';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import type { LodModel } from './planner/build';
import '@babylonjs/loaders/glTF';

const LOD_NAME = /_LOD(\d)$/;

/**
 * Load one LOD model. `footprint` is the diameter in meters the model should cover at object size 1
 * (the map kind's footprint), so the model replaces the kit recipe at the same size.
 */
export async function loadLodModel(scene: Scene, url: string, footprint: number): Promise<LodModel> {
  const container = await LoadAssetContainerAsync(url, scene, { pluginExtension: '.glb' });
  container.addAllToScene();
  const lods: Mesh[][] = [[], [], []];
  let name = url;
  const nodes = [...container.transformNodes, ...container.meshes];
  for (const node of nodes) {
    const m = LOD_NAME.exec(node.name);
    if (!m) continue;
    const level = Math.min(2, Number(m[1]));
    name = node.name.replace(LOD_NAME, '');
    // Levels may sit side by side in the .blend for previews: move each back to the origin.
    node.computeWorldMatrix(true);
    const origin = node.getAbsolutePosition().clone();
    // Checked by class name: the glTF loader may come with its own copy of Mesh in dev builds.
    const parts = [node, ...node.getChildMeshes(false)].filter((p): p is Mesh => p.getClassName() === 'Mesh' && (p as Mesh).getTotalVertices() > 0);
    for (const part of parts) {
      part.computeWorldMatrix(true);
      part.setParent(null);
      part.bakeCurrentTransformIntoVertices();
      part.bakeTransformIntoVertices(Matrix.Translation(-origin.x, 0, -origin.z));
      part.setEnabled(false);
      part.isPickable = false;
      lods[level].push(part);
    }
  }
  // A missing level reuses the next nearer one.
  for (let l = 1; l < 3; l++) if (!lods[l].length) lods[l] = lods[l - 1];
  if (!lods[0].length) throw new Error(`${url}: no <name>_LOD0 node (found ${nodes.map((n) => n.name).join(', ')})`);
  let w = 0;
  for (const part of lods[0]) {
    const b = part.getBoundingInfo().boundingBox;
    w = Math.max(w, b.maximumWorld.x - b.minimumWorld.x, b.maximumWorld.z - b.minimumWorld.z);
  }
  return { name, lods, scale: w > 0 ? footprint / w : 1 };
}
