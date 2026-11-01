import { SceneLoader } from '@babylonjs/core/Loading/sceneLoader';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { Scene } from '@babylonjs/core/scene';
import { Field, type Obj } from './mapgen/generate';
import bushesUrl from './assets/nature/bush.glb?url';
import deadTreesUrl from './assets/nature/dead-tree.glb?url';
import pineUrl from './assets/nature/pine.glb?url';
import rocksUrl from './assets/nature/rock.glb?url';
import treesUrl from './assets/nature/tree.glb?url';

import '@babylonjs/loaders/glTF';

type AssetKind = 'tree' | 'pine' | 'dead' | 'rock' | 'bush';
const ASSETS: Record<AssetKind, { url: string; height: number }> = {
  tree: { url: treesUrl, height: 5.2 },
  pine: { url: pineUrl, height: 7 },
  dead: { url: deadTreesUrl, height: 6.5 },
  rock: { url: rocksUrl, height: 2.2 },
  bush: { url: bushesUrl, height: 1.8 },
};

/** Load a handful of CC0 nature models and use them as lightweight scenery on the authored map. */
export async function placeNatureAssets(scene: Scene, field: Field, objects: Obj[]): Promise<number> {
  const templates = new Map<AssetKind, Mesh[]>();
  const loaded = await Promise.all(
    (Object.entries(ASSETS) as [AssetKind, (typeof ASSETS)[AssetKind]][]).map(async ([kind, asset]) =>
      [kind, await SceneLoader.ImportMeshAsync('', asset.url, '', scene)] as const,
    ),
  );
  for (const [kind, imported] of loaded) {
    const variants = imported.meshes.filter((mesh): mesh is Mesh => mesh instanceof Mesh && mesh.getTotalVertices() > 0);
    for (const mesh of variants) {
      mesh.computeWorldMatrix(true);
      mesh.setEnabled(false);
    }
    templates.set(kind, variants);
  }

  const picks: { kind: AssetKind; obj: Obj; height: number }[] = [];
  for (const obj of objects) {
    let kind: AssetKind | undefined;
    if ((obj.k === 'agac' || obj.k === 'moebius') && obj.v % 3 !== 1) kind = obj.k === 'moebius' ? 'dead' : obj.v % 4 === 0 ? 'bush' : 'tree';
    else if (obj.k === 'cam' && obj.v % 2 === 0) kind = 'pine';
    else if ((obj.k === 'kaya' || obj.k === 'yosun') && obj.v % 3 === 0) kind = 'rock';
    if (kind) picks.push({ kind, obj, height: ASSETS[kind].height });
  }

  // Put an upper bound on extra draw calls on dense maps; existing thin instances remain intact.
  const stride = Math.max(1, Math.ceil(picks.length / 110));
  let placed = 0;
  for (let i = 0; i < picks.length; i += stride) {
    const { kind, obj, height } = picks[i];
    const variants = templates.get(kind);
    if (!variants?.length) continue;
    const source = variants[Math.abs(obj.v) % variants.length];
    const clone = source.clone(`nature-${kind}-${placed}`, null, false);
    if (!clone) continue;
    clone.parent = null;
    clone.setEnabled(true);
    clone.rotationQuaternion = null;
    clone.rotation.set(0, (obj.v * 2.399963) % (Math.PI * 2), 0);
    clone.position.set(obj.x, field.height(obj.x, obj.z), obj.z);
    clone.scaling.copyFrom(source.scaling);
    source.computeWorldMatrix(true);
    const sourceHeight = source.getBoundingInfo().boundingBox.extendSizeWorld.y * 2;
    if (sourceHeight > 0.001) clone.scaling.scaleInPlace(height / sourceHeight);
    clone.receiveShadows = false;
    clone.isPickable = false;
    clone.computeWorldMatrix(true);
    placed++;
  }

  // Imported preview variants sit side-by-side in their source GLBs. Keep only their reusable geometry.
  for (const variants of templates.values()) for (const mesh of variants) mesh.dispose(false, false);
  return placed;
}
