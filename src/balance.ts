/**
 * All gameplay numbers in one place so they are easy to tune.
 * The skill rules come from the design doc (/mnt/project-files/design/oynanis-tasarimi.md);
 * the exact numbers are first guesses for playtesting.
 */

// ---- Rogue character ------------------------------------------------------
export const ROGUE = {
  maxHp: 125,
  hpPerLevel: 9,
  /** Damage bonus per character level above 1. */
  damagePerLevel: 0.04,
};

/** Short-range assassination pistol: few bullets, hits hard. */
export const GUN = { magazine: 6, fireRate: 0.32, damage: 26, speed: 90, range: 50, reload: 1.5 };
/** Twin laser daggers: fast left/right slashes. */
export const DAGGERS = { rate: 0.32, damage: 22, range: 2.3, arcDeg: 100 };

/** Backstab passive: hitting from behind (more than 120° from where the target faces). */
export const BACKSTAB = { angleDeg: 120, mult: 1.8 };
/**
 * Passive 2 (Gölge izi): a dash leaves a decoy where it starts (once per `cooldown`).
 * Standing still for `stillTime` makes you faint for `fadeTime` s (also once per `cooldown`).
 * Faint: enemies farther than `seeRange` m can't see you, and shots from beyond `nearRange` m miss `missChance` of the time.
 * It breaks when you attack, take damage, or an enemy stays within `nearRange` m (in sight) for `breakTime` s.
 */
export const SHADOW_TRAIL = { stillTime: 2.5, decoyLife: 6, cooldown: 8, fadeTime: 10, seeRange: 20, nearRange: 8, missChance: 0.5, breakTime: 1.5 };

/** Rogue decoys die to this many hits, whatever the damage. */
export const DECOY_HITS = 2;

/** "Out of combat" means no damage dealt or taken for this long (needed for invisibility). */
export const COMBAT_LOCK = 2;

// ---- Mage (design doc 2.2) ------------------------------------------------
export const MAGE = {
  stats: { maxHp: 105, hpPerLevel: 7, damagePerLevel: 0.06 },
  /** Wand: a quick laser bolt, no ammo but it heats up. */
  wand: { rate: 0.28, damage: 13, range: 45, heatPerShot: 0.16, coolPerSec: 0.45, overheatLock: 1.5 },
  /** Rod: long, slow sweeps that push a little. */
  rod: { rate: 0.6, damage: 26, range: 3.2, arcDeg: 150, push: 1.2 },
  /** Passive 1: after this long out of combat, the next hit is blocked. */
  spellShieldEvery: 10,
  /** Passive 2: an orb every few seconds, up to a cap that grows with level. */
  orbEvery: 4,
  orbCap: (level: number) => (level >= 12 ? 5 : level >= 6 ? 4 : 3),
};

// ---- Fighter ---------------------------------------------------------------
export const FIGHTER = {
  stats: { maxHp: 135, hpPerLevel: 9, damagePerLevel: 0.035 },
  sword: { rate: 0.42, damage: 28, range: 2.9, arcDeg: 120 },
  /** Thrown energy spears: 3 in hand, each comes back after a while. */
  spear: { rate: 0.6, damage: 50, speed: 48, range: 40, count: 3, regen: 1.8 },
  /** Passive 1: shield points every few seconds, up to a cap. */
  shieldEvery: 10,
  shieldAmount: 20,
  shieldCap: 40,
  /** Passive 2: heal a share of damage dealt. */
  lifesteal: 0.07,
};

// ---- Scout -----------------------------------------------------------------
export const SCOUT = {
  stats: { maxHp: 90, hpPerLevel: 6, damagePerLevel: 0.03 },
  claws: { rate: 0.24, damage: 17, range: 2.1, arcDeg: 110 },
  /** Sniper: damage grows while scoped (right mouse), unscoped shots are weak. */
  sniper: { rate: 1.1, minDamage: 28, maxDamage: 80, chargeTime: 3.0, range: 90, magazine: 4, reload: 2.2 },
  /** Passive 1: a cybernetic wolf that hunts what you last hit. */
  companion: { hp: 70, damage: 12, rate: 0.8, speed: 9.5, range: 18, respawn: 20 },
  /** Passive 2: hitting someone at least this much lower deals bonus damage. */
  highGround: { height: 1.5, mult: 1.2 },
};

// ---- Experience -----------------------------------------------------------
export const MAX_LEVEL = 12;
export const MAX_SKILLS = 5;

/**
 * XP needed to go from level N to N+1 (index 0 = level 1 -> 2). Total 7880.
 * Curve from the balance simulation (user-approved 2026-10-29, boss reward 30/min instead of 40).
 *
 * Goal (user): max level is reachable between minute 1 and minute 25 of a 25-35 minute match.
 * Most XP comes from mobs (XP grows with match time); player kills and bosses are big bonuses.
 * Checked with a 26-minute headless run of 5 bots (window.__game.sim): bots, which play worse
 * than a person, reach level 2 at minute 1-2 and level 10-11 by minute 25. An active player who
 * also takes a boss should reach level 12 around minute 20-25.
 */
export const XP_TO_NEXT = [130, 190, 240, 340, 450, 550, 660, 920, 1150, 1450, 1800];

/** XP for a kill. `min` is the match time in minutes. */
export const XP_REWARD = {
  mob: (min: number) => Math.round(20 * (1 + 0.05 * min)),
  player: (victimLevel: number) => 60 + 30 * victimLevel,
  boss: (min: number) => Math.round(400 + 30 * min),
};

/** Currency (x per player kill, y per boss, z% chance per mob). Placeholder values. */
export const CURRENCY = { player: 30, boss: 80, mobChance: 0.2, mob: 5 };
/** A tier-3 upgrade needs a token. There are no shops yet, so the card buys it directly. */
export const TOKEN_PRICE = 40;

// ---- Opponents ------------------------------------------------------------
/** Other "players": local bots that fight everyone, farm mobs and level up. */
export const BOTS = {
  count: 5,
  maxHp: 100,
  hpPerLevel: 8,
  damagePerLevel: 0.06,
  speed: 7,
  sight: 28,
  fireRate: 0.5,
  magazine: 6,
  reload: 1.6,
  damage: 18,
  spread: 0.05,
  meleeDamage: 16,
  /** Below this share of health the bot runs to cover. */
  retreatAt: 0.35,
  /** Prototype only: dead bots come back after this long (a real match has no respawns). */
  respawn: 30,
};

/** Mobs come in small packs. Keep the map lively but not crowded. */
export const MOBS = {
  maxAlive: 10,
  packMin: 2,
  packMax: 4,
  startPacks: 2,
  /** A new pack every this many seconds while below maxAlive. */
  packEvery: 15,
  /** Packs spawn at least this far from the player. */
  minSpawnDist: 22,
  hp: (min: number) => Math.round(50 * (1 + 0.08 * min)),
  damage: (min: number) => 8 * (1 + 0.05 * min),
  speed: 6.5,
  aggro: 12,
  leash: 30,
  attackRange: 1.6,
  attackRate: 1.0,
};

/** One boss at these match minutes. */
export const BOSS = {
  minutes: [5, 13, 21],
  hp: (min: number) => Math.round(1400 * (1 + 0.05 * min)),
  speed: 5,
  aggro: 20,
  leash: 25,
  slamRadius: 5,
  slamWindup: 0.9,
  slamDamage: 35,
  slamEvery: 4,
  rockDamage: 20,
  rockEvery: 3,
  rockSpeed: 22,
};
