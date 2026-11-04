/**
 * Blue puffball (mantar_mavi_patlak): a bullet bursts it (clip `patla`) and the spores that settle around it
 * heal everyone standing in the cloud for a few seconds. It grows back (`toparlan`) and breathes (`nefes`) again.
 * Clips and timing: polish/hareket_notu.md in the region assets. Numbers: PUF in balance.ts.
 */
import type { AnimationGroup } from '@babylonjs/core/Animations/animationGroup';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { PUF } from './balance';
import { G, SHOOTABLES } from './core';
import type { SporPlaced } from './spor';

type Cloud = { x: number; y: number; z: number; r: number; t: number };
const clouds: Cloud[] = [];

/** Seconds into `patla` when the cap bursts and the spores fly. */
const BURST_AT = 0.75;

export function setupPuffballs(placed: SporPlaced[]) {
  for (const p of placed) {
    if (p.k !== 'mantar_mavi_patlak') continue;
    const clip = (n: string): AnimationGroup | undefined => p.anims.get(n);
    const spores = p.root.getChildren((c) => c.name.startsWith('mantar_mavi_patlak_spor'), false) as TransformNode[];
    const showSpores = (on: boolean) => spores.forEach((s) => s.setEnabled(on));
    showSpores(false);
    clip('nefes')?.start(true);
    let readyAt = 0;
    SHOOTABLES.push({
      x: p.o.x,
      y: p.y,
      z: p.o.z,
      r: PUF.hitRadius * p.o.s,
      h: PUF.hitHeight * p.o.s,
      ready: () => G.time >= readyAt,
      hit: () => {
        readyAt = G.time + PUF.regrow;
        clip('nefes')?.stop();
        showSpores(true);
        const burst = clip('patla');
        burst?.start(false);
        burst?.onAnimationGroupEndObservable.addOnce(() => showSpores(false));
        const at = G.time + BURST_AT;
        clouds.push({ x: p.o.x, y: p.y, z: p.o.z, r: PUF.cloudRadius * p.o.s, t: -at });
        setTimeoutGame(PUF.regrow - 4, () => {
          const grow = clip('toparlan');
          if (!grow) {
            clip('nefes')?.start(true);
            return;
          }
          grow.start(false);
          grow.onAnimationGroupEndObservable.addOnce(() => clip('nefes')?.start(true));
        });
      },
    });
  }
}

/** Timers on match time, so a paused game does not regrow puffballs. */
const timers: { at: number; fn: () => void }[] = [];
function setTimeoutGame(after: number, fn: () => void) {
  timers.push({ at: G.time + after, fn });
}

export function updatePuffballs(dt: number) {
  for (let i = timers.length - 1; i >= 0; i--) {
    if (G.time < timers[i].at) continue;
    const t = timers.splice(i, 1)[0];
    t.fn();
  }
  for (let i = clouds.length - 1; i >= 0; i--) {
    const c = clouds[i];
    // t < 0: waiting for the burst (stored as -start time); then counts up the cloud's life.
    if (c.t < 0) {
      if (G.time < -c.t) continue;
      c.t = 0;
    }
    c.t += dt;
    if (c.t > PUF.cloudTime) {
      clouds.splice(i, 1);
      continue;
    }
    for (const u of G.units) {
      if (!u.alive || (u.kind !== 'player' && u.kind !== 'bot')) continue;
      if ((u.pos.x - c.x) ** 2 + (u.pos.z - c.z) ** 2 > c.r * c.r || Math.abs(u.pos.y - c.y) > 3) continue;
      u.hp = Math.min(u.maxHp, u.hp + u.maxHp * PUF.healPerSec * dt);
    }
  }
}
