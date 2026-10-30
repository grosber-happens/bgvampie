/**
 * Kurbağa Loncası vendor machines in the simulator. Placement (src/mapgen/vendors.ts) and
 * prices and shelves (src/shop.ts) are the game's own code.
 *   SHOP=0        no machines (items only from drops)
 *   COVER=200     target distance to the nearest machine (sets the count)
 *   VENDORS=12    fixed number of machines instead
 *
 * Bot rule: with enough coins and nothing to fight, walk to the nearest machine if it is not
 * too far, sell the bag, buy the upgrades that give the most per coin, keep a token's worth
 * when a tier-3 card is close. Shopping takes a few seconds of standing still.
 */
import { ITEM, type Item } from '../src/gear.ts';
import { SHOP, itemPrice, sellPrice, shopStock } from '../src/shop.ts';
import { placeVendors, vendorCount, type VendorSpot } from '../src/mapgen/vendors.ts';
import { MAP_HALF, TOKEN_PRICE } from './config.ts';
import { W, dist, type Unit } from './core.ts';
import { GEAR_ON, SELL, gearOf, offer, upgradeGain } from './gear.ts';

export const SHOP_SIM = {
  on: process.env.SHOP !== '0',
  cover: Number(process.env.COVER ?? 200),
  count: process.env.VENDORS ? Number(process.env.VENDORS) : undefined,
  /** Walk at most this far to a machine (meters). */
  detour: Number(process.env.DETOUR ?? 120),
  /** Go shopping with at least this many coins (or a full bag). */
  budget: Number(process.env.BUDGET ?? 50),
  /** Seconds spent at the machine. */
  time: 3,
  /** Score gain per coin needed to buy (itemScore units). */
  minValue: 0.12,
};
SELL.on = SHOP_SIM.on;
SELL.value = sellPrice;

export let vendors: VendorSpot[] = [];
export const clearVendors = () => void (vendors = []);
/** Totals across matches, for reports. */
export const SHOP_TOTALS = { matches: 0, nearest: 0, nearestN: 0 };

const REGION_INDEX: Record<string, number> = { katedral: 0, mantar: 1, sehir: 2, maymun: 3, col: 4 };

export function buildVendors(seed: number, regionOf: (x: number, z: number) => string) {
  vendors = [];
  if (!SHOP_SIM.on) return;
  const size = MAP_HALF * 2;
  vendors = placeVendors({
    size,
    seed,
    count: SHOP_SIM.count ?? vendorCount(size, SHOP_SIM.cover),
    region: (x, z) => REGION_INDEX[regionOf(x, z)],
    regions: [0, 1, 2, 3, 4],
  });
  SHOP_TOTALS.matches++;
}

export function nearest(u: { x: number; z: number }): { v: VendorSpot | null; d: number } {
  let v: VendorSpot | null = null;
  let d = Infinity;
  for (const s of vendors) {
    const k = Math.hypot(s.x - u.x, s.z - u.z);
    if (k < d) (d = k), (v = s);
  }
  return { v, d };
}

/** Sample how far players are from a machine (for the report). */
export function sampleDistance(u: Unit) {
  if (!vendors.length) return;
  SHOP_TOTALS.nearest += nearest(u).d;
  SHOP_TOTALS.nearestN++;
}

const bagFull = (u: Unit) => u.p!.bag.length >= 6;

/** A machine worth walking to now, or null. `visited` holds the machine+window keys already seen. */
export function shopGoal(u: Unit, visited: Set<string>, insideRing: (v: VendorSpot) => boolean): VendorSpot | null {
  const p = u.p!;
  if (!SHOP_SIM.on || !vendors.length || !GEAR_ON.items) return null;
  const sell = p.bag.reduce((s, x) => s + x, 0);
  if (p.currency + sell < SHOP_SIM.budget && !bagFull(u)) return null;
  const win = Math.floor(W.time / SHOP.restock);
  let best: VendorSpot | null = null;
  let bd = SHOP_SIM.detour;
  for (const v of vendors) {
    if (visited.has(`${v.id}:${win}`) || !insideRing(v)) continue;
    const d = dist(u, v);
    if (d < bd) (bd = d), (best = v);
  }
  return best;
}

/** Selling and buying at one machine. Returns the seconds it took. */
export function shopAt(u: Unit, v: VendorSpot, visited: Set<string>): number {
  const p = u.p!;
  visited.add(`${v.id}:${Math.floor(W.time / SHOP.restock)}`);
  p.visits++;
  for (const x of p.bag) p.currency += x;
  p.bag = [];
  // Keep coins for a tier-3 token when one is close (3 skills at tier 2 and levels to go).
  const atTwo = p.skills.filter((s) => s.tier === 2).length;
  const reserve = atTwo >= 3 && p.level < 12 ? TOKEN_PRICE : 0;
  const shelf = shopStock(v.id, p.cls, W.time, 7);
  const g = gearOf(u)!;
  for (;;) {
    let best: Item | null = null;
    let bv = SHOP_SIM.minValue;
    for (const it of shelf) {
      const price = itemPrice(it);
      if (price > p.currency - reserve) continue;
      const v2 = upgradeGain(u, it) / price;
      if (v2 > bv) (bv = v2), (best = it);
    }
    if (!best) break;
    const price = itemPrice(best);
    p.currency -= price;
    p.spent += price;
    p.bought++;
    shelf.splice(shelf.indexOf(best), 1);
    const old = g.load[ITEM[best.id].slot];
    offer(u, best, 'shop', price);
    if (old) p.currency += sellPrice(old);
  }
  return SHOP_SIM.time;
}
