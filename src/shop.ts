/**
 * Kurbağa Loncası vendor machines: what they sell and for how much.
 * Pure data and math, no Babylon imports, so the balance simulator (sim/) uses the same prices.
 *
 * Two kinds of machine (one in four is lucky):
 *  - Normal: 6 different items your class can wear, rolled from the machine id, the restock window
 *    and your class, so two visits in the same window see the same shelf. No paid refresh.
 *  - Lucky: 6 slots where items can repeat. Pulling the lever (paid) rolls all 6 again, and three of
 *    the same item wins it for free. Rarity odds climb with your level and the match time (TFT style).
 * Both repair chest and head armor for coins.
 * Prices were tuned with the simulator (sim/shop-test.ts, report in docs/SHOP.md).
 */
import { ARMOR, ITEM, JEWELS, NOIR, RARITIES, WEAPONS, canWear, type ClassId, type Item, type Rarity, type Slot } from './gear.ts';

export const SHOP = {
  /** Price of a common item per slot. Weapons change how a class plays, so they cost the most. */
  base: { weapon: 45, head: 20, chest: 30, legs: 25, necklace: 35, ring: 35 } as Record<Slot, number>,
  /** Price multiplier per rarity (stats grow x1 / x1.2 / x1.4 / x1.6, legendary also unlocks the ★ rule). */
  rarity: { common: 1, rare: 1.6, epic: 2.5, legendary: 4 } as Record<Rarity, number>,
  /** Gece Karakolu set pieces cost a bit more (the set bonus). */
  setMult: 1.3,
  /** Selling an item back gives this share of its price. */
  sellShare: 0.3,
  /** The shelf is rolled again every this many seconds. */
  restock: 150,
  /** Shop rarity odds by match phase: [from minute, common, rare, epic, legendary]. */
  odds: [
    [0, 0.65, 0.35, 0, 0],
    [8, 0.25, 0.45, 0.3, 0],
    [16, 0, 0.35, 0.5, 0.15],
  ] as [number, number, number, number, number][],
  /** Standing at the machine closer than this opens it (meters). */
  reach: 3.2,
  /** Items on a shelf. */
  slots: 6,
  /** Repair: coins per lost armor point (rounded up to 5, at least 5). */
  repairPerPoint: 0.5,
  /** Lucky machine: lever price, and how many different items one spin draws its 6 slots from
   * (11 gives three of a kind in about 13% of spins: one win every 7-8 pulls, user's target 6-8).
   * The lever price is a placeholder until the simulator models the lucky machine. */
  spinCost: 15,
  reel: 11,
  /** Lucky odds by progress (0 = level 1 at minute 0, 1 = max level or minute 30):
   * [progress, common, rare, epic, legendary], blended between rows. */
  luckyOdds: [
    [0, 0.7, 0.27, 0.03, 0],
    [0.33, 0.45, 0.38, 0.15, 0.02],
    [0.66, 0.2, 0.35, 0.35, 0.1],
    [1, 0.05, 0.2, 0.45, 0.3],
  ] as [number, number, number, number, number][],
};

/** One machine in four is a lucky one (user, 2026-11-02). */
export const isLucky = (machine: number) => machine % 4 === 3;

/** Repair price for this many lost armor points. */
export const repairPrice = (points: number) => (points <= 0 ? 0 : Math.max(5, Math.ceil((points * SHOP.repairPerPoint) / 5) * 5));

/** Price of an item in coins (rounded to 5). */
export function itemPrice(it: Item): number {
  const d = ITEM[it.id];
  const p = SHOP.base[d.slot] * SHOP.rarity[it.rarity] * (d.set ? SHOP.setMult : 1);
  return Math.round(p / 5) * 5;
}

/** What a machine pays for an item. */
export function sellPrice(it: Item): number {
  return Math.max(1, Math.round(itemPrice(it) * SHOP.sellShare));
}

/** Small seeded random (same as mapgen's). */
function rng(seed: number) {
  let s = Math.floor(Math.abs(seed)) % 2147483647 || 1;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export function shopRarity(min: number, r: number): Rarity {
  let row = SHOP.odds[0];
  for (const o of SHOP.odds) if (min >= o[0]) row = o;
  const [, c, ra, e] = row;
  if (r < c) return 'common';
  if (r < c + ra) return 'rare';
  if (r < c + ra + e) return 'epic';
  return 'legendary';
}

/** Which restock window a time (seconds) falls in. */
export const restockWindow = (seconds: number) => Math.floor(seconds / SHOP.restock);

const CLASS_N: Record<ClassId, number> = { rogue: 1, mage: 2, fighter: 3, scout: 4 };
const wearPool = (cls: ClassId) => [...ARMOR, ...JEWELS, ...WEAPONS, ...NOIR].filter((d) => canWear(cls, d));

/** Normal machine: 6 different items your class can wear; stable within a restock window. */
export function shopStock(machine: number, cls: ClassId, seconds: number, seed = 1): Item[] {
  const win = restockWindow(seconds);
  const r = rng(seed * 7919 + machine * 104729 + win * 1301 + CLASS_N[cls] * 31);
  const min = (win * SHOP.restock) / 60;
  const pool = wearPool(cls);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, SHOP.slots).map((d) => ({ id: d.id, rarity: shopRarity(min, r()), xp: 0 }));
}

/** 0..1: how far the player is (half level, half match time). */
export const progress = (level: number, min: number) => 0.5 * Math.min(1, (level - 1) / 11) + 0.5 * Math.min(1, min / 30);

/** Lucky machine rarity: odds blended between the rows around `prog`. */
export function luckyRarity(prog: number, r: number): Rarity {
  const rows = SHOP.luckyOdds;
  let i = 0;
  while (i < rows.length - 2 && prog > rows[i + 1][0]) i++;
  const [a, b] = [rows[i], rows[i + 1]];
  const k = Math.max(0, Math.min(1, (prog - a[0]) / (b[0] - a[0])));
  const odd = (n: number) => a[n] + (b[n] - a[n]) * k;
  const [c, ra, e] = [odd(1), odd(2), odd(3)];
  if (r < c) return 'common';
  if (r < c + ra) return 'rare';
  if (r < c + ra + e) return 'epic';
  return 'legendary';
}

/** One lever pull: 6 slots drawn from `reel` different items, so repeats happen. */
export function luckySpin(cls: ClassId, prog: number, rand: () => number): Item[] {
  const pool = wearPool(cls);
  const reel: typeof pool = [];
  while (reel.length < Math.min(SHOP.reel, pool.length)) {
    const d = pool[Math.floor(rand() * pool.length)];
    if (!reel.includes(d)) reel.push(d);
  }
  return Array.from({ length: SHOP.slots }, () => ({ id: reel[Math.floor(rand() * reel.length)].id, rarity: luckyRarity(prog, rand()), xp: 0 }));
}

/** Three (or more) of the same item: the prize, at the best rarity among them. */
export function jackpot(items: Item[]): Item | null {
  const by = new Map<string, Item[]>();
  for (const it of items) by.set(it.id, [...(by.get(it.id) ?? []), it]);
  for (const [id, same] of by) {
    if (same.length < 3) continue;
    const best = same.reduce((a, b) => (RARITIES.indexOf(b.rarity) > RARITIES.indexOf(a.rarity) ? b : a));
    return { id, rarity: best.rarity, xp: 0 };
  }
  return null;
}
