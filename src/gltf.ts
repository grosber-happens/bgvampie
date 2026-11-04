/**
 * Loading the packed region models (tools/assets/pack-spor.mjs): meshopt-compressed .glb files whose
 * painted materials share one watercolor paper texture. The packer takes the texture out of every file
 * and tags those materials `extras.suluboya`; this puts one shared copy back.
 */
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import type { AssetContainer } from '@babylonjs/core/assetContainer';
import type { Material } from '@babylonjs/core/Materials/material';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { MeshoptCompression } from '@babylonjs/core/Meshes/Compression/meshoptCompression';
import type { Scene } from '@babylonjs/core/scene';
import '@babylonjs/loaders/glTF';
// The package exports map hides this file, so it is imported by path. It defines a global MeshoptDecoder.
import decoderUrl from '../node_modules/meshoptimizer/meshopt_decoder.cjs?url';
import paperUrl from './assets/spor/suluboya.jpg?url';

// The meshopt decoder ships with the game instead of coming from Babylon's CDN.
MeshoptCompression.Configuration.decoder.url = decoderUrl;

const papers = new WeakMap<Scene, Texture>();

/** The shared paper texture (glTF textures are not flipped, so neither is this one). */
export function paperTexture(scene: Scene): Texture {
  let t = papers.get(scene);
  if (!t) {
    t = new Texture(paperUrl, scene, { invertY: false });
    t.name = 'suluboya';
    papers.set(scene, t);
  }
  return t;
}

/** A painted material from the packer? (extras tag, or the Blender paint material names.) */
function painted(m: Material): boolean {
  const extras = (m.metadata as { gltf?: { extras?: { suluboya?: number } } } | null)?.gltf?.extras;
  return !!extras?.suluboya || /^(spor|cimen)_vertex/.test(m.name);
}

/** Give painted materials the shared paper texture. */
export function paintMaterials(scene: Scene, materials: Material[]) {
  for (const m of materials) if (m instanceof PBRMaterial && !m.albedoTexture && painted(m)) m.albedoTexture = paperTexture(scene);
}

/** Load a packed region .glb into a container, with its paper texture in place. */
export async function loadRegionModel(url: string, scene: Scene): Promise<AssetContainer> {
  const c = await LoadAssetContainerAsync(url, scene, { pluginExtension: '.glb' });
  paintMaterials(scene, c.materials);
  return c;
}
