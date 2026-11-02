/**
 * Performance test page (perf.html): builds the 4×4 km test map like the game does and flies a
 * head-height camera along a fixed loop, then reports frame time, draw calls and triangles.
 * `?frames=600` sets the length, `?step=4` the meters moved per frame (fast, to stress streaming).
 * `?models=1` swaps the mushrooms for the Blender LOD models in public/perf-models/ (not in git;
 * copy the .glb files from the Spor Ormanı region there).
 * Results land in `window.__perf` for tools/perf-bench.mjs.
 */
import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { UniversalCamera } from '@babylonjs/core/Cameras/universalCamera';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { SceneInstrumentation } from '@babylonjs/core/Instrumentation/sceneInstrumentation';
import { buildWorld } from './world';
import { PERF_MAP, PERF_PATH } from './mapgen/perfmap';
import { KINDS, type Kind } from './mapgen/generate';
import { loadLodModel } from './models';

const params = new URLSearchParams(location.search);
const FRAMES = Number(params.get('frames')) || 600;
const STEP = Number(params.get('step')) || 4;
/** `?size=1000` measures a smaller map with the same density (the old renderer cannot draw 4 km in headless Chromium). */
const SIZE = Number(params.get('size')) || PERF_MAP.gen.size;
const MAP = { ...PERF_MAP, gen: { ...PERF_MAP.gen, size: SIZE } };
const k = SIZE / PERF_MAP.gen.size;
const out = document.getElementById('out')!;
const canvas = document.getElementById('view') as HTMLCanvasElement;
const engine = new Engine(canvas, false, { preserveDrawingBuffer: false, stencil: true });
const scene = new Scene(engine);
const camera = new UniversalCamera('cam', new Vector3(0, 10, 0), scene);
camera.fov = 0.95;
camera.minZ = 0.1;
camera.maxZ = 6000;

const heapMb = () => {
  const m = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
  return m ? Math.round(m.usedJSHeapSize / 1048576) : -1;
};

const t0 = performance.now();
const world = buildWorld(scene, MAP.gen.seed, { houseModel: false, mapFile: MAP });
const buildMs = Math.round(performance.now() - t0);
console.log(`perf: world built in ${buildMs} ms`);
const field = world.field!;
const stream = (world as { stream?: (x: number, z: number) => void }).stream;

/** Which Blender models replace which map kinds in `?models=1`. */
const PERF_MODELS: Partial<Record<Kind, string[]>> = {
  mantar: ['mantar_kucuk', 'mantar_orta', 'mantar_buyuk'],
  kume: ['mantar_kumesi'],
  yosun: ['yosun_tumsek'],
};
let ready = !params.has('models');
if (!ready) {
  const view = (world as { view?: import('./planner/build').MapView }).view;
  Promise.all(
    Object.entries(PERF_MODELS).map(async ([kind, names]) => {
      const models = await Promise.all(names!.map((n) => loadLodModel(scene, `perf-models/${n}.glb`, KINDS[kind as Kind].r * 2)));
      view?.useModels(kind as Kind, models);
    }),
  ).then(() => (ready = true), (e) => console.error('perf: models failed', e));
}

// The path as evenly spaced points, STEP meters apart.
const pts: [number, number][] = [];
for (let i = 0; i < PERF_PATH.length - 1; i++) {
  const [ax, az] = PERF_PATH[i], [bx, bz] = PERF_PATH[i + 1];
  const n = Math.max(1, Math.round((Math.hypot(bx - ax, bz - az) * k) / STEP));
  for (let t = 0; t < n; t++) pts.push([(ax + ((bx - ax) * t) / n) * k, (az + ((bz - az) * t) / n) * k]);
}

const inst = new SceneInstrumentation(scene);
inst.captureFrameTime = true;
const gl = (engine as unknown as { _gl: WebGLRenderingContext })._gl;
const px = new Uint8Array(4);

type Sample = { ms: number; draws: number; tris: number; meshes: number };
const samples: Sample[] = [];
let frame = 0;
const WARMUP = 30;

function place(i: number) {
  const [x, z] = pts[i % pts.length];
  const [nx, nz] = pts[(i + 8) % pts.length];
  const y = Math.max(field.height(x, z), field.p.water) + 2.2;
  camera.position.set(x, y, z);
  camera.setTarget(new Vector3(nx, Math.max(field.height(nx, nz), field.p.water) + 1.6, nz));
  stream?.(x, z);
}

function stats(list: number[]) {
  const s = [...list].sort((a, b) => a - b);
  const avg = s.reduce((a, b) => a + b, 0) / Math.max(1, s.length);
  return { avg: +avg.toFixed(2), p95: +s[Math.floor(s.length * 0.95)]?.toFixed(2), max: +s[s.length - 1]?.toFixed(2) };
}

engine.runRenderLoop(() => {
  if (!ready || frame >= FRAMES + WARMUP) return;
  place(frame);
  const a = performance.now();
  scene.render();
  // Wait for the GPU so the time covers the whole frame, not just command submission.
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  const ms = performance.now() - a;
  if (frame >= WARMUP) {
    samples.push({ ms, draws: inst.drawCallsCounter.current, tris: Math.round(scene.getActiveIndices() / 3), meshes: scene.getActiveMeshes().length });
  }
  frame++;
  if (frame % 10 === 0) console.log(`perf: frame ${frame} ${ms.toFixed(1)} ms, ${inst.drawCallsCounter.current} draws, ${Math.round(scene.getActiveIndices() / 3)} tris, ${scene.getActiveMeshes().length} meshes`);
  if (frame % 20 === 0 || frame === FRAMES + WARMUP) {
    const last = samples[samples.length - 1];
    out.textContent = `kare ${frame}/${FRAMES + WARMUP}  ${last ? `${last.ms.toFixed(1)} ms  çizim ${last.draws}  üçgen ${last.tris}` : ''}`;
  }
  if (frame === FRAMES + WARMUP) {
    const heavy = scene.meshes
      .filter((m) => m.isEnabled() && m.getTotalIndices() > 0)
      .map((m) => { const n = Math.max(1, (m as unknown as { thinInstanceCount: number }).thinInstanceCount || 1); return { name: m.name, n, tris: (m.getTotalIndices() / 3) * n }; })
      .sort((a, b) => b.tris - a.tris)
      .slice(0, 8);
    const result = {
      heavy,
      buildMs,
      objects: world.mapObjects?.length ?? 0,
      heapMb: heapMb(),
      frameMs: stats(samples.map((s) => s.ms)),
      drawCalls: stats(samples.map((s) => s.draws)),
      triangles: stats(samples.map((s) => s.tris)),
      activeMeshes: stats(samples.map((s) => s.meshes)),
      over25ms: samples.filter((s) => s.ms > 25).length,
      frames: samples.length,
    };
    (window as unknown as { __perf: unknown }).__perf = result;
    out.textContent = JSON.stringify(result, null, 2);
  }
});
