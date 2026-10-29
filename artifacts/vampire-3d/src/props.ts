import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { Scene } from '@babylonjs/core/scene';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import '@babylonjs/loaders/glTF/2.0';
import urbanUrl from './assets/kenney/urban.glb?url';
import type { World } from './world';

/** Load the Kenney retro urban props and place an instance at every prop slot. */
export async function placeProps(scene: Scene, world: World): Promise<number> {
  const container = await LoadAssetContainerAsync(urbanUrl, scene, { pluginExtension: '.glb' });
  container.addAllToScene();
  // Pixel-art textures look right with nearest filtering.
  for (const t of container.textures) if (t instanceof Texture) t.updateSamplingMode(Texture.NEAREST_SAMPLINGMODE);

  const parts = new Map<string, Mesh[]>();
  for (const node of container.transformNodes) {
    if (!node.name.startsWith('prop-')) continue;
    const meshes = node.getChildMeshes(false).filter((m): m is Mesh => m instanceof Mesh && m.getTotalVertices() > 0);
    parts.set(node.name.slice(5), meshes);
  }
  // Bake every mesh into prop space (the prop's origin is its base center) so instances place directly.
  for (const meshes of parts.values()) {
    for (const m of meshes) {
      m.setParent(null);
      m.bakeCurrentTransformIntoVertices();
      m.isVisible = false;
      m.receiveShadows = true;
      m.isPickable = false;
    }
  }
  let count = 0;
  world.props.forEach((slot, i) => {
    for (const m of parts.get(slot.name) ?? []) {
      const inst = m.createInstance(`prop${i}-${m.name}`);
      inst.position.set(slot.x, slot.y, slot.z);
      inst.scaling.setAll(slot.scale);
      inst.rotationQuaternion = null;
      inst.rotation.y = slot.rotY;
      inst.isPickable = true;
      world.shadows.addShadowCaster(inst);
      inst.freezeWorldMatrix();
      count++;
    }
  });
  return count;
}
