import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Camera } from '@babylonjs/core/Cameras/camera';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { Effect } from '@babylonjs/core/Materials/effect';
import { FresnelParameters } from '@babylonjs/core/Materials/fresnelParameters';
import { Material } from '@babylonjs/core/Materials/material';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { PostProcess } from '@babylonjs/core/PostProcesses/postProcess';
import { Scene } from '@babylonjs/core/scene';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import type { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';

/**
 * Art direction test (user, 2026-10-29): characters and buildings look like hand-shaped clay,
 * the sky and effects look like watercolor. Everything is generated in code (no image files).
 * `?look=classic` turns it off to compare with the old look.
 */
export const LOOK: 'clay' | 'classic' = new URLSearchParams(location.search).get('look') === 'classic' ? 'classic' : 'clay';
export const clayLook = LOOK === 'clay';

let scene: Scene;
let clayNormal: DynamicTexture | null = null;
const clayByTiling = new Map<number, Texture>();
let wash: Texture | null = null;
let splat: Texture | null = null;

/** Small seeded random so the generated textures are the same on every load. */
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// ---- Clay -----------------------------------------------------------------------------------

/**
 * A tileable normal map of soft lumps, thumb presses and faint fingerprint ridges,
 * so flat surfaces read as pressed clay.
 */
function makeClayNormal(): DynamicTexture {
  const N = 256;
  const r = rng(7);
  const h = new Float32Array(N * N);
  const wrap = (v: number) => ((v % N) + N) % N;
  const bump = (cx: number, cy: number, rad: number, amp: number) => {
    for (let y = -rad; y <= rad; y++)
      for (let x = -rad; x <= rad; x++) {
        const d = Math.hypot(x, y) / rad;
        if (d >= 1) continue;
        h[wrap(cy + y) * N + wrap(cx + x)] += amp * (0.5 + 0.5 * Math.cos(Math.PI * d));
      }
  };
  // Broad lumps, then thumb presses (dents).
  for (let i = 0; i < 40; i++) bump(Math.floor(r() * N), Math.floor(r() * N), 18 + Math.floor(r() * 26), 0.5 + r() * 0.6);
  for (let i = 0; i < 14; i++) bump(Math.floor(r() * N), Math.floor(r() * N), 10 + Math.floor(r() * 10), -(0.6 + r() * 0.5));
  // Fingerprint ridges: faint concentric ellipses in a few spots.
  for (let i = 0; i < 6; i++) {
    const cx = r() * N, cy = r() * N, rad = 22 + r() * 14, rot = r() * Math.PI;
    for (let y = -rad; y <= rad; y++)
      for (let x = -rad; x <= rad; x++) {
        const xr = x * Math.cos(rot) - y * Math.sin(rot);
        const yr = x * Math.sin(rot) + y * Math.cos(rot);
        const d = Math.hypot(xr, yr * 1.4);
        if (d >= rad) continue;
        const fade = 1 - d / rad;
        h[wrap(Math.floor(cy + y)) * N + wrap(Math.floor(cx + x))] += 0.12 * fade * Math.sin(d * 1.6);
      }
  }
  const t = new DynamicTexture('clay-normal', { width: N, height: N }, scene, true);
  const ctx = t.getContext() as CanvasRenderingContext2D;
  const img = ctx.createImageData(N, N);
  const at = (x: number, y: number) => h[wrap(y) * N + wrap(x)];
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * 2.2;
      const dy = (at(x, y + 1) - at(x, y - 1)) * 2.2;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * N + x) * 4;
      img.data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((-dy / len) * 0.5 + 0.5) * 255;
      img.data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
  t.update(false);
  t.wrapU = t.wrapV = Texture.WRAP_ADDRESSMODE;
  return t;
}

/** The clay normal map at a given tiling (cloning a DynamicTexture leaves it blank, so copy the canvas). */
function clayBump(tiling: number, level: number): Texture {
  const key = tiling * 10 + level;
  let t = clayByTiling.get(key);
  if (!t) {
    clayNormal ??= makeClayNormal();
    const src = clayNormal.getContext().canvas as HTMLCanvasElement;
    const d = new DynamicTexture(`clay-normal-${key}`, { width: src.width, height: src.height }, scene, true);
    (d.getContext() as CanvasRenderingContext2D).drawImage(src, 0, 0);
    d.update(false);
    d.wrapU = d.wrapV = Texture.WRAP_ADDRESSMODE;
    d.uScale = d.vScale = tiling;
    d.level = level;
    clayByTiling.set(key, d);
    t = d;
  }
  return t;
}

const done = new WeakSet<Material>();

/** Turn a lit material into matte, slightly waxy clay with pressed-in surface detail. */
export function clayify(m: Material, tiling = 1) {
  if (!clayLook || done.has(m)) return;
  done.add(m);
  if (m instanceof StandardMaterial) {
    if (m.disableLighting) return;
    m.specularColor = new Color3(0.1, 0.09, 0.08);
    m.specularPower = 10;
    m.bumpTexture = clayBump(tiling, 0.55);
    // A soft warm rim, like light bleeding through the edge of plasticine.
    // Babylon's fresnel term is 1 facing the camera and 0 at grazing angles, so the rim is the left color.
    if (tiling === 1 && m.emissiveColor.equals(Color3.Black())) {
      const rim = new FresnelParameters();
      rim.bias = 0.05;
      rim.power = 1.6;
      rim.leftColor = Color3.FromHexString('#ffcfa8').scale(0.12);
      rim.rightColor = Color3.Black();
      m.emissiveFresnelParameters = rim;
      m.emissiveColor = new Color3(1, 1, 1);
    }
  } else if (m instanceof PBRMaterial) {
    // Matte, like paint on paper: no metal, no glossy spots (a model's own gloss map made the hippo
    // look wet and plastic next to the painted world).
    m.metallicTexture = null;
    m.metallic = 0;
    m.roughness = 0.9;
    m.sheen.isEnabled = true;
    m.sheen.intensity = 0.2;
    m.sheen.color = Color3.FromHexString('#ffe6d0');
    m.sheen.roughness = 0.8;
    if (!m.bumpTexture) {
      m.bumpTexture = clayBump(tiling * 3, 0.35);
    }
  }
}

// ---- Watercolor ----------------------------------------------------------------------------

/** One irregular blob path with a wobbly edge. */
function blobPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, r: () => number, wobble = 0.22) {
  const steps = 48;
  const phase = [r() * 6, r() * 6, r() * 6];
  ctx.beginPath();
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const k = 1 + wobble * (0.5 * Math.sin(a * 3 + phase[0]) + 0.3 * Math.sin(a * 5 + phase[1]) + 0.2 * Math.sin(a * 9 + phase[2]));
    const x = cx + Math.cos(a) * rx * k;
    const y = cy + Math.sin(a) * ry * k;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

/** Paper grain: random speckles that thin the pigment. */
function grain(ctx: CanvasRenderingContext2D, N: number, r: () => number, amount: number) {
  const img = ctx.getImageData(0, 0, N, N);
  for (let i = 0; i < img.data.length; i += 4) {
    const g = 1 - amount * r();
    img.data[i + 3] *= g;
  }
  ctx.putImageData(img, 0, 0);
}

/**
 * A white pigment wash with darker, wobbly edges (pigment pools at the rim of a watercolor stroke).
 * The effect color tints it, so one texture serves every effect.
 */
function makeWash(name: string, seed: number, layers: number, wobble: number): Texture {
  const N = 256;
  const r = rng(seed);
  const t = new DynamicTexture(name, { width: N, height: N }, scene, true);
  const ctx = t.getContext() as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, N, N);
  for (let l = 0; l < layers; l++) {
    const rad = N * (0.3 - l * 0.03) * (0.85 + r() * 0.2);
    const cx = N / 2 + (r() - 0.5) * N * 0.08, cy = N / 2 + (r() - 0.5) * N * 0.08;
    blobPath(ctx, cx, cy, rad, rad * (0.85 + r() * 0.3), r, wobble);
    ctx.fillStyle = `rgba(255,255,255,${0.35 + r() * 0.15})`;
    ctx.fill();
    ctx.save();
    ctx.shadowColor = 'rgba(120,120,120,0.9)';
    ctx.shadowBlur = 6;
    ctx.strokeStyle = 'rgba(150,150,150,0.75)';
    ctx.lineWidth = 3 + r() * 3;
    ctx.stroke();
    ctx.restore();
  }
  // A few loose drips around it.
  for (let i = 0; i < 7; i++) {
    const a = r() * Math.PI * 2, d = N * (0.3 + r() * 0.15);
    blobPath(ctx, N / 2 + Math.cos(a) * d, N / 2 + Math.sin(a) * d, 4 + r() * 8, 4 + r() * 8, r, 0.3);
    ctx.fillStyle = 'rgba(200,200,200,0.6)';
    ctx.fill();
  }
  grain(ctx, N, r, 0.35);
  t.update(false);
  t.hasAlpha = true;
  return t;
}

/**
 * Material for effects (tracers, flashes, rings, explosions): a watercolor wash in the effect's color.
 * Returns null in the classic look.
 */
export function watercolorFxMaterial(hex: string, alpha: number, kind: 'wash' | 'splat' = 'wash'): StandardMaterial | null {
  if (!clayLook) return null;
  // A wash made before the look had its scene (or for a scene since disposed) never becomes ready,
  // and every effect painted with it stays invisible: make it again for this scene.
  const stale = (t: Texture | null) => !t || t.getScene() !== scene || !t.getInternalTexture();
  if (stale(wash)) wash = makeWash('wc-wash', 11, 3, 0.22);
  if (stale(splat)) splat = makeWash('wc-splat', 29, 2, 0.5);
  const m = new StandardMaterial(`wc-${kind}-${hex}-${alpha}`, scene);
  m.disableLighting = true;
  // Unlit: color = emissive × texture. Slightly lift the color so it reads as paint, not neon.
  const c = Color3.FromHexString(hex);
  m.emissiveColor = Color3.Lerp(c, new Color3(1, 0.96, 0.9), 0.12);
  m.diffuseTexture = kind === 'wash' ? wash : splat;
  m.useAlphaFromDiffuseTexture = true;
  m.alpha = Math.min(1, alpha * 1.3);
  m.backFaceCulling = false;
  m.metadata = { hex };
  return m;
}

/** A camera-facing paint splat (muzzle flash, sparks). */
export function splatPlane(name: string, size: number): Mesh {
  const p = MeshBuilder.CreatePlane(name, { size }, scene);
  p.billboardMode = Mesh.BILLBOARDMODE_ALL;
  p.isPickable = false;
  return p;
}

/**
 * Watercolor sky dome: a warm dusty wash fading to the horizon, soft cloud blooms with
 * darker pooled edges, and paper grain. Painted once into a texture.
 */
function makeSky() {
  const W = 2048, H = 1024;
  const r = rng(3);
  const t = new DynamicTexture('wc-sky', { width: W, height: H }, scene, true);
  const ctx = t.getContext() as CanvasRenderingContext2D;
  // Sphere v runs from the bottom (0) to the top (1); the canvas is drawn top-down and flipped by the texture.
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#8e93b8');
  g.addColorStop(0.28, '#b8a6b8');
  g.addColorStop(0.46, '#e2b08a');
  g.addColorStop(0.5, '#d9a37a');
  g.addColorStop(1, '#d9a37a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // Big soft washes across the upper sky, drawn three times across the seam so it tiles.
  const blooms: [number, number, number, number, string][] = [];
  const palette = ['#f3c9a0', '#c7a1b9', '#9fa6c9', '#f0d8b8', '#b98d93', '#e8b48a'];
  for (let i = 0; i < 26; i++) {
    const y = H * (0.08 + r() * 0.38);
    blooms.push([r() * W, y, 90 + r() * 240, 30 + r() * 70, palette[Math.floor(r() * palette.length)]]);
  }
  for (const [x, y, rx, ry, col] of blooms)
    for (const off of [-W, 0, W]) {
      const rr = rng(Math.floor(x * 7 + y));
      blobPath(ctx, x + off, y, rx, ry, rr, 0.3);
      ctx.globalAlpha = 0.18 + rr() * 0.12;
      ctx.fillStyle = col;
      ctx.fill();
      ctx.globalAlpha = 0.14;
      ctx.save();
      ctx.shadowColor = 'rgba(110,80,90,0.5)';
      ctx.shadowBlur = 14;
      ctx.strokeStyle = 'rgba(130,95,105,0.45)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
      ctx.globalAlpha = 1;
    }
  // A pale sun bloom.
  const sx = W * 0.62, sy = H * 0.3;
  const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, 160);
  sg.addColorStop(0, 'rgba(255,240,215,0.85)');
  sg.addColorStop(0.5, 'rgba(255,225,190,0.35)');
  sg.addColorStop(1, 'rgba(255,225,190,0)');
  ctx.fillStyle = sg;
  ctx.fillRect(sx - 160, sy - 160, 320, 320);
  // Paper grain (darken specks a touch).
  const img = ctx.getImageData(0, 0, W, H);
  const gr = rng(5);
  for (let i = 0; i < img.data.length; i += 4) {
    const k = 1 - 0.07 * gr();
    img.data[i] *= k;
    img.data[i + 1] *= k;
    img.data[i + 2] *= k;
  }
  ctx.putImageData(img, 0, 0);
  t.update(false);

  const sky = MeshBuilder.CreateSphere('wc-sky', { diameter: 900, segments: 24, sideOrientation: Mesh.BACKSIDE }, scene);
  const m = new StandardMaterial('wc-sky-mat', scene);
  m.disableLighting = true;
  m.emissiveColor = Color3.White();
  m.diffuseTexture = t;
  m.fogEnabled = false;
  m.backFaceCulling = false;
  sky.material = m;
  sky.infiniteDistance = true;
  sky.isPickable = false;
  sky.applyFog = false;
}

/** Very light paper grain and pigment-darkened edges over the whole frame (not a full filter). */
function paperPass(camera: Camera) {
  Effect.ShadersStore['wcPaperFragmentShader'] = `
    precision highp float;
    varying vec2 vUV;
    uniform sampler2D textureSampler;
    uniform vec2 screenSize;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
    }
    void main() {
      vec4 c = texture2D(textureSampler, vUV);
      vec2 px = vUV * screenSize;
      float paper = noise(px * 0.35) * 0.6 + noise(px * 0.08) * 0.4;
      c.rgb *= 0.965 + 0.05 * paper;
      vec2 d = vUV - 0.5;
      float edge = smoothstep(0.35, 0.75, length(d * vec2(1.0, 0.8)));
      c.rgb *= 1.0 - 0.16 * edge;
      gl_FragColor = c;
    }`;
  const pp = new PostProcess('wc-paper', 'wcPaper', ['screenSize'], null, 1, camera);
  pp.onApply = (e) => e.setFloat2('screenSize', pp.width, pp.height);
}

/** Use the clay helpers in another scene without the game's sky and paper pass (map planner). */
export function setLookScene(s: Scene) {
  scene = s;
}

/**
 * Set up the look for the scene: sky, softer clay lighting and the paper pass.
 * `ownSky: false` when the planner's Atmosphere already draws the sky, light and paper (planner maps).
 */
export function initLook(s: Scene, camera: Camera, shadows?: ShadowGenerator, ownSky = true) {
  scene = s;
  if (!clayLook || !ownSky) return;
  makeSky();
  paperPass(camera);
  // Clay reads best under soft, even light with gentle shadows.
  const hemi = s.getLightByName('hemi');
  if (hemi) hemi.intensity = 0.72;
  const sun = s.getLightByName('sun');
  if (sun) sun.intensity = 0.85;
  shadows?.setDarkness(0.35);
}

/** Clay every lit material in the scene (call again after models load). */
export function clayifyScene() {
  if (!clayLook) return;
  for (const m of scene.materials) {
    if (m.name.startsWith('wc-') || m.name.startsWith('glow-')) continue;
    clayify(m, m.name === 'asphalt' ? 30 : m.name === 'sidewalk' ? 6 : m.name.startsWith('wall') ? 3 : 1);
  }
}
