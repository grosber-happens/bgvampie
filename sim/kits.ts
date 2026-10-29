/**
 * The 40 class skills, with the numbers used in the game (src/rogue.ts, src/mage.ts,
 * src/fighter.ts, src/scout.ts). Each skill says when a simulated player uses it and
 * what it does in the simplified 2D fight.
 */
import { CLASSES, PASSIVES, type ClassId } from './config.ts';
import {
  W,
  aoe,
  damage,
  dist,
  dot,
  heal,
  hitChance,
  hostile,
  jump,
  later,
  makeUnit,
  moveAway,
  slow,
  stun,
  type OwnedSkill,
  type Unit,
} from './core.ts';

export type Ctx = {
  u: Unit;
  /** Current enemy (player, mob or boss), or null. */
  t: Unit | null;
  d: number;
  tier: number;
  s: OwnedSkill;
  /** The player is running away. */
  flee: boolean;
};

export type SkillDef = {
  id: string;
  cls: ClassId;
  name: string;
  cd: (tier: number) => number;
  charges?: (tier: number) => number;
  /** Spends a Mage nano orb. */
  orb?: boolean;
  /** How much the AI likes picking this card (combat value guess). */
  w: number;
  /** Cast if useful now; returns false when nothing happened. */
  use: (c: Ctx) => boolean;
};

const by = (t: number, a: [number, number, number]) => a[Math.max(0, Math.min(2, t - 1))];
const isPlayer = (u: Unit | null) => !!u && u.kind === 'player';
const roll = (c: number) => W.rand() < c;
/** Skill shot: rolls the hit chance and runs `fx` on hit. */
function shot(c: Ctx, range: number, acc: number, fx: (t: Unit) => void): boolean {
  if (!c.t || c.d > range) return false;
  if (roll(hitChance(c.u, c.t, c.d, range, acc))) fx(c.t);
  return true;
}
/** Ground skills (mines, rain, traps): players walk out of them sometimes. */
const groundChance = (t: Unit, base: number) => (t.kind === 'player' ? base * (t.stunT > 0 ? 1.6 : 1) : 0.95);

export function spawnPet(owner: Unit, name: string, opts: { hp: number; dmg: number; rate: number; range: number; life: number; speed?: number; kind?: 'pet' | 'decoy'; stunEvery?: number }): Unit {
  return makeUnit(opts.kind ?? 'pet', name, owner.x + (W.rand() - 0.5) * 2, owner.z + (W.rand() - 0.5) * 2, opts.hp, {
    owner,
    dmg: opts.dmg,
    rate: opts.rate,
    range: opts.range,
    life: opts.life,
    speed: opts.speed ?? 8,
    stunEvery: opts.stunEvery ?? 0,
    target: owner.target,
  });
}

export const decoysOf = (u: Unit) => W.units.filter((x) => x.alive && x.kind === 'decoy' && x.owner === u);
const tierOf = (u: Unit, id: string) => u.p!.skills.find((s) => s.id === id)?.tier ?? 0;

// ---- Rogue ----------------------------------------------------------------
const R = {
  invis: { dur: [3, 4.5, 4.5] as [number, number, number] },
  evasion: { dur: [2.5, 4, 5.5] as [number, number, number], immune: 2, dr: 0.5 },
  decoy: { life: 8, insaneLife: 12, hp: 30, max: 3 },
  poison: { slow: [0.3, 0.4, 0.4] as [number, number, number], dps: [6, 10, 10] as [number, number, number], coat: 6, boost: 5 },
  sprint: { dur: 4, mult: 1.45, haste: 1.35 },
  kidney: { stun: [0.55, 0.55, 1] as [number, number, number], range: 2.8, damage: 10 },
  execute: { damage: [70, 95, 95] as [number, number, number], missing: 0.4, bossCap: 150, range: 55 },
  wink: { range: [12, 16, 20] as [number, number, number], stun: 0.25 },
  detonate: { radius: [3.5, 4.5, 4.5] as [number, number, number], damage: 55 },
  insane: { share: 0.3, fireFor: 2, rate: 0.4, range: 16 },
};

export function makeDecoy(u: Unit, life: number) {
  const ds = decoysOf(u);
  if (ds.length >= R.decoy.max) ds[0].alive = false;
  const insane = tierOf(u, 'insane');
  return spawnPet(u, 'Kopya', { kind: 'decoy', hp: R.decoy.hp, dmg: 0, rate: 1, range: 0, life: insane >= 2 ? R.decoy.insaneLife : life, speed: 7 });
}

const ROGUE: SkillDef[] = [
  {
    id: 'invis', cls: 'rogue', name: 'Görünmezlik', w: 0.8, cd: () => 14,
    use: (c) => {
      // Needs 2 s out of combat: used to escape a chase or to sneak up.
      if (W.time - c.u.lastCombat < 2) return false;
      if (!(c.flee || (c.t && isPlayer(c.t) && c.d > 6))) return false;
      c.u.stealthT = by(c.tier, R.invis.dur);
      return true;
    },
  },
  {
    id: 'evasion', cls: 'rogue', name: 'Evasion', w: 1, cd: () => 12,
    use: (c) => {
      if (!c.t || c.u.hp > c.u.maxHp * 0.7 || W.time - c.u.lastCombat > 1) return false;
      c.u.drT = by(c.tier, R.evasion.dur);
      c.u.drAmt = R.evasion.dr;
      if (c.tier >= 3) c.u.immuneT = R.evasion.immune;
      return true;
    },
  },
  {
    id: 'decoy', cls: 'rogue', name: 'Kopya yerleştirme', w: 1, cd: (t) => by(t, [9, 6, 6]),
    use: (c) => {
      if (!c.t || c.d > 30) return false;
      makeDecoy(c.u, R.decoy.life);
      return true;
    },
  },
  {
    id: 'poison', cls: 'rogue', name: 'Poison', w: 1, cd: () => 12,
    use: (c) => {
      if (!c.t || c.d > 30) return false;
      if (c.tier >= 3) c.u.p!.poisonBoostT = R.poison.boost;
      else c.u.p!.poisonCoatT = R.poison.coat;
      return true;
    },
  },
  {
    id: 'sprint', cls: 'rogue', name: 'Sprint', w: 0.7, cd: (t) => by(t, [10, 7, 7]), charges: (t) => (t >= 2 ? 2 : 1),
    use: (c) => {
      const chase = c.t && c.u.p!.melee && c.d > 4 && c.d < 25;
      if (!(c.flee || chase)) return false;
      c.u.speedT = R.sprint.dur;
      c.u.speedAmt = R.sprint.mult;
      if (c.tier >= 3) {
        c.u.hasteT = R.sprint.dur;
        c.u.hasteAmt = R.sprint.haste;
      }
      return true;
    },
  },
  {
    id: 'kidney', cls: 'rogue', name: 'Kidney shot', w: 1, cd: (t) => by(t, [12, 9, 9]),
    use: (c) => {
      if (!c.t || c.d > R.kidney.range || c.t.kind === 'mob') return false;
      damage(c.u, c.t, R.kidney.damage, 'skill');
      stun(c.t, by(c.tier, R.kidney.stun));
      return true;
    },
  },
  {
    id: 'execute', cls: 'rogue', name: 'Execute', w: 1.2, cd: () => 10,
    use: (c) => {
      if (!c.t || c.d > R.execute.range) return false;
      // Best on a hurt target.
      if (c.t.kind === 'mob' && c.t.hp < 60) return false;
      if (isPlayer(c.t) && c.t.hp > c.t.maxHp * 0.7 && W.rand() < 0.7) return false;
      return shot(c, R.execute.range, 1.1, (t) => {
        let dmg = by(c.tier, R.execute.damage) + R.execute.missing * (t.maxHp - t.hp);
        if (t.kind === 'boss') dmg = Math.min(dmg, R.execute.bossCap);
        damage(c.u, t, dmg, 'skill');
        if (c.tier >= 3 && !t.alive) c.s.cd = 0.01;
      });
    },
  },
  {
    id: 'wink', cls: 'rogue', name: 'Wink', w: 1.2, cd: (t) => by(t, [9, 7, 6]),
    use: (c) => {
      if (!c.t || c.d < 3.5 || c.d > by(c.tier, R.wink.range) || !c.u.p!.melee) return false;
      jump(c.u, c.t.x, c.t.z, 99, 1.2);
      c.u.backstabT = 1.5;
      if (c.tier >= 3) stun(c.t, R.wink.stun);
      return true;
    },
  },
  {
    id: 'detonate', cls: 'rogue', name: 'Detonate', w: 0.9, cd: (t) => by(t, [11, 8, 8]),
    use: (c) => {
      const ds = decoysOf(c.u);
      if (!c.t || !ds.length) return false;
      const r = by(c.tier, R.detonate.radius);
      const near = ds.filter((d) => W.units.some((e) => hostile(c.u, e) && e.kind !== 'decoy' && dist(d, e) <= r));
      if (!near.length) return false;
      for (const d of c.tier >= 3 ? ds : [near[0]]) {
        aoe(c.u, d.x, d.z, r, R.detonate.damage, 'aoe', undefined, 0.8);
        d.alive = false;
      }
      return true;
    },
  },
  {
    id: 'insane', cls: 'rogue', name: 'Insane', w: 0.8, cd: () => 12,
    use: (c) => {
      const ds = decoysOf(c.u);
      if (!c.t || !ds.length) return false;
      const gun = CLASSES.rogue.ranged;
      const share = R.insane.share;
      for (const d of ds) {
        d.dmg = gun.dmg * share;
        d.rate = R.insane.rate;
        d.range = R.insane.range;
        d.target = c.t;
        d.life = Math.min(d.life, R.insane.fireFor + 2);
      }
      return true;
    },
  },
];

// ---- Mage -----------------------------------------------------------------
const M = {
  sonic: { range: 8, push: [4, 6, 6] as [number, number, number], damage: 18, stun: 0.5 },
  bombs: { count: [1, 2, 2] as [number, number, number], damage: 40, radius: 2.6, speed: 10, dust: { slow: 0.4, t: 3 } },
  fog: { dur: 7 },
  sunray: { dur: [3, 5, 5] as [number, number, number], dps: 30, range: 22 },
  nanobots: { dps: 12, dur: [5, 8, 8] as [number, number, number], range: 28, jump: 10 },
  blink: { range: [10, 13, 13] as [number, number, number] },
  armor: { shield: 40, dur: 6, radius: 4, damage: [30, 50, 50] as [number, number, number] },
  arms: { dur: 8, every: [0.7, 0.5, 0.5] as [number, number, number], damage: [14, 20, 20] as [number, number, number], reach: 3 },
  gravity: { lift: [1.2, 1.6, 1.6] as [number, number, number], damage: [35, 55, 55] as [number, number, number], range: 26, splash: 4 },
  mines: { max: 2, damage: [45, 65, 65] as [number, number, number], radius: 3, range: 22 },
};

const MAGE: SkillDef[] = [
  {
    id: 'sonic', cls: 'mage', name: 'Sonic boom', w: 0.8, cd: () => 9,
    use: (c) => {
      if (!c.t || c.d > M.sonic.range || c.u.p!.melee) return false;
      if (!(c.d < 4 || c.flee)) return false;
      aoe(c.u, c.t.x, c.t.z, 3, M.sonic.damage, 'skill', (e) => {
        const d = Math.max(0.1, dist(c.u, e));
        jump(e, e.x + ((e.x - c.u.x) / d) * 20, e.z + ((e.z - c.u.z) / d) * 20, by(c.tier, M.sonic.push));
        if (c.tier >= 3 && W.rand() < 0.35) stun(e, M.sonic.stun);
      });
      return true;
    },
  },
  {
    id: 'bombs', cls: 'mage', name: 'Suicide bombs', w: 1.1, orb: true, cd: () => 4,
    use: (c) => {
      if (!c.t || c.d > 25) return false;
      const t = c.t;
      for (let i = 0; i < by(c.tier, M.bombs.count); i++)
        later(c.d / M.bombs.speed + 0.2 * i, () => {
          if (!t.alive || !c.u.alive) return;
          if (W.rand() < groundChance(t, 0.7))
            aoe(c.u, t.x, t.z, M.bombs.radius, M.bombs.damage, 'aoe', c.tier >= 3 ? (e) => slow(e, M.bombs.dust.slow, M.bombs.dust.t) : undefined);
        });
      return true;
    },
  },
  {
    id: 'fog', cls: 'mage', name: 'Sis', w: 0.6, cd: () => 20,
    use: (c) => {
      if (!(c.flee || (c.t && isPlayer(c.t) && c.d > 10 && c.u.hp < c.u.maxHp * 0.6))) return false;
      c.u.fogT = M.fog.dur * 0.7;
      if (c.tier >= 3) c.u.p!.orbT += 4;
      return true;
    },
  },
  {
    id: 'sunray', cls: 'mage', name: 'Sunray', w: 1.1, orb: true, cd: () => 10,
    use: (c) => {
      if (!c.t || c.d > M.sunray.range + 4 || (c.t.kind === 'mob' && c.t.hp < 80)) return false;
      const dur = by(c.tier, M.sunray.dur);
      const bot = spawnPet(c.u, 'Sunray', { hp: 40, dmg: M.sunray.dps * 0.25, rate: 0.25, range: M.sunray.range, life: dur, speed: 0 });
      bot.target = c.t;
      bot.stunEvery = c.tier >= 3 ? -1 : 0;
      return true;
    },
  },
  {
    id: 'nanobots', cls: 'mage', name: 'Nano bots', w: 1, orb: true, cd: () => 8,
    use: (c) =>
      !!c.t && (c.t.kind !== 'mob' || c.t.hp > 50) &&
      shot(c, M.nanobots.range, 1.1, (t) => {
        const dur = by(c.tier, M.nanobots.dur);
        dot(t, c.u, M.nanobots.dps, dur, 'nanobots');
        if (c.tier >= 3)
          W.onKill.push(function hop(v) {
            if (v !== t) return;
            W.onKill.splice(W.onKill.indexOf(hop), 1);
            const n = W.units.find((e) => hostile(c.u, e) && e.kind !== 'decoy' && dist(e, v) < M.nanobots.jump);
            if (n) dot(n, c.u, M.nanobots.dps, dur * 0.6, 'nanobots');
          });
      }),
  },
  {
    id: 'blink', cls: 'mage', name: 'Blink', w: 0.8, cd: (t) => by(t, [8, 6, 6]), charges: (t) => (t >= 3 ? 2 : 1),
    use: (c) => {
      const r = by(c.tier, M.blink.range);
      if (c.flee && c.t) {
        moveAway(c.u, c.t, 0);
        const d = Math.max(0.1, c.d);
        jump(c.u, c.u.x + ((c.u.x - c.t.x) / d) * 50, c.u.z + ((c.u.z - c.t.z) / d) * 50, r);
        return true;
      }
      if (c.t && c.u.p!.melee && c.d > 4 && c.d < r + 3) {
        jump(c.u, c.t.x, c.t.z, r, 1.5);
        return true;
      }
      if (c.t && !c.u.p!.melee && c.d < 4 && isPlayer(c.t)) {
        jump(c.u, c.u.x + (c.u.x - c.t.x) * 10, c.u.z + (c.u.z - c.t.z) * 10, r);
        return true;
      }
      return false;
    },
  },
  {
    id: 'armor', cls: 'mage', name: 'Nano zırh', w: 1, orb: true, cd: () => 14,
    use: (c) => {
      if (!c.t || W.time - c.u.lastCombat > 1 || c.u.hp > c.u.maxHp * 0.8) return false;
      c.u.shield = Math.max(c.u.shield, M.armor.shield);
      c.u.shieldT = M.armor.dur;
      const u = c.u;
      const dmg = by(c.tier, M.armor.damage);
      const boom = () => {
        if (!u.alive) return;
        const n = aoe(u, u.x, u.z, M.armor.radius, dmg, 'aoe');
        if (c.tier >= 3) u.p!.orbs = Math.min(PASSIVES.mage.orbs(u.p!.level), u.p!.orbs + n);
      };
      // It blows up when it breaks or runs out; assume half way on average.
      later(M.armor.dur * 0.6, boom);
      return true;
    },
  },
  {
    id: 'arms', cls: 'mage', name: 'Nano kollar', w: 1.1, orb: true, cd: () => 12,
    use: (c) => {
      if (!c.t || c.d > 10) return false;
      const arm = spawnPet(c.u, 'Nano kol', { hp: 9999, dmg: by(c.tier, M.arms.damage), rate: by(c.tier, M.arms.every), range: M.arms.reach, life: M.arms.dur, speed: 99, stunEvery: c.tier >= 3 ? 3 : 0 });
      arm.target = c.t;
      // Arms stay at the mage's side: they cannot be attacked.
      arm.immuneT = 999;
      return true;
    },
  },
  {
    id: 'gravity', cls: 'mage', name: 'Gravity', w: 1.1, cd: () => 12,
    use: (c) =>
      !!c.t && (c.t.kind !== 'mob' || c.t.hp > 60) &&
      shot(c, M.gravity.range, 1.15, (t) => {
        const lift = by(c.tier, M.gravity.lift);
        stun(t, lift);
        later(lift, () => {
          if (!t.alive) return;
          damage(c.u, t, by(c.tier, M.gravity.damage), 'skill');
          if (c.tier >= 3) aoe(c.u, t.x, t.z, M.gravity.splash, by(c.tier, M.gravity.damage) * 0.5, 'aoe');
        });
      }),
  },
  {
    id: 'mines', cls: 'mage', name: 'Lazer mayınları', w: 1, cd: () => 6, charges: () => M.mines.max,
    use: (c) => {
      if (!c.t || c.d > M.mines.range) return false;
      const t = c.t;
      later(1 + W.rand(), () => {
        if (!t.alive || !c.u.alive) return;
        if (W.rand() < groundChance(t, c.tier >= 3 ? 0.75 : 0.5)) aoe(c.u, t.x, t.z, M.mines.radius, by(c.tier, M.mines.damage), 'aoe');
      });
      return true;
    },
  },
];

// ---- Fighter --------------------------------------------------------------
const F = {
  second: { dur: [5, 7, 7] as [number, number, number], rate: [0.6, 0.45, 0.45] as [number, number, number], wave: 15 },
  rain: { radius: [3.5, 5, 5] as [number, number, number], damage: [40, 60, 60] as [number, number, number], delay: 0.6, range: 32, spikes: { t: 3, slow: 0.4, dps: 6 } },
  eshield: { dur: [3, 5, 5] as [number, number, number], hp: [80, 80, 140] as [number, number, number], share: 0.7, range: 8 },
  chain: { range: [16, 20, 20] as [number, number, number], damage: 15, slow: 0.5 },
  pierce: { damage: [60, 80, 80] as [number, number, number], range: 40, pin: 0.25 },
  charge: { dist: [9, 12, 12] as [number, number, number], damage: 25, stun: 0.6 },
  leap: { dist: [10, 13, 13] as [number, number, number], damage: [35, 55, 55] as [number, number, number], radius: 4, lift: 0.6 },
  whirl: { dur: [2.5, 3.5, 3.5] as [number, number, number], damage: [12, 18, 18] as [number, number, number], every: 0.3, radius: 3 },
  overpower: { dur: [5, 7, 7] as [number, number, number], dmg: 0.3, lifesteal: [0.1, 0.2, 0.2] as [number, number, number] },
  recall: { damage: [25, 40, 40] as [number, number, number], slow: 0.4 },
};

const FIGHTER: SkillDef[] = [
  {
    id: 'second', cls: 'fighter', name: 'İkinci kılıç', w: 1.1, cd: () => 14,
    use: (c) => {
      if (!c.t || c.d > 6) return false;
      const p = c.u.p!;
      p.secondT = by(c.tier, F.second.dur);
      p.secondRate = by(c.tier, F.second.rate);
      p.secondWave = c.tier >= 3;
      return true;
    },
  },
  {
    id: 'rain', cls: 'fighter', name: 'Mızrak yağmuru', w: 1.1, cd: () => 12,
    use: (c) => {
      if (!c.t || c.d > F.rain.range) return false;
      const t = c.t;
      const x = t.x;
      const z = t.z;
      later(F.rain.delay, () => {
        if (!c.u.alive) return;
        aoe(c.u, x, z, by(c.tier, F.rain.radius), by(c.tier, F.rain.damage), 'aoe', c.tier >= 3 ? (e) => (slow(e, F.rain.spikes.slow, F.rain.spikes.t), dot(e, c.u, F.rain.spikes.dps, F.rain.spikes.t, 'spikes')) : undefined, 0.6);
      });
      return true;
    },
  },
  {
    id: 'eshield', cls: 'fighter', name: 'Enerji kalkanı', w: 0.9, cd: () => 14,
    use: (c) => {
      if (!c.t || c.d < 5 || W.time - c.u.lastCombat > 1) return false;
      const p = c.u.p!;
      p.eshieldT = by(c.tier, F.eshield.dur);
      p.eshieldHp = by(c.tier, F.eshield.hp);
      p.eshieldStored = 0;
      p.eshieldWave = c.tier >= 3;
      const u = c.u;
      later(p.eshieldT, () => {
        if (!u.alive || !p.eshieldWave || !u.target) return;
        if (dist(u, u.target) < F.eshield.range) damage(u, u.target, p.eshieldStored * F.eshield.share, 'skill');
      });
      return true;
    },
  },
  {
    id: 'chain', cls: 'fighter', name: 'Zincirli mızrak', w: 1, cd: (t) => by(t, [10, 7, 7]),
    use: (c) => {
      if (!c.t || c.d < 5 || c.t.kind === 'boss' || !c.u.p!.melee) return false;
      return shot(c, by(c.tier, F.chain.range), 0.9, (t) => {
        damage(c.u, t, F.chain.damage, 'skill');
        jump(t, c.u.x, c.u.z, 99, 1.5);
        if (c.tier >= 3) slow(t, F.chain.slow, 1);
      });
    },
  },
  {
    id: 'pierce', cls: 'fighter', name: 'Delici mızrak', w: 1, cd: (t) => by(t, [11, 8, 8]),
    use: (c) =>
      !!c.t && c.d > 4 &&
      shot(c, F.pierce.range, 0.9, (t) => {
        damage(c.u, t, by(c.tier, F.pierce.damage), 'skill');
        if (W.rand() < 0.3) stun(t, F.pierce.pin);
        // It goes through: one more enemy behind sometimes.
        const behind = W.units.find((e) => e !== t && hostile(c.u, e) && e.kind !== 'decoy' && dist(e, t) < 3);
        if (behind) damage(c.u, behind, by(c.tier, F.pierce.damage), 'skill');
      }),
  },
  {
    id: 'charge', cls: 'fighter', name: 'Hücum', w: 1, cd: (t) => by(t, [10, 7, 7]), charges: (t) => (t >= 3 ? 2 : 1),
    use: (c) => {
      if (!c.t || c.d < 4 || c.d > by(c.tier, F.charge.dist) + 2) return false;
      jump(c.u, c.t.x, c.t.z, by(c.tier, F.charge.dist), 1.2);
      if (dist(c.u, c.t) < 2.5) {
        damage(c.u, c.t, F.charge.damage, 'skill');
        stun(c.t, F.charge.stun);
      }
      return true;
    },
  },
  {
    id: 'leap', cls: 'fighter', name: 'Jet sıçrayışı', w: 1, cd: () => 12,
    use: (c) => {
      if (!c.t || c.d > by(c.tier, F.leap.dist) + 2) return false;
      if (c.d < 3 && c.t.kind === 'player' && W.rand() < 0.5) return false;
      jump(c.u, c.t.x, c.t.z, by(c.tier, F.leap.dist), 0.5);
      aoe(c.u, c.u.x, c.u.z, F.leap.radius, by(c.tier, F.leap.damage), 'aoe', c.tier >= 3 ? (e) => stun(e, F.leap.lift) : undefined, 0.85);
      return true;
    },
  },
  {
    id: 'whirl', cls: 'fighter', name: 'Kılıç kasırgası', w: 1.1, cd: () => 11,
    use: (c) => {
      if (!c.t || c.d > 3) return false;
      const p = c.u.p!;
      p.whirlT = by(c.tier, F.whirl.dur);
      p.whirlDmg = by(c.tier, F.whirl.damage);
      if (c.tier < 3) slow(c.u, 0.5, p.whirlT);
      return true;
    },
  },
  {
    id: 'overpower', cls: 'fighter', name: 'Aşırı güç', w: 1, cd: () => 18,
    use: (c) => {
      if (!c.t || c.d > 8 || (c.t.kind === 'mob' && c.t.hp < 100)) return false;
      const d = by(c.tier, F.overpower.dur);
      c.u.dmgBuffT = d;
      c.u.dmgBuffAmt = F.overpower.dmg;
      c.u.lsBuffT = d;
      c.u.lsBuffAmt = by(c.tier, F.overpower.lifesteal);
      if (c.tier >= 3) {
        c.u.stunT = 0;
        c.u.slowT = 0;
      }
      return true;
    },
  },
  {
    id: 'recall', cls: 'fighter', name: 'Mızrak geri çağırma', w: 0.9, cd: (t) => by(t, [10, 7, 7]),
    use: (c) =>
      !!c.t && c.d < 25 &&
      shot(c, 25, 0.9, (t) => {
        damage(c.u, t, by(c.tier, F.recall.damage), 'skill');
        if (c.tier >= 3) slow(t, F.recall.slow, 2);
        c.u.ammo = CLASSES.fighter.ranged.mag!;
      }),
  },
];

// ---- Scout ----------------------------------------------------------------
const S = {
  shotgun: { blasts: [2, 2, 4] as [number, number, number], pellets: 6, damage: 8, range: 12 },
  hook: { range: [18, 24, 24] as [number, number, number] },
  fast: { shots: [1, 1, 2] as [number, number, number] },
  smoke: { range: 22, radius: 4, damage: [25, 40, 40] as [number, number, number], dur: 8 },
  pack: { count: [1, 2, 2] as [number, number, number] },
  hunt: { dur: [6, 9, 9] as [number, number, number], bonus: [0.2, 0.3, 0.3] as [number, number, number], range: 45 },
  pounce: { range: [10, 13, 13] as [number, number, number], damage: [30, 45, 45] as [number, number, number], down: 0.5 },
  rend: { hits: [5, 7, 7] as [number, number, number], damage: 8, bleed: 8, bleedT: 4 },
  drone: { dur: [10, 15, 15] as [number, number, number] },
  trap: { max: [2, 3, 3] as [number, number, number], root: [1.5, 2.2, 2.2] as [number, number, number], damage: 10, range: 16 },
};

export function spawnBeast(u: Unit, name = 'Yoldaş'): Unit {
  const P = PASSIVES.scout;
  return spawnPet(u, name, { hp: P.beastHp + 8 * (u.p!.level - 1), dmg: P.beastDmg, rate: P.beastRate, range: 2, life: Infinity, speed: 9.5 });
}

const SCOUT: SkillDef[] = [
  {
    id: 'shotgun', cls: 'scout', name: 'Switch weapons', w: 1.1, cd: (t) => by(t, [9, 6, 6]),
    use: (c) => {
      if (!c.t || c.d > 8) return false;
      const t = c.t;
      const per = Math.max(0.2, 1 - c.d / S.shotgun.range);
      for (let b = 0; b < by(c.tier, S.shotgun.blasts); b++)
        later(0.25 * b, () => {
          if (!t.alive) return;
          let hits = 0;
          for (let i = 0; i < S.shotgun.pellets; i++) if (W.rand() < per * (c.u.p!.aim + 0.25)) hits++;
          damage(c.u, t, hits * S.shotgun.damage, 'skill');
        });
      return true;
    },
  },
  {
    id: 'hook', cls: 'scout', name: 'Kanca', w: 0.9, cd: (t) => by(t, [10, 7, 7]), charges: (t) => (t >= 3 ? 2 : 1),
    use: (c) => {
      const r = by(c.tier, S.hook.range);
      if (c.flee && c.t) {
        const d = Math.max(0.1, c.d);
        jump(c.u, c.u.x + ((c.u.x - c.t.x) / d) * 50, c.u.z + ((c.u.z - c.t.z) / d) * 50, r);
        c.u.highT = 6;
        return true;
      }
      if (c.t && isPlayer(c.t) && !c.u.p!.melee && c.d < c.u.p!.wantRange - 6) {
        const d = Math.max(0.1, c.d);
        jump(c.u, c.u.x + ((c.u.x - c.t.x) / d) * 50, c.u.z + ((c.u.z - c.t.z) / d) * 50, r * 0.7);
        c.u.highT = 6;
        return true;
      }
      return false;
    },
  },
  {
    id: 'fast', cls: 'scout', name: 'Fast charge', w: 1.1, cd: (t) => by(t, [12, 9, 9]),
    use: (c) => {
      if (!c.t || c.d > CLASSES.scout.ranged.range || (c.t.kind === 'mob' && c.t.hp < 60)) return false;
      const sn = CLASSES.scout.ranged;
      for (let i = 0; i < by(c.tier, S.fast.shots); i++)
        later(0.35 * i, () => {
          if (c.t && c.t.alive && W.rand() < hitChance(c.u, c.t, dist(c.u, c.t), sn.range, sn.acc! * 1.1)) damage(c.u, c.t, sn.dmg, 'ranged');
        });
      return true;
    },
  },
  {
    id: 'smoke', cls: 'scout', name: 'Smoke bomb', w: 0.8, cd: () => 14,
    use: (c) => {
      if (!c.t || c.d > S.smoke.range) return false;
      if (c.flee) {
        c.u.smokeT = 3;
        aoe(c.u, c.u.x, c.u.z, S.smoke.radius, by(c.tier, S.smoke.damage));
        return true;
      }
      if (!isPlayer(c.t) && c.t.kind !== 'mob') return false;
      aoe(c.u, c.t.x, c.t.z, S.smoke.radius, by(c.tier, S.smoke.damage), 'aoe', (e) => (e.smokeT = c.tier >= 3 ? 0 : 2), 0.85);
      return true;
    },
  },
  {
    id: 'pack', cls: 'scout', name: 'Sürü çağrısı', w: 1.1, cd: () => 25,
    use: (c) => {
      if (!c.t) return false;
      const mine = W.units.filter((x) => x.alive && x.owner === c.u && x.name === 'Sürü');
      for (const m of mine) m.hp = m.maxHp;
      for (let i = mine.length; i < by(c.tier, S.pack.count); i++) spawnBeast(c.u, 'Sürü');
      if (c.tier >= 3) {
        const p = c.u.p!;
        if (!p.beast || !p.beast.alive) {
          p.beast = spawnBeast(c.u);
          p.beastWait = 0;
        }
        for (const x of W.units) if (x.alive && (x === c.u || x.owner === c.u)) (x.speedT = 5), (x.speedAmt = 1.2);
      }
      return true;
    },
  },
  {
    id: 'hunt', cls: 'scout', name: 'Av emri', w: 0.9, cd: () => 14,
    use: (c) => {
      if (!c.t || c.d > S.hunt.range || (c.t.kind === 'mob' && c.t.hp < 100)) return false;
      c.t.markT = by(c.tier, S.hunt.dur);
      c.t.markAmt = by(c.tier, S.hunt.bonus);
      return true;
    },
  },
  {
    id: 'pounce', cls: 'scout', name: 'Pençe atılması', w: 1.1, cd: () => 9,
    use: (c) => {
      if (!c.t || c.d < 3 || c.d > by(c.tier, S.pounce.range) || !c.u.p!.melee) return false;
      jump(c.u, c.t.x, c.t.z, 99, 1);
      damage(c.u, c.t, by(c.tier, S.pounce.damage), 'skill');
      if (c.tier >= 3) stun(c.t, S.pounce.down);
      return true;
    },
  },
  {
    id: 'rend', cls: 'scout', name: 'Parçalama', w: 1, cd: () => 10,
    use: (c) => {
      if (!c.t || c.d > 2.6) return false;
      const t = c.t;
      for (let i = 0; i < by(c.tier, S.rend.hits); i++) later(0.15 * i, () => t.alive && damage(c.u, t, S.rend.damage, 'melee'));
      dot(t, c.u, S.rend.bleed, S.rend.bleedT, 'bleed');
      if (c.tier >= 3) t.noHealT = S.rend.bleedT;
      return true;
    },
  },
  {
    id: 'drone', cls: 'scout', name: 'Gözcü drone', w: 0.5, cd: () => 20,
    use: (c) => {
      // Mostly vision. In the sim: a short aim bonus, and at tier 3 a mark.
      if (!c.t || !isPlayer(c.t)) return false;
      c.u.p!.aim = Math.min(0.95, c.u.p!.aim + 0.0001);
      if (c.tier >= 3) {
        c.t.markT = 4;
        c.t.markAmt = 0.2;
      }
      return true;
    },
  },
  {
    id: 'trap', cls: 'scout', name: 'Elektrik tuzağı', w: 0.9, cd: () => 8, charges: (t) => by(t, S.trap.max),
    use: (c) => {
      if (!c.t || c.d > S.trap.range) return false;
      const t = c.t;
      later(0.8 + W.rand(), () => {
        if (!t.alive || !c.u.alive) return;
        if (W.rand() < groundChance(t, 0.45)) {
          damage(c.u, t, S.trap.damage, 'skill');
          stun(t, by(c.tier, S.trap.root));
        }
      });
      return true;
    },
  },
];

export const SKILLS: Record<string, SkillDef> = Object.fromEntries([...ROGUE, ...MAGE, ...FIGHTER, ...SCOUT].map((s) => [s.id, s]));
export const POOL: Record<ClassId, string[]> = {
  rogue: ROGUE.map((s) => s.id),
  mage: MAGE.map((s) => s.id),
  fighter: FIGHTER.map((s) => s.id),
  scout: SCOUT.map((s) => s.id),
};

/** Playstyles: the starting skill and the weapon the player prefers. */
export const STYLES: Record<ClassId, { id: string; skill: string; melee: boolean; range: number }[]> = {
  rogue: [
    { id: 'yakın', skill: 'wink', melee: true, range: 0 },
    { id: 'uzak', skill: 'execute', melee: false, range: 15 },
    { id: 'aldatmaca', skill: 'decoy', melee: false, range: 14 },
  ],
  mage: [
    { id: 'nano', skill: 'arms', melee: true, range: 0 },
    { id: 'lazer', skill: 'mines', melee: false, range: 20 },
    { id: 'yerçekimi', skill: 'gravity', melee: false, range: 20 },
  ],
  fighter: [
    { id: 'çift kılıç', skill: 'second', melee: true, range: 0 },
    { id: 'mızrakçı', skill: 'rain', melee: false, range: 18 },
    { id: 'kale', skill: 'eshield', melee: true, range: 0 },
  ],
  scout: [
    { id: 'sürü', skill: 'pack', melee: false, range: 25 },
    { id: 'vahşi', skill: 'pounce', melee: true, range: 0 },
    { id: 'nişancı', skill: 'fast', melee: false, range: 40 },
  ],
};

export { heal };
