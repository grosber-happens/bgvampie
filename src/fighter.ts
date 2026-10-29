import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { forwardFromYaw } from './actors';
import { FIGHTER } from './balance';
import { G, chest, dealDamage, fireBullet, flatDist, glowMat, hostile, slowUnit, stun, type Unit } from './core';
import { addShake, kick, sfx } from './feel';
import {
  P,
  addZone,
  areaFx,
  beamFx,
  byTier,
  enemiesNear,
  enemyOfPlayer,
  hitscan,
  host,
  meleeTargets,
  ownedTier,
  obstacleWithin,
  puff,
  push,
  registerKit,
  sweep,
  updateCooldowns,
  weaponPart,
  zones,
  type ClassKit,
  type SkillDef,
  type Weapon,
} from './kit';
import { pointHitsObstacle } from './world';

/**
 * Fighter (design doc 2.2): laser sword up close, thrown energy spears at range.
 * Passives: a shield generator and lifesteal.
 */

type T3 = [number, number, number];
export const FNUM = {
  second: { dur: [5, 7, 7] as T3, rate: [0.6, 0.45, 0.45] as T3, wave: { damage: 15, range: 10 } },
  rain: { radius: [3.5, 5, 5] as T3, damage: [45, 65, 65] as T3, delay: 0.6, range: 32, spikes: { t: 3, slow: 0.4, dps: 6 } },
  eshield: { dur: [3, 5, 5] as T3, hp: [80, 80, 140] as T3, arcDeg: 140, wave: { range: 8, share: 0.7 } },
  chain: { range: [16, 20, 20] as T3, slow: { share: 0.5, t: 1 }, damage: 15 },
  /** Pins to a wall within `wallGap` m behind; the pin lasts `pinNear` s up close (within `near` m) down to `pinFar` s at max range. */
  pierce: { damage: [60, 80, 80] as T3, range: 40, wallGap: 3, near: 5, pinNear: 1.5, pinFar: 0.25 },
  charge: { dist: [9, 12, 12] as T3, speed: 30, damage: 25, stun: 0.6 },
  leap: { dist: [10, 13, 13] as T3, damage: [35, 55, 55] as T3, radius: 4, up: 12, lift: 0.6 },
  whirl: { dur: [2.5, 3.5, 3.5] as T3, damage: [12, 18, 18] as T3, every: 0.3, radius: 3 },
  overpower: { dur: [5, 7, 7] as T3, dmg: 0.3, lifesteal: [0.1, 0.2, 0.2] as T3 },
  /** `perSpear`: damage to a target for each spear stuck in it; `damage`: to others on the way back. */
  recall: { damage: [25, 40, 40] as T3, perSpear: 15, slow: { share: 0.4, t: 2 } },
};

const SKILLS: Record<string, SkillDef> = {
  second: {
    id: 'second',
    name: 'İkinci kılıç',
    desc: 'Bir süreliğine 2. lazer kılıcını çekip iki kılıçla saldırırsın (daha hızlı yakın dövüş).',
    tiers: ['5 sn çift kılıç', 'Süre 7 sn, saldırı daha hızlı', 'Her vuruş kısa menzilli bir lazer dalgası fırlatır'],
    weapon: 'melee',
    cooldown: () => 14,
    cast: (s) => {
      secondT = byTier(s.tier, FNUM.second.dur);
      return true;
    },
  },
  rain: {
    id: 'rain',
    name: 'Mızrak yağmuru',
    desc: 'Nişangâhtaki noktaya tepeden mızraklar indirir.',
    tiers: ['3.5 m alan, 40 hasar', 'Alan 5 m, hasar 60', 'Mızraklar 3 sn yerde kalır, geçen rakibi elektrikle yavaşlatır'],
    cooldown: () => 12,
    cast: (s) => {
      const p = host.aimPoint(FNUM.rain.range);
      if (flatDist(p, G.player.pos) > FNUM.rain.range + 0.5) {
        host.message('Çok uzak');
        return false;
      }
      const at = new Vector3(p.x, p.y, p.z);
      const r = byTier(s.tier, FNUM.rain.radius);
      areaFx(at, r, '#ffb14a', FNUM.rain.delay, 0.25);
      pending.push({ at, r, t: FNUM.rain.delay, tier: s.tier });
      return true;
    },
  },
  eshield: {
    id: 'eshield',
    name: 'Enerji kalkanı',
    desc: 'Önünde mermileri ve vuruşları bloklayan bir enerji kalkanı açar.',
    tiers: ['3 sn, 80 dayanıklılık', 'Süre 5 sn', 'Dayanıklılık 140. Bloklanan hasar kapanınca öne şok dalgası olarak fırlar'],
    cooldown: () => 14,
    cast: (s) => {
      eshieldT = byTier(s.tier, FNUM.eshield.dur);
      eshieldHp = byTier(s.tier, FNUM.eshield.hp);
      stored = 0;
      return true;
    },
  },
  chain: {
    id: 'chain',
    name: 'Zincirli mızrak',
    desc: 'Zincire bağlı bir mızrak fırlatır, vurduğu rakibi kendine çeker.',
    tiers: ['16 m menzil, 10 sn bekleme', 'Menzil 20 m, bekleme 7 sn', 'Çekilen rakip 1 sn yavaşlar'],
    cooldown: (t) => byTier(t, [10, 7, 7]),
    cast: (s) => {
      const { hits, point, from } = hitscan(byTier(s.tier, FNUM.chain.range));
      beamFx(from, point, '#c9c9c9', 0.25, 0.06);
      sfx.throw();
      const t = hits[0];
      if (!t) return true;
      const fwd = forwardFromYaw(G.player.yaw);
      const dest = G.player.pos.add(fwd.scale(G.player.radius + t.radius + 0.6));
      push(t, dest.subtract(t.pos), flatDist(dest, t.pos));
      dealDamage(G.player, t, FNUM.chain.damage);
      if (s.tier === 3) slowUnit(t, FNUM.chain.slow.share, FNUM.chain.slow.t);
      return true;
    },
  },
  pierce: {
    id: 'pierce',
    name: 'Delici mızrak',
    desc: 'Düz hatta birden fazla rakibi delen güçlü bir mızrak. Arkasında 3 m içinde duvar, ağaç ya da kutu olan rakibi oraya çiviler: yakından 1.5 sn, 40 m\'den 0.25 sn.',
    tiers: ['60 hasar, 11 sn bekleme', 'Hasar 80, bekleme 8 sn', 'Mızrak düştüğü yerden eline geri döner, yolda çarptığı rakiplere de vurur'],
    cooldown: (t) => byTier(t, [11, 8, 8]),
    cast: (s) => {
      const dmg = byTier(s.tier, FNUM.pierce.damage);
      const { hits, point, from, dir } = hitscan(FNUM.pierce.range, enemyOfPlayer, 8);
      beamFx(from, point, '#ffd27a', 0.2, 0.12);
      sfx.throw();
      kick(0.02, 0.12, 0.03, 0.1);
      const N = FNUM.pierce;
      for (const u of hits) {
        dealDamage(G.player, u, dmg, { at: chest(u) });
        if (u.alive && obstacleWithin(u, dir, N.wallGap)) {
          const d = flatDist(G.player.pos, u.pos);
          const k = Math.min(1, Math.max(0, (d - N.near) / (N.range - N.near)));
          stun(u, N.pinNear + (N.pinFar - N.pinNear) * k);
          puff(u.pos, '#ffd27a', 0.8);
        }
      }
      if (s.tier === 3) returning.push({ from: point.clone(), t: 0, dmg: dmg * 0.5, hit: [], slow: false });
      return true;
    },
  },
  charge: {
    id: 'charge',
    name: 'Hücum',
    desc: 'Jet destekli ileri atılış. Çarptığın rakip sersemler.',
    tiers: ['9 m, 10 sn bekleme', 'Mesafe 12 m, bekleme 7 sn', '2. stack (sersemletme artmaz)'],
    cooldown: (t) => byTier(t, [10, 7, 7]),
    charges: (t) => byTier(t, [1, 1, 2]),
    cast: (s) => {
      chargeLeft = byTier(s.tier, FNUM.charge.dist);
      chargeDir = forwardFromYaw(G.player.yaw);
      chargeHit = [];
      return true;
    },
  },
  leap: {
    id: 'leap',
    name: 'Jet sıçrayışı',
    desc: 'Sırtındaki jetle nişangâhtaki noktaya fırlayıp yere çakılırsın: alan hasarı.',
    tiers: ['10 m, 35 hasar', 'Menzil 13 m, hasar 55', 'Yere çakılınca rakipleri havaya kaldırır'],
    cooldown: () => 12,
    cast: (s) => {
      const p = host.aimPoint(byTier(s.tier, FNUM.leap.dist));
      const d = Math.min(flatDist(p, G.player.pos), byTier(s.tier, FNUM.leap.dist));
      const dir = p.subtract(G.player.pos);
      dir.y = 0;
      leap = { dir: dir.lengthSquared() > 0 ? dir.normalize() : forwardFromYaw(G.player.yaw), left: d, tier: s.tier, air: false };
      host.launch(FNUM.leap.up);
      puff(G.player.pos, '#ff9a3b');
      return true;
    },
  },
  whirl: {
    id: 'whirl',
    name: 'Kılıç kasırgası',
    desc: 'Lazer kılıcınla dönerek etrafındaki herkese vurursun. Dönerken yavaşlarsın.',
    tiers: ['2.5 sn, 12 hasar/vuruş', 'Süre 3.5 sn, hasar 18', 'Dönerken tam hızla hareket edebilirsin'],
    weapon: 'melee',
    cooldown: () => 11,
    cast: (s) => {
      whirlT = byTier(s.tier, FNUM.whirl.dur);
      whirlTick = 0;
      return true;
    },
  },
  overpower: {
    id: 'overpower',
    name: 'Aşırı güç',
    desc: 'Bir süre hasarın %30 artar ve can çalman güçlenir.',
    tiers: ['5 sn, can çalma +%10', 'Süre 7 sn, can çalma +%20', 'Kullanınca üzerindeki sersemletme ve yavaşlatmaları temizler'],
    cooldown: () => 18,
    cast: (s) => {
      overT = byTier(s.tier, FNUM.overpower.dur);
      if (s.tier === 3) {
        G.player.stunT = 0;
        G.player.slowT = 0;
        G.player.slowMul = 1;
      }
      puff(G.player.pos, '#ff6a3b', 1.4);
      return true;
    },
  },
  recall: {
    id: 'recall',
    name: 'Mızrak geri çağırma',
    desc: 'Rakiplere saplanmış tüm mızraklarını eline geri çekersin. Saplı her mızrak 15 hasar verir; dönerken yoldaki rakiplere de vurur.',
    tiers: ['25 hasar, 10 sn bekleme', 'Hasar 40, bekleme 7 sn', 'Geri dönerken çarptığı rakipleri 2 sn %40 yavaşlatır'],
    cooldown: (t) => byTier(t, [10, 7, 7]),
    blocked: () => (stuck.length ? null : 'Saplı mızrak yok'),
    cast: (s) => {
      for (const sp of stuck) {
        if (sp.on.alive) {
          dealDamage(G.player, sp.on, FNUM.recall.perSpear, { at: sp.mesh.position.clone() });
          if (s.tier === 3) slowUnit(sp.on, FNUM.recall.slow.share, FNUM.recall.slow.t);
        }
        returning.push({ from: sp.mesh.position.clone(), t: 0, dmg: byTier(s.tier, FNUM.recall.damage), hit: [sp.on], slow: s.tier === 3 });
        sp.mesh.dispose();
      }
      stuck = [];
      spears = FIGHTER.spear.count;
      spearRegen = 0;
      return true;
    },
  },
};

const PLAYSTYLES = [
  { id: 'dual', name: 'Çift kılıç (yakın)', skill: 'second', weapon: 'melee' as Weapon },
  { id: 'spear', name: 'Mızrakçı (uzak)', skill: 'rain', weapon: 'ranged' as Weapon },
  { id: 'fort', name: 'Kale (savunma)', skill: 'eshield', weapon: 'melee' as Weapon },
];

// ---- State -----------------------------------------------------------------------
let shieldT = 0;
let secondT = 0;
let eshieldT = 0;
let eshieldHp = 0;
let stored = 0;
let chargeLeft = 0;
let chargeDir = new Vector3();
let chargeHit: Unit[] = [];
let leap: { dir: Vector3; left: number; tier: number; air: boolean } | null = null;
let whirlT = 0;
let whirlTick = 0;
let overT = 0;
let spears: number = FIGHTER.spear.count;
let spearRegen = 0;
let swingSide = 1;
let pending: { at: Vector3; r: number; t: number; tier: number }[] = [];
type Flying = { mesh: Mesh; vel: Vector3; life: number };
let flying: Flying[] = [];
/** Spears stuck in enemies (they ride along until recalled, the target dies, or they time out). */
let stuck: { mesh: Mesh; on: Unit; t: number; off: Vector3 }[] = [];
/** Missed spears lying on the ground for a moment before they fade. */
let dropped: { mesh: Mesh; t: number }[] = [];
let returning: { from: Vector3; t: number; dmg: number; hit: Unit[]; slow: boolean }[] = [];
let shieldMesh: Mesh | null = null;
let whirlMesh: Mesh | null = null;
let secondBlade: Mesh | null = null;

function reset() {
  shieldT = 0;
  secondT = eshieldT = eshieldHp = stored = chargeLeft = whirlT = overT = 0;
  leap = null;
  spears = FIGHTER.spear.count;
  spearRegen = 0;
  pending = [];
  for (const f of flying) f.mesh.dispose();
  for (const s of stuck) s.mesh.dispose();
  for (const s of dropped) s.mesh.dispose();
  flying = [];
  stuck = [];
  dropped = [];
  returning = [];
}

// ---- Weapons ---------------------------------------------------------------------
function swingSword(): number {
  const S = FIGHTER.sword;
  swingSide *= -1;
  const two = secondT > 0;
  sweep(S.range, S.arcDeg, S.damage, '#ff9a3b', { tilt: swingSide * 0.4 });
  if (two && ownedTier('second') === 3) {
    const { from, dir } = { from: chest(G.player).add(forwardFromYaw(G.player.yaw).scale(0.8)), dir: forwardFromYaw(G.player.yaw) };
    fireBullet(G.player, from, dir, 40, FNUM.second.wave.range, FNUM.second.wave.damage, '#ffb14a', false, 0.25);
  }
  return S.rate * (two ? byTier(ownedTier('second') as 1 | 2 | 3, FNUM.second.rate) : 1);
}

function throwSpear(): number {
  const S = FIGHTER.spear;
  if (spears <= 0) {
    sfx.empty();
    return 0.25;
  }
  spears -= 1;
  const from = host.muzzle().addInPlaceFromFloats(0, 0.25, 0);
  const dir = host.aimPoint(S.range).subtract(from).normalize();
  const mesh = MeshBuilder.CreateBox('spear', { width: 0.08, height: 0.08, depth: 1.5 }, G.scene);
  mesh.material = glowMat('#ffd27a', 0.95);
  mesh.isPickable = false;
  mesh.position.copyFrom(from);
  mesh.lookAt(from.add(dir));
  flying.push({ mesh, vel: dir.scale(S.speed), life: S.range / S.speed });
  sfx.throw();
  kick(0.012, 0.1, 0.02, 0.05);
  return S.rate;
}

function updateSpears(dt: number) {
  const S = FIGHTER.spear;
  flying = flying.filter((f) => {
    const steps = Math.max(1, Math.ceil((f.vel.length() * dt) / 0.4));
    const inc = f.vel.scale(dt / steps);
    for (let i = 0; i < steps; i++) {
      f.mesh.position.addInPlace(inc);
      const p = f.mesh.position;
      if (pointHitsObstacle(p, G.world.boxes) || p.y < 0.05) {
        dropSpear(f.mesh);
        G.hooks.impact(p.clone(), '#ffd27a');
        return false;
      }
      for (const u of G.units) {
        if (!hostile(G.player, u) || u.team === 0) continue;
        if (p.y > u.pos.y - 0.1 && p.y < u.pos.y + u.height + 0.1 && flatDist(p, u.pos) < u.radius + 0.15) {
          dealDamage(G.player, u, S.damage, { at: p.clone() });
          // The spear sticks in the target and rides along.
          stickSpear(f.mesh, u, f.vel);
          return false;
        }
      }
    }
    f.life -= dt;
    if (f.life <= 0) {
      dropSpear(f.mesh);
      return false;
    }
    return true;
  });
  // A spear comes back on its own after a while.
  if (spears < S.count) {
    spearRegen += dt;
    if (spearRegen >= S.regen) {
      spearRegen = 0;
      spears += 1;
    }
  } else spearRegen = 0;
  dropped = dropped.filter((d) => {
    d.t += dt;
    if (d.t < SPEAR_DROP_LIFE) return true;
    d.mesh.dispose();
    return false;
  });
  stuck = stuck.filter((s) => {
    s.t += dt;
    if (s.on.alive && s.t < SPEAR_STUCK_LIFE) {
      s.mesh.position.copyFrom(s.on.pos).addInPlace(s.off);
      return true;
    }
    s.mesh.dispose();
    return false;
  });
  // Returning spears fly to the player and hit whoever is on the way.
  returning = returning.filter((r) => {
    r.t += dt * 2.5;
    const k = Math.min(1, r.t);
    const p = Vector3.Lerp(r.from, chest(G.player), k);
    for (const u of enemiesNear(p, 0.9)) {
      if (r.hit.includes(u)) continue;
      r.hit.push(u);
      dealDamage(G.player, u, r.dmg, { at: chest(u) });
      if (r.slow) slowUnit(u, FNUM.recall.slow.share, FNUM.recall.slow.t);
    }
    beamFx(Vector3.Lerp(r.from, chest(G.player), Math.max(0, k - 0.08)), p, '#ffd27a', dt * 1.5, 0.1);
    return k < 1;
  });
}

/** At most this many spears stick in one target; missed spears fade after a moment. */
const SPEAR_MAX_PER_TARGET = 8;
const SPEAR_STUCK_LIFE = 15;
const SPEAR_DROP_LIFE = 1;

function stickSpear(mesh: Mesh, on: Unit, vel: Vector3) {
  mesh.material = glowMat('#ffd27a', 0.6);
  // Half sunk in, it rides along with the target.
  mesh.position.addInPlace(vel.normalizeToNew().scale(0.35));
  stuck.push({ mesh, on, t: 0, off: mesh.position.subtract(on.pos) });
  const mine = stuck.filter((s) => s.on === on);
  if (mine.length > SPEAR_MAX_PER_TARGET) {
    mine[0].mesh.dispose();
    stuck.splice(stuck.indexOf(mine[0]), 1);
  }
}

function dropSpear(mesh: Mesh) {
  mesh.material = glowMat('#ffd27a', 0.4);
  dropped.push({ mesh, t: 0 });
}

// ---- Per frame ---------------------------------------------------------------------
function update(dt: number) {
  updateCooldowns(dt);
  // Passive 1: shield generator.
  shieldT += dt;
  if (shieldT >= FIGHTER.shieldEvery) {
    shieldT = 0;
    P.shield = Math.min(FIGHTER.shieldCap, P.shield + FIGHTER.shieldAmount);
  }
  secondT = Math.max(0, secondT - dt);
  overT = Math.max(0, overT - dt);

  if (eshieldT > 0) {
    eshieldT -= dt;
    if (eshieldT <= 0 || eshieldHp <= 0) closeShield();
  }

  // Spear rain lands after a short delay.
  pending = pending.filter((r) => {
    r.t -= dt;
    if (r.t > 0) return true;
    for (const u of enemiesNear(r.at, r.r)) dealDamage(G.player, u, byTier(r.tier as 1 | 2 | 3, FNUM.rain.damage), { noBackstab: true });
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const p = r.at.add(new Vector3(Math.cos(a) * r.r * 0.6, 0, Math.sin(a) * r.r * 0.6));
      beamFx(p.add(new Vector3(0, 6, 0)), p, '#ffd27a', 0.25, 0.1);
    }
    areaFx(r.at, r.r, '#ffb14a', 0.3, 0.45);
    sfx.boom();
    if (r.tier === 3) addZone('spikes', r.at, r.r, FNUM.rain.spikes.t, '#ffe27a', 0.25);
    return false;
  });
  for (const z of zones) {
    if (z.kind !== 'spikes') continue;
    z.tick = (z.tick ?? 0) - dt;
    if (z.tick > 0) continue;
    z.tick = 0.5;
    for (const u of enemiesNear(z.pos, z.radius)) {
      slowUnit(u, FNUM.rain.spikes.slow, 0.6);
      dealDamage(G.player, u, FNUM.rain.spikes.dps * 0.5, { noBackstab: true });
    }
  }

  // Charge: fly forward, stun the first enemy in the way.
  if (chargeLeft > 0) {
    const step = Math.min(chargeLeft, FNUM.charge.speed * dt);
    const blocked = push(G.player, chargeDir, step);
    chargeLeft -= step;
    for (const u of enemiesNear(G.player.pos, 1.2)) {
      if (chargeHit.includes(u)) continue;
      chargeHit.push(u);
      dealDamage(G.player, u, FNUM.charge.damage);
      stun(u, FNUM.charge.stun);
      addShake(0.15);
      chargeLeft = 0;
    }
    if (blocked) chargeLeft = 0;
    if (Math.random() < 0.5) puff(G.player.pos, '#ff9a3b', 0.5);
  }

  // Jet leap: fly to the point, slam on landing.
  if (leap) {
    const step = Math.min(leap.left, 14 * dt);
    if (step > 0) {
      push(G.player, leap.dir, step);
      leap.left -= step;
    }
    if (!host.grounded()) leap.air = true;
    else if (leap.air) {
      const tier = leap.tier as 1 | 2 | 3;
      for (const u of enemiesNear(G.player.pos, FNUM.leap.radius)) {
        dealDamage(G.player, u, byTier(tier, FNUM.leap.damage), { noBackstab: true });
        if (tier === 3) {
          u.velY = 9;
          u.pos.y += 0.1;
          stun(u, FNUM.leap.lift);
        }
      }
      areaFx(G.player.pos, FNUM.leap.radius, '#ff9a3b', 0.35, 0.5);
      sfx.boom();
      addShake(0.35);
      leap = null;
    }
  }

  // Blade storm: hit everyone around a few times a second.
  if (whirlT > 0) {
    whirlT -= dt;
    whirlTick -= dt;
    if (whirlTick <= 0) {
      whirlTick = FNUM.whirl.every;
      for (const u of meleeTargets(FNUM.whirl.radius, 360)) dealDamage(G.player, u, byTier(ownedTier('whirl') as 1 | 2 | 3, FNUM.whirl.damage));
      sfx.swing();
    }
  }

  updateSpears(dt);
  updateVisuals();
}

function closeShield() {
  // Tier 3: what the shield soaked up flies forward as a shock wave.
  if (ownedTier('eshield') === 3 && stored > 0) {
    const fwd = forwardFromYaw(G.player.yaw);
    for (const u of meleeTargets(FNUM.eshield.wave.range, 70)) {
      dealDamage(G.player, u, stored * FNUM.eshield.wave.share, { noBackstab: true });
      push(u, fwd, 2);
    }
    areaFx(G.player.pos.add(fwd.scale(3)), 3, '#7ad7ff', 0.3, 0.45);
    addShake(0.2);
  }
  eshieldT = 0;
  eshieldHp = 0;
  stored = 0;
}

function updateVisuals() {
  if (eshieldT > 0 && !shieldMesh) {
    shieldMesh = MeshBuilder.CreateDisc('eshield', { radius: 1.2, tessellation: 24 }, G.scene);
    shieldMesh.material = glowMat('#7ad7ff', 0.35);
    shieldMesh.isPickable = false;
  }
  if (shieldMesh) {
    if (eshieldT <= 0) {
      shieldMesh.dispose();
      shieldMesh = null;
    } else {
      const f = forwardFromYaw(G.player.yaw);
      shieldMesh.position.copyFrom(G.player.pos.add(f.scale(0.9))).addInPlaceFromFloats(0, 1.1, 0);
      shieldMesh.rotation.y = G.player.yaw;
    }
  }
  if (whirlT > 0 && !whirlMesh) {
    whirlMesh = MeshBuilder.CreateDisc('whirl', { radius: FNUM.whirl.radius, tessellation: 28 }, G.scene);
    whirlMesh.material = glowMat('#ff9a3b', 0.25);
    whirlMesh.rotation.x = Math.PI / 2;
    whirlMesh.isPickable = false;
  }
  if (whirlMesh) {
    if (whirlT <= 0) {
      whirlMesh.dispose();
      whirlMesh = null;
    } else {
      whirlMesh.position.copyFrom(G.player.pos).addInPlaceFromFloats(0, 1, 0);
      whirlMesh.rotation.y += 0.5;
    }
  }
  if (secondBlade) secondBlade.isVisible = secondT > 0;
}

function buildWeapons(root: TransformNode) {
  const melee = new TransformNode('fighter-sword', G.scene);
  melee.parent = root;
  weaponPart('hilt', melee, { w: 0.08, h: 0.08, d: 0.25 }, [0.45, 1.15, 0.55], '#3a3a3a', false);
  weaponPart('blade', melee, { w: 0.07, h: 0.07, d: 1.3 }, [0.45, 1.15, 1.3], '#ff9a3b');
  secondBlade = weaponPart('blade2', melee, { w: 0.07, h: 0.07, d: 1.3 }, [-0.45, 1.15, 1.2], '#ff9a3b');
  secondBlade.isVisible = false;
  const ranged = new TransformNode('fighter-spear', G.scene);
  ranged.parent = root;
  weaponPart('spear-shaft', ranged, { w: 0.06, h: 0.06, d: 1.6 }, [0.46, 1.25, 0.35], '#5a4a3a', false);
  weaponPart('spear-tip', ranged, { w: 0.1, h: 0.1, d: 0.32 }, [0.46, 1.25, 1.3], '#ffd27a');
  return { ranged, melee };
}

export const FIGHTER_KIT: ClassKit = {
  id: 'fighter',
  name: 'Fighter',
  blurb: 'Lazer kılıç ve enerji mızrakları. Dayanıklı, can çalan ön saf.',
  stats: FIGHTER.stats,
  dash: { anim: 'dash_fighter', speed: 30, time: 0.2, cd: 1.1, color: '#ff9a3b' },
  weaponNames: { ranged: 'Enerji mızrakları', melee: 'Lazer kılıcı' },
  passives: ['Kalkan jeneratörü: 10 sn\'de bir 20 kalkan', 'Can çalma: verdiğin hasarın %7\'si'],
  skills: SKILLS,
  playstyles: PLAYSTYLES,
  buildWeapons,
  reset,
  update,
  attack: (w) => (w === 'ranged' ? throwSpear() : swingSword()),
  weaponText: (w) => (w === 'ranged' ? `Enerji mızrakları ${spears}/${FIGHTER.spear.count}` : secondT > 0 ? 'Çift lazer kılıcı' : 'Lazer kılıcı'),
  buffs() {
    const b: string[] = [];
    if (secondT > 0) b.push(`Çift kılıç ${secondT.toFixed(1)}`);
    if (eshieldT > 0) b.push(`Enerji kalkanı ${Math.ceil(eshieldHp)}`);
    if (overT > 0) b.push(`Aşırı güç ${overT.toFixed(1)}`);
    if (whirlT > 0) b.push('Kasırga');
    return b;
  },
  speedMult: () => (whirlT > 0 && ownedTier('whirl') < 3 ? 0.5 : 1),
  outgoing: (_t, dmg) => ({ dmg: overT > 0 ? dmg * (1 + FNUM.overpower.dmg) : dmg, crit: false }),
  incoming(dmg, src) {
    // The energy shield blocks what comes from the front.
    if (eshieldT > 0 && eshieldHp > 0 && src) {
      const to = src.pos.subtract(G.player.pos);
      to.y = 0;
      const f = forwardFromYaw(G.player.yaw);
      const ang = to.lengthSquared() > 0 ? (Math.acos(Math.max(-1, Math.min(1, Vector3.Dot(to.normalize(), f)))) * 180) / Math.PI : 0;
      if (ang <= FNUM.eshield.arcDeg / 2) {
        const a = Math.min(eshieldHp, dmg);
        eshieldHp -= a;
        stored += a;
        dmg -= a;
      }
    }
    return dmg;
  },
  afterHit(_t, dmg) {
    // Passive 2: lifesteal (stronger while Overpower is on).
    const share = FIGHTER.lifesteal + (overT > 0 ? byTier(ownedTier('overpower') as 1 | 2 | 3, FNUM.overpower.lifesteal) : 0);
    G.player.hp = Math.min(G.player.maxHp, G.player.hp + dmg * share);
  },
};
registerKit(FIGHTER_KIT);
