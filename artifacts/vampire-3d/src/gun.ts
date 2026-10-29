import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { Scene } from '@babylonjs/core/scene';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import '@babylonjs/loaders/glTF/2.0';
import gunUrl from './assets/gun.glb?url';
import type { World } from './world';

/** The gun model is about 1.9 units long and 1.25 tall (a pistol); this makes it about 0.38 m in the hand. */
export const GUN = { scale: 0.2, offset: { x: 0.42, y: 0.95, z: 0.3 }, yaw: 0 };

/** Load the user's gun model and attach it to the player's right side. Returns the mesh. */
export async function attachGun(scene: Scene, world: World, parent: TransformNode): Promise<Mesh> {
  const container = await LoadAssetContainerAsync(gunUrl, scene, { pluginExtension: '.glb' });
  container.addAllToScene();
  const gun = container.meshes.find((m): m is Mesh => m instanceof Mesh && m.getTotalVertices() > 0);
  if (!gun) throw new Error('Gun model has no mesh');
  gun.setParent(null);
  gun.bakeCurrentTransformIntoVertices();
  for (const m of container.meshes) if (m !== gun) m.dispose();

  gun.parent = parent;
  gun.rotationQuaternion = null;
  gun.scaling.setAll(GUN.scale);
  gun.position.set(GUN.offset.x, GUN.offset.y, GUN.offset.z);
  gun.rotation.y = GUN.yaw;
  gun.isPickable = false;
  world.shadows.addShadowCaster(gun);
  return gun;
}
