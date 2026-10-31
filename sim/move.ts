/**
 * S4 style movement in the simulator: the breath bar (SP), side-dash dodges, dashing out of
 * a stun, sprinting and the right-click melee specials. Numbers come from src/main.ts (`S4`)
 * and src/specials.ts through config.ts (`MOVE`, `SPECIAL`).
 *
 * The world is flat 2D, so a dodge is a dice roll: a bot that sees an attack coming
 * (it is looking at the attacker, the attacker is not hidden and not behind it) spends 20 SP
 * and the hit misses. Slow, telegraphed attacks (spears, a charged sniper shot, the Fighter's
 * wind-up) are easier to dodge than hitscan lasers. Double jumps and wall kicks are not modelled.
 */
import { CLASSES, MOVE, SPECIAL } from './config.ts';
import { W, clamp, damage, dist, hooks, hostile, isBehind, jump, later, stun, type Unit } from './core.ts';
import { gearDashCost } from './gear.ts';

const skill = (u: Unit) => clamp((u.p?.aim ?? 0.65) / 0.65, 0.7, 1.3);

/** Breath: drains while sprinting, comes back after a short pause. */
export function spTick(u: Unit, dt: number) {
  const p = u.p!;
  p.winded -= dt;
  p.spIdle += dt;
  p.specialCd -= dt;
  p.dodgeCd -= dt;
  p.hurt *= Math.exp(-dt);
  if (u.stunT <= 0) p.stunRolled = false;
  if (p.sprinting) {
    p.sp -= MOVE.sprintDrain * dt;
    p.spIdle = 0;
    p.sprintTime += dt;
    if (p.sp <= 0) {
      p.sp = 0;
      p.winded = MOVE.winded;
      p.sprinting = false;
    }
  } else if (p.spIdle >= MOVE.spDelay && p.winded <= 0) p.sp = Math.min(MOVE.spMax, p.sp + MOVE.spRegen * dt);
}

/** Pay breath. `keep`: refuse if less than this would be left. */
export function spend(u: Unit, cost: number, keep = 0): boolean {
  const p = u.p!;
  if (p.sp - cost < keep) return false;
  p.sp -= cost;
  p.spIdle = 0;
  if (p.sp <= 0.5) p.winded = MOVE.winded;
  return true;
}

/** Can the defender side-dash out of this attack? Spends breath when it does. */
export const WHY: Record<string, number> = {};
const no = (k: string) => ((WHY[k] = (WHY[k] ?? 0) + 1), false);
export function tryDodge(dst: Unit, src: Unit, kind: string): boolean {
  if (!MOVE.on || !dst.p || !dst.alive || dst.stunT > 0) return no('off/stun');
  const p = dst.p;
  if (p.dodgeCd > 0 || p.winded > 0) return no('cd');
  const att = src.owner ?? src;
  // Only attacks it can see coming: from a player or a boss, not hidden, not from behind.
  if (!att.p && att.kind !== 'boss') return no('mob');
  if (src.stealthT > 0 || src.fadeT > 0 || att.stealthT > 0) return no('hidden');
  if (isBehind(att, dst)) return no('behind');
  const cost = MOVE.dashCost * gearDashCost(dst);
  if (p.sp < cost) return no('sp');
  let c = (MOVE.dodge[kind] ?? 0.15) * skill(dst);
  // Busy with someone else: half as likely to notice.
  if (dst.target !== att && dst.target?.owner !== att) c *= 0.5;
  if (W.rand() > c) return no('roll');
  spend(dst, cost);
  p.dodgeCd = MOVE.dodgeGap;
  p.dodges++;
  // The cartwheel costs a little attack time.
  dst.atkT = Math.max(dst.atkT, 0.15);
  return true;
}

/** A stun landed in a player fight: dash out of it (35 SP) with a reaction roll. */
export function tryStunBreak(u: Unit): boolean {
  const p = u.p!;
  if (!MOVE.on || p.stunRolled || u.stunT < 0.3) return false;
  p.stunRolled = true;
  const fight = u.target?.p || W.players.some((e) => e !== u && e.alive && e.target === u && dist(e, u) < 15);
  if (!fight) return false;
  const cost = MOVE.stunDashCost * gearDashCost(u);
  if (p.sp < cost || W.rand() > MOVE.stunBreak * skill(u)) return false;
  spend(u, cost);
  u.stunT = 0;
  p.stunBreaks++;
  return true;
}

/** Should the bot sprint this step? */
export function wantSprint(u: Unit, mode: 'travel' | 'chase' | 'flee'): boolean {
  const p = u.p!;
  if (!MOVE.on || p.winded > 0) return false;
  if (mode === 'flee') return p.sp > 0;
  // Keep a dodge in the bar while closing in; travel down to about a third.
  if (mode === 'chase') return p.sp > MOVE.reserve + 10;
  return p.sp > (p.sprinting ? 25 : 45);
}

function push(t: Unit, from: Unit, m: number) {
  if (t.kind === 'boss') return;
  const d = Math.max(0.01, dist(t, from));
  t.x += ((t.x - from.x) / d) * m;
  t.z += ((t.z - from.z) / d) * m;
}

/**
 * Right click with the melee weapon (players and bosses only, breath permitting).
 * Returns true when it used the special.
 */
export function trySpecial(u: Unit, t: Unit, d: number): boolean {
  if (!MOVE.on || !SPECIAL.on) return false;
  const p = u.p!;
  if (p.specialCd > 0 || (t.kind !== 'player' && t.kind !== 'boss')) return false;
  const mult = gearDashCost(u);
  const C = CLASSES[p.cls];
  // A finishing blow may empty the bar; otherwise keep a dodge.
  const keep = t.hp < t.maxHp * 0.25 ? 0 : MOVE.reserve;
  const hits = (kind: string) => !(t.p && tryDodge(t, u, kind)) && W.rand() < (t.kind === 'player' ? 0.85 : 0.97);
  if (p.cls === 'rogue') {
    const S = SPECIAL.rogue;
    if (d > S.lunge + S.reach || d < C.melee.range * 0.5 || !spend(u, S.cost * mult, keep)) return false;
    jump(u, t.x, t.z, S.lunge, S.reach * 0.6);
    if (dist(u, t) <= S.reach + 0.3 && hits('special')) damage(u, t, S.dmg, 'melee');
    p.specialCd = S.cd;
  } else if (p.cls === 'fighter') {
    const S = SPECIAL.fighter;
    if (d > S.reach || !spend(u, S.cost * mult, keep)) return false;
    u.atkT = Math.max(u.atkT, S.windup);
    later(S.windup, () => {
      if (!u.alive || u.stunT > 0) return;
      for (const e of W.units) {
        if (!e.alive || !hostile(u, e) || e.kind === 'decoy' || dist(u, e) > S.reach + 0.4) continue;
        if (e === t ? !hits('special') : W.rand() > 0.7) continue;
        damage(u, e, S.dmg, 'melee');
        push(e, u, S.push);
        stun(e, S.stun);
      }
    });
    p.specialCd = S.cd;
  } else if (p.cls === 'scout') {
    const S = SPECIAL.scout;
    // Sniper builds kick to make room; claw builds kick to stun.
    if (d > S.lunge + S.reach || !spend(u, S.cost * mult, keep)) return false;
    jump(u, t.x, t.z, S.lunge, S.reach * 0.6);
    if (dist(u, t) <= S.reach + 0.3 && hits('special')) {
      damage(u, t, S.dmg, 'melee');
      push(t, u, S.push);
      stun(t, S.stun);
    }
    p.specialCd = S.cd;
  } else {
    // Mage spell shield: when a burst lands in a player fight.
    const S = SPECIAL.mage;
    if (!t.p || d > 10 || p.hurt < u.maxHp * 0.12 || u.immuneT > 0 || !spend(u, S.cost * mult, 0)) return false;
    u.immuneT = S.shield;
    p.specialCd = S.cd;
  }
  p.specials++;
  return true;
}

hooks.dodge = (dst, src, kind) => tryDodge(dst, src, kind);
