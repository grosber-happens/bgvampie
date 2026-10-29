import { Color3 } from '@babylonjs/core/Maths/math.color';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { createActorBody, forwardFromYaw } from './actors';
import { createCharacterBody, createHippoBody } from './characters';
import { BACKSTAB, DAGGERS, GUN, ROGUE, SHADOW_TRAIL } from './balance';
import {
  G,
  PS,
  chest,
  dealDamage,
  faceTowards,
  fireBullet,
  flatDist,
  hostile,
  inCombat,
  isBehind,
  lineFx,
  lineOfSight,
  makeUnit,
  moveUnit,
  rayHitUnit,
  removeUnit,
  ringFx,
  spawnFx,
  type Unit,
} from './core';
import { addShake, kick, muzzleFlash, sfx } from './feel';
import { attachGun } from './gun';
import {
  aimedShotDir,
  behind,
  byTier,
  host,
  meleeTarget,
  ownedTier,
  puff,
  refund,
  registerKit,
  slash,
  sweep,
  targetUnderCrosshair,
  updateCooldowns,
  weaponPart,
  type ClassKit,
  type OwnedSkill,
  type SkillDef,
  type Weapon,
  enemiesNear,
} from './kit';

export type SkillId = 'invis' | 'evasion' | 'decoy' | 'poison' | 'sprint' | 'kidney' | 'execute' | 'wink' | 'detonate' | 'insane';

export const NUM = {
  invis: { dur: [3, 4.5, 4.5] as [number, number, number] },
  evasion: { dur: [2.5, 4, 5.5] as [number, number, number], immune: 2 },
  decoy: { life: 8, insaneLife: 12, hp: 30, max: 3 },
  poison: { slow: [0.3, 0.4, 0.4] as [number, number, number], dps: [6, 10, 10] as [number, number, number], coat: 6, boost: 5 },
  sprint: { dur: 4, mult: 1.45, haste: 1.35 },
  kidney: { stun: [0.55, 0.55, 1] as [number, number, number], range: 2.8, damage: 10 },
  execute: { damage: [70, 95, 95] as [number, number, number], missing: 0.4, bossCap: 150, range: 55 },
  wink: { range: [12, 16, 20] as [number, number, number], stun: 0.25 },
  detonate: { radius: [3.5, 4.5, 4.5] as [number, number, number], damage: 55 },
  insane: { share: 0.3, fireFor: 2, rate: 0.4, range: 16 },
};

const decoys = () => G.units.filter((u) => u.kind === 'decoy' && u.owner === G.player);
const noDecoy = () => (decoys().length ? null : 'Kopya yok');

export const SKILLS: Record<SkillId, SkillDef> = {
  invis: {
    id: 'invis',
    name: 'Görünmezlik',
    desc: 'Görünmez olursun. Saldırınca bozulur, rakibe çok yaklaşınca silik görünürsün. Önce 2 sn hasar almamış ve vermemiş olmalısın.',
    tiers: ['3 sn görünmezlik', 'Süre 4.5 sn', 'Savaş dışında sürekli yarı siliksin. Yetenek tam görünmez yapar'],
    cooldown: () => 14,
    blocked: () => (inCombat(G.player) ? 'Savaştasın' : null),
    onLearn: (s) => (PS.semiInvis = s.tier === 3),
    cast: (s) => {
      PS.invisT = byTier(s.tier, NUM.invis.dur);
      puff(G.player.pos, '#7a5cff');
      return true;
    },
  },
  evasion: {
    id: 'evasion',
    name: 'Evasion',
    desc: 'Bir süre aldığın hasar yarıya iner.',
    tiers: ['2.5 sn hasar azaltma', 'Süre 4 sn', 'Süre 5.5 sn ve ilk 2 sn hiç hasar almazsın'],
    cooldown: () => 12,
    cast: (s) => {
      PS.evasionT = byTier(s.tier, NUM.evasion.dur);
      if (s.tier === 3) PS.evasionImmuneT = NUM.evasion.immune;
      return true;
    },
  },
  decoy: {
    id: 'decoy',
    name: 'Kopya',
    desc: 'Önüne koşan sahte bir kopya bırakır. Bekleme süresindeyken tekrar basınca en yakın kopyanla yer değiştirirsin.',
    tiers: ['1 stack, 9 sn bekleme', 'Bekleme 6 sn', 'Kopya, maçtaki başka bir oyuncunun ismi ve görünüşüyle çıkar'],
    cooldown: (t) => byTier(t, [9, 6, 6]),
    cast: (s) => {
      spawnDecoy(G.player.pos, G.player.yaw, 'run', s.tier === 3);
      return true;
    },
    whenEmpty: () => swapWithDecoy(),
  },
  poison: {
    id: 'poison',
    name: 'Poison',
    desc: 'Mermilerin ve hançerlerin zehirler: hedef yavaşlar ve zamanla hasar alır. Zehir birikmez, süresi yenilenir.',
    tiers: ['6 sn zehirli silah, %30 yavaşlatma, 6 hasar/sn', 'Zehir güçlenir: %40 yavaşlatma, 10 hasar/sn', 'Zehir silahına kalıcı eklenir. Yetenek 5 sn zehir hasarını 2 katına çıkarır'],
    cooldown: () => 12,
    onLearn: (s) => {
      PS.poisonSlow = byTier(s.tier, NUM.poison.slow);
      PS.poisonDps = byTier(s.tier, NUM.poison.dps);
      PS.poisonPermanent = s.tier === 3;
    },
    cast: (s) => {
      if (s.tier < 3) PS.poisonCoatT = NUM.poison.coat;
      else PS.poisonBoostT = NUM.poison.boost;
      puff(G.player.pos, '#5fd35a');
      return true;
    },
  },
  sprint: {
    id: 'sprint',
    name: 'Sprint',
    desc: '4 sn boyunca %45 daha hızlı koşarsın.',
    tiers: ['10 sn bekleme', '+1 stack, bekleme 7 sn', 'Sprint sırasında saldırı, atış ve şarjör değiştirme hızlanır'],
    cooldown: (t) => byTier(t, [10, 7, 7]),
    charges: (t) => byTier(t, [1, 2, 2]),
    onLearn: (s) => (PS.sprintHaste = s.tier === 3),
    cast: () => {
      PS.sprintT = NUM.sprint.dur;
      return true;
    },
  },
  kidney: {
    id: 'kidney',
    name: 'Kidney shot',
    desc: 'Sadece yakın silahla: önündeki rakibi kısa bir süre hareketsiz bırakır.',
    tiers: ['0.55 sn sersemletme, 12 sn bekleme', 'Bekleme 9 sn', 'Sersemletme 1 sn olur'],
    weapon: 'melee',
    cooldown: (t) => byTier(t, [12, 9, 9]),
    cast: (s) => {
      const t = meleeTarget(NUM.kidney.range, 140);
      if (!t) {
        host.message('Menzilde rakip yok');
        return false;
      }
      t.stunT = Math.max(t.stunT, byTier(s.tier, NUM.kidney.stun));
      dealDamage(G.player, t, NUM.kidney.damage, { poison: weaponPoisoned() });
      slash('#ffe14a');
      return true;
    },
  },
  execute: {
    id: 'execute',
    name: 'Execute',
    desc: 'Büyük hasarlı bir vuruş ya da atış. Rakibin eksik canı arttıkça daha çok vurur. İki silahla da çalışır.',
    tiers: ['70 hasar + eksik canın %40\'ı', 'Hasar 95', 'Rakip ölürse bekleme süresi sıfırlanır'],
    cooldown: () => 10,
    cast: (s) => {
      const base = byTier(s.tier, NUM.execute.damage);
      const dmgFor = (u: Unit) => base + Math.min(u.kind === 'boss' ? NUM.execute.bossCap : Infinity, (u.maxHp - u.hp) * NUM.execute.missing);
      let target: Unit | null;
      if (host.weapon() === 'melee') {
        target = meleeTarget(DAGGERS.range + 0.5, 120);
        if (!target) {
          host.message('Menzilde rakip yok');
          return false;
        }
        slash('#ff3b3b');
      } else {
        const hit = rayHitUnit(host.aimOrigin(), host.aimDir(), NUM.execute.range, (u) => hostile(G.player, u) && u.team !== 0);
        lineFx(host.muzzle(), hit.point, '#ff3b3b', 0.25);
        target = hit.unit;
      }
      if (target) {
        dealDamage(G.player, target, dmgFor(target), { poison: weaponPoisoned() });
        if (s.tier === 3 && !target.alive) {
          refund(s);
          host.message('Execute yenilendi!');
          return false;
        }
      }
      return true;
    },
  },
  wink: {
    id: 'wink',
    name: 'Wink',
    desc: 'Nişangâhtaki rakibin arkasına ışınlanırsın (Backstab için ideal).',
    tiers: ['12 m menzil, 9 sn bekleme', '16 m menzil, 7 sn bekleme', '20 m, 6 sn ve ışınlanınca rakip 0.25 sn sersemler'],
    cooldown: (t) => byTier(t, [9, 7, 6]),
    cast: (s) => {
      const t = targetUnderCrosshair(byTier(s.tier, NUM.wink.range), 20, (u) => hostile(G.player, u) && u.team !== 0);
      if (!t) {
        host.message('Menzilde rakip yok');
        return false;
      }
      const dest = behind(t);
      puff(G.player.pos, '#b46cff');
      host.teleport(dest, Math.atan2(t.pos.x - dest.x, t.pos.z - dest.z));
      puff(dest, '#b46cff');
      if (s.tier === 3) t.stunT = Math.max(t.stunT, NUM.wink.stun);
      return true;
    },
  },
  detonate: {
    id: 'detonate',
    name: 'Detonate',
    desc: 'Nişangâhtaki kopyanı patlatır (nişangâhta kopya yoksa en yakındakini).',
    tiers: ['3.5 m patlama, 11 sn bekleme', '4.5 m patlama, 8 sn bekleme', 'Tüm kopyalar birden patlar'],
    cooldown: (t) => byTier(t, [11, 8, 8]),
    blocked: noDecoy,
    cast: (s) => {
      const list = decoys();
      if (!list.length) return false;
      const radius = byTier(s.tier, NUM.detonate.radius);
      if (s.tier === 3) {
        for (const d of list) explode(d, radius);
      } else {
        const aimed = targetUnderCrosshair(60, 12, (u) => list.includes(u), false);
        const pick = aimed ?? list.reduce((a, b) => (flatDist(a.pos, G.player.pos) < flatDist(b.pos, G.player.pos) ? a : b));
        explode(pick, radius);
      }
      return true;
    },
  },
  insane: {
    id: 'insane',
    name: 'Insane',
    desc: 'Tüm kopyaların en yakın rakibe koşar ve menzile girince ateş eder (%30 hasar). Ateş eden kopya 2 sn sonra kaybolur.',
    tiers: ['Kopyalar saldırır, 12 sn bekleme', 'Kopyalar daha uzun yaşar (8 → 12 sn)', 'Kopya, taklit ettiği sınıfın rastgele bir yeteneğini kullanır'],
    cooldown: () => 12,
    blocked: noDecoy,
    cast: () => {
      const list = decoys();
      if (!list.length) return false;
      for (const d of list) d.ai!.mode = 'insane';
      return true;
    },
  },
};

/** Playstyles: each one starts with a skill (design doc 2.2). */
export const PLAYSTYLES: { id: string; name: string; skill: SkillId; weapon: 'melee' | 'ranged' }[] = [
  { id: 'melee', name: 'Yakın dövüş', skill: 'wink', weapon: 'melee' },
  { id: 'ranged', name: 'Uzak dövüş', skill: 'execute', weapon: 'ranged' },
  { id: 'deception', name: 'Aldatmaca', skill: 'decoy', weapon: 'ranged' },
];

export function resetRogue() {
  Object.assign(PS, {
    evasionT: 0, evasionImmuneT: 0, invisT: 0, semiInvis: false, poisonCoatT: 0, poisonPermanent: false,
    poisonBoostT: 0, poisonSlow: 0.3, poisonDps: 6, sprintT: 0, sprintHaste: false,
  });
  still = 0;
  trailCd = 0;
  fadeCd = 0;
  fadeT = 0;
  watchedT = 0;
  ammo = GUN.magazine;
  reloadT = 0;
}

// ---- Per-frame -------------------------------------------------------------
let still = 0;
let trailCd = 0;
let fadeCd = 0;
/** Gölge izi faint time left, and how long a close enemy has been watching. */
let fadeT = 0;
let watchedT = 0;

/** Gölge izi state, for tests. */
export const fadeState = () => ({ fadeT, fadeCd, watchedT, trailCd, still });

function breakFade() {
  fadeT = 0;
  watchedT = 0;
}

export function weaponPoisoned() {
  return PS.poisonPermanent || PS.poisonCoatT > 0;
}

/** Faster attacks while Sprint tier 3 is active. */
export function hasteMult() {
  return PS.sprintHaste && PS.sprintT > 0 ? NUM.sprint.haste : 1;
}

export function speedMult() {
  return PS.sprintT > 0 ? NUM.sprint.mult : 1;
}

/** How visible the player is to enemies: 0 hidden, 0.5 faint, 1 normal. */
export function enemyVisibility() {
  if (PS.invisT > 0) return 0;
  if (PS.semiInvis && !inCombat(G.player)) return 0.5;
  if (fadeT > 0) return SHADOW_TRAIL.fadeVis;
  return 1;
}

export function updateRogue(dt: number, moving: boolean, grounded: boolean) {
  updateCooldowns(dt);
  if (reloadT > 0) {
    reloadT -= dt;
    if (reloadT <= 0) ammo = GUN.magazine;
  }
  for (const k of ['evasionT', 'evasionImmuneT', 'invisT', 'poisonCoatT', 'poisonBoostT', 'sprintT'] as const) PS[k] = Math.max(0, PS[k] - dt);

  // Passive 2 (Gölge izi): standing still makes you faint. The copy comes from the dash (onDash).
  trailCd -= dt;
  fadeCd -= dt;
  if (moving || !grounded) still = 0;
  else still += dt;
  if (still >= SHADOW_TRAIL.stillTime && fadeCd <= 0) {
    fadeCd = SHADOW_TRAIL.cooldown;
    still = 0;
    fadeT = SHADOW_TRAIL.fadeTime;
    watchedT = 0;
  }
  if (fadeT > 0) {
    fadeT -= dt;
    // A close enemy that keeps you in sight sees through it.
    const me = chest(G.player);
    const watched = enemiesNear(G.player.pos, SHADOW_TRAIL.breakRange).some((u) => lineOfSight(chest(u), me));
    watchedT = watched ? watchedT + dt : Math.max(0, watchedT - dt);
    if (watchedT >= SHADOW_TRAIL.breakTime) breakFade();
  }
  updateDecoys(dt);
}

// ---- Decoys ----------------------------------------------------------------
const PURPLE = new Color3(0.35, 0.1, 0.55);

export function spawnDecoy(at: Vector3, yaw: number, mode: 'run' | 'idle', disguise: boolean, life?: number) {
  const list = decoys();
  // At most 3 decoys on the map (approved); the oldest goes first.
  if (list.length >= NUM.decoy.max) removeUnit(list[0]);
  let colors = G.player.colors!;
  let name = G.player.name;
  if (disguise) {
    const bots = G.units.filter((u) => u.kind === 'bot');
    const b = bots[Math.floor(Math.random() * bots.length)];
    if (b?.colors) {
      colors = b.colors;
      name = b.name;
    }
  }
  const body =
    disguise && colors.skin
      ? createCharacterBody(G.scene, G.world, `decoy${G.nextId}`, colors.skin, { tint: colors.tint })
      : (createHippoBody(G.scene, G.world, `decoy${G.nextId}`) ?? createActorBody(G.scene, G.world, `decoy${G.nextId}`, colors, false, {}));
  const lifeT = life ?? (ownedTier('insane') >= 2 ? NUM.decoy.insaneLife : NUM.decoy.life);
  const d = makeUnit('decoy', name, body, at, 0, NUM.decoy.hp, {
    owner: G.player,
    lifeT,
    tint: PURPLE,
    colors,
    yaw,
    level: G.player.level,
    ai: { mode, runT: mode === 'run' ? 1.6 : 0, dir: forwardFromYaw(yaw), fireT: 0, firing: -1, trick: null },
  });
  puff(at, '#b46cff');
  return d;
}

function swapWithDecoy(): boolean {
  const list = decoys();
  if (!list.length) return false;
  const d = list.reduce((a, b) => (flatDist(a.pos, G.player.pos) < flatDist(b.pos, G.player.pos) ? a : b));
  const mine = G.player.pos.clone();
  const myYaw = G.player.yaw;
  puff(mine, '#b46cff');
  host.teleport(d.pos.clone(), G.player.yaw);
  d.pos.copyFrom(mine);
  d.yaw = myYaw;
  puff(G.player.pos, '#b46cff');
  return true;
}

function explode(d: Unit, radius: number) {
  sfx.boom();
  addShake(Math.max(0.15, 0.6 - flatDist(d.pos, G.player.pos) / 30));
  ringFx(d.pos, radius, '#ff7a3b', 0.35);
  spawnFx(MeshBuilder.CreateSphere('boom', { diameter: radius * 1.2, segments: 12 }, G.scene), chest(d), '#ffb14a', 0.3, 1.5, 0.5);
  for (const u of [...G.units]) {
    if (!hostile(G.player, u) || u.team === 0) continue;
    if (flatDist(u.pos, d.pos) <= radius + u.radius && Math.abs(u.pos.y - d.pos.y) < 3) dealDamage(d, u, NUM.detonate.damage, { noBackstab: true });
  }
  removeUnit(d);
}

function nearestEnemyOf(p: Vector3, range: number) {
  let best: Unit | null = null;
  let bd = range;
  for (const u of G.units) {
    if (u.team === 0 || !u.alive) continue;
    const d = flatDist(u.pos, p);
    if (d < bd) {
      bd = d;
      best = u;
    }
  }
  return best;
}

function updateDecoys(dt: number) {
  for (const d of decoys()) {
    const ai = d.ai!;
    d.lifeT! -= dt;
    if (d.lifeT! <= 0) {
      puff(d.pos, '#b46cff');
      removeUnit(d);
      continue;
    }
    if (ai.mode === 'run' && ai.runT > 0) {
      ai.runT -= dt;
      moveUnit(d, ai.dir, 8.5, dt);
    } else if (ai.mode === 'insane') {
      const t = nearestEnemyOf(d.pos, 40);
      if (!t) {
        moveUnit(d, Vector3.Zero(), 0, dt);
        continue;
      }
      faceTowards(d, t.pos, dt);
      const dist = flatDist(d.pos, t.pos);
      const see = dist < NUM.insane.range && lineOfSight(chest(d), chest(t));
      if (ai.firing < 0 && see) {
        ai.firing = NUM.insane.fireFor;
        // Tier 3: the decoy uses a random skill of the class it copies (all bots are Rogues for now).
        if (ownedTier('insane') === 3) ai.trick = ['wink', 'kidney', 'poison'][Math.floor(Math.random() * 3)];
        if (ai.trick === 'wink') {
          d.pos.copyFrom(behind(t));
          puff(d.pos, '#b46cff');
        }
        if (ai.trick === 'kidney') t.stunT = Math.max(t.stunT, 0.5);
      }
      if (ai.firing >= 0) {
        ai.firing -= dt;
        ai.fireT -= dt;
        if (ai.fireT <= 0 && see) {
          ai.fireT = NUM.insane.rate;
          const from = chest(d).add(forwardFromYaw(d.yaw).scale(0.6));
          fireBullet(d, from, chest(t).subtract(from), GUN.speed, 40, GUN.damage * NUM.insane.share, '#d58bff', ai.trick === 'poison');
        }
        if (ai.firing < 0) {
          puff(d.pos, '#b46cff');
          removeUnit(d);
          continue;
        }
      } else moveUnit(d, t.pos.subtract(d.pos), 9, dt);
    } else moveUnit(d, Vector3.Zero(), 0, dt);
  }
}

// ---- Weapons ---------------------------------------------------------------------
let ammo: number = GUN.magazine;
let reloadT = 0;

function reload() {
  if (reloadT > 0 || ammo >= GUN.magazine) return;
  reloadT = GUN.reload / hasteMult();
  sfx.reload();
}

function shoot(): number {
  if (reloadT > 0) return 0.05;
  if (ammo <= 0) {
    sfx.empty();
    reload();
    return 0.2;
  }
  ammo -= 1;
  const { from, dir } = aimedShotDir(GUN.range);
  const poisoned = weaponPoisoned();
  fireBullet(G.player, from, dir, GUN.speed, GUN.range, GUN.damage, poisoned ? '#7be36f' : '#ffd27a', poisoned);
  // Feel: flash, kick the camera up and the gun back, a crack of sound.
  muzzleFlash(from, poisoned ? '#9cff8a' : '#ffc46a');
  kick(host.isAiming() ? 0.012 : 0.022, 0.14, 0.035, 0.1);
  sfx.shot();
  if (ammo <= 0) reload();
  return GUN.fireRate / hasteMult();
}

let side = 1;
function swing(): number {
  side *= -1;
  sweep(DAGGERS.range, DAGGERS.arcDeg, DAGGERS.damage, weaponPoisoned() ? '#7be36f' : '#ff5a6e', { poison: weaponPoisoned(), tilt: side * 0.35 });
  return DAGGERS.rate / hasteMult();
}

export const ROGUE_KIT: ClassKit = {
  id: 'rogue',
  name: 'Rogue',
  blurb: 'Arkaya geç, patlat, kaç. Görünmezlik ve kopyalarla kandır.',
  stats: ROGUE,
  dash: { anim: 'dash', speed: 26, time: 0.18, cd: 1.0, color: '#b46cff' },
  weaponNames: { ranged: 'Suikast tabancası', melee: 'İkili lazer hançer' },
  passives: ['Backstab: arkadan vuruş x1.5', 'Gölge izi: dash başladığı yerde kopya bırakır; 2.5 sn durunca 10 sn silikleşirsin'],
  skills: SKILLS,
  playstyles: PLAYSTYLES,
  buildWeapons(root) {
    const ranged = new TransformNode('rogue-ranged', G.scene);
    ranged.parent = root;
    attachGun(G.scene, G.world, ranged).catch((e) => console.error('Gun model failed to load', e));
    const melee = new TransformNode('rogue-melee', G.scene);
    melee.parent = root;
    // Twin laser daggers, one in each hand.
    for (const s of [1, -1]) weaponPart('dagger', melee, { w: 0.06, h: 0.06, d: 0.75 }, [0.42 * s, 1.15, 0.75], '#ff5a6e');
    return { ranged, melee };
  },
  reset: resetRogue,
  update: updateRogue,
  // Gölge izi: a dash leaves a copy where it starts.
  onDash() {
    if (trailCd > 0) return;
    spawnDecoy(G.player.pos.clone(), G.player.yaw, 'idle', false, SHADOW_TRAIL.decoyLife);
    trailCd = SHADOW_TRAIL.cooldown;
  },
  attack: (w: Weapon) => (w === 'ranged' ? shoot() : swing()),
  reload,
  weaponText: (w) => (w === 'ranged' ? `Suikast tabancası ${reloadT > 0 ? 'dolduruluyor…' : `${ammo}/${GUN.magazine}`}` : 'İkili lazer hançer'),
  buffs() {
    const b: string[] = [];
    if (PS.invisT > 0) b.push(`Görünmez ${PS.invisT.toFixed(1)}`);
    else if (fadeT > 0 && !PS.semiInvis) b.push(`Silik ${fadeT.toFixed(1)}`);
    else if (enemyVisibility() < 1) b.push('Yarı silik');
    if (PS.evasionImmuneT > 0) b.push('Hasar almaz');
    else if (PS.evasionT > 0) b.push(`Evasion ${PS.evasionT.toFixed(1)}`);
    if (PS.poisonBoostT > 0) b.push('Zehir x2');
    else if (weaponPoisoned()) b.push('Zehirli silah');
    if (PS.sprintT > 0) b.push('Sprint');
    return b;
  },
  speedMult,
  visibility: enemyVisibility,
  outgoing(target, dmg, src, opts) {
    let crit = false;
    // Backstab passive: the attacker's position decides (a decoy shooting from behind counts too).
    if (!opts.noBackstab && src && src.kind !== 'pet' && isBehind(src.pos, target)) {
      dmg *= BACKSTAB.mult;
      crit = true;
    }
    // Attacking breaks invisibility and the Gölge izi fade (decoys and pets don't).
    if (!src || src === G.player) {
      PS.invisT = 0;
      breakFade();
    }
    return { dmg, crit };
  },
  incoming(dmg) {
    if (PS.evasionImmuneT > 0) return 0;
    if (dmg > 0) breakFade();
    if (PS.evasionT > 0) dmg *= 0.5;
    return dmg;
  },
};
registerKit(ROGUE_KIT);
