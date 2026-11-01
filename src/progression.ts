import { CURRENCY, MAX_LEVEL, MAX_SKILLS, TOKEN_PRICE, XP_REWARD, XP_TO_NEXT, BOTS } from './balance';
import { G, PS, minutes, type Unit } from './core';
import { def, kit, learn, skillIds, skills, type Tier } from './kit';
import { random } from './random';

export type Card = { id: string; tier: Tier; isNew: boolean; cost: number; locked: string | null };

export const prog = {
  pending: 0,
  offer: null as Card[] | null,
  /** Match time (seconds) when each level was reached, for balancing. */
  levelTimes: [] as { level: number; t: number }[],
};

export function resetProgression() {
  prog.pending = 0;
  prog.offer = null;
  prog.levelTimes = [];
}

/** Totals per source, for balance checks. */
export const xpLog: Record<string, number> = {};
export const killLog: Record<string, number> = {};

export const xpNeeded = (level: number) => (level >= MAX_LEVEL ? 0 : XP_TO_NEXT[level - 1]);

export function grantXp(u: Unit, amount: number) {
  if (u.level >= MAX_LEVEL) return;
  u.xp += amount;
  while (u.level < MAX_LEVEL && u.xp >= xpNeeded(u.level)) {
    u.xp -= xpNeeded(u.level);
    u.level += 1;
    if (u === G.player) {
      G.player.maxHp += kit.stats.hpPerLevel;
      G.player.hp += kit.stats.hpPerLevel;
      prog.pending += 1;
      prog.levelTimes.push({ level: u.level, t: G.time });
    } else if (u.kind === 'bot') {
      u.maxHp += BOTS.hpPerLevel;
      u.hp += BOTS.hpPerLevel;
    }
  }
  if (u.level >= MAX_LEVEL) u.xp = 0;
}

/** XP (and currency for the player) for a kill. Decoy kills give nothing. */
export function rewardKill(killer: Unit | null, victim: Unit) {
  if (!killer || victim.kind === 'decoy' || victim.kind === 'pet' || (killer.kind !== 'player' && killer.kind !== 'bot')) return 0;
  const min = minutes();
  let xp = 0;
  let money = 0;
  if (victim.kind === 'mob') {
    xp = XP_REWARD.mob(min);
    if (random() < CURRENCY.mobChance) money = CURRENCY.mob;
  } else if (victim.kind === 'boss') {
    xp = XP_REWARD.boss(min);
    money = CURRENCY.boss;
  } else {
    xp = XP_REWARD.player(victim.level);
    money = CURRENCY.player;
  }
  grantXp(killer, xp);
  const key = `${killer.kind}<-${victim.kind}`;
  xpLog[key] = (xpLog[key] ?? 0) + xp;
  killLog[key] = (killLog[key] ?? 0) + 1;
  if (killer === G.player) {
    PS.currency += money;
    if (victim.kind === 'bot' || victim.kind === 'boss') PS.kills += 1;
  }
  return xp;
}

/** Tier 3 opens only after at least 3 skills reach tier 2 (design doc 2.3). */
export function tier3Open() {
  return skills.filter((s) => s.tier >= 2).length >= 3;
}

/** Three random choices: new skills (while under 5) and upgrades of owned ones. */
export function makeOffer(): Card[] {
  const options: Card[] = [];
  if (skills.length < MAX_SKILLS) {
    for (const id of skillIds()) if (!skills.some((s) => s.id === id)) options.push({ id, tier: 1, isNew: true, cost: 0, locked: null });
  }
  for (const s of skills) {
    if (s.tier === 1) options.push({ id: s.id, tier: 2, isNew: false, cost: 0, locked: null });
    else if (s.tier === 2 && tier3Open()) {
      options.push({ id: s.id, tier: 3, isNew: false, cost: TOKEN_PRICE, locked: PS.currency < TOKEN_PRICE ? `Token için ${TOKEN_PRICE} para gerekir` : null });
    }
  }
  // Shuffle and take 3.
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }
  return options.slice(0, 3);
}

export function currentOffer(): Card[] | null {
  if (prog.pending <= 0) return null;
  if (!prog.offer) prog.offer = makeOffer();
  // Re-check token prices (currency may have changed since the offer was made).
  for (const c of prog.offer) if (c.cost) c.locked = PS.currency < c.cost ? `Token için ${c.cost} para gerekir` : null;
  return prog.offer;
}

export function pickCard(i: number): boolean {
  const offer = currentOffer();
  const c = offer?.[i];
  if (!c || c.locked) return false;
  PS.currency -= c.cost;
  learn(c.id);
  prog.pending -= 1;
  prog.offer = null;
  return true;
}

export function cardText(c: Card) {
  const d = def(c.id);
  return { name: d.name, desc: d.desc, tier: d.tiers[c.tier - 1] };
}
