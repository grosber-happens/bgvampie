#!/usr/bin/env node
/**
 * Packs the approved Blender region assets (Spor Ormanı, kasaba) into game-ready .glb files.
 *
 *   node tools/assets/pack-spor.mjs [only-name ...]
 *
 * Sources come from the project's shared folder (SPOR_SRC, default /mnt/project-files/regions), where the
 * Blender scripts write them. For each model:
 * - the shared watercolor paper texture is taken out (every model embeds the same 200 KB JPEG); the game
 *   puts one shared copy back on materials tagged `extras.suluboya` (src/sporpaint.ts),
 * - glowing glass exported as white emissive becomes unlit, so its vertex colors show,
 * - LOD0 is simplified when it has more triangles than its budget (LOD1/LOD2 are kept as built),
 * - geometry is quantized and meshopt-compressed (Babylon decodes it with meshopt_decoder).
 * It also writes src/assets/spor/olcu.json: each model's LOD0 bounds in game axes, used for footprints.
 * Collision boxes are baked separately by tools/assets/bake-collision.mjs.
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRMaterialsUnlit, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, prune, quantize, meshopt, simplifyPrimitive, weld, getBounds } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ASSETS } from './spor-assets.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const SRC = process.env.SPOR_SRC ?? '/mnt/project-files/regions';
const OUT = path.join(ROOT, 'src', 'assets', 'spor');
const PAPER = path.join(OUT, 'suluboya.jpg');

await MeshoptEncoder.ready;
await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });

const only = new Set(process.argv.slice(2));
const sizesPath = path.join(OUT, 'olcu.json');
const sizes = fs.existsSync(sizesPath) ? JSON.parse(fs.readFileSync(sizesPath, 'utf8')) : {};

function mulPoint(m, [x, y, z]) {
  return [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
}

function tris(node) {
  let t = 0;
  const walk = (n) => {
    for (const p of n.getMesh()?.listPrimitives() ?? []) t += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3;
    n.listChildren().forEach(walk);
  };
  walk(node);
  return t;
}

function prims(node, out = []) {
  for (const p of node.getMesh()?.listPrimitives() ?? []) out.push(p);
  node.listChildren().forEach((c) => prims(c, out));
  return out;
}

let total = 0;
for (const a of ASSETS) {
  if (only.size && !only.has(a.name)) continue;
  const src = path.join(SRC, a.src);
  if (!fs.existsSync(src)) {
    console.warn(`skip ${a.name}: ${src} missing`);
    continue;
  }
  const doc = await io.read(src);
  const root = doc.getRoot();

  // 1. The shared paper texture out, a tag in.
  for (const m of root.listMaterials()) {
    const tex = m.getBaseColorTexture();
    if (tex && tex.getImage()?.byteLength > 100_000 && tex.getMimeType() === 'image/jpeg') {
      if (!fs.existsSync(PAPER)) fs.writeFileSync(PAPER, tex.getImage());
      m.setBaseColorTexture(null);
      m.setExtras({ ...m.getExtras(), suluboya: 1 });
    } else if (!tex && /^(spor|cimen)_vertex/.test(m.getName())) {
      // Re-exported from a .blend whose paper image was not packed: same material, same paper.
      m.setExtras({ ...m.getExtras(), suluboya: 1 });
    }
    // 2. Glass that would glow plain white: unlit, so the vertex colors give it its colors.
    const e = m.getEmissiveFactor();
    if (!m.getEmissiveTexture() && e[0] > 0.99 && e[1] > 0.99 && e[2] > 0.99 && !m.getBaseColorTexture()) {
      m.setEmissiveFactor([0, 0, 0]);
      for (const ext of m.listExtensions()) m.setExtension(ext.extensionName, null);
      m.setExtension('KHR_materials_unlit', doc.createExtension(KHRMaterialsUnlit).createUnlit());
    }
  }

  // 2b. Parts cut away (cut: boxes [x0, x1, y0, y1, z0, z1] in Blender axes, x right, y back, z up):
  // every triangle with all three corners inside a box goes, in every LOD.
  if (a.cut) {
    for (const n of root.listNodes()) {
      const mesh = n.getMesh();
      if (!mesh || !/_LOD\d$/.test(n.getName())) continue;
      const m = n.getWorldMatrix();
      for (const p of mesh.listPrimitives()) {
        const pos = p.getAttribute('POSITION'), idx = p.getIndices();
        if (!idx || p.getMode() !== 4) continue;
        const v = [0, 0, 0];
        const inside = (i) => {
          pos.getElement(i, v);
          const [x, y, z] = mulPoint(m, v);
          const X = x, Y = -z, Z = y; // glTF y-up -> Blender z-up
          return a.cut.some(([x0, x1, y0, y1, z0, z1]) => X > x0 && X < x1 && Y > y0 && Y < y1 && Z > z0 && Z < z1);
        };
        const keep = [];
        let dropped = 0;
        for (let i = 0; i < idx.getCount(); i += 3) {
          const t = [idx.getScalar(i), idx.getScalar(i + 1), idx.getScalar(i + 2)];
          if (t.every(inside)) dropped++;
          else keep.push(...t);
        }
        if (!dropped) continue;
        const acc = doc.createAccessor().setType('SCALAR').setArray(pos.getCount() > 65535 ? new Uint32Array(keep) : new Uint16Array(keep));
        p.setIndices(acc);
        console.log(`  ${n.getName()}: cut ${dropped} triangles`);
      }
    }
  }

  // 3. LOD0 over budget: simplify (never meshes with shape keys or skins: their animation needs every vertex).
  await doc.transform(weld());
  const before = {};
  for (const n of root.listNodes()) {
    const lod = /_LOD(\d)$/.exec(n.getName());
    if (!lod) continue;
    const t = tris(n);
    before[lod[1]] = t;
    if (lod[1] !== '0' || !a.budget || t <= a.budget) continue;
    const ratio = a.budget / t;
    for (const p of prims(n)) {
      if (p.listTargets().length || p.getAttribute('JOINTS_0')) continue;
      simplifyPrimitive(p, { simplifier: MeshoptSimplifier, ratio, error: a.error ?? 0.004, lockBorder: false });
    }
  }
  const after = Object.fromEntries(root.listNodes().filter((n) => /_LOD0$/.test(n.getName())).map((n) => ['0', tris(n)]));

  // 4. Bounds of LOD0 in game axes (the glTF loader turns the model 180 degrees about y: x and z flip).
  const lod0 = root.listNodes().find((n) => /_LOD0$/.test(n.getName()));
  if (lod0) {
    const scene = root.listScenes()[0];
    // Bounds of the whole scene would include LOD1/LOD2 placed side by side: measure LOD0 alone.
    const others = scene.listChildren().filter((c) => c !== lod0 && !isAncestor(c, lod0));
    others.forEach((c) => scene.removeChild(c));
    const b = getBounds(scene);
    others.forEach((c) => scene.addChild(c));
    const [x0, y0, z0] = b.min, [x1, y1, z1] = b.max;
    const r = (v) => Math.round(v * 100) / 100;
    // origin offset: the loader keeps LOD0 at its own spot; models.ts moves it back to the origin in x/z.
    const t = lod0.getWorldTranslation();
    sizes[a.name] = { w: r(x1 - x0), d: r(z1 - z0), h: r(y1), y0: r(y0), cx: r(-((x0 + x1) / 2 - t[0])), cz: r((z0 + z1) / 2 - t[2]) };
  }

  await doc.transform(prune(), dedup(), quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12, quantizeColor: 8 }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  const out = path.join(OUT, a.dir ?? '', `${a.name}.glb`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await io.write(out, doc);
  const kb = fs.statSync(out).size / 1024;
  total += kb;
  const k = (v) => `${Math.round(v / 100) / 10}k`;
  console.log(`${a.name.padEnd(22)} ${(fs.statSync(src).size / 1048576).toFixed(1).padStart(5)} MB -> ${(kb / 1024).toFixed(2).padStart(5)} MB  LOD0 ${k(before['0'] ?? 0)}${after['0'] !== before['0'] ? ` -> ${k(after['0'])}` : ''}`);
}
fs.writeFileSync(sizesPath, JSON.stringify(Object.fromEntries(Object.entries(sizes).sort()), null, 0).replace(/\},"/g, '},\n"'));
console.log(`total ${(total / 1024).toFixed(1)} MB`);

function isAncestor(a, b) {
  for (let p = b.getParentNode?.(); p; p = p.getParentNode?.()) if (p === a) return true;
  return false;
}
