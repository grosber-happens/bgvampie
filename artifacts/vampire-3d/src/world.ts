import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Scene } from '@babylonjs/core/scene';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';

/** Obstacles are kept as simple 2D shapes on the ground for cheap collision. */
export type Obstacle =
  | { kind: 'box'; x: number; z: number; hw: number; hd: number; h: number }
  | { kind: 'circle'; x: number; z: number; r: number; h: number };

export const ARENA_RADIUS = 70;

export type World = {
  obstacles: Obstacle[];
  shadows: ShadowGenerator;
};

function mat(scene: Scene, name: string, hex: string, emissive = 0): StandardMaterial {
  const m = new StandardMaterial(name, scene);
  m.diffuseColor = Color3.FromHexString(hex);
  m.specularColor = new Color3(0.05, 0.05, 0.05);
  if (emissive) m.emissiveColor = Color3.FromHexString(hex).scale(emissive);
  return m;
}

/** Small seeded random so the test arena looks the same every run. */
function rng(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

export function buildWorld(scene: Scene): World {
  // Moebius-like pastel desert palette for the first test area.
  scene.clearColor = Color4.FromHexString('#f2c9a0ff');
  scene.fogMode = Scene.FOGMODE_EXP2;
  scene.fogDensity = 0.008;
  scene.fogColor = Color3.FromHexString('#f2c9a0');
  scene.ambientColor = new Color3(0.3, 0.25, 0.25);

  const hemi = new HemisphericLight('hemi', new Vector3(0, 1, 0), scene);
  hemi.intensity = 0.45;
  hemi.groundColor = Color3.FromHexString('#7a4b5a');

  const sun = new DirectionalLight('sun', new Vector3(-0.5, -1, 0.35), scene);
  sun.position = new Vector3(40, 60, -30);
  sun.intensity = 0.85;
  sun.diffuse = Color3.FromHexString('#fff1d6');

  const shadows = new ShadowGenerator(2048, sun);
  shadows.useBlurExponentialShadowMap = true;
  shadows.blurKernel = 16;

  const ground = MeshBuilder.CreateDisc('ground', { radius: ARENA_RADIUS + 40, tessellation: 64 }, scene);
  ground.rotation.x = Math.PI / 2;
  ground.material = mat(scene, 'sand', '#d9a27a');
  ground.receiveShadows = true;
  ground.isPickable = true;

  // Arena edge: a soft red ring so the player sees the play area.
  const ring = MeshBuilder.CreateTorus('edge', { diameter: ARENA_RADIUS * 2, thickness: 0.6, tessellation: 96 }, scene);
  ring.position.y = 0.2;
  ring.material = mat(scene, 'edge', '#c0392b', 0.6);
  ring.isPickable = false;

  const obstacles: Obstacle[] = [];
  const rand = rng(7);

  const rockMat = mat(scene, 'rock', '#b9776a');
  const ruinMat = mat(scene, 'ruin', '#8f9bb3');
  const stemMat = mat(scene, 'stem', '#f4ead5');
  const capMats = ['#d6455d', '#7d5ba6', '#3fa7a0'].map((c, i) => mat(scene, `cap${i}`, c, 0.15));

  const addCaster = (m: Mesh) => {
    shadows.addShadowCaster(m);
    m.receiveShadows = true;
  };

  // Mesas / ruined blocks: cover for gunfights.
  for (let i = 0; i < 18; i++) {
    const a = rand() * Math.PI * 2;
    const d = 12 + rand() * (ARENA_RADIUS - 18);
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    const w = 3 + rand() * 6;
    const dpt = 3 + rand() * 6;
    const h = 2 + rand() * 6;
    const box = MeshBuilder.CreateBox(`block${i}`, { width: w, depth: dpt, height: h }, scene);
    box.position.set(x, h / 2, z);
    box.material = i % 3 === 0 ? ruinMat : rockMat;
    addCaster(box);
    obstacles.push({ kind: 'box', x, z, hw: w / 2, hd: dpt / 2, h });
  }

  // Giant mushrooms: a nod to the mushroom region.
  for (let i = 0; i < 10; i++) {
    const a = rand() * Math.PI * 2;
    const d = 15 + rand() * (ARENA_RADIUS - 20);
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    const h = 4 + rand() * 6;
    const r = 0.6 + rand() * 0.6;
    const stem = MeshBuilder.CreateCylinder(`stem${i}`, { height: h, diameterTop: r * 1.6, diameterBottom: r * 2.2 }, scene);
    stem.position.set(x, h / 2, z);
    stem.material = stemMat;
    addCaster(stem);
    const cap = MeshBuilder.CreateSphere(`cap${i}`, { diameter: r * 7, slice: 0.5, segments: 24 }, scene);
    cap.position.set(x, h - 0.2, z);
    cap.material = capMats[i % capMats.length];
    addCaster(cap);
    obstacles.push({ kind: 'circle', x, z, r: r * 1.1, h });
  }

  return { obstacles, shadows };
}

/** Push a circle (an actor on the ground) out of every obstacle and keep it inside the arena. */
export function resolveCollisions(pos: Vector3, radius: number, obstacles: Obstacle[]) {
  for (const o of obstacles) {
    if (o.kind === 'circle') {
      const dx = pos.x - o.x;
      const dz = pos.z - o.z;
      const dist = Math.hypot(dx, dz);
      const min = o.r + radius;
      if (dist < min && dist > 1e-5) {
        pos.x = o.x + (dx / dist) * min;
        pos.z = o.z + (dz / dist) * min;
      }
    } else {
      const cx = Math.max(o.x - o.hw, Math.min(pos.x, o.x + o.hw));
      const cz = Math.max(o.z - o.hd, Math.min(pos.z, o.z + o.hd));
      const dx = pos.x - cx;
      const dz = pos.z - cz;
      const dist = Math.hypot(dx, dz);
      if (dist < radius) {
        if (dist > 1e-5) {
          pos.x = cx + (dx / dist) * radius;
          pos.z = cz + (dz / dist) * radius;
        } else {
          // Center is inside the box: push out along the shallowest axis.
          const px = o.hw + radius - Math.abs(pos.x - o.x);
          const pz = o.hd + radius - Math.abs(pos.z - o.z);
          if (px < pz) pos.x += Math.sign(pos.x - o.x || 1) * px;
          else pos.z += Math.sign(pos.z - o.z || 1) * pz;
        }
      }
    }
  }
  const d = Math.hypot(pos.x, pos.z);
  const max = ARENA_RADIUS - radius;
  if (d > max) {
    pos.x *= max / d;
    pos.z *= max / d;
  }
}

/** True if a point in the air is inside an obstacle (used to stop bullets). */
export function pointHitsObstacle(p: Vector3, obstacles: Obstacle[]): boolean {
  for (const o of obstacles) {
    if (p.y > o.h || p.y < 0) continue;
    if (o.kind === 'circle') {
      if (Math.hypot(p.x - o.x, p.z - o.z) < o.r) return true;
    } else if (Math.abs(p.x - o.x) < o.hw && Math.abs(p.z - o.z) < o.hd) {
      return true;
    }
  }
  return p.y < 0;
}
