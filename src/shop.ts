/**
 * Kurbağa Loncası vendor machines: what they sell and for how much.
 * Pure data and math, no Babylon imports, so the balance simulator (sim/) uses the same prices.
 *
 * Each machine shows a personal stock: items your class can wear, rolled from the machine id,
 * the restock window and your class, so two visits in the same window see the same shelf.
 * Prices were tuned with the simulator (sim/shop-test.ts, report in docs/SHOP.md).
 */
import { ARMOR, ITEM, JEWELS, NOIR, WEAPONS, canWear, type ClassId, type Item, type Rarity, type Slot } from './gear.ts';

export const SHOP = {
  /** Price of a common item per slot. Weapons change how a class plays, so they cost the most. */
  base: { weapon: 45, head: 20, chest: 30, legs: 25, necklace: 35, ring: 35 } as Record<Slot, number>,
  /** Price multiplier per rarity (stats grow x1 / x1.2 / x1.4 / x1.6, legendary also unlocks the ★ rule). */
  rarity: { common: 1, rare: 1.6, epic: 2.5, legendary: 4 } as Record<Rarity, number>,
  /** Gece Karakolu set pieces cost a bit more (the set bonus). */
  setMult: 1.3,
  /** Selling an item back gives this share of its price. */
  sellShare: 0.3,
  /** Items on one machine's shelf. */
  stock: 4,
  /** The shelf is rolled again every this many seconds. */
  restock: 150,
  /** Chance a shelf slot holds a Gece Karakolu piece. */
  setChance: 0.08,
  /** Shop rarity odds by match phase: [from minute, common, rare, epic, legendary]. */
  odds: [
    [0, 0.65, 0.35, 0, 0],
    [8, 0.25, 0.45, 0.3, 0],
    [16, 0, 0.35, 0.5, 0.15],
  ] as [number, number, number, number, number][],
  /** Standing at the machine closer than this opens it (meters). */
  reach: 3.2,
};

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

/**
 * The shelf a class sees at one machine in one restock window. No two items share a slot,
 * and the class's own weapons always have a chance to show up.
 */
export function shopStock(machine: number, cls: ClassId, seconds: number, seed = 1): Item[] {
  const win = restockWindow(seconds);
  const r = rng(seed * 7919 + machine * 104729 + win * 1301 + CLASS_N[cls] * 31);
  for (let i = 0; i < 3; i++) r();
  const min = (win * SHOP.restock) / 60;
  const pool = [...ARMOR, ...JEWELS, ...WEAPONS].filter((d) => canWear(cls, d));
  const used = new Set<Slot>();
  const out: Item[] = [];
  for (let tries = 0; out.length < SHOP.stock && tries < 40; tries++) {
    const set = r() < SHOP.setChance;
    const list = set ? NOIR : pool;
    const d = list[Math.floor(r() * list.length)];
    if (used.has(d.slot)) continue;
    used.add(d.slot);
    out.push({ id: d.id, rarity: shopRarity(min, r()), xp: 0 });
  }
  return out;
}
