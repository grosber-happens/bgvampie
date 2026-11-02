/**
 * Spor Ormanı ground cover in the game: dark grass and fireflies, from the Blender script
 * tools/blender/spor_cimen.py.
 *
 * Grass: every `cimen` patch placed in the map planner is scattered into grass clumps once, at load.
 * Clumps are sorted into square cells; only cells near the player draw, as one thin-instance batch
 * per clump variant and LOD, repacked when the player walks into another cell.
 *
 * Fireflies: every `atesbocegi` swarm wakes up only while the player is near it. Each firefly is a
 * soft watercolor blot (isik_lekesi.png, an additive sprite) that drifts and blinks.
 */
import { Constants } from '@babylonjs/core/Engines/constants';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import '@babylonjs/core/Meshes/thinInstanceMesh';
import { Sprite } from '@babylonjs/core/Sprites/sprite';
import { SpriteManager } from '@babylonjs/core/Sprites/spriteManager';
import '@babylonjs/core/Sprites/spriteSceneComponent';
import type { Scene } from '@babylonjs/core/scene';
import { KINDS } from './mapgen/generate';
import { rng } from './mapgen/noise';
import { loadLodModel } from './models';
import type { World } from './world';
import blotUrl from './assets/spor/isik_lekesi.png?url';

const glbs = import.meta.glob('./assets/spor/cimen_*.glb', { query: '?url', import: 'default', eager: true }) as Record<string, string>;

export const CIMEN = {
  /** Grass clumps per square meter of patch. */
  density: 0.9,
  /** Clumps reach this many patch radii, thinning out past 1, so painted patches blend into one field. */
  edge: 1.2,
  /** Clump variants (Blender .glb names) and how often each is picked. */
  variants: { cimen_kucuk: 3, cimen_orta: 4, cimen_genis: 2, cimen_uzun: 1 } as Record<string, number>,
  /** Random clump size range. */
  scale: [0.8, 1.3],
  /** Cell side in meters: grass is drawn and repacked per cell. */
  cell: 16,
  /** LOD0 under 20 m, LOD1 under 50 m, LOD2 under 110 m, nothing beyond. */
  bands: [20, 50, 110],
  /** Fireflies per square meter of swarm, and at most this many per swarm. */
  fireflyDensity: 0.15,
  fireflyMax: 40,
  /** A swarm wakes within this distance of the player, and sleeps again past it plus 10 m. */
  fireflyNear: 45,
  /** Glow size range (m), height above the ground (m), blink cycle (s). */
  fireflySize: [0.16, 0.28],
  fireflyHeight: [0.3, 2.2],
  fireflyBlink: [2.5, 5.5],
  /** Warm lime-gold, as in the Blender model's glowing tail. */
  fireflyColor: [0.85, 1.0, 0.42],
};

type Cell = { x: number; z: number; mats: Float32Array[] };
type Firefly = { sprite: Sprite; x: number; y: number; z: number; ph: number[]; blink: number; off: number; size: number };
type Swarm = { x: number; z: number; r: number; seed: number; flies: Firefly[] | null; fade: number };

export type GroundCover = { update(dt: number, x: number, z: number): void };

export function buildGroundCover(scene: Scene, world: World): GroundCover {
  const objs = world.mapObjects ?? [];
  const field = world.field;
  const patches = objs.filter((o) => o.k === 'cimen');
  const swarmObjs = objs.filter((o) => o.k === 'atesbocegi');
  if (!field || (!patches.length && !swarmObjs.length)) return { update() {} };

  // ---- grass: scatter every patch into cells
  const names = Object.keys(CIMEN.variants);
  const weights = names.map((n) => CIMEN.variants[n]);
  const total = weights.reduce((a, b) => a + b, 0);
  const tmp: Record<string, number[][]> = {};
  const m = new Matrix();
  const q = new Quaternion();
  const sc = new Vector3();
  const at = new Vector3();
  for (const o of patches) {
    const R = KINDS.cimen.r * o.s;
    const rand = rng(Math.round(o.x * 73 + o.z * 151) ^ (o.v * 7919));
    const n = Math.round(Math.PI * (R * CIMEN.edge) ** 2 * CIMEN.density);
    for (let i = 0; i < n; i++) {
      const a = rand() * Math.PI * 2;
      const d = R * CIMEN.edge * Math.sqrt(rand());
      if (d > R && rand() > (R * CIMEN.edge - d) / (R * (CIMEN.edge - 1))) continue;
      const x = o.x + Math.cos(a) * d, z = o.z + Math.sin(a) * d;
      let pick = rand() * total, v = 0;
      while (v < names.length - 1 && (pick -= weights[v]) > 0) v++;
      const s = CIMEN.scale[0] + rand() * (CIMEN.scale[1] - CIMEN.scale[0]);
      sc.set(s, s * (0.85 + rand() * 0.3), s);
      Quaternion.RotationYawPitchRollToRef(rand() * Math.PI * 2, 0, 0, q);
      at.set(x, field.height(x, z) - 0.03, z);
      Matrix.ComposeToRef(sc, q, at, m);
      const key = `${Math.floor(x / CIMEN.cell)},${Math.floor(z / CIMEN.cell)}`;
      const lists = (tmp[key] ??= names.map(() => []));
      for (let k = 0; k < 16; k++) lists[v].push(m.m[k]);
    }
  }
  const cells: Cell[] = Object.entries(tmp).map(([key, lists]) => {
    const [i, j] = key.split(',').map(Number);
    return { x: (i + 0.5) * CIMEN.cell, z: (j + 0.5) * CIMEN.cell, mats: lists.map((l) => new Float32Array(l)) };
  });

  // One mesh per variant and LOD; filled once the models load.
  let meshes: Mesh[][] | null = null;
  if (cells.length) {
    Promise.all(names.map((n) => loadLodModel(scene, glbs[`./assets/spor/${n}.glb`], 1)))
      .then((models) => {
        meshes = models.map((md) =>
          md.lods.map((parts) => {
            const mesh = parts[0];
            mesh.receiveShadows = true;
            return mesh;
          }),
        );
        lastCell = '';
      })
      .catch((e) => console.error('Grass models failed to load', e));
  }
  let lastCell = '';
  const reach = CIMEN.bands[2] + CIMEN.cell * 0.71;

  function packGrass(px: number, pz: number) {
    if (!meshes) return;
    const lists: Float32Array[][][] = names.map(() => [[], [], []]);
    const counts = names.map(() => [0, 0, 0]);
    for (const c of cells) {
      const d = Math.hypot(c.x - px, c.z - pz);
      if (d > reach) continue;
      const lod = d < CIMEN.bands[0] ? 0 : d < CIMEN.bands[1] ? 1 : 2;
      for (let v = 0; v < names.length; v++) {
        if (!c.mats[v].length) continue;
        lists[v][lod].push(c.mats[v]);
        counts[v][lod] += c.mats[v].length;
      }
    }
    for (let v = 0; v < names.length; v++) {
      for (let l = 0; l < 3; l++) {
        const mesh = meshes[v][l];
        if (!counts[v][l]) {
          mesh.setEnabled(false);
          continue;
        }
        const buf = new Float32Array(counts[v][l]);
        let o = 0;
        for (const part of lists[v][l]) {
          buf.set(part, o);
          o += part.length;
        }
        mesh.thinInstanceSetBuffer('matrix', buf, 16, true);
        mesh.thinInstanceRefreshBoundingInfo(false);
        mesh.setEnabled(true);
      }
    }
  }

  // ---- fireflies
  const swarms: Swarm[] = swarmObjs.map((o) => ({ x: o.x, z: o.z, r: KINDS.atesbocegi.r * o.s, seed: Math.round(o.x * 31 + o.z * 17) ^ o.v, flies: null, fade: 0 }));
  const perSwarm = (s: Swarm) => Math.min(CIMEN.fireflyMax, Math.max(4, Math.round(Math.PI * s.r * s.r * CIMEN.fireflyDensity)));
  let sprites: SpriteManager | null = null;
  if (swarms.length) {
    const cap = Math.max(...swarms.map(perSwarm)) * Math.min(swarms.length, 6);
    sprites = new SpriteManager('atesbocegi', blotUrl, cap, 128, scene);
    sprites.blendMode = Constants.ALPHA_ADD;
    sprites.disableDepthWrite = true;
    sprites.isPickable = false;
  }
  const [cr, cg, cb] = CIMEN.fireflyColor;

  function wake(s: Swarm) {
    const rand = rng(s.seed);
    s.flies = [];
    s.fade = 0;
    for (let i = 0, n = perSwarm(s); i < n; i++) {
      const a = rand() * Math.PI * 2, d = s.r * Math.sqrt(rand());
      const x = s.x + Math.cos(a) * d, z = s.z + Math.sin(a) * d;
      const sprite = new Sprite('atesbocegi', sprites!);
      sprite.isPickable = false;
      const h = CIMEN.fireflyHeight;
      s.flies.push({
        sprite,
        x,
        z,
        y: field!.height(x, z) + h[0] + rand() * (h[1] - h[0]),
        ph: [0, 1, 2, 3, 4, 5].map(() => rand() * Math.PI * 2),
        blink: CIMEN.fireflyBlink[0] + rand() * (CIMEN.fireflyBlink[1] - CIMEN.fireflyBlink[0]),
        off: rand(),
        size: CIMEN.fireflySize[0] + rand() * (CIMEN.fireflySize[1] - CIMEN.fireflySize[0]),
      });
    }
  }

  function sleep(s: Swarm) {
    for (const f of s.flies ?? []) f.sprite.dispose();
    s.flies = null;
  }

  let time = 0;
  function moveFlies(dt: number, px: number, pz: number) {
    time += dt;
    for (const s of swarms) {
      const d = Math.hypot(s.x - px, s.z - pz) - s.r;
      if (!s.flies && d < CIMEN.fireflyNear) wake(s);
      else if (s.flies && d > CIMEN.fireflyNear + 10) sleep(s);
      if (!s.flies) continue;
      s.fade = Math.min(1, s.fade + dt * 0.7);
      for (const f of s.flies) {
        const p = f.ph;
        // Slow wandering loops around the home spot.
        f.sprite.position.set(
          f.x + Math.sin(time * 0.31 + p[0]) * 1.4 + Math.sin(time * 0.83 + p[1]) * 0.5,
          f.y + Math.sin(time * 0.47 + p[2]) * 0.45,
          f.z + Math.cos(time * 0.27 + p[3]) * 1.4 + Math.cos(time * 0.71 + p[4]) * 0.5,
        );
        // Blink: a soft flash once per cycle, a faint ember between flashes.
        const k = (time / f.blink + f.off) % 1;
        const flash = k < 0.3 ? Math.sin((k / 0.3) * Math.PI) : 0;
        const glow = (0.18 + 0.82 * flash) * s.fade;
        f.sprite.color.set(cr, cg, cb, glow);
        f.sprite.size = f.size * (0.75 + 0.35 * flash);
      }
    }
  }

  return {
    update(dt, x, z) {
      const key = `${Math.floor(x / CIMEN.cell)},${Math.floor(z / CIMEN.cell)}`;
      if (key !== lastCell && meshes) {
        lastCell = key;
        packGrass(x, z);
      }
      if (sprites) moveFlies(dt, x, z);
    },
  };
}
