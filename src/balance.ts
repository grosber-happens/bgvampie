/**
 * All gameplay numbers in one place so they are easy to tune.
 * The skill rules come from the design doc (/mnt/project-files/design/oynanis-tasarimi.md);
 * the exact numbers are first guesses for playtesting.
 */

// ---- Rogue character ------------------------------------------------------
export const ROGUE = {
  maxHp: 100,
  hpPerLevel: 6,
  /** Damage bonus per character level above 1. */
  damagePerLevel: 0.04,
  /** Out of combat this long, then health comes back. */
  regenDelay: 5,
  regenPerSec: 5,
};

/** Short-range assassination pistol: few bullets, hits hard. */
export const GUN = { magazine: 6, fireRate: 0.32, damage: 26, speed: 90, range: 50, reload: 1.5 };
/** Twin laser daggers: fast left/right slashes. */
export const DAGGERS = { rate: 0.32, damage: 20, range: 2.3, arcDeg: 100 };

/** Backstab passive: hitting from behind (more than 120° from where the target faces). */
export const BACKSTAB = { angleDeg: 120, mult: 1.5 };
/** Passive 2 (Gölge izi): stand still this long and a decoy appears. */
export const SHADOW_TRAIL = { stillTime: 2.5, decoyLife: 6, cooldown: 8 };

/** "Out of combat" means no damage dealt or taken for this long (needed for invisibility). */
export const COMBAT_LOCK = 2;

// ---- Experience -----------------------------------------------------------
export const MAX_LEVEL = 12;
export const MAX_SKILLS = 5;

/**
 * XP needed to go from level N to N+1 (index 0 = level 1 -> 2). Total 6060.
 *
 * Goal (user): max level is reachable between minute 1 and minute 25 of a 25-35 minute match.
 * Most XP comes from mobs (XP grows with match time); player kills and bosses are big bonuses.
 * Checked with a 26-minute headless run of 5 bots (window.__game.sim): bots, which play worse
 * than a person, reach level 2 at minute 1-2 and level 10-11 by minute 25. An active player who
 * also takes a boss should reach level 12 around minute 20-25.
 */
export const XP_TO_NEXT = [130, 190, 230, 290, 380, 460, 540, 680, 830, 1040, 1290];

/** XP for a kill. `min` is the match time in minutes. */
export const XP_REWARD = {
  mob: (min: number) => Math.round(20 * (1 + 0.05 * min)),
  player: (victimLevel: number) => 50 + 15 * victimLevel,
  boss: (min: number) => Math.round(250 + 25 * min),
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
  regenDelay: 5,
  regenPerSec: 6,
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
