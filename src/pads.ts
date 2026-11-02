/**
 * Bouncy morels in the game: draws every pad with the planner recipe (kit.ts `morel`) as thin
 * instances and plays the squash-and-stretch when someone bounces. The throw itself is in bounce.ts.
 */
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Matrix } from '@babylonjs/core/Maths/math.vector';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { Scene } from '@babylonjs/core/scene';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import '@babylonjs/core/Meshes/thinInstanceMesh';
import { BOUNCE } from './balance';
import { squashAt, squashScale } from './bounce';
import { clayify } from './look';
import { drawObject, type Mat, type Shape } from './planner/kit';
import { baseShape } from './planner/build';
import type { World } from './world';

type Group = { mesh: Mesh; mats: number[]; cols: number[]; buf?: Float32Array };
/** One pad: its parts (group + instance index + resting matrix) and its current bounce. */
type Pad = { parts: { g: Group; i: number; rest: Float32Array }[]; x: number; y: number; z: number; t: number; amp: number };

const pads: Pad[] = [];
const groups = new Map<string, Group>();
const tmp = new Matrix(), sq = new Matrix(), out = new Matrix();

export function buildPads(scene: Scene, world: World) {
  pads.length = 0;
  groups.clear();
  if (!world.pads.length) return;
  const clay = new StandardMaterial('pad-clay', scene);
  clay.diffuseColor = Color3.White();
  clay.specularColor = new Color3(0.08, 0.07, 0.06);
  clayify(clay);
  let cur: Pad | null = null;
  const sink = {
    part: (shape: Shape, _mat: Mat, r: number, g: number, b: number, m: Matrix) => {
      let grp = groups.get(shape);
      if (!grp) {
        const mesh = baseShape(scene, shape);
        mesh.name = `pad-${shape}`;
        mesh.material = clay;
        mesh.receiveShadows = true;
        world.shadows.addShadowCaster(mesh);
        groups.set(shape, (grp = { mesh, mats: [], cols: [] }));
      }
      cur!.parts.push({ g: grp, i: grp.cols.length / 4, rest: Float32Array.from(m.m) });
      for (let i = 0; i < 16; i++) grp.mats.push(m.m[i]);
      grp.cols.push(r, g, b, 1);
    },
  };
  for (const p of world.pads) {
    cur = { parts: [], x: p.x, y: p.y, z: p.z, t: 9, amp: 0 };
    pads.push(cur);
    drawObject(sink, { k: 'morel', x: p.x, z: p.z, s: p.s, r: p.r, v: p.v }, p.y, 1);
  }
  for (const g of groups.values()) {
    g.buf = new Float32Array(g.mats);
    g.mesh.thinInstanceSetBuffer('matrix', g.buf, 16, false);
    g.mesh.thinInstanceSetBuffer('color', new Float32Array(g.cols), 4, false);
    g.mesh.thinInstanceRefreshBoundingInfo(false);
  }
}

/** Start the squash on pad `i`; `strength` 0..1 (a soft hop still wobbles a little). */
export function bouncePad(i: number, strength: number) {
  const p = pads[i];
  if (!p) return;
  p.t = 0;
  p.amp = 0.35 + 0.65 * strength;
}

export function updatePads(dt: number) {
  const end = BOUNCE.squash[BOUNCE.squash.length - 1][0];
  const dirty = new Set<Group>();
  for (const p of pads) {
    if (p.t > end) continue;
    p.t += dt;
    const [s, u] = squashAt(p.t);
    const k = squashScale(s * p.amp, u * p.amp, 0.5);
    // Scale about the foot of the mushroom, so it stays planted on the ground.
    Matrix.TranslationToRef(-p.x, -p.y, -p.z, sq);
    Matrix.ScalingToRef(k.xz, k.y, k.xz, tmp);
    sq.multiplyToRef(tmp, sq);
    Matrix.TranslationToRef(p.x, p.y, p.z, tmp);
    sq.multiplyToRef(tmp, sq);
    for (const part of p.parts) {
      Matrix.FromArrayToRef(part.rest, 0, tmp);
      tmp.multiplyToRef(sq, out);
      part.g.buf!.set(out.m, part.i * 16);
      dirty.add(part.g);
    }
  }
  for (const g of dirty) g.mesh.thinInstanceBufferUpdated('matrix');
}
