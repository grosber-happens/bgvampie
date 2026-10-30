import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Scene } from '@babylonjs/core/scene';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { clayify } from '../look';

/**
 * The forge: a small kit of hand-made looking parts (rods, turned profiles, rings, bent tubes,
 * faceted blades) that every weapon is built from. Weapons are made in code, not loaded, so each
 * species can get its own metal and trinkets and items can add their own ornaments.
 *
 * Weapon space: +Z points along the barrel or blade, +Y is up, the origin is where the hand grips.
 * Sizes are in metres for a 1.9 m character.
 */

/** What a part is made of. The species finish decides the real colors. */
export type Stuff = 'metal' | 'metal2' | 'grip' | 'accent' | 'dark' | 'bone' | 'glow' | 'halo' | 'gem' | 'glass';

export type Palette = Record<Exclude<Stuff, 'glow' | 'halo' | 'gem' | 'glass'>, string>;

type Rot = [number, number, number];
type V3 = [number, number, number];

const lit = new Map<string, StandardMaterial>();
const unlit = new Map<string, StandardMaterial>();

/** Matte clay-like material (shared by color). */
export function clayMat(scene: Scene, hex: string, shine = 0.12): StandardMaterial {
  const key = `${hex}-${shine}`;
  let m = lit.get(key);
  if (!m || m.getScene() !== scene) {
    m = new StandardMaterial(`forge-${key}`, scene);
    m.diffuseColor = Color3.FromHexString(hex);
    m.specularColor = new Color3(shine, shine * 0.95, shine * 0.85);
    m.specularPower = 24;
    clayify(m);
    lit.set(key, m);
  }
  return m;
}

/** Unlit glowing material (laser edges, crystals, lights). Alpha < 1 makes a soft halo. */
export function lightMat(scene: Scene, hex: string, alpha = 1): StandardMaterial {
  const key = `${hex}-${alpha}`;
  let m = unlit.get(key);
  if (!m || m.getScene() !== scene) {
    m = new StandardMaterial(`forge-light-${key}`, scene);
    m.emissiveColor = Color3.FromHexString(hex);
    m.diffuseColor = Color3.Black();
    m.specularColor = Color3.Black();
    m.disableLighting = true;
    if (alpha < 1) {
      m.alpha = alpha;
      m.backFaceCulling = false;
    }
    unlit.set(key, m);
  }
  return m;
}

/** A material of its own that can change color at run time (ammo lights, heat). */
export function liveMat(scene: Scene, hex: string, name: string): StandardMaterial {
  const m = new StandardMaterial(`forge-live-${name}`, scene);
  m.emissiveColor = Color3.FromHexString(hex);
  m.diffuseColor = Color3.Black();
  m.specularColor = Color3.Black();
  m.disableLighting = true;
  return m;
}

/** Turn a direction given as Euler angles into one that aims +Y (Babylon's cylinders) along +Z. */
const ALONG_Z: Rot = [Math.PI / 2, 0, 0];

export type Forged = {
  root: TransformNode;
  /** Named nodes the rig moves or recolors (ammo lights, the crystal, the spear head…). */
  parts: Record<string, TransformNode>;
  /** Run-time materials by name. */
  mats: Record<string, StandardMaterial>;
};

export class Forge {
  readonly root: TransformNode;
  readonly parts: Record<string, TransformNode> = {};
  readonly mats: Record<string, StandardMaterial> = {};
  private loose: { mesh: Mesh; key: string }[] = [];
  /** Glow color of the class (laser and crystal parts). */
  glow: string;
  /** Extra glow color (item gems, rarity). */
  gem = '#ffd27a';

  constructor(
    readonly scene: Scene,
    name: string,
    readonly palette: Palette,
    glow: string,
    /** Thickness multiplier of the species (chunky frogs, slender insects). */
    readonly thick = 1,
  ) {
    this.root = new TransformNode(name, scene);
    this.glow = glow;
  }

  /** A group node inside the weapon (moves together, e.g. a blade or the bolt). */
  group(name: string, pos: V3 = [0, 0, 0], rot: Rot = [0, 0, 0], parent: TransformNode = this.root): TransformNode {
    const g = new TransformNode(name, this.scene);
    g.parent = parent;
    g.position.set(...pos);
    g.rotation.set(...rot);
    this.parts[name] = g;
    return g;
  }

  private mat(stuff: Stuff) {
    switch (stuff) {
      case 'glow':
        return lightMat(this.scene, this.glow);
      case 'halo':
        return lightMat(this.scene, this.glow, 0.28);
      case 'gem':
        return lightMat(this.scene, this.gem);
      case 'glass':
        return lightMat(this.scene, '#cfefff', 0.35);
      default:
        return clayMat(this.scene, this.palette[stuff], stuff === 'metal' || stuff === 'metal2' || stuff === 'accent' ? 0.22 : 0.06);
    }
  }

  /** Put a mesh in place. `live` keeps it separate (and named) so the rig can change it. */
  private place(m: Mesh, stuff: Stuff, pos: V3, rot: Rot | undefined, parent: TransformNode | undefined, live?: string) {
    m.parent = parent ?? this.root;
    m.position.set(...pos);
    if (rot) m.rotation.set(...rot);
    m.isPickable = false;
    if (live) {
      const lm = liveMat(this.scene, stuff === 'gem' ? this.gem : this.glow, `${this.root.name}-${live}`);
      m.material = lm;
      this.mats[live] = lm;
      this.parts[live] = m;
    } else {
      m.material = this.mat(stuff);
      this.loose.push({ mesh: m, key: m.material.name });
    }
    return m;
  }

  private t(v: number) {
    return v * this.thick;
  }

  box(stuff: Stuff, size: V3, pos: V3, rot?: Rot, o: { parent?: TransformNode; live?: string; keepThick?: boolean } = {}) {
    const k = o.keepThick ? 1 : this.thick;
    const m = MeshBuilder.CreateBox('fb', { width: size[0] * k, height: size[1] * k, depth: size[2] }, this.scene);
    return this.place(m, stuff, pos, rot, o.parent, o.live);
  }

  /** A rod along +Z from `pos` (its centre), length `len`, diameters at the back and the front. */
  rod(stuff: Stuff, len: number, dBack: number, pos: V3, o: { dFront?: number; rot?: Rot; parent?: TransformNode; live?: string; sides?: number } = {}) {
    const m = MeshBuilder.CreateCylinder(
      'fr',
      { height: len, diameterBottom: this.t(dBack), diameterTop: this.t(o.dFront ?? dBack), tessellation: o.sides ?? 12 },
      this.scene,
    );
    m.rotation.set(...ALONG_Z);
    m.bakeCurrentTransformIntoVertices();
    return this.place(m, stuff, pos, o.rot, o.parent, o.live);
  }

  ball(stuff: Stuff, d: number, pos: V3, o: { scale?: V3; parent?: TransformNode; live?: string; seg?: number } = {}) {
    const m = MeshBuilder.CreateSphere('fs', { diameter: this.t(d), segments: o.seg ?? 10 }, this.scene);
    if (o.scale) m.scaling.set(...o.scale);
    return this.place(m, stuff, pos, undefined, o.parent, o.live);
  }

  /** A ring around the Z axis (bands on a barrel, a guard), or turned with `rot`. */
  ring(stuff: Stuff, d: number, wire: number, pos: V3, o: { rot?: Rot; parent?: TransformNode; live?: string } = {}) {
    const m = MeshBuilder.CreateTorus('ft', { diameter: d, thickness: this.t(wire), tessellation: 20 }, this.scene);
    m.rotation.set(...ALONG_Z);
    m.bakeCurrentTransformIntoVertices();
    return this.place(m, stuff, pos, o.rot, o.parent, o.live);
  }

  /** A turned part (lathe): profile is [radius, z] pairs from back to front. */
  turned(stuff: Stuff, profile: [number, number][], pos: V3, o: { rot?: Rot; parent?: TransformNode; live?: string; sides?: number } = {}) {
    const shape = profile.map(([r, z]) => new Vector3(this.t(r), z, 0));
    const m = MeshBuilder.CreateLathe('fl', { shape, tessellation: o.sides ?? 14, sideOrientation: Mesh.DOUBLESIDE }, this.scene);
    m.rotation.set(...ALONG_Z);
    m.bakeCurrentTransformIntoVertices();
    return this.place(m, stuff, pos, o.rot, o.parent, o.live);
  }

  /** A bent tube through points, thick at the start and thin at the end (claws, hooks, wire). */
  tube(stuff: Stuff, pts: V3[], r0: number, r1 = r0, o: { parent?: TransformNode; live?: string; pos?: V3; rot?: Rot } = {}) {
    const path = pts.map((p) => new Vector3(...p));
    const n = path.length - 1;
    const m = MeshBuilder.CreateTube(
      'fu',
      { path, radiusFunction: (i) => this.t(r0 + (r1 - r0) * (i / n)), tessellation: 10, cap: Mesh.CAP_ALL },
      this.scene,
    );
    return this.place(m, stuff, o.pos ?? [0, 0, 0], o.rot, o.parent, o.live);
  }

  /** A smooth arc of points in the YZ plane (or XZ), for tubes. */
  static arc(radius: number, from: number, to: number, steps = 10, plane: 'yz' | 'xz' = 'yz', c: V3 = [0, 0, 0]): V3[] {
    const out: V3[] = [];
    for (let i = 0; i <= steps; i++) {
      const a = from + ((to - from) * i) / steps;
      const u = Math.cos(a) * radius;
      const v = Math.sin(a) * radius;
      out.push(plane === 'yz' ? [c[0], c[1] + v, c[2] + u] : [c[0] + v, c[1], c[2] + u]);
    }
    return out;
  }

  /**
   * A hand-ground blade along +Z: `profile` is [z, half width, sideways bend] stations from the
   * hilt to the tip, with a raised ridge down the middle (diamond cross-section).
   */
  blade(stuff: Stuff, profile: [number, number, number?][], thick: number, pos: V3, o: { rot?: Rot; parent?: TransformNode; live?: string } = {}) {
    const positions: number[] = [];
    const indices: number[] = [];
    const uvs: number[] = [];
    const h = this.t(thick) / 2;
    const zMax = profile[profile.length - 1][0];
    // Each station: left edge, top ridge, right edge, bottom ridge. Edges get their own copies so
    // the facets stay sharp.
    for (const [z, w, bend = 0] of profile) {
      const v = z / (zMax || 1);
      const hz = w > 0 ? h : 0;
      const ridge = [bend, hz, z, bend, -hz, z];
      const left = [bend - w, 0, z];
      const right = [bend + w, 0, z];
      // top-left facet, top-right facet, bottom-right, bottom-left (two verts each)
      positions.push(...left, ...ridge.slice(0, 3), ...ridge.slice(0, 3), ...right, ...right, ...ridge.slice(3), ...ridge.slice(3), ...left);
      uvs.push(0, v, 0.5, v, 0.5, v, 1, v, 1, v, 0.5, v, 0.5, v, 0, v);
    }
    for (let i = 0; i < profile.length - 1; i++) {
      const a = i * 8;
      const b = a + 8;
      for (let f = 0; f < 4; f++) {
        const p0 = a + f * 2;
        const p1 = p0 + 1;
        const q0 = b + f * 2;
        const q1 = q0 + 1;
        indices.push(p0, p1, q0, p1, q1, q0);
      }
    }
    const vd = new VertexData();
    vd.positions = positions;
    vd.indices = indices;
    vd.uvs = uvs;
    const normals: number[] = [];
    VertexData.ComputeNormals(positions, indices, normals);
    vd.normals = normals;
    const m = new Mesh('fbl', this.scene);
    vd.applyToMesh(m);
    return this.place(m, stuff, pos, o.rot, o.parent, o.live);
  }

  /** A small node the species and items hang their trinkets on. */
  socket(name: string, pos: V3, rot: Rot = [0, 0, 0], parent: TransformNode = this.root) {
    return this.group(`socket-${name}`, pos, rot, parent);
  }

  /** Merge the parts that share a material (fewer draw calls) and hand the weapon over. */
  done(): Forged {
    const byParentAndMat = new Map<string, Mesh[]>();
    for (const { mesh, key } of this.loose) {
      const k = `${mesh.parent?.uniqueId}-${key}`;
      const list = byParentAndMat.get(k) ?? [];
      list.push(mesh);
      byParentAndMat.set(k, list);
    }
    for (const list of byParentAndMat.values()) {
      if (list.length < 2) continue;
      const parent = list[0].parent;
      const mat = list[0].material;
      // Merge in the parent's space.
      for (const m of list) {
        m.parent = null;
        m.computeWorldMatrix(true);
      }
      const merged = Mesh.MergeMeshes(list, true, true, undefined, false, false);
      if (merged) {
        merged.parent = parent;
        merged.material = mat;
        merged.isPickable = false;
        merged.name = `${this.root.name}-merged`;
      }
    }
    this.loose = [];
    return { root: this.root, parts: this.parts, mats: this.mats };
  }
}
