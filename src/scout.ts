import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { forwardFromYaw, rightFromYaw } from './actors';
import { SCOUT } from './balance';
import { G, applyDot, chest, dealDamage, fireBullet, flatDist, glowMat, makeUnit, stun, type Unit } from './core';
import { addShake, kick, muzzleFlash, sfx } from './feel';
import {
  addZone,
  allies,
  allyChase,
  allyFollow,
  areaFx,
  beamFx,
  byTier,
  enemiesNear,
  enemyOfPlayer,
  hitscan,
  host,
  meleeTarget,
  nearestEnemy,
  ownedTier,
  partsBody,
  puff,
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
 * Scout (design doc 2.2): a post-apocalyptic hunter with claws and a sniper rifle and a
 * cybernetic wolf at their side. Passives: the companion and the high ground bonus.
 */

type T3 = [number, number, number];
export const SNUM = {
  shotgun: { blasts: [2, 2, 4] as T3, pellets: 6, spread: 0.09, damage: 8, range: 12 },
  hook: { range: [18, 24, 24] as T3, speed: 32 },
  fast: { shots: [1, 1, 2] as T3 },
  smoke: { range: 22, radius: 4, damage: [25, 40, 40] as T3, dur: 8 },
  pack: { count: [1, 2, 2] as T3, haste: { mult: 1.2, t: 5 } },
  hunt: { dur: [6, 9, 9] as T3, bonus: [0.2, 0.3, 0.3] as T3, range: 45 },
  pounce: { range: [10, 13, 13] as T3, damage: [30, 45, 45] as T3, speed: 28, down: 0.5 },
  rend: { hits: [5, 7, 7] as T3, damage: 8, bleed: 8, bleedT: 4, every: 0.15 },
  drone: { dur: [10, 15, 15] as T3, radius: [14, 20, 20] as T3 },
  trap: { max: [2, 3, 3] as T3, root: [1.5, 2.2, 2.2] as T3, damage: 10, trigger: 1.2, range: 16 },
};

const SKILLS: Record<string, SkillDef> = {
  shotgun: {
    id: 'shotgun',
    name: 'Switch weapons',
    desc: 'Eline kısa mesafeli bir pompalı çekip öne doğru hızlıca iki el ateş edersin.',
    tiers: ['2 pompalı atışı, 9 sn bekleme', 'Bekleme 6 sn', 'İki eline birer pompalı: 4 atış'],
    cooldown: (t) => byTier(t, [9, 6, 6]),
    cast: (s) => {
      burst = { left: byTier(s.tier, SNUM.shotgun.blasts), t: 0 };
      return true;
    },
  },
  hook: {
    id: 'hook',
    name: 'Kanca',
    desc: 'Nişangâhtaki duvara ya da çatıya kanca atıp oraya çekilirsin.',
    tiers: ['18 m, 10 sn bekleme', 'Menzil 24 m, bekleme 7 sn', '2 şarj'],
    cooldown: (t) => byTier(t, [10, 7, 7]),
    charges: (t) => byTier(t, [1, 1, 2]),
    cast: (s) => {
      const range = byTier(s.tier, SNUM.hook.range);
      const p = host.aimPoint(range, true);
      const d = Vector3.Distance(p, chest(G.player));
      if (d > range || d < 2) {
        host.message('Kanca menzilde bir yere tutunamadı');
        return false;
      }
      // Stop just short of the surface, a little higher so the player can climb on top.
      const back = host.aimDir().scale(-0.6);
      hook = { to: p.add(back).addInPlaceFromFloats(0, 0.4, 0), from: G.player.pos.clone() };
      return true;
    },
  },
  fast: {
    id: 'fast',
    name: 'Fast charge',
    desc: 'Sniper\'ın sıradaki atışı dürbün beklemeden tam dolu çıkar.',
    tiers: ['1 dolu atış, 12 sn bekleme', 'Bekleme 9 sn', 'Anında bir dolu atış daha (2 atış)'],
    cooldown: (t) => byTier(t, [12, 9, 9]),
    weapon: 'ranged',
    cast: (s) => {
      fullShots = byTier(s.tier, SNUM.fast.shots);
      return true;
    },
  },
  smoke: {
    id: 'smoke',
    name: 'Smoke bomb',
    desc: 'Hasar veren ve etrafı dumanla kaplayan bomba. Duman içindekileri dışarıdan gizler.',
    tiers: ['8 sn duman, 25 hasar', 'Hasar 40', 'Dumanın içindeki rakiplerin silüetini görürsün'],
    cooldown: () => 14,
    cast: (s) => {
      const p = host.aimPoint(SNUM.smoke.range);
      const at = flatDist(p, G.player.pos) > SNUM.smoke.range ? G.player.pos.add(forwardFromYaw(G.player.yaw).scale(SNUM.smoke.range)) : p;
      for (const u of enemiesNear(at, SNUM.smoke.radius)) dealDamage(G.player, u, byTier(s.tier, SNUM.smoke.damage), { noBackstab: true });
      areaFx(at, SNUM.smoke.radius, '#c8c0b0', 0.3, 0.5);
      sfx.boom();
      addZone('smoke', at, SNUM.smoke.radius, SNUM.smoke.dur, '#8c8577', 0.45);
      return true;
    },
  },
  pack: {
    id: 'pack',
    name: 'Sürü çağrısı',
    desc: 'Ek sibernetik hayvanlar çağırır; ölene kadar seninle kalırlar. Hayvanlar yaşarken tekrar kullanırsan hepsi yanında yenilenir.',
    tiers: ['1 hayvan, 25 sn bekleme', '2 hayvan', 'Ölmüş yoldaşını da çağırır; sen dahil tüm yaratıklar 5 sn hızlanır'],
    cooldown: () => 25,
    cast: (s) => {
      const want = byTier(s.tier, SNUM.pack.count);
      const pack = allies('pack');
      // Recast: everyone comes back at your side, healed.
      for (const w of pack) {
        w.pos.copyFrom(G.player.pos.add(rightFromYaw(G.player.yaw).scale(1.2)));
        w.hp = w.maxHp;
        puff(w.pos, '#7be36f', 0.8);
      }
      for (let i = pack.length; i < want; i++) spawnWolf('pack', i % 2 ? -1 : 1);
      if (s.tier === 3) {
        if (!allies('wolf').length) {
          spawnWolf('wolf', 1);
          companionWait = 0;
        }
        hasteT = SNUM.pack.haste.t;
      }
      return true;
    },
  },
  hunt: {
    id: 'hunt',
    name: 'Av emri',
    desc: 'Nişangâhtaki rakibi işaretler: yoldaşların ona saldırır, duvar arkasından görünür ve daha fazla hasar alır.',
    tiers: ['6 sn, +%20 hasar', 'Süre 9 sn, +%30 hasar', 'İşaretli rakip ölünce işaret en yakın rakibe geçer'],
    cooldown: () => 14,
    cast: (s) => {
      const t = targetUnderCrosshair(SNUM.hunt.range, 10, enemyOfPlayer, false);
      if (!t) {
        host.message('Nişangâhta rakip yok');
        return false;
      }
      mark(t, byTier(s.tier, SNUM.hunt.dur), true);
      return true;
    },
  },
  pounce: {
    id: 'pounce',
    name: 'Pençe atılması',
    desc: 'Nişangâhtaki rakibe doğru sıçrayıp pençeyle vurursun.',
    tiers: ['10 m, 30 hasar', 'Menzil 13 m, hasar 45', 'Vurduğun rakibi 0.5 sn yere serer'],
    cooldown: () => 9,
    weapon: 'melee',
    cast: (s) => {
      const t = targetUnderCrosshair(byTier(s.tier, SNUM.pounce.range), 16, enemyOfPlayer);
      if (!t) {
        host.message('Menzilde rakip yok');
        return false;
      }
      pounce = { t, tier: s.tier, time: 0.8 };
      host.launch(5);
      return true;
    },
  },
  rend: {
    id: 'rend',
    name: 'Parçalama',
    desc: 'Önündeki rakibe hızlı bir pençe serisi: her vuruş kanama bırakır.',
    tiers: ['5 vuruş, 8 hasar/sn kanama', 'Seri 7 vuruş', 'Kanayan rakip iyileşemez'],
    cooldown: () => 10,
    weapon: 'melee',
    cast: (s) => {
      const t = meleeTarget(SCOUT.claws.range + 0.6, 120);
      if (!t) {
        host.message('Menzilde rakip yok');
        return false;
      }
      rend = { t, left: byTier(s.tier, SNUM.rend.hits), tick: 0, tier: s.tier };
      return true;
    },
  },
  drone: {
    id: 'drone',
    name: 'Gözcü drone',
    desc: 'Bir bölgenin üstünde dolaşıp oradaki rakipleri duvar arkasından gösteren drone.',
    tiers: ['10 sn, 14 m alan', 'Süre 15 sn, alan 20 m', 'Drone gördüğü rakiplere işaret koyar (Av emri etkisi)'],
    cooldown: () => 20,
    cast: (s) => {
      const p = host.aimPoint(40);
      const at = flatDist(p, G.player.pos) > 40 ? G.player.pos.clone() : p;
      drone?.mesh.dispose();
      const mesh = MeshBuilder.CreateBox('drone', { width: 0.7, height: 0.15, depth: 0.7 }, G.scene);
      mesh.material = glowMat('#7be36f', 0.9);
      mesh.isPickable = false;
      drone = { at: new Vector3(at.x, 0, at.z), t: byTier(s.tier, SNUM.drone.dur), r: byTier(s.tier, SNUM.drone.radius), tier: s.tier, mesh };
      return true;
    },
  },
  trap: {
    id: 'trap',
    name: 'Elektrik tuzağı',
    desc: 'Yere gizli bir tuzak koyarsın. Basan rakip yerinde çakılı kalır.',
    tiers: ['Aynı anda 2 tuzak, 1.5 sn', 'Çakılma 2.2 sn', 'Aynı anda 3 tuzak; tuzağa basan rakip yoldaşının hedefi olur'],
    cooldown: () => 8,
    charges: () => 2,
    cast: (s) => {
      const p = host.aimPoint(SNUM.trap.range);
      const at = flatDist(p, G.player.pos) > SNUM.trap.range ? G.player.pos.clone() : p;
      const mine = zones.filter((z) => z.kind === 'trap' && z.t > 0);
      if (mine.length >= byTier(s.tier, SNUM.trap.max)) {
        mine[0].mesh.dispose();
        mine[0].t = 0;
      }
      addZone('trap', new Vector3(at.x, Math.max(0, at.y - 0.05), at.z), 0.7, 90, '#7be36f', 0.35, { tier: s.tier, armT: 0.6 });
      return true;
    },
  },
};

const PLAYSTYLES = [
  { id: 'pack', name: 'Sürü (yoldaş)', skill: 'pack', weapon: 'ranged' as Weapon },
  { id: 'wild', name: 'Vahşi (pençe)', skill: 'pounce', weapon: 'melee' as Weapon },
  { id: 'sniper', name: 'Keskin nişancı', skill: 'fast', weapon: 'ranged' as Weapon },
];

// ---- State -------------------------------------------------------------------------
let ammo: number = SCOUT.sniper.magazine;
let reloadT = 0;
let fullShots = 0;
let companionWait = 0;
let lastHit: Unit | null = null;
let hasteT = 0;
let burst: { left: number; t: number } | null = null;
let hook: { to: Vector3; from: Vector3 } | null = null;
let pounce: { t: Unit; tier: number; time: number } | null = null;
let rend: { t: Unit; left: number; tick: number; tier: number } | null = null;
let drone: { at: Vector3; t: number; r: number; tier: number; mesh: Mesh } | null = null;
/** Marked enemies: time left and whether it is a full Hunt mark (bonus damage). */
const marks = new Map<Unit, { t: number; hunt: boolean; mesh: Mesh }>();

function reset() {
  ammo = SCOUT.sniper.magazine;
  reloadT = 0;
  fullShots = 0;
  companionWait = 0.5;
  lastHit = null;
  hasteT = 0;
  burst = null;
  hook = null;
  pounce = null;
  rend = null;
  drone?.mesh.dispose();
  drone = null;
  for (const m of marks.values()) m.mesh.dispose();
  marks.clear();
}

// ---- Weapons -------------------------------------------------------------------------
function reload() {
  if (reloadT > 0 || ammo >= SCOUT.sniper.magazine) return;
  reloadT = SCOUT.sniper.reload;
  sfx.reload();
}

/** Sniper charge from 0 to 1 (scope time, or full with Fast charge). */
function charge() {
  if (fullShots > 0) return 1;
  if (!host.isAiming()) return 0;
  return Math.min(1, host.aimTime() / SCOUT.sniper.chargeTime);
}

function snipe(): number {
  const S = SCOUT.sniper;
  if (reloadT > 0) return 0.05;
  if (ammo <= 0) {
    sfx.empty();
    reload();
    return 0.2;
  }
  const c = charge();
  if (fullShots > 0) fullShots -= 1;
  ammo -= 1;
  const dmg = S.minDamage + (S.maxDamage - S.minDamage) * c;
  const { hits, point, from } = hitscan(S.range);
  for (const u of hits) dealDamage(G.player, u, dmg, { at: point });
  beamFx(from, point, c >= 1 ? '#ffffff' : '#ffe9b0', 0.12, 0.05 + c * 0.05);
  muzzleFlash(from, '#ffe4a0');
  kick(0.03 + c * 0.03, 0.2, 0.05, 0.12 + c * 0.15);
  sfx.sniper(c);
  if (ammo <= 0) reload();
  return S.rate;
}

function claw(): number {
  const C = SCOUT.claws;
  sweep(C.range, C.arcDeg, C.damage, '#7be36f', { tilt: Math.random() - 0.5 });
  return C.rate;
}

// ---- Allies -------------------------------------------------------------------------
function spawnWolf(type: 'wolf' | 'pack', side: number) {
  const at = G.player.pos.add(rightFromYaw(G.player.yaw).scale(1.4 * side)).add(forwardFromYaw(G.player.yaw).scale(-0.8));
  const C = SCOUT.companion;
  const body = partsBody(`wolf${G.nextId}`, [
    { size: [0.5, 0.45, 1.1], pos: [0, 0.6, 0], color: '#4a5560' },
    { size: [0.36, 0.34, 0.45], pos: [0, 0.82, 0.68], color: '#59646f' },
    { size: [0.07, 0.07, 0.07], pos: [0.1, 0.9, 0.92], color: '#7be36f', glow: true },
    { size: [0.07, 0.07, 0.07], pos: [-0.1, 0.9, 0.92], color: '#7be36f', glow: true },
    { size: [0.12, 0.4, 0.12], pos: [0.17, 0.2, 0.38], color: '#3a434c' },
    { size: [0.12, 0.4, 0.12], pos: [-0.17, 0.2, 0.38], color: '#3a434c' },
    { size: [0.12, 0.4, 0.12], pos: [0.17, 0.2, -0.38], color: '#3a434c' },
    { size: [0.12, 0.4, 0.12], pos: [-0.17, 0.2, -0.38], color: '#3a434c' },
    { size: [0.08, 0.08, 0.5], pos: [0, 0.78, -0.72], color: '#7be36f', glow: true },
  ], '#7be36f');
  makeUnit('pet', type === 'wolf' ? 'Yoldaş kurt' : 'Sürü kurdu', body, at, 0, C.hp, {
    owner: G.player,
    radius: 0.45,
    height: 1.05,
    yaw: G.player.yaw,
    ai: { type, biteT: 0, side },
  });
  puff(at, '#7be36f', 0.9);
}

/** Who the beasts should go for: the hunted enemy, then what you last hit, then whatever bites them. */
function preyFor(w: Unit): Unit | null {
  const C = SCOUT.companion;
  let best: Unit | null = null;
  for (const [u, m] of marks) if (m.hunt && u.alive && flatDist(u.pos, w.pos) < C.range * 1.5) best = u;
  if (best) return best;
  if (lastHit?.alive && flatDist(lastHit.pos, w.pos) < C.range) return lastHit;
  return null;
}

function updateWolf(w: Unit, dt: number) {
  const C = SCOUT.companion;
  const speed = C.speed * (hasteT > 0 ? SNUM.pack.haste.mult : 1);
  w.ai!.biteT -= dt;
  const t = preyFor(w);
  if (t) {
    const d = allyChase(w, t, speed, 0.9, dt);
    if (d < 1.2 && w.ai!.biteT <= 0) {
      w.ai!.biteT = C.rate;
      dealDamage(w, t, C.damage, { noBackstab: true, at: chest(t) });
      sfx.swing();
    }
  } else allyFollow(w, dt, speed, w.ai!.side);
}

// ---- Marks ---------------------------------------------------------------------------
function mark(u: Unit, t: number, hunt: boolean) {
  const m = marks.get(u);
  if (m) {
    m.t = Math.max(m.t, t);
    m.hunt = m.hunt || hunt;
    return;
  }
  const mesh = MeshBuilder.CreatePolyhedron('mark', { type: 1, size: 0.18 }, G.scene);
  mesh.material = glowMat(hunt ? '#ff3b3b' : '#ffb14a');
  mesh.isPickable = false;
  // Drawn after everything else, so it shows through walls.
  mesh.renderingGroupId = 2;
  marks.set(u, { t, hunt, mesh });
}

function updateMarks(dt: number) {
  for (const [u, m] of [...marks]) {
    m.t -= dt;
    if (!u.alive) {
      // Hunt tier 3: the mark moves to the nearest enemy.
      if (m.hunt && ownedTier('hunt') === 3) {
        const next = nearestEnemy(u.pos, 25, (x) => x !== u);
        if (next) mark(next, m.t > 0 ? m.t : 3, true);
      }
      m.mesh.dispose();
      marks.delete(u);
      continue;
    }
    if (m.t <= 0) {
      m.mesh.dispose();
      marks.delete(u);
      continue;
    }
    m.mesh.position.copyFrom(u.pos).addInPlaceFromFloats(0, u.height + 0.6, 0);
    m.mesh.rotation.y += dt * 3;
  }
}

// ---- Per frame -------------------------------------------------------------------------
function update(dt: number) {
  updateCooldowns(dt);
  hasteT = Math.max(0, hasteT - dt);
  if (reloadT > 0) {
    reloadT -= dt;
    if (reloadT <= 0) ammo = SCOUT.sniper.magazine;
  }

  // Passive 1: the companion comes back on its own after dying.
  if (!allies('wolf').length) {
    companionWait -= dt;
    if (companionWait <= 0) {
      spawnWolf('wolf', 1);
      companionWait = SCOUT.companion.respawn;
    }
  }
  for (const w of [...allies('wolf'), ...allies('pack')]) updateWolf(w, dt);

  // Shotgun blasts.
  if (burst) {
    burst.t -= dt;
    if (burst.t <= 0) {
      const S = SNUM.shotgun;
      const from = host.muzzle();
      const aim = host.aimPoint(S.range).subtract(from).normalize();
      for (let i = 0; i < S.pellets; i++) {
        const d = aim.add(new Vector3((Math.random() - 0.5) * S.spread * 2, (Math.random() - 0.5) * S.spread, (Math.random() - 0.5) * S.spread * 2));
        fireBullet(G.player, from, d, 70, S.range, S.damage, '#ffd27a', false, 0.1);
      }
      muzzleFlash(from, '#ffc46a');
      kick(0.03, 0.18, 0.05, 0.18);
      sfx.shot();
      burst.left -= 1;
      burst.t = 0.22;
      if (burst.left <= 0) burst = null;
    }
  }

  // Grappling hook: pull the player to the anchor.
  if (hook) {
    const to = hook.to.subtract(G.player.pos);
    const d = to.length();
    beamFx(chest(G.player), hook.to, '#c9c9c9', dt * 1.5, 0.04);
    const step = SNUM.hook.speed * dt;
    if (d <= step + 0.2) {
      G.player.pos.copyFrom(hook.to);
      hook = null;
      host.launch(6);
    } else {
      G.player.pos.addInPlace(to.scale(step / d));
      G.player.velY = 0;
    }
  }

  // Pounce: fly at the target, claw on arrival.
  if (pounce) {
    pounce.time -= dt;
    const t = pounce.t;
    const to = t.pos.subtract(G.player.pos);
    to.y = 0;
    const d = to.length() - t.radius - G.player.radius;
    if (!t.alive || pounce.time <= 0) pounce = null;
    else if (d <= 0.5) {
      const tier = pounce.tier as 1 | 2 | 3;
      dealDamage(G.player, t, byTier(tier, SNUM.pounce.damage));
      if (tier === 3) stun(t, SNUM.pounce.down);
      sweep(1.5, 120, 0, '#7be36f');
      addShake(0.15);
      pounce = null;
    } else G.player.pos.addInPlace(to.normalize().scale(Math.min(d, SNUM.pounce.speed * dt)));
  }

  // Rend: a quick series of claw hits with bleeding.
  if (rend) {
    rend.tick -= dt;
    if (rend.tick <= 0) {
      const t = rend.t;
      if (!t.alive || flatDist(t.pos, G.player.pos) > SCOUT.claws.range + 1.5) rend = null;
      else {
        rend.tick = SNUM.rend.every;
        dealDamage(G.player, t, SNUM.rend.damage);
        applyDot(G.player, t, SNUM.rend.bleed, SNUM.rend.bleedT);
        if (rend.tier === 3) {
          t.ai = t.ai ?? {};
          t.ai.noHealT = G.time + SNUM.rend.bleedT;
        }
        sweep(SCOUT.claws.range, 60, 0, '#ff5a6e', { tilt: (Math.random() - 0.5) * 1.5 });
        rend.left -= 1;
        if (rend.left <= 0) rend = null;
      }
    }
  }

  // Scout drone: shows (tier 3: marks) enemies in its area.
  if (drone) {
    drone.t -= dt;
    drone.mesh.position.set(drone.at.x + Math.cos(G.time) * 2, 9, drone.at.z + Math.sin(G.time) * 2);
    for (const u of enemiesNear(drone.at, drone.r, 50)) mark(u, 0.5, drone.tier === 3);
    if (drone.t <= 0) {
      drone.mesh.dispose();
      drone = null;
    }
  }

  // Smoke tier 3: see silhouettes inside your smoke.
  if (ownedTier('smoke') === 3) for (const z of zones) if (z.kind === 'smoke') for (const u of enemiesNear(z.pos, z.radius)) mark(u, 0.3, false);

  // Electric traps.
  for (const z of zones) {
    if (z.kind !== 'trap' || z.t <= 0) continue;
    z.data.armT -= dt;
    if (z.data.armT > 0) continue;
    const hit = enemiesNear(z.pos, SNUM.trap.trigger, 2);
    if (!hit.length) continue;
    const tier = z.data.tier as 1 | 2 | 3;
    for (const u of hit) {
      stun(u, byTier(tier, SNUM.trap.root));
      dealDamage(G.player, u, SNUM.trap.damage, { noBackstab: true });
      if (tier === 3) mark(u, byTier(tier, SNUM.trap.root) + 2, true);
    }
    areaFx(z.pos, 1.5, '#7be36f', 0.3, 0.6);
    z.t = 0;
  }

  updateMarks(dt);
}

function buildWeapons(root: TransformNode) {
  const ranged = new TransformNode('scout-sniper', G.scene);
  ranged.parent = root;
  weaponPart('sniper', ranged, { w: 0.08, h: 0.12, d: 1.25 }, [0.32, 1.22, 0.75], '#2f3a2f', false);
  weaponPart('scope', ranged, { w: 0.07, h: 0.07, d: 0.3 }, [0.32, 1.33, 0.6], '#7be36f');
  const melee = new TransformNode('scout-claws', G.scene);
  melee.parent = root;
  for (const s of [1, -1]) for (const k of [-1, 0, 1]) weaponPart('claw', melee, { w: 0.03, h: 0.03, d: 0.4 }, [0.42 * s + k * 0.06, 1.1, 0.7], '#7be36f');
  return { ranged, melee };
}

export const SCOUT_KIT: ClassKit = {
  id: 'scout',
  name: 'Scout',
  blurb: 'Pençe ve sniper ile avlanan, yanında sibernetik kurdu olan avcı.',
  stats: SCOUT.stats,
  dash: { anim: 'dash_scout', speed: 28, time: 0.2, cd: 1.0, color: '#7be36f' },
  weaponNames: { ranged: 'Sniper tüfeği', melee: 'Pençeler' },
  passives: ['Yoldaş: son vurduğun rakibe saldıran kurt (ölürse 20 sn sonra döner)', 'Yüksek zemin: alçaktaki rakibe +%20 hasar'],
  skills: SKILLS,
  playstyles: PLAYSTYLES,
  buildWeapons,
  reset,
  update,
  attack: (w) => (w === 'ranged' ? snipe() : claw()),
  reload,
  weaponText: (w) =>
    w === 'ranged'
      ? `Sniper ${reloadT > 0 ? 'dolduruluyor…' : `${ammo}/${SCOUT.sniper.magazine}`} · şarj %${Math.round(charge() * 100)}`
      : 'Pençeler',
  buffs() {
    const b: string[] = [];
    if (fullShots > 0) b.push(`Dolu atış x${fullShots}`);
    if (hasteT > 0) b.push('Sürü hızı');
    const w = allies('wolf')[0];
    b.push(w ? `Kurt ${Math.ceil(w.hp)}` : `Kurt ${Math.ceil(companionWait)} sn`);
    if (allies('pack').length) b.push(`Sürü ${allies('pack').length}`);
    return b;
  },
  speedMult: () => (hasteT > 0 ? SNUM.pack.haste.mult : 1),
  outgoing(target, dmg, src) {
    // Passive 2: high ground.
    if (src && src.pos.y - target.pos.y >= SCOUT.highGround.height) dmg *= SCOUT.highGround.mult;
    const m = marks.get(target);
    if (m?.hunt) dmg *= 1 + byTier((ownedTier('hunt') || 1) as 1 | 2 | 3, SNUM.hunt.bonus);
    return { dmg, crit: false };
  },
  afterHit(target, _dmg, src) {
    if (src === G.player) lastHit = target;
  },
};
registerKit(SCOUT_KIT);

