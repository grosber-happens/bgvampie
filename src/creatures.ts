/**
 * Spor Ormanı creatures made in Blender (regions/spor-ormani/scriptler/spor_dusman.py in the project
 * files, packed by tools/assets/pack-spor.mjs): the giant snail and the antlered deer. Each .glb holds
 * <name>_LOD0/1/2 skinned to one armature and six in-place clips: bekle (idle), yuru (walk), kos (run),
 * saldir (attack), darbe (hit) and olum (death). The model faces +Z, like every game actor.
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
import { CORPSE, MOB_SPECIES, type MobSpecies } from './balance';
import type { ActorBody } from './actors';
import type { Anim } from './characters';
import type { World } from './world';

const FILES: Record<MobSpecies, { url: string; name: string }> = {
  salyangoz: { url: snailUrl, name: 'dusman_salyangoz' },
  geyik: { url: deerUrl, name: 'dusman_geyik' },
};

/**
 * The attack clip lands its blow on this frame (30 fps, clip starts at frame 1). The clip is sped up
 * or slowed down so that frame meets the end of the species' windup, which is when the damage lands.
 */
const STRIKE_FRAME = 22;
export const attackClipSpeed = (k: MobSpecies) => (STRIKE_FRAME - 1) / 30 / MOB_SPECIES[k].windup;

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
 * the gameplay capsule comes from MOB_SPECIES. move() picks bekle, yuru or kos from the ground speed
 * (kos once the speed is past halfway from walkRef to runRef) and matches the clip to the stride;
 * play('attack') plays saldir once and nothing interrupts it until it ends; hit() plays darbe unless
 * the creature is attacking; die() plays olum and keeps the last pose.
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
  /** A one-shot clip (saldir, darbe, olum) that the looping clips must not cut short. */
  let busy: AnimationGroup | null = null;
  let dead = false;
  const start = (g: AnimationGroup | undefined, loop: boolean, speed: number) => {
    if (!g) return;
    g.speedRatio = speed;
    if (current === g) return;
    current?.stop();
    g.start(loop, speed);
    current = g;
  };
  const once = (g: AnimationGroup | undefined, speed: number) => {
    if (!g) return;
    current?.stop();
    current = null;
    busy = g;
    g.onAnimationGroupEndObservable.addOnce(() => {
      if (busy === g && !dead) busy = null;
    });
    start(g, false, speed);
  };
  const play = (wanted: Anim, speed = 1, restart = false) => {
    if (dead) return;
    if (wanted === 'attack') {
      if (restart || busy !== clips.saldir) once(clips.saldir, speed);
      return;
    }
    if (busy) return;
    if (wanted === 'idle' || wanted === 'jump') start(clips.bekle, true, speed);
    else start(clips.yuru, true, Math.max(0.5, Math.min(2.5, (speed * 6) / spec.walkRef)));
  };
  const move = (v: number) => {
    if (dead || busy) return;
    if (v < 0.6) start(clips.bekle, true, 1);
    else if (clips.kos && v > (spec.walkRef + spec.runRef) / 2) start(clips.kos, true, Math.max(0.6, Math.min(1.8, v / spec.runRef)));
    else start(clips.yuru, true, Math.max(0.5, Math.min(2.5, v / spec.walkRef)));
  };
  const hit = () => {
    if (dead || busy === clips.saldir || busy === clips.darbe) return;
    once(clips.darbe, 1);
  };
  const die = () => {
    dead = true;
    const g = clips.olum;
    if (hpBar) hpBar.isVisible = false;
    if (!g) return 0;
    current?.stop();
    current = null;
    busy = g;
    g.start(false, 1);
    current = g;
    const fps = g.targetedAnimations[0]?.animation.framePerSecond ?? 60;
    return (g.to - g.from) / fps + CORPSE.lie;
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
    move,
    hit,
    die,
    dispose: () => {
      for (const g of inst.animationGroups) g.dispose();
      for (const s of inst.skeletons) s.dispose();
      for (const m of mats.values()) m.dispose();
    },
  };
}
