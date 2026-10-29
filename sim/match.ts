/**
 * One battle royale match on the 5-region map, or a 1v1 duel.
 * 20 simulated players (5 per class) drop at random spots, farm mob camps, hunt bosses,
 * fight each other and follow the shrinking ring. Last one alive wins.
 */
import {
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
  makeUnit,
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
  type Unit,
} from './core.ts';
import { POOL, SKILLS, STYLES, decoysOf, makeDecoy, spawnBeast } from './kits.ts';

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
  return ((u.hp + u.shield) / u.maxHp) * (1 + 0.12 * (u.p!.level - 1));
}

const SIGHT_SNIPER = 70;
/** Simulated player behaviour. */
export const AI = { kiteSpeed: 0.6, calmUntil: 30, engageAt: 1.2, defendAt: 0.8, fleeAt: 0.4 };

type Brain = { goalCamp: Camp | null; dashT: number; think: number; goal: { x: number; z: number } | null; flee: boolean; gcd: number; lastX: number; lastZ: number; chaseT: number; ignore: Map<Unit, number> };
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
      if (process.env.SIMDEBUG3 && p.style === 'vahşi') console.log('E', W.time.toFixed(1), u.id, 'lvl', p.level, 'vs', best.p!.cls, best.p!.level, 'd', bd.toFixed(0), 'ratio', ratio.toFixed(2), 'engage', engage, 'attacked', attacked, 'hp', u.hp.toFixed(0), '/', u.maxHp);
      if (engage || thirdParty || (attacked && ratio > AI.defendAt)) t = best;
      else if (attacked) b.flee = true;
      // Not worth it: leave them be for a while and keep farming.
      else b.ignore.set(best, W.time + 15);
    }
  }
  // Decoys: some attacks go to a Rogue's copies instead.
  if (t && t.kind === 'player') {
    const ds = decoysOf(t);
    if (ds.length && W.rand() < (ds.length / (ds.length + 1)) * 0.6) t = pick(ds);
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
  if (p.cls === 'scout' && !melee) {
    const scoped = !p.melee && d > 10;
    dmg = scoped ? w.minDmg! + (w.dmg - w.minDmg!) * clamp(u.chargeT / w.charge!, 0, 1) : w.minDmg!;
    u.chargeT = 0;
  }
  const chance = melee ? (t.kind === 'player' ? 0.85 : 0.97) : hitChance(u, t, d, w.range, w.acc ?? 1);
  if (W.rand() > chance) return;
  damage(u, t, dmg, melee ? 'melee' : 'ranged');
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
        s.cd = s.charges < max ? def.cd(s.tier) : 0;
      }
    }
  }
  p.poisonCoatT -= dt;
  p.poisonBoostT -= dt;
  p.secondT -= dt;
  p.eshieldT -= dt;
  p.trailCd -= dt;
  b.gcd -= dt;
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
    if (p.stillT >= PASSIVES.rogue.trailStill && p.trailCd <= 0) {
      makeDecoy(u, PASSIVES.rogue.trailLife);
      p.trailCd = PASSIVES.rogue.trailCd;
    }
  }

  // Storm.
  const ring = ringNow();
  if (ring.dps > 0 && dist(u, ring) > ring.r) damage(null, u, ring.dps * dt, 'storm');
  if (!u.alive) return;
  if (u.stunT > 0) return;

  const t = u.target && u.target.alive ? u.target : null;
  const d = t ? dist(u, t) : Infinity;
  const before = { x: u.x, z: u.z };

  // Skills (one every 0.4 s at most).
  if (t && b.gcd <= 0) {
    const order = [...p.skills].sort(() => W.rand() - 0.5);
    for (const s of order) {
      const def = SKILLS[s.id];
      if (s.charges <= 0 || (def.orb && p.orbs < 1)) continue;
      if (def.use({ u, t, d: dist(u, t), tier: s.tier, s, flee: b.flee })) {
        if (def.orb) p.orbs--;
        if (s.cd !== 0.01) {
          const max = def.charges?.(s.tier) ?? 1;
          if (s.charges >= max) s.cd = def.cd(s.tier);
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

  if (process.env.SIMDEBUG2 && p.style === 'vahşi' && W.time > 465 && W.time < 486 && Math.round(W.time * 10) % 5 === 0)
    console.log('V', W.time.toFixed(1), u.id, t?.kind, 'd', d.toFixed(1), 'flee', b.flee, 'hp', u.hp.toFixed(0), 'thp', t?.hp.toFixed(0), t?.p?.cls, 'ttarget', t?.target === u, 'near', W.players.filter((e) => e.alive && e !== u && dist(e, u) < 50).map((e) => `${e.p!.cls}:${dist(e, u).toFixed(0)}:${e.target === u}`).join(' '), 'chase', b.chaseT.toFixed(1), 'ammo', u.ammo, 'atk', u.atkT.toFixed(2));
  // Dash: close in on a melee target, step away from a melee attacker, or run.
  b.dashT -= dt;
  if (t && b.dashT <= 0 && u.stunT <= 0) {
    const D = C.dash;
    if (b.flee) {
      moveAway(u, t, 0);
      jump(u, u.x + (u.x - t.x) * 10, u.z + (u.z - t.z) * 10, D.dist);
      b.dashT = D.cd;
    } else if (p.melee && d > C.melee.range + 1 && d < 15) {
      jump(u, t.x, t.z, D.dist, C.melee.range * 0.7);
      b.dashT = D.cd;
    } else if (!p.melee && t.kind === 'player' && t.p!.melee && d < 4) {
      jump(u, u.x + (u.x - t.x) * 10, u.z + (u.z - t.z) * 10, D.dist);
      b.dashT = D.cd;
    }
  }
  // Movement.
  const speedMult = (p.vehicle && W.time - u.lastCombat > 3 && !t ? VEHICLE.speedMult : 1) * (p.whirlT > 0 && false ? 1 : 1);
  if (b.flee && t) {
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
  } else if (t) {
    // Melee players still back off and shoot mobs when hurt.
    const wantMelee = p.melee && (t.kind === 'player' || u.hp > u.maxHp * 0.5);
    if (wantMelee) {
      if (d > C.melee.range * 0.8) moveToward(u, t.x, t.z);
    } else {
      const want = t.kind === 'boss' ? Math.max(12, Math.min(p.wantRange, 18)) : t.kind === 'mob' ? Math.max(10, Math.min(p.wantRange, 14)) : p.wantRange;
      if (d > want + 3) moveToward(u, t.x, t.z);
      else if (d < want - 4) moveAway(u, t, AI.kiteSpeed);
    }
  } else if (b.goal) moveToward(u, b.goal.x, b.goal.z, speedMult);
  u.x = clamp(u.x, -MAP_HALF, MAP_HALF);
  u.z = clamp(u.z, -MAP_HALF, MAP_HALF);
  const moved = Math.hypot(u.x - before.x, u.z - before.z);
  p.stillT = moved < 0.05 ? p.stillT + dt : 0;

  // Attacks.
  if (!t || b.flee && d > 4) return;
  const haste = u.hasteT > 0 ? u.hasteAmt : 1;
  u.atkT -= dt * haste;
  // Fighter: second sword and blade storm run on their own clocks.
  if (p.cls === 'fighter') {
    if (p.secondT > 0 && d <= C.melee.range) {
      u.chargeT += dt;
      if (u.chargeT >= p.secondRate) {
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
    if (u.reloadT <= 0) u.ammo = C.ranged.mag ?? 0;
  }
  if (C.ranged.ammoRegen && u.ammo < C.ranged.mag!) {
    u.ammoRegenT += dt;
    if (u.ammoRegenT >= C.ranged.ammoRegen) {
      u.ammoRegenT = 0;
      u.ammo++;
    }
  }
  if (d <= C.melee.range + 0.3) {
    if (u.atkT <= 0) {
      u.atkT = C.melee.rate;
      weaponHit(u, t, true);
    }
    return;
  }
  if (d > C.ranged.range) return;
  // Scout scope charges while standing.
  if (p.cls === 'scout' && !p.melee && d > 10) {
    u.chargeT += dt * (moved < 0.05 ? 1 : 0.5);
    if (u.chargeT < C.ranged.charge!) return;
  }
  if (u.atkT > 0) return;
  if (C.ranged.mag !== undefined) {
    if (u.ammo <= 0) {
      if (!C.ranged.ammoRegen && u.reloadT <= 0) u.reloadT = C.ranged.reload!;
      return;
    }
    u.ammo--;
  }
  u.atkT = C.ranged.rate;
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
    // Plain copies wander next to the Rogue.
    if (dist(u, o) > 6) moveToward(u, o.x, o.z, 0.8);
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
  W.rand = seeded(seed);
  W.nextId = 1;
  brains.clear();
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
  const classes = opts.classes ?? CLASS_IDS.flatMap((c) => Array(MATCH.players / CLASS_IDS.length).fill(c) as ClassId[]);
  for (const [i, cls] of classes.entries()) {
    const s = { x: (W.rand() * 2 - 1) * (MAP_HALF - 30), z: (W.rand() * 2 - 1) * (MAP_HALF - 30) };
    const u = makePlayer(cls, opts.styles?.[i] ?? Math.floor(W.rand() * 3), s.x, s.z);
    brains.set(u, { goalCamp: null, dashT: 0, think: W.rand() * 0.5, goal: null, flee: false, gcd: 0, lastX: s.x, lastZ: s.z, chaseT: 0, ignore: new Map() });
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
    if (process.env.SIMDEBUG && Math.abs(W.time % 30) < dt / 2) console.log('T', W.time.toFixed(0), W.players.filter((u) => u.alive).map((u) => `${u.p!.cls[0]}${u.p!.level}(${u.x.toFixed(0)},${u.z.toFixed(0)})${u.target ? u.target.kind[0] : '-'}${brains.get(u)!.flee ? 'F' : ''}`).join(' '));
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
        const lv = (levelByMinute[Math.round(m)] = { rogue: [], mage: [], fighter: [], scout: [] });
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
/** Two players at the same level with random builds, 35 m apart, no mobs, no storm. */
export function runDuel(seed: number, a: ClassId, b: ClassId, level: number, styleA?: number, styleB?: number): { winner: 0 | 1 | -1; time: number } {
  resetWorld(seed);
  camps = [];
  lairs = [];
  circles = [{ x: 0, z: 0, r: 9999 }, ...RING.map(() => ({ x: 0, z: 0, r: 9999 }))];
  hooks.levelUp = chooseCard;
  hooks.death = () => {};
  const ua = makePlayer(a, styleA ?? Math.floor(W.rand() * 3), -17.5, 0);
  const ub = makePlayer(b, styleB ?? Math.floor(W.rand() * 3), 17.5, 0);
  for (const u of [ua, ub]) {
    // Enough money for tier-3 tokens, like a player who farmed.
    u.p!.currency = 400;
    while (u.p!.level < level) grantXp(u, xpNeeded(u.p!.level), 'mob');
    u.hp = u.maxHp;
    u.p!.orbs = PASSIVES.mage.orbs(u.p!.level);
    u.p!.spellShield = true;
    u.p!.aim = (AIM.min + AIM.max) / 2;
    u.p!.aggression = 1;
    if (u.p!.cls === 'fighter') u.shield = PASSIVES.fighter.cap;
    brains.set(u, { goalCamp: null, dashT: 0, think: 0, goal: null, flee: false, gcd: 0, lastX: u.x, lastZ: u.z, chaseT: 0, ignore: new Map() });
  }
  ua.target = ub;
  ub.target = ua;
  const dt = MATCH.dt;
  while (ua.alive && ub.alive && W.time < 90) {
    stepWorld(dt);
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
