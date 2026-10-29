import { AnimationGroup } from '@babylonjs/core/Animations/animationGroup';
import { AssetContainer } from '@babylonjs/core/assetContainer';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { Scene } from '@babylonjs/core/scene';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import '@babylonjs/loaders/glTF/2.0';
import survivorUrl from './assets/kenney/survivor.glb?url';
import maleB from './assets/kenney/survivorMaleB.png?url';
import femaleA from './assets/kenney/survivorFemaleA.png?url';
import zombieA from './assets/kenney/zombieA.png?url';
import zombieC from './assets/kenney/zombieC.png?url';
import type { ActorBody } from './actors';
import type { World } from './world';

/** Kenney "Animated Characters: Survivors" (CC0): one rig, several skins, idle/run/jump. */
export const SKINS = { maleB, femaleA, zombieA, zombieC };
export type SkinName = keyof typeof SKINS;

/** Height of the model in its own units (measured in Blender). */
const MODEL_HEIGHT = 3.76;

let kit: AssetContainer | null = null;
const materials = new Map<string, PBRMaterial>();

export async function loadCharacterKit(scene: Scene) {
  kit = await LoadAssetContainerAsync(survivorUrl, scene, { pluginExtension: '.glb' });
}

export const kitReady = () => kit !== null;

export type Anim = 'idle' | 'run' | 'jump';

function skinMaterial(scene: Scene, skin: SkinName, tint: string, name: string): PBRMaterial {
  // Each unit gets its own material so a hit flash only lights that unit.
  const base = kit!.materials[0] as PBRMaterial;
  const m = base.clone(`${name}-skin`) as PBRMaterial;
  let tex = materials.get(skin)?.albedoTexture as Texture | undefined;
  if (!tex) {
    tex = new Texture(SKINS[skin], scene, false, false);
    const holder = new PBRMaterial(`tex-${skin}`, scene);
    holder.albedoTexture = tex;
    materials.set(skin, holder);
  }
  m.albedoTexture = tex;
  m.albedoColor = Color3.FromHexString(tint);
  // The exported material is alpha-masked with alpha 0; draw it opaque.
  m.transparencyMode = PBRMaterial.PBRMATERIAL_OPAQUE;
  m.alpha = 1;
  m.metallic = 0;
  m.roughness = 0.9;
  return m;
}

/**
 * A rigged, animated Kenney character inside an unscaled root (so the hp bar and
 * the weapon can be placed in metres). Returns an ActorBody like the placeholders.
 */
export function createCharacterBody(
  scene: Scene,
  world: World,
  name: string,
  skin: SkinName,
  opts: { tint?: string; height?: number; hpBar?: boolean; hpColor?: string } = {},
): ActorBody {
  const root = new TransformNode(name, scene);
  const height = opts.height ?? 1.8;
  const inst = kit!.instantiateModelsToScene((n) => `${name}-${n}`, false, { doNotInstantiate: true });
  const model = inst.rootNodes[0] as TransformNode;
  model.parent = root;
  model.scaling.scaleInPlace(height / MODEL_HEIGHT);
  const mat = skinMaterial(scene, skin, opts.tint ?? '#ffffff', name);
  const meshes: Mesh[] = [];
  for (const m of model.getChildMeshes(false)) {
    if (!(m instanceof Mesh)) continue;
    m.material = mat;
    m.receiveShadows = true;
    world.shadows.addShadowCaster(m);
    meshes.push(m);
  }
  const anims: Partial<Record<Anim, AnimationGroup>> = {};
  for (const g of inst.animationGroups) {
    g.stop();
    const key = g.name.replace(`${name}-`, '') as Anim;
    anims[key] = g;
  }
  let current: Anim | null = null;
  const play = (a: Anim, speed = 1) => {
    const g = anims[a];
    if (!g) return;
    g.speedRatio = speed;
    if (current === a) return;
    if (current) anims[current]?.stop();
    g.start(a !== 'jump', speed);
    current = a;
  };
  play('idle');

  let hpBar: Mesh | undefined;
  if (opts.hpBar) {
    hpBar = MeshBuilder.CreatePlane(`${name}-hp`, { width: 1, height: 0.1 }, scene);
    hpBar.parent = root;
    hpBar.position.y = height + 0.35;
    hpBar.billboardMode = Mesh.BILLBOARDMODE_ALL;
    hpBar.isPickable = false;
    const hpMat = new StandardMaterial(`${name}-hpmat`, scene);
    hpMat.emissiveColor = Color3.FromHexString(opts.hpColor ?? '#e0533f');
    hpMat.disableLighting = true;
    hpBar.material = hpMat;
  }
  return {
    root,
    meshes,
    bodyMat: mat,
    baseColor: mat.albedoColor.clone(),
    hpBar,
    play,
    dispose: () => {
      for (const g of inst.animationGroups) g.dispose();
      for (const s of inst.skeletons) s.dispose();
      mat.dispose();
    },
  };
}
