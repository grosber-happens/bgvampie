/**
 * Kurbağa Loncası vendor machines in the game: where they stand in the city, their clay look
 * (the same recipe the map planner draws), and buying and selling. Prices and shelves come from
 * shop.ts, placement from mapgen/vendors.ts (both shared with the simulator).
 */
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Scene } from '@babylonjs/core/scene';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import '@babylonjs/core/Meshes/thinInstanceMesh';
import { ITEM, type ClassId, type Item } from './gear';
import { G, PS, minutes } from './core';
import { BAG_SIZE, INV, armorMax, armorNow, gainItem, invHooks, repairArmor, spawnDrop } from './inventory';
import { random } from './random';
import { clayify } from './look';
import { placeVendors, VENDOR } from './mapgen/vendors.ts';
import { drawObject, type Mat, type Shape } from './planner/kit';
import { baseShape } from './planner/build';
import { SHOP, isLucky, itemPrice, jackpot, luckySpin, progress, repairPrice, restockWindow, sellPrice, shopStock } from './shop.ts';
import { CITY_HALF, spotIsOpen, type World } from './world';

export type Machine = { id: number; pos: Vector3; yaw: number; lucky: boolean };
export const MACHINES: Machine[] = [];
/** Shelf slots already bought: machine:window:index. */
const sold = new Set<string>();
/** Lucky machines: the current 6 slots, which were bought, and how many spins. */
const luckyState = new Map<number, { items: Item[]; bought: boolean[]; spins: number }>();
let shopSeed = 1;

/**
 * Put the machines in the city. The prototype city is only 80 m across, so it gets 2
 * (the automatic count in vendors.ts is for real maps).
 */
export function buildVendors(scene: Scene, world: World, seed: number, count = 2) {
  MACHINES.length = 0;
  sold.clear();
  luckyState.clear();
  shopSeed = seed;
  if (world.mapObjects && world.field) {
    for (const o of world.mapObjects) {
      if (o.k !== 'satici') continue;
      MACHINES.push({ id: o.v, pos: new Vector3(o.x, world.field.height(o.x, o.z), o.z), yaw: o.r, lucky: isLucky(o.v) });
    }
    return;
  }
  const spots = placeVendors({
    size: CITY_HALF * 2,
    seed,
    count,
    ok: (x, z) => spotIsOpen(world.boxes, x, z, VENDOR.r + 0.8) && Math.hypot(x, z) > 8 && Math.max(Math.abs(x), Math.abs(z)) < CITY_HALF - 10,
  });
  const clay = new StandardMaterial('vendor-clay', scene);
  clay.diffuseColor = Color3.White();
  clay.specularColor = new Color3(0.08, 0.07, 0.06);
  clayify(clay);
  const glow = new StandardMaterial('vendor-glow', scene);
  glow.disableLighting = true;
  glow.diffuseColor = Color3.Black();
  glow.emissiveColor = new Color3(1.4, 1.4, 1.4);
  const groups = new Map<string, { mesh: Mesh; mats: number[]; cols: number[] }>();
  const sink = {
    part: (shape: Shape, mat: Mat, r: number, g: number, b: number, m: Matrix) => {
      const key = `${shape}|${mat}`;
      let grp = groups.get(key);
      if (!grp) {
        const mesh = baseShape(scene, shape);
        mesh.name = `vendor-${key}`;
        mesh.material = mat === 'glow' ? glow : clay;
        mesh.receiveShadows = mat !== 'glow';
        if (mat !== 'glow') world.shadows.addShadowCaster(mesh);
        groups.set(key, (grp = { mesh, mats: [], cols: [] }));
      }
      for (let i = 0; i < 16; i++) grp.mats.push(m.m[i]);
      grp.cols.push(r, g, b, 1);
    },
  };
  for (const s of spots) {
    // Face the middle of the city.
    const yaw = Math.atan2(-s.x, -s.z);
    MACHINES.push({ id: s.id, pos: new Vector3(s.x, 0, s.z), yaw, lucky: isLucky(s.id) });
    drawObject(sink, { k: 'satici', x: s.x, z: s.z, s: 1, r: yaw, v: s.id }, 0, 4);
    world.boxes.push({ x: s.x, z: s.z, hw: 1.1, hd: 1.1, y0: 0, y1: 2.6 });
    // A thin beam so people can find it from across the city (violet = lucky machine).
    const beam = MeshBuilder.CreateCylinder('vendor-beam', { height: 26, diameter: 0.18, tessellation: 8 }, scene);
    beam.position.set(s.x, 13 + 4, s.z);
    const bm = new StandardMaterial('vendor-beam-mat', scene);
    bm.disableLighting = true;
    bm.emissiveColor = Color3.FromHexString(isLucky(s.id) ? '#c58cf0' : '#ffb347');
    bm.alpha = 0.35;
    beam.material = bm;
    beam.isPickable = false;
  }
  for (const g of groups.values()) {
    g.mesh.thinInstanceSetBuffer('matrix', new Float32Array(g.mats), 16, false);
    g.mesh.thinInstanceSetBuffer('color', new Float32Array(g.cols), 4, false);
    g.mesh.thinInstanceRefreshBoundingInfo(false);
  }
}

/** The machine the player stands at, if any. */
export function nearMachine(pos: Vector3): Machine | null {
  for (const m of MACHINES) if (Math.hypot(m.pos.x - pos.x, m.pos.z - pos.z) < VENDOR.r + SHOP.reach * 0.5) return m;
  return null;
}

export type ShelfItem = { it: Item; price: number; sold: boolean; key: string };

const playerProgress = () => progress(G.player.level, minutes());

function lucky(m: Machine, cls: ClassId) {
  let st = luckyState.get(m.id);
  if (!st) {
    st = { items: luckySpin(cls, playerProgress(), random), bought: Array(SHOP.slots).fill(false), spins: 0 };
    luckyState.set(m.id, st);
  }
  return st;
}

/** What this machine shows your class now. */
export function shelf(m: Machine, cls: ClassId, seconds: number): ShelfItem[] {
  if (m.lucky) {
    const st = lucky(m, cls);
    return st.items.map((it, i) => ({ it, price: itemPrice(it), sold: st.bought[i], key: `L${m.id}:${st.spins}:${i}` }));
  }
  const win = restockWindow(seconds);
  return shopStock(m.id, cls, seconds, shopSeed).map((it, i) => {
    const key = `${m.id}:${win}:${i}`;
    return { it, price: itemPrice(it), sold: sold.has(key), key };
  });
}

/**
 * Lucky machine lever: pay, roll all 6 slots again. Three of the same item puts that item in your bag
 * (or at your feet if the bag is full). Returns an error key, or the prize (null = no prize).
 */
export function spin(m: Machine, cls: ClassId): { err: string } | { prize: Item | null } {
  if (PS.currency < SHOP.spinCost) return { err: 'shopNoMoney' };
  PS.currency -= SHOP.spinCost;
  const st = lucky(m, cls);
  st.items = luckySpin(cls, playerProgress(), random);
  st.bought = Array(SHOP.slots).fill(false);
  st.spins++;
  const prize = jackpot(st.items);
  if (prize) {
    st.items.forEach((it, i) => (st.bought[i] ||= it.id === prize.id));
    if (!gainItem({ ...prize })) spawnDrop({ ...prize }, G.player.pos.clone());
  }
  invHooks.changed();
  return { prize };
}

/** Lost armor points and what fixing them costs. */
export function repairQuote() {
  const lost = Math.round(armorMax() - armorNow());
  return { lost, price: repairPrice(lost) };
}

/** Repair chest and head armor. Returns an error key (i18n) or null. */
export function repair(): string | null {
  const { lost, price } = repairQuote();
  if (lost <= 0) return 'shopRepairNone';
  if (PS.currency < price) return 'shopNoMoney';
  PS.currency -= price;
  repairArmor();
  return null;
}

/** Seconds until the shelves are rolled again. */
export const restockIn = (seconds: number) => Math.ceil(SHOP.restock - (seconds % SHOP.restock));

/** Buy one shelf item. Returns an error key (i18n) or null. */
export function buy(s: ShelfItem): string | null {
  if (s.sold) return 'shopSold';
  if (PS.currency < s.price) return 'shopNoMoney';
  const cur = INV.load[ITEM[s.it.id].slot];
  if (INV.bag.length >= BAG_SIZE && cur) return 'shopBagFull';
  if (!gainItem({ ...s.it })) return 'shopBagFull';
  PS.currency -= s.price;
  sold.add(s.key);
  if (s.key.startsWith('L')) {
    const [m, , i] = s.key.slice(1).split(':').map(Number);
    const st = luckyState.get(m);
    if (st) st.bought[i] = true;
  }
  invHooks.changed();
  return null;
}

/** Sell a bag item. */
export function sell(i: number) {
  const it = INV.bag[i];
  if (!it) return;
  INV.bag.splice(i, 1);
  PS.currency += sellPrice(it);
  invHooks.changed();
}
