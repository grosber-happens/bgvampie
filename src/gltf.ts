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
import { MaterialPluginBase } from '@babylonjs/core/Materials/materialPluginBase';
import { MaterialPluginManager } from '@babylonjs/core/Materials/materialPluginManager';
import { RegisterClass } from '@babylonjs/core/Misc/typeStore';
import { MeshoptCompression } from '@babylonjs/core/Meshes/Compression/meshoptCompression';
import type { Scene } from '@babylonjs/core/scene';
import '@babylonjs/loaders/glTF';
// The package exports map hides this file, so it is imported by path. It defines a global MeshoptDecoder.
import decoderUrl from '../node_modules/meshoptimizer/meshopt_decoder.cjs?url';
import paperUrl from './assets/spor/suluboya.jpg?url';

// The meshopt decoder ships with the game instead of coming from Babylon's CDN.
MeshoptCompression.Configuration.decoder.url = decoderUrl;

// The production build tree-shakes the plugin manager's static tables away (they are set beside the class
// in a side-effect-free file), and adding any plugin then fails: put them back.
const pluginTables = MaterialPluginManager as unknown as { _MaterialPluginClassToMainDefine?: Record<string, string>; _MaterialPluginCounter?: number };
pluginTables._MaterialPluginClassToMainDefine ??= {};
pluginTables._MaterialPluginCounter ??= 0;

const papers = new WeakMap<Scene, Texture>();

/** The shared paper texture (glTF textures are not flipped, so neither is this one). */
export function paperTexture(scene: Scene): Texture {
  let t = papers.get(scene);
  if (!t) {
    t = new Texture(paperUrl, scene, { invertY: false });
    t.name = 'suluboya';
    // Seen at grazing angles on walls and caps: keep the grain sharp instead of a blur.
    t.anisotropicFilteringLevel = 8;
    papers.set(scene, t);
  }
  return t;
}

/** Meters per paper tile, the same as the Blender box projection (doku.TILE). */
const PAPER_TILE = 2.4;

/**
 * The watercolor paper laid over painted materials by world position, like Blender's box projection
 * (boya.uv_box). The packed models carry no UVs (the packer drops them with the texture), so a plain
 * albedo texture would read one texel and the grain would be lost.
 */
class PaperPlugin extends MaterialPluginBase {
  private paper: Texture;
  // Takes only the material: cloning a material (creatures, actors) rebuilds its plugins by class name.
  constructor(material: PBRMaterial) {
    super(material, 'Paper', 200, { PAPER: false });
    this.paper = paperTexture(material.getScene());
    this._enable(true);
  }
  override prepareDefines(defines: Record<string, unknown>) {
    defines.PAPER = true;
  }
  override isReadyForSubMesh() {
    return this.paper.isReady();
  }
  override getClassName() {
    return 'PaperPlugin';
  }
  override getSamplers(samplers: string[]) {
    samplers.push('paperSampler');
  }
  override getUniforms() {
    return { ubo: [{ name: 'paperTile', size: 1, type: 'float' }], fragment: 'uniform float paperTile;' };
  }
  override bindForSubMesh(ubo: { updateFloat: (n: string, v: number) => void; setTexture: (n: string, t: Texture) => void }) {
    ubo.updateFloat('paperTile', 1 / PAPER_TILE);
    ubo.setTexture('paperSampler', this.paper);
  }
  override getCustomCode(shaderType: string) {
    if (shaderType !== 'fragment') return null;
    return {
      CUSTOM_FRAGMENT_DEFINITIONS: 'uniform sampler2D paperSampler;',
      // Three projections blended by the normal, each shifted so seams do not line up (as in boya.uv_box).
      CUSTOM_FRAGMENT_UPDATE_ALPHA: `
        {
          vec3 pw = vPositionW * paperTile;
          vec3 bw = pow(abs(normalW), vec3(4.0));
          bw /= (bw.x + bw.y + bw.z);
          vec3 px = texture2D(paperSampler, vec2(pw.z, pw.y) + vec2(0.0, 0.0)).rgb;
          vec3 py = texture2D(paperSampler, vec2(pw.x, pw.z) + vec2(0.71, 0.92)).rgb;
          vec3 pz = texture2D(paperSampler, vec2(pw.x, pw.y) + vec2(0.37, 0.48)).rgb;
          surfaceAlbedo *= toLinearSpace(px * bw.x + py * bw.y + pz * bw.z);
        }`,
    };
  }
}

/** A painted material from the packer? (extras tag, or the Blender paint material names.) */
function painted(m: Material): boolean {
  const extras = (m.metadata as { gltf?: { extras?: { suluboya?: number } } } | null)?.gltf?.extras;
  return !!extras?.suluboya || /^(spor|cimen)_vertex/.test(m.name);
}

RegisterClass('BABYLON.PaperPlugin', PaperPlugin);

const papered = new WeakSet<Material>();

/** Give painted materials the shared paper, projected by world position. */
export function paintMaterials(scene: Scene, materials: Material[]) {
  for (const m of materials) {
    if (!(m instanceof PBRMaterial) || m.albedoTexture || papered.has(m) || !painted(m)) continue;
    papered.add(m);
    new PaperPlugin(m);
  }
}

/** Load a packed region .glb into a container, with its paper texture in place. */
export async function loadRegionModel(url: string, scene: Scene): Promise<AssetContainer> {
  const c = await LoadAssetContainerAsync(url, scene, { pluginExtension: '.glb' });
  paintMaterials(scene, c.materials);
  return c;
}
