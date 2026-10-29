/**
 * Gear and bandage in the simulator. All numbers come from src/gear.ts (shared with the game).
 *   GEAR=0      players never get items
 *   BANDAGE=0   no bandage
 *   DROPS=0     items only from the duel loadouts (no drops in matches)
 */
import {
  ALL_ITEMS,
  BANDAGE,
  ITEM,
  JEWEL_XP_SHARE,
  NOIR_SET,
  ZERO,
  armorToDr,
  canWear,
  itemScore,
  rollItem,
  setPieces,
  totalStats,
  uniques,
  type Item,
  type Loadout,
  type Stats,
  type Unique,
} from '../src/gear.ts';
import { CLASSES, type ClassId } from './config.ts';
import { W, dist, heal, minutes, type DmgType, type Unit } from './core.ts';

export const GEAR_ON = { items: process.env.GEAR !== '0', bandage: process.env.BANDAGE !== '0', drops: process.env.DROPS !== '0' };
/** Mob drop chance per kill and items per boss. */
export const DROPS = { mob: Number(process.env.MOB_DROP ?? 0.05), boss: 2, player: 1 };

export type GearState = {
  load: Loadout;
  s: Stats;
  u: Set<Unique>;
  set: number;
  bandCd: number;
  /** Seconds of bandaging left (0 = not bandaging). */
  bandT: number;
  regenT: number;
  guardT: number;
  reelT: number;
  reelCd: number;
  windCd: number;
  windT: number;
  meleeHits: number;
  rangedHits: number;
  /** Report numbers. */
  bandHeal: number;
  bandUses: number;
  bandBroken: number;
};

const state = new Map<Unit, GearState>();
/** Bandage totals across matches (for reports). */
export const BAND_TOTALS = { uses: 0, broken: 0, heal: 0, players: 0 };
const empty = (): GearState => ({ load: {}, s: { ...ZERO }, u: new Set(), set: 0, bandCd: 0, bandT: 0, regenT: 0, guardT: 0, reelT: 0, reelCd: 0, windCd: 0, windT: 0, meleeHits: 0, rangedHits: 0, bandHeal: 0, bandUses: 0, bandBroken: 0 });

export function resetGear() {
  for (const [u, g] of state) if (u.p) (BAND_TOTALS.uses += g.bandUses), (BAND_TOTALS.broken += g.bandBroken), (BAND_TOTALS.heal += g.bandHeal), BAND_TOTALS.players++;
  state.clear();
}

export function gearOf(u: Unit | null): GearState | null {
  if (!u || !u.p) return null;
  let g = state.get(u);
  if (!g) state.set(u, (g = empty()));
  return g;
}

/** Health from class, level and gear. Keeps the current health share. */
export function recomputeHp(u: Unit) {
  const g = gearOf(u);
  if (!g) return;
  const c = CLASSES[u.p!.cls];
  const base = c.hp + c.hpPerLevel * (u.p!.level - 1);
  const max = Math.round((base + g.s.hp) * (1 + g.s.hpPct));
  const share = u.maxHp > 0 ? u.hp / u.maxHp : 1;
  u.maxHp = max;
  u.hp = Math.min(max, Math.max(1, share * max));
}

export function equip(u: Unit, load: Loadout) {
  const g = gearOf(u)!;
  g.load = { ...load };
  g.s = totalStats(g.load);
  g.u = uniques(g.load);
  g.set = setPieces(g.load);
  recomputeHp(u);
}

/** Put an item on if it beats what is worn in that slot. */
export function offer(u: Unit, it: Item) {
  const g = gearOf(u);
  if (!g || !GEAR_ON.items) return;
  const d = ITEM[it.id];
  if (!canWear(u.p!.cls, d)) return;
  const cur = g.load[d.slot];
  // Set pieces are worth more once two or more are worn.
  const bonus = (x: Item | undefined) => (x && ITEM[x.id].set ? g.set * 6 : 0);
  if (cur && itemScore(cur) + bonus(cur) >= itemScore(it) + bonus(it)) return;
  // Weapons: only the hand this player fights with.
  if (d.slot === 'weapon' && d.hand !== (u.p!.melee ? 'melee' : 'ranged') && cur) return;
  equip(u, { ...g.load, [d.slot]: it });
}

// ---- Combat hooks (called from core.ts) -------------------------------------------
const has = (u: Unit | null, id: Unique) => !!u && !!gearOf(u)?.u.has(id);

/** Extra damage the attacker's gear gives. Called before the target's combat timer updates. */
export function gearOut(src: Unit, dst: Unit, raw: number, type: DmgType): number {
  const g = gearOf(src);
  if (!g) return raw;
  const s = g.s;
  const melee = type === 'melee' || ((type === 'skill' || type === 'aoe') && src.p!.melee);
  let m = 1 + s.dmg + (type === 'pet' ? 0 : melee ? s.meleeDmg : s.rangedDmg);
  if (type === 'pet' && g.u.has('packClaw')) m += 0.25;
  if (g.u.has('lastBullet') && type === 'ranged' && src.ammo === 0) m += 1;
  if (dst.p || dst.kind === 'decoy') {
    const marked = (dst as any).clueT > 0 && (dst as any).clueBy === src;
    if (g.set >= NOIR_SET.clue.pieces && marked) m += NOIR_SET.clue.dmg;
    if (g.set >= NOIR_SET.coldOpen.pieces && W.time - dst.lastCombat > NOIR_SET.coldOpen.quiet) m += NOIR_SET.coldOpen.dmg;
    if (g.reelT > 0 && marked) m += NOIR_SET.lastReel.dmg;
  }
  return raw * m;
}

/** Damage left after the target's armor. */
export function gearIn(dst: Unit, dmg: number, type: DmgType): number {
  const g = gearOf(dst);
  if (!g || type === 'storm') return dmg;
  let dr = armorToDr(g.s.armor);
  if (g.u.has('bulwark')) dr += 0.06;
  return dmg * (1 - dr);
}

/** After a hit landed: lifesteal, set marks, broken bandages, weapon counters. */
export function gearAfter(src: Unit | null, dst: Unit, dmg: number, type: DmgType) {
  if (dmg <= 0) return;
  const gd = gearOf(dst);
  if (gd && gd.bandT > 0 && type !== 'dot' && dmg >= dst.maxHp * BANDAGE.breakAt) stopBandage(dst, true);
  const g = gearOf(src);
  if (!g || !src) return;
  if (g.s.lifesteal > 0 && type !== 'dot' && type !== 'storm' && src.noHealT <= 0) heal(src, dmg * g.s.lifesteal);
  if (g.set >= NOIR_SET.clue.pieces && (dst.p || dst.kind === 'decoy')) Object.assign(dst, { clueT: W.time + NOIR_SET.clue.markTime, clueBy: src });
  if (type === 'melee') {
    g.meleeHits++;
    if (g.u.has('tideBlade') && g.meleeHits % 4 === 0 && dst.alive) Object.assign(dst, { hp: dst.hp - 15 * (1 - armorToDr(gearOf(dst)?.s.armor ?? 0)) });
    if (g.u.has('orbPress')) src.p!.orbT += 1.2;
    if (g.u.has('moonCut') && src.backstabT > 0) dst.slowT = Math.max(dst.slowT, 1), (dst.slowAmt = Math.max(dst.slowAmt, 0.4));
  }
  if (type === 'ranged') {
    g.rangedHits++;
    if (g.u.has('markShot') && src.p!.cls === 'scout' && dmg > 40) (dst.markT = 4), (dst.markAmt = Math.max(dst.markAmt, 0.1));
    if (g.u.has('chainBolt') && g.rangedHits % 5 === 0) {
      const other = W.units.find((o) => o !== dst && o.alive && o.kind !== 'decoy' && o !== src && o.owner !== src && dist(o, dst) < 8);
      if (other) other.hp -= dmg * 0.7;
    }
  }
}

/** Clue marks are stored as an absolute time (see gearAfter). */
export function clueActive(u: Unit) {
  return ((u as any).clueT ?? 0) > W.time;
}

export const gearSpeed = (u: Unit) => {
  const g = gearOf(u);
  if (!g) return 1;
  let m = 1 + g.s.speed;
  if (g.bandT > 0) m *= BANDAGE.moveMult;
  if (g.windT > 0) m *= 1.3;
  if (g.reelT > 0) m *= 1 + NOIR_SET.lastReel.speed;
  return m;
};
export const gearTenacity = (u: Unit) => gearOf(u)?.s.tenacity ?? 0;
export const gearCd = (u: Unit) => 1 - (gearOf(u)?.s.cdr ?? 0);
export const gearAtk = (u: Unit) => 1 + (gearOf(u)?.s.atkSpeed ?? 0);
export const gearAoe = (u: Unit | null) => 1 + (gearOf(u)?.s.aoe ?? 0);
export const gearDash = (u: Unit) => {
  const g = gearOf(u);
  if (!g) return 1;
  return (1 + g.s.dashCd) * (g.u.has('twinDash') ? 0.6 : 1);
};
export const gearReach = (u: Unit) => gearOf(u)?.s.reach ?? 0;
export const gearMag = (u: Unit) => {
  const s = gearOf(u)?.s;
  return s ? s.mag + s.spears : 0;
};
export const gearHeat = (u: Unit) => 1 + (gearOf(u)?.s.heat ?? 0);
export const gearCharge = (u: Unit) => 1 + (gearOf(u)?.s.charge ?? 0);
export const gearBackstab = (u: Unit) => gearOf(u)?.s.backstab ?? 0;
export const ramDash = (u: Unit) => has(u, 'ramDash');
/** Heavy legs: closing in with a dash lands as a ground slam. */
export const slamDmg = (u: Unit) => gearOf(u)?.s.slam ?? 0;
/** Seeing through stealth and fade up close (Rain Hood, Last Reel). */
export const seesHidden = (viewer: Unit, d: number) => {
  const g = gearOf(viewer);
  return !!g && ((g.u.has('clearSight') && d < 10) || g.reelT > 0);
};
/** Fast targets are harder to hit; heavy ones easier. */
export function gearDodge(dst: Unit): number {
  const g = gearOf(dst);
  if (!g) return 1;
  return Math.max(0.7, Math.min(1.15, 1 - 0.4 * g.s.speed + 0.05 * g.s.dashCd - 0.02 * g.s.airJumps - 0.01 * g.s.wallRun));
}

// ---- Timers, bandage, set active (called every player step) --------------------------
export function bandaging(u: Unit) {
  return (gearOf(u)?.bandT ?? 0) > 0;
}

function channelTime(g: GearState) {
  return BANDAGE.channel * (g.u.has('nurse') ? 0.6 : 1);
}

export function startBandage(u: Unit): boolean {
  const g = gearOf(u);
  if (!g || !GEAR_ON.bandage || g.bandCd > 0 || g.bandT > 0 || u.stunT > 0 || u.hp >= u.maxHp) return false;
  g.bandT = channelTime(g);
  g.bandUses++;
  return true;
}

export function stopBandage(u: Unit, broken: boolean) {
  const g = gearOf(u);
  if (!g || g.bandT <= 0) return;
  g.bandT = 0;
  g.bandCd = BANDAGE.cd * (1 + g.s.bandageCd) * (broken ? BANDAGE.cancelCd : 1);
  if (broken) g.bandBroken++;
}

export function gearTick(u: Unit, dt: number) {
  const g = gearOf(u);
  if (!g) return;
  g.bandCd -= dt;
  g.reelT -= dt;
  g.reelCd -= dt;
  g.windCd -= dt;
  g.windT -= dt;
  if (g.bandT > 0) {
    const total = channelTime(g);
    const amount = (u.maxHp * BANDAGE.healPct * (1 + g.s.bandageHeal) * Math.min(dt, g.bandT)) / total;
    const before = u.hp;
    heal(u, amount);
    g.bandHeal += u.hp - before;
    g.bandT -= dt;
    if (g.bandT <= 0) {
      g.bandT = 0.0001;
      stopBandage(u, false);
      if (g.u.has('stitchedLining')) u.shield = Math.max(u.shield, 25);
    }
  }
  if (g.s.regenEvery > 0) {
    g.regenT += dt;
    if (g.regenT >= g.s.regenEvery) {
      g.regenT = 0;
      heal(u, u.maxHp * g.s.regenPct);
    }
  }
  if (g.s.guardEvery > 0) {
    g.guardT += dt;
    if (g.guardT >= g.s.guardEvery) {
      g.guardT = 0;
      u.shield = Math.max(u.shield, u.maxHp * g.s.guardPct);
    }
  }
  if (g.u.has('secondWind') && g.windCd <= 0 && u.hp < u.maxHp * 0.3) {
    g.windT = 3;
    g.windCd = 60;
  }
}

/** The bot's bandage and Last Reel decisions. `threatNear`: an enemy player is close and in sight. */
export function gearThink(u: Unit, target: Unit | null, threatNear: boolean) {
  const g = gearOf(u);
  if (!g) return;
  if (g.bandT <= 0 && !threatNear && u.hp < u.maxHp * 0.6 && W.time - u.lastCombat > 1) startBandage(u);
  // Last Reel: when a player fight starts.
  if (g.set >= NOIR_SET.lastReel.pieces && g.reelCd <= 0 && target?.p && dist(u, target) < 20) {
    g.reelT = NOIR_SET.lastReel.dur;
    g.reelCd = NOIR_SET.lastReel.cd;
  }
}

/** Jewels level with the character. */
export function gearXp(u: Unit, amount: number) {
  const g = gearOf(u);
  if (!g) return;
  let changed = false;
  for (const slot of ['ring', 'necklace'] as const) {
    const it = g.load[slot];
    if (it) (it.xp += amount * JEWEL_XP_SHARE), (changed = true);
  }
  if (changed) {
    g.s = totalStats(g.load);
    recomputeHp(u);
  }
}

/** Drops in a match: some mobs, every boss and every player kill. */
export function gearDrop(victim: Unit, killer: Unit | null) {
  if (!GEAR_ON.items || !GEAR_ON.drops || !killer?.p) return;
  const cls = killer.p.cls;
  const min = minutes();
  if (victim.kind === 'mob' && W.rand() < DROPS.mob) offer(killer, rollItem(cls, min, W.rand));
  if (victim.kind === 'boss') for (let i = 0; i < DROPS.boss; i++) offer(killer, rollItem(cls, min, W.rand, true));
  if (victim.kind === 'player') {
    // The killer may take the victim's best piece (if it fits), plus a fresh roll.
    const vg = gearOf(victim);
    for (const it of Object.values(vg?.load ?? {})) if (it) offer(killer, { ...it });
    for (let i = 0; i < DROPS.player; i++) offer(killer, rollItem(cls, min, W.rand));
  }
}

/** A full loadout of one armor weight at one rarity (for duel tests). */
export function kitLoadout(cls: ClassId, weight: 'light' | 'medium' | 'heavy' | 'noir', rarity: Item['rarity'], hand: 'melee' | 'ranged', jewels: [string, string], jewelXp = 2000): Loadout {
  const pick = (slot: string) => {
    if (weight === 'noir') return ALL_ITEMS.find((d) => d.set === 'noir' && d.slot === slot)!;
    return ALL_ITEMS.find((d) => d.slot === slot && d.weight === weight && !d.set)!;
  };
  const w = ALL_ITEMS.find((d) => d.slot === 'weapon' && d.cls === cls && d.hand === hand)!;
  const out: Loadout = {
    head: { id: pick('head').id, rarity, xp: 0 },
    chest: { id: pick('chest').id, rarity, xp: 0 },
    legs: { id: pick('legs').id, rarity, xp: 0 },
    weapon: { id: w.id, rarity, xp: 0 },
    necklace: { id: jewels[0], rarity, xp: jewelXp },
    ring: { id: jewels[1], rarity, xp: jewelXp },
  };
  if (weight === 'noir') {
    out.necklace = { id: 's_locket', rarity, xp: jewelXp };
    out.ring = { id: 's_ring', rarity, xp: jewelXp };
  }
  return out;
}
