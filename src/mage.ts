import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { forwardFromYaw, rightFromYaw } from './actors';
import { MAGE } from './balance';
import { G, applyDot, chest, dealDamage, flatDist, glowMat, inCombat, makeUnit, moveUnit, removeUnit, slowUnit, stun, type Unit } from './core';
import { addShake, kick, sfx } from './feel';
import {
  P,
  addZone,
  allies,
  allyChase,
  areaFx,
  beamFx,
  byTier,
  enemiesNear,
  enemyOfPlayer,
  freePointAlong,
  hitscan,
  host,
  inZone,
  nearestEnemy,
  ownedTier,
  partsBody,
  puff,
  push,
  registerKit,
  sweep,
  targetUnderCrosshair,
  updateCooldowns,
  weaponPart,
  zones,
  type ClassKit,
  type SkillDef,
  type Weapon,
} from './kit';

/**
 * Mage (design doc 2.2): a tech wizard whose power comes from nano bots.
 * Wand fires lasers, the rod is a long melee staff. Passives: spell shield and nano orbs.
 * Skills marked (n) spend one nano orb.
 */

type T3 = [number, number, number];
export const MNUM = {
  sonic: { range: 8, cone: [70, 95, 95] as T3, push: [4, 6, 6] as T3, damage: 18, stun: 0.5 },
  bombs: { count: [1, 2, 2] as T3, damage: 32, radius: 2.6, speed: 10, life: 8, dust: { radius: 3, t: 3, slow: 0.4 } },
  fog: { radius: [6, 9, 9] as T3, dur: 7 },
  sunray: { dur: [3, 5, 5] as T3, dps: [30, 30, 30] as T3, range: 22 },
  nanobots: { dps: [12, 12, 12] as T3, dur: [5, 8, 8] as T3, range: 28, jump: 10 },
  blink: { range: [10, 13, 13] as T3 },
  armor: { shield: [40, 55, 75] as T3, dur: 6, radius: 4, damage: [40, 65, 65] as T3 },
  arms: { dur: [8, 8, 10] as T3, every: [0.7, 0.5, 0.4] as T3, damage: [18, 26, 30] as T3, reach: 3, stun: 0.25 },
  gravity: { lift: [1.2, 1.6, 1.6] as T3, damage: [35, 55, 55] as T3, range: 26, height: 3, splash: 4 },
  mines: { max: 2, damage: [45, 65, 65] as T3, radius: 3, trigger: 2.2, range: 22 },
};

const SKILLS: Record<string, SkillDef> = {
  sonic: {
    id: 'sonic',
    name: 'Sonic boom',
    desc: 'Öne koni şeklinde ses dalgası: rakipleri iter ve hasar verir.',
    tiers: ['70° koni, 4 m itme, 9 sn bekleme', 'Koni genişler (95°), itme 6 m', 'Duvara çarpan rakip 0.5 sn sersemler'],
    cooldown: () => 9,
    cast: (s) => {
      const hit = enemiesInCone(MNUM.sonic.range, byTier(s.tier, MNUM.sonic.cone));
      for (const u of hit) {
        dealDamage(G.player, u, MNUM.sonic.damage);
        const slammed = push(u, u.pos.subtract(G.player.pos), byTier(s.tier, MNUM.sonic.push));
        if (s.tier === 3 && slammed) stun(u, MNUM.sonic.stun);
      }
      coneFx(MNUM.sonic.range, byTier(s.tier, MNUM.sonic.cone), '#9fe7ff');
      addShake(0.12);
      return true;
    },
  },
  bombs: {
    id: 'bombs',
    name: 'Suicide bombs',
    desc: '(n) Nano botlar küçük koşan robotlara dönüşür, menzile giren rakibe koşup patlar.',
    tiers: ['1 robot, 40 hasar', 'Bir küre 2 robot çıkarır', 'Patlama yerde yavaşlatan nano toz bırakır'],
    orb: true,
    cooldown: () => 4,
    cast: (s) => {
      for (let i = 0; i < byTier(s.tier, MNUM.bombs.count); i++) spawnBomb(i);
      return true;
    },
  },
  fog: {
    id: 'fog',
    name: 'Sis',
    desc: 'Etrafını sisle kaplar. Sisin içindeyken yetenek kullansan da görünmezsin.',
    tiers: ['6 m sis, 7 sn', 'Alan büyür (9 m)', 'Sisin içindeyken nano küreler 2 kat hızlı dolar'],
    cooldown: () => 20,
    cast: (s) => {
      addZone('fog', G.player.pos, byTier(s.tier, MNUM.fog.radius), MNUM.fog.dur, '#cfd8ff', 0.28);
      return true;
    },
  },
  sunray: {
    id: 'sunray',
    name: 'Sunray',
    desc: '(n) Nano botlar bir robota dönüşür ve en yakın rakibe güçlü bir güneş ışını atar.',
    tiers: ['3 sn ışın, 30 hasar/sn', 'Işın süresi 5 sn', 'Hedef ölünce robot en yakın rakibe döner'],
    orb: true,
    cooldown: () => 10,
    blocked: () => (nearestEnemy(G.player.pos, MNUM.sunray.range) ? null : 'Yakında rakip yok'),
    cast: (s) => {
      spawnSunray(byTier(s.tier, MNUM.sunray.dur));
      return true;
    },
  },
  nanobots: {
    id: 'nanobots',
    name: 'Nano bots',
    desc: '(n) Nişangâhtaki rakibi nano botlarla kaplar: zamanla hasar.',
    tiers: ['12 hasar/sn, 5 sn', 'Süre 8 sn', 'Hedef ölürse botlar en yakın rakibe sıçrar'],
    orb: true,
    cooldown: () => 8,
    cast: (s) => {
      const t = targetUnderCrosshair(MNUM.nanobots.range, 14, enemyOfPlayer);
      if (!t) {
        host.message('Nişangâhta rakip yok');
        return false;
      }
      infect(t, s.tier);
      return true;
    },
  },
  blink: {
    id: 'blink',
    name: 'Blink',
    desc: 'Baktığın yöne kısa mesafe ışınlanırsın.',
    tiers: ['10 m, 8 sn bekleme', 'Menzil 13 m, bekleme 6 sn', '2 şarj'],
    cooldown: (t) => byTier(t, [8, 6, 6]),
    charges: (t) => byTier(t, [1, 1, 2]),
    cast: (s) => {
      const dest = freePointAlong(G.player.pos, host.aimDir(), byTier(s.tier, MNUM.blink.range));
      puff(G.player.pos, '#7ad7ff');
      host.teleport(dest, G.player.yaw);
      puff(G.player.pos, '#7ad7ff');
      return true;
    },
  },
  armor: {
    id: 'armor',
    name: 'Nano zırh',
    desc: '(n) Kalkan (40/55/75). Kalkan bitince ya da 6 sn dolunca patlar, etrafa hasar verir.',
    tiers: ['40 kalkan, 40 patlama hasarı', '55 kalkan, patlama hasarı 65', '75 kalkan; patlamanın vurduğu her rakip 1 nano küre geri verir'],
    orb: true,
    cooldown: () => 14,
    cast: (s) => {
      armor = byTier(s.tier, MNUM.armor.shield);
      armorT = MNUM.armor.dur;
      return true;
    },
  },
  arms: {
    id: 'arms',
    name: 'Nano kollar',
    desc: '(n) Yanında 8 sn (3. seviyede 10 sn) duran ve yakındaki en yakın rakibe vuran iki robotik kol.',
    tiers: ['0.7 sn\'de bir 18 hasar', 'Daha hızlı ve sert: 0.5 sn, 26 hasar', '0.4 sn, 30 hasar, 10 sn; her 3. vuruş 0.25 sn sersemletir'],
    orb: true,
    cooldown: () => 12,
    cast: (s) => {
      armsT = byTier(s.tier, MNUM.arms.dur);
      showArms(true);
      return true;
    },
  },
  gravity: {
    id: 'gravity',
    name: 'Gravity',
    desc: 'Nişangâhtaki rakibi havaya kaldırırsın, sonra yere çakarsın.',
    tiers: ['1.2 sn havada, 35 hasar', 'Havada 1.6 sn, çakma 55 hasar', 'Çakma etrafındaki rakiplere de alan hasarı verir'],
    cooldown: () => 12,
    cast: (s) => {
      const t = targetUnderCrosshair(MNUM.gravity.range, 14, enemyOfPlayer);
      if (!t) {
        host.message('Nişangâhta rakip yok');
        return false;
      }
      const dur = byTier(s.tier, MNUM.gravity.lift);
      lifted.push({ u: t, t: dur, total: dur, base: t.pos.y, tier: s.tier });
      stun(t, dur + 0.2);
      return true;
    },
  },
  mines: {
    id: 'mines',
    name: 'Lazer mayınları',
    desc: 'Asanla yere ateş edip lazer patlaması yapan bir mayın kurarsın. Seni etkilemez.',
    tiers: ['Aynı anda 2 mayın, 45 hasar', 'Hasar 65', 'Mayınlar rakiplere görünmez olur'],
    cooldown: () => 6,
    charges: () => 2,
    cast: (s) => {
      const p = host.aimPoint(MNUM.mines.range);
      if (flatDist(p, G.player.pos) > MNUM.mines.range) return false;
      const mine = zones.filter((z) => z.kind === 'mine' && z.t > 0);
      if (mine.length >= MNUM.mines.max) {
        mine[0].mesh.dispose();
        mine[0].t = 0;
      }
      const ground = new Vector3(p.x, Math.max(0, p.y - 0.05), p.z);
      addZone('mine', ground, 0.6, 60, '#ff4fd8', s.tier === 3 ? 0.15 : 0.7, { mine: true, armT: 0.5, tier: s.tier });
      return true;
    },
  },
};

const PLAYSTYLES = [
  { id: 'nano', name: 'Nano ustası (asa)', skill: 'arms', weapon: 'melee' as Weapon },
  { id: 'laser', name: 'Lazer (wand)', skill: 'mines', weapon: 'ranged' as Weapon },
  { id: 'gravity', name: 'Yerçekimi (kontrol)', skill: 'gravity', weapon: 'ranged' as Weapon },
];

// ---- State -----------------------------------------------------------------------
let heat = 0;
let overheatT = 0;
let shieldWait = 0;
let orbT = 0;
let armor = 0;
let armorT = 0;
let armsT = 0;
let armsHitT = 0;
let armsHits = 0;
let lifted: { u: Unit; t: number; total: number; base: number; tier: number }[] = [];
let infected: { u: Unit; t: number; tier: number }[] = [];
let orbMeshes: Mesh[] = [];
let armMeshes: Mesh[] = [];
let shieldMesh: Mesh | null = null;

function reset() {
  heat = 0;
  overheatT = 0;
  shieldWait = 0;
  orbT = 0;
  armor = 0;
  armorT = 0;
  armsT = 0;
  armsHits = 0;
  lifted = [];
  infected = [];
  P.orbs = 1;
  showArms(false);
}

// ---- Weapons ---------------------------------------------------------------------
function zap(): number {
  if (overheatT > 0) {
    sfx.empty();
    return 0.15;
  }
  const W = MAGE.wand;
  const { hits, point, from } = hitscan(W.range);
  for (const u of hits) dealDamage(G.player, u, W.damage, { at: point });
  beamFx(from, point, '#7ad7ff', 0.09, 0.07);
  kick(0.008, 0.05, 0.015, 0.03);
  sfx.zap();
  heat += W.heatPerShot;
  if (heat >= 1) {
    overheatT = W.overheatLock;
    host.message('Wand ısındı!');
  }
  return W.rate;
}

function whack(): number {
  const R = MAGE.rod;
  const hit = sweep(R.range, R.arcDeg, R.damage, '#7ad7ff', { tilt: 0.5 });
  for (const u of hit) push(u, u.pos.subtract(G.player.pos), R.push);
  return R.rate;
}

// ---- Skills helpers ------------------------------------------------------------------
function enemiesInCone(range: number, coneDeg: number) {
  const fwd = forwardFromYaw(G.player.yaw);
  const half = ((coneDeg / 2) * Math.PI) / 180;
  return G.units.filter((u) => {
    if (!enemyOfPlayer(u)) return false;
    const to = u.pos.subtract(G.player.pos);
    to.y = 0;
    const d = to.length();
    if (d > range + u.radius || Math.abs(u.pos.y - G.player.pos.y) > 2.5) return false;
    return d < 0.8 || Math.acos(Math.max(-1, Math.min(1, Vector3.Dot(to.normalize(), fwd)))) <= half;
  });
}

function coneFx(range: number, coneDeg: number, color: string) {
  const arc = MeshBuilder.CreateDisc('sonic', { radius: range, arc: coneDeg / 360, tessellation: 24 }, G.scene);
  arc.rotation.x = Math.PI / 2;
  arc.rotation.y = G.player.yaw - Math.PI / 2 + ((coneDeg / 2) * Math.PI) / 180;
  arc.position.copyFrom(G.player.pos).addInPlaceFromFloats(0, 1, 0);
  arc.material = glowMat(color, 0.4);
  arc.isPickable = false;
  G.fx.push({ mesh: arc, t: 0.3, total: 0.3, grow: 0.8, fade: true });
}

function explodeAt(at: Vector3, radius: number, damage: number, color: string, src: Unit = G.player) {
  const hit = enemiesNear(at, radius);
  for (const u of hit) dealDamage(src, u, damage, { noBackstab: true });
  areaFx(at, radius, color, 0.35, 0.45);
  sfx.boom();
  addShake(Math.max(0.08, 0.4 - flatDist(at, G.player.pos) / 40));
  return hit;
}

function spawnBomb(i: number) {
  const side = i % 2 ? -1 : 1;
  const at = G.player.pos.add(rightFromYaw(G.player.yaw).scale(0.9 * side)).add(forwardFromYaw(G.player.yaw).scale(0.8));
  const body = partsBody(`bomb${G.nextId}`, [
    { size: [0.55, 0.55, 0.55], pos: [0, 0.35, 0], color: '#3a4a66', sphere: true },
    { size: [0.18, 0.18, 0.18], pos: [0, 0.45, 0.24], color: '#ff6a3b', glow: true, sphere: true },
  ]);
  makeUnit('pet', 'Nano bomba', body, at, 0, 20, { owner: G.player, radius: 0.3, height: 0.7, yaw: G.player.yaw, ai: { type: 'bomb', life: MNUM.bombs.life, tier: ownedTier('bombs') } });
}

function spawnSunray(dur: number) {
  const at = G.player.pos.add(rightFromYaw(G.player.yaw).scale(-1.3)).addInPlaceFromFloats(0, 0, 0);
  const body = partsBody(`sun${G.nextId}`, [
    { size: [0.5, 0.9, 0.5], pos: [0, 0.45, 0], color: '#c9a13b' },
    { size: [0.36, 0.36, 0.36], pos: [0, 1.05, 0.12], color: '#ffe27a', glow: true, sphere: true },
  ]);
  makeUnit('pet', 'Güneş robotu', body, at, 0, 60, { owner: G.player, radius: 0.35, height: 1.2, yaw: G.player.yaw, ai: { type: 'sunray', life: dur, target: null, tier: ownedTier('sunray') } });
}

function infect(t: Unit, tier: number) {
  const dur = byTier(tier as 1 | 2 | 3, MNUM.nanobots.dur);
  applyDot(G.player, t, byTier(tier as 1 | 2 | 3, MNUM.nanobots.dps), dur);
  infected = infected.filter((x) => x.u !== t);
  infected.push({ u: t, t: dur, tier });
  puff(t.pos, '#5fe0c8', 0.8);
}

function showArms(on: boolean) {
  for (const m of armMeshes) m.dispose();
  armMeshes = [];
  if (!on) return;
  for (const s of [1, -1]) {
    const arm = MeshBuilder.CreateBox('nano-arm', { width: 0.16, height: 0.16, depth: 0.9 }, G.scene);
    arm.material = glowMat('#5fe0c8', 0.85);
    arm.isPickable = false;
    arm.metadata = { side: s };
    armMeshes.push(arm);
  }
}

// ---- Per frame -------------------------------------------------------------------------
function update(dt: number) {
  const inFog = inZone(G.player.pos, 'fog') && ownedTier('fog') === 3;
  updateCooldowns(dt);
  const W = MAGE.wand;
  heat = Math.max(0, heat - W.coolPerSec * dt);
  if (overheatT > 0) {
    overheatT -= dt;
    if (overheatT <= 0) heat = 0;
  }

  // Passive 1: spell shield after a while out of combat.
  if (!P.spellShield) {
    shieldWait = inCombat(G.player) ? 0 : shieldWait + dt;
    if (shieldWait >= MAGE.spellShieldEvery) {
      P.spellShield = true;
      shieldWait = 0;
    }
  }
  // Passive 2: nano orbs.
  const cap = MAGE.orbCap(G.player.level);
  if (P.orbs < cap) {
    orbT += dt * (inFog ? 2 : 1);
    if (orbT >= MAGE.orbEvery) {
      orbT = 0;
      P.orbs += 1;
    }
  } else orbT = 0;
  P.orbs = Math.min(P.orbs, cap);

  // Nano armor.
  if (armorT > 0) {
    armorT -= dt;
    if (armorT <= 0 || armor <= 0) burstArmor();
  }

  // Nano arms.
  if (armsT > 0) {
    armsT -= dt;
    armsHitT -= dt;
    const tier = ownedTier('arms') as 1 | 2 | 3;
    if (armsHitT <= 0) {
      const t = nearestEnemy(G.player.pos, MNUM.arms.reach + 0.5);
      if (t) {
        armsHitT = byTier(tier, MNUM.arms.every);
        armsHits += 1;
        dealDamage(G.player, t, byTier(tier, MNUM.arms.damage), { noBackstab: true });
        if (tier === 3 && armsHits % 3 === 0) stun(t, MNUM.arms.stun);
        beamFx(chest(G.player).add(rightFromYaw(G.player.yaw).scale(armsHits % 2 ? 0.7 : -0.7)), chest(t), '#5fe0c8', 0.08, 0.14);
      }
    }
    if (armsT <= 0) showArms(false);
  }

  // Gravity: lift, hold, slam.
  lifted = lifted.filter((l) => {
    if (!l.u.alive) return false;
    l.t -= dt;
    const k = Math.min(1, (l.total - l.t) / 0.3);
    l.u.pos.y = l.base + MNUM.gravity.height * k;
    l.u.velY = 0;
    if (l.t > 0) return true;
    l.u.pos.y = l.base;
    const tier = l.tier as 1 | 2 | 3;
    const dmg = byTier(tier, MNUM.gravity.damage);
    dealDamage(G.player, l.u, dmg);
    areaFx(l.u.pos, tier === 3 ? MNUM.gravity.splash : 1.4, '#a08cff', 0.35, 0.45);
    addShake(0.15);
    sfx.boom();
    if (tier === 3) for (const u of enemiesNear(l.u.pos, MNUM.gravity.splash)) if (u !== l.u) dealDamage(G.player, u, dmg * 0.5, { noBackstab: true });
    return false;
  });

  // Nano bots: tier 3 jumps to the nearest enemy when the target dies.
  infected = infected.filter((x) => {
    x.t -= dt;
    if (!x.u.alive) {
      if (x.tier === 3) {
        const next = nearestEnemy(x.u.pos, MNUM.nanobots.jump, (u) => u !== x.u);
        if (next) infect(next, x.tier);
      }
      return false;
    }
    return x.t > 0;
  });

  // Mines.
  for (const z of zones) {
    if (!z.data?.mine || z.t <= 0) continue;
    z.data.armT -= dt;
    if (z.data.armT > 0) continue;
    if (enemiesNear(z.pos, MNUM.mines.trigger).length) {
      explodeAt(z.pos, MNUM.mines.radius, byTier(z.data.tier, MNUM.mines.damage), '#ff4fd8');
      z.t = 0;
    }
  }

  // Robots.
  for (const a of allies('bomb')) updateBomb(a, dt);
  for (const a of allies('sunray')) updateSunray(a, dt);

  updateVisuals(dt);
}

function burstArmor() {
  const tier = ownedTier('armor') as 1 | 2 | 3;
  const hit = explodeAt(G.player.pos, MNUM.armor.radius, byTier(tier, MNUM.armor.damage), '#5fe0c8');
  if (tier === 3) P.orbs = Math.min(MAGE.orbCap(G.player.level), P.orbs + hit.length);
  armor = 0;
  armorT = 0;
}

function updateBomb(a: Unit, dt: number) {
  a.ai!.life -= dt;
  const t = nearestEnemy(a.pos, 20);
  if (t) {
    const d = allyChase(a, t, MNUM.bombs.speed, 0.4, dt);
    if (d < 0.9) {
      explodeAt(a.pos, MNUM.bombs.radius, MNUM.bombs.damage, '#ff8a3b', a);
      if (a.ai!.tier === 3) addZone('dust', a.pos, MNUM.bombs.dust.radius, MNUM.bombs.dust.t, '#9aa6b8', 0.35);
      removeUnit(a);
      return;
    }
  } else moveUnit(a, Vector3.Zero(), 0, dt);
  if (a.ai!.life <= 0) {
    puff(a.pos, '#5fe0c8', 0.6);
    removeUnit(a);
  }
}

function updateSunray(a: Unit, dt: number) {
  a.ai!.life -= dt;
  let t: Unit | null = a.ai!.target;
  if (!t || !t.alive) {
    // Tier 3 turns to the next enemy; otherwise the robot only fires at its first target.
    if (t && a.ai!.tier < 3) a.ai!.life = 0;
    else t = a.ai!.target = nearestEnemy(a.pos, MNUM.sunray.range);
  }
  moveUnit(a, Vector3.Zero(), 0, dt);
  if (t && t.alive && a.ai!.life > 0) {
    a.yaw = Math.atan2(t.pos.x - a.pos.x, t.pos.z - a.pos.z);
    // Damage in quarter-second ticks so numbers and hit sounds stay readable.
    a.ai!.tick = (a.ai!.tick ?? 0) - dt;
    if (a.ai!.tick <= 0) {
      a.ai!.tick = 0.25;
      dealDamage(a, t, byTier(a.ai!.tier, MNUM.sunray.dps) * 0.25, { noBackstab: true });
    }
    beamFx(a.pos.add(new Vector3(0, 1.05, 0)), chest(t), '#ffe27a', Math.max(dt, 1 / 60) * 1.5, 0.18);
  }
  if (a.ai!.life <= 0) {
    puff(a.pos, '#ffe27a', 0.8);
    removeUnit(a);
  }
}

// Dust from tier-3 bombs slows enemies standing in it.
function dustSlow() {
  for (const z of zones) if (z.kind === 'dust') for (const u of enemiesNear(z.pos, z.radius)) slowUnit(u, MNUM.bombs.dust.slow, 0.3);
}

function updateVisuals(dt: number) {
  dustSlow();
  // Orbs circle the player's shoulders.
  while (orbMeshes.length < P.orbs) {
    const m = MeshBuilder.CreateSphere('orb', { diameter: 0.2, segments: 8 }, G.scene);
    m.material = glowMat('#7ad7ff');
    m.isPickable = false;
    orbMeshes.push(m);
  }
  while (orbMeshes.length > P.orbs) orbMeshes.pop()!.dispose();
  const t = G.time * 2.2;
  orbMeshes.forEach((m, i) => {
    const a = t + (i * Math.PI * 2) / Math.max(1, orbMeshes.length);
    m.position.set(G.player.pos.x + Math.cos(a) * 0.75, G.player.pos.y + 1.75 + Math.sin(a * 2) * 0.08, G.player.pos.z + Math.sin(a) * 0.75);
  });
  // Spell shield and nano armor bubble.
  const showShield = P.spellShield || armor > 0;
  if (showShield && !shieldMesh) {
    shieldMesh = MeshBuilder.CreateSphere('mshield', { diameter: 2.3, segments: 12 }, G.scene);
    shieldMesh.isPickable = false;
  }
  if (shieldMesh) {
    if (!showShield) {
      shieldMesh.dispose();
      shieldMesh = null;
    } else {
      shieldMesh.material = glowMat(armor > 0 ? '#5fe0c8' : '#9fb8ff', armor > 0 ? 0.22 : 0.12);
      shieldMesh.position.copyFrom(G.player.pos).addInPlaceFromFloats(0, 1, 0);
    }
  }
  armMeshes.forEach((m) => {
    const s = m.metadata.side as number;
    const r = rightFromYaw(G.player.yaw);
    const f = forwardFromYaw(G.player.yaw);
    m.position.copyFrom(G.player.pos.add(r.scale(0.85 * s)).add(f.scale(0.35)).addInPlaceFromFloats(0, 1.2 + Math.sin(G.time * 6 + s) * 0.08, 0));
    m.rotation.y = G.player.yaw;
  });
  void dt;
}

function buildWeapons(root: TransformNode) {
  const ranged = new TransformNode('mage-wand', G.scene);
  ranged.parent = root;
  weaponPart('wand', ranged, { w: 0.05, h: 0.05, d: 0.55 }, [0.32, 1.2, 0.62], '#2c2f44', false);
  weaponPart('wand-tip', ranged, { w: 0.1, h: 0.1, d: 0.1 }, [0.32, 1.2, 0.92], '#7ad7ff');
  const melee = new TransformNode('mage-rod', G.scene);
  melee.parent = root;
  weaponPart('rod', melee, { w: 0.07, h: 1.9, d: 0.07 }, [0.42, 1.05, 0.45], '#3b3550', false, [0.35, 0, 0]);
  weaponPart('rod-top', melee, { w: 0.18, h: 0.18, d: 0.18 }, [0.42, 1.95, 0.8], '#7ad7ff');
  return { ranged, melee };
}

export const MAGE_KIT: ClassKit = {
  id: 'mage',
  name: 'Mage',
  blurb: 'Nano botlarla savaşan teknolojik büyücü. Alan kontrolü ve robotlar.',
  stats: MAGE.stats,
  dash: { anim: 'dash_mage', speed: 42, time: 0.11, cd: 1.2, color: '#7ad7ff', blink: true },
  weaponNames: { ranged: 'Lazer wand', melee: 'Uzun asa' },
  passives: ['Büyü kalkanı: savaş dışında 8 sn sonra sıradaki vuruşu engeller', 'Nano küreler: (n) yeteneklerin kaynağı'],
  skills: SKILLS,
  playstyles: PLAYSTYLES,
  buildWeapons,
  reset,
  update,
  attack: (w) => (w === 'ranged' ? zap() : whack()),
  weaponText: (w) =>
    w === 'ranged' ? `Lazer wand ${overheatT > 0 ? 'soğuyor…' : `ısı %${Math.round(heat * 100)}`}` : 'Uzun asa',
  buffs() {
    const b = [`Küre ${P.orbs}/${MAGE.orbCap(G.player.level)}`];
    if (P.spellShield) b.push('Büyü kalkanı');
    if (armor > 0) b.push(`Nano zırh ${Math.ceil(armor)}`);
    if (armsT > 0) b.push(`Nano kollar ${armsT.toFixed(1)}`);
    if (inZone(G.player.pos, 'fog')) b.push('Sisin içinde');
    return b;
  },
  speedMult: () => 1,
  incoming(dmg) {
    if (P.spellShield) {
      P.spellShield = false;
      shieldWait = 0;
      return 0;
    }
    if (armor > 0) {
      const a = Math.min(armor, dmg);
      armor -= a;
      dmg -= a;
      if (armor <= 0) burstArmor();
    }
    return dmg;
  },
};
registerKit(MAGE_KIT);
