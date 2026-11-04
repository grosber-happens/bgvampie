/**
 * Spores in the air, painted: each spore is a small watercolor dab (a soft pigment pool with a darker,
 * uneven rim and a little granulation), drawn with normal blending so it reads as paint on paper rather than
 * as a glowing light. They drift and sway slowly. Used by the planner's atmosphere and by the game, where
 * the map's effect regions (mapgen/fx.ts) set how thick they are.
 */
import { Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { NoiseProceduralTexture } from '@babylonjs/core/Materials/Textures/Procedurals/noiseProceduralTexture';
import { ParticleSystem } from '@babylonjs/core/Particles/particleSystem';
import '@babylonjs/core/Particles/particleSystemComponent';
import type { Scene } from '@babylonjs/core/scene';
import { rng } from './mapgen/noise';

export const SPORE_FX = {
  /** Spores born per second at 100%. */
  rate: 70,
  /** Box around the viewer where spores are born (half width, height). */
  half: 90,
  height: 25,
  size: [0.1, 0.38] as const,
  life: [8, 16] as const,
  /** Dab variants painted side by side on one sheet. */
  cells: 4,
};

/** One sheet of watercolor dabs, white so the particle color tints them. */
function dabSheet(scene: Scene): DynamicTexture {
  const N = 128;
  const n = SPORE_FX.cells;
  const t = new DynamicTexture('spore-dabs', { width: N * n, height: N }, scene, true);
  const ctx = t.getContext() as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, N * n, N);
  const rand = rng(77);
  for (let c = 0; c < n; c++) {
    const cx = c * N + N / 2, cy = N / 2;
    // An uneven blob outline.
    const pts: [number, number][] = [];
    const lobes = 9 + c * 2;
    const phase = rand() * 6.28;
    for (let i = 0; i < lobes; i++) {
      const a = (i / lobes) * Math.PI * 2;
      const r = N * (0.3 + 0.06 * Math.sin(a * 3 + phase) + 0.05 * (rand() - 0.5));
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
    const path = () => {
      ctx.beginPath();
      for (let i = 0; i <= pts.length; i++) {
        const [x0, y0] = pts[i % pts.length], [x1, y1] = pts[(i + 1) % pts.length];
        const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
        if (i === 0) ctx.moveTo(mx, my);
        else ctx.quadraticCurveTo(x0, y0, mx, my);
      }
      ctx.closePath();
    };
    // The pool: pale in the middle, pigment gathered at the rim (watercolor edge darkening).
    const g = ctx.createRadialGradient(cx - N * 0.05, cy - N * 0.05, N * 0.02, cx, cy, N * 0.36);
    g.addColorStop(0, 'rgba(255,255,255,0.35)');
    g.addColorStop(0.65, 'rgba(255,255,255,0.55)');
    g.addColorStop(0.92, 'rgba(255,255,255,0.95)');
    g.addColorStop(1, 'rgba(255,255,255,0.0)');
    path();
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    path();
    ctx.stroke();
    // Granulation: a few pigment specks lifted out.
    const img = ctx.getImageData(c * N, 0, N, N);
    for (let i = 0; i < img.data.length; i += 4) if (img.data[i + 3] && rand() < 0.18) img.data[i + 3] *= 0.55 + rand() * 0.3;
    ctx.putImageData(img, c * N, 0);
  }
  t.update(false);
  t.hasAlpha = true;
  return t;
}

/** A spore cloud that follows `at` (move its emitter each frame). `colors`: two pigment hex colors. */
export function makeSporeCloud(scene: Scene, colors: readonly string[], capacity = 3000): ParticleSystem {
  const ps = new ParticleSystem('spores', capacity, scene);
  ps.particleTexture = dabSheet(scene);
  ps.isAnimationSheetEnabled = true;
  ps.spriteCellWidth = 128;
  ps.spriteCellHeight = 128;
  ps.startSpriteCellID = 0;
  ps.endSpriteCellID = SPORE_FX.cells - 1;
  ps.spriteRandomStartCell = true;
  ps.spriteCellChangeSpeed = 0;
  ps.emitter = new Vector3(0, 0, 0);
  ps.minEmitBox = new Vector3(-SPORE_FX.half, 0, -SPORE_FX.half);
  ps.maxEmitBox = new Vector3(SPORE_FX.half, SPORE_FX.height, SPORE_FX.half);
  [ps.minSize, ps.maxSize] = SPORE_FX.size;
  [ps.minLifeTime, ps.maxLifeTime] = SPORE_FX.life;
  ps.minInitialRotation = 0;
  ps.maxInitialRotation = Math.PI * 2;
  ps.minAngularSpeed = -0.3;
  ps.maxAngularSpeed = 0.3;
  ps.direction1 = new Vector3(-0.3, 0.15, -0.2);
  ps.direction2 = new Vector3(0.35, 0.45, 0.25);
  ps.minEmitPower = 0.2;
  ps.maxEmitPower = 0.6;
  // Slow swirling drift instead of straight lines.
  const noise = new NoiseProceduralTexture('spore-drift', 64, scene);
  noise.animationSpeedFactor = 0.6;
  noise.persistence = 1.4;
  noise.brightness = 0.5;
  noise.octaves = 2;
  ps.noiseTexture = noise;
  ps.noiseStrength = new Vector3(0.6, 0.25, 0.6);
  ps.blendMode = ParticleSystem.BLENDMODE_STANDARD;
  setSporeColors(ps, colors);
  ps.preWarmCycles = 200;
  ps.start();
  return ps;
}

const FADE: [number, number][] = [
  [0, 0],
  [0.15, 0.75],
  [0.8, 0.65],
  [1, 0],
];

/** Tint each dab with one of the two pigments, fading in and out over its life so dabs never pop. */
export function setSporeColors(ps: ParticleSystem, colors: readonly string[]) {
  const a = Color4.FromHexString(colors[0].slice(0, 7) + 'ff');
  const b = Color4.FromHexString((colors[1] ?? colors[0]).slice(0, 7) + 'ff');
  for (const [t] of FADE) ps.removeColorGradient(t);
  for (const [t, alpha] of FADE) ps.addColorGradient(t, new Color4(a.r, a.g, a.b, alpha), new Color4(b.r, b.g, b.b, alpha * 0.85));
}
