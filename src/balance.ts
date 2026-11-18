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

/** Mob base numbers. How many spawn and where is the director's job (HORDE and WAVES below). */
export const MOBS = {
  /** Pack size in the match simulator (sim/match.ts). */
  packMin: 2,
  packMax: 4,
  hp: (min: number) => Math.round(50 * (1 + 0.08 * min)),
  damage: (min: number) => 8 * (1 + 0.05 * min),
  speed: 6.5,
  aggro: 12,
  leash: 30,
  attackRange: 1.6,
  attackRate: 1.0,
};

/**
 * Spor Ormanı creatures that replace the Kenney zombie packs (src/creatures.ts). Each species scales
 * the MOBS numbers. hp/damage are multipliers; speed in m/s; radius/height are the gameplay capsule;
 * attackRange is from the creature's center; windup is the time from the attack start to the hit;
 * walkRef / runRef are the move speeds at which the walk / run clips play at 1× (the run clip takes
 * over halfway between them); arc is the width (degrees) of the attack zone in front of the creature,
 * drawn on the ground during the windup, and only targets inside it are hit; chance is the share of
 * packs; pack is the [min, max] pack size.
 */
export const MOB_SPECIES = {
  geyik: { hp: 1, damage: 1, speed: 6.5, radius: 0.8, height: 2.6, attackRange: 2.5, windup: 0.45, walkRef: 3.2, runRef: 6.5, arc: 70, chance: 0.65, pack: [2, 4] },
  salyangoz: { hp: 2.4, damage: 1.7, speed: 2.8, radius: 1.6, height: 4.8, attackRange: 3.4, windup: 0.7, walkRef: 1.4, runRef: 2.8, arc: 80, chance: 0.35, pack: [1, 2] },
} as const satisfies Record<string, { hp: number; damage: number; speed: number; radius: number; height: number; attackRange: number; windup: number; walkRef: number; runRef: number; arc: number; chance: number; pack: readonly [number, number] }>;
export type MobSpecies = keyof typeof MOB_SPECIES;

/**
 * Survivors-style spawn director (src/horde.ts). [Proposal, first guesses, owner 2026-11-09]
 * Mobs spawn off screen in a ring around the player, a little more often ahead of where the player
 * is running, and chase the player. Mobs left far behind are moved ahead instead of being removed.
 */
export const HORDE = {
  /** Spawn ring around the player (m). Spots the camera can see are skipped when possible. */
  ringMin: 28,
  ringMax: 45,
  /** Share of spawns placed in the half ahead of the player's movement. */
  aheadBias: 0.6,
  /** Hard ceiling on live mobs, events included (performance). */
  cap: 60,
  /** A mob this far from the player, out of the fight and off screen, is moved to the ring ahead (m). */
  relocateDist: 60,
  /** How often the relocation check runs (s). */
  relocateEvery: 1,
  /** Mobs grow out of the ground in a spore puff over this long (s); they cannot act meanwhile. */
  sprout: 0.8,
  /** XP for a horde mob is the normal mob XP times this (there are many more mobs than before). */
  xpScale: 0.35,
  /** Elite mob: bigger, glowing, much tougher; drops much more. */
  elite: { size: 1.35, hp: 8, damage: 1.5, xp: 10, money: 3, glow: '#ffd36a' },
  /** Ring event: mobs close in on the player from every side. */
  ring: { radius: 15 },
  /** Stampede event: a herd runs straight across the player's position, then joins the horde. */
  stampede: { from: 42, width: 14, speedMul: 1.7, run: 6, hitDamage: 1.2 },
};

/**
 * Per-region waves, minute by minute. A stage lasts until the next one's `from` minute.
 * alive: how many mobs the director keeps around the player; every: seconds between spawns;
 * pool: species weights. Events fire once at their minute. hp/damage still grow with MOBS.hp/damage.
 */
/**
 * Swarm nests (owner, 2026-11-09): in some parts of the map the houses hold swarm creatures that stay
 * where they are, inside, and never run at the player. They wake (load) when the player comes near and
 * bite whoever comes within reach. [Proposal] numbers are first guesses; the creature is a stand-in
 * (a small tinted deer) until the owner designs the real swarm creature.
 */
export const NESTS = {
  /** How many nest areas the map gets, and how far each reaches (m): every enterable house inside is a nest. */
  zones: 3,
  zoneRadius: 90,
  /** Nest areas stay at least this far from the player's start (m). */
  awayFromStart: 80,
  /** Creatures per floor, and at most this many floors per house. */
  perFloor: 4,
  maxFloors: 3,
  /** Scattered this far around the floor's middle (m). */
  spread: 1.6,
  /** A nest fills when the player comes this close, and empties (survivors stay counted) past `sleepDist` (m). */
  wakeDist: 55,
  sleepDist: 110,
  /** Stand-in body: deer scaled down, tinted. hp/damage multiply the normal mob numbers. */
  species: 'geyik' as MobSpecies,
  size: 0.42,
  tint: '#7fc77a',
  hp: 0.45,
  damage: 0.6,
  /** They turn to face a target this close and bite when it is in reach. */
  sight: 9,
  /** XP for one, times the normal mob XP. */
  xp: 0.5,
};

export type HordeEvent = { at: number; kind: 'ring' | 'stampede' | 'elite'; species: MobSpecies; count: number };
export const WAVES: Record<string, { minutes: number; stages: { from: number; alive: number; every: number; pool: Partial<Record<MobSpecies, number>> }[]; events: HordeEvent[] }> = {
  spor: {
    /** A run in this region lasts this long (owner, 2026-11-09): then the director stops spawning. */
    minutes: 20,
    stages: [
      { from: 0, alive: 8, every: 2.5, pool: { geyik: 1 } },
      { from: 2, alive: 14, every: 2, pool: { geyik: 3, salyangoz: 1 } },
      { from: 5, alive: 24, every: 1.6, pool: { geyik: 2, salyangoz: 1 } },
      { from: 10, alive: 40, every: 1.2, pool: { geyik: 2, salyangoz: 1 } },
      { from: 15, alive: 55, every: 0.9, pool: { geyik: 3, salyangoz: 2 } },
    ],
    events: [
      { at: 1.5, kind: 'ring', species: 'geyik', count: 8 },
      { at: 3, kind: 'stampede', species: 'geyik', count: 6 },
      { at: 4.5, kind: 'elite', species: 'salyangoz', count: 1 },
      { at: 6.5, kind: 'ring', species: 'geyik', count: 12 },
      { at: 8, kind: 'stampede', species: 'geyik', count: 9 },
      { at: 9.5, kind: 'elite', species: 'geyik', count: 2 },
      { at: 11.5, kind: 'ring', species: 'salyangoz', count: 8 },
      { at: 13, kind: 'stampede', species: 'geyik', count: 12 },
      { at: 14, kind: 'elite', species: 'salyangoz', count: 2 },
      { at: 16.5, kind: 'ring', species: 'geyik', count: 16 },
      { at: 18, kind: 'stampede', species: 'geyik', count: 14 },
    ],
  },
};
/** A dead creature lies still this long after its death clip, then sinks into the ground over `sink` seconds. */
export const CORPSE = { lie: 2.5, sink: 1.2 };

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

/**
 * The Mushroom Woman (Spor Ormanı boss, src/heykel.ts): the statue in the maze. She stands as a statue on
 * her plinth until a player wakes her (V on the plinth), then fights round the maze. She steps over the
 * maze walls, but the walls still block her gill breath. Every attack is telegraphed on the ground first.
 * [Proposal] numbers are first guesses for the owner to tune.
 * Clip hit times (s) match spor_heykel_boss.py in the shared regions/spor-ormani/scriptler folder; the game speeds a clip up or down so its hit
 * lands on the windup below.
 */
export const BOSS_STATUE = {
  hp: (min: number) => Math.round(4200 * (1 + 0.06 * min)),
  /** Gameplay capsule (the 16 m figure); shots hit inside it. */
  radius: 2.6,
  height: 16,
  /** Stand within this of the plinth centre to wake her with V. */
  wakeReach: 9,
  /** The awakening clip; she cannot be hurt until it ends. */
  wakeTime: 4.5,
  /** Players she notices (m, no line of sight needed: she looks over the maze). */
  aggro: 42,
  /** She never walks farther than this from her plinth; past leash + 10 she gives up. */
  leash: 34,
  walkSpeed: 2.4,
  /** Turn rate (rad/s): slow, so running round her buys time. */
  turn: 0.9,
  /** Walks towards a target farther than this. */
  closeTo: 11,
  /** Pause after each attack. */
  rest: 1.4,
  /** Back on the plinth with nobody in sight this long: she turns to stone again with full health. */
  calmTime: 8,
  /** Phase two below this share of health: summons a pack once and attacks faster. */
  enrageAt: 0.5,
  enrageCooldown: 0.75,
  enragePack: 4,
  /** Cap crash: a circle in front of her, she drives the cap down on it. */
  crash: { cd: 7, range: 14, ahead: 8, radius: 6.5, windup: 1.6, clipHit: 1.6, clipLen: 3.0, damage: 48 },
  /** Spore rain: circles on every target near her plus a few random ones; spores land after the windup. */
  rain: { cd: 10, range: 32, count: 4, enrageCount: 7, scatter: 9, radius: 3, windup: 1.9, clipLen: 3.2, damage: 22 },
  /** Root wave: she stamps, a ring of roots runs out along the ground. Jump over it. */
  wave: { cd: 9, range: 22, windup: 1.15, clipHit: 1.15, clipLen: 2.6, speed: 10, maxR: 26, band: 1.1, jumpClear: 0.7, damage: 30 },
  /** Gill breath: she bends down and sweeps a spore cone across (her left to her right). Maze walls and
   * the plinth block it (line of sight from her gills, 3 m up). */
  breath: { cd: 14, range: 26, from: 3, arc: 45, width: 12, windup: 1.2, sweep: 2.0, clipLen: 4.0, tick: 0.2, damage: 9 },
  /** Hold the death pose this long, then she sinks into the plinth. */
  deadHold: 20,
};

// ---- Bouncy morel (zıplama mantarı, Spor Ormanı) ---------------------------
/**
 * A 2 m elastic morel mushroom that works as a jump pad. Land on its top and it throws you
 * up and forward; the higher you fell from, the higher and farther it throws (logic in bounce.ts).
 * A normal jump (1.56 m) can't reach the 2 m top, so it only works when you drop onto it.
 */
export const BOUNCE = {
  /** Top of the cap and footprint half size at scale 1 (meters); the Blender model is 2 m tall. */
  padTop: 2.0,
  padRadius: 0.55,
  /** Falls shorter than this give only a soft hop of `hop` m/s (so you never stand still on it). */
  minFall: 0.6,
  hop: 6.5,
  /** Share of the landing speed given back upward (below 1, so repeated bounces settle down to the hop). */
  keep: 0.9,
  /** Highest upward launch speed (m/s): 24 m/s peaks about 11 m over the cap. */
  maxUp: 24,
  /** Forward push: a base, plus this much per meter fallen, up to the cap (m/s). */
  forwardBase: 6,
  forwardPerMeter: 1.1,
  maxForward: 20,
  /** Air drag while flying from a launch (normal air drag is 1.2/s), so the throw carries far. */
  airDrag: 0.25,
  /** Squash-and-stretch of the mushroom after a bounce: [time s, squash 0..1, stretch 0..1] (matches the Blender clip). */
  squash: [
    [0, 0, 0],
    [0.1, 1, 0],
    [0.27, 0, 1],
    [0.43, 0.45, 0],
    [0.57, 0, 0.32],
    [0.7, 0.14, 0],
    [0.83, 0, 0.05],
    [1, 0, 0],
  ] as const,
  /** Squashed: this share of the height and this much wider; stretched: taller and thinner. */
  squashHeight: 0.62,
  squashBulge: 0.3,
  stretchHeight: 1.2,
  stretchThin: 0.12,
};

/**
 * Blue puffball (mantar_mavi_patlak, src/puf.ts): a shot bursts it and its spore cloud heals the players
 * standing in it. First guesses, waiting for the owner's tuning.
 */
export const PUF = {
  /** Hit cylinder at scale 1 (meters): the model is under 1 m tall. */
  hitRadius: 0.55,
  hitHeight: 1.0,
  /** Spore cloud: radius (m), how long it stays (s), and the share of max health it heals per second. */
  cloudRadius: 3,
  cloudTime: 5,
  healPerSec: 0.04,
  /** Seconds until a burst puffball grows back and can be shot again. */
  regrow: 45,
};

/**
 * Interior designer checks (planner): heights that fit the shared character (capsule 1.85 m tall).
 * Seat and table tops in meters; `pair` is the table top minus the seat top for a seat at a table.
 */
export const INTERIOR = {
  seat: [0.38, 0.55],
  table: [0.68, 0.84],
  counter: [0.78, 0.98],
  pair: [0.22, 0.38],
  /** A seat this close (m) to a table is checked against it. */
  pairReach: 1.3,
  /** Room left under the ceiling (m), and the ceiling when no floor is above. */
  headroom: 0.05,
  ceiling: 3.9,
  /** Props this close to a wall (m) snap their back against it; hanging lamps hang this far under the ceiling. */
  snap: 0.7,
  hangGap: 0.1,
  /** Turn step for R (radians) and the share of overlap that counts as "props inside each other". */
  turn: Math.PI / 12,
  overlap: 0.3,
};
