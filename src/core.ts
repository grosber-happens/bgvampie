import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Scene } from '@babylonjs/core/scene';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { clayLook, watercolorFxMaterial } from './look';
import { UniversalCamera } from '@babylonjs/core/Cameras/universalCamera';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { disposeBody, flash, forwardFromYaw, type ActorBody } from './actors';
import { BACKSTAB, COMBAT_LOCK, ROGUE } from './balance';
import type { Input } from './input';
import type { SkinName } from './characters';
import { groundHeight, pointHitsObstacle, resolveWalls, type World } from './world';

export type Kind = 'player' | 'bot' | 'mob' | 'boss' | 'decoy';

/** Anything that has health and can fight: the player, bots, mobs, bosses and decoys. */
export type Unit = {
  id: number;
  kind: Kind;
  name: string;
  body: ActorBody;
  pos: Vector3;
  yaw: number;
  velY: number;
  radius: number;
  height: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  /** Same team never hurts each other. Player and its decoys are team 0, every bot has its own team, mobs share -1. */
  team: number;
  level: number;
  xp: number;
  /** Time (G.time) of the last damage dealt or taken. */
  lastCombat: number;
  stunT: number;
  slowT: number;
  slowMul: number;
  poisonT: number;
  poisonDps: number;
  poisonSrc: Unit | null;
  flashT: number;
  /** Extra glow for the body (decoys glow purple for their owner). */
  tint?: Color3;
  /** Decoys: who made it and when it vanishes. */
  owner?: Unit;
  lifeT?: number;
  colors?: { body: string; head: string; weapon: string; skin?: SkinName; tint?: string };
  /** Position last frame (drives run/idle animations). */
  prev?: Vector3;
  /** Behavior data for bots, mobs, bosses and decoys. */
  ai?: Record<string, any>;
};

export type Bullet = {
  mesh: Mesh;
  vel: Vector3;
  life: number;
  damage: number;
  owner: Unit;
  poison: boolean;
  radius: number;
};

type Fx = { mesh: Mesh; t: number; total: number; grow?: number; fade?: boolean };

/** Rogue-only timers for the player (skills write these, combat reads them). */
export const PS = {
  evasionT: 0,
  evasionImmuneT: 0,
  invisT: 0,
  /** Tier-3 invisibility: always faint while out of combat. */
  semiInvis: false,
  poisonCoatT: 0,
  poisonPermanent: false,
  poisonBoostT: 0,
  poisonSlow: 0.3,
  poisonDps: 6,
  sprintT: 0,
  sprintHaste: false,
  kills: 0,
  currency: 0,
};

export const G = {
  scene: null as unknown as Scene,
  world: null as unknown as World,
  camera: null as unknown as UniversalCamera,
  input: null as unknown as Input,
  /** Seconds of match time (stops while paused). */
  time: 0,
  units: [] as Unit[],
  bullets: [] as Bullet[],
  fx: [] as Fx[],
  player: null as unknown as Unit,
  nextId: 1,
  hooks: {
    kill: (_killer: Unit | null, _victim: Unit) => {},
    number: (_pos: Vector3, _amount: number, _style: 'hit' | 'crit' | 'poison' | 'me' | 'block') => {},
    hitMarker: (_crit: boolean) => {},
    /** A bullet hit a wall or the ground. */
    impact: (_p: Vector3, _color: string) => {},
    /** Someone other than the player fired (for distant shot sounds). */
    shot: (_from: Vector3, _owner: Unit) => {},
    playerHurt: (_dmg: number) => {},
  },
};

export const minutes = () => G.time / 60;

// ---- Materials -------------------------------------------------------------
const mats = new Map<string, StandardMaterial>();
export function glowMat(hex: string, alpha = 1): StandardMaterial {
  const key = `${hex}-${alpha}`;
  let m = mats.get(key);
  if (!m && clayLook) {
    m = watercolorFxMaterial(hex, alpha)!;
    mats.set(key, m);
  }
  if (!m) {
    m = new StandardMaterial(`glow-${key}`, G.scene);
    m.emissiveColor = Color3.FromHexString(hex);
    m.disableLighting = true;
    m.alpha = alpha;
    m.backFaceCulling = false;
    mats.set(key, m);
  }
  return m;
}

// ---- Units ---------------------------------------------------------------
export function makeUnit(kind: Kind, name: string, body: ActorBody, pos: Vector3, team: number, maxHp: number, extra: Partial<Unit> = {}): Unit {
  const u: Unit = {
    id: G.nextId++,
    kind,
    name,
    body,
    pos: pos.clone(),
    yaw: 0,
    velY: 0,
    radius: 0.45,
    height: 1.85,
    hp: maxHp,
    maxHp,
    alive: true,
    team,
    level: 1,
    xp: 0,
    lastCombat: -99,
    stunT: 0,
    slowT: 0,
    slowMul: 1,
    poisonT: 0,
    poisonDps: 0,
    poisonSrc: null,
    flashT: 0,
    ...extra,
  };
  body.root.position.copyFrom(u.pos);
  for (const m of body.meshes) m.metadata = { unitId: u.id };
  G.units.push(u);
  return u;
}

export function removeUnit(u: Unit) {
  u.alive = false;
  disposeBody(u.body);
  G.units = G.units.filter((x) => x !== u);
}

export function hostile(a: Unit, b: Unit) {
  return a !== b && b.alive && a.team !== b.team;
}

export function chest(u: Unit): Vector3 {
  return u.pos.add(new Vector3(0, u.height * 0.65, 0));
}

export function flatDist(a: Vector3, b: Vector3) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/** Clear line between two points (walls block it). */
export function lineOfSight(a: Vector3, b: Vector3): boolean {
  const d = b.subtract(a);
  const len = d.length();
  const steps = Math.ceil(len / 0.6);
  for (let i = 1; i < steps; i++) {
    if (pointHitsObstacle(a.add(d.scale(i / steps)), G.world.boxes)) return false;
  }
  return true;
}

/** Is the attacker behind the target (Backstab)? */
export function isBehind(attackerPos: Vector3, target: Unit): boolean {
  const f = forwardFromYaw(target.yaw);
  const to = attackerPos.subtract(target.pos);
  to.y = 0;
  if (to.lengthSquared() < 1e-4) return false;
  to.normalize();
  const angle = (Math.acos(Math.max(-1, Math.min(1, Vector3.Dot(f, to)))) * 180) / Math.PI;
  return angle > BACKSTAB.angleDeg;
}

export const inCombat = (u: Unit) => G.time - u.lastCombat < COMBAT_LOCK;

/** Walk a unit with collisions and gravity. Returns how far it actually moved sideways. */
export function moveUnit(u: Unit, dir: Vector3, speed: number, dt: number): number {
  const before = u.pos.clone();
  if (u.stunT <= 0 && dir.lengthSquared() > 0) {
    const mul = u.slowT > 0 ? u.slowMul : 1;
    u.pos.addInPlace(dir.normalizeToNew().scale(speed * mul * dt));
  }
  resolveWalls(u.pos, u.radius, u.height, G.world.boxes);
  const floor = groundHeight(new Vector3(u.pos.x, u.pos.y, u.pos.z), u.radius, G.world.boxes);
  if (u.pos.y > floor + 0.01 || u.velY > 0) {
    u.velY -= 26 * dt;
    u.pos.y = Math.max(floor, u.pos.y + u.velY * dt);
    if (u.pos.y <= floor) u.velY = 0;
  } else {
    u.pos.y = floor;
    u.velY = 0;
  }
  return flatDist(before, u.pos);
}

export function faceTowards(u: Unit, p: Vector3, dt = 1, turn = 10) {
  const want = Math.atan2(p.x - u.pos.x, p.z - u.pos.z);
  let d = want - u.yaw;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  u.yaw += d * Math.min(1, turn * dt);
}

// ---- Damage ------------------------------------------------------------------
export type HitOpts = { poison?: boolean; noBackstab?: boolean; isDot?: boolean; at?: Vector3 };

/** Apply damage with every rule in one place. Returns the damage actually dealt. */
export function dealDamage(src: Unit | null, target: Unit, amount: number, opts: HitOpts = {}): number {
  if (!target.alive) return 0;
  // Decoys deal their owner's damage rules but give credit to the owner.
  const credit = src?.kind === 'decoy' ? src.owner ?? src : src;
  let dmg = amount;
  let style: 'hit' | 'crit' | 'poison' | 'me' | 'block' = opts.isDot ? 'poison' : 'hit';

  if (credit === G.player && !opts.isDot) {
    dmg *= 1 + ROGUE.damagePerLevel * (G.player.level - 1);
    // Backstab passive: the attacker's position decides (a decoy shooting from behind counts too).
    if (!opts.noBackstab && src && isBehind(src.pos, target)) {
      dmg *= BACKSTAB.mult;
      style = 'crit';
    }
    // Attacking breaks invisibility.
    PS.invisT = 0;
  }
  if (target === G.player) {
    style = 'me';
    if (PS.evasionImmuneT > 0) {
      G.hooks.number(chest(target), 0, 'block');
      target.lastCombat = G.time;
      return 0;
    }
    if (PS.evasionT > 0) dmg *= 0.5;
  }

  target.hp -= dmg;
  target.flashT = 1;
  target.lastCombat = G.time;
  if (src) src.lastCombat = G.time;
  if (credit && credit !== src) credit.lastCombat = G.time;
  if (credit === G.player && !opts.isDot) G.hooks.hitMarker(style === 'crit');
  if (target === G.player) G.hooks.playerHurt(dmg);
  G.hooks.number(opts.at ?? chest(target), dmg, style);

  if (opts.poison && credit) applyPoison(credit, target);
  if (target.hp <= 0) killUnit(credit, target);
  return dmg;
}

export function applyPoison(src: Unit, target: Unit) {
  // Poison does not stack, it only refreshes (approved rule).
  target.poisonT = 4;
  target.poisonSrc = src;
  target.poisonDps = PS.poisonDps * (PS.poisonBoostT > 0 ? 2 : 1);
  target.slowMul = Math.min(target.slowT > 0 ? target.slowMul : 1, 1 - PS.poisonSlow);
  target.slowT = Math.max(target.slowT, 4);
}

export function killUnit(killer: Unit | null, victim: Unit) {
  if (!victim.alive) return;
  victim.hp = 0;
  victim.alive = false;
  G.hooks.kill(killer, victim);
  if (victim.kind === 'player') return;
  removeUnit(victim);
  // A small burst where it fell.
  spawnFx(MeshBuilder.CreateSphere('pop', { diameter: 1.2, segments: 8 }, G.scene), chest(victim), victim.kind === 'decoy' ? '#b46cff' : '#ff8a5c', 0.3, 2.5);
}

/** Timers that every unit has: stun, slow, poison, flash, hp bar. */
export function tickStatus(u: Unit, dt: number) {
  u.stunT = Math.max(0, u.stunT - dt);
  u.slowT = Math.max(0, u.slowT - dt);
  if (u.slowT <= 0) u.slowMul = 1;
  if (u.poisonT > 0) {
    u.poisonT -= dt;
    const tickDmg = u.poisonDps * dt;
    u.hp -= tickDmg;
    u.ai && (u.ai.poisonAcc = (u.ai.poisonAcc ?? 0) + tickDmg);
    if (u.ai && u.ai.poisonAcc >= 5) {
      G.hooks.number(chest(u), u.ai.poisonAcc, 'poison');
      u.ai.poisonAcc = 0;
    }
    if (u.poisonSrc) u.lastCombat = G.time;
    if (u.hp <= 0) killUnit(u.poisonSrc, u);
  }
  u.flashT = Math.max(0, u.flashT - dt * 6);
  flash(u.body, u.flashT, u.tint);
  if (u.body.hpBar) u.body.hpBar.scaling.x = Math.max(0, u.hp / u.maxHp);
  // Animated characters: run while moving, jump while in the air, idle otherwise.
  if (u.body.play && dt > 0 && u.kind !== 'player') {
    const prev = u.prev ?? u.pos;
    const speed = Math.hypot(u.pos.x - prev.x, u.pos.z - prev.z) / dt;
    const air = u.velY > 0.5 || u.velY < -2;
    if (u.stunT > 0) u.body.play('idle', 0.3);
    else if (air) u.body.play('jump');
    else if (speed > 0.6) u.body.play('run', Math.max(0.6, Math.min(1.6, speed / 6)));
    else u.body.play('idle');
    u.prev = u.pos.clone();
  }
  u.body.root.position.copyFrom(u.pos);
  u.body.root.rotation.y = u.yaw;
  // Stunned units show a small spin of stars (a yellow ring).
  if (u.ai) {
    if (u.stunT > 0 && !u.ai.stunRing) {
      const ring = MeshBuilder.CreateTorus('stun', { diameter: 0.7, thickness: 0.06, tessellation: 16 }, G.scene);
      ring.material = glowMat('#ffe14a');
      ring.parent = u.body.root;
      ring.position.y = u.height + 0.25;
      ring.isPickable = false;
      u.ai.stunRing = ring;
    } else if (u.stunT <= 0 && u.ai.stunRing) {
      u.ai.stunRing.dispose();
      u.ai.stunRing = null;
    }
    if (u.ai.stunRing) u.ai.stunRing.rotation.y += dt * 8;
  }
}

// ---- Bullets ---------------------------------------------------------------
export function fireBullet(owner: Unit, from: Vector3, dir: Vector3, speed: number, range: number, damage: number, color: string, poison = false, size = 0.16) {
  // Small bullets are drawn as stretched tracers along their flight; big ones (boss rocks) as balls.
  const mesh =
    size < 0.3
      ? MeshBuilder.CreateBox('bullet', { width: size * (clayLook ? 0.8 : 0.45), height: size * (clayLook ? 0.8 : 0.45), depth: Math.min(1.2, speed / 70) }, G.scene)
      : MeshBuilder.CreateSphere('bullet', { diameter: size, segments: 6 }, G.scene);
  mesh.isPickable = false;
  mesh.material = glowMat(color);
  mesh.position.copyFrom(from);
  mesh.lookAt(from.add(dir));
  G.bullets.push({ mesh, vel: dir.normalizeToNew().scale(speed), life: range / speed, damage, owner, poison, radius: size / 2 });
  if (owner !== G.player) G.hooks.shot(from, owner);
}

/** First unit hit by a ray, before any wall. */
export function rayHitUnit(origin: Vector3, dir: Vector3, range: number, filter: (u: Unit) => boolean): { unit: Unit | null; point: Vector3 } {
  const d = dir.normalizeToNew();
  for (let s = 0.3; s <= range; s += 0.25) {
    const p = origin.add(d.scale(s));
    if (pointHitsObstacle(p, G.world.boxes)) return { unit: null, point: p };
    for (const u of G.units) {
      if (!filter(u)) continue;
      if (p.y > u.pos.y && p.y < u.pos.y + u.height && flatDist(p, u.pos) < u.radius + 0.1) return { unit: u, point: p };
    }
  }
  return { unit: null, point: origin.add(d.scale(range)) };
}

export function updateBullets(dt: number) {
  const alive: Bullet[] = [];
  for (const b of G.bullets) {
    const step = b.vel.scale(dt);
    const substeps = Math.max(1, Math.ceil(step.length() / 0.4));
    const inc = step.scale(1 / substeps);
    let done = false;
    for (let i = 0; i < substeps && !done; i++) {
      b.mesh.position.addInPlace(inc);
      const p = b.mesh.position;
      if (pointHitsObstacle(p, G.world.boxes)) {
        G.hooks.impact(p.clone(), b.mesh.material?.metadata?.hex ?? (b.mesh.material as StandardMaterial).emissiveColor.toHexString());
        done = true;
        break;
      }
      for (const u of G.units) {
        if (!hostile(b.owner, u)) continue;
        if (p.y > u.pos.y - 0.1 && p.y < u.pos.y + u.height + 0.1 && flatDist(p, u.pos) < u.radius + b.radius + 0.05) {
          dealDamage(b.owner, u, b.damage, { poison: b.poison, at: p.clone() });
          done = true;
          break;
        }
      }
    }
    b.life -= dt;
    if (done || b.life <= 0) b.mesh.dispose();
    else alive.push(b);
  }
  G.bullets = alive;
}

// ---- Effects -------------------------------------------------------------------
/** Show a mesh for a short time; it can grow and fade out. */
export function spawnFx(mesh: Mesh, at: Vector3, color: string, t: number, grow = 0, alpha = 0.6) {
  mesh.isPickable = false;
  mesh.position.copyFrom(at);
  mesh.material = glowMat(color, alpha);
  G.fx.push({ mesh, t, total: t, grow, fade: true });
  return mesh;
}

export function ringFx(at: Vector3, radius: number, color: string, t: number) {
  const disc = MeshBuilder.CreateDisc('ring', { radius, tessellation: 32 }, G.scene);
  disc.rotation.x = Math.PI / 2;
  return spawnFx(disc, at.add(new Vector3(0, 0.05, 0)), color, t, 0, 0.35);
}

/** Thin glowing line from a to b (hitscan trails). */
export function lineFx(a: Vector3, b: Vector3, color: string, t = 0.15) {
  const d = b.subtract(a);
  const len = d.length();
  const w = clayLook ? 0.16 : 0.06; // a brush stroke needs some width to show its wash
  const m = MeshBuilder.CreateBox('trail', { width: w, height: w, depth: len }, G.scene);
  spawnFx(m, a.add(d.scale(0.5)), color, t, 0, 0.8);
  m.lookAt(b);
}

export function updateFx(dt: number) {
  G.fx = G.fx.filter((f) => {
    f.t -= dt;
    if (f.grow) f.mesh.scaling.scaleInPlace(1 + f.grow * dt);
    if (f.fade) f.mesh.visibility = Math.max(0, f.t / f.total);
    if (f.t <= 0) f.mesh.dispose();
    return f.t > 0;
  });
}
