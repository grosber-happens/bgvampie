/**
 * Spor Ormanı creatures made in Blender (tools/blender/spor_dusman.py): the giant snail and the antlered
 * deer. Each .glb holds <name>_LOD0/1/2 skinned to one armature and three in-place clips:
 * bekle (idle), yuru (walk) and saldir (attack). The model faces +Z, like every game actor.
 * They replace the Kenney zombie and skeleton packs (ai.ts); numbers are in balance.ts MOB_SPECIES.
 */
import { AnimationGroup } from '@babylonjs/core/Animations/animationGroup';
import { AssetContainer } from '@babylonjs/core/assetContainer';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { Scene } from '@babylonjs/core/scene';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { loadRegionModel } from './gltf';
import snailUrl from './assets/dusman/dusman_salyangoz.glb?url';
import deerUrl from './assets/dusman/dusman_geyik.glb?url';
import { MOB_SPECIES, type MobSpecies } from './balance';
import type { ActorBody } from './actors';
import type { Anim } from './characters';
import type { World } from './world';

const FILES: Record<MobSpecies, { url: string; name: string }> = {
  salyangoz: { url: snailUrl, name: 'dusman_salyangoz' },
  geyik: { url: deerUrl, name: 'dusman_geyik' },
};

/** Distances (m) where LOD1 and LOD2 take over. Past the last one the creature keeps LOD2. */
const LOD_AT = [25, 60];

const kits: Partial<Record<MobSpecies, AssetContainer>> = {};

export async function loadCreatures(scene: Scene) {
  await Promise.all(
    (Object.keys(FILES) as MobSpecies[]).map(async (k) => {
      try {
        kits[k] = await loadRegionModel(FILES[k].url, scene);
      } catch (e) {
        console.error(`Creature ${k} failed to load`, e);
      }
    }),
  );
}

export const creatureReady = (k: MobSpecies) => !!kits[k];

/**
 * One animated creature inside an unscaled root. `scale` grows the model (and its hp bar height);
 * the gameplay capsule comes from MOB_SPECIES. play() maps the shared animation names to the clips:
 * idle → bekle, walk/run/sprint → yuru (sped up with the move speed), attack → saldir (plays once,
 * and nothing interrupts it until it ends).
 */
export function createCreatureBody(scene: Scene, world: World, name: string, species: MobSpecies, opts: { scale?: number; hpBar?: boolean; hpColor?: string } = {}): ActorBody {
  const kit = kits[species]!;
  const spec = MOB_SPECIES[species];
  const scale = opts.scale ?? 1;
  const root = new TransformNode(name, scene);
  const inst = kit.instantiateModelsToScene((n) => `${name}-${n}`, false, { doNotInstantiate: true });
  const model = inst.rootNodes[0] as TransformNode;
  model.parent = root;
  model.scaling.scaleInPlace(scale);

  const mats = new Map<PBRMaterial, PBRMaterial>();
  let bodyMat: PBRMaterial | null = null;
  const meshes: Mesh[] = [];
  const lods: (Mesh | undefined)[] = [];
  for (const m of model.getChildMeshes(false)) {
    if (!(m instanceof Mesh)) continue;
    // Each creature gets its own materials so a hit flash only lights that one.
    if (m.material instanceof PBRMaterial) {
      let own = mats.get(m.material);
      if (!own) {
        own = m.material.clone(`${name}-${m.material.name}`) as PBRMaterial;
        mats.set(m.material, own);
        if (!bodyMat && m.material.name.includes('vertex')) bodyMat = own;
      }
      m.material = own;
    }
    m.receiveShadows = true;
    meshes.push(m);
    const lod = /_LOD(\d)/.exec(m.name);
    if (lod) lods[Number(lod[1])] = m;
  }
  const [l0, l1, l2] = lods;
  if (l0) {
    if (l1) l0.addLODLevel(LOD_AT[0] * scale, l1);
    if (l2) l0.addLODLevel(LOD_AT[1] * scale, l2);
    world.shadows.addShadowCaster(l0);
  }
  const mat = bodyMat ?? [...mats.values()][0] ?? new PBRMaterial(`${name}-mat`, scene);

  const clips: Record<string, AnimationGroup> = {};
  for (const g of inst.animationGroups) {
    g.stop();
    clips[g.name.replace(`${name}-`, '').split('|').at(-1)!.toLowerCase()] = g;
  }
  let current: AnimationGroup | null = null;
  let attacking = false;
  const start = (g: AnimationGroup | undefined, loop: boolean, speed: number) => {
    if (!g) return;
    g.speedRatio = speed;
    if (current === g) return;
    current?.stop();
    g.start(loop, speed);
    current = g;
  };
  const play = (wanted: Anim, speed = 1, restart = false) => {
    if (wanted === 'attack') {
      const g = clips.saldir;
      if (!g) return;
      if (restart || current !== g) {
        current?.stop();
        current = null;
        attacking = true;
        g.onAnimationGroupEndObservable.addOnce(() => (attacking = false));
        start(g, false, speed);
      }
      return;
    }
    if (attacking) return;
    if (wanted === 'idle' || wanted === 'jump') start(clips.bekle, true, speed);
    // core.ts passes speed / 6 for runs; the walk clip should match the creature's own stride.
    else start(clips.yuru, true, Math.max(0.5, Math.min(2.5, (speed * 6) / spec.walkRef)));
  };
  play('idle');

  let hpBar: Mesh | undefined;
  if (opts.hpBar) {
    hpBar = MeshBuilder.CreatePlane(`${name}-hp`, { width: 1.4, height: 0.12 }, scene);
    hpBar.parent = root;
    hpBar.position.y = spec.height * scale + 0.5;
    hpBar.billboardMode = Mesh.BILLBOARDMODE_ALL;
    hpBar.isPickable = false;
    const hpMat = new StandardMaterial(`${name}-hpmat`, scene);
    hpMat.emissiveColor = Color3.FromHexString(opts.hpColor ?? '#e0a33f');
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
      for (const m of mats.values()) m.dispose();
    },
  };
}
