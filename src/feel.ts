import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { PointLight } from '@babylonjs/core/Lights/pointLight';
import { Scene } from '@babylonjs/core/scene';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { glowMat } from './core';

/**
 * Shooting feel: muzzle flash, recoil, camera shake, impact sparks and synthesized sounds.
 * Everything is procedural, so there are no sound or texture files to load.
 */

// ---- Camera shake and recoil ---------------------------------------------------
export const feel = {
  shake: 0,
  /** Extra pitch from recoil (radians), springs back to 0. */
  recoilPitch: 0,
  /** Gun model kick-back (metres). */
  gunKick: 0,
  fovPunch: 0,
  hurt: 0,
};

export function addShake(amount: number) {
  feel.shake = Math.min(1, feel.shake + amount);
}

export function kick(pitch: number, gun: number, fov: number, shake: number) {
  feel.recoilPitch += pitch;
  feel.gunKick = Math.min(0.25, feel.gunKick + gun);
  feel.fovPunch += fov;
  addShake(shake);
}

export function updateFeel(dt: number) {
  feel.shake = Math.max(0, feel.shake - dt * 3);
  feel.recoilPitch *= Math.exp(-dt * 12);
  feel.gunKick *= Math.exp(-dt * 18);
  feel.fovPunch *= Math.exp(-dt * 14);
  feel.hurt = Math.max(0, feel.hurt - dt * 2.5);
  updateFlash(dt);
  updateSparks(dt);
}

/** Random camera offset for the current shake. */
export function shakeOffset(): Vector3 {
  const s = feel.shake * feel.shake * 0.18;
  return new Vector3((Math.random() - 0.5) * s, (Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
}

// ---- Muzzle flash ----------------------------------------------------------------------
let light: PointLight | null = null;
let flashMesh: Mesh | null = null;
let flashT = 0;

export function initFeel(scene: Scene) {
  light = new PointLight('muzzle-light', Vector3.Zero(), scene);
  light.diffuse = Color3.FromHexString('#ffc46a');
  light.specular = Color3.Black();
  light.range = 9;
  light.intensity = 0;
  flashMesh = MeshBuilder.CreatePolyhedron('muzzle-flash', { type: 1, size: 0.16 }, scene);
  flashMesh.material = glowMat('#ffe4a0', 0.95);
  flashMesh.isPickable = false;
  flashMesh.isVisible = false;
}

export function muzzleFlash(at: Vector3, color = '#ffc46a') {
  if (!light || !flashMesh) return;
  light.position.copyFrom(at);
  light.diffuse = Color3.FromHexString(color);
  light.intensity = 2.2;
  flashMesh.position.copyFrom(at);
  flashMesh.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
  flashMesh.scaling.setAll(0.8 + Math.random() * 0.6);
  flashMesh.isVisible = true;
  flashT = 0.05;
}

function updateFlash(dt: number) {
  if (!light || !flashMesh) return;
  flashT -= dt;
  light.intensity = Math.max(0, light.intensity - dt * 40);
  if (flashT <= 0) flashMesh.isVisible = false;
}

// ---- Impact sparks -----------------------------------------------------------------------
type Spark = { mesh: Mesh; vel: Vector3; t: number };
let sparks: Spark[] = [];

export function sparksAt(scene: Scene, at: Vector3, color: string, count = 6, speed = 6) {
  for (let i = 0; i < count; i++) {
    const m = MeshBuilder.CreateBox('spark', { size: 0.06 }, scene);
    m.material = glowMat(color);
    m.isPickable = false;
    m.position.copyFrom(at);
    const v = new Vector3(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).normalize().scale(speed * (0.4 + Math.random() * 0.6));
    sparks.push({ mesh: m, vel: v, t: 0.25 + Math.random() * 0.2 });
  }
}

function updateSparks(dt: number) {
  sparks = sparks.filter((s) => {
    s.t -= dt;
    s.vel.y -= 18 * dt;
    s.mesh.position.addInPlace(s.vel.scale(dt));
    s.mesh.scaling.setAll(Math.max(0.1, s.t * 3));
    if (s.t <= 0) s.mesh.dispose();
    return s.t > 0;
  });
}

// ---- Sounds (Web Audio, synthesized) ---------------------------------------------------------
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;

function audio(): AudioContext | null {
  try {
    if (!ctx) {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** Browsers only allow sound after a click; call this from the play button. */
export function unlockAudio() {
  audio();
}

function noise(dur: number, freq: number, q: number, gain: number, type: BiquadFilterType = 'bandpass', at = 0) {
  const c = audio();
  if (!c || !noiseBuf || !master) return;
  const t = c.currentTime + at;
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t, Math.random() * 0.3, dur + 0.05);
}

function tone(dur: number, f0: number, f1: number, gain: number, type: OscillatorType = 'sine', at = 0) {
  const c = audio();
  if (!c || !master) return;
  const t = c.currentTime + at;
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

export const sfx = {
  /** Pistol: sharp crack, low thump and a short tail. */
  shot() {
    noise(0.08, 2600, 0.8, 0.9);
    tone(0.12, 160, 50, 0.7, 'triangle');
    noise(0.25, 700, 0.6, 0.18, 'lowpass', 0.02);
  },
  /** Distant shot from someone else (quieter and duller). */
  farShot(dist: number) {
    const v = Math.max(0.03, 0.35 - dist / 120);
    noise(0.1, 1200, 0.7, v);
    tone(0.1, 120, 50, v * 0.6, 'triangle');
  },
  swing() {
    noise(0.12, 1800, 2.5, 0.35, 'bandpass');
    tone(0.1, 900, 400, 0.08, 'sawtooth');
  },
  hit(crit: boolean) {
    tone(0.06, crit ? 1700 : 1200, crit ? 1500 : 1000, crit ? 0.3 : 0.18, 'square');
    if (crit) tone(0.09, 2400, 2200, 0.15, 'square', 0.04);
  },
  kill() {
    tone(0.09, 880, 880, 0.22, 'square');
    tone(0.16, 1320, 1320, 0.2, 'square', 0.08);
  },
  hurt() {
    tone(0.15, 220, 90, 0.35, 'sawtooth');
    noise(0.1, 500, 1, 0.25);
  },
  reload() {
    tone(0.04, 600, 500, 0.15, 'square');
    tone(0.05, 900, 700, 0.15, 'square', 0.25);
  },
  empty() {
    tone(0.03, 1500, 1400, 0.12, 'square');
  },
  impact() {
    noise(0.05, 3500, 1.2, 0.12);
  },
  boom() {
    noise(0.6, 300, 0.5, 0.9, 'lowpass');
    tone(0.5, 90, 30, 0.8, 'sine');
  },
  skill() {
    tone(0.18, 500, 1100, 0.12, 'sine');
  },
};
