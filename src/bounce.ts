/**
 * Bouncy morel jump pad: how hard a landing throws you. Pure math, no Babylon, so the game,
 * a server or the simulator can share it. Numbers live in balance.ts (BOUNCE).
 */
import { BOUNCE } from './balance';

export type Launch = {
  /** Upward speed after the bounce (m/s). */
  up: number;
  /** Horizontal speed along the travel direction (m/s). */
  forward: number;
  /** 0 = a soft hop, 1 = the biggest throw (drives the squash size and effects). */
  strength: number;
};

/**
 * The throw for a landing after falling `fall` meters onto the cap (`gravity` in m/s²).
 * The landing speed is √(2·g·fall); the pad gives back `keep` of it upward and pushes forward
 * more the farther you fell. Short falls only hop, so the throw never builds up by itself.
 */
export function bounceLaunch(fall: number, gravity: number): Launch {
  const B = BOUNCE;
  if (!(fall >= B.minFall)) return { up: B.hop, forward: 0, strength: 0 };
  const impact = Math.sqrt(2 * gravity * fall);
  const up = Math.min(B.maxUp, Math.max(B.hop, B.keep * impact));
  const forward = Math.min(B.maxForward, B.forwardBase + B.forwardPerMeter * fall);
  const strength = Math.min(1, (up - B.hop) / (B.maxUp - B.hop));
  return { up, forward, strength };
}

/** Squash (0..1) and stretch (0..1) of the mushroom `t` seconds after a bounce. */
export function squashAt(t: number): [number, number] {
  const k = BOUNCE.squash;
  if (t <= 0 || t >= k[k.length - 1][0]) return [0, 0];
  let i = 1;
  while (k[i][0] < t) i++;
  const [t0, s0, u0] = k[i - 1];
  const [t1, s1, u1] = k[i];
  const f = (t - t0) / (t1 - t0);
  const e = f * f * (3 - 2 * f);
  return [s0 + (s1 - s0) * e, u0 + (u1 - u0) * e];
}

/** Height and width scale of the mushroom for a squash/stretch pair, at relative height h (0 foot, 1 tip). */
export function squashScale(squash: number, stretch: number, h: number): { y: number; xz: number } {
  const B = BOUNCE;
  const y = 1 + (B.squashHeight - 1) * squash + (B.stretchHeight - 1) * stretch;
  const xz = 1 + B.squashBulge * squash * Math.sin(Math.PI * Math.min(1, 0.12 + h * 0.88)) - B.stretchThin * stretch * Math.sin(Math.PI * h);
  return { y, xz };
}
