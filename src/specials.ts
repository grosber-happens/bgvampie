import { G, dealDamage, ringFx, slowUnit, stun } from './core';
import { forwardFromYaw } from './actors';
import { areaFx, enemiesNear, meleeTargets, push, slash, sweep, type ClassId } from './kit';

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
  /** Stand guard this long; the first hit taken in it is softened and answered with `hit`. */
  guard?: { time: number; keep: number };
  /** The strike itself (at the end of the lunge, on a guarded hit, or right away). */
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
  // Fighter: a counter stance. Take a hit for a fifth of its damage and swing back all around.
  fighter: {
    name: 'Karşı duruş',
    cost: 30,
    cd: 1.4,
    color: '#ff9a3b',
    guard: { time: 0.55, keep: 0.2 },
    hit: () => {
      const p = G.player;
      for (const u of meleeTargets(2.8, 360)) {
        dealDamage(p, u, 35);
        push(u, u.pos.subtract(p.pos), 3);
        stun(u, 0.4);
      }
      slash('#ff9a3b', 2.8, 1);
      ringFx(p.pos, 2.8, '#ff9a3b', 0.3);
    },
  },
  // Scout: a hop and a launching kick that knocks back and dazes.
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
        push(u, f, 2.5);
        stun(u, 0.6);
      }
      slash('#7be36f', 2.2, 0.25, p.yaw, 0.6);
    },
  },
  // Mage: a push wave around the body that shoves everyone off and slows them.
  mage: {
    name: 'İtme dalgası',
    cost: 30,
    cd: 1.4,
    color: '#7ad7ff',
    hit: () => {
      const p = G.player;
      for (const u of enemiesNear(p.pos, 4)) {
        dealDamage(p, u, 18);
        push(u, u.pos.subtract(p.pos), 4);
        slowUnit(u, 0.4, 1.5);
      }
      areaFx(p.pos, 4, '#7ad7ff', 0.3, 0.4);
      ringFx(p.pos, 4, '#7ad7ff', 0.35);
    },
  },
};
