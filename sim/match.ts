/**
 * One battle royale match on the 5-region map, or a 1v1 duel.
 * 20 simulated players (5 per class) drop at random spots, farm mob camps, hunt bosses,
 * fight each other and follow the shrinking ring. Last one alive wins.
 */
import { equip, gearDashCost, gearScoreOf, bandaging, gearCd, gearAtk, gearCharge, gearDash, gearHeat, gearMag, gearReach, gearThink, gearTick, ramDash, slamDmg, resetGear, stopBandage } from './gear.ts';
import type { Loadout } from '../src/gear.ts';
import {
  AI,
  AIM,
  BOSS,
  BOSS_NAMES,
  BOSS_SCHEDULE,
  CATHEDRAL_RADIUS,
  CLASSES,
  CLASS_IDS,
  MAP_HALF,
  MATCH,
  MAX_SKILLS,
  MOVE,
  MOBS,
  MOB_NAMES,
  MOB_ROLES,
  PASSIVES,
  REGIONS,
  RING,
  TOKEN_PRICE,
  VEHICLE,
  type ClassId,
  type MobRole,
  type RegionId,
} from './config.ts';
import {
  W,
  aoe,
  canSee,
  DT,
  clamp,
  damage,
  dist,
  dot,
  grantXp,
  heal,
  hitChance,
  hooks,
  hostile,
  jump,
  losBlocked,
  isBehind,
  wallBehind,
  makeUnit,
  onPlatform,
  minutes,
  moveAway,
  moveToward,
  pick,
  powerMult,
  seeded,
  setDt,
  slow,
  stun,
  xpNeeded,
  type Obstacle,
  type Unit,
} from './core.ts';
import { F, POOL, SKILLS, STYLES, decoysOf, makeDecoy, spawnBeast } from './kits.ts';
import { spTick, spend, tryDodge, tryStunBreak, trySpecial, wantSprint } from './move.ts';
import { SHOP_SIM, buildVendors, clearVendors, sampleDistance, shopAt, shopGoal } from './shop.ts';
import type { VendorSpot } from '../src/mapgen/vendors.ts';
import './tuning.ts';
import './variants.ts';

// ---- Map ------------------------------------------------------------------
export function regionAt(x: number, z: number): RegionId {
  if (Math.hypot(x, z) < CATHEDRAL_RADIUS) return 'katedral';
  if (x < 0) return z > 0 ? 'mantar' : 'maymun';
  return z > 0 ? 'sehir' : 'col';
}

type Camp = { id: number; region: RegionId; x: number; z: number; respawnT: number; mobs: Unit[] };
type BossLair = { region: RegionId; x: number; z: number; minute: number; unit: Unit | null; spawned: boolean; resetT: number };

let camps: Camp[] = [];
let lairs: BossLair[] = [];

function randomSpotIn(region: RegionId): { x: number; z: number } {
  for (;;) {
    const x = (W.rand() * 2 - 1) * (MAP_HALF - 25);
    const z = (W.rand() * 2 - 1) * (MAP_HALF - 25);
    if (regionAt(x, z) === region) return { x, z };
  }
}

function buildCamps() {
  camps = [];
  for (const r of Object.keys(REGIONS) as RegionId[]) {
    const placed: { x: number; z: number }[] = [];
    for (let i = 0, tries = 0; i < REGIONS[r].camps && tries < 2000; tries++) {
      const s = randomSpotIn(r);
      if (placed.some((p) => dist(p, s) < 55)) continue;
      placed.push(s);
      camps.push({ id: camps.length, region: r, x: s.x, z: s.z, respawnT: 0, mobs: [] });
      i++;
    }
  }
  for (const c of camps) spawnPack(c);
  lairs = BOSS_SCHEDULE.map(([minute, region]) => {
    const s = region === 'katedral' ? { x: 0, z: 0 } : randomSpotIn(region);
    return { region, minute, x: s.x, z: s.z, unit: null, spawned: false, resetT: 0 };
  });
}

function spawnPack(c: Camp) {
  const n = MOBS.packMin + Math.floor(W.rand() * (MOBS.packMax - MOBS.packMin + 1));
  const R = REGIONS[c.region];
  const min = minutes();
  c.mobs = [];
  for (let i = 0; i < n; i++) {
    const role: MobRole = i === 0 && n >= 3 ? 'tank' : W.rand() < 0.5 ? 'swarm' : 'ranged';
    const M = MOB_ROLES[role];
    const hp = MOBS.hp(min) * M.hp * R.mobMult;
    const m = makeUnit('mob', MOB_NAMES[c.region][role], c.x + (W.rand() - 0.5) * 8, c.z + (W.rand() - 0.5) * 8, hp, {
      region: c.region,
      role,
      campId: c.id,
      dmg: MOBS.damage(min) * M.dmg * R.mobMult,
      rate: M.rate,
      range: M.range,
      speed: M.speed,
      aggro: MOBS.aggro,
      leash: MOBS.leash,
      xpMult: M.xp * R.xpMult,
    });
    c.mobs.push(m);
  }
}

function spawnBoss(l: BossLair) {
  const min = minutes();
  if (BOSS.spawnInsideRing && l.region !== 'katedral') {
    const g = ringGoal();
    if (dist(l, g) > g.r - 15) {
      // Prefer a spot of the boss's own region inside the next circle; else the circle's edge toward the region.
      let spot: { x: number; z: number } | null = null;
      for (let i = 0; i < 300 && !spot; i++) {
        const a = W.rand() * Math.PI * 2;
        const r = Math.sqrt(W.rand()) * (g.r - 15);
        const c = { x: g.x + Math.cos(a) * r, z: g.z + Math.sin(a) * r };
        if (regionAt(c.x, c.z) === l.region) spot = c;
      }
      if (!spot) {
        const d = Math.max(1, dist(l, g));
        spot = { x: g.x + ((l.x - g.x) / d) * (g.r - 15) * 0.8, z: g.z + ((l.z - g.z) / d) * (g.r - 15) * 0.8 };
      }
      l.x = spot.x;
      l.z = spot.z;
    }
  }
  const mult = l.region === 'katedral' ? BOSS.cathedralMult : 1;
  l.unit = makeUnit('boss', BOSS_NAMES[l.region], l.x, l.z, BOSS.hp(min) * mult, {
    region: l.region,
    dmg: mult,
    speed: BOSS.speed,
    aggro: BOSS.aggro,
    leash: BOSS.leash,
    xpMult: mult,
    bossDamage: new Map(),
    slamT: BOSS.slamEvery,
    rockT: BOSS.rockEvery,
  });
  l.spawned = true;
}

// ---- Ring -----------------------------------------------------------------
type Circle = { x: number; z: number; r: number };
let circles: Circle[] = [];

function buildRing() {
  const a = W.rand() * Math.PI * 2;
  const final = { x: Math.cos(a) * 40 * W.rand(), z: Math.sin(a) * 40 * W.rand() };
  circles = [{ x: 0, z: 0, r: MAP_HALF * 1.5 }];
  for (const [, , r] of RING) {
    const prev = circles[circles.length - 1];
    const k = 0.5;
    let x = prev.x + (final.x - prev.x) * k;
    let z = prev.z + (final.z - prev.z) * k;
    // Keep the new circle inside the old one, with a little randomness.
    const room = Math.max(0, Math.min(prev.r, MAP_HALF) - r);
    x += (W.rand() - 0.5) * room * 0.3;
    z += (W.rand() - 0.5) * room * 0.3;
    circles.push({ x, z, r });
  }
}

/** Circle that the storm is at now. */
function ringNow(): Circle & { dps: number } {
  const m = minutes();
  let i = 0;
  while (i < RING.length && m >= RING[i][0]) i++;
  // i = number of phases that have started.
  if (i === 0) return { ...circles[0], dps: 0 };
  const [start, end, , dps] = RING[i - 1];
  const a = circles[i - 1];
  const b = circles[i];
  const k = clamp((m - start) / (end - start), 0, 1);
  return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, r: a.r + (b.r - a.r) * k, dps };
}
/** Where players should head: the next circle, announced a minute before it closes. */
function ringGoal(): Circle {
  const m = minutes();
  let i = 0;
  while (i < RING.length && m >= RING[i][0] - 1) i++;
  return circles[i];
}

// ---- Players --------------------------------------------------------------
function makePlayer(cls: ClassId, styleIndex: number, x: number, z: number): Unit {
  const C = CLASSES[cls];
  const style = STYLES[cls][styleIndex];
  const u = makeUnit('player', `${C.name}`, x, z, C.hp, { speed: MATCH.speed });
  u.p = {
    cls,
    style: style.id,
    level: 1,
    xp: 0,
    xpBy: { mob: 0, player: 0, boss: 0 },
    skills: [{ id: style.skill, tier: 1, cd: 0, charges: SKILLS[style.skill].charges?.(1) ?? 1 }],
    currency: 0,
    earned: 0,
    sp: MOVE.spMax,
    spIdle: 0,
    winded: 0,
    sprinting: false,
    specialCd: 0,
    dodgeCd: 0,
    hurt: 0,
    stunRolled: false,
    sprintTime: 0,
    dodges: 0,
    stunBreaks: 0,
    specials: 0,
    spent: 0,
    bought: 0,
    visits: 0,
    bag: [],
    shopWalk: 0,
    aim: AIM.min + W.rand() * (AIM.max - AIM.min),
    aggression: 0.3 + W.rand() * 0.6,
    wantRange: style.range,
    melee: style.melee,
    orbs: cls === 'mage' ? 1 : 0,
    orbT: 0,
    spellShield: false,
    spellT: 0,
    genT: 0,
    vehicle: false,
    beast: null,
    beastWait: 0,
    poisonCoatT: 0,
    poisonPerm: false,
    poisonBoostT: 0,
    secondT: 0,
    secondRate: 0.6,
    secondWave: false,
    whirlT: 0,
    whirlDmg: 0,
    eshieldT: 0,
    eshieldHp: 0,
    eshieldStored: 0,
    eshieldWave: false,
    sprintT: 0,
    sprintHaste: false,
    stillT: 0,
    trailCd: 0,
    fadeNearT: 0,
    fadeCd: 0,
    kills: 0,
    bossKills: 0,
    mobKills: 0,
    dmgDealt: 0,
    dmgToPlayers: 0,
    dmgTaken: 0,
    levelAt: [0, 0],
    place: 0,
    deathMin: 0,
    killedBy: '',
  };
  u.ammo = C.ranged.mag ?? 0;
  if (cls === 'scout') u.p.beast = spawnBeast(u);
  W.players.push(u);
  return u;
}

const MELEE_ONLY = new Set(['wink', 'kidney', 'chain', 'charge', 'pounce', 'rend', 'second', 'whirl', 'arms']);

/** Level-up: 3 random cards from the class pool; the AI takes the one it likes most. */
function chooseCard(u: Unit) {
  const p = u.p!;
  const owned = p.skills;
  const atTwo = owned.filter((s) => s.tier >= 2).length;
  const cards: { id: string; next: number }[] = [];
  for (const id of POOL[p.cls]) {
    const s = owned.find((o) => o.id === id);
    if (!s) {
      if (owned.length < MAX_SKILLS) cards.push({ id, next: 1 });
    } else if (s.tier === 1) cards.push({ id, next: 2 });
    else if (s.tier === 2 && atTwo >= 3) cards.push({ id, next: 3 });
  }
  const offer: typeof cards = [];
  while (offer.length < 3 && cards.length) offer.push(cards.splice(Math.floor(W.rand() * cards.length), 1)[0]);
  const startSkill = STYLES[p.cls].find((s) => s.id === p.style)!.skill;
  let best: (typeof cards)[number] | null = null;
  let bestScore = -1;
  for (const c of offer) {
    if (c.next === 3 && p.currency < TOKEN_PRICE) continue;
    let sc = SKILLS[c.id].w * (0.75 + W.rand() * 0.5);
    if (c.id === startSkill) sc *= 1.3;
    if (!p.melee && MELEE_ONLY.has(c.id)) sc *= 0.4;
    if (c.next === 1 && owned.length < 3) sc *= 1.2;
    if (c.next === 3) sc *= 1.15;
    if (sc > bestScore) {
      bestScore = sc;
      best = c;
    }
  }
  if (!best) return;
  if (best.next === 1) owned.push({ id: best.id, tier: 1, cd: 0, charges: SKILLS[best.id].charges?.(1) ?? 1 });
  else {
    const s = owned.find((o) => o.id === best!.id)!;
    s.tier = best.next;
    if (best.next === 3) p.currency -= TOKEN_PRICE;
    if (s.id === 'poison' && s.tier === 3) p.poisonPerm = true;
  }
}

/**
 * How strong a player looks to others: health bar and level only (what a person sees),
 * so the AI does not secretly know which class is stronger.
 */
function threat(u: Unit): number {
  return (u.hp / u.maxHp) * (1 + 0.12 * (u.p!.level - 1));
}

const SIGHT_SNIPER = 70;

/** Players know the other builds' plans (KNOW=0 turns the counters off). */
const KNOW = process.env.KNOW !== '0';
type Brain = { shop?: VendorSpot | null; visited?: Set<string>; busyT?: number; scanT?: number; blindT: number; seenX: number; seenZ: number; goalCamp: Camp | null; dashT: number; think: number; goal: { x: number; z: number } | null; flee: boolean; gcd: number; lastX: number; lastZ: number; chaseT: number; ignore: Map<Unit, number> };
const brains = new Map<Unit, Brain>();

function think(u: Unit) {
  const p = u.p!;
  const b = brains.get(u)!;
  const goal = ringGoal();
  const outside = dist(u, goal) > goal.r - 8;
  const sight = p.wantRange >= 40 ? SIGHT_SNIPER : MATCH.sight;
  let t = u.target;
  if (t && (!t.alive || !hostile(u, t) || !canSee(u, t) || dist(u, t) > sight * 1.4)) t = null;
  if (t && t.kind !== 'player' && outside && dist(u, goal) > goal.r + 5) t = null;

  // Give up a chase that goes nowhere: the target stays out of weapon range.
  if (t && t.kind === 'player') {
    const reach = (p.melee ? CLASSES[p.cls].melee.range + 2 : Math.min(CLASSES[p.cls].ranged.range, p.wantRange + 12));
    b.chaseT = dist(u, t) > reach ? b.chaseT + 0.4 : 0;
    if (b.chaseT > 6 || (u.hp < u.maxHp * 0.45 && t.hp > t.maxHp * 0.5 && dist(u, t) > 8)) {
      b.ignore.set(t, W.time + 25);
      b.chaseT = 0;
      t = null;
    }
  }
  // Running away?
  if (b.flee) {
    const chaser = W.players.find((e) => e.alive && e !== u && e.target === u && dist(e, u) < 30);
    if (u.hp > u.maxHp * 0.65 || !chaser) b.flee = false;
  }
  if (!b.flee && t && t.kind === 'player' && u.hp < u.maxHp * AI.fleeAt && t.hp / t.maxHp > u.hp / u.maxHp + 0.15 && W.rand() > p.aggression * 0.6) b.flee = true;
  if (!b.flee && t && t.kind !== 'player' && u.hp < u.maxHp * (t.kind === 'boss' ? 0.4 : 0.25)) {
    b.flee = true;
  }

  // Look for other players.
  if (!b.flee && (!t || t.kind !== 'player')) {
    let best: Unit | null = null;
    let bd = Infinity;
    for (const e of W.players) {
      if (!e.alive || e === u || !canSee(u, e) || (b.ignore.get(e) ?? 0) > W.time) continue;
      const d = dist(u, e);
      if (d < sight && d < bd) {
        bd = d;
        best = e;
      }
    }
    if (best) {
      const attacked = best.target === u || (best.target && best.target.owner === u);
      const ratio = threat(u) / Math.max(1, threat(best));
      const lvlGap = p.level - best.p!.level;
      // Early on most players would rather farm; the ring pushes everyone together later.
      const phase = clamp(minutes() / AI.calmUntil, 0.15, 1);
      const engage = ratio * (0.5 + p.aggression * phase) * (1 + 0.08 * lvlGap) > AI.engageAt;
      // Hurt enemies busy with something else are tempting.
      const thirdParty = best.target && best.target !== u && best.hp < best.maxHp * 0.5 && W.rand() < p.aggression * phase;
      if (engage || thirdParty || (attacked && ratio > AI.defendAt)) t = best;
      else if (attacked) b.flee = true;
      // Not worth it: leave them be for a while and keep farming.
      else b.ignore.set(best, W.time + 15);
    }
  }
  // Decoys: some attacks go to a Rogue's copies instead.
  if (t && t.kind === 'player') {
    const ds = decoysOf(t);
    if (KNOW && t.p?.plan === 'clones' && ds.length) {
      // Knows copies die to two hits: clears the closest one first.
      const near = ds.filter((x) => dist(u, x) < 20).sort((a, c) => dist(u, a) - dist(u, c))[0];
      if (near && W.rand() < 0.7) t = near;
    } else if (ds.length && W.rand() < (ds.length / (ds.length + 1)) * 0.6) t = pick(ds);
  }
  // Bosses.
  if (!b.flee && !t && !outside) {
    for (const l of lairs) {
      const bo = l.unit;
      if (!bo || !bo.alive) continue;
      const d = dist(u, bo);
      const ready = p.level >= 6 && u.hp > u.maxHp * 0.8;
      const busy = bo.target && bo.target.kind === 'player' && bo.hp < bo.maxHp * 0.4;
      if (d < 260 && (ready || (busy && d < 80))) {
        t = bo;
        break;
      }
    }
  }
  // Mobs nearby.
  if (!b.flee && !t) {
    let best: Unit | null = null;
    let bd = 40;
    for (const c of camps) {
      if (Math.abs(c.x - u.x) > 70 || Math.abs(c.z - u.z) > 70) continue;
      for (const m of c.mobs) {
        if (!m.alive) continue;
        const d = dist(u, m);
        if (d < bd) {
          bd = d;
          best = m;
        }
      }
    }
    // Mobs already biting us.
    for (const m of W.units) if (m.alive && m.kind === 'mob' && m.target === u && dist(u, m) < bd) (best = m), (bd = dist(u, m));
    t = best;
  }
  u.target = t;

  // Where to go when not fighting.
  if (outside) {
    b.goal = { x: goal.x, z: goal.z };
    b.goalCamp = null;
  }
  else if (!t && !b.flee && (b.shop || (b.shop = shopGoal(u, (b.visited ??= new Set()), (v) => dist(v, goal) < goal.r - 10)))) {
    // Walking to a vendor machine.
    b.goal = { x: b.shop.x, z: b.shop.z };
    b.goalCamp = null;
  }
  else if (!t) {
    const campDone = b.goalCamp && !b.goalCamp.mobs.some((m) => m.alive);
    if (!b.goal || dist(u, b.goal) < 6 || campDone || (!b.goalCamp && W.rand() < 0.05)) {
      // Nearest camp with mobs inside the next circle; avoid camps someone else already stands at.
      let best: Camp | null = null;
      let bd = Infinity;
      for (const c of camps) {
        if (!c.mobs.some((m) => m.alive) || dist(c, goal) > goal.r - 10) continue;
        const crowd = W.players.some((e) => e !== u && e.alive && dist(e, c) < 20) ? 120 : 0;
        const d = dist(u, c) + crowd + W.rand() * 30;
        if (d < bd) {
          bd = d;
          best = c;
        }
      }
      b.goalCamp = best;
      b.goal = best ? { x: best.x, z: best.z } : { x: goal.x + (W.rand() - 0.5) * goal.r, z: goal.z + (W.rand() - 0.5) * goal.r };
    }
  }

  // Vehicle.
  if (!p.vehicle && p.currency >= VEHICLE.price && p.level >= 3) {
    p.vehicle = true;
    p.currency -= VEHICLE.price;
  }
}

function weaponHit(u: Unit, t: Unit, melee: boolean) {
  const p = u.p!;
  const C = CLASSES[p.cls];
  const w = melee ? C.melee : C.ranged;
  const d = dist(u, t);
  let dmg = w.dmg;
  u.fadeT = 0;
  // Attacking breaks invisibility; an unseen approach lets the Rogue strike from behind.
  if (u.stealthT > 0) {
    u.stealthT = 0;
    if (melee && !PASSIVES.rogue2.on) u.backstabT = Math.max(u.backstabT, 0.6);
  }
  // Melee cannot reach someone standing on a platform from below.
  if (melee && W.obstacles.length && onPlatform(t) !== onPlatform(u) && t.kind === 'player') return;
  if (p.cls === 'scout' && !melee) {
    const scoped = !p.melee && d > 10;
    dmg = scoped ? w.minDmg! + (w.dmg - w.minDmg!) * clamp(u.chargeT / w.charge!, 0, 1) : w.minDmg!;
    u.chargeT = 0;
  }
  const chance = melee ? (t.kind === 'player' ? 0.85 : 0.97) : hitChance(u, t, d, w.range, w.acc ?? 1);
  if (W.rand() > chance) return;
  // S4 side dash: the target saw it coming and cartwheeled out of the way.
  if (t.p && tryDodge(t, u, melee ? 'melee' : dodgeKind(p.cls, dmg, w.dmg))) return;
  damage(u, t, dmg, melee ? 'melee' : 'ranged');
  // A thrown spear stays stuck in the target until recalled.
  if (!melee && p.cls === 'fighter') t.spearsIn = Math.min(F.recall.maxSpears, t.spearsIn + 1);
  // Cleave: wide sweeps hit others around the target.
  if (melee && w.cleave) {
    let n = 0;
    for (const e of W.units) {
      if (n >= w.cleave) break;
      if (e === t || !hostile(u, e) || e.kind === 'decoy' || dist(e, t) > 2.5) continue;
      damage(u, e, dmg * 0.7, 'melee');
      n++;
    }
  }
  // Rogue poison.
  if (p.cls === 'rogue' && t.alive && (p.poisonCoatT > 0 || p.poisonPerm)) {
    const tier = p.skills.find((s) => s.id === 'poison')?.tier ?? 1;
    const dps = [6, 10, 10][tier - 1] * (p.poisonBoostT > 0 ? 2 : 1);
    dot(t, u, dps, 3, 'poison');
    slow(t, [0.3, 0.4, 0.4][tier - 1], 1.5);
  }
  // Scout companion hunts what you hit.
  for (const x of W.units) if (x.alive && x.owner === u && x.kind === 'pet' && (x.name === 'Yoldaş' || x.name === 'Sürü')) x.target = t;
}

/** Which dodge chance a ranged shot uses (config MOVE.dodge). */
function dodgeKind(cls: ClassId, dmg: number, full: number): string {
  if (cls === 'rogue') return 'gun';
  if (cls === 'mage') return 'wand';
  if (cls === 'fighter') return 'spear';
  return dmg >= full * 0.7 ? 'sniper' : 'quick';
}

// ---- Arena tactics ----------------------------------------------------------
const nearestOf = (u: Unit, kind: Obstacle['kind']) => {
  let best: Obstacle | null = null;
  let bd = Infinity;
  for (const o of W.obstacles) if (o.kind === kind && dist(u, o) < bd) (bd = dist(u, o)), (best = o);
  return best;
};

/** Cover, high ground and flanking around buildings. Returns true when it moved the unit. */
function arenaMove(u: Unit, t: Unit, b: Brain): boolean {
  const p = u.p!;
  const seen = canSee(u, t);
  const tx = seen ? t.x : b.seenX;
  const tz = seen ? t.z : b.seenZ;
  const d = dist(u, t);
  // Rogue: break line of sight behind a building to go invisible, then come back unseen.
  const invis = p.skills.find((s) => s.id === 'invis');
  if (p.cls === 'rogue' && invis && invis.charges > 0 && u.stealthT <= 0 && (p.melee || u.hp < u.maxHp * 0.6)) {
    const cover = nearestOf(u, 'building');
    if (cover) {
      const k = Math.max(0.1, dist(cover, t));
      const spot = { x: cover.x + ((cover.x - t.x) / k) * (cover.r + 1.2), z: cover.z + ((cover.z - t.z) / k) * (cover.r + 1.2) };
      if (dist(u, spot) > 1) moveToward(u, spot.x, spot.z);
      return true;
    }
  }
  // Knows the spear Fighter pins people to walls: step off a wall in its line of fire.
  if (KNOW && t.p?.plan === 'spear' && u.stealthT <= 0 && seen && wallBehind(t, u, 3)) {
    const k = Math.max(0.1, d);
    moveToward(u, u.x - (t.z - u.z) / k * 4, u.z + (t.x - u.x) / k * 4);
    return true;
  }
  // Ranged Scout: get on a platform and stay there.
  if (p.cls === 'scout' && !p.melee && p.plan !== 'ground') {
    const plat = nearestOf(u, 'platform');
    const blind = !seen || losBlocked(u, t);
    b.blindT = blind ? b.blindT + DT() : 0;
    // Stuck behind cover for a while: come down and hunt.
    if (b.blindT < 3) {
      if (plat && !onPlatform(u) && d > 6) {
        moveToward(u, plat.x, plat.z, dist(u, plat) < plat.r + 2 ? 0.5 : 1);
        return true;
      }
      if (plat && onPlatform(u) && d > 4) return true;
    }
  }
  // Melee closing in on a shooter in the open: hop from cover to cover toward them.
  if (p.melee && seen && d > (p.plan === 'ambush' ? 10 : 12) && t.p && (!t.p.melee || p.plan === 'ambush') && u.stealthT <= 0) {
    let best: { x: number; z: number } | null = null;
    let bd = d - 4;
    for (const o of W.obstacles) {
      if (o.kind === 'platform' || dist(u, o) > 22) continue;
      const k = Math.max(0.1, dist(o, t));
      const spot = { x: o.x + ((o.x - t.x) / k) * (o.r + 1), z: o.z + ((o.z - t.z) / k) * (o.r + 1) };
      const dt2 = dist(spot, t);
      if (dt2 < bd && dist(u, spot) > 1.5) (bd = dt2), (best = spot);
    }
    if (best) {
      moveToward(u, best.x, best.z);
      return true;
    }
  }
  // Can't see or shoot the target: walk toward where it was last seen.
  if (!seen || (!p.melee && losBlocked(u, t))) {
    moveToward(u, tx, tz);
    return true;
  }
  // Climbing to a target on a platform is slow.
  if (onPlatform(t) && !onPlatform(u) && d < 6) {
    moveToward(u, t.x, t.z, 0.5);
    return true;
  }
  return false;
}

function playerStep(u: Unit, dt: number) {
  const p = u.p!;
  const b = brains.get(u)!;
  const C = CLASSES[p.cls];
  b.think -= dt;
  if (b.think <= 0) {
    b.think = 0.3 + W.rand() * 0.2;
    think(u);
  }
  // Timers.
  for (const s of p.skills) {
    const def = SKILLS[s.id];
    const max = def.charges?.(s.tier) ?? 1;
    if (s.charges < max) {
      s.cd -= dt;
      if (s.cd <= 0) {
        s.charges++;
        s.cd = s.charges < max ? def.cd(s.tier) * gearCd(u) : 0;
      }
    }
  }
  p.poisonCoatT -= dt;
  p.poisonBoostT -= dt;
  p.secondT -= dt;
  p.eshieldT -= dt;
  p.trailCd -= dt;
  p.fadeCd -= dt;
  b.gcd -= dt;
  gearTick(u, dt);
  spTick(u, dt);
  p.sprinting = false;
  const outOfCombat = W.time - u.lastCombat > MATCH.regenDelay;
  if (outOfCombat) heal(u, C.regenPerSec * dt);
  // Passives.
  if (p.cls === 'mage') {
    if (W.time - u.lastCombat > 1) p.spellT += dt;
    if (p.spellT >= PASSIVES.mage.shieldEvery) p.spellShield = true;
    const cap = PASSIVES.mage.orbs(p.level);
    if (p.orbs < cap) {
      p.orbT += dt;
      if (p.orbT >= PASSIVES.mage.orbEvery) {
        p.orbT = 0;
        p.orbs++;
      }
    }
  } else if (p.cls === 'fighter') {
    p.genT += dt;
    if (p.genT >= PASSIVES.fighter.every) {
      p.genT = 0;
      if (u.shieldT <= 0) u.shield = Math.min(PASSIVES.fighter.cap, u.shield + PASSIVES.fighter.shield);
    }
  } else if (p.cls === 'scout') {
    if (!p.beast || !p.beast.alive) {
      p.beastWait += dt;
      if (p.beastWait >= PASSIVES.scout.respawn) {
        p.beast = spawnBeast(u);
        p.beastWait = 0;
      }
    }
  } else if (p.cls === 'rogue') {
    if (PASSIVES.rogue2.on) {
      // Standing still only fades; the copy comes from the dash (see the dash code).
      if (p.stillT >= PASSIVES.rogue.trailStill && p.fadeCd <= 0) {
        u.fadeT = PASSIVES.rogueFade.life;
        p.fadeNearT = 0;
        p.fadeCd = PASSIVES.rogue.trailCd;
      }
    } else if (p.stillT >= PASSIVES.rogue.trailStill && p.trailCd <= 0) {
      makeDecoy(u, PASSIVES.rogue.trailLife);
      p.trailCd = PASSIVES.rogue.trailCd;
      if (PASSIVES.rogueFade.on) (u.fadeT = PASSIVES.rogueFade.life), (p.fadeNearT = 0), (p.fadeCd = PASSIVES.rogue.trailCd);
    }
    // Faded: an enemy staying close with a clear view sees through it.
    if (u.fadeT > 0) {
      const F = PASSIVES.rogueFade;
      const close = W.players.some((e) => e !== u && e.alive && dist(e, u) < F.breakNear && !(W.obstacles.length && losBlocked(e, u)));
      p.fadeNearT = close ? p.fadeNearT + dt : 0;
      if (p.fadeNearT >= F.breakTime) u.fadeT = 0;
    }
  }

  // Storm.
  const ring = ringNow();
  if (ring.dps > 0 && dist(u, ring) > ring.r) damage(null, u, ring.dps * dt, 'storm');
  if (!u.alive) return;
  if (u.stunT > 0 && !tryStunBreak(u)) return;

  // At a vendor machine: shop, then carry on.
  if (b.busyT && b.busyT > 0) {
    b.busyT -= dt;
    if (!u.target || !u.target.p) return;
    b.busyT = 0;
  }
  if (b.shop && !u.target) {
    if (dist(u, b.shop) < 3) {
      b.busyT = shopAt(u, b.shop, b.visited!);
      b.shop = null;
      b.goal = null;
      return;
    }
  } else if (b.shop && u.target?.p) b.shop = null;

  const t = u.target && u.target.alive ? u.target : null;
  const d = t ? dist(u, t) : Infinity;
  const before = { x: u.x, z: u.z };

  // Bandage: out of a player fight and hurt.
  const threatNear = W.players.some((e) => e !== u && e.alive && dist(e, u) < 22 && canSee(e, u));
  gearThink(u, t, threatNear);
  if (bandaging(u) && t && t.kind !== 'player' && dist(u, t) < 6) stopBandage(u, true);
  const wrapping = bandaging(u);
  // Skills (one every 0.4 s at most).
  const seen = !!t && canSee(u, t);
  if (t && seen) {
    b.seenX = t.x;
    b.seenZ = t.z;
  }
  if (t && !wrapping && b.gcd <= 0 && (seen || p.cls === 'rogue')) {
    const order = [...p.skills].sort(() => W.rand() - 0.5);
    for (const s of order) {
      const def = SKILLS[s.id];
      if (s.charges <= 0 || (def.orb && p.orbs < 1)) continue;
      if (def.use({ u, t, d: dist(u, t), tier: s.tier, s, flee: b.flee })) {
        if (def.orb) p.orbs--;
        if (s.cd !== 0.01) {
          const max = def.charges?.(s.tier) ?? 1;
          if (s.charges >= max) s.cd = def.cd(s.tier) * gearCd(u);
          s.charges--;
        } else s.cd = 0;
        if (s.cd === 0 && s.charges <= 0) s.charges = 1;
        b.gcd = 0.4;
        if (s.id !== 'invis') u.stealthT = 0;
        break;
      }
    }
  }
  if (!u.alive) return;

  // Dash: close in on a melee target, step away from a melee attacker, or run.
  b.dashT -= dt;
  if (t && !wrapping && b.dashT <= 0 && u.stunT <= 0) {
    const D = { dist: C.dash.dist, cd: MOVE.on ? MOVE.dashGap : C.dash.cd * gearDash(u) };
    // With the breath bar a dash costs SP instead of waiting for a cooldown (keep a dodge unless running).
    const pay = () => !MOVE.on || spend(u, MOVE.dashCost * gearDashCost(u), b.flee ? 0 : MOVE.reserve);
    // Rogue rework: the copy is left where the dash starts.
    if (PASSIVES.rogue2.on && p.cls === 'rogue' && p.trailCd <= 0 && (b.flee || (p.melee && d > C.melee.range + 1 && d < 15) || (!p.melee && t.kind === 'player' && t.p!.melee && d < 4))) {
      makeDecoy(u, PASSIVES.rogue.trailLife);
      p.trailCd = PASSIVES.rogue.trailCd;
    }
    if (b.flee && pay()) {
      moveAway(u, t, 0);
      jump(u, u.x + (u.x - t.x) * 10, u.z + (u.z - t.z) * 10, D.dist);
      b.dashT = D.cd;
    } else if (!b.flee && p.melee && d > C.melee.range + 1 && d < 15 && pay()) {
      jump(u, t.x, t.z, D.dist, C.melee.range * 0.7);
      if (ramDash(u) && dist(u, t) < C.melee.range + 1) stun(t, 0.4);
      if (slamDmg(u) > 0 && dist(u, t) < 3.5) aoe(u, u.x, u.z, 3.5, slamDmg(u), 'aoe', (e) => slow(e, 0.4, 1.2), 0.8);
      b.dashT = D.cd;
    } else if (!b.flee && !p.melee && t.kind === 'player' && t.p!.melee && d < 4 && p.plan !== 'high' && p.plan !== 'ground' && pay()) {
      jump(u, u.x + (u.x - t.x) * 10, u.z + (u.z - t.z) * 10, D.dist);
      b.dashT = D.cd;
    }
  }
  // Rogue with Gölge izi ready: hold still out of combat (no enemy player near) to fade.
  const waitFade =
    PASSIVES.rogueFade.on && p.cls === 'rogue' && p.fadeCd <= 0 && u.fadeT <= 0 && !b.flee && W.time - u.lastCombat > 2 &&
    !W.players.some((e) => e !== u && e.alive && dist(e, u) < 15 && canSee(e, u));
  if (waitFade) {
    p.stillT += dt;
    return;
  }
  // Movement.
  const speedMult = p.vehicle && W.time - u.lastCombat > 3 && !t ? VEHICLE.speedMult : 1;
  // Sprint (W W): travelling without a vehicle, running away, or closing in on a player.
  if (!wrapping) {
    if (b.flee) p.sprinting = wantSprint(u, 'flee');
    else if (t && t.kind === 'player' && d > (p.melee ? C.melee.range + 3 : p.wantRange + 6)) p.sprinting = wantSprint(u, 'chase');
    else if (!t && b.goal && speedMult === 1 && dist(u, b.goal) > 25) p.sprinting = wantSprint(u, 'travel');
  }
  const sneak = PASSIVES.rogue2.on && u.stealthT > 0 && t && t.kind === 'player' && !b.flee && p.melee;
  if (sneak) {
    // Invisible: circle round to the target's back before striking.
    const fx = t!.faceX || (u.x - t!.x) / Math.max(0.01, d);
    const fz = t!.faceZ || (u.z - t!.z) / Math.max(0.01, d);
    const bx = t!.x - fx * 1.2;
    const bz = t!.z - fz * 1.2;
    // Go wide around the front so the target's view cone is avoided.
    const side = { x: t!.x - fz * 3, z: t!.z + fx * 3 };
    const inFront = !isBehind(u, t!) && d < 5;
    if (inFront) moveToward(u, side.x, side.z);
    else moveToward(u, bx, bz);
  } else if (b.flee && t) {
    moveAway(u, t);
  } else if (b.flee) {
    // Run from the closest enemy player; with nobody close, carry on.
    let near: Unit | null = null;
    let nd = 35;
    for (const e of W.players) if (e.alive && e !== u && dist(e, u) < nd) (nd = dist(e, u)), (near = e);
    if (near) moveAway(u, near);
    else {
      b.flee = false;
      if (b.goal) moveToward(u, b.goal.x, b.goal.z, speedMult);
    }
  } else if (t && W.obstacles.length && arenaMove(u, t, b)) {
    // Handled by the arena tactics (cover, high ground, flanking).
  } else if (t) {
    // Melee players still back off and shoot mobs when hurt.
    const wantMelee = p.melee && (t.kind === 'player' || u.hp > u.maxHp * 0.5);
    if (wantMelee) {
      if (d > C.melee.range * 0.8) moveToward(u, t.x, t.z);
    } else {
      const want = t.kind === 'boss' ? Math.max(12, Math.min(p.wantRange, 18)) : t.kind === 'mob' ? Math.max(10, Math.min(p.wantRange, 14)) : p.wantRange;
      if (d > want + 3) moveToward(u, t.x, t.z);
      else if (d < want - 4) moveAway(u, t, KNOW && (t.p?.plan === 'brawler' || t.p?.plan === 'ambush') ? 1 : AI.kiteSpeed);
    }
  } else if (b.goal) moveToward(u, b.goal.x, b.goal.z, speedMult);
  u.x = clamp(u.x, -MAP_HALF, MAP_HALF);
  u.z = clamp(u.z, -MAP_HALF, MAP_HALF);
  const moved = Math.hypot(u.x - before.x, u.z - before.z);
  p.stillT = moved < 0.05 ? p.stillT + dt : 0;
  if (b.shop && !t) p.shopWalk += moved;
  // Facing: toward the target, else along the way we moved.
  if (t) {
    const k = Math.max(0.01, d);
    (u.faceX = (t.x - u.x) / k), (u.faceZ = (t.z - u.z) / k);
  } else if (KNOW && W.players.some((e) => e !== u && e.alive && e.p!.plan === 'assassin' && e.stealthT > 0 && dist(e, u) < 20)) {
    // Knows the Rogue went invisible to get behind: keeps looking around.
    b.scanT = (b.scanT ?? 0) - dt;
    if (b.scanT <= 0) {
      const a = W.rand() * Math.PI * 2;
      (u.faceX = Math.cos(a)), (u.faceZ = Math.sin(a)), (b.scanT = 0.6);
    }
  } else if (moved > 0.05) (u.faceX = (u.x - before.x) / moved), (u.faceZ = (u.z - before.z) / moved);

  // Attacks.
  if (!t || b.flee && d > 4 || wrapping) return;
  // Invisible: hold fire until close enough to strike from behind.
  if (u.stealthT > 0 && d > C.melee.range + 0.3) return;
  if (PASSIVES.rogue2.on && u.stealthT > 0.6 && t.kind === 'player' && !isBehind(u, t)) return;
  const haste = u.hasteT > 0 ? u.hasteAmt : 1;
  u.atkT -= dt * haste;
  // Fighter: second sword and blade storm run on their own clocks.
  if (p.cls === 'fighter') {
    if (p.secondT > 0 && d <= C.melee.range) {
      u.chargeT += dt;
      if (u.chargeT >= p.secondRate / gearAtk(u)) {
        u.chargeT = 0;
        if (W.rand() < 0.85) damage(u, t, C.melee.dmg, 'melee');
      }
    }
    if (p.secondWave && p.secondT > 0 && d <= 10 && d > C.melee.range && u.atkT <= 0 && W.rand() < 0.5) damage(u, t, 15, 'skill');
    if (p.whirlT > 0) {
      p.whirlT -= dt;
      if (Math.floor((p.whirlT + dt) / 0.3) !== Math.floor(p.whirlT / 0.3)) aoe(u, u.x, u.z, 3, p.whirlDmg, 'aoe', undefined, 0.8);
    }
  }
  if (u.reloadT > 0) {
    u.reloadT -= dt;
    if (u.reloadT <= 0) u.ammo = (C.ranged.mag ?? 0) + gearMag(u);
  }
  if (C.ranged.ammoRegen && u.ammo < C.ranged.mag! + gearMag(u)) {
    u.ammoRegenT += dt;
    if (u.ammoRegenT >= C.ranged.ammoRegen) {
      u.ammoRegenT = 0;
      u.ammo++;
    }
  }
  if (t.kind === 'player' || t.kind === 'boss') {
    if (b.gcd <= 0 && trySpecial(u, t, d)) b.gcd = 0.3;
    if (!t.alive) return;
  }
  if (d <= C.melee.range + 0.3 + gearReach(u)) {
    if (u.atkT <= 0) {
      u.atkT = C.melee.rate / gearAtk(u);
      weaponHit(u, t, true);
    }
    return;
  }
  if (d > C.ranged.range) return;
  // Scout scope charges while standing.
  if (p.cls === 'scout' && !p.melee && d > 10) {
    u.chargeT += dt * (moved < 0.05 ? 1 : 0.5);
    if (u.chargeT < C.ranged.charge! * gearCharge(u)) return;
  }
  // Mage wand heat (reloadT doubles as the overheat lock).
  const H = C.ranged.heat;
  if (H) {
    u.chargeT = Math.max(0, u.chargeT - H.coolPerSec * dt);
    if (u.reloadT > 0) return;
  }
  if (u.atkT > 0) return;
  if (H) {
    u.chargeT += H.perShot * gearHeat(u);
    if (u.chargeT >= 1) {
      u.chargeT = 0;
      u.reloadT = H.lock;
    }
  }
  if (C.ranged.mag !== undefined) {
    if (u.ammo <= 0) {
      if (!C.ranged.ammoRegen && u.reloadT <= 0) u.reloadT = C.ranged.reload!;
      return;
    }
    u.ammo--;
  }
  u.atkT = C.ranged.rate / gearAtk(u);
  weaponHit(u, t, false);
}

// ---- Mobs, bosses, pets ---------------------------------------------------
function nearestHostile(u: Unit, r: number): Unit | null {
  let best: Unit | null = null;
  let bd = r;
  for (const e of W.players) {
    if (!e.alive || !canSee(u, e)) continue;
    const d = dist(u, e);
    if (d < bd) (bd = d), (best = e);
  }
  for (const e of W.units) {
    if ((e.kind !== 'pet' && e.kind !== 'decoy') || !e.alive || e.immuneT > 100) continue;
    const d = dist(u, e);
    if (d < bd) (bd = d), (best = e);
  }
  return best;
}

function mobStep(u: Unit, dt: number) {
  if (u.stunT > 0) return;
  const home = { x: u.homeX, z: u.homeZ };
  let t = u.target;
  if (t && (!t.alive || !hostile(u, t) || !canSee(u, t) || dist(home, t) > u.leash + 10)) t = null;
  if (!t) {
    u.chargeT -= dt;
    if (u.chargeT <= 0) {
      u.chargeT = 0.5;
      t = nearestHostile(u, u.aggro);
    }
  }
  u.target = t;
  if (!t) {
    if (dist(u, home) > 3) {
      moveToward(u, home.x, home.z);
      heal(u, u.maxHp * 0.2 * dt);
    }
    return;
  }
  const d = dist(u, t);
  if (d > u.range * 0.9) moveToward(u, t.x, t.z);
  u.atkT -= dt;
  if (d <= u.range && u.atkT <= 0) {
    u.atkT = u.rate;
    const c = u.range > 3 ? (t.kind === 'player' ? 0.55 : 0.8) : 0.85;
    if (W.rand() < c) damage(u, t, u.dmg, 'melee');
  }
}

function bossStep(u: Unit, l: BossLair, dt: number) {
  const anyone = W.players.some((e) => e.alive && dist(e, u) < 35);
  if (!anyone) {
    l.resetT += dt;
    if (l.resetT > BOSS.resetAfter) {
      u.hp = u.maxHp;
      u.bossDamage!.clear();
    }
  } else l.resetT = 0;
  if (u.stunT > 0) return;
  let t = u.target;
  if (t && (!t.alive || !canSee(u, t) || dist({ x: l.x, z: l.z }, t) > u.leash + 15)) t = null;
  if (!t) t = nearestHostile(u, u.aggro);
  // Bosses hit whoever hurts them most.
  if (t && u.bossDamage!.size && W.rand() < 0.02) {
    let top: Unit | null = null;
    let td = 0;
    for (const [e, v] of u.bossDamage!) if (e.alive && v > td && dist(e, u) < 30) (td = v), (top = e);
    if (top) t = top;
  }
  u.target = t;
  if (!t) {
    if (dist(u, l) > 3) moveToward(u, l.x, l.z);
    return;
  }
  const d = dist(u, t);
  if (d > 3) moveToward(u, t.x, t.z);
  u.slamT -= dt;
  u.rockT -= dt;
  if (u.slamT <= 0 && d < BOSS.slamRadius) {
    u.slamT = BOSS.slamEvery;
    // Wind-up: players step out sometimes.
    aoe(u, u.x, u.z, BOSS.slamRadius, BOSS.slamDamage * u.dmg, 'aoe', undefined, 0.65);
  }
  if (u.rockT <= 0 && d < 30) {
    u.rockT = BOSS.rockEvery;
    if (W.rand() < 0.6) damage(u, t, BOSS.rockDamage * u.dmg, 'ranged');
  }
}

function petStep(u: Unit, dt: number) {
  const o = u.owner!;
  if (!o.alive) {
    u.alive = false;
    return;
  }
  u.life -= dt;
  if (u.life <= 0) {
    u.alive = false;
    return;
  }
  if (u.stunT > 0) return;
  if (u.name === 'Nano kol') {
    u.x = o.x;
    u.z = o.z;
  }
  let t = u.target;
  if (t && (!t.alive || !hostile(u, t) || dist(o, t) > 30)) t = null;
  if (!t && o.target && o.target.alive && dist(o, o.target) < 25) t = o.target;
  if (u.kind === 'decoy' && u.dmg <= 0) {
    // Plain copies wander next to the Rogue; clone-plan copies circle the target.
    const ct = o.p?.plan === 'clones' && o.target && o.target.alive ? o.target : null;
    if (ct && dist(u, ct) > 5) moveToward(u, ct.x, ct.z, 0.8);
    else if (!ct && dist(u, o) > 6) moveToward(u, o.x, o.z, 0.8);
    return;
  }
  u.target = t;
  if (!t) {
    if (dist(u, o) > 4 && u.speed > 0) moveToward(u, o.x, o.z);
    return;
  }
  const d = dist(u, t);
  if (d > u.range * 0.9 && u.speed > 0) moveToward(u, t.x, t.z);
  u.atkT -= dt;
  if (d <= u.range && u.atkT <= 0) {
    u.atkT = u.rate;
    const ranged = u.range > 3;
    const c = ranged ? hitChance(u, t, d, u.range * 1.5, 1.3) : t.kind === 'player' ? 0.8 : 0.95;
    if (W.rand() < c) {
      damage(u, t, u.dmg, 'pet');
      u.hitsCount++;
      if (u.stunEvery > 0 && u.hitsCount % u.stunEvery === 0) stun(t, 0.25);
    }
  }
}

// ---- Status timers --------------------------------------------------------
function tickStatus(u: Unit, dt: number) {
  u.stunT -= dt;
  u.slowT -= dt;
  u.drT -= dt;
  u.immuneT -= dt;
  u.stealthT -= dt;
  u.fadeT -= dt;
  u.fogT -= dt;
  u.hasteT -= dt;
  u.speedT -= dt;
  u.dmgBuffT -= dt;
  u.lsBuffT -= dt;
  u.markT -= dt;
  u.noHealT -= dt;
  u.backstabT -= dt;
  u.highT -= dt;
  u.smokeT -= dt;
  if (u.shieldT > 0) {
    u.shieldT -= dt;
    if (u.shieldT <= 0) u.shield = 0;
  }
  if (u.dots.length) {
    for (const d of u.dots) {
      d.t -= dt;
      if (u.alive) damage(d.src, u, d.dps * dt, 'dot');
    }
    u.dots = u.dots.filter((d) => d.t > 0);
  }
}

// ---- Match ----------------------------------------------------------------
export type MatchResult = {
  minutes: number;
  winner: ClassId;
  players: {
    cls: ClassId;
    style: string;
    place: number;
    level: number;
    kills: number;
    earned: number;
    spent: number;
    bought: number;
    visits: number;
    left: number;
    shopWalk: number;
    dodges: number;
    stunBreaks: number;
    specials: number;
    sprintTime: number;
    gearScore: number;
    bossKills: number;
    mobKills: number;
    dmgToPlayers: number;
    xpBy: { mob: number; player: number; boss: number };
    levelAt: number[];
    deathMin: number;
    killedBy: string;
    skills: string[];
  }[];
  /** Average level of living players at minute 5, 10, ..., and the class split. */
  levelByMinute: Record<number, Record<ClassId, number[]>>;
  bosses: { name: string; spawn: number; killedAt: number | null; by: string | null }[];
  /** Samples every 10 s: living mobs per region, mobs within 40 m of an average player. */
  mobSamples: { min: number; alive: Record<RegionId, number>; nearPlayer: number; inSight: number }[];
};

function resetWorld(seed: number) {
  W.time = 0;
  W.units = [];
  W.players = [];
  W.pending = [];
  W.events = [];
  W.onKill = [];
  W.obstacles = [];
  W.rand = seeded(seed);
  W.nextId = 1;
  brains.clear();
  resetGear();
  setDt(MATCH.dt);
}

function stepWorld(dt: number) {
  W.time += dt;
  // Scheduled effects.
  if (W.pending.length) {
    const due = W.pending.filter((p) => p.t <= W.time);
    if (due.length) {
      W.pending = W.pending.filter((p) => p.t > W.time);
      for (const p of due) p.fn();
    }
  }
  for (const u of W.units) if (u.alive) tickStatus(u, dt);
  for (const u of W.players) if (u.alive) playerStep(u, dt);
  for (const u of W.units) {
    if (!u.alive) continue;
    if (u.kind === 'mob') mobStep(u, dt);
    else if (u.kind === 'pet' || u.kind === 'decoy') petStep(u, dt);
  }
  for (const l of lairs) if (l.unit && l.unit.alive) bossStep(l.unit, l, dt);
  // Drop dead units now and then.
  if (Math.round(W.time / dt) % 50 === 0) W.units = W.units.filter((u) => u.alive || u.kind === 'player');
}

export function runMatch(seed: number, opts: { classes?: ClassId[]; styles?: number[]; soloMinutes?: number } = {}): MatchResult {
  resetWorld(seed);
  buildCamps();
  buildRing();
  buildVendors(seed, regionAt);
  const classes = opts.classes ?? CLASS_IDS.flatMap((c) => Array(MATCH.players / CLASS_IDS.length).fill(c) as ClassId[]);
  for (const [i, cls] of classes.entries()) {
    const s = { x: (W.rand() * 2 - 1) * (MAP_HALF - 30), z: (W.rand() * 2 - 1) * (MAP_HALF - 30) };
    const u = makePlayer(cls, opts.styles?.[i] ?? Math.floor(W.rand() * 3), s.x, s.z);
    brains.set(u, { blindT: 0, seenX: 0, seenZ: 0, goalCamp: null, dashT: 0, think: W.rand() * 0.5, goal: null, flee: false, gcd: 0, lastX: s.x, lastZ: s.z, chaseT: 0, ignore: new Map() });
  }
  let alive = W.players.length;
  hooks.levelUp = chooseCard;
  hooks.death = (v) => {
    if (v.kind !== 'player') return;
    v.p!.place = alive;
    v.p!.deathMin = minutes();
    alive--;
  };
  const levelByMinute: MatchResult['levelByMinute'] = {};
  const mobSamples: MatchResult['mobSamples'] = [];
  const dt = MATCH.dt;
  let nextSample = 0;
  const endAt = opts.soloMinutes ?? MATCH.maxMinutes;
  while ((alive > 1 || opts.soloMinutes) && alive > 0 && minutes() < endAt) {
    stepWorld(dt);
    // Camps and bosses.
    const ring = ringNow();
    for (const c of camps) {
      if (c.mobs.some((m) => m.alive)) continue;
      if (c.respawnT <= 0) c.respawnT = MOBS.respawn;
      c.respawnT -= dt;
      if (c.respawnT <= 0 && dist(c, ring) < ring.r && !W.players.some((e) => e.alive && dist(e, c) < 40)) spawnPack(c);
    }
    for (const l of lairs) if (!l.spawned && minutes() >= l.minute) spawnBoss(l);
    // Samples.
    if (W.time >= nextSample) {
      nextSample += 10;
      const m = Math.round(minutes() * 6) / 6;
      if (Math.abs(m - Math.round(m)) < 0.01 && Math.round(m) % 5 === 0) {
        const lv: Record<ClassId, number[]> = { rogue: [], mage: [], fighter: [], scout: [] };
        levelByMinute[Math.round(m)] = lv;
        for (const u of W.players) if (u.alive) lv[u.p!.cls].push(u.p!.level);
      }
      const aliveBy = { mantar: 0, sehir: 0, maymun: 0, col: 0, katedral: 0 } as Record<RegionId, number>;
      for (const u of W.units) if (u.alive && u.kind === 'mob') aliveBy[u.region!]++;
      let near = 0;
      let inSight = 0;
      let n = 0;
      for (const u of W.players) {
        if (!u.alive) continue;
        n++;
        sampleDistance(u);
        for (const m of W.units) {
          if (!m.alive || m.kind !== 'mob') continue;
          const d = dist(u, m);
          if (d < 40) near++;
          if (d < 80) inSight++;
        }
      }
      mobSamples.push({ min: minutes(), alive: aliveBy, nearPlayer: n ? near / n : 0, inSight: n ? inSight / n : 0 });
    }
  }
  // Rank survivors by health.
  const survivors = W.players.filter((u) => u.alive).sort((a, b) => b.hp - a.hp);
  survivors.forEach((u, i) => (u.p!.place = i + 1));
  return {
    minutes: minutes(),
    winner: survivors[0]?.p!.cls ?? W.players.find((u) => u.p!.place === 1)!.p!.cls,
    players: W.players.map((u) => ({
      cls: u.p!.cls,
      style: u.p!.style,
      place: u.p!.place,
      level: u.p!.level,
      kills: u.p!.kills,
      earned: u.p!.earned,
      spent: u.p!.spent,
      bought: u.p!.bought,
      visits: u.p!.visits,
      left: u.p!.currency,
      shopWalk: u.p!.shopWalk,
      dodges: u.p!.dodges,
      stunBreaks: u.p!.stunBreaks,
      specials: u.p!.specials,
      sprintTime: u.p!.sprintTime,
      gearScore: gearScoreOf(u),
      bossKills: u.p!.bossKills,
      mobKills: u.p!.mobKills,
      dmgToPlayers: u.p!.dmgToPlayers,
      xpBy: u.p!.xpBy,
      levelAt: u.p!.levelAt,
      deathMin: u.alive ? minutes() : u.p!.deathMin,
      killedBy: u.p!.killedBy,
      skills: u.p!.skills.map((s) => `${s.id}${s.tier}`),
    })),
    levelByMinute,
    bosses: lairs.map((l) => ({
      name: BOSS_NAMES[l.region],
      spawn: l.minute,
      killedAt: l.unit && !l.unit.alive ? null : null,
      by: null,
    })).map((b, i) => {
      const ev = W.events.filter((e) => e.type === 'boss' && e.a === b.name);
      const same = lairs.filter((l, j) => j < i && BOSS_NAMES[l.region] === b.name).length;
      const e = ev[same];
      return { ...b, killedAt: e ? e.t : null, by: e ? e.b! : null };
    }),
    mobSamples,
  };
}

// ---- Duel -----------------------------------------------------------------
/**
 * Duel arena, 50 m radius (100 m across): a big ruin in the middle, six houses, twelve trees and
 * four raised platforms (rooftops / rocks) for high ground. Point-symmetric so both sides are equal.
 * Players start 60 m apart with the middle ruin between them.
 */
export const ARENA_RADIUS = 50;
/** Debug hook called every duel step. */
export const trace = { fn: null as null | (() => void) };
export const ARENA_LAYOUT: Obstacle[] = [
  { x: 0, z: 0, r: 5, kind: 'building' },
  ...([
    [-25, 18, 4, 'building'],
    [-10, -28, 3.5, 'building'],
    [-35, -8, 3, 'building'],
    [-15, 5, 0.8, 'tree'],
    [-5, 15, 0.8, 'tree'],
    [-30, 25, 0.8, 'tree'],
    [-20, -15, 0.8, 'tree'],
    [0, 38, 0.8, 'tree'],
    [-40, 10, 0.8, 'tree'],
    [-28, -25, 3, 'platform'],
    [-20, 32, 3, 'platform'],
  ] as [number, number, number, Obstacle['kind']][]).flatMap(([x, z, r, kind]) => [
    { x, z, r, kind },
    { x: -x, z: -z, r, kind },
  ]),
];

/** Two players at the same level with random builds, 35 m apart, no mobs, no storm. */
/**
 * `builds`: for each side, the skill picked at level 1, 2, 3, ... (the first one is the playstyle's
 * starting skill). Without it the cards are random. `arena`: radius of a round arena in meters.
 */
export function runDuel(
  seed: number,
  a: ClassId,
  b: ClassId,
  level: number,
  styleA?: number,
  styleB?: number,
  opts: { builds?: [string[] | null, string[] | null]; plans?: [string | undefined, string | undefined]; arena?: number; gear?: [Loadout | null, Loadout | null] } = {},
): { winner: 0 | 1 | -1; time: number } {
  resetWorld(seed);
  clearVendors();
  camps = [];
  lairs = [];
  circles = [{ x: 0, z: 0, r: 9999 }, ...RING.map(() => ({ x: 0, z: 0, r: 9999 }))];
  hooks.levelUp = chooseCard;
  hooks.death = () => {};
  const half = opts.arena ? opts.arena * 0.6 : 17.5;
  if (opts.arena) W.obstacles = ARENA_LAYOUT.map((o) => ({ ...o, x: (o.x * opts.arena!) / ARENA_RADIUS, z: (o.z * opts.arena!) / ARENA_RADIUS }));
  const ua = makePlayer(a, styleA ?? Math.floor(W.rand() * 3), -half, 0);
  const ub = makePlayer(b, styleB ?? Math.floor(W.rand() * 3), half, 0);
  for (const [side, u] of [ua, ub].entries()) {
    // Enough money for tier-3 tokens, like a player who farmed.
    u.p!.currency = 400;
    const build = opts.builds?.[side];
    hooks.levelUp = build ? () => {} : chooseCard;
    while (u.p!.level < level) grantXp(u, xpNeeded(u.p!.level), 'mob');
    if (build) {
      const tiers = new Map<string, number>();
      for (const id of build.slice(0, level)) tiers.set(id, (tiers.get(id) ?? 0) + 1);
      u.p!.skills = [...tiers].map(([id, tier]) => ({ id, tier, cd: 0, charges: SKILLS[id].charges?.(tier) ?? 1 }));
      u.p!.poisonPerm = (tiers.get('poison') ?? 0) >= 3;
    }
    u.p!.plan = opts.plans?.[side];
    const load = opts.gear?.[side];
    if (load) equip(u, load);
    u.ammo = (CLASSES[u.p!.cls].ranged.mag ?? 0) + gearMag(u);
    u.hp = u.maxHp;
    u.p!.orbs = PASSIVES.mage.orbs(u.p!.level);
    u.p!.spellShield = true;
    u.p!.aim = (AIM.min + AIM.max) / 2;
    u.p!.aggression = 1;
    if (u.p!.cls === 'fighter') u.shield = PASSIVES.fighter.cap;
    brains.set(u, { blindT: 0, seenX: 0, seenZ: 0, goalCamp: null, dashT: 0, think: 0, goal: null, flee: false, gcd: 0, lastX: u.x, lastZ: u.z, chaseT: 0, ignore: new Map() });
  }
  ua.target = ub;
  ub.target = ua;
  const dt = MATCH.dt;
  while (ua.alive && ub.alive && W.time < 90) {
    stepWorld(dt);
    trace.fn?.();
    if (opts.arena) {
      const R = opts.arena;
      for (const u of W.units) {
        const d = Math.hypot(u.x, u.z);
        if (d > R) (u.x *= R / d), (u.z *= R / d);
        // Walls and trunks are solid.
        for (const o of W.obstacles) {
          if (o.kind === 'platform') continue;
          const k = Math.hypot(u.x - o.x, u.z - o.z);
          const min = o.r + 0.4;
          if (k < min) {
            const nx = k > 0.01 ? (u.x - o.x) / k : 1;
            const nz = k > 0.01 ? (u.z - o.z) / k : 0;
            u.x = o.x + nx * min;
            u.z = o.z + nz * min;
          }
        }
      }
      // High ground: standing on a platform above the enemy.
      for (const [u, e] of [[ua, ub], [ub, ua]] as const) if (onPlatform(u) && !onPlatform(e)) u.highT = Math.max(u.highT, 0.15);
    }
    // No running away in a duel arena.
    for (const u of [ua, ub]) {
      brains.get(u)!.flee = false;
      if (u.alive && (!u.target || !u.target.alive || u.target.kind === 'player')) u.target = u === ua ? ub : ua;
    }
  }
  if (ua.alive && !ub.alive) return { winner: 0, time: W.time };
  if (ub.alive && !ua.alive) return { winner: 1, time: W.time };
  if (!ua.alive && !ub.alive) return { winner: -1, time: W.time };
  const ha = ua.hp / ua.maxHp;
  const hb = ub.hp / ub.maxHp;
  return { winner: Math.abs(ha - hb) < 0.05 ? -1 : ha > hb ? 0 : 1, time: W.time };
}
