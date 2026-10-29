/**
 * Shared state and combat rules of the balance simulator.
 * The world is flat 2D (x, z). There is no aiming: every shot rolls a hit chance from
 * the shooter's aim, the weapon and the distance.
 */
import {
  CLASSES,
  CURRENCY,
  MAX_LEVEL,
  PASSIVES,
  TOKEN_PRICE,
  XP_REWARD,
  XP_TO_NEXT,
  BOSS,
  type ClassId,
  type MobRole,
  type RegionId,
} from './config.ts';

export type Kind = 'player' | 'mob' | 'boss' | 'pet' | 'decoy';

export type Dot = { dps: number; t: number; src: Unit | null };

export type OwnedSkill = { id: string; tier: number; cd: number; charges: number };

export type PlayerState = {
  cls: ClassId;
  /** The user's playstyle for this build (duels only), see PLANS in match.ts. */
  plan?: string;
  style: string;
  level: number;
  xp: number;
  xpBy: { mob: number; player: number; boss: number };
  skills: OwnedSkill[];
  currency: number;
  aim: number;
  aggression: number;
  /** Preferred fighting distance (0 = melee). */
  wantRange: number;
  melee: boolean;
  // Class resources and timers.
  orbs: number;
  orbT: number;
  spellShield: boolean;
  spellT: number;
  genT: number;
  vehicle: boolean;
  beast: Unit | null;
  beastWait: number;
  poisonCoatT: number;
  poisonPerm: boolean;
  poisonBoostT: number;
  secondT: number;
  secondRate: number;
  secondWave: boolean;
  whirlT: number;
  whirlDmg: number;
  eshieldT: number;
  eshieldHp: number;
  eshieldStored: number;
  eshieldWave: boolean;
  sprintT: number;
  sprintHaste: boolean;
  stillT: number;
  trailCd: number;
  fadeNearT: number;
  fadeCd: number;
  // Stats for the report.
  kills: number;
  bossKills: number;
  mobKills: number;
  dmgDealt: number;
  dmgToPlayers: number;
  dmgTaken: number;
  levelAt: number[];
  place: number;
  deathMin: number;
  killedBy: string;
};

export type Unit = {
  id: number;
  kind: Kind;
  name: string;
  x: number;
  z: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  speed: number;
  owner: Unit | null;
  target: Unit | null;
  // Status effects.
  stunT: number;
  slowT: number;
  slowAmt: number;
  shield: number;
  shieldT: number;
  drT: number;
  drAmt: number;
  immuneT: number;
  stealthT: number;
  /** Faded (Gölge izi): hard to spot and hit from range. */
  fadeT: number;
  /** Hits taken (copies die after 2 hits). */
  hitsTaken: number;
  /** Fighter spears stuck in this unit, waiting for a recall. */
  spearsIn: number;
  /** Where the unit is looking (unit vector, 0,0 = unknown). */
  faceX: number;
  faceZ: number;
  fogT: number;
  hasteT: number;
  hasteAmt: number;
  speedT: number;
  speedAmt: number;
  dmgBuffT: number;
  dmgBuffAmt: number;
  lsBuffT: number;
  lsBuffAmt: number;
  markT: number;
  markAmt: number;
  noHealT: number;
  backstabT: number;
  highT: number;
  smokeT: number;
  dots: Dot[];
  lastCombat: number;
  lastHitBy: Unit | null;
  lastHitAt: number;
  // Attacks.
  atkT: number;
  ammo: number;
  reloadT: number;
  ammoRegenT: number;
  chargeT: number;
  // Mobs, bosses and pets.
  dmg: number;
  rate: number;
  range: number;
  aggro: number;
  leash: number;
  homeX: number;
  homeZ: number;
  xpMult: number;
  region: RegionId | null;
  role: MobRole | null;
  campId: number;
  slamT: number;
  rockT: number;
  life: number;
  hitsCount: number;
  stunEvery: number;
  bossDamage: Map<Unit, number> | null;
  p: PlayerState | null;
};

// ---- World state ----------------------------------------------------------
export type Pending = { t: number; fn: () => void };
export type Obstacle = { x: number; z: number; r: number; kind: 'building' | 'tree' | 'platform' };

/** True when a building or tree stands between a and b. */
export function losBlocked(a: { x: number; z: number }, b: { x: number; z: number }): boolean {
  for (const o of W.obstacles) {
    if (o.kind === 'platform') continue;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len2 = dx * dx + dz * dz || 1e-6;
    const t = Math.max(0, Math.min(1, ((o.x - a.x) * dx + (o.z - a.z) * dz) / len2));
    const px = a.x + dx * t - o.x;
    const pz = a.z + dz * t - o.z;
    if (px * px + pz * pz < o.r * o.r) return true;
  }
  return false;
}
/** An obstacle (wall, tree, box) right behind `t` as seen from `from`: a spear would pin `t` to it. */
export function wallBehind(from: { x: number; z: number }, t: { x: number; z: number }, reach = 3): boolean {
  const d = Math.max(0.01, Math.hypot(t.x - from.x, t.z - from.z));
  const dx = (t.x - from.x) / d;
  const dz = (t.z - from.z) / d;
  return W.obstacles.some((o) => {
    const ox = o.x - t.x;
    const oz = o.z - t.z;
    const along = ox * dx + oz * dz;
    const side = Math.abs(ox * dz - oz * dx);
    return along > 0 && along - o.r < reach && side < o.r + 0.5;
  });
}

export const onPlatform = (u: { x: number; z: number }) => W.obstacles.some((o) => o.kind === 'platform' && Math.hypot(u.x - o.x, u.z - o.z) < o.r);

export const W = {
  time: 0,
  units: [] as Unit[],
  players: [] as Unit[],
  pending: [] as Pending[],
  rand: Math.random as () => number,
  nextId: 1,
  /** Log of XP by source, per class. */
  events: [] as { t: number; type: string; a?: string; b?: string; v?: number }[],
  duel: false,
  /** Arena only: buildings and trees block shots and sight; platforms are high ground. */
  obstacles: [] as Obstacle[],
  onKill: [] as ((victim: Unit, killer: Unit | null) => void)[],
};

export const minutes = () => W.time / 60;

export function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

export function later(delay: number, fn: () => void) {
  W.pending.push({ t: W.time + delay, fn });
}

export const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const pick = <T>(a: T[]): T => a[Math.floor(W.rand() * a.length)];

/** The player behind a pet or decoy. */
export const master = (u: Unit | null): Unit | null => (u ? (u.owner ? u.owner : u) : null);

export function hostile(a: Unit, b: Unit): boolean {
  if (!a.alive || !b.alive || a === b) return false;
  const ma = master(a)!;
  const mb = master(b)!;
  if (ma === mb) return false;
  const wild = (k: Kind) => k === 'mob' || k === 'boss';
  if (wild(a.kind) && wild(b.kind)) return false;
  return true;
}

export function makeUnit(kind: Kind, name: string, x: number, z: number, hp: number, extra: Partial<Unit> = {}): Unit {
  const u: Unit = {
    id: W.nextId++,
    kind,
    name,
    x,
    z,
    hp,
    maxHp: hp,
    alive: true,
    speed: 7,
    owner: null,
    target: null,
    stunT: 0,
    slowT: 0,
    slowAmt: 0,
    shield: 0,
    shieldT: 0,
    drT: 0,
    drAmt: 0,
    immuneT: 0,
    stealthT: 0,
    fadeT: 0,
    hitsTaken: 0,
    spearsIn: 0,
    faceX: 0,
    faceZ: 0,
    fogT: 0,
    hasteT: 0,
    hasteAmt: 0,
    speedT: 0,
    speedAmt: 0,
    dmgBuffT: 0,
    dmgBuffAmt: 0,
    lsBuffT: 0,
    lsBuffAmt: 0,
    markT: 0,
    markAmt: 0,
    noHealT: 0,
    backstabT: 0,
    highT: 0,
    smokeT: 0,
    dots: [],
    lastCombat: -99,
    lastHitBy: null,
    lastHitAt: -99,
    atkT: 0,
    ammo: 0,
    reloadT: 0,
    ammoRegenT: 0,
    chargeT: 0,
    dmg: 0,
    rate: 1,
    range: 2,
    aggro: 12,
    leash: 30,
    homeX: x,
    homeZ: z,
    xpMult: 1,
    region: null,
    role: null,
    campId: -1,
    slamT: 0,
    rockT: 0,
    life: Infinity,
    hitsCount: 0,
    stunEvery: 0,
    bossDamage: null,
    p: null,
    ...extra,
  };
  W.units.push(u);
  return u;
}

// ---- Hit chance -----------------------------------------------------------
/** Chance that a ranged shot or skill shot from `src` hits `dst` at distance `d`. */
export function hitChance(src: Unit, dst: Unit, d: number, range: number, acc = 1): number {
  if (dst.stealthT > 0 && d > 4) return 0;
  if (W.obstacles.length && losBlocked(src, dst)) return 0;
  const m = master(src);
  let aim = m?.p ? m.p.aim : 0.6;
  // Mobs walk straight at you: easy to hit.
  if (dst.kind === 'mob' || dst.kind === 'boss') aim = Math.min(0.97, aim + 0.2);
  let c = aim * acc * clamp(1.1 - (0.6 * d) / range, 0.3, 1);
  if (dst.smokeT > 0 || dst.fogT > 0) c *= 0.35;
  if (src.smokeT > 0 || src.fogT > 0) c *= 0.6;
  if (dst.fadeT > 0 && d > PASSIVES.rogueFade.near) c *= PASSIVES.rogueFade.hitMult;
  return clamp(c, 0, 0.98);
}

export function canSee(src: Unit, dst: Unit): boolean {
  if (!dst.alive) return false;
  const d = dist(src, dst);
  if (dst.stealthT > 0 && d > 4) return false;
  if (dst.fogT > 0 && d > 6) return false;
  if (dst.fadeT > 0 && d > PASSIVES.rogueFade.see) return false;
  if (W.obstacles.length && d > 6 && losBlocked(src, dst)) return false;
  return true;
}

/** True when `a` stands behind `t` (outside a 240° cone in front of where `t` looks). */
export function isBehind(a: Unit, t: Unit): boolean {
  if (!t.faceX && !t.faceZ) return false;
  const d = Math.max(0.01, dist(a, t));
  return ((a.x - t.x) * t.faceX + (a.z - t.z) * t.faceZ) / d < PASSIVES.rogue2.behindDot;
}

// ---- Damage ---------------------------------------------------------------
export type DmgType = 'melee' | 'ranged' | 'skill' | 'aoe' | 'dot' | 'storm' | 'pet';

/** Damage bonus of a player (level, buffs, tuning knob). */
export function powerMult(u: Unit): number {
  const p = u.p;
  if (!p) return 1;
  const c = CLASSES[p.cls];
  return c.dmgMult * (1 + c.dmgPerLevel * (p.level - 1)) * (1 + (u.dmgBuffT > 0 ? u.dmgBuffAmt : 0));
}

export function damage(src: Unit | null, dst: Unit, raw: number, type: DmgType): number {
  if (!dst.alive || raw <= 0) return 0;
  const owner = master(src);
  let dmg = raw;
  if (src && src.p && type !== 'dot') {
    dmg *= powerMult(src);
    // Rogue Backstab: after Wink, or a small chance in melee brawls (circling the target).
    if (src.p.cls === 'rogue' && (type === 'melee' || type === 'skill' || type === 'ranged')) {
      const behind =
        src.backstabT > 0 ||
        (type === 'melee' && PASSIVES.rogue2.on && isBehind(src, dst)) ||
        (type === 'melee' && W.rand() < (dst.kind === 'player' ? 0.15 : 0.05));
      if (behind) dmg *= PASSIVES.rogue.backstabMult;
    }
    // Scout high ground: some ranged shots come from above (after Kanca, always).
    if (src.p.cls === 'scout' && type === 'ranged' && (src.highT > 0 || (!W.obstacles.length && W.rand() < PASSIVES.scout.highGroundChance)))
      dmg *= PASSIVES.scout.highGroundMult;
  }
  if (dst.markT > 0) dmg *= 1 + dst.markAmt;
  if (dst.immuneT > 0 && type !== 'storm') dmg = 0;
  const dp = dst.p;
  if (dp && dmg > 0 && type !== 'storm' && type !== 'dot') {
    if (dp.cls === 'mage' && dp.spellShield) {
      dp.spellShield = false;
      dp.spellT = 0;
      dmg = 0;
    }
    // Fighter energy shield blocks shots from the front.
    if (dp.eshieldT > 0 && (type === 'ranged' || type === 'skill') && dmg > 0) {
      const blocked = Math.min(dmg, dp.eshieldHp);
      dp.eshieldHp -= blocked;
      dp.eshieldStored += blocked;
      dmg -= blocked;
      if (dp.eshieldHp <= 0) dp.eshieldT = 0;
    }
  }
  if (dst.drT > 0) dmg *= 1 - dst.drAmt;
  if (dst.shield > 0 && type !== 'storm') {
    const a = Math.min(dst.shield, dmg);
    dst.shield -= a;
    dmg -= a;
  }
  // Taking damage or attacking ends the faded look.
  if (dmg > 0 && type !== 'storm') dst.fadeT = 0;
  if (owner) owner.fadeT = 0;
  dst.hp -= dmg;
  // Copies die to two hits, whatever the damage.
  if (dst.kind === 'decoy' && dmg > 0 && ++dst.hitsTaken >= 2) dst.hp = Math.min(dst.hp, 0);
  const now = W.time;
  if (type !== 'storm') {
    dst.lastCombat = now;
    if (src) src.lastCombat = now;
    if (owner) owner.lastCombat = now;
  }
  if (owner && owner.kind === 'player') {
    dst.lastHitBy = owner;
    dst.lastHitAt = now;
    owner.p!.dmgDealt += dmg;
    if (dst.kind === 'player') owner.p!.dmgToPlayers += dmg;
    // Fighter lifesteal.
    if (owner.p!.cls === 'fighter' && owner.noHealT <= 0) {
      const ls = PASSIVES.fighter.lifesteal + (owner.lsBuffT > 0 ? owner.lsBuffAmt : 0);
      heal(owner, dmg * ls);
    }
    if (dst.bossDamage) dst.bossDamage.set(owner, (dst.bossDamage.get(owner) ?? 0) + dmg);
  }
  if (dp) dp.dmgTaken += dmg;
  // Mobs and bosses turn on whoever hits them.
  if ((dst.kind === 'mob' || dst.kind === 'boss') && src && src.alive && (!dst.target || !dst.target.alive)) dst.target = src;
  if (dst.hp <= 0) kill(dst, src);
  return dmg;
}

export function heal(u: Unit, amount: number) {
  if (!u.alive || u.noHealT > 0) return;
  u.hp = Math.min(u.maxHp, u.hp + amount);
}

/** Damage everything hostile to `src` within `r` of a point. Returns how many were hit. */
export function aoe(src: Unit, x: number, z: number, r: number, dmg: number, type: DmgType = 'aoe', each?: (u: Unit) => void, chance = 1): number {
  let n = 0;
  for (const u of W.units) {
    if (!hostile(src, u) || u.kind === 'decoy') continue;
    if (Math.hypot(u.x - x, u.z - z) > r) continue;
    // Players dodge ground effects sometimes; mobs never.
    if (u.kind === 'player' && W.rand() > chance) continue;
    n++;
    damage(src, u, dmg, type);
    if (each && u.alive) each(u);
  }
  return n;
}

export function stun(u: Unit, t: number) {
  if (u.kind === 'boss') t *= 0.3;
  if (u.immuneT > 0) return;
  u.stunT = Math.max(u.stunT, t);
}
export function slow(u: Unit, amt: number, t: number) {
  u.slowAmt = Math.max(u.slowT > 0 ? u.slowAmt : 0, amt);
  u.slowT = Math.max(u.slowT, t);
}
export function dot(u: Unit, src: Unit, dps: number, t: number, key?: string) {
  if (key) {
    const old = u.dots.find((d) => (d as Dot & { key?: string }).key === key && d.src === src);
    if (old) {
      old.t = Math.max(old.t, t);
      old.dps = Math.max(old.dps, dps);
      return;
    }
  }
  u.dots.push(Object.assign({ dps, t, src }, key ? { key } : {}));
}

export function moveToward(u: Unit, x: number, z: number, mult = 1) {
  if (u.stunT > 0) return;
  const d = Math.hypot(x - u.x, z - u.z);
  if (d < 0.01) return;
  const step = Math.min(d, speedOf(u) * mult * DT());
  u.x += ((x - u.x) / d) * step;
  u.z += ((z - u.z) / d) * step;
}
export function moveAway(u: Unit, from: { x: number; z: number }, mult = 1) {
  const d = Math.max(0.01, dist(u, from));
  moveToward(u, u.x + ((u.x - from.x) / d) * 10, u.z + ((u.z - from.z) / d) * 10, mult);
}
/** Instantly move up to `dist` toward a point (teleports, leaps, pulls). */
export function jump(u: Unit, x: number, z: number, maxD: number, stopShort = 0) {
  const d = Math.hypot(x - u.x, z - u.z);
  const go = Math.max(0, Math.min(maxD, d - stopShort));
  if (d < 0.01) return;
  u.x += ((x - u.x) / d) * go;
  u.z += ((z - u.z) / d) * go;
}

export function speedOf(u: Unit): number {
  let s = u.speed;
  if (u.slowT > 0) s *= 1 - u.slowAmt;
  if (u.speedT > 0) s *= u.speedAmt;
  return s;
}

let dtValue = 0.1;
export const DT = () => dtValue;
export const setDt = (v: number) => (dtValue = v);

// ---- XP, levels and kills -------------------------------------------------
export const xpNeeded = (level: number) => XP_TO_NEXT[level - 1] ?? Infinity;

/** Set by the match: picks a card when a player levels up. */
export const hooks = {
  levelUp: (_u: Unit) => {},
  death: (_u: Unit, _killer: Unit | null) => {},
};

export function grantXp(u: Unit, amount: number, source: 'mob' | 'player' | 'boss') {
  const p = u.p!;
  if (!u.alive || p.level >= MAX_LEVEL) return;
  p.xp += amount;
  p.xpBy[source] += amount;
  while (p.level < MAX_LEVEL && p.xp >= xpNeeded(p.level)) {
    p.xp -= xpNeeded(p.level);
    p.level += 1;
    p.levelAt[p.level] = minutes();
    const c = CLASSES[p.cls];
    u.maxHp += c.hpPerLevel;
    u.hp += c.hpPerLevel;
    hooks.levelUp(u);
  }
  if (p.level >= MAX_LEVEL) p.xp = 0;
}

export function kill(victim: Unit, src: Unit | null) {
  if (!victim.alive) return;
  victim.alive = false;
  victim.hp = 0;
  let killer = master(src);
  // Killed by a mob, the storm or a dot without a source: credit the last player who hit it lately.
  if ((!killer || killer.kind !== 'player') && victim.lastHitBy && W.time - victim.lastHitAt < 10) killer = victim.lastHitBy;
  if (killer && (killer.kind !== 'player' || !killer.alive)) killer = killer.kind === 'player' ? killer : null;
  const min = minutes();
  if (victim.kind === 'mob' && killer?.p) {
    grantXp(killer, Math.round(XP_REWARD.mob(min) * victim.xpMult), 'mob');
    killer.p.mobKills++;
    if (W.rand() < CURRENCY.mobChance) killer.p.currency += CURRENCY.mob;
  }
  if (victim.kind === 'boss') {
    const xp = Math.round(XP_REWARD.boss(min) * victim.xpMult);
    if (killer?.p) {
      grantXp(killer, xp, 'boss');
      killer.p.bossKills++;
      killer.p.currency += CURRENCY.boss;
    }
    if (XP_REWARD.bossAssist > 0 && victim.bossDamage) {
      for (const [u, d] of victim.bossDamage) if (u !== killer && u.alive && d >= victim.maxHp * 0.1) grantXp(u, Math.round(xp * XP_REWARD.bossAssist), 'boss');
    }
    W.events.push({ t: min, type: 'boss', a: victim.name, b: killer?.p ? killer.p.cls : 'none' });
  }
  if (victim.kind === 'player') {
    if (killer?.p && killer !== victim) {
      grantXp(killer, XP_REWARD.player(victim.p!.level), 'player');
      killer.p.kills++;
      killer.p.currency += CURRENCY.player;
    }
    victim.p!.killedBy = killer?.p ? killer.p.cls : src ? src.kind : 'storm';
    for (const u of W.units) if (u.owner === victim) u.alive = false;
  }
  for (const f of W.onKill) f(victim, killer);
  hooks.death(victim, killer);
}

export { TOKEN_PRICE, BOSS };
