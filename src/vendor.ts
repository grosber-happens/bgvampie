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
import { PS } from './core';
import { BAG_SIZE, INV, gainItem, invHooks } from './inventory';
import { clayify } from './look';
import { placeVendors, VENDOR } from './mapgen/vendors.ts';
import { drawObject, type Mat, type Shape } from './planner/kit';
import { baseShape } from './planner/build';
import { SHOP, itemPrice, restockWindow, sellPrice, shopStock } from './shop.ts';
import { CITY_HALF, spotIsOpen, type World } from './world';

export type Machine = { id: number; pos: Vector3; yaw: number };
export const MACHINES: Machine[] = [];
/** Shelf slots already bought: machine:window:index. */
const sold = new Set<string>();
let shopSeed = 1;

/**
 * Put the machines in the city. The prototype city is only 80 m across, so it gets 2
 * (the automatic count in vendors.ts is for real maps).
 */
export function buildVendors(scene: Scene, world: World, seed: number, count = 2) {
  MACHINES.length = 0;
  sold.clear();
  shopSeed = seed;
  if (world.mapObjects && world.field) {
    for (const o of world.mapObjects) {
      if (o.k !== 'satici') continue;
      MACHINES.push({ id: o.v, pos: new Vector3(o.x, world.field.height(o.x, o.z), o.z), yaw: o.r });
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
    MACHINES.push({ id: s.id, pos: new Vector3(s.x, 0, s.z), yaw });
    drawObject(sink, { k: 'satici', x: s.x, z: s.z, s: 1, r: yaw, v: s.id }, 0, 4);
    world.boxes.push({ x: s.x, z: s.z, hw: 1.1, hd: 1.1, y0: 0, y1: 2.6 });
    // A thin amber beam so people can find it from across the city.
    const beam = MeshBuilder.CreateCylinder('vendor-beam', { height: 26, diameter: 0.18, tessellation: 8 }, scene);
    beam.position.set(s.x, 13 + 4, s.z);
    const bm = new StandardMaterial('vendor-beam-mat', scene);
    bm.disableLighting = true;
    bm.emissiveColor = Color3.FromHexString('#ffb347');
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

/** What this machine shows your class now. */
export function shelf(m: Machine, cls: ClassId, seconds: number): ShelfItem[] {
  const win = restockWindow(seconds);
  return shopStock(m.id, cls, seconds, shopSeed).map((it, i) => {
    const key = `${m.id}:${win}:${i}`;
    return { it, price: itemPrice(it), sold: sold.has(key), key };
  });
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
