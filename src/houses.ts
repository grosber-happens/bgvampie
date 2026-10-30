import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { Scene } from '@babylonjs/core/scene';
import '@babylonjs/loaders/glTF/2.0';
import houseUrl from './assets/house.glb?url';
import type { World } from './world';

/**
 * Load the house model once and place an instance in every house slot.
 * Collision boxes already exist, so the city is playable while this loads.
 */
export async function placeHouses(scene: Scene, world: World): Promise<number> {
  const container = await LoadAssetContainerAsync(houseUrl, scene, { pluginExtension: '.glb' });
  container.addAllToScene();
  const source = container.meshes.find((m): m is Mesh => m instanceof Mesh && m.getTotalVertices() > 0);
  if (!source) throw new Error('House model has no mesh');

  // Bake the glTF root transform (it flips handedness) into the mesh so instances can be placed directly.
  source.setParent(null);
  source.bakeCurrentTransformIntoVertices();
  for (const m of container.meshes) if (m !== source) m.dispose();
  source.isVisible = false;
  source.receiveShadows = true;

  world.houses.forEach((slot, i) => {
    const inst = source.createInstance(`house${i}`);
    inst.position.set(slot.x, slot.y, slot.z);
    inst.scaling.scaleInPlace(slot.scale);
    inst.rotationQuaternion = null;
    inst.rotation.y = slot.rotY;
    world.shadows.addShadowCaster(inst);
    inst.freezeWorldMatrix();
  });
  return world.houses.length;
}
