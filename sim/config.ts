/**
 * Balance simulator: every tunable number in one place.
 *
 * The XP, mob and boss numbers start from src/balance.ts; the Rogue numbers come from
 * src/balance.ts and src/rogue.ts. Mage, Fighter and Scout have no numbers in the game yet,
 * so their values here are first guesses built from the design doc
 * (/mnt/project-files/design/oynanis-tasarimi.md).
 *
 * Distances are meters, times are seconds, speeds are m/s.
 */

export type ClassId = 'rogue' | 'mage' | 'fighter' | 'scout';
export const CLASS_IDS: ClassId[] = ['rogue', 'mage', 'fighter', 'scout'];

// ---- Match ----------------------------------------------------------------
export const MATCH = {
  players: 20,
  /** Hard stop; a match that has not finished by then is ranked by health. */
  maxMinutes: 40,
  dt: 0.1,
  /** Player run speed (same as the bots in the game). */
  speed: 7,
  /** Out of combat for this long, then health comes back. */
  regenDelay: 5,
  regenPerSec: 5,
  /** How far a player notices other players and mobs. */
  sight: 45,
};

// ---- Map: 5 regions -------------------------------------------------------
/** Square map, half size. 1 km x 1 km: crossing it on foot takes about 2.5 minutes. */
export const MAP_HALF = Number(process.env.MAP_HALF ?? 500);
/** Kızıl Katedral is a disc in the middle; the four other regions are the corners. */
export const CATHEDRAL_RADIUS = 160;

export type RegionId = 'mantar' | 'sehir' | 'maymun' | 'col' | 'katedral';
export const REGIONS: Record<RegionId, { name: string; camps: number; mobMult: number; xpMult: number }> = {
  mantar: { name: 'Mantar', camps: 10, mobMult: 1, xpMult: 1 },
  sehir: { name: 'Yıkık şehir', camps: 10, mobMult: 1, xpMult: 1 },
  maymun: { name: 'Maymun ağaç köyü', camps: 10, mobMult: 1, xpMult: 1 },
  col: { name: 'Çöl', camps: 10, mobMult: 1, xpMult: 1 },
  katedral: { name: 'Kızıl Katedral', camps: 8, mobMult: 1.5, xpMult: 1.5 },
};

/** Three mob roles per region (design doc §3.5): swarm, ranged and tank. */
export type MobRole = 'swarm' | 'ranged' | 'tank';
export const MOB_ROLES: Record<MobRole, { hp: number; dmg: number; xp: number; speed: number; range: number; rate: number }> = {
  swarm: { hp: 0.7, dmg: 0.7, xp: 0.8, speed: 7.0, range: 1.6, rate: 0.8 },
  ranged: { hp: 0.8, dmg: 0.9, xp: 1.0, speed: 5.5, range: 12, rate: 1.4 },
  tank: { hp: 2.2, dmg: 1.4, xp: 2.0, speed: 4.5, range: 2.0, rate: 1.5 },
};
/** Names per region, for reports only. */
export const MOB_NAMES: Record<RegionId, Record<MobRole, string>> = {
  mantar: { swarm: 'Miselyum sürüngeni', ranged: 'Spor tükürücü', tank: 'Puantiyeli şişkin' },
  sehir: { swarm: 'Hurda tazısı', ranged: 'Gözcü drone', tank: 'Zombi' },
  maymun: { swarm: 'Dal atlayan', ranged: 'Meyve bombacısı', tank: 'Totem bekçisi' },
  col: { swarm: 'Kum yüzücüsü', ranged: 'Serap', tank: 'Cam akrep' },
  katedral: { swarm: 'Kan hizmetkârı', ranged: 'Yarasa sürüsü', tank: 'Vitray muhafızı' },
};

export const MOBS = {
  packMin: 2,
  packMax: 4,
  /** A cleared camp comes back after this long, if no player stands next to it. */
  respawn: 60,
  aggro: 12,
  leash: 30,
  hp: (min: number) => Math.round(50 * (1 + 0.08 * min)),
  damage: (min: number) => 8 * (1 + 0.05 * min),
};

export const BOSS_NAMES: Record<RegionId, string> = {
  mantar: 'Kök Ana',
  sehir: 'Hurda Devi',
  maymun: 'Gümüş Sırt Şaman',
  col: 'Kum Solucanı Ana',
  katedral: 'Kızıl Kontes',
};
/** Boss schedule: [minute, region]. Each boss waits in its lair until killed. */
export const BOSS_SCHEDULE: [number, RegionId][] = [
  [5, 'mantar'],
  [5, 'col'],
  [12, 'sehir'],
  [12, 'maymun'],
  [19, 'mantar'],
  [19, 'col'],
  [24, 'katedral'],
];
export const BOSS = {
  hp: (min: number) => Math.round(1400 * (1 + 0.05 * min)),
  /** Kızıl Kontes is the final boss. */
  cathedralMult: 1.5,
  aggro: 20,
  leash: 25,
  slamRadius: 5,
  slamDamage: 35,
  slamEvery: 4,
  rockDamage: 20,
  rockEvery: 3,
  speed: 5,
  /** Out of fights for this long, the boss heals back to full. */
  resetAfter: 12,
  /** Move a boss lair that the ring has closed into the next safe circle. */
  spawnInsideRing: false,
};

// ---- Experience -----------------------------------------------------------
export const MAX_LEVEL = 12;
export const MAX_SKILLS = 5;
export const XP_TO_NEXT = [130, 190, 230, 290, 380, 460, 540, 680, 830, 1040, 1290];
export const XP_REWARD = {
  mob: (min: number) => Math.round(20 * (1 + 0.05 * min)),
  player: (victimLevel: number) => 50 + 15 * victimLevel,
  boss: (min: number) => Math.round(250 + 25 * min),
  /** Players that dealt at least 10% of a boss's health but did not kill it get this share. */
  bossAssist: 0,
};
export const CURRENCY = { player: 30, boss: 80, mobChance: 0.2, mob: 5 };
export const TOKEN_PRICE = 40;
/** Buyable vehicle: faster travel while out of combat. */
export const VEHICLE = { price: 60, speedMult: 1.7 };

// ---- Ring (shrinking safe zone) ------------------------------------------
/** [start minute, end minute, radius at end, storm damage per second outside]. */
export const RING: [number, number, number, number][] = [
  [5, 8, 480, 1],
  [11, 13, 330, 2],
  [16, 18, 210, 4],
  [21, 23, 120, 7],
  [26, 28, 60, 12],
  [30, 32, 25, 20],
  [34, 36, 0, 35],
];

// ---- Classes (numbers copied from src/balance.ts) ---------------------------
export type Weapon = {
  /** Damage per hit (sniper: fully charged hit). */
  dmg: number;
  /** Seconds between hits. */
  rate: number;
  range: number;
  /** Ranged only: hit chance multiplier (hitscan lasers aim easier than thrown spears). */
  acc?: number;
  /** Magazine and reload. Without `mag` the weapon never runs dry. */
  mag?: number;
  reload?: number;
  /** Mage wand: heat per shot, cooling per second, lock time when it reaches 1. */
  heat?: { perShot: number; coolPerSec: number; lock: number };
  /** Fighter spears: each thrown spear comes back after this long (instead of a reload). */
  ammoRegen?: number;
  /** Melee only: extra targets hit around the main one (arc sweeps: daggers 100°, claws 110°, sword 120°, rod 150°). */
  cleave?: number;
  /** Scout sniper: holding the scope this long gives full damage; unscoped shots deal `minDmg`. */
  charge?: number;
  minDmg?: number;
};

export type ClassStats = {
  name: string;
  hp: number;
  hpPerLevel: number;
  /** Damage bonus per level above 1. */
  dmgPerLevel: number;
  /** Global damage multiplier (tuning knob, 1 = game numbers). */
  dmgMult: number;
  regenPerSec: number;
  melee: Weapon;
  ranged: Weapon;
  /** Own dash (src/*.ts kit: speed x time), used to close in, kite and run. */
  dash: { dist: number; cd: number };
};

export const CLASSES: Record<ClassId, ClassStats> = {
  rogue: {
    name: 'Rogue',
    hp: 100,
    hpPerLevel: 6,
    dmgPerLevel: 0.04,
    dmgMult: 1,
    regenPerSec: 5,
    melee: { dmg: 20, rate: 0.32, range: 2.3, cleave: 1 },
    ranged: { dmg: 26, rate: 0.32, range: 50, acc: 0.95, mag: 6, reload: 1.5 },
    dash: { dist: 4.7, cd: 1.0 },
  },
  mage: {
    name: 'Mage',
    hp: 95,
    hpPerLevel: 6,
    dmgPerLevel: 0.04,
    dmgMult: 1,
    regenPerSec: 5,
    melee: { dmg: 26, rate: 0.6, range: 3.2, cleave: 2 },
    // Wand heat: 0.12 per shot, cools 0.45/s. At full fire rate it heats 0.43/s, so it never locks.
    ranged: { dmg: 17, rate: 0.28, range: 45, acc: 1.05, heat: { perShot: 0.12, coolPerSec: 0.45, lock: 1.5 } },
    dash: { dist: 4.6, cd: 1.2 },
  },
  fighter: {
    name: 'Fighter',
    hp: 130,
    hpPerLevel: 9,
    dmgPerLevel: 0.035,
    dmgMult: 1,
    regenPerSec: 6,
    melee: { dmg: 30, rate: 0.42, range: 2.9, cleave: 2 },
    ranged: { dmg: 34, rate: 0.6, range: 40, acc: 0.8, mag: 3, ammoRegen: 2.2 },
    dash: { dist: 6, cd: 1.1 },
  },
  scout: {
    name: 'Scout',
    hp: 100,
    hpPerLevel: 7,
    dmgPerLevel: 0.04,
    dmgMult: 1,
    regenPerSec: 5,
    melee: { dmg: 13, rate: 0.24, range: 2.1, cleave: 1 },
    ranged: { dmg: 110, minDmg: 24, charge: 1.4, rate: 1.1, range: 90, acc: 1.1, mag: 4, reload: 2.2 },
    dash: { dist: 5.6, cd: 1.0 },
  },
};

/** Class passives (src/balance.ts). */
export const PASSIVES = {
  rogue: { backstabMult: 1.5, trailStill: 2.5, trailLife: 6, trailCd: 8 },
  /**
   * ROGUE2=1, the user's Rogue rework: standing still only fades (no copy), a dash leaves the copy
   * (on the trail cooldown), and stealth no longer grants Backstab: the Rogue has to get behind.
   */
  rogue2: { on: process.env.ROGUE2 === '1', behindDot: -0.5 },
  /** Gölge izi addition (FADE=1): standing still also makes the Rogue faded for `life` s. */
  rogueFade: { on: process.env.FADE === '1' || process.env.ROGUE2 === '1', life: 10, see: 20, near: 8, hitMult: 0.5, breakNear: 8, breakTime: 1.5 },
  mage: { shieldEvery: 8, orbEvery: 4, orbs: (lvl: number) => (lvl >= 12 ? 5 : lvl >= 6 ? 4 : 3) },
  fighter: { every: 10, shield: 20, cap: 40, lifesteal: 0.1 },
  scout: { beastHp: 70, beastDmg: 12, beastRate: 0.8, beastRange: 18, respawn: 20, highGroundMult: 1.2, highGroundChance: 0.3 },
};

/**
 * Simulated player behaviour: how fast they back off while shooting, how calm they stay early
 * (minutes until full aggression), how big an edge they want before starting a fight.
 */
export const AI = { kiteSpeed: 0.6, calmUntil: 45, engageAt: 1.2, defendAt: 0.8, fleeAt: 0.4 };

/** How well the simulated players aim (0..1), randomised per player. */
export const AIM = { min: 0.5, max: 0.8 };
