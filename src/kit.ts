import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { forwardFromYaw, rightFromYaw, type ActorBody } from './actors';
import type { Anim } from './characters';
import { G, chest, dealDamage, type HitOpts, faceTowards, flatDist, glowMat, hostile, lineOfSight, moveUnit, removeUnit, spawnFx, type Unit } from './core';
import { kick, sfx } from './feel';
import { pointHitsObstacle, resolveWalls } from './world';
import type { Gauge } from './armory/rig';

/**
 * Shared class-kit machinery: every class (Rogue, Mage, Fighter, Scout) is a ClassKit with
 * 10 skills of 3 tiers, two weapons, passives and its own dash. The player's owned skills,
 * learning and casting live here so cards and the HUD work the same for every class.
 */

export type Tier = 1 | 2 | 3;
export type Weapon = 'ranged' | 'melee';
export type OwnedSkill = { id: string; tier: Tier; cd: number; charges: number };
export type ClassId = 'rogue' | 'mage' | 'fighter' | 'scout';

export type SkillDef = {
  id: string;
  name: string;
  /** What the skill does (shown on the card when it is new). */
  desc: string;
  /** Card text for tiers 1, 2 and 3. */
  tiers: [string, string, string];
  /** The skill only works with this weapon. */
  weapon?: Weapon;
  cooldown: (t: Tier) => number;
  charges?: (t: Tier) => number;
  /** Mage (n) skills spend one nano orb. */
  orb?: boolean;
  /** Why the skill cannot be used right now (the slot turns gray), or null. */
  blocked?: (s: OwnedSkill) => string | null;
  /** Returns false when nothing happened (no cooldown is spent). */
  cast: (s: OwnedSkill) => boolean;
  /** Pressing the key while out of charges. */
  whenEmpty?: (s: OwnedSkill) => boolean;
  /** Called whenever this skill is learned or upgraded. */
  onLearn?: (s: OwnedSkill) => void;
};

export type Playstyle = { id: string; name: string; skill: string; weapon: Weapon };

export type ClassStats = { maxHp: number; hpPerLevel: number; damagePerLevel: number; regenDelay: number; regenPerSec: number };

/** Each class dashes in its own way: its own animation, speed, length and trail. */
export type DashDef = { anim: Anim; speed: number; time: number; cd: number; color: string; /** Mage: a blink, the body vanishes during the dash. */ blink?: boolean };

export type Outgoing = { dmg: number; crit: boolean };

export type ClassKit = {
  id: ClassId;
  name: string;
  /** One line for the class picker. */
  blurb: string;
  stats: ClassStats;
  dash: DashDef;
  weaponNames: Record<Weapon, string>;
  passives: string[];
  skills: Record<string, SkillDef>;
  playstyles: Playstyle[];
  /** Build the weapon models on the player's body root. */
  buildWeapons(root: TransformNode): Record<Weapon, TransformNode>;
  reset(): void;
  update(dt: number, moving: boolean, grounded: boolean): void;
  /** Fire or swing the weapon. Returns the seconds until the next attack. */
  attack(w: Weapon): number;
  /** Called when a dash starts. */
  onDash?(): void;
  reload?(): void;
  /** HUD line for the weapon in hand. */
  weaponText(w: Weapon): string;
  /** What the weapon models show: bullets, heat, orbs, charge, spears (armory/rig.ts). */
  gauge?(): Gauge;
  buffs(): string[];
  speedMult(): number;
  /** 1 normal, 0.5 faint, 0 hidden (for enemies). */
  visibility?(): number;
  /** Rogue Gölge izi: faint, so far enemies can't see you and miss more. */
  faded?(): boolean;
  /** Damage the player (or its allies) deals: class passives change it here. */
  outgoing?(target: Unit, dmg: number, src: Unit | null, opts: HitOpts): Outgoing;
  /** Damage the player takes: shields and damage reduction. Return the damage left. */
  incoming?(dmg: number, src: Unit | null): number;
  /** After the player dealt damage (lifesteal, companion target). */
  afterHit?(target: Unit, dmg: number, src: Unit | null): void;
};

/** What main.ts gives the kits: aim, weapon and teleport control. */
export type Host = {
  aimDir(): Vector3;
  aimOrigin(): Vector3;
  /** World point under the crosshair (or far away along the aim). */
  aimPoint(range: number, worldOnly?: boolean): Vector3;
  muzzle(): Vector3;
  weapon(): Weapon;
  setWeapon(w: Weapon): void;
  teleport(pos: Vector3, yaw: number): void;
  message(text: string): void;
  isAiming(): boolean;
  /** Seconds the player has kept the scope up (Scout sniper charge). */
  aimTime(): number;
  /** Jump the player straight up (Fighter jet leap). */
  launch(velY: number): void;
  grounded(): boolean;
};
export let host: Host;
export function setHost(h: Host) {
  host = h;
}

export const byTier = <T>(t: Tier, a: [T, T, T]) => a[t - 1];

// ---- The active class and the player's skills -----------------------------------
const kits = new Map<ClassId, ClassKit>();
export function registerKit(k: ClassKit) {
  kits.set(k.id, k);
}
export const allKits = () => [...kits.values()];
export let kit: ClassKit;
export function setKit(id: ClassId) {
  kit = kits.get(id)!;
}

/** The player's skills in slot order (Q, E, 1, 2, 3). */
export let skills: OwnedSkill[] = [];
export const skillIds = () => Object.keys(kit.skills);
export const def = (id: string) => kit.skills[id];
export const ownedTier = (id: string): number => skills.find((s) => s.id === id)?.tier ?? 0;

export function maxCharges(s: OwnedSkill) {
  return def(s.id).charges?.(s.tier) ?? 1;
}

/** Shared player resources several classes use. */
export const P = {
  /** Absorbs damage before health (Fighter shield generator, Mage nano armor). */
  shield: 0,
  /** Mage spell shield: blocks the next hit completely. */
  spellShield: false,
  /** Mage nano orbs. */
  orbs: 0,
};

/** Zones on the ground: fog and smoke hide what is inside, mines and traps wait for enemies. */
export type Zone = { kind: 'fog' | 'smoke' | 'dust' | 'spikes' | 'mine' | 'trap'; pos: Vector3; radius: number; t: number; mesh: Mesh; owner: Unit; tick?: number; data?: any };
export let zones: Zone[] = [];

export function resetKit() {
  skills = [];
  Object.assign(P, { shield: 0, spellShield: false, orbs: 0 });
  for (const z of zones) z.mesh.dispose();
  zones = [];
  kit.reset();
}

/** Learn a new skill or raise its tier. */
export function learn(id: string) {
  let s = skills.find((x) => x.id === id);
  if (!s) {
    s = { id, tier: 1, cd: 0, charges: 0 };
    skills.push(s);
  } else if (s.tier < 3) s.tier = (s.tier + 1) as Tier;
  s.charges = maxCharges(s);
  s.cd = 0;
  def(id).onLearn?.(s);
}

export function blockedReason(s: OwnedSkill): string | null {
  const d = def(s.id);
  if (d.orb && P.orbs < 1) return 'Nano küre yok';
  return d.blocked?.(s) ?? null;
}

export function castSlot(i: number) {
  const s = skills[i];
  if (!s || !G.player.alive || G.player.stunT > 0) return;
  const d = def(s.id);
  if (s.charges <= 0) {
    if (!d.whenEmpty?.(s)) host.message(`${d.name} bekleme süresinde`);
    return;
  }
  const reason = blockedReason(s);
  if (reason) {
    host.message(`${d.name}: ${reason}`);
    return;
  }
  if (d.weapon && host.weapon() !== d.weapon) host.setWeapon(d.weapon);
  if (d.cast(s)) {
    sfx.skill();
    castHooks.onCast();
    if (d.orb) P.orbs -= 1;
    s.charges -= 1;
    if (s.cd <= 0) s.cd = d.cooldown(s.tier);
  }
}

/** Refill skill charges over time. */
export function updateCooldowns(dt: number, rate = 1) {
  rate *= CDR.rate;
  for (const s of skills) {
    const max = maxCharges(s);
    if (s.charges < max) {
      s.cd -= dt * rate;
      if (s.cd <= 0) {
        s.charges += 1;
        s.cd = s.charges < max ? def(s.id).cooldown(s.tier) : 0;
      }
    }
  }
}

/** Put a skill straight back (Execute tier 3 and similar). */
export function refund(s: OwnedSkill) {
  s.cd = 0;
  s.charges = maxCharges(s);
}

/** How visible the player is to enemies. Fog and smoke hide the player too. */
export function playerVisibility() {
  if (inZone(G.player.pos, 'fog') || inZone(G.player.pos, 'smoke')) return 0;
  return kit.visibility?.() ?? 1;
}

export function playerFaded() {
  return kit.faded?.() ?? false;
}

// ---- Targeting helpers -------------------------------------------------------------
export const enemyOfPlayer = (u: Unit) => hostile(G.player, u) && u.team !== 0;

/** The unit closest to the crosshair, within range and a cone, that the player can see. */
export function targetUnderCrosshair(range: number, coneDeg: number, filter: (u: Unit) => boolean, needSight = true): Unit | null {
  const origin = G.camera.position;
  const aim = host.aimDir();
  let best: Unit | null = null;
  let bestAngle = (coneDeg * Math.PI) / 180;
  for (const u of G.units) {
    if (!filter(u) || flatDist(u.pos, G.player.pos) > range) continue;
    const to = chest(u).subtract(origin);
    const angle = Math.acos(Math.max(-1, Math.min(1, Vector3.Dot(to.normalize(), aim))));
    if (angle < bestAngle && (!needSight || lineOfSight(chest(G.player), chest(u)))) {
      bestAngle = angle;
      best = u;
    }
  }
  return best;
}

/** Nearest enemy in front of the player within melee reach. */
export function meleeTarget(range: number, arcDeg: number): Unit | null {
  return meleeTargets(range, arcDeg)[0] ?? null;
}

/** Every enemy in front of the player within reach, nearest first. */
export function meleeTargets(range: number, arcDeg: number, from: Unit = G.player): Unit[] {
  const fwd = forwardFromYaw(from.yaw);
  const half = ((arcDeg / 2) * Math.PI) / 180;
  const out: { u: Unit; d: number }[] = [];
  for (const u of G.units) {
    if (!hostile(from, u) || u.team === 0) continue;
    const to = u.pos.subtract(from.pos);
    if (Math.abs(to.y) > 1.8) continue;
    to.y = 0;
    const dist = to.length() - u.radius;
    if (dist > range) continue;
    const angle = Math.acos(Math.max(-1, Math.min(1, Vector3.Dot(to.normalize(), fwd))));
    if (dist < 0.6 || angle <= half) out.push({ u, d: dist });
  }
  return out.sort((a, b) => a.d - b.d).map((x) => x.u);
}

/** Enemies of the player within a radius of a point. */
/** Gear multipliers: area size (necklaces) and skill cooldown speed. */
export const AOE = { mult: 1 };
export const CDR = { rate: 1 };
/** Called after any skill is cast (the bandage stops). */
export const castHooks = { onCast: () => {} };

export function enemiesNear(p: Vector3, radius: number, height = 3): Unit[] {
  radius *= AOE.mult;
  return G.units.filter((u) => enemyOfPlayer(u) && flatDist(u.pos, p) <= radius + u.radius && Math.abs(u.pos.y - p.y) < height);
}

export function nearestEnemy(p: Vector3, range: number, filter: (u: Unit) => boolean = () => true): Unit | null {
  let best: Unit | null = null;
  let bd = range;
  for (const u of G.units) {
    if (!enemyOfPlayer(u) || !filter(u)) continue;
    const d = flatDist(u.pos, p);
    if (d < bd) {
      bd = d;
      best = u;
    }
  }
  return best;
}

/** A free spot right behind a unit (tries the sides if a wall is there). */
export function behind(t: Unit): Vector3 {
  const f = forwardFromYaw(t.yaw);
  const r = rightFromYaw(t.yaw);
  const dist = t.radius + 0.9;
  for (const off of [f.scale(-dist), f.scale(-dist).add(r.scale(0.8)), f.scale(-dist).add(r.scale(-0.8)), r.scale(dist), r.scale(-dist)]) {
    const p = t.pos.add(off);
    if (!pointHitsObstacle(p.add(new Vector3(0, 1, 0)), G.world.boxes)) return p;
  }
  return t.pos.add(f.scale(-dist));
}

/** Farthest free point along a flat direction, up to `dist` (for blinks and leaps). */
export function freePointAlong(from: Vector3, dir: Vector3, dist: number): Vector3 {
  const d = new Vector3(dir.x, 0, dir.z).normalize();
  let last = from.clone();
  for (let s = 0.4; s <= dist; s += 0.4) {
    const p = from.add(d.scale(s));
    if (pointHitsObstacle(p.add(new Vector3(0, 1, 0)), G.world.boxes)) break;
    last = p;
  }
  return last;
}

/**
 * Shove a unit along a flat direction. Returns true if it slammed into a wall on the way
 * (Sonic boom tier 3, Piercing spear pin).
 */
export function push(u: Unit, dir: Vector3, dist: number): boolean {
  const d = new Vector3(dir.x, 0, dir.z);
  if (d.lengthSquared() < 1e-6) return false;
  d.normalize();
  const steps = Math.ceil(dist / 0.25);
  for (let i = 0; i < steps; i++) {
    const before = u.pos.clone();
    u.pos.addInPlace(d.scale(dist / steps));
    resolveWalls(u.pos, u.radius, u.height, G.world.boxes);
    if (flatDist(before, u.pos) < (dist / steps) * 0.5) return true;
  }
  return false;
}

/** Is there a wall right behind a unit, seen from the attacker's direction? */
export function wallBehind(u: Unit, dir: Vector3, gap = 1.2): boolean {
  const d = new Vector3(dir.x, 0, dir.z).normalize();
  const p = chest(u).add(d.scale(u.radius + gap));
  return pointHitsObstacle(p, G.world.boxes);
}

/** Is there a wall, tree or box anywhere up to `maxGap` m behind `u` along `dir`? */
export function obstacleWithin(u: Unit, dir: Vector3, maxGap: number): boolean {
  const d = new Vector3(dir.x, 0, dir.z).normalize();
  for (let g = 0.3; g <= maxGap + 1e-3; g += 0.3) {
    if (pointHitsObstacle(chest(u).add(d.scale(u.radius + g)), G.world.boxes)) return true;
  }
  return false;
}

// ---- Effects --------------------------------------------------------------------------
export function puff(at: Vector3, color: string, size = 1) {
  spawnFx(MeshBuilder.CreateSphere('puff', { diameter: size, segments: 8 }, G.scene), at.add(new Vector3(0, 1, 0)), color, 0.35, 2.5, 0.45);
}

export function slash(color: string, radius = 2.2, arc = 0.3, yaw = G.player.yaw, tilt = 0) {
  const disc = MeshBuilder.CreateDisc('kslash', { radius, arc, tessellation: 18 }, G.scene);
  disc.rotation.x = Math.PI / 2;
  disc.rotation.z = tilt;
  disc.rotation.y = yaw - Math.PI / 2 + arc * Math.PI;
  spawnFx(disc, G.player.pos.add(new Vector3(0, 1.1, 0)), color, 0.15, 0, 0.7);
}

/** A flat ring on the ground that shows an area. */
export function areaFx(at: Vector3, radius: number, color: string, t = 0.35, alpha = 0.35) {
  const disc = MeshBuilder.CreateDisc('area', { radius, tessellation: 32 }, G.scene);
  disc.rotation.x = Math.PI / 2;
  return spawnFx(disc, at.add(new Vector3(0, 0.06, 0)), color, t, 0, alpha);
}

/** A beam from a to b (lasers, sunray). */
export function beamFx(a: Vector3, b: Vector3, color: string, t = 0.12, width = 0.12) {
  const d = b.subtract(a);
  const len = d.length();
  if (len < 0.01) return;
  const m = MeshBuilder.CreateBox('beam', { width, height: width, depth: len }, G.scene);
  spawnFx(m, a.add(d.scale(0.5)), color, t, 0, 0.85);
  m.lookAt(b);
}

// ---- Zones -------------------------------------------------------------------------------
export function addZone(kind: Zone['kind'], pos: Vector3, radius: number, t: number, color: string, alpha: number, data?: any): Zone {
  const tall = kind === 'fog' || kind === 'smoke';
  const mesh = tall
    ? MeshBuilder.CreateSphere(`zone-${kind}`, { diameter: radius * 2, segments: 12, slice: 0.55 }, G.scene)
    : MeshBuilder.CreateDisc(`zone-${kind}`, { radius, tessellation: 28 }, G.scene);
  if (!tall) mesh.rotation.x = Math.PI / 2;
  mesh.position.copyFrom(pos).addInPlaceFromFloats(0, tall ? -radius * 0.1 : 0.07, 0);
  mesh.material = glowMat(color, alpha);
  mesh.isPickable = false;
  const z: Zone = { kind, pos: pos.clone(), radius, t, mesh, owner: G.player, data };
  zones.push(z);
  return z;
}

export function inZone(p: Vector3, kind: Zone['kind']) {
  return zones.some((z) => z.kind === kind && flatDist(z.pos, p) < z.radius);
}

export function updateZones(dt: number) {
  zones = zones.filter((z) => {
    z.t -= dt;
    if (z.t <= 0) z.mesh.dispose();
    return z.t > 0;
  });
}

/**
 * Can `viewer` see `t`? Fog and smoke hide whoever is inside from anyone outside
 * (very close you still see a shape).
 */
export function hiddenByZone(viewer: Vector3, t: Vector3) {
  for (const z of zones) {
    if (z.kind !== 'fog' && z.kind !== 'smoke') continue;
    const tIn = flatDist(z.pos, t) < z.radius;
    const vIn = flatDist(z.pos, viewer) < z.radius;
    if (tIn && !vIn && flatDist(viewer, t) > 2.5) return true;
  }
  return false;
}

// ---- Weapons ---------------------------------------------------------------------------
/** Bullet from the muzzle to the point under the crosshair. */
export function aimedShotDir(range: number) {
  const from = host.muzzle();
  return { from, dir: host.aimPoint(range).subtract(from) };
}

/** Instant hit along the aim (lasers, sniper). Returns the unit hit, if any, and the end point. */
export function hitscan(range: number, filter: (u: Unit) => boolean = enemyOfPlayer, pierce = 1) {
  const from = host.muzzle();
  const end = host.aimPoint(range);
  const dir = end.subtract(from).normalize();
  const hits: Unit[] = [];
  let point = from.add(dir.scale(range));
  for (let s = 0.3; s <= range; s += 0.25) {
    const p = from.add(dir.scale(s));
    if (pointHitsObstacle(p, G.world.boxes)) {
      point = p;
      break;
    }
    for (const u of G.units) {
      if (hits.includes(u) || !filter(u)) continue;
      if (p.y > u.pos.y && p.y < u.pos.y + u.height && flatDist(p, u.pos) < u.radius + 0.1) hits.push(u);
    }
    if (hits.length >= pierce) {
      point = p;
      break;
    }
  }
  return { hits, point, from, dir };
}

/** A melee sweep in front of the player. Returns the units hit. */
export function sweep(range: number, arcDeg: number, damage: number, color: string, opts: { poison?: boolean; tilt?: number } = {}): Unit[] {
  const hit = meleeTargets(range, arcDeg);
  if (damage > 0) for (const u of hit) dealDamage(G.player, u, damage, { poison: opts.poison });
  const arc = MeshBuilder.CreateDisc('slash', { radius: range, arc: arcDeg / 360, tessellation: 20 }, G.scene);
  arc.rotation.x = Math.PI / 2;
  arc.rotation.z = opts.tilt ?? 0;
  arc.rotation.y = G.player.yaw - Math.PI / 2 + ((arcDeg / 2) * Math.PI) / 180;
  spawnFx(arc, G.player.pos.add(new Vector3(0, 1.1, 0)), color, 0.12, 0, 0.55);
  sfx.swing();
  kick(0.004, 0, 0.01, 0.04);
  return hit;
}

const solid = new Map<string, StandardMaterial>();
/** A plain unlit glowing material (weapons stay solid even in the watercolor look). */
export function solidGlow(color: string) {
  let m = solid.get(color);
  if (!m) {
    m = new StandardMaterial(`solid-${color}`, G.scene);
    m.emissiveColor = Color3.FromHexString(color);
    m.diffuseColor = Color3.Black();
    m.disableLighting = true;
    solid.set(color, m);
  }
  return m;
}

/** A glowing stick-shaped weapon part (blades, staffs, wands, claws). */
export function weaponPart(name: string, parent: TransformNode, size: { w: number; h: number; d: number }, pos: [number, number, number], color: string, glow = true, rot?: [number, number, number]): Mesh {
  const m = MeshBuilder.CreateBox(name, { width: size.w, height: size.h, depth: size.d }, G.scene);
  if (glow) m.material = solidGlow(color);
  else {
    const mat = new StandardMaterial(`${name}-mat`, G.scene);
    mat.diffuseColor = Color3.FromHexString(color);
    mat.specularColor = new Color3(0.2, 0.2, 0.2);
    m.material = mat;
  }
  m.parent = parent;
  m.position.set(...pos);
  if (rot) m.rotation.set(...rot);
  m.isPickable = false;
  return m;
}

// ---- Allies (Scout beasts, Mage robots) ---------------------------------------------------

/**
 * Move an ally toward a target and attack it. Melee allies bite or punch, ranged ones shoot
 * through `shoot`. Returns the distance to the target.
 */
export function allyChase(a: Unit, t: Unit, speed: number, reach: number, dt: number) {
  faceTowards(a, t.pos, dt, 12);
  const dist = flatDist(a.pos, t.pos) - t.radius;
  if (dist > reach) moveUnit(a, t.pos.subtract(a.pos), speed, dt);
  else moveUnit(a, Vector3.Zero(), 0, dt);
  return dist;
}

/** Follow the player when there is nothing to fight. */
export function allyFollow(a: Unit, dt: number, speed: number, side = 1) {
  const p = G.player;
  const spot = p.pos.add(rightFromYaw(p.yaw).scale(1.6 * side)).add(forwardFromYaw(p.yaw).scale(-1));
  const d = flatDist(a.pos, spot);
  if (d > 1) {
    faceTowards(a, spot, dt);
    moveUnit(a, spot.subtract(a.pos), Math.min(speed * 1.3, speed * (d / 3)), dt);
  } else moveUnit(a, Vector3.Zero(), 0, dt);
  // Teleport back if left far behind.
  if (d > 40) a.pos.copyFrom(spot);
}

export const allies = (kind: string) => G.units.filter((u) => u.kind === 'pet' && u.owner === G.player && u.ai?.type === kind);

export function removeAllies(kind: string) {
  for (const a of allies(kind)) removeUnit(a);
}

/** A simple procedural body for robots and beasts (no rigged model yet). */
export function partsBody(name: string, parts: { size: [number, number, number]; pos: [number, number, number]; color: string; glow?: boolean; sphere?: boolean }[], hpColor = '#7ad7ff'): ActorBody {
  const root = new TransformNode(name, G.scene);
  const bodyMat = new StandardMaterial(`${name}-mat`, G.scene);
  bodyMat.diffuseColor = Color3.FromHexString(parts[0].color);
  bodyMat.specularColor = new Color3(0.15, 0.15, 0.15);
  const meshes: Mesh[] = [];
  parts.forEach((p, i) => {
    const m = p.sphere
      ? MeshBuilder.CreateSphere(`${name}-p${i}`, { diameter: p.size[0], segments: 10 }, G.scene)
      : MeshBuilder.CreateBox(`${name}-p${i}`, { width: p.size[0], height: p.size[1], depth: p.size[2] }, G.scene);
    m.parent = root;
    m.position.set(...p.pos);
    if (p.glow) m.material = glowMat(p.color);
    else if (i === 0) m.material = bodyMat;
    else {
      const mm = bodyMat.clone(`${name}-mat${i}`);
      mm.diffuseColor = Color3.FromHexString(p.color);
      m.material = mm;
    }
    m.isPickable = true;
    G.world.shadows.addShadowCaster(m);
    meshes.push(m);
  });
  const hpBar = MeshBuilder.CreatePlane(`${name}-hp`, { width: 0.8, height: 0.08 }, G.scene);
  hpBar.parent = root;
  hpBar.position.y = Math.max(...parts.map((p) => p.pos[1] + p.size[1] / 2)) + 0.35;
  hpBar.billboardMode = Mesh.BILLBOARDMODE_ALL;
  hpBar.isPickable = false;
  hpBar.material = glowMat(hpColor);
  return { root, meshes, bodyMat, baseColor: bodyMat.diffuseColor.clone(), hpBar };
}

export function damageFromAlly(a: Unit, t: Unit, amount: number) {
  dealDamage(a, t, amount, { noBackstab: true, at: chest(t) });
}
