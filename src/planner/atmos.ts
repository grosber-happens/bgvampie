/**
 * The planner's atmosphere: a watercolor sky with the huge amber sun, height fog with sun glow,
 * Moebius-style ink outlines, god rays, spores in the air, a few koi high up and the Kızıl Sis ring.
 * Everything is drawn in code from the world palette (design/dunya-tasarimi.md §3, §6, §11.4).
 * The game uses it too (src/main.ts), so a map looks the same in the planner and in play.
 */
import type { Camera } from '@babylonjs/core/Cameras/camera';
import { CascadedShadowGenerator } from '@babylonjs/core/Lights/Shadows/cascadedShadowGenerator';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Constants } from '@babylonjs/core/Engines/constants';
import { DefaultRenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline';
import { DepthRenderer } from '@babylonjs/core/Rendering/depthRenderer';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { Effect } from '@babylonjs/core/Materials/effect';
import { FresnelParameters } from '@babylonjs/core/Materials/fresnelParameters';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { ImageProcessingConfiguration } from '@babylonjs/core/Materials/imageProcessingConfiguration';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { ParticleSystem } from '@babylonjs/core/Particles/particleSystem';
import { PostProcess } from '@babylonjs/core/PostProcesses/postProcess';
import { Scene } from '@babylonjs/core/scene';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { VolumetricLightScatteringPostProcess } from '@babylonjs/core/PostProcesses/volumetricLightScatteringPostProcess';
import '@babylonjs/core/Rendering/depthRendererSceneComponent';
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent';
import { SPORE_FX, makeSporeCloud, setSporeColors } from '../sporfx';
import type { FxValues } from '../mapgen/fx';

export type Atmos = {
  preset: PresetId;
  fog: number;
  fogHeight: number;
  haze: number;
  sunAz: number;
  sunEl: number;
  sunSize: number;
  warmth: number;
  exposure: number;
  bloom: number;
  rays: number;
  ink: number;
  spores: number;
  koi: number;
  grain: number;
  ring: boolean;
};

export type PresetId = 'altin' | 'tutulma' | 'kizil' | 'spor';
type Palette = { zenith: string; mid: string; horizon: string; ground: string; fog: string; sunFog: string; sun: string; halo: string; light: string; sky: string; floor: string; ink: string; spore: string[] };

export const PRESETS: Record<PresetId, { name: string; pal: Palette; atmos: Partial<Atmos> }> = {
  altin: {
    name: 'Altın Saat',
    pal: { zenith: '#3b2f5c', mid: '#7fa9b8', horizon: '#f2b58c', ground: '#c98f74', fog: '#e9b493', sunFog: '#ffb867', sun: '#ff7a1a', halo: '#ffb347', light: '#ffd2a1', sky: '#bcd2dc', floor: '#6b4a52', ink: '#2b1e3f', spore: ['#ffd38a', '#f6a0c8'] },
    atmos: { fog: 1, fogHeight: 9, haze: 0.5, sunEl: 11, exposure: 1.05, bloom: 0.55, rays: 0.55, warmth: 0.7 },
  },
  tutulma: {
    name: 'Koi Tutulması',
    pal: { zenith: '#0f0d24', mid: '#2b2f5e', horizon: '#6a4f8a', ground: '#2a2440', fog: '#3a3466', sunFog: '#e2475c', sun: '#ffd0a0', halo: '#e2475c', light: '#9fb0ff', sky: '#5560a0', floor: '#1a1530', ink: '#05040a', spore: ['#4fb3bf', '#e2475c'] },
    atmos: { fog: 1.3, fogHeight: 7, haze: 0.6, sunEl: 5, exposure: 0.9, bloom: 1.2, rays: 0.35, warmth: 0.3 },
  },
  kizil: {
    name: 'Kızıl Sis',
    pal: { zenith: '#3a1a2a', mid: '#9a4a52', horizon: '#e98a6a', ground: '#7a3a3a', fog: '#c8505a', sunFog: '#ff9a5a', sun: '#ff7a1a', halo: '#ff5a3a', light: '#ffb08a', sky: '#d08a8a', floor: '#4a2030', ink: '#250c18', spore: ['#ff6a5a', '#ffb347'] },
    atmos: { fog: 1.8, fogHeight: 14, haze: 0.7, sunEl: 9, exposure: 1, bloom: 0.8, rays: 0.7, warmth: 0.8 },
  },
  spor: {
    name: 'Spor Sabahı',
    pal: { zenith: '#5a6fa8', mid: '#a9cfd0', horizon: '#f3d2c8', ground: '#c8b0a8', fog: '#ecc6cf', sunFog: '#fff0c8', sun: '#ffb347', halo: '#fff0c8', light: '#fff1dc', sky: '#d8ecee', floor: '#8a7a80', ink: '#2b2a48', spore: ['#f06ea9', '#ffffff'] },
    atmos: { fog: 1.15, fogHeight: 12, haze: 0.45, sunEl: 24, exposure: 1.1, bloom: 0.45, rays: 0.4, warmth: 0.4 },
  },
};

export const DEFAULT_ATMOS: Atmos = {
  preset: 'altin',
  fog: 1,
  fogHeight: 9,
  haze: 0.5,
  // The sun always hangs in the west (design §11.1: the game's compass).
  sunAz: 262,
  sunEl: 11,
  sunSize: 1.3,
  warmth: 0.7,
  exposure: 1.05,
  bloom: 0.55,
  rays: 0.55,
  ink: 0.6,
  spores: 1,
  koi: 2,
  grain: 0.4,
  ring: true,
};

const c3 = (h: string) => Color3.FromHexString(h);

const NOISE = `
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = p * 2.03 + 17.0; a *= 0.5; } return s; }
`;

Effect.ShadersStore['plannerSkyVertexShader'] = `
  precision highp float;
  attribute vec3 position;
  uniform mat4 worldViewProjection;
  varying vec3 vDir;
  void main() { vDir = position; gl_Position = worldViewProjection * vec4(position, 1.0); }
`;
Effect.ShadersStore['plannerSkyFragmentShader'] = `
  precision highp float;
  varying vec3 vDir;
  uniform vec3 zenith, mid, horizon, ground, sunColor, haloColor, sunDir;
  uniform float sunSize, time;
  ${NOISE}
  void main() {
    vec3 d = normalize(vDir);
    float y = d.y;
    vec3 col = y > 0.0 ? mix(horizon, mid, smoothstep(0.0, 0.28, y)) : mix(horizon, ground, smoothstep(0.0, -0.25, y));
    col = mix(col, zenith, smoothstep(0.3, 1.0, y));
    // Watercolor washes: soft blooms with darker pooled edges, drifting slowly.
    vec2 q = d.xz / (abs(y) + 0.35) * 1.4 + vec2(time * 0.004, 0.0);
    float n = fbm(q);
    float n2 = fbm(q * 2.2 + 5.0);
    col *= 0.93 + 0.14 * n;
    col = mix(col, col * vec3(1.06, 0.92, 0.98), smoothstep(0.45, 0.7, n2) * 0.6);
    float pool = smoothstep(0.52, 0.55, n) - smoothstep(0.55, 0.6, n);
    col *= 1.0 - pool * 0.08 * smoothstep(0.0, 0.3, y);
    // The sun: a huge amber disc with a wet, uneven rim and a wide halo.
    float sd = dot(d, normalize(sunDir));
    float ang = acos(clamp(sd, -1.0, 1.0));
    float rad = 0.15 * sunSize;
    float wob = (fbm(vec2(atan(d.z - sunDir.z, d.x - sunDir.x) * 3.0, time * 0.02)) - 0.5) * 0.012 * sunSize;
    float disc = 1.0 - smoothstep(rad - 0.006 + wob, rad + 0.004 + wob, ang);
    float halo = exp(-max(ang - rad, 0.0) * 14.0 / sunSize) * 0.45 + exp(-max(ang - rad, 0.0) * 4.0) * 0.12;
    col += haloColor * halo;
    vec3 core = mix(sunColor * 1.35, vec3(1.0, 0.93, 0.78), smoothstep(rad, 0.0, ang) * 0.5);
    core *= 0.94 + 0.08 * fbm(d.xy * 40.0);
    col = mix(col, core, disc);
    // Paper grain.
    col *= 0.97 + 0.04 * hash(gl_FragCoord.xy);
    gl_FragColor = vec4(col, 1.0);
  }
`;

Effect.ShadersStore['plannerAtmosFragmentShader'] = `
  precision highp float;
  varying vec2 vUV;
  uniform sampler2D textureSampler;
  uniform sampler2D depthSampler;
  uniform vec3 camPos, camFwd, camRight, camUp, sunDir, fogColor, sunFogColor, inkColor;
  uniform float depthScale, fogDensity, fogFalloff, fogBase, haze, ink, grain;
  uniform vec2 texel;
  ${NOISE}
  float viewZ(vec2 uv) { return texture2D(depthSampler, uv).r * depthScale; }
  void main() {
    vec4 c = texture2D(textureSampler, vUV);
    float dz = texture2D(depthSampler, vUV).r;
    bool sky = dz >= 0.9999;
    float z = dz * depthScale;
    vec3 ray = camFwd + camRight * (vUV.x * 2.0 - 1.0) + camUp * (vUV.y * 2.0 - 1.0);
    vec3 dir = normalize(ray);
    float dist = sky ? 2500.0 : z * length(ray);

    // Ink: silhouettes where the depth jumps, thicker up close (Moebius line).
    if (!sky && ink > 0.0) {
      float w = mix(2.0, 1.0, smoothstep(10.0, 140.0, z));
      float m = 0.0;
      m = max(m, viewZ(vUV + vec2(texel.x * w, 0.0)) - z);
      m = max(m, viewZ(vUV - vec2(texel.x * w, 0.0)) - z);
      m = max(m, viewZ(vUV + vec2(0.0, texel.y * w)) - z);
      m = max(m, viewZ(vUV - vec2(0.0, texel.y * w)) - z);
      float edge = smoothstep(0.04, 0.12, m / max(z, 0.5));
      float fade = 1.0 - smoothstep(60.0, 260.0, z);
      c.rgb = mix(c.rgb, inkColor, edge * ink * fade);
    }

    // Height fog: thick in the hollows, thin up high, glowing toward the sun.
    float a = fogFalloff;
    float h0 = camPos.y - fogBase;
    float dy = dir.y * dist;
    float k = abs(a * dy) > 0.001 ? (1.0 - exp(-a * dy)) / (a * dy) : 1.0;
    float integ = fogDensity * exp(-a * h0) * dist * k;
    float f1 = 1.0 - exp(-max(integ, 0.0));
    float f2 = 1.0 - exp(-dist * haze * 0.0016);
    if (sky) { f2 *= 1.0 - smoothstep(0.0, 0.3, dir.y); f1 *= 1.0 - smoothstep(0.02, 0.25, dir.y); }
    float fogAmt = 1.0 - (1.0 - f1) * (1.0 - f2);
    float sunAmt = pow(max(dot(dir, sunDir), 0.0), 5.0);
    // Uneven fog: soft drifting banks.
    vec3 P = camPos + dir * min(dist, 400.0);
    float bank = 0.75 + 0.5 * fbm(P.xz * 0.012 + vec2(P.y * 0.02));
    fogAmt = clamp(fogAmt * (sky ? 1.0 : bank), 0.0, sky ? 0.85 : 0.97);
    vec3 fc = mix(fogColor, sunFogColor, sunAmt * 0.85);
    c.rgb = mix(c.rgb, fc, fogAmt);

    // Paper grain and a hint of pigment edge darkening.
    vec2 px = gl_FragCoord.xy;
    float paper = vnoise(px * 0.35) * 0.6 + vnoise(px * 0.07) * 0.4;
    c.rgb *= 1.0 - grain * 0.06 + grain * 0.07 * paper;
    gl_FragColor = vec4(c.rgb, 1.0);
  }
`;

export class Atmosphere {
  readonly sun: DirectionalLight;
  readonly hemi: HemisphericLight;
  readonly shadows: CascadedShadowGenerator;
  readonly sky: Mesh;
  private skyMat: ShaderMaterial;
  private sunMesh: Mesh;
  private depth: DepthRenderer;
  private post: PostProcess;
  private vls: VolumetricLightScatteringPostProcess | null = null;
  private pipe: DefaultRenderingPipeline;
  private spores: ParticleSystem;
  private koi: TransformNode[] = [];
  private ring: Mesh;
  private a: Atmos = { ...DEFAULT_ATMOS };
  private pal: Palette = PRESETS.altin.pal;
  private sunDir = new Vector3(0, 0.2, -1);
  private t = 0;
  mapSize = 300;

  /**
   * `focus` is where the air spores gather (the planner: the orbit target; the game: the player).
   * `rays: false` leaves out the god-ray pass (the game: one full-screen pass less every frame).
   */
  constructor(private scene: Scene, private camera: Camera, low = false, private focus: () => Vector3 = () => (camera as Camera & { target?: Vector3 }).target ?? camera.position, opts: { rays?: boolean } = {}) {
    scene.fogMode = Scene.FOGMODE_NONE;
    scene.clearColor = new Color4(0, 0, 0, 1);
    this.hemi = new HemisphericLight('hemi', new Vector3(0, 1, 0), scene);
    this.sun = new DirectionalLight('sun', new Vector3(1, -0.3, 0), scene);
    this.sun.autoCalcShadowZBounds = true;

    this.shadows = new CascadedShadowGenerator(low ? 1024 : 2048, this.sun);
    this.shadows.numCascades = low ? 2 : 3;
    this.shadows.lambda = 0.85;
    this.shadows.shadowMaxZ = 420;
    this.shadows.stabilizeCascades = true;
    this.shadows.filteringQuality = CascadedShadowGenerator.QUALITY_MEDIUM;
    this.shadows.usePercentageCloserFiltering = true;
    this.shadows.bias = 0.004;
    this.shadows.normalBias = 0.02;
    this.shadows.setDarkness(0.25);

    // Sky dome.
    this.sky = MeshBuilder.CreateSphere('planner-sky', { diameter: 1800, segments: 32, sideOrientation: Mesh.BACKSIDE }, scene);
    this.skyMat = new ShaderMaterial('planner-sky', scene, 'plannerSky', {
      attributes: ['position'],
      uniforms: ['worldViewProjection', 'zenith', 'mid', 'horizon', 'ground', 'sunColor', 'haloColor', 'sunDir', 'sunSize', 'time'],
    });
    this.skyMat.backFaceCulling = false;
    this.sky.material = this.skyMat;
    this.sky.infiniteDistance = true;
    this.sky.isPickable = false;

    // A disc in the sun's direction: the light source for god rays (hidden behind the sky).
    this.sunMesh = MeshBuilder.CreateDisc('sun-disc', { radius: 120, tessellation: 48 }, scene);
    const sm = new StandardMaterial('glow-sun', scene);
    sm.disableLighting = true;
    sm.emissiveColor = c3('#ffb347');
    this.sunMesh.material = sm;
    this.sunMesh.billboardMode = Mesh.BILLBOARDMODE_ALL;
    this.sunMesh.isPickable = false;

    this.depth = scene.enableDepthRenderer(camera, false, true);
    this.depth.forceDepthWriteTransparentMeshes = true;
    const skip = new Set<string>(['planner-sky', 'sun-disc', 'sis-ring']);
    this.depth.getDepthMap().renderListPredicate = (m) => !skip.has(m.name);

    this.post = new PostProcess('planner-atmos', 'plannerAtmos',
      ['camPos', 'camFwd', 'camRight', 'camUp', 'sunDir', 'fogColor', 'sunFogColor', 'inkColor', 'depthScale', 'fogDensity', 'fogFalloff', 'fogBase', 'haze', 'ink', 'grain', 'texel'],
      ['depthSampler'], 1, camera, Texture.BILINEAR_SAMPLINGMODE, scene.getEngine(), false, null, Constants.TEXTURETYPE_HALF_FLOAT);
    this.post.onApply = (e) => this.applyPost(e);

    if (opts.rays !== false) {
      this.vls = new VolumetricLightScatteringPostProcess('vls', 0.6, camera, this.sunMesh, 70, Texture.BILINEAR_SAMPLINGMODE, scene.getEngine(), false);
      this.vls.exposure = 0.25;
      this.vls.decay = 0.965;
      this.vls.weight = 0.6;
      this.vls.density = 0.92;
      this.vls.excludedMeshes = [this.sky];
    }

    this.pipe = new DefaultRenderingPipeline('planner-pp', true, scene, [camera]);
    this.pipe.fxaaEnabled = true;
    this.pipe.bloomEnabled = true;
    this.pipe.bloomThreshold = 0.75;
    this.pipe.bloomKernel = 64;
    this.pipe.bloomScale = 0.5;
    this.pipe.imageProcessingEnabled = true;
    const ip = this.pipe.imageProcessing;
    ip.toneMappingEnabled = true;
    ip.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
    ip.contrast = 1.12;
    ip.vignetteEnabled = true;
    ip.vignetteWeight = 1.6;
    ip.vignetteColor = new Color4(0.17, 0.12, 0.25, 0);
    this.pipe.sharpenEnabled = true;
    this.pipe.sharpen.edgeAmount = 0.25;

    this.spores = makeSporeCloud(scene, PRESETS.altin.pal.spore);
    this.ring = this.makeRing();
    this.makeKoi();
    scene.onBeforeRenderObservable.add(() => this.tick(scene.getEngine().getDeltaTime() / 1000));
  }

  /** Meshes the god-ray pass should ignore (transparent things). */
  exclude(m: Mesh) {
    this.vls?.excludedMeshes.push(m);
  }

  private applyPost(e: Effect) {
    const cam = this.camera;
    const a = this.a;
    const fwd = cam.getForwardRay(1).direction;
    const right = Vector3.Cross(Vector3.Up(), fwd).normalize();
    if (right.lengthSquared() < 0.01) right.set(1, 0, 0);
    const up = Vector3.Cross(fwd, right).normalize();
    const tanY = Math.tan(cam.fov / 2);
    const aspect = this.scene.getEngine().getAspectRatio(cam);
    e.setTexture('depthSampler', this.depth.getDepthMap());
    e.setVector3('camPos', cam.globalPosition);
    e.setVector3('camFwd', fwd);
    e.setVector3('camRight', right.scale(tanY * aspect));
    e.setVector3('camUp', up.scale(tanY));
    e.setVector3('sunDir', this.sunDir);
    const warm = (h: string, amt: number) => Color3.Lerp(c3(h), c3(this.pal.sunFog), amt);
    e.setColor3('fogColor', warm(this.pal.fog, (a.warmth - 0.5) * 0.4));
    e.setColor3('sunFogColor', c3(this.pal.sunFog));
    e.setColor3('inkColor', c3(this.pal.ink));
    e.setFloat('depthScale', cam.minZ + cam.maxZ);
    e.setFloat('fogDensity', 0.006 * a.fog * this.local.fog);
    e.setFloat('fogFalloff', 1 / Math.max(1, a.fogHeight));
    e.setFloat('fogBase', 0);
    e.setFloat('haze', a.haze);
    e.setFloat('ink', a.ink);
    e.setFloat('grain', a.grain);
    e.setFloat2('texel', 1 / this.post.width, 1 / this.post.height);
  }

  set(a: Atmos) {
    this.a = { ...a };
    const pal = (this.pal = PRESETS[a.preset].pal);
    const az = (a.sunAz * Math.PI) / 180, el = (a.sunEl * Math.PI) / 180;
    this.sunDir.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
    this.sun.direction = this.sunDir.scale(-1);
    this.sun.diffuse = Color3.Lerp(c3(pal.light), c3(pal.sun), a.warmth * 0.25);
    this.sun.intensity = 1.5 + a.sunEl / 60;
    this.hemi.diffuse = c3(pal.sky);
    this.hemi.groundColor = c3(pal.floor);
    this.hemi.intensity = 0.8;
    this.sunMesh.position = this.sunDir.scale(1500);
    this.sunMesh.scaling.setAll(a.sunSize);

    const s = this.skyMat;
    s.setColor3('zenith', c3(pal.zenith));
    s.setColor3('mid', c3(pal.mid));
    s.setColor3('horizon', Color3.Lerp(c3(pal.horizon), c3(pal.halo), (a.warmth - 0.5) * 0.3));
    s.setColor3('ground', c3(pal.ground));
    s.setColor3('sunColor', c3(pal.sun));
    s.setColor3('haloColor', c3(pal.halo));
    s.setVector3('sunDir', this.sunDir);
    s.setFloat('sunSize', a.sunSize);

    this.pipe.imageProcessing.exposure = a.exposure;
    this.pipe.bloomWeight = a.bloom;
    this.pipe.bloomEnabled = a.bloom > 0.01;
    if (this.vls) this.vls.exposure = 0.3 * a.rays;
    this.pipe.grainEnabled = a.grain > 0.01;
    this.pipe.grain.intensity = a.grain * 9;
    this.pipe.grain.animated = false;

    this.spores.emitRate = SPORE_FX.rate * a.spores * this.local.spores;
    setSporeColors(this.spores, pal.spore);
    this.koi.forEach((k, i) => k.setEnabled(i < a.koi));
    this.ring.setEnabled(a.ring);
  }

  /** Effect-region values where the camera looks (mapgen/fx.ts): scale the spores and the fog. */
  private local: FxValues = { spores: 1, fog: 1, fireflies: 1 };
  setLocal(v: FxValues) {
    this.local = { ...v };
    this.spores.emitRate = SPORE_FX.rate * this.a.spores * v.spores;
  }

  setMapSize(size: number) {
    this.mapSize = size;
    this.ring.scaling.set(size * 0.5, 1, size * 0.5);
  }



  /** The Kızıl Sis wall: the Harvest's closing ring, a soft red curtain. */
  private makeRing(): Mesh {
    const ring = MeshBuilder.CreateCylinder('sis-ring', { height: 46, diameter: 2, tessellation: 96, cap: Mesh.NO_CAP, sideOrientation: Mesh.DOUBLESIDE }, this.scene);
    ring.position.y = 14;
    const N = 256;
    const t = new DynamicTexture('sis-ring-tex', { width: N, height: N }, this.scene, true);
    const ctx = t.getContext() as CanvasRenderingContext2D;
    const g = ctx.createLinearGradient(0, 0, 0, N);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.08)');
    g.addColorStop(0.85, 'rgba(255,255,255,0.4)');
    g.addColorStop(1, 'rgba(255,255,255,0.65)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, N, N);
    // Vertical streaks like dripping paint.
    for (let i = 0; i < 70; i++) {
      const x = Math.random() * N;
      ctx.fillStyle = `rgba(255,255,255,${0.05 + Math.random() * 0.15})`;
      ctx.fillRect(x, N * (0.2 + Math.random() * 0.4), 2 + Math.random() * 6, N);
    }
    t.update(false);
    t.hasAlpha = true;
    t.uScale = 6;
    const m = new StandardMaterial('glow-ring', this.scene);
    m.disableLighting = true;
    m.emissiveColor = c3('#e2475c');
    m.diffuseTexture = t;
    m.useAlphaFromDiffuseTexture = true;
    m.alpha = 0.4;
    m.backFaceCulling = false;
    ring.material = m;
    ring.isPickable = false;
    this.exclude(ring);
    return ring;
  }

  /** 1–3 big koi, high and slow, made of the same paint as the sky (design §11.4). */
  private makeKoi() {
    const mats = [
      ['#fff6ea', '#ff7a1a'],
      ['#f2e8d5', '#e0412b'],
      ['#ffe1a0', '#2b1e3f'],
    ];
    for (let i = 0; i < 3; i++) {
      const root = new TransformNode(`koi-${i}`, this.scene);
      const [bodyHex, patchHex] = mats[i];
      const mat = (hex: string, alpha: number) => {
        const m = new StandardMaterial(`koi-mat-${i}-${hex}`, this.scene);
        m.diffuseColor = c3(hex);
        m.emissiveColor = c3(hex).scale(0.35);
        m.specularColor = Color3.Black();
        const rim = new FresnelParameters();
        rim.bias = 0.1;
        rim.power = 2.2;
        rim.leftColor = c3('#ffd38a');
        rim.rightColor = Color3.Black();
        m.emissiveFresnelParameters = rim;
        m.alpha = alpha;
        return m;
      };
      const body = MeshBuilder.CreateSphere(`koi-body-${i}`, { diameter: 1, segments: 16 }, this.scene);
      body.scaling.set(5, 4.2, 18);
      body.material = mat(bodyHex, 0.88);
      body.parent = root;
      for (let p = 0; p < 3; p++) {
        const patch = MeshBuilder.CreateSphere(`koi-patch-${i}-${p}`, { diameter: 1, segments: 10 }, this.scene);
        patch.scaling.set(3.6, 2.2, 4.5 - p);
        patch.position.set((p - 1) * 0.7, 1.35, 4 - p * 4.2);
        patch.material = mat(patchHex, 0.9);
        patch.parent = root;
      }
      const tail = MeshBuilder.CreateDisc(`koi-tail-${i}`, { radius: 4, tessellation: 3, sideOrientation: Mesh.DOUBLESIDE }, this.scene);
      tail.rotation.set(0, Math.PI / 2, Math.PI / 2);
      tail.position.z = -10.5;
      tail.scaling.set(1, 1.4, 1);
      tail.material = mat(patchHex, 0.6);
      tail.parent = root;
      for (const s of [-1, 1]) {
        const fin = MeshBuilder.CreateDisc(`koi-fin-${i}-${s}`, { radius: 2.4, tessellation: 3, sideOrientation: Mesh.DOUBLESIDE }, this.scene);
        fin.rotation.set(Math.PI / 2, 0, s * 0.5);
        fin.position.set(s * 3.2, -0.8, 3);
        fin.material = mat(bodyHex, 0.55);
        fin.parent = root;
      }
      root.metadata = { tail, phase: i * 2.1, radius: 140 + i * 60, height: 85 + i * 25, speed: 0.022 - i * 0.004 };
      root.getChildMeshes().forEach((m) => {
        m.isPickable = false;
        this.exclude(m as Mesh);
      });
      this.koi.push(root);
    }
  }

  private tick(dt: number) {
    this.t += dt;
    this.skyMat.setFloat('time', this.t);
    // Spores follow the camera target so the air near the viewer is always alive.
    const tgt = this.focus();
    (this.spores.emitter as Vector3).set(tgt.x, Math.max(0, tgt.y - 4), tgt.z);
    for (const k of this.koi) {
      const md = k.metadata;
      const a = md.phase + this.t * md.speed;
      k.position.set(Math.cos(a) * md.radius, md.height + Math.sin(this.t * 0.2 + md.phase) * 4, Math.sin(a) * md.radius);
      k.rotation.y = -a + Math.PI;
      k.rotation.z = Math.sin(this.t * 0.4 + md.phase) * 0.1;
      md.tail.rotation.x = Math.sin(this.t * 1.6 + md.phase) * 0.35;
    }
  }

  /** Shadow casters (re-added when meshes are created). */
  cast(meshes: Mesh[]) {
    for (const m of meshes) this.shadows.addShadowCaster(m, false);
  }
}

/**
 * A map file's atmosphere as the game plays it: the preset's values under the map's own, without the
 * planner-only extras (the game draws its own air spores per region, and the Kızıl Sis ring is a BG thing).
 */
export function gameAtmos(file: Record<string, unknown> | undefined): Atmos {
  const preset = (file?.preset as PresetId) in PRESETS ? (file!.preset as PresetId) : DEFAULT_ATMOS.preset;
  return { ...DEFAULT_ATMOS, ...PRESETS[preset].atmos, ...(file as Partial<Atmos>), preset, spores: 0, ring: false };
}
