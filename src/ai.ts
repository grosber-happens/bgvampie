import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { forwardFromYaw, rightFromYaw } from './actors';
import { createCharacterBody, type SkinName } from './characters';
import { BOSS, BOTS, DAGGERS, MOBS, SHADOW_TRAIL } from './balance';
import {
  G,
  chest,
  dealDamage,
  faceTowards,
  fireBullet,
  flatDist,
  glowMat,
  hostile,
  inCombat,
  lineOfSight,
  makeUnit,
  minutes,
  moveUnit,
  ringFx,
  type Unit,
} from './core';
import { hiddenByZone, playerFaded, playerVisibility } from './kit';
import { findOpenSpot } from './world';
import { addShake, sfx } from './feel';

/** Rival players. Two Kenney survivor skins, tinted so each bot is easy to tell apart. */
export const BOT_LOOKS: { name: string; body: string; head: string; weapon: string; skin: SkinName; tint: string }[] = [
  { name: 'Kuzgun', body: '#2f3b5c', head: '#d8c8b0', weapon: '#7fd6ff', skin: 'maleB', tint: '#9fb4ff' },
  { name: 'Engerek', body: '#3d5c2f', head: '#e0d2b4', weapon: '#b8ff6a', skin: 'femaleA', tint: '#b8f0a0' },
  { name: 'Akrep', body: '#6b4a1f', head: '#cdb79a', weapon: '#ffb14a', skin: 'maleB', tint: '#ffd08a' },
  { name: 'Baykuş', body: '#5c2f55', head: '#e3cfc3', weapon: '#ff7ae0', skin: 'femaleA', tint: '#f0a8e8' },
  { name: 'Çakal', body: '#5a5a5a', head: '#d9c6a6', weapon: '#fff07a', skin: 'maleB', tint: '#e8e8e8' },
  { name: 'Sırtlan', body: '#2f5c58', head: '#d6c2a8', weapon: '#7affd8', skin: 'femaleA', tint: '#9ff0e0' },
];

let mobPackT = 0;
let bossIndex = 0;
let botQueue: { t: number; look: (typeof BOT_LOOKS)[number]; level: number; xp: number; team: number }[] = [];
export let boss: Unit | null = null;

export function resetDirector(rand: () => number) {
  mobPackT = MOBS.packEvery;
  bossIndex = 0;
  botQueue = [];
  boss = null;
  for (let i = 0; i < BOTS.count; i++) spawnBot(BOT_LOOKS[i % BOT_LOOKS.length], 1, 0, 100 + i, rand);
  for (let i = 0; i < MOBS.startPacks; i++) spawnPack(rand);
}

/** A spot far enough from the player. */
function farSpot(rand: () => number, minDist: number): Vector3 {
  let best = findOpenSpot(G.world.boxes, rand);
  for (let i = 0; i < 20 && flatDist(best, G.player.pos) < minDist; i++) best = findOpenSpot(G.world.boxes, rand);
  return best;
}

function spawnBot(look: (typeof BOT_LOOKS)[number], level: number, xp: number, team: number, rand: () => number) {
  const body = createCharacterBody(G.scene, G.world, `bot${G.nextId}`, look.skin, { tint: look.tint, hpBar: true });
  // A glowing pistol in the right hand so bots read as armed players.
  const gun = MeshBuilder.CreateBox(`bot${G.nextId}-gun`, { width: 0.1, height: 0.14, depth: 0.5 }, G.scene);
  gun.material = glowMat(look.weapon, 0.9);
  gun.parent = body.root;
  gun.position.set(0.32, 1.05, 0.4);
  gun.isPickable = false;
  const pos = farSpot(rand, 18);
  const hp = BOTS.maxHp + BOTS.hpPerLevel * (level - 1);
  const u = makeUnit('bot', look.name, body, pos, team, hp, {
    level,
    xp,
    colors: look,
    yaw: rand() * Math.PI * 2,
    ai: { state: 'roam', target: null, think: 0, goal: findOpenSpot(G.world.boxes, rand), strafe: 1, strafeT: 0, fireT: 0, ammo: BOTS.magazine, reloadT: 0, meleeT: 0, stuck: 0, detourT: 0, detour: new Vector3(), cover: null, look },
  });
  return u;
}

function spawnPack(rand: () => number, room = MOBS.maxAlive) {
  const center = farSpot(rand, MOBS.minSpawnDist);
  const n = Math.min(room, MOBS.packMin + Math.floor(rand() * (MOBS.packMax - MOBS.packMin + 1)));
  const min = minutes();
  for (let i = 0; i < n; i++) {
    const p = center.add(new Vector3((rand() - 0.5) * 3, 0, (rand() - 0.5) * 3));
    const skin: SkinName = rand() < 0.5 ? 'zombieA' : 'zombieC';
    const body = createCharacterBody(G.scene, G.world, `mob${G.nextId}`, skin, { height: 1.75, hpBar: true, hpColor: '#e0a33f' });
    makeUnit('mob', 'Zombi', body, p, -1, MOBS.hp(min), {
      radius: 0.45,
      height: 1.75,
      yaw: rand() * Math.PI * 2,
      ai: { home: center.clone(), target: null, think: 0, attackT: 0, windT: -1, wander: p.clone(), wanderT: 0 },
    });
  }
}

/** Test helper: one zombie at a point. */
export function spawnDummy(p: Vector3, hp: number) {
  const body = createCharacterBody(G.scene, G.world, `mob${G.nextId}`, 'zombieA', { height: 1.75, hpBar: true, hpColor: '#e0a33f' });
  return makeUnit('mob', 'Hedef', body, p, -1, hp, {
    radius: 0.45,
    height: 1.75,
    yaw: 0,
    ai: { home: p.clone(), target: null, think: 0, attackT: 0, windT: -1, wander: p.clone(), wanderT: 0 },
  });
}

export function spawnBoss(rand: () => number) {
  const body = createCharacterBody(G.scene, G.world, `boss${G.nextId}`, 'zombieC', { height: 4.2, tint: '#ff9a7a' });
  const pos = farSpot(rand, 20);
  boss = makeUnit('boss', 'Zombi Devi', body, pos, -1, BOSS.hp(minutes()), {
    radius: 1.1,
    height: 4,
    level: 12,
    ai: { home: pos.clone(), target: null, think: 0, slamT: 2, rockT: 2, windT: -1, ring: null },
  });
  return boss;
}

/** Can `u` see `t` right now? The player (and its decoys when hidden) may be invisible. */
function canSee(u: Unit, t: Unit, range: number): boolean {
  const d = flatDist(u.pos, t.pos);
  if (hiddenByZone(u.pos, t.pos)) return false;
  if (t.ai?.noTargetT > G.time) return false;
  if (t === G.player) {
    const vis = playerVisibility();
    // Very close to an enemy you still show a faint outline.
    if (vis === 0) return d < 2.5;
    range *= vis;
    if (playerFaded()) range = Math.min(range, SHADOW_TRAIL.seeRange);
  }
  return d < range && lineOfSight(chest(u), chest(t));
}

function nearestVisible(u: Unit, range: number, filter: (t: Unit) => boolean, mobWeight = 1): Unit | null {
  let best: Unit | null = null;
  let bd = Infinity;
  for (const t of G.units) {
    if (!hostile(u, t) || !filter(t)) continue;
    const d = flatDist(u.pos, t.pos) * (t.kind === 'mob' ? mobWeight : 1);
    if (d < bd && canSee(u, t, range)) {
      bd = d;
      best = t;
    }
  }
  return best;
}

/** Walk toward a direction, sidestepping when stuck on a wall. */
function steer(u: Unit, want: Vector3, speed: number, dt: number) {
  const ai = u.ai!;
  let dir = want;
  if (ai.detourT > 0) {
    ai.detourT -= dt;
    dir = ai.detour;
  }
  const moved = moveUnit(u, dir, speed, dt);
  if (dir.lengthSquared() > 0 && u.stunT <= 0) {
    if (moved < speed * dt * 0.3) ai.stuck += dt;
    else ai.stuck = Math.max(0, ai.stuck - dt);
    if (ai.stuck > 0.4) {
      ai.stuck = 0;
      const side = rightFromYaw(Math.atan2(want.x, want.z)).scale(Math.random() < 0.5 ? 1 : -1);
      ai.detour = side.add(want.normalizeToNew().scale(-0.3));
      ai.detourT = 0.8;
    }
  }
}

// ---- Bots --------------------------------------------------------------------
function botDamageMult(u: Unit) {
  return 1 + BOTS.damagePerLevel * (u.level - 1);
}

function findCover(u: Unit, threat: Unit): Vector3 | null {
  let best: Vector3 | null = null;
  let bestScore = -Infinity;
  for (let i = 0; i < 14; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 6 + Math.random() * 9;
    const p = u.pos.add(new Vector3(Math.sin(a) * r, 0, Math.cos(a) * r));
    p.y = u.pos.y;
    if (lineOfSight(chest(threat), p.add(new Vector3(0, 1.2, 0)))) continue;
    const score = flatDist(p, threat.pos) - flatDist(p, u.pos) * 0.5;
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return best;
}

function updateBot(u: Unit, dt: number, rand: () => number) {
  const ai = u.ai!;
  ai.think -= dt;
  ai.fireT -= dt;
  ai.meleeT -= dt;
  if (ai.reloadT > 0) {
    ai.reloadT -= dt;
    if (ai.reloadT <= 0) ai.ammo = BOTS.magazine;
  }
  if (!inCombat(u) && G.time - u.lastCombat > BOTS.regenDelay && !(u.ai!.noHealT > G.time)) u.hp = Math.min(u.maxHp, u.hp + BOTS.regenPerSec * dt);

  if (ai.think <= 0) {
    ai.think = 0.3 + rand() * 0.15;
    const t = nearestVisible(u, BOTS.sight, () => true, 1.4);
    if (t) ai.target = t;
    else if (ai.target && (!ai.target.alive || flatDist(ai.target.pos, u.pos) > BOTS.sight * 1.3)) ai.target = null;
    if (ai.target && ai.target === G.player && !canSee(u, G.player, BOTS.sight * 1.3)) ai.target = null;
    if (ai.target && u.hp / u.maxHp < BOTS.retreatAt && ai.state !== 'retreat') {
      ai.cover = findCover(u, ai.target);
      if (ai.cover) ai.state = 'retreat';
    }
    if (ai.state === 'retreat' && (u.hp / u.maxHp > 0.75 || !ai.cover)) ai.state = 'roam';
    if (ai.state !== 'retreat') ai.state = ai.target ? 'fight' : 'roam';
  }

  if (u.stunT > 0) {
    moveUnit(u, Vector3.Zero(), 0, dt);
    return;
  }
  const t: Unit | null = ai.target?.alive ? ai.target : null;
  if (ai.state === 'retreat' && ai.cover) {
    const to = ai.cover.subtract(u.pos);
    to.y = 0;
    if (to.length() < 1) {
      moveUnit(u, Vector3.Zero(), 0, dt);
      if (t) faceTowards(u, t.pos, dt);
    } else {
      steer(u, to, BOTS.speed * 1.1, dt);
      faceTowards(u, u.pos.add(to), dt);
    }
    return;
  }
  if (ai.state === 'fight' && t) {
    const dist = flatDist(u.pos, t.pos);
    faceTowards(u, t.pos, dt, 8);
    const to = t.pos.subtract(u.pos);
    to.y = 0;
    let want: Vector3;
    ai.strafeT -= dt;
    if (ai.strafeT <= 0) {
      ai.strafe = rand() < 0.5 ? 1 : -1;
      ai.strafeT = 0.8 + rand() * 1.2;
    }
    const side = rightFromYaw(u.yaw).scale(ai.strafe);
    if (dist < DAGGERS.range + 0.6) want = side.scale(0.3);
    else if (dist > 13 || (t.kind === 'mob' && dist > 3) || t.kind === 'decoy') want = to.normalize().add(side.scale(0.3));
    else if (dist < 5 && t.kind !== 'mob') want = to.normalize().scale(-0.6).add(side);
    else want = side;
    steer(u, want, BOTS.speed, dt);
    // Daggers up close, the pistol otherwise.
    if (dist < DAGGERS.range + t.radius && ai.meleeT <= 0) {
      ai.meleeT = 0.6;
      dealDamage(u, t, BOTS.meleeDamage * botDamageMult(u));
    } else if (ai.fireT <= 0 && ai.reloadT <= 0 && dist < 40 && lineOfSight(chest(u), chest(t))) {
      ai.fireT = BOTS.fireRate * (0.8 + rand() * 0.5);
      const from = chest(u).add(forwardFromYaw(u.yaw).scale(0.6));
      const aimAt = chest(t).add(new Vector3((rand() - 0.5) * 2, (rand() - 0.5) * 2, (rand() - 0.5) * 2).scale(BOTS.spread * dist));
      // A faint Rogue is hard to hit from afar: aim well off to one side.
      if (t === G.player && playerFaded() && dist > SHADOW_TRAIL.nearRange && rand() < SHADOW_TRAIL.missChance) aimAt.x += (rand() < 0.5 ? -1 : 1) * 1.6;
      fireBullet(u, from, aimAt.subtract(from), 70, 45, BOTS.damage * botDamageMult(u), ai.look.weapon);
      ai.ammo -= 1;
      if (ai.ammo <= 0) ai.reloadT = BOTS.reload;
    }
    return;
  }
  // Roam: walk between random open spots.
  const to = ai.goal.subtract(u.pos);
  to.y = 0;
  if (to.length() < 1.5) ai.goal = findOpenSpot(G.world.boxes, rand);
  steer(u, to, BOTS.speed * 0.7, dt);
  faceTowards(u, u.pos.add(to), dt, 5);
}

// ---- Mobs ----------------------------------------------------------------------
function updateMob(u: Unit, dt: number, rand: () => number) {
  const ai = u.ai!;
  ai.think -= dt;
  ai.attackT -= dt;
  if (ai.think <= 0) {
    ai.think = 0.4 + rand() * 0.2;
    const t = nearestVisible(u, MOBS.aggro, () => true);
    if (t) ai.target = t;
    if (ai.target && (!ai.target.alive || flatDist(u.pos, ai.home) > MOBS.leash)) ai.target = null;
  }
  if (u.stunT > 0) {
    ai.windT = -1;
    moveUnit(u, Vector3.Zero(), 0, dt);
    return;
  }
  const t: Unit | null = ai.target?.alive ? ai.target : null;
  if (t) {
    const dist = flatDist(u.pos, t.pos);
    faceTowards(u, t.pos, dt, 8);
    if (ai.windT >= 0) {
      ai.windT -= dt;
      moveUnit(u, Vector3.Zero(), 0, dt);
      if (ai.windT < 0 && dist < MOBS.attackRange + t.radius + 0.4) dealDamage(u, t, MOBS.damage(minutes()));
    } else if (dist < MOBS.attackRange + t.radius) {
      moveUnit(u, Vector3.Zero(), 0, dt);
      if (ai.attackT <= 0) {
        ai.attackT = MOBS.attackRate;
        ai.windT = 0.35;
      }
    } else steer(u, t.pos.subtract(u.pos), MOBS.speed, dt);
    return;
  }
  // Idle: sniff around the pack's home.
  ai.wanderT -= dt;
  if (ai.wanderT <= 0) {
    ai.wanderT = 2 + rand() * 3;
    ai.wander = ai.home.add(new Vector3((rand() - 0.5) * 8, 0, (rand() - 0.5) * 8));
  }
  const to = ai.wander.subtract(u.pos);
  to.y = 0;
  if (to.length() > 0.8) {
    steer(u, to, MOBS.speed * 0.35, dt);
    faceTowards(u, u.pos.add(to), dt, 4);
  } else moveUnit(u, Vector3.Zero(), 0, dt);
}

// ---- Boss ------------------------------------------------------------------------
function updateBoss(u: Unit, dt: number) {
  const ai = u.ai!;
  ai.think -= dt;
  ai.slamT -= dt;
  ai.rockT -= dt;
  if (ai.think <= 0) {
    ai.think = 0.4;
    const t = nearestVisible(u, BOSS.aggro, (x) => x.kind !== 'mob');
    if (t) ai.target = t;
    if (ai.target && (!ai.target.alive || flatDist(u.pos, ai.home) > BOSS.leash)) ai.target = null;
  }
  if (u.stunT > 0) {
    moveUnit(u, Vector3.Zero(), 0, dt);
    return;
  }
  if (ai.windT >= 0) {
    ai.windT -= dt;
    moveUnit(u, Vector3.Zero(), 0, dt);
    if (ai.windT < 0) {
      ai.ring?.dispose();
      ai.ring = null;
      ringFx(u.pos, BOSS.slamRadius, '#ff5a3b', 0.3);
      const near = flatDist(u.pos, G.player.pos);
      if (near < 30) {
        sfx.boom();
        addShake(Math.max(0.1, 0.7 - near / 25));
      }
      for (const t of [...G.units]) {
        if (hostile(u, t) && t.kind !== 'mob' && flatDist(t.pos, u.pos) < BOSS.slamRadius + t.radius && t.pos.y - u.pos.y < 2.5) dealDamage(u, t, BOSS.slamDamage);
      }
    }
    return;
  }
  const t: Unit | null = ai.target?.alive ? ai.target : null;
  if (!t) {
    const home = ai.home.subtract(u.pos);
    home.y = 0;
    if (home.length() > 2) steer(u, home, BOSS.speed, dt);
    else moveUnit(u, Vector3.Zero(), 0, dt);
    if (!inCombat(u)) u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.05 * dt);
    return;
  }
  const dist = flatDist(u.pos, t.pos);
  faceTowards(u, t.pos, dt, 4);
  if (dist < BOSS.slamRadius * 0.8 && ai.slamT <= 0) {
    // Telegraph: a red ring on the ground, then the slam.
    ai.slamT = BOSS.slamEvery;
    ai.windT = BOSS.slamWindup;
    const ring = MeshBuilder.CreateDisc('slamring', { radius: BOSS.slamRadius, tessellation: 32 }, G.scene);
    ring.rotation.x = Math.PI / 2;
    ring.position.copyFrom(u.pos).addInPlaceFromFloats(0, 0.06, 0);
    ring.material = glowMat('#ff2a1a', 0.3);
    ring.isPickable = false;
    ai.ring = ring;
    return;
  }
  if (dist > 7 && ai.rockT <= 0 && lineOfSight(chest(u), chest(t))) {
    ai.rockT = BOSS.rockEvery;
    const from = u.pos.add(new Vector3(0, 3.5, 0));
    fireBullet(u, from, chest(t).subtract(from), BOSS.rockSpeed, 40, BOSS.rockDamage, '#8a6a4a', false, 0.7);
  }
  steer(u, t.pos.subtract(u.pos), dist > 2 ? BOSS.speed : 0, dt);
}

// ---- Director: spawns and per-frame AI ---------------------------------------------
export type Announce = (text: string) => void;

export function updateAI(dt: number, rand: () => number, announce: Announce) {
  for (const u of [...G.units]) {
    if (!u.alive) continue;
    if (u.kind === 'bot') updateBot(u, dt, rand);
    else if (u.kind === 'mob') updateMob(u, dt, rand);
    else if (u.kind === 'boss') updateBoss(u, dt);
  }
  // Mob packs: keep a moderate number alive.
  mobPackT -= dt;
  if (mobPackT <= 0) {
    mobPackT = MOBS.packEvery;
    const alive = G.units.filter((u) => u.kind === 'mob').length;
    if (alive + MOBS.packMin <= MOBS.maxAlive) spawnPack(rand, MOBS.maxAlive - alive);
  }
  // Bosses at fixed minutes.
  if (bossIndex < BOSS.minutes.length && minutes() >= BOSS.minutes[bossIndex]) {
    bossIndex++;
    if (!boss?.alive) {
      spawnBoss(rand);
      announce('Zombi Devi şehre geldi!');
    }
  }
  if (boss && !boss.alive) boss = null;
  // Prototype only: fallen bots return after a while, keeping their level.
  botQueue = botQueue.filter((q) => {
    q.t -= dt;
    if (q.t <= 0) spawnBot(q.look, q.level, q.xp, q.team, rand);
    return q.t > 0;
  });
}

export function botDied(u: Unit) {
  botQueue.push({ t: BOTS.respawn, look: u.ai!.look, level: u.level, xp: u.xp, team: u.team });
}
