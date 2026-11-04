/** Turns map data into Babylon meshes: vertex-colored terrain, water, and thin-instanced objects. */
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Scene } from '@babylonjs/core/scene';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import { FresnelParameters } from '@babylonjs/core/Materials/fresnelParameters';
import { BIOMES, NB, baseHeight, type Field, type Obj } from '../mapgen/generate';
import { fbm, rng, smooth } from '../mapgen/noise';
import { drawObject, type Mat, type Shape, type Sink } from './kit';
import { STREAM, TERRAIN_STRIDE, lodFor, rectDistance, streamChunks, strideSteps, unloadRadius, type Rect } from '../mapgen/stream';
import type { Kind } from '../mapgen/generate';
import { clayify } from '../look';
import '@babylonjs/core/Meshes/thinInstanceMesh';

const hex = (h: string) => Color3.FromHexString(h);
const BIOME_COLORS = BIOMES.map((b) => b.ground.map(hex));

/**
 * Detail of each kit shape per LOD (0 = near). Far levels use fewer sides; a box is always 12 triangles.
 * cyl/cone/taper: sides, sphere: segments, hemi: profile steps × sides, torus: sides, rock: subdivisions.
 */
const SHAPE_DETAIL = {
  cyl: [16, 8, 5],
  sphere: [10, 4, 3],
  hemi: [[12, 24], [4, 8], [3, 6]],
  torus: [32, 14, 7],
  rock: [2, 1, 1],
} as const;

export function baseShape(scene: Scene, shape: Shape, lod = 0): Mesh {
  let m: Mesh;
  const up = Matrix.Translation(0, 0.5, 0);
  const sides = SHAPE_DETAIL.cyl[lod];
  switch (shape) {
    case 'box':
      m = MeshBuilder.CreateBox('kit-box', { size: 1 }, scene);
      break;
    case 'cyl':
      m = MeshBuilder.CreateCylinder('kit-cyl', { height: 1, diameter: 1, tessellation: sides }, scene);
      m.bakeTransformIntoVertices(up);
      break;
    case 'cone':
      m = MeshBuilder.CreateCylinder('kit-cone', { height: 1, diameterTop: 0, diameterBottom: 1, tessellation: sides }, scene);
      m.bakeTransformIntoVertices(up);
      break;
    case 'taper':
      m = MeshBuilder.CreateCylinder('kit-taper', { height: 1, diameterTop: 0.62, diameterBottom: 1, tessellation: sides }, scene);
      m.bakeTransformIntoVertices(up);
      break;
    case 'sphere':
      m = MeshBuilder.CreateSphere('kit-sphere', { diameter: 1, segments: SHAPE_DETAIL.sphere[lod] }, scene);
      break;
    case 'hemi': {
      const [steps, around] = SHAPE_DETAIL.hemi[lod];
      const pts: Vector3[] = [];
      for (let i = 0; i <= steps; i++) {
        const t = (i / steps) * (Math.PI / 2);
        pts.push(new Vector3(Math.cos(t) * 0.5, Math.sin(t), 0));
      }
      m = MeshBuilder.CreateLathe('kit-hemi', { shape: pts, tessellation: around, closed: true, cap: Mesh.CAP_START }, scene);
      break;
    }
    case 'torus':
      m = MeshBuilder.CreateTorus('kit-torus', { diameter: 0.9, thickness: 0.1, tessellation: SHAPE_DETAIL.torus[lod] }, scene);
      // Height normalized to 1, so a part's y scale is the tube height in meters.
      m.bakeTransformIntoVertices(Matrix.Scaling(1, 10, 1));
      break;
    case 'rock': {
      m = MeshBuilder.CreateIcoSphere('kit-rock', { radius: 0.5, subdivisions: SHAPE_DETAIL.rock[lod], flat: false }, scene);
      const pos = m.getVerticesData(VertexBuffer.PositionKind)!;
      for (let i = 0; i < pos.length; i += 3) {
        const k = 1 + 0.22 * fbm(pos[i] * 3 + 7, pos[i + 2] * 3 + pos[i + 1] * 2, 3, 2);
        pos[i] *= k;
        pos[i + 1] *= k * (pos[i + 1] < -0.2 ? 0.7 : 1);
        pos[i + 2] *= k;
      }
      m.updateVerticesData(VertexBuffer.PositionKind, pos);
      m.convertToFlatShadedMesh();
      break;
    }
  }
  m.isPickable = false;
  m.alwaysSelectAsActiveMesh = false;
  return m;
}

/** One object chunk's parts for one batch: 16 matrix floats and 4 color floats per part. */
type Parts = { mats: number[]; cols: number[] };

/**
 * One draw call: every part of one shape and material at one LOD, from every loaded chunk,
 * packed into one thin-instance buffer. Repacked only when a chunk loads, unloads or changes LOD.
 */
type Batch = { key: string; lod: number; mesh: Mesh; mats: Float32Array; cols: Float32Array | null; dirty: boolean };

/**
 * A Blender model with three LOD levels (see src/models.ts): lods[level] holds its part meshes,
 * `scale` turns a map object's size into model units.
 */
export type LodModel = { name: string; lods: Mesh[][]; scale: number };

/** A circle on the map that changed (brush stroke, placed or moved object). */
export type Area = { x: number; z: number; r: number };

/** Terrain cells per chunk side. One chunk is one terrain mesh. */
const CHUNK_CELLS = 64;
/** Object buckets per terrain chunk side: objects are streamed and rebuilt in these smaller squares. */
const SPLIT = 4;

type Chunk = Rect & {
  i0: number; // first terrain cell column
  j0: number; // first terrain cell row
  ni: number;
  nj: number;
  terrain: Mesh;
  /** Terrain LOD shown now (index into TERRAIN_STRIDE). */
  lod: number;
};
type Bucket = Rect & {
  objs: Obj[];
  /** Parts per batch key, at `lod`; null while the bucket is not loaded. */
  parts: Map<string, Parts> | null;
  lod: number;
  /** An edit touched it: rebuild even if the LOD stays. */
  dirty: boolean;
};

/** Rim vertices and index lists per chunk size and stride, shared by every chunk of that size. */
const rimCache = new Map<string, { rim: number[]; skirtOf: Int32Array }>();
const indexCache = new Map<string, Uint32Array>();

/** Grid vertices on the border of an ni × nj vertex grid, and where each one's skirt vertex sits. */
function rimOf(ni: number, nj: number) {
  const key = `${ni}x${nj}`;
  let r = rimCache.get(key);
  if (!r) {
    const n = ni * nj;
    const skirtOf = new Int32Array(n).fill(-1);
    const rim: number[] = [];
    const add = (k: number) => {
      if (skirtOf[k] >= 0) return;
      skirtOf[k] = n + rim.length;
      rim.push(k);
    };
    for (let i = 0; i < ni; i++) add(i), add((nj - 1) * ni + i);
    for (let j = 0; j < nj; j++) add(j * ni), add(j * ni + ni - 1);
    r = { rim, skirtOf };
    rimCache.set(key, r);
  }
  return r;
}

/** Triangles of one terrain chunk at a stride, with skirts on all four edges. */
function terrainIndices(cells: number, rows: number, stride: number): Uint32Array {
  const key = `${cells}x${rows}@${stride}`;
  let idx = indexCache.get(key);
  if (idx) return idx;
  const ni = cells + 1;
  const { skirtOf } = rimOf(ni, rows + 1);
  const cs = strideSteps(cells, stride), rs = strideSteps(rows, stride);
  const out: number[] = [];
  for (let b = 0; b + 1 < rs.length; b++)
    for (let a = 0; a + 1 < cs.length; a++) {
      const v00 = rs[b] * ni + cs[a], v10 = rs[b] * ni + cs[a + 1], v01 = rs[b + 1] * ni + cs[a], v11 = rs[b + 1] * ni + cs[a + 1];
      out.push(v00, v10, v01, v10, v11, v01);
    }
  // Skirts face both ways, so a crack is covered from either side.
  const skirt = (p: number, q: number) => {
    const sp = skirtOf[p], sq = skirtOf[q];
    out.push(p, q, sp, q, sq, sp, p, sp, q, q, sp, sq);
  };
  for (let a = 0; a + 1 < cs.length; a++) {
    skirt(cs[a], cs[a + 1]);
    skirt(rows * ni + cs[a], rows * ni + cs[a + 1]);
  }
  for (let b = 0; b + 1 < rs.length; b++) {
    skirt(rs[b] * ni, rs[b + 1] * ni);
    skirt(rs[b] * ni + cells, rs[b + 1] * ni + cells);
  }
  idx = new Uint32Array(out);
  indexCache.set(key, idx);
  return idx;
}

/** Longest side of a part in meters, from its world matrix. */
function partSize(m: ArrayLike<number>): number {
  return Math.max(Math.hypot(m[0], m[1], m[2]), Math.hypot(m[4], m[5], m[6]), Math.hypot(m[8], m[9], m[10]));
}

/**
 * Terrain and objects of one map, split into square chunks so a 4 km map stays editable and
 * playable. An edit rebuilds only the chunks it touches. `update` streams object chunks around a
 * point (load and unload radii from mapgen/stream.ts), picks LODs for objects and terrain with a
 * hysteresis band, and packs every loaded chunk into one thin-instance batch per shape, material
 * and LOD, so draw calls stay flat however big the map is.
 */
export class MapView {
  readonly water: Mesh;
  private chunks: Chunk[] = [];
  private buckets: Bucket[] = [];
  private batches = new Map<string, Batch>();
  private models = new Map<Kind, LodModel[]>();
  private nc = 0; // chunks per side
  private nb = 0; // object buckets per side
  private extent = 0; // terrain side in meters
  private res = 0; // terrain cells per side
  private clayMat: StandardMaterial;
  private glowMat: StandardMaterial;
  private terrainMat: StandardMaterial;
  private field: Field | null = null;
  /** Object chunks load within this distance of `update`'s point and unload past unloadRadius(viewRadius). */
  viewRadius = Infinity;
  /** Batches below this LOD cast shadows (the game uses 1: only near objects, so the shadow map stays sharp). */
  castLods = 3;
  /** Terrain chunks cast shadows too (off in the game: on a 4 km map they would stretch the shadow map). */
  terrainCasts = true;
  onCasters: (meshes: Mesh[]) => void = () => {};
  /** Glowing parts glow only at LODs below this (the planner keeps every LOD lit; the game only the near one). */
  glowLods = 3;
  /** Brightness of glowing kit parts (windows, lanterns). The game keeps it at 1 so they never burn through the fog. */
  set glow(v: number) {
    this.glowMat.emissiveColor.set(v, v, v);
  }
  count = 0;
  /** Chunk builds and batch repacks since the last `update`, for the perf page. */
  stats = { builds: 0, repacks: 0, loaded: 0 };

  constructor(private scene: Scene) {
    this.clayMat = new StandardMaterial('kit-clay', scene);
    this.clayMat.diffuseColor = Color3.White();
    this.clayMat.specularColor = new Color3(0.08, 0.07, 0.06);
    clayify(this.clayMat);
    this.glowMat = new StandardMaterial('glow-kit', scene);
    this.glowMat.disableLighting = true;
    this.glowMat.diffuseColor = Color3.Black();
    this.glowMat.emissiveColor = new Color3(1.6, 1.6, 1.6);

    const tm = new StandardMaterial('terrain-mat', scene);
    tm.diffuseColor = Color3.White();
    tm.specularColor = new Color3(0.03, 0.03, 0.03);
    clayify(tm, 40);
    if (tm.bumpTexture) tm.bumpTexture.level = 0.25;
    this.terrainMat = tm;

    this.water = MeshBuilder.CreateGround('water', { width: 1, height: 1, subdivisions: 1 }, scene);
    const wm = new StandardMaterial('water-mat', scene);
    wm.diffuseColor = hex('#3fb8af');
    wm.emissiveColor = hex('#1d6f78').scale(0.35);
    wm.specularColor = new Color3(0.9, 0.75, 0.5);
    wm.specularPower = 90;
    wm.alpha = 0.82;
    const rim = new FresnelParameters();
    rim.bias = 0.2;
    rim.power = 2;
    rim.leftColor = hex('#e6fff9');
    rim.rightColor = hex('#2a7f86');
    wm.reflectionFresnelParameters = rim;
    wm.emissiveFresnelParameters = rim;
    wm.bumpTexture = this.waterRipples();
    this.water.material = wm;
    this.water.receiveShadows = true;
    this.water.isPickable = false;
  }

  private waterRipples(): Texture {
    const N = 256;
    const t = new DynamicTexture('water-ripple', { width: N, height: N }, this.scene, true);
    const ctx = t.getContext() as CanvasRenderingContext2D;
    const img = ctx.createImageData(N, N);
    const h = (x: number, y: number) => fbm(x / 24, y / 24, 5, 3) * 0.5 + Math.sin((x + y) / 9) * 0.15;
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const dx = h(x + 1, y) - h(x - 1, y), dy = h(x, y + 1) - h(x, y - 1);
        const i = (y * N + x) * 4;
        img.data[i] = 128 + dx * 220;
        img.data[i + 1] = 128 + dy * 220;
        img.data[i + 2] = 255;
        img.data[i + 3] = 255;
      }
    ctx.putImageData(img, 0, 0);
    t.update(false);
    t.wrapU = t.wrapV = Texture.WRAP_ADDRESSMODE;
    t.uScale = t.vScale = 30;
    t.level = 0.35;
    return t;
  }

  /** Every terrain chunk mesh. */
  get terrainMeshes(): Mesh[] {
    return this.chunks.map((c) => c.terrain);
  }

  isTerrain(m: { metadata?: unknown }): boolean {
    return m.metadata === 'terrain';
  }

  /** The terrain extends past the playable square so the edge never shows the void. */
  private layout(size: number) {
    const extent = size + 2 * Math.min(size * 0.35, 300);
    // About 2.5 m cells on small maps, 5 m on big ones, never more than 920 cells per side.
    const res = Math.max(200, Math.min(920, Math.round(extent / 5)));
    if (extent === this.extent && res === this.res) return false;
    for (const c of this.chunks) c.terrain.dispose();
    for (const b of this.batches.values()) b.mesh.dispose();
    this.batches.clear();
    this.extent = extent;
    this.res = res;
    this.nc = Math.ceil(res / CHUNK_CELLS);
    this.chunks = [];
    const cell = extent / res;
    for (let cj = 0; cj < this.nc; cj++)
      for (let ci = 0; ci < this.nc; ci++) {
        const i0 = ci * CHUNK_CELLS, j0 = cj * CHUNK_CELLS;
        const ni = Math.min(CHUNK_CELLS, res - i0), nj = Math.min(CHUNK_CELLS, res - j0);
        const terrain = new Mesh(`terrain-${ci}-${cj}`, this.scene);
        terrain.receiveShadows = true;
        terrain.material = this.terrainMat;
        terrain.metadata = 'terrain';
        const x0 = -extent / 2 + i0 * cell, z0 = -extent / 2 + j0 * cell;
        this.chunks.push({ i0, j0, ni, nj, x0, z0, x1: x0 + ni * cell, z1: z0 + nj * cell, terrain, lod: 0 });
      }
    this.nb = this.nc * SPLIT;
    this.buckets = [];
    const bs = (cell * CHUNK_CELLS) / SPLIT;
    for (let bj = 0; bj < this.nb; bj++)
      for (let bi = 0; bi < this.nb; bi++) {
        const x0 = -extent / 2 + bi * bs, z0 = -extent / 2 + bj * bs;
        this.buckets.push({ x0, z0, x1: x0 + bs, z1: z0 + bs, objs: [], parts: null, lod: -1, dirty: true });
      }
    return true;
  }

  private touched<T extends Rect>(list: T[], areas: Area[] | undefined): T[] {
    if (!areas) return list;
    return list.filter((c) => areas.some((a) => a.x + a.r >= c.x0 && a.x - a.r <= c.x1 && a.z + a.r >= c.z0 && a.z - a.r <= c.z1));
  }

  /** Rebuild the terrain heights and colors: everywhere, or only the chunks the areas touch. */
  buildTerrain(field: Field, areas?: Area[]) {
    const p = field.p;
    const fresh = this.layout(p.size);
    for (const c of fresh ? this.chunks : this.touched(this.chunks, areas)) this.buildChunkTerrain(field, c);
    this.water.scaling.set(this.extent * 1.4, 1, this.extent * 1.4);
    this.water.position.y = p.water;
    if (fresh && this.terrainCasts) this.onCasters(this.terrainMeshes);
  }

  private buildChunkTerrain(field: Field, c: Chunk) {
    const p = field.p;
    const size = this.extent;
    const res = this.res;
    const step = size / res;
    const ni = c.ni + 1, nj = c.nj + 1;
    // Heights with a one-cell margin, so normals match across chunk edges.
    const mi = ni + 2;
    const hs = new Float32Array(mi * (nj + 2));
    for (let j = -1; j <= nj; j++)
      for (let i = -1; i <= ni; i++) hs[(j + 1) * mi + i + 1] = field.height(-size / 2 + (c.i0 + i) * step, -size / 2 + (c.j0 + j) * step);
    const H = (i: number, j: number) => hs[(j + 1) * mi + i + 1];
    const ng = ni * nj;
    const { rim } = rimOf(ni, nj);
    const n = ng + rim.length;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 4);
    const uv = new Float32Array(n * 2);
    const normals = new Float32Array(n * 3);
    const w = new Float32Array(NB);
    const half = p.size / 2;
    for (let j = 0; j < nj; j++)
      for (let i = 0; i < ni; i++) {
        const k = j * ni + i;
        const gi = c.i0 + i, gj = c.j0 + j;
        const x = -size / 2 + gi * step, z = -size / 2 + gj * step;
        const h = H(i, j);
        pos[k * 3] = x;
        pos[k * 3 + 1] = h;
        pos[k * 3 + 2] = z;
        uv[k * 2] = gi / res;
        uv[k * 2 + 1] = gj / res;
        const hx = H(i + 1, j) - H(i - 1, j);
        const hz = H(i, j + 1) - H(i, j - 1);
        const nl = Math.hypot(hx, 2 * step, hz);
        normals[k * 3] = -hx / nl;
        normals[k * 3 + 1] = (2 * step) / nl;
        normals[k * 3 + 2] = -hz / nl;
        field.weights(x, z, w);
        const slope = Math.hypot(hx, hz) / (2 * step);
        const nz = fbm(x / 9, z / 9, 41, 3);
        const t = 0.5 + nz * 0.9 + (h - 2) * 0.05;
        let r = 0, g = 0, b = 0;
        for (let bi = 0; bi < NB; bi++) {
          if (w[bi] < 0.002) continue;
          const cc = BIOME_COLORS[bi];
          const lo = t < 0.5 ? cc[0] : cc[1], hi = t < 0.5 ? cc[1] : cc[2];
          const f = t < 0.5 ? smooth(0, 0.5, t) : smooth(0.5, 1, t);
          r += w[bi] * (lo.r + (hi.r - lo.r) * f);
          g += w[bi] * (lo.g + (hi.g - lo.g) * f);
          b += w[bi] * (lo.b + (hi.b - lo.b) * f);
        }
        // Cliffs show bare rock, the canyon floor holds snow, the shore is wet sand.
        const cliff = smooth(0.6, 1.2, slope);
        const rock = w[0] > 0.5 ? [0.36, 0.36, 0.5] : w[4] > 0.5 ? [0.66, 0.38, 0.3] : [0.42, 0.37, 0.38];
        r += (rock[0] - r) * cliff;
        g += (rock[1] - g) * cliff;
        b += (rock[2] - b) * cliff;
        const shore = 1 - smooth(p.water + 0.1, p.water + 0.9, h);
        r += (0.86 - r) * shore * 0.7;
        g += (0.78 - g) * shore * 0.7;
        b += (0.6 - b) * shore * 0.7;
        const under = 1 - smooth(p.water - 2.5, p.water, h);
        r += (0.25 - r) * under * 0.6;
        g += (0.62 - g) * under * 0.6;
        b += (0.6 - b) * under * 0.6;
        // Outside the Harvest the world fades a little, so the playable square reads.
        const out = smooth(half, half + 18, Math.max(Math.abs(x), Math.abs(z)));
        const grey = (r + g + b) / 3;
        r = (r + (grey - r) * out * 0.35) * (1 - out * 0.12);
        g = (g + (grey - g) * out * 0.35) * (1 - out * 0.12);
        b = (b + (grey - b) * out * 0.35) * (1 - out * 0.08);
        col[k * 4] = r;
        col[k * 4 + 1] = g;
        col[k * 4 + 2] = b;
        col[k * 4 + 3] = 1;
      }
    // Skirt vertices: copies of the rim, hanging below it.
    for (let t = 0; t < rim.length; t++) {
      const k = rim[t], q = ng + t;
      pos[q * 3] = pos[k * 3];
      pos[q * 3 + 1] = pos[k * 3 + 1] - STREAM.skirt;
      pos[q * 3 + 2] = pos[k * 3 + 2];
      for (let e = 0; e < 4; e++) col[q * 4 + e] = col[k * 4 + e];
      uv[q * 2] = uv[k * 2];
      uv[q * 2 + 1] = uv[k * 2 + 1];
      for (let e = 0; e < 3; e++) normals[q * 3 + e] = normals[k * 3 + e];
    }
    const m = c.terrain;
    if (!m.getTotalVertices()) {
      const idx = terrainIndices(c.ni, c.nj, TERRAIN_STRIDE[c.lod]);
      m.setIndices(idx, n);
      m.setVerticesData(VertexBuffer.PositionKind, pos, true);
      m.setVerticesData(VertexBuffer.ColorKind, col, true);
      m.setVerticesData(VertexBuffer.UVKind, uv, false);
      m.setVerticesData(VertexBuffer.NormalKind, normals, true);
    } else {
      m.updateVerticesData(VertexBuffer.PositionKind, pos);
      m.updateVerticesData(VertexBuffer.ColorKind, col);
      m.updateVerticesData(VertexBuffer.NormalKind, normals);
    }
    m.refreshBoundingInfo();
  }

  private bucketAt(x: number, z: number): Bucket {
    const bs = ((this.extent / this.res) * CHUNK_CELLS) / SPLIT;
    const bi = Math.max(0, Math.min(this.nb - 1, Math.floor((x + this.extent / 2) / bs)));
    const bj = Math.max(0, Math.min(this.nb - 1, Math.floor((z + this.extent / 2) / bs)));
    return this.buckets[bj * this.nb + bi];
  }

  /** Draw every object of this kind with Blender models (three LODs each) instead of its kit recipe; variants pick by the object's number. */
  useModels(kind: Kind, models: LodModel[]) {
    if (!models.length) return;
    this.models.set(kind, models);
    for (const b of this.buckets) if (b.objs.some((o) => o.k === kind)) b.dirty = true;
  }

  /**
   * Hand the objects to their chunks. With areas, only chunks those areas touch are redrawn;
   * without, all of them. Build terrain first: the chunk layout comes from it.
   */
  buildObjects(field: Field, objs: Obj[], areas?: Area[]) {
    this.field = field;
    for (const b of this.buckets) b.objs = [];
    for (const o of objs) this.bucketAt(o.x, o.z).objs.push(o);
    for (const b of this.touched(this.buckets, areas)) b.dirty = true;
    this.count = objs.length;
    if (this.viewRadius === Infinity) this.update(0, 0);
  }

  /**
   * Stream around a viewer at (x, z), `eye` meters above the ground: load chunks inside viewRadius,
   * free them past unloadRadius, update object and terrain LODs, then repack the batches that changed.
   * At most `budget` chunk builds happen per call, nearest first, so a big map fills in over a few
   * frames instead of freezing one.
   */
  update(x: number, z: number, budget = Infinity, eye = 0) {
    this.stats.builds = this.stats.repacks = 0;
    const dist = (r: Rect) => Math.hypot(rectDistance(r, x, z), eye);

    for (const c of this.chunks) {
      const lod = lodFor(dist(c), c.lod, STREAM.terrainBands);
      if (lod !== c.lod && c.terrain.getTotalVertices()) {
        c.lod = lod;
        c.terrain.setIndices(terrainIndices(c.ni, c.nj, TERRAIN_STRIDE[lod]), c.terrain.getTotalVertices());
      }
    }

    const load = this.viewRadius;
    const { load: toLoad, unload } = streamChunks(this.buckets, (b) => b.parts !== null, x, z, load, unloadRadius(load));
    for (const b of unload) {
      this.markBatches(b);
      b.parts = null;
      b.lod = -1;
      b.dirty = true;
    }
    // Loaded chunks that need a rebuild: edited, or their LOD moved past the hysteresis band.
    const work: [number, Bucket, number][] = [];
    for (const b of toLoad) {
      const d = dist(b);
      work.push([d, b, lodFor(d, -1, STREAM.objectBands)]);
    }
    for (const b of this.buckets) {
      if (!b.parts) continue;
      const d = dist(b);
      const lod = lodFor(d, b.lod, STREAM.objectBands);
      if (lod !== b.lod || b.dirty) work.push([d, b, lod]);
    }
    work.sort((p, q) => p[0] - q[0]);
    for (const [, b, lod] of work) {
      if (budget-- <= 0) break;
      if (this.field) this.buildBucket(this.field, b, lod);
    }

    let loaded = 0;
    for (const b of this.buckets) if (b.parts) loaded++;
    this.stats.loaded = loaded;
    for (const batch of this.batches.values()) if (batch.dirty) this.repack(batch);
  }

  private markBatches(b: Bucket) {
    if (!b.parts) return;
    for (const key of b.parts.keys()) {
      const batch = this.batches.get(key + '|' + b.lod);
      if (batch) batch.dirty = true;
    }
  }

  private batch(key: string, lod: number): Batch {
    const id = key + '|' + lod;
    let batch = this.batches.get(id);
    if (!batch) {
      let mesh: Mesh;
      if (key.startsWith('model|')) {
        // model|<kind>|<variant>|<part>
        const [, kind, variant, part] = key.split('|');
        const src = this.models.get(kind as Kind)![Number(variant)].lods[lod][Number(part)];
        mesh = src.clone(`map-${id}`, null, true, false) as Mesh;
        mesh.makeGeometryUnique();
        mesh.setEnabled(true);
      } else {
        const [shape, mat] = key.split('|') as [Shape, Mat];
        mesh = baseShape(this.scene, shape, lod);
        mesh.material = mat === 'glow' ? this.glowMat : this.clayMat;
        mesh.receiveShadows = mat !== 'glow';
      }
      mesh.name = `map-${id}`;
      mesh.isPickable = false;
      batch = { key, lod, mesh, mats: new Float32Array(0), cols: null, dirty: true };
      this.batches.set(id, batch);
      if (lod < this.castLods) this.onCasters([mesh]);
    }
    return batch;
  }

  private buildBucket(field: Field, b: Bucket, lod: number) {
    this.markBatches(b);
    const parts = new Map<string, Parts>();
    const minPart = STREAM.minPart[lod];
    const put = (key: string, a: ArrayLike<number>, r: number, g: number, bl: number) => {
      let p = parts.get(key);
      if (!p) parts.set(key, (p = { mats: [], cols: [] }));
      for (let i = 0; i < 16; i++) p.mats.push(a[i]);
      p.cols.push(r, g, bl, 1);
    };
    const sink: Sink = {
      part: (shape: Shape, mat: Mat, r: number, g: number, bl: number, m: Matrix) => {
        // Small parts vanish at distance; glowing ones stay longer so lamps read from far away.
        if (mat === 'glow' ? lod === 2 && partSize(m.m) < STREAM.glowMinFar : minPart > 0 && partSize(m.m) < minPart) return;
        // Past the near band glowing parts are painted, not lit: they fade into the fog with the body
        // they sit on, instead of floating in the sky as bright squares.
        put(shape + '|' + (mat === 'glow' && lod >= this.glowLods ? 'clay' : mat), m.m, r, g, bl);
      },
    };
    const tmp = new Matrix();
    for (const o of b.objs) {
      // Sink depth comes from the object's own number, so redrawing one chunk never shifts another.
      const y = baseHeight(field, o) - (o.k === 'nokta' ? 0 : 0.15 + ((o.v * 7919) % 100) / 1000);
      const variants = this.models.get(o.k);
      if (variants) {
        const vi = Math.abs(o.v) % variants.length;
        const model = variants[vi];
        const s = o.s * model.scale;
        Matrix.ComposeToRef(new Vector3(s, s, s), Quaternion.RotationYawPitchRoll(o.r, 0, 0), new Vector3(o.x, y, o.z), tmp);
        for (let i = 0; i < model.lods[lod].length; i++) put(`model|${o.k}|${vi}|${i}`, tmp.m, 1, 1, 1);
        continue;
      }
      drawObject(sink, o, o.k === 'nokta' ? y + 0.03 : y, field.biome(o.x, o.z));
    }
    b.parts = parts;
    b.lod = lod;
    b.dirty = false;
    for (const key of parts.keys()) this.batch(key, lod).dirty = true;
    this.stats.builds++;
  }

  /** Copy every loaded chunk's parts for this batch into its buffers. */
  private repack(batch: Batch) {
    batch.dirty = false;
    this.stats.repacks++;
    let n = 0;
    for (const b of this.buckets) {
      if (b.lod !== batch.lod || !b.parts) continue;
      const p = b.parts.get(batch.key);
      if (p) n += p.cols.length / 4;
    }
    const mesh = batch.mesh;
    if (!n) {
      mesh.setEnabled(false);
      return;
    }
    const model = batch.key.startsWith('model|');
    const grow = batch.mats.length < n * 16;
    if (grow) {
      // Room to grow, so walking around rarely reallocates.
      const cap = Math.ceil(n * 1.5) + 16;
      batch.mats = new Float32Array(cap * 16);
      batch.cols = model ? null : new Float32Array(cap * 4);
    }
    let q = 0;
    for (const b of this.buckets) {
      if (b.lod !== batch.lod || !b.parts) continue;
      const p = b.parts.get(batch.key);
      if (!p) continue;
      batch.mats.set(p.mats, q * 16);
      batch.cols?.set(p.cols, q * 4);
      q += p.cols.length / 4;
    }
    if (grow) {
      mesh.thinInstanceSetBuffer('matrix', batch.mats, 16, false);
      if (batch.cols) mesh.thinInstanceSetBuffer('color', batch.cols, 4, false);
    }
    mesh.thinInstanceCount = n;
    if (!grow) {
      mesh.thinInstanceBufferUpdated('matrix');
      if (batch.cols) mesh.thinInstanceBufferUpdated('color');
    }
    mesh.thinInstanceRefreshBoundingInfo(false);
    mesh.setEnabled(true);
  }

  /** Every object batch mesh. */
  meshes(): Mesh[] {
    return [...this.batches.values()].map((b) => b.mesh);
  }
}
