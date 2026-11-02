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
import hippoUrl from './assets/hippo.glb?url';
import skeletonUrl from './assets/skeleton.glb?url';
import maleB from './assets/kenney/survivorMaleB.png?url';
import femaleA from './assets/kenney/survivorFemaleA.png?url';
import zombieA from './assets/kenney/zombieA.png?url';
import zombieC from './assets/kenney/zombieC.png?url';
import type { ActorBody } from './actors';
import { clayify } from './look';
import type { World } from './world';

/** Kenney "Animated Characters: Survivors" (CC0): one rig, several skins, idle/run/jump. */
export const SKINS = { maleB, femaleA, zombieA, zombieC };
export type SkinName = keyof typeof SKINS;
export type Anim = 'idle' | 'walk' | 'run' | 'jump' | 'dash' | 'dash_mage' | 'dash_fighter' | 'dash_scout' | 'cartwheel' | 'sprint' | 'attack';

/**
 * Two rigged kits:
 * - survivor: Kenney survivors and zombies (bots, mobs, boss). Model is 3.76 units tall.
 * - hippo: the user's hippo character (the player), decimated and animated by tools/hippo_blender.py.
 */
const KITS = {
  survivor: { url: survivorUrl, height: 3.76 },
  hippo: { url: hippoUrl, height: 1.9 },
  skeleton: { url: skeletonUrl, height: 1.8 },
};
type KitName = keyof typeof KITS;
const kits: Partial<Record<KitName, AssetContainer>> = {};
const skinTextures = new Map<string, Texture>();

export async function loadCharacterKits(scene: Scene) {
  await Promise.all(
    (Object.keys(KITS) as KitName[]).map(async (k) => {
      try {
        kits[k] = await LoadAssetContainerAsync(KITS[k].url, scene, { pluginExtension: '.glb' });
      } catch (e) {
        console.error(`Character kit ${k} failed to load`, e);
      }
    }),
  );
}

export const kitReady = (k: KitName) => !!kits[k];

function survivorMaterial(scene: Scene, base: PBRMaterial, skin: SkinName, tint: string, name: string): PBRMaterial {
  const m = base.clone(`${name}-skin`) as PBRMaterial;
  let tex = skinTextures.get(skin);
  if (!tex) {
    tex = new Texture(SKINS[skin], scene, false, false);
    skinTextures.set(skin, tex);
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

type BodyOpts = { kit?: KitName; skin?: SkinName; tint?: string; height?: number; hpBar?: boolean; hpColor?: string };

/**
 * A rigged, animated character inside an unscaled root (so the hp bar and weapons are
 * placed in metres). Returns an ActorBody like the placeholders.
 */
export function createCharacterBody(scene: Scene, world: World, name: string, skinOrOpts: SkinName | BodyOpts, more: BodyOpts = {}): ActorBody {
  const opts: BodyOpts = typeof skinOrOpts === 'string' ? { ...more, skin: skinOrOpts } : skinOrOpts;
  const kitName = opts.kit ?? 'survivor';
  const kit = kits[kitName]!;
  const root = new TransformNode(name, scene);
  const height = opts.height ?? 1.8;
  const inst = kit.instantiateModelsToScene((n) => `${name}-${n}`, false, { doNotInstantiate: true });
  const model = inst.rootNodes[0] as TransformNode;
  model.parent = root;
  model.scaling.scaleInPlace(height / KITS[kitName].height);
  if (kitName === 'skeleton') {
    // This pack's rig uses its own scale and axis transforms. Normalize the visible model
    // to the same measured height as the gameplay capsule, then plant its feet at y=0.
    model.computeWorldMatrix(true);
    const bounds = model.getHierarchyBoundingVectors(true);
    const modelHeight = bounds.max.y - bounds.min.y;
    if (modelHeight > 0.01) {
      const correction = height / modelHeight;
      model.scaling.scaleInPlace(correction);
      model.position.y -= bounds.min.y * correction;
    }
  }

  // Each unit gets its own material so a hit flash only lights that unit.
  const base = kit.materials[0] as PBRMaterial;
  const materials = new Map<PBRMaterial, PBRMaterial>();
  const actorMaterials = new Set<PBRMaterial>();
  let mat: PBRMaterial | null = null;
  const meshes: Mesh[] = [];
  for (const m of model.getChildMeshes(false)) {
    if (!(m instanceof Mesh)) continue;
    const sourceMat = m.material instanceof PBRMaterial ? m.material : base;
    let actorMat = materials.get(sourceMat);
    if (!actorMat) {
      actorMat = kitName === 'survivor'
        ? survivorMaterial(scene, sourceMat, opts.skin ?? 'maleB', opts.tint ?? '#ffffff', `${name}-${sourceMat.name}`)
        : sourceMat.clone(`${name}-${sourceMat.name}`) as PBRMaterial;
      if (opts.tint && kitName !== 'survivor') actorMat.albedoColor = actorMat.albedoColor.multiply(Color3.FromHexString(opts.tint));
      clayify(actorMat);
      materials.set(sourceMat, actorMat);
      actorMaterials.add(actorMat);
    }
    m.material = actorMat;
    m.receiveShadows = true;
    world.shadows.addShadowCaster(m);
    meshes.push(m);
    if (!mat || m.name.toLowerCase().includes('skeleton')) mat = actorMat;
  }
  if (!mat) {
    mat = base.clone(`${name}-mat`) as PBRMaterial;
    actorMaterials.add(mat);
  }
  const anims: Partial<Record<Anim, AnimationGroup>> = {};
  for (const g of inst.animationGroups) {
    g.stop();
    const clip = g.name.split('|').at(-1)?.toLowerCase() ?? g.name.replace(`${name}-`, '').toLowerCase();
    if (['idle', 'walk', 'run', 'jump', 'dash', 'dash_mage', 'dash_fighter', 'dash_scout', 'cartwheel', 'sprint'].includes(clip)) {
      anims[clip as Anim] = g;
    }
  }
  let current: Anim | null = null;
  const play = (wanted: Anim, speed = 1, restart = false) => {
    // Survivors have no walk, dash, cartwheel or sprint: fall back to dash or run.
    const dashy = wanted.startsWith('dash') || wanted === 'cartwheel';
    const a: Anim = anims[wanted] ? wanted : dashy && anims.dash ? 'dash' : wanted === 'walk' || wanted === 'sprint' || dashy ? 'run' : wanted;
    const g = anims[a];
    if (!g) return;
    g.speedRatio = speed;
    if (current === a && !restart) return;
    if (current) anims[current]?.stop();
    g.start(a !== 'jump' && !a.startsWith('dash') && a !== 'cartwheel', speed);
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
      for (const actorMat of actorMaterials) actorMat.dispose();
    },
  };
}

/** The player's hippo body (also used for the player's decoys). */
export function createHippoBody(scene: Scene, world: World, name: string): ActorBody | null {
  if (!kits.hippo) return null;
  return createCharacterBody(scene, world, name, { kit: 'hippo', height: 1.9 });
}
