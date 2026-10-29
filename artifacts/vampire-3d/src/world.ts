import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Scene } from '@babylonjs/core/scene';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';

/** Every solid thing in the city is an axis-aligned box: center x/z, half sizes, bottom and top height. */
export type Box = { x: number; z: number; hw: number; hd: number; y0: number; y1: number };

/** Half size of the square city district. */
export const CITY_HALF = 40;
/** Highest ledge an actor walks onto without jumping (curbs, rubble). */
export const STEP_HEIGHT = 0.4;

export type World = {
  boxes: Box[];
  shadows: ShadowGenerator;
  seed: number;
};

function mat(scene: Scene, name: string, hex: string, emissive = 0): StandardMaterial {
  const m = new StandardMaterial(name, scene);
  m.diffuseColor = Color3.FromHexString(hex);
  m.specularColor = new Color3(0.04, 0.04, 0.04);
  if (emissive) m.emissiveColor = Color3.FromHexString(hex).scale(emissive);
  return m;
}

/** Small seeded random so a given seed always builds the same city. */
function rng(seed: number) {
  let s = seed % 2147483647 || 1;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export function buildWorld(scene: Scene, seed: number): World {
  const rand = rng(seed);
  const between = (a: number, b: number) => a + rand() * (b - a);

  // Dusty post-apocalyptic sky.
  scene.clearColor = Color4.FromHexString('#d9a37aff');
  scene.fogMode = Scene.FOGMODE_EXP2;
  scene.fogDensity = 0.012;
  scene.fogColor = Color3.FromHexString('#d9a37a');

  const hemi = new HemisphericLight('hemi', new Vector3(0, 1, 0), scene);
  hemi.intensity = 0.5;
  hemi.diffuse = Color3.FromHexString('#ffe3c4');
  hemi.groundColor = Color3.FromHexString('#4a3a44');

  const sun = new DirectionalLight('sun', new Vector3(-0.45, -1, 0.3), scene);
  sun.position = new Vector3(60, 90, -40);
  sun.intensity = 0.95;
  sun.diffuse = Color3.FromHexString('#ffd9a8');

  const shadows = new ShadowGenerator(2048, sun);
  shadows.usePercentageCloserFiltering = true;
  shadows.bias = 0.0008;

  // Ground: asphalt with lighter sidewalks around each block.
  const ground = MeshBuilder.CreateGround('ground', { width: CITY_HALF * 2 + 80, height: CITY_HALF * 2 + 80 }, scene);
  ground.material = mat(scene, 'asphalt', '#5b5250');
  ground.receiveShadows = true;

  const boxes: Box[] = [];
  const statics: Mesh[] = [];
  const wallMats = ['#8d8a86', '#a37b64', '#6f7a82', '#9b9076', '#7c5f57'].map((c, i) => mat(scene, `wall${i}`, c));
  const roofMat = mat(scene, 'roof', '#4a4342');
  const crateMat = mat(scene, 'crate', '#a8743f');
  const rustMat = mat(scene, 'rust', '#8a4b2f');
  const sidewalkMat = mat(scene, 'sidewalk', '#8b8178');
  const lampMat = mat(scene, 'lamp', '#ffcf7a', 0.9);

  let n = 0;
  const addBox = (x: number, z: number, w: number, d: number, y0: number, h: number, material: StandardMaterial, solid = true) => {
    const m = MeshBuilder.CreateBox(`b${n++}`, { width: w, depth: d, height: h }, scene);
    m.position.set(x, y0 + h / 2, z);
    m.material = material;
    m.receiveShadows = true;
    shadows.addShadowCaster(m);
    statics.push(m);
    if (solid) boxes.push({ x, z, hw: w / 2, hd: d / 2, y0, y1: y0 + h });
    return m;
  };

  // City grid: blocks separated by streets.
  const BLOCK = 18;
  const STREET = 8;
  const cell = BLOCK + STREET;
  const count = Math.floor((CITY_HALF * 2) / cell);
  const start = -((count * cell) / 2) + cell / 2;

  for (let i = 0; i < count; i++) {
    for (let j = 0; j < count; j++) {
      const cx = start + i * cell;
      const cz = start + j * cell;

      // Sidewalk slab: a low step that is walked onto without jumping.
      addBox(cx, cz, BLOCK + 2, BLOCK + 2, 0, 0.25, sidewalkMat);

      // Leave the very center block as an open plaza for spawning.
      if (Math.abs(cx) < cell / 2 && Math.abs(cz) < cell / 2) {
        for (let k = 0; k < 6; k++) addBox(cx + between(-8, 8), cz + between(-8, 8), 1.2, 1.2, 0.25, between(0.8, 1.2), crateMat);
        continue;
      }

      // Split the block into 1-4 lots with one building each.
      const split = rand() < 0.5 ? 1 : 2;
      const lot = BLOCK / split;
      for (let a = 0; a < split; a++) {
        for (let b = 0; b < split; b++) {
          const lx = cx - BLOCK / 2 + lot * (a + 0.5);
          const lz = cz - BLOCK / 2 + lot * (b + 0.5);
          const w = between(lot * 0.5, lot * 0.85);
          const d = between(lot * 0.5, lot * 0.85);
          const kind = rand();
          const material = wallMats[Math.floor(rand() * wallMats.length)];

          if (kind < 0.25) {
            // Ruined low wall: easy to jump onto.
            addBox(lx, lz, w, between(0.6, 1.2), 0.25, between(1.0, 1.4), material);
          } else if (kind < 0.65) {
            // Low building (about 3.5 m) with crates as steps to its roof.
            const h = between(3.0, 3.6);
            addBox(lx, lz, w, d, 0.25, h, material);
            addBox(lx, lz, w + 0.3, d + 0.3, 0.25 + h, 0.2, roofMat);
            const side = rand() < 0.5 ? 1 : -1;
            const sx = lx + side * (w / 2 + 0.7);
            addBox(sx, lz + d / 4, 1.4, 1.4, 0.25, 1.2, crateMat);
            addBox(sx, lz - d / 4 + 0.2, 1.4, 1.4, 0.25, 2.4, crateMat);
          } else {
            // Tall tower; some have a broken, smaller top part.
            const h = between(9, 22);
            addBox(lx, lz, w, d, 0.25, h, material);
            if (rand() < 0.5) {
              addBox(lx + between(-1, 1), lz + between(-1, 1), w * 0.6, d * 0.5, 0.25 + h, between(2, 5), material);
            }
            // Window strips for scale.
            for (let y = 2.5; y < h - 1; y += 3) addBox(lx, lz, w + 0.06, d + 0.06, y, 0.5, roofMat, false);
          }
        }
      }

      // Street clutter: wrecked cars and street lamps.
      if (rand() < 0.7) {
        const along = rand() < 0.5;
        const ox = along ? between(-BLOCK / 2, BLOCK / 2) : BLOCK / 2 + STREET / 2;
        const oz = along ? BLOCK / 2 + STREET / 2 : between(-BLOCK / 2, BLOCK / 2);
        addBox(cx + ox, cz + oz, along ? 4 : 2, along ? 2 : 4, 0, 1.3, rustMat);
      }
      const lamp = MeshBuilder.CreateCylinder(`lamp${n++}`, { height: 5, diameter: 0.18 }, scene);
      lamp.position.set(cx + BLOCK / 2 + 0.6, 2.5, cz + BLOCK / 2 + 0.6);
      lamp.material = roofMat;
      statics.push(lamp);
      const bulb = MeshBuilder.CreateSphere(`bulb${n++}`, { diameter: 0.5 }, scene);
      bulb.position.set(lamp.position.x, 5.1, lamp.position.z);
      bulb.material = lampMat;
      statics.push(bulb);
    }
  }

  // Edge of the playable area.
  const edgeMat = mat(scene, 'edge', '#c0392b', 0.5);
  const len = CITY_HALF * 2;
  for (const [x, z, w, d] of [
    [0, CITY_HALF, len, 0.4],
    [0, -CITY_HALF, len, 0.4],
    [CITY_HALF, 0, 0.4, len],
    [-CITY_HALF, 0, 0.4, len],
  ]) {
    const m = MeshBuilder.CreateBox(`edge${n++}`, { width: w, depth: d, height: 0.3 }, scene);
    m.position.set(x, 0.15, z);
    m.material = edgeMat;
    m.isPickable = false;
  }

  for (const m of statics) m.freezeWorldMatrix();
  return { boxes, shadows, seed };
}

function overlapsFootprint(b: Box, x: number, z: number, r: number) {
  const cx = Math.max(b.x - b.hw, Math.min(x, b.x + b.hw));
  const cz = Math.max(b.z - b.hd, Math.min(z, b.z + b.hd));
  return (x - cx) ** 2 + (z - cz) ** 2 < r * r;
}

/** Height of the highest surface under an actor that it can stand on from its current feet height. */
export function groundHeight(pos: Vector3, radius: number, boxes: Box[]): number {
  let g = 0;
  for (const b of boxes) {
    if (b.y1 > g && b.y1 <= pos.y + STEP_HEIGHT && overlapsFootprint(b, pos.x, pos.z, radius * 0.7)) g = b.y1;
  }
  return g;
}

/** Lowest ceiling above the actor's head (for jumping into overhangs), or Infinity. */
export function ceilingHeight(pos: Vector3, radius: number, height: number, boxes: Box[]): number {
  let c = Infinity;
  for (const b of boxes) {
    if (b.y0 >= pos.y + height - 0.05 && b.y0 < c && overlapsFootprint(b, pos.x, pos.z, radius * 0.7)) c = b.y0;
  }
  return c;
}

/** Push an actor (a vertical capsule standing at pos) out of walls and keep it inside the city. */
export function resolveWalls(pos: Vector3, radius: number, height: number, boxes: Box[]) {
  for (const b of boxes) {
    // Only boxes that overlap the body vertically and are too tall to step onto.
    if (b.y1 <= pos.y + STEP_HEIGHT || b.y0 >= pos.y + height) continue;
    const cx = Math.max(b.x - b.hw, Math.min(pos.x, b.x + b.hw));
    const cz = Math.max(b.z - b.hd, Math.min(pos.z, b.z + b.hd));
    const dx = pos.x - cx;
    const dz = pos.z - cz;
    const dist = Math.hypot(dx, dz);
    if (dist >= radius) continue;
    if (dist > 1e-5) {
      pos.x = cx + (dx / dist) * radius;
      pos.z = cz + (dz / dist) * radius;
    } else {
      const px = b.hw + radius - Math.abs(pos.x - b.x);
      const pz = b.hd + radius - Math.abs(pos.z - b.z);
      if (px < pz) pos.x += Math.sign(pos.x - b.x || 1) * px;
      else pos.z += Math.sign(pos.z - b.z || 1) * pz;
    }
  }
  const max = CITY_HALF - radius;
  pos.x = Math.max(-max, Math.min(max, pos.x));
  pos.z = Math.max(-max, Math.min(max, pos.z));
}

/** True if a point is inside a solid box or below the ground (stops bullets and the camera). */
export function pointHitsObstacle(p: Vector3, boxes: Box[]): boolean {
  if (p.y < 0) return true;
  for (const b of boxes) {
    if (p.y > b.y0 && p.y < b.y1 && Math.abs(p.x - b.x) < b.hw && Math.abs(p.z - b.z) < b.hd) return true;
  }
  return false;
}

/** Find an open street-level spot (not inside or on top of anything). */
export function findOpenSpot(boxes: Box[], rand: () => number, radius = 0.6): Vector3 {
  for (let i = 0; i < 200; i++) {
    const p = new Vector3((rand() * 2 - 1) * (CITY_HALF - 5), 0, (rand() * 2 - 1) * (CITY_HALF - 5));
    if (boxes.every((b) => b.y1 <= 0.3 || !overlapsFootprint(b, p.x, p.z, radius + 0.3))) {
      p.y = groundHeight(p, radius, boxes);
      return p;
    }
  }
  return new Vector3(0, 0.25, 0);
}
