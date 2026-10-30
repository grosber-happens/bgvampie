/** Turns map data into Babylon meshes: vertex-colored terrain, water, and thin-instanced objects. */
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Scene } from '@babylonjs/core/scene';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import { FresnelParameters } from '@babylonjs/core/Materials/fresnelParameters';
import { BIOMES, NB, type Field, type Obj } from '../mapgen/generate';
import { fbm, rng, smooth } from '../mapgen/noise';
import { drawObject, type Mat, type Shape, type Sink } from './kit';
import { clayify } from '../look';
import '@babylonjs/core/Meshes/thinInstanceMesh';

const hex = (h: string) => Color3.FromHexString(h);
const BIOME_COLORS = BIOMES.map((b) => b.ground.map(hex));

function baseShape(scene: Scene, shape: Shape): Mesh {
  let m: Mesh;
  const up = Matrix.Translation(0, 0.5, 0);
  switch (shape) {
    case 'box':
      m = MeshBuilder.CreateBox('kit-box', { size: 1 }, scene);
      break;
    case 'cyl':
      m = MeshBuilder.CreateCylinder('kit-cyl', { height: 1, diameter: 1, tessellation: 16 }, scene);
      m.bakeTransformIntoVertices(up);
      break;
    case 'cone':
      m = MeshBuilder.CreateCylinder('kit-cone', { height: 1, diameterTop: 0, diameterBottom: 1, tessellation: 16 }, scene);
      m.bakeTransformIntoVertices(up);
      break;
    case 'taper':
      m = MeshBuilder.CreateCylinder('kit-taper', { height: 1, diameterTop: 0.62, diameterBottom: 1, tessellation: 16 }, scene);
      m.bakeTransformIntoVertices(up);
      break;
    case 'sphere':
      m = MeshBuilder.CreateSphere('kit-sphere', { diameter: 1, segments: 10 }, scene);
      break;
    case 'hemi': {
      const pts: Vector3[] = [];
      for (let i = 0; i <= 12; i++) {
        const t = (i / 12) * (Math.PI / 2);
        pts.push(new Vector3(Math.cos(t) * 0.5, Math.sin(t), 0));
      }
      m = MeshBuilder.CreateLathe('kit-hemi', { shape: pts, tessellation: 24, closed: true, cap: Mesh.CAP_START }, scene);
      break;
    }
    case 'torus':
      m = MeshBuilder.CreateTorus('kit-torus', { diameter: 0.9, thickness: 0.1, tessellation: 32 }, scene);
      // Height normalized to 1, so a part's y scale is the tube height in meters.
      m.bakeTransformIntoVertices(Matrix.Scaling(1, 10, 1));
      break;
    case 'rock': {
      m = MeshBuilder.CreateIcoSphere('kit-rock', { radius: 0.5, subdivisions: 2, flat: false }, scene);
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

type Group = { mesh: Mesh; mats: number[]; cols: number[] };

export class MapView {
  readonly terrain: Mesh;
  readonly water: Mesh;
  private groups = new Map<string, Group>();
  private clayMat: StandardMaterial;
  private glowMat: StandardMaterial;
  private terrainRes = 200;
  private terrainSize = 0;
  onCasters: (meshes: Mesh[]) => void = () => {};
  count = 0;

  constructor(private scene: Scene) {
    this.clayMat = new StandardMaterial('kit-clay', scene);
    this.clayMat.diffuseColor = Color3.White();
    this.clayMat.specularColor = new Color3(0.08, 0.07, 0.06);
    clayify(this.clayMat);
    this.glowMat = new StandardMaterial('glow-kit', scene);
    this.glowMat.disableLighting = true;
    this.glowMat.diffuseColor = Color3.Black();
    this.glowMat.emissiveColor = new Color3(1.6, 1.6, 1.6);

    this.terrain = new Mesh('terrain', scene);
    this.terrain.receiveShadows = true;
    const tm = new StandardMaterial('terrain-mat', scene);
    tm.diffuseColor = Color3.White();
    tm.specularColor = new Color3(0.03, 0.03, 0.03);
    clayify(tm, 40);
    if (tm.bumpTexture) tm.bumpTexture.level = 0.25;
    this.terrain.material = tm;

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

  /** Rebuild the terrain heights and colors. */
  buildTerrain(field: Field) {
    const p = field.p;
    const size = p.size * 1.7;
    const res = this.terrainRes;
    const n = res + 1;
    const pos = new Float32Array(n * n * 3);
    const col = new Float32Array(n * n * 4);
    const uv = new Float32Array(n * n * 2);
    const w = new Float32Array(NB);
    const half = p.size / 2;
    const hs = new Float32Array(n * n);
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const x = -size / 2 + (i / res) * size, z = -size / 2 + (j / res) * size;
        hs[j * n + i] = field.height(x, z);
      }
    const step = size / res;
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const k = j * n + i;
        const x = -size / 2 + (i / res) * size, z = -size / 2 + (j / res) * size;
        const h = hs[k];
        pos[k * 3] = x;
        pos[k * 3 + 1] = h;
        pos[k * 3 + 2] = z;
        uv[k * 2] = i / res;
        uv[k * 2 + 1] = j / res;
        field.weights(x, z, w);
        const hx = hs[j * n + Math.min(res, i + 1)] - hs[j * n + Math.max(0, i - 1)];
        const hz = hs[Math.min(res, j + 1) * n + i] - hs[Math.max(0, j - 1) * n + i];
        const slope = Math.hypot(hx, hz) / (2 * step);
        const nz = fbm(x / 9, z / 9, 41, 3);
        const t = 0.5 + nz * 0.9 + (h - 2) * 0.05;
        let r = 0, g = 0, b = 0;
        for (let bi = 0; bi < NB; bi++) {
          if (w[bi] < 0.002) continue;
          const c = BIOME_COLORS[bi];
          const lo = t < 0.5 ? c[0] : c[1], hi = t < 0.5 ? c[1] : c[2];
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
    if (this.terrainSize !== size || !this.terrain.getTotalVertices()) {
      const idx = new Uint32Array(res * res * 6);
      let q = 0;
      for (let j = 0; j < res; j++)
        for (let i = 0; i < res; i++) {
          const a = j * n + i, b2 = a + 1, c = a + n, d = c + 1;
          idx[q++] = a; idx[q++] = b2; idx[q++] = c;
          idx[q++] = b2; idx[q++] = d; idx[q++] = c;
        }
      this.terrain.setIndices(idx, n * n);
      this.terrain.setVerticesData(VertexBuffer.PositionKind, pos, true);
      this.terrain.setVerticesData(VertexBuffer.ColorKind, col, true);
      this.terrain.setVerticesData(VertexBuffer.UVKind, uv, false);
      this.terrainSize = size;
    } else {
      this.terrain.updateVerticesData(VertexBuffer.PositionKind, pos);
      this.terrain.updateVerticesData(VertexBuffer.ColorKind, col);
    }
    const normals = new Float32Array(n * n * 3);
    // Normals from the height grid (cheaper and smoother than face normals).
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const k = j * n + i;
        const hx = hs[j * n + Math.min(res, i + 1)] - hs[j * n + Math.max(0, i - 1)];
        const hz = hs[Math.min(res, j + 1) * n + i] - hs[Math.max(0, j - 1) * n + i];
        const nx = -hx, ny = 2 * step, nzz = -hz;
        const l = Math.hypot(nx, ny, nzz);
        normals[k * 3] = nx / l;
        normals[k * 3 + 1] = ny / l;
        normals[k * 3 + 2] = nzz / l;
      }
    if (this.terrain.isVerticesDataPresent(VertexBuffer.NormalKind)) this.terrain.updateVerticesData(VertexBuffer.NormalKind, normals);
    else this.terrain.setVerticesData(VertexBuffer.NormalKind, normals, true);
    this.terrain.refreshBoundingInfo();
    this.water.scaling.set(size * 1.4, 1, size * 1.4);
    this.water.position.y = p.water;
  }

  /** Rebuild every object as thin instances. */
  buildObjects(field: Field, objs: Obj[]) {
    for (const g of this.groups.values()) {
      g.mats.length = 0;
      g.cols.length = 0;
    }
    const sink: Sink = {
      part: (shape: Shape, mat: Mat, r: number, g: number, b: number, m: Matrix) => {
        const key = shape + '|' + mat;
        let grp = this.groups.get(key);
        if (!grp) {
          const mesh = baseShape(this.scene, shape);
          mesh.name = `kit-${key}`;
          mesh.material = mat === 'glow' ? this.glowMat : this.clayMat;
          mesh.receiveShadows = mat !== 'glow';
          grp = { mesh, mats: [], cols: [] };
          this.groups.set(key, grp);
          this.onCasters([mesh]);
        }
        const a = m.m;
        for (let i = 0; i < 16; i++) grp.mats.push(a[i]);
        grp.cols.push(r, g, b, 1);
      },
    };
    const rand = rng(7);
    for (const o of objs) {
      const y = field.height(o.x, o.z) - (o.k === 'nokta' ? 0 : 0.15 + rand() * 0.1);
      drawObject(sink, o, o.k === 'nokta' ? y + 0.03 : y, field.biome(o.x, o.z));
    }
    this.count = objs.length;
    for (const g of this.groups.values()) {
      const n = g.cols.length / 4;
      g.mesh.setEnabled(n > 0);
      if (!n) continue;
      g.mesh.thinInstanceSetBuffer('matrix', new Float32Array(g.mats), 16, false);
      g.mesh.thinInstanceSetBuffer('color', new Float32Array(g.cols), 4, false);
      g.mesh.thinInstanceRefreshBoundingInfo(false);
    }
  }

  meshes(): Mesh[] {
    return [...this.groups.values()].map((g) => g.mesh);
  }
}
