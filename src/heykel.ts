/**
 * The Mushroom Woman: the statue in the Spor Ormanı maze is this region's boss.
 *
 * The map holds only her plinth (kind heykel_kaide). The figure is a skinned model
 * (assets/dusman/boss_mantar_kadin.glb, spor_heykel_boss.py in the shared regions/spor-ormani/scriptler folder) whose rest pose is the statue,
 * so while she sleeps she is the statue. A player on or next to the plinth presses V to wake her.
 * Awake she is a 'boss' unit with an invisible hit cylinder; the model follows the unit. She is too big
 * for the maze: she steps over its walls, but the walls still block her gill breath.
 *
 * Attacks (numbers in balance.ts BOSS_STATUE), each shown on the ground before it lands:
 *   crash  cap crash: a red circle in front of her. Step out.
 *   rain   spore rain: circles on the players near her and round about. Step out.
 *   wave   root wave: she stamps and a ring runs out along the ground. Jump over it.
 *   breath gill breath: she bends and sweeps a cone of spores. Hide behind a maze wall or the plinth.
 * Below half health she calls a pack of forest creatures once and attacks faster. If everyone leaves,
 * she walks back, climbs her plinth and turns to stone again with full health. Dead, she stays fallen.
 */
import { AnimationGroup } from '@babylonjs/core/Animations/animationGroup';
import { AssetContainer } from '@babylonjs/core/assetContainer';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Material } from '@babylonjs/core/Materials/material';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { Scene } from '@babylonjs/core/scene';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import statueUrl from './assets/dusman/boss_mantar_kadin.glb?url';
import { forwardFromYaw, type ActorBody } from './actors';
import { BOSS_STATUE as N } from './balance';
import { G, chest, dealDamage, flatDist, hostile, lineOfSight, makeUnit, minutes, ringFx, spawnFx, type Unit } from './core';
import { addShake, sfx } from './feel';
import { loadRegionModel } from './gltf';
import { t as T } from './i18n';
import { playerVisibility } from './kit';
import { baseHeight } from './mapgen/generate';
import { groundHeight, type World } from './world';
import { random } from './random';

/** The plinth from spor_heykel.py: top at 1.05 m, steps out to these radii (m) and heights. */
const PLINTH: [number, number][] = [
  [5.8, 1.05],
  [6.6, 0.7],
  [7.4, 0.35],
];
/** Ground marks sit this high: above the maze floor tiles (0.16 m), so they never hide under them. */
const MARK_LIFT = 0.25;
/** Distances (m) where LOD1 and LOD2 take over: she is 16 m tall, so the full model stays on a long way. */
const LOD_AT = [70, 160];

type Act = { kind: 'crash' | 'rain' | 'wave' | 'breath'; t: number; speed: number; hit: boolean; spots: Vector3[]; marks: Mesh[]; tick: number; beam?: TransformNode };
type Wave = { at: Vector3; r: number; ring: Mesh; hit: Set<Unit>; src: Unit };
type Statue = {
  x: number;
  z: number;
  base: number;
  yaw0: number;
  s: number;
  root: TransformNode;
  mat: PBRMaterial;
  clips: Record<string, AnimationGroup>;
  current: AnimationGroup | null;
  unit: Unit | null;
  state: 'stone' | 'waking' | 'awake' | 'dead' | 'gone';
  t: number;
  pos: Vector3;
  yaw: number;
};

let kit: AssetContainer | null = null;
const statues: Statue[] = [];
const waves: Wave[] = [];

/** Load the figure and stand one on every boss plinth of the map. */
export async function placeStatues(scene: Scene, world: World) {
  const objs = (world.mapObjects ?? []).filter((o) => o.k === 'heykel_kaide');
  if (!objs.length || !world.field) return;
  kit = await loadRegionModel(statueUrl, scene);
  for (const o of objs) {
    const n = statues.length;
    const inst = kit.instantiateModelsToScene((name) => `heykel${n}-${name}`, false, { doNotInstantiate: true });
    const root = new TransformNode(`heykel${n}`, scene);
    const model = inst.rootNodes[0] as TransformNode;
    model.parent = root;
    let mat: PBRMaterial | null = null;
    const lods: (Mesh | undefined)[] = [];
    for (const m of model.getChildMeshes(false)) {
      if (!(m instanceof Mesh)) continue;
      m.receiveShadows = true;
      m.isPickable = false;
      if (!mat && m.material instanceof PBRMaterial) mat = m.material;
      const lod = /_LOD(\d)/.exec(m.name);
      if (lod) lods[Number(lod[1])] = m;
    }
    const [l0, l1, l2] = lods;
    if (l0) {
      if (l1) l0.addLODLevel(LOD_AT[0] * o.s, l1);
      if (l2) l0.addLODLevel(LOD_AT[1] * o.s, l2);
      world.shadows.addShadowCaster(l0);
    }
    const clips: Record<string, AnimationGroup> = {};
    for (const g of inst.animationGroups) {
      g.stop();
      g.enableBlending = true;
      g.blendingSpeed = 0.05;
      clips[g.name.split('|').at(-1)!.replace(/^heykel\d+-/, '').toLowerCase()] = g;
    }
    const base = baseHeight(world.field, o);
    const st: Statue = {
      x: o.x,
      z: o.z,
      base,
      yaw0: o.r,
      s: o.s,
      root,
      mat: mat ?? new PBRMaterial('heykel-mat', scene),
      clips,
      current: null,
      unit: null,
      state: 'stone',
      t: 0,
      pos: new Vector3(o.x, base + PLINTH[0][1] * o.s, o.z),
      yaw: o.r,
    };
    statues.push(st);
    toStone(st);
  }
}

// ---- Clips -----------------------------------------------------------------------------------------
function play(st: Statue, name: string, loop: boolean, speed = 1) {
  const g = st.clips[name];
  if (!g) return;
  if (st.current === g && loop) {
    g.speedRatio = speed;
    return;
  }
  st.current?.stop();
  g.start(loop, speed, g.from, g.to, false);
  st.current = g;
}

/** Back to the statue: the first frame of the awakening clip is the rest pose. */
function toStone(st: Statue) {
  st.state = 'stone';
  st.pos.set(st.x, st.base + PLINTH[0][1] * st.s, st.z);
  st.yaw = st.yaw0;
  const g = st.clips.uyan;
  st.current?.stop();
  st.current = null;
  if (g) {
    g.start(false, 1, g.from, g.to, false);
    g.goToFrame(g.from);
    g.pause();
    st.current = g;
  }
  syncModel(st);
}

function syncModel(st: Statue) {
  st.root.position.copyFrom(st.pos);
  st.root.rotation.y = st.yaw;
  st.root.scaling.setAll(st.s);
}

// ---- Waking ----------------------------------------------------------------------------------------
/** The sleeping statue within reach of `pos`, if any. */
export function statueNear(pos: Vector3): boolean {
  return statues.some((st) => st.state === 'stone' && Math.hypot(st.x - pos.x, st.z - pos.z) < N.wakeReach * st.s);
}

/** V next to the plinth: she wakes. */
export function wakeStatue(pos: Vector3, announce: (text: string) => void): boolean {
  const st = statues.find((s) => s.state === 'stone' && Math.hypot(s.x - pos.x, s.z - pos.z) < N.wakeReach * s.s);
  if (!st) return false;
  st.state = 'waking';
  st.t = N.wakeTime;
  play(st, 'uyan', false);
  announce(T('statueWake'));
  sfx.boom();
  addShake(0.5);
  return true;
}

function makeBossUnit(st: Statue): Unit {
  const root = new TransformNode('heykel-unit', G.scene);
  // Shots test the capsule; this invisible cylinder only stops the aim ray on her, like a body mesh.
  const hit = MeshBuilder.CreateCylinder('heykel-hit', { height: N.height * st.s, diameter: N.radius * 2 * st.s, tessellation: 12 }, G.scene);
  hit.parent = root;
  hit.position.y = (N.height * st.s) / 2;
  hit.visibility = 0;
  const body: ActorBody = { root, meshes: [hit], bodyMat: st.mat, baseColor: st.mat.albedoColor.clone() };
  return makeUnit('boss', T('statueName'), body, st.pos, -1, N.hp(minutes()), {
    radius: N.radius * st.s,
    height: N.height * st.s,
    level: 12,
    yaw: st.yaw,
    ai: { statue: true, target: null, think: 0, cd: { crash: 2, rain: 4, wave: 5, breath: 8 }, act: null, restT: 1, calmT: 0, enraged: false },
  });
}

// ---- Movement --------------------------------------------------------------------------------------
/** Ground under her feet: the terrain, or the plinth step she stands on. */
function floorAt(st: Statue, x: number, z: number) {
  const d = Math.hypot(x - st.x, z - st.z) / st.s;
  let y = G.world.field ? G.world.field.height(x, z) : 0;
  for (const [r, h] of PLINTH) {
    if (d < r) {
      y = Math.max(y, st.base + h * st.s);
      break;
    }
  }
  return y;
}

const terrain = (x: number, z: number) => (G.world.field ? G.world.field.height(x, z) : 0);

function walk(st: Statue, u: Unit, to: Vector3, dt: number) {
  const d = new Vector3(to.x - u.pos.x, 0, to.z - u.pos.z);
  const len = d.length();
  if (len < 0.5) return false;
  turnTo(u, to, dt);
  // She walks the way she faces (turning slowly) and never steps out past her leash.
  const f = forwardFromYaw(u.yaw).scale(Math.min(len, N.walkSpeed * st.s * dt));
  const nx = u.pos.x + f.x, nz = u.pos.z + f.z;
  const out = Math.hypot(nx - st.x, nz - st.z);
  if (out < N.leash * st.s || out < Math.hypot(u.pos.x - st.x, u.pos.z - st.z)) {
    u.pos.x = nx;
    u.pos.z = nz;
    return true;
  }
  return false;
}

function turnTo(u: Unit, p: Vector3, dt: number) {
  const want = Math.atan2(p.x - u.pos.x, p.z - u.pos.z);
  let d = want - u.yaw;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  const step = N.turn * dt;
  u.yaw += Math.max(-step, Math.min(step, d));
  return Math.abs(d);
}

function angleTo(u: Unit, p: Vector3) {
  let d = Math.atan2(p.x - u.pos.x, p.z - u.pos.z) - u.yaw;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// ---- Targets ---------------------------------------------------------------------------------------
function canTarget(st: Statue, u: Unit, t: Unit) {
  if (!hostile(u, t) || t.kind === 'mob' || t.kind === 'boss') return false;
  if (flatDist(t.pos, u.pos) > N.aggro * st.s) return false;
  if (Math.hypot(t.pos.x - st.x, t.pos.z - st.z) > (N.leash + 10) * st.s) return false;
  if (t === G.player && playerVisibility() === 0) return false;
  return true;
}

function targetsNear(u: Unit, range: number) {
  return G.units.filter((t) => hostile(u, t) && t.kind !== 'mob' && t.kind !== 'boss' && flatDist(t.pos, u.pos) < range);
}

/** How high a unit is off the floor under it (to jump the root wave). */
function airborne(t: Unit) {
  return t.pos.y - groundHeight(new Vector3(t.pos.x, t.pos.y + 0.05, t.pos.z), t.radius, G.world.boxes);
}

// ---- Telegraphs ------------------------------------------------------------------------------------
const markMats = new Map<string, Material>();
/**
 * Paint for the warnings on the ground. The fx wash (glowMat) reads as a faint brown stain at a distance,
 * too soft for "move now"; these are flat, clear of the map's thick fog, and drawn over the floor.
 */
function markMat(hex: string, alpha: number) {
  const key = `${hex}-${alpha}`;
  let m = markMats.get(key) as StandardMaterial | undefined;
  if (!m) {
    m = new StandardMaterial(`heykel-mark-${key}`, G.scene);
    m.emissiveColor = Color3.FromHexString(hex);
    m.disableLighting = true;
    m.alpha = alpha;
    m.backFaceCulling = false;
    m.fogEnabled = false;
    m.zOffset = -2;
    markMats.set(key, m);
  }
  return m;
}

/** A filled circle with a bright rim. */
function disc(at: Vector3, radius: number, color = '#ff2a1a', alpha = 0.3) {
  const m = MeshBuilder.CreateDisc('heykel-mark', { radius, tessellation: 40 }, G.scene);
  m.rotation.x = Math.PI / 2;
  m.position.set(at.x, at.y + MARK_LIFT, at.z);
  m.material = markMat(color, alpha);
  m.isPickable = false;
  const rim = MeshBuilder.CreateTorus('heykel-rim', { diameter: radius * 2, thickness: Math.max(0.15, radius * 0.04), tessellation: 48 }, G.scene);
  rim.rotation.x = -Math.PI / 2; // undo the disc's turn: the torus already lies flat
  rim.parent = m;
  rim.material = markMat(color, Math.min(1, alpha * 2));
  rim.isPickable = false;
  return m;
}

/**
 * A flat pie slice round `at`, centred on yaw `mid`, `half` radians to each side. CreateDisc's arc starts
 * at local +X and turns towards +Z, which after laying it flat is yaw pi/2 going down; the parent turns it.
 */
function sector(at: Vector3, radius: number, mid: number, half: number, color: string, alpha: number) {
  const holder = new TransformNode('heykel-sector', G.scene);
  const m = MeshBuilder.CreateDisc('heykel-sector-m', { radius, tessellation: 48, arc: (2 * half) / (Math.PI * 2) }, G.scene);
  m.rotation.x = Math.PI / 2;
  m.parent = holder;
  m.material = markMat(color, alpha);
  m.isPickable = false;
  holder.position.set(at.x, at.y + MARK_LIFT, at.z);
  holder.rotation.y = mid - (Math.PI / 2 - half);
  return holder;
}

function clearAct(u: Unit) {
  const a: Act | null = u.ai!.act;
  if (!a) return;
  for (const m of a.marks) m.dispose();
  a.beam?.dispose(false, true);
  u.ai!.act = null;
}

// ---- Attacks ---------------------------------------------------------------------------------------
function startAct(st: Statue, u: Unit, kind: Act['kind'], target: Unit) {
  const ai = u.ai!;
  const fwd = forwardFromYaw(u.yaw);
  const a: Act = { kind, t: 0, speed: 1, hit: false, spots: [], marks: [], tick: 0 };
  const mult = ai.enraged ? N.enrageCooldown : 1;
  if (kind === 'crash') {
    const c = u.pos.add(fwd.scale(N.crash.ahead * st.s));
    c.y = floorAt(st, c.x, c.z);
    a.spots.push(c);
    a.marks.push(disc(c, N.crash.radius * st.s, '#ff2a1a', 0.45));
    a.speed = N.crash.clipHit / N.crash.windup;
    play(st, 'darbe', false, a.speed);
    ai.cd.crash = N.crash.cd * mult;
  } else if (kind === 'rain') {
    const near = targetsNear(u, N.rain.range * st.s);
    const count = ai.enraged ? N.rain.enrageCount : N.rain.count;
    for (const t of near.slice(0, count)) a.spots.push(new Vector3(t.pos.x, 0, t.pos.z));
    while (a.spots.length < count) {
      const ang = random() * Math.PI * 2, d = (4 + random() * N.rain.scatter) * st.s;
      a.spots.push(new Vector3(target.pos.x + Math.sin(ang) * d, 0, target.pos.z + Math.cos(ang) * d));
    }
    for (const p of a.spots) {
      p.y = floorAt(st, p.x, p.z);
      a.marks.push(disc(p, N.rain.radius, '#e0306a', 0.45));
    }
    play(st, 'yagmur', false);
    ai.cd.rain = N.rain.cd * mult;
  } else if (kind === 'wave') {
    a.speed = N.wave.clipHit / N.wave.windup;
    const ring = MeshBuilder.CreateTorus('heykel-ring', { diameter: 6 * st.s, thickness: 0.35, tessellation: 48 }, G.scene);
    ring.position.set(u.pos.x, floorAt(st, u.pos.x, u.pos.z) + 0.15, u.pos.z);
    ring.material = markMat('#ff7a2a', 0.6);
    ring.isPickable = false;
    a.marks.push(ring);
    play(st, 'dalga', false, a.speed);
    ai.cd.wave = N.wave.cd * mult;
  } else {
    const at = new Vector3(u.pos.x, terrain(u.pos.x, u.pos.z), u.pos.z);
    const half = (N.breath.arc * Math.PI) / 180 + (N.breath.width * Math.PI) / 360;
    a.beam = sector(at, N.breath.range * st.s, u.yaw, half, '#ff2a1a', 0.28);
    play(st, 'nefes', false);
    ai.cd.breath = N.breath.cd * mult;
  }
  ai.act = a;
}

/** The beam's yaw while she sweeps: from her left (yaw - arc) to her right (yaw + arc), eased like the clip. */
function beamYaw(u: Unit, a: Act) {
  const k = Math.max(0, Math.min(1, (a.t - N.breath.windup) / N.breath.sweep));
  const e = k * k * (3 - 2 * k);
  return u.yaw + ((N.breath.arc * Math.PI) / 180) * (2 * e - 1);
}

function stepAct(st: Statue, u: Unit, dt: number) {
  const ai = u.ai!;
  const a: Act = ai.act;
  a.t += dt;
  const near = (p: Vector3, r: number) => G.units.filter((t) => hostile(u, t) && t.kind !== 'mob' && t.kind !== 'boss' && flatDist(t.pos, p) < r + t.radius && Math.abs(t.pos.y - p.y) < 4);
  let len = 0;
  if (a.kind === 'crash') {
    len = N.crash.clipLen / a.speed;
    if (!a.hit && a.t >= N.crash.windup) {
      a.hit = true;
      const c = a.spots[0];
      for (const t of near(c, N.crash.radius * st.s)) dealDamage(u, t, N.crash.damage);
      ringFx(c, N.crash.radius * st.s, '#ff8a5c', 0.5);
      boom(c, 0.9);
      for (const m of a.marks) m.dispose();
      a.marks = [];
    }
  } else if (a.kind === 'rain') {
    len = N.rain.clipLen;
    // Marks pulse brighter as the spores fall.
    for (const m of a.marks) m.scaling.setAll(0.6 + 0.4 * Math.min(1, a.t / N.rain.windup));
    if (!a.hit && a.t >= N.rain.windup) {
      a.hit = true;
      for (const p of a.spots) {
        for (const t of near(p, N.rain.radius)) dealDamage(u, t, N.rain.damage);
        ringFx(p, N.rain.radius, '#ff9ad0', 0.6);
        spawnFx(MeshBuilder.CreateSphere('spor', { diameter: 1.6, segments: 6 }, G.scene), p.add(new Vector3(0, 0.8, 0)), '#f6c0e0', 0.7, 3);
      }
      boom(a.spots[0], 0.3);
      for (const m of a.marks) m.dispose();
      a.marks = [];
    }
  } else if (a.kind === 'wave') {
    len = N.wave.clipLen / a.speed;
    const ring = a.marks[0];
    if (ring) ring.visibility = 0.5 + 0.5 * Math.sin(a.t * 18);
    if (!a.hit && a.t >= N.wave.windup) {
      a.hit = true;
      for (const m of a.marks) m.dispose();
      a.marks = [];
      const at = new Vector3(u.pos.x, floorAt(st, u.pos.x, u.pos.z), u.pos.z);
      const r = MeshBuilder.CreateTorus('heykel-wave', { diameter: 2, thickness: 0.5, tessellation: 64 }, G.scene);
      r.position.set(at.x, at.y + 0.2, at.z);
      r.material = markMat('#c86a3a', 0.75);
      r.isPickable = false;
      waves.push({ at, r: 1, ring: r, hit: new Set(), src: u });
      boom(at, 0.8);
    }
  } else {
    len = N.breath.clipLen;
    if (a.beam && a.t >= N.breath.windup && a.t < N.breath.windup + N.breath.sweep) {
      // The wide warning becomes the narrow beam that sweeps.
      if (!a.hit) {
        a.hit = true;
        a.beam.dispose(false, true);
        a.beam = sector(new Vector3(u.pos.x, terrain(u.pos.x, u.pos.z), u.pos.z), N.breath.range * st.s, 0, (N.breath.width * Math.PI) / 360, '#b8ff9a', 0.5);
      }
      const yaw = beamYaw(u, a);
      a.beam.rotation.y = yaw - (Math.PI / 2 - (N.breath.width * Math.PI) / 360);
      a.tick -= dt;
      if (a.tick <= 0) {
        a.tick = N.breath.tick;
        const dir = forwardFromYaw(yaw);
        const from = u.pos.add(dir.scale(4 * st.s)).addInPlaceFromFloats(0, N.breath.from * st.s, 0);
        for (const t of targetsNear(u, N.breath.range * st.s)) {
          let d = Math.atan2(t.pos.x - u.pos.x, t.pos.z - u.pos.z) - yaw;
          while (d > Math.PI) d -= Math.PI * 2;
          while (d < -Math.PI) d += Math.PI * 2;
          if (Math.abs(d) > (N.breath.width * Math.PI) / 360 + Math.atan2(t.radius, flatDist(t.pos, u.pos))) continue;
          // Maze walls and the plinth stop the spores.
          if (!lineOfSight(from, chest(t))) continue;
          dealDamage(u, t, N.breath.damage);
        }
      }
    } else if (a.beam && a.t >= N.breath.windup + N.breath.sweep) {
      a.beam.dispose(false, true);
      a.beam = undefined;
    }
  }
  if (a.t >= len) {
    clearAct(u);
    ai.restT = N.rest * (ai.enraged ? N.enrageCooldown : 1);
  }
}

function boom(at: Vector3, shake: number) {
  const d = flatDist(at, G.player.pos);
  if (d < 45) {
    sfx.boom();
    addShake(Math.max(0.1, shake - d / 50));
  }
}

function updateWaves(dt: number) {
  for (let i = waves.length - 1; i >= 0; i--) {
    const w = waves[i];
    w.r += N.wave.speed * dt;
    w.ring.scaling.set(w.r, 1, w.r);
    w.ring.visibility = Math.max(0.15, 1 - w.r / N.wave.maxR);
    for (const t of G.units) {
      if (w.hit.has(t) || !hostile(w.src, t) || t.kind === 'mob' || t.kind === 'boss') continue;
      const d = flatDist(t.pos, w.at);
      if (Math.abs(d - w.r) > N.wave.band + t.radius) continue;
      if (airborne(t) > N.wave.jumpClear) continue; // jumped it
      w.hit.add(t);
      dealDamage(w.src, t, N.wave.damage);
    }
    if (w.r > N.wave.maxR) {
      w.ring.dispose();
      waves.splice(i, 1);
    }
  }
}

// ---- The fight -------------------------------------------------------------------------------------
function fight(st: Statue, u: Unit, dt: number, summon: (at: Vector3, n: number) => void, announce: (text: string) => void) {
  const ai = u.ai!;
  for (const k of Object.keys(ai.cd)) ai.cd[k] -= dt;
  ai.restT -= dt;
  ai.think -= dt;
  if (!ai.enraged && u.hp < u.maxHp * N.enrageAt) {
    ai.enraged = true;
    summon(u.pos.add(forwardFromYaw(u.yaw).scale(10 * st.s)), N.enragePack);
    announce(T('statueEnrage'));
  }
  if (ai.think <= 0) {
    ai.think = 0.5;
    let best: Unit | null = null;
    for (const t of G.units) if (canTarget(st, u, t) && (!best || flatDist(t.pos, u.pos) < flatDist(best.pos, u.pos))) best = t;
    ai.target = best;
  }
  if (ai.act) {
    stepAct(st, u, dt);
    return;
  }
  const t: Unit | null = ai.target?.alive ? ai.target : null;
  if (!t) {
    // Nobody left: back to the plinth, and to stone after a while.
    const home = new Vector3(st.x, 0, st.z);
    if (!walk(st, u, home, dt)) {
      const d = st.yaw0 - u.yaw;
      u.yaw += Math.max(-N.turn * dt, Math.min(N.turn * dt, Math.atan2(Math.sin(d), Math.cos(d))));
      play(st, 'bekle', true);
      ai.calmT += dt;
      if (ai.calmT > N.calmTime) {
        retire(st, u);
        announce(T('statueCalm'));
      }
    } else play(st, 'yuru', true);
    return;
  }
  ai.calmT = 0;
  const dist = flatDist(t.pos, u.pos);
  const ang = Math.abs(angleTo(u, t.pos));
  if (ai.restT <= 0) {
    const s = st.s;
    const can = {
      crash: ai.cd.crash <= 0 && dist < N.crash.range * s && ang < 0.45,
      wave: ai.cd.wave <= 0 && dist < N.wave.range * s,
      breath: ai.cd.breath <= 0 && dist < N.breath.range * s && dist > 6 * s && ang < 0.6,
      rain: ai.cd.rain <= 0 && dist < N.rain.range * s,
    };
    const order: Act['kind'][] = dist < 12 * s ? ['crash', 'wave', 'rain', 'breath'] : ['breath', 'rain', 'wave', 'crash'];
    if (random() < 0.3) order.reverse();
    const pick = order.find((k) => can[k]);
    if (pick) {
      startAct(st, u, pick, t);
      return;
    }
  }
  if (dist > N.closeTo * st.s && walk(st, u, t.pos, dt)) play(st, 'yuru', true, 1);
  else {
    turnTo(u, t.pos, dt);
    play(st, 'bekle', true);
  }
}

/** Out of the fight: the unit goes, the model stays as the statue again. */
function retire(st: Statue, u: Unit) {
  clearAct(u);
  u.alive = false;
  G.units = G.units.filter((x) => x !== u);
  u.body.root.dispose(false, true);
  st.unit = null;
  toStone(st);
}

/** Every frame: waking, the fight, death and the root waves. */
export function updateStatues(dt: number, summon: (at: Vector3, n: number) => void, announce: (text: string) => void) {
  updateWaves(dt);
  for (const st of statues) {
    if (st.state === 'waking') {
      st.t -= dt;
      if (st.t <= 0) {
        st.state = 'awake';
        st.unit = makeBossUnit(st);
        play(st, 'bekle', true);
      }
    } else if (st.state === 'awake' && st.unit) {
      const u = st.unit;
      if (!u.alive) {
        // Fallen: the death clip holds its last pose; after a while she sinks into the ground.
        clearAct(u);
        st.unit = null;
        st.state = 'dead';
        st.t = N.deadHold;
        play(st, 'olum', false);
        continue;
      }
      fight(st, u, dt, summon, announce);
      const fy = floorAt(st, u.pos.x, u.pos.z);
      u.pos.y += (fy - u.pos.y) * Math.min(1, dt * 5);
      st.pos.copyFrom(u.pos);
      st.yaw = u.yaw;
      syncModel(st);
    } else if (st.state === 'dead') {
      st.t -= dt;
      if (st.t < 0) {
        st.pos.y -= dt * 0.8 * st.s;
        syncModel(st);
        if (st.t < -10) {
          st.state = 'gone';
          st.root.setEnabled(false);
        }
      }
    }
  }
}

/** New match: every statue sleeps again. */
export function resetStatues() {
  for (const w of waves) w.ring.dispose();
  waves.length = 0;
  for (const st of statues) {
    if (st.unit) retire(st, st.unit);
    st.root.setEnabled(true);
    toStone(st);
  }
}

/** Test hook: where the statues stand and what they are doing. */
export function statueInfo() {
  return statues.map((s) => {
    const a: Act | null = s.unit?.ai?.act ?? null;
    return { x: s.pos.x, z: s.pos.z, y: s.pos.y, yaw: s.yaw, state: s.state, hp: s.unit?.hp ?? 0, act: a?.kind ?? null, actT: a?.t ?? 0, speed: a?.speed ?? 1 };
  });
}

/** Test hook: show the clip that is playing at `seconds` (headless screenshots run the logic without drawing). */
export function statuePose(seconds: number) {
  for (const s of statues) {
    const g = s.current;
    if (!g) continue;
    // Blending eases in one step per drawn frame; a test shot draws just one, so start the clip unblended.
    for (const c of Object.values(s.clips)) c.enableBlending = false;
    g.stop();
    g.start(false, 1, g.from, g.to, false);
    g.goToFrame(Math.min(g.to, g.from + seconds * 60)); // the glTF loader keys clips at 60 frames a second
    g.pause();
  }
}
