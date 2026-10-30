import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { G, dealDamage, ringFx, spawnFx, stun } from './core';
import { forwardFromYaw } from './actors';
import { meleeTargets, push, slash, sweep, type ClassId } from './kit';

/**
 * Right click with the melee weapon out: one special attack per class, paid with breath.
 * Idea from S4 League's melee right click (each sword has its own); the moves are ours.
 */
export type SpecialDef = {
  name: string;
  /** Breath it costs. */
  cost: number;
  /** Seconds before it can be used again. */
  cd: number;
  color: string;
  /** Rush forward this far over this time, then hit (hop: a little jump at the start). */
  lunge?: { dist: number; time: number; hop?: number };
  /** Wind up this long (slow steps), then hit: a heavy attack. */
  windup?: number;
  /** Block all damage for this long (a spell shield); `hit` shows it. */
  shield?: number;
  /** The strike itself (at the end of the lunge or wind-up, or right away). */
  hit(): void;
};

export const SPECIALS: Record<ClassId, SpecialDef> = {
  // Rogue: rush and stab whoever is in front. Backstab bonuses still apply from behind.
  rogue: {
    name: 'Saplama',
    cost: 25,
    cd: 1.2,
    color: '#ff5a6e',
    lunge: { dist: 5, time: 0.2 },
    hit: () => {
      sweep(2.4, 110, 40, '#ff5a6e');
    },
  },
  // Fighter: a heavy attack. A short wind-up, then a wide slash that hits hard and knocks back.
  fighter: {
    name: 'Ağır vuruş',
    cost: 30,
    cd: 1.4,
    color: '#ff9a3b',
    windup: 0.35,
    hit: () => {
      const p = G.player;
      const f = forwardFromYaw(p.yaw);
      for (const u of sweep(3, 160, 60, '#ff9a3b')) {
        push(u, f, 3);
        stun(u, 0.3);
      }
      slash('#ff9a3b', 3, 0.45, p.yaw, -0.4);
    },
  },
  // Scout: a hop and a kick that flings enemies far forward and dazes them.
  scout: {
    name: 'Fırlatan tekme',
    cost: 25,
    cd: 1.2,
    color: '#7be36f',
    lunge: { dist: 2.6, time: 0.18, hop: 5 },
    hit: () => {
      const p = G.player;
      const f = forwardFromYaw(p.yaw);
      for (const u of meleeTargets(2.2, 90)) {
        dealDamage(p, u, 28);
        push(u, f, 7);
        stun(u, 0.6);
      }
      slash('#7be36f', 2.2, 0.25, p.yaw, 0.6);
    },
  },
  // Mage: a spell shield. For one second nothing gets through.
  mage: {
    name: 'Büyü kalkanı',
    cost: 30,
    cd: 3,
    color: '#7ad7ff',
    shield: 1,
    hit: () => {
      const p = G.player;
      spawnFx(MeshBuilder.CreateSphere('spellshield', { diameter: 2.4, segments: 16 }, G.scene), p.pos.add(new Vector3(0, 0.95, 0)), '#7ad7ff', 1, 0, 0.3);
      ringFx(p.pos, 1.4, '#7ad7ff', 0.3);
    },
  },
};
