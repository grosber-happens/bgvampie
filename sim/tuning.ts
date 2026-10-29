/**
 * Proposed balance changes, applied on top of the game's numbers when TUNED=1.
 *   TUNED=1 node --experimental-strip-types --no-warnings sim/quick.ts
 * Every change here is a proposal for src/balance.ts and the class files.
 */
import { AI, BOSS, BOSS_SCHEDULE, CLASSES, PASSIVES, XP_REWARD, XP_TO_NEXT } from './config.ts';
import { F, M, S } from './kits.ts';

export function applyTuning() {
  // ---- Fighter: a bit too much sustain in long fights.
  CLASSES.fighter.hp = 125;
  CLASSES.fighter.hpPerLevel = 8;
  CLASSES.fighter.regenPerSec = 5;
  PASSIVES.fighter.lifesteal = 0.07;
  CLASSES.fighter.melee.dmg = 28;

  // ---- Mage: the wand never overheats (0.12 heat per shot vs 0.45/s cooling). Strong early, weak late.
  CLASSES.mage.ranged.heat!.perShot = 0.16;
  CLASSES.mage.ranged.dmg = 14;
  CLASSES.mage.dmgPerLevel = 0.06;
  PASSIVES.mage.shieldEvery = 10;
  M.bombs.damage = 32;

  // ---- Scout: weak claws, very strong late sniper.
  CLASSES.scout.melee.dmg = 17;
  CLASSES.scout.ranged.minDmg = 28;
  CLASSES.scout.ranged.dmg = 100;
  CLASSES.scout.dmgPerLevel = 0.03;
  S.pounce.damage = [40, 55, 55];

  // ---- Fighter spear style lags behind.
  CLASSES.fighter.ranged.dmg = 38;
  F.rain.damage = [45, 65, 65];

  // ---- Rogue: dies too fast.
  CLASSES.rogue.hp = 110;
  CLASSES.rogue.hpPerLevel = 7;
  CLASSES.rogue.melee.dmg = 22;

  // ---- XP: bosses and player kills were only ~4% and ~7% of all XP. Make them worth chasing.
  XP_REWARD.boss = (min: number) => Math.round(400 + 40 * min);
  XP_REWARD.player = (victimLevel: number) => 60 + 30 * victimLevel;
  // Late bosses spawned outside the ring and almost never died (3-6%).
  BOSS.spawnInsideRing = true;

  // ---- Levels: with the bigger boss/kill rewards the first player hit level 12 at minute ~14.5.
  XP_TO_NEXT.splice(0, XP_TO_NEXT.length, 130, 190, 240, 340, 450, 550, 660, 920, 1150, 1450, 1800);

  // ---- Boss schedule: a little earlier so the late ones still meet players; the final boss is softer.
  BOSS_SCHEDULE.splice(0, BOSS_SCHEDULE.length, [5, 'mantar'], [5, 'col'], [11, 'sehir'], [11, 'maymun'], [16, 'mantar'], [16, 'col'], [21, 'katedral']);
  BOSS.cathedralMult = 1.3;
}

if (process.env.TUNED === '1') applyTuning();

// ---- Experiment knobs (work with or without TUNED).
if (process.env.NO_BOSS) BOSS_SCHEDULE.splice(0, BOSS_SCHEDULE.length);
/** Minutes until bots reach full aggression; lower = bloodier, shorter matches. */
if (process.env.CALM) AI.calmUntil = Number(process.env.CALM);
/** Scale every class's health, e.g. HP_SCALE=1.4. */
const hpScale = Number(process.env.HP_SCALE ?? 1);
if (hpScale !== 1) for (const c of Object.values(CLASSES)) (c.hp = Math.round(c.hp * hpScale)), (c.hpPerLevel = Math.round(c.hpPerLevel * hpScale));
