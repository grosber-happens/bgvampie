/**
 * Survivors-style spawn director. Every region has a minute-by-minute table (WAVES in balance.ts):
 * how many mobs to keep around the player, how often to spawn and which species. Mobs grow out of the
 * ground off screen in a ring around the player, a little more often ahead of where the player runs,
 * and chase the player. Mobs left far behind are moved to the ring ahead instead of being removed.
 * Timed events (ring, stampede, elite) add moments that ask for movement. HORDE.cap bounds the count.
 */
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Frustum } from '@babylonjs/core/Maths/math.frustum';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Plane } from '@babylonjs/core/Maths/math.plane';
import { HORDE, MOBS, MOB_SPECIES, WAVES, type HordeEvent, type MobSpecies } from './balance';
import { G, flatDist, lineOfSight, minutes, ringFx, type Unit } from './core';
import { spawnMob } from './ai';
import { findOpenSpot, spotIsClear } from './world';
import { t as T } from './i18n';

let region = 'spor';
let spawnT = 0;
let relocateT = 0;
let eventIndex = 0;
const lastPlayer = new Vector3();
const moveDir = new Vector3(0, 0, 1);
let planes: Plane[] = [];

export function resetHorde(regionId = 'spor') {
  region = WAVES[regionId] ? regionId : 'spor';
  spawnT = 0;
  relocateT = HORDE.relocateEvery;
  eventIndex = 0;
  lastPlayer.copyFrom(G.player.pos);
  moveDir.set(0, 0, 1);
}

const mobCount = () => G.units.reduce((n, u) => n + (u.kind === 'mob' ? 1 : 0), 0);

function stage() {
  const list = WAVES[region].stages;
  const min = minutes();
  let s = list[0];
  for (const x of list) if (min >= x.from) s = x;
  return s;
}

function pick(pool: Partial<Record<MobSpecies, number>>, rand: () => number): MobSpecies {
  const keys = Object.keys(pool) as MobSpecies[];
  let roll = rand() * keys.reduce((a, k) => a + (pool[k] ?? 0), 0);
  for (const k of keys) if ((roll -= pool[k] ?? 0) <= 0) return k;
  return keys[0];
}

/** Would the camera show this point? In view and not hidden behind a wall. */
function onScreen(p: Vector3) {
  const cam = G.scene.activeCamera;
  if (!cam || !planes.length) return false;
  const head = p.add(new Vector3(0, 1.5, 0));
  if (!Frustum.IsPointInFrustum(head, planes)) return false;
  return lineOfSight(cam.globalPosition, head);
}

/** A walkable spot on the map at x, z, or null (off the map, in water, inside an object). */
function groundAt(x: number, z: number, clear: number): Vector3 | null {
  const f = G.world.field;
  if (!f) return spotIsClear(G.world.boxes, x, z, clear) ? new Vector3(x, 0, z) : null;
  const half = f.p.size / 2 - 10;
  if (Math.abs(x) > half || Math.abs(z) > half) return null;
  if (f.height(x, z) < f.p.water + 0.3) return null;
  if (!spotIsClear(G.world.boxes, x, z, clear)) return null;
  return new Vector3(x, f.height(x, z), z);
}

/** A spawn spot in the ring around the player, off screen when possible, often ahead. */
function ringSpot(rand: () => number, ahead = rand() < HORDE.aheadBias): Vector3 {
  const me = G.player.pos;
  const base = Math.atan2(moveDir.x, moveDir.z);
  let fallback: Vector3 | null = null;
  for (let i = 0; i < 24; i++) {
    const a = ahead ? base + (rand() - 0.5) * Math.PI : rand() * Math.PI * 2;
    const d = HORDE.ringMin + rand() * (HORDE.ringMax - HORDE.ringMin);
    const p = groundAt(me.x + Math.sin(a) * d, me.z + Math.cos(a) * d, 2);
    if (!p) continue;
    if (!onScreen(p)) return p;
    fallback ??= p;
  }
  return fallback ?? findOpenSpot(G.world.boxes, rand);
}

type Opts = { sprout?: boolean; elite?: boolean; charge?: Vector3 };

function spawnOne(species: MobSpecies, p: Vector3, rand: () => number, o: Opts = {}): Unit | null {
  if (mobCount() >= HORDE.cap) return null;
  const spec = MOB_SPECIES[species];
  const e = o.elite ? HORDE.elite : null;
  const hp = Math.round(MOBS.hp(minutes()) * spec.hp * (e?.hp ?? 1));
  const name = T(species === 'geyik' ? 'mobDeer' : 'mobSnail');
  const u = spawnMob(species, p, p, hp, e ? `${T('mobElite')} ${name}` : name, rand, e?.size ?? 1);
  u.ai!.horde = true;
  if (e) {
    u.ai!.elite = true;
    u.tint = Color3.FromHexString(e.glow).scale(0.45);
  }
  if (o.charge) {
    u.ai!.charge = o.charge.clone();
    u.ai!.chargeT = HORDE.stampede.run;
    u.yaw = Math.atan2(o.charge.x, o.charge.z);
  }
  if (o.sprout !== false) {
    u.ai!.sproutT = HORDE.sprout;
    u.body.root.scaling.setAll(0.05);
    ringFx(p, 1.4 * (e?.size ?? 1), '#cfe7b0', HORDE.sprout);
  }
  return u;
}

function spawnGroup(rand: () => number, room: number) {
  const s = stage();
  const species = pick(s.pool, rand);
  const spec = MOB_SPECIES[species];
  const n = Math.min(room, spec.pack[0] + Math.floor(rand() * (spec.pack[1] - spec.pack[0] + 1)));
  const center = ringSpot(rand);
  const spread = 2 + spec.radius * 2.5;
  for (let i = 0; i < n; i++) {
    const x = center.x + (rand() - 0.5) * spread, z = center.z + (rand() - 0.5) * spread;
    spawnOne(species, groundAt(x, z, 1) ?? center, rand);
  }
}

function runEvent(e: HordeEvent, rand: () => number, announce: (text: string) => void) {
  const me = G.player.pos;
  if (e.kind === 'ring') {
    for (let i = 0; i < e.count; i++) {
      const a = (i / e.count) * Math.PI * 2 + rand() * 0.2;
      const p = groundAt(me.x + Math.sin(a) * HORDE.ring.radius, me.z + Math.cos(a) * HORDE.ring.radius, 1);
      if (p) spawnOne(e.species, p, rand);
    }
    announce(T('hordeRing'));
  } else if (e.kind === 'stampede') {
    // A herd lines up off to one side and runs straight across where the player stands.
    const a = rand() * Math.PI * 2;
    const dir = new Vector3(-Math.sin(a), 0, -Math.cos(a));
    const side = new Vector3(dir.z, 0, -dir.x);
    const S = HORDE.stampede;
    for (let i = 0; i < e.count; i++) {
      const off = (i / Math.max(1, e.count - 1) - 0.5) * S.width;
      const back = rand() * 6;
      const p = groundAt(me.x - dir.x * (S.from + back) + side.x * off, me.z - dir.z * (S.from + back) + side.z * off, 1);
      if (p) spawnOne(e.species, p, rand, { charge: dir, sprout: false });
    }
    announce(T('hordeStampede'));
  } else {
    for (let i = 0; i < e.count; i++) spawnOne(e.species, ringSpot(rand, true), rand, { elite: true });
    announce(T('hordeElite'));
  }
}

/** Move a straggler to the ring ahead: same mob, same health, back in the fight. */
function relocate(u: Unit, rand: () => number) {
  const p = ringSpot(rand, true);
  u.pos.copyFrom(p);
  u.ai!.home = p.clone();
  u.ai!.target = null;
  u.ai!.charge = null;
  u.ai!.sproutT = HORDE.sprout;
  u.body.root.scaling.setAll(0.05);
  ringFx(p, 1.4, '#cfe7b0', HORDE.sprout);
}

export function updateHorde(dt: number, rand: () => number, announce: (text: string) => void) {
  const me = G.player;
  if (!me.alive) return;
  // Which way the player is heading, smoothed, for the spawns ahead.
  const dx = me.pos.x - lastPlayer.x, dz = me.pos.z - lastPlayer.z;
  const step = Math.hypot(dx, dz);
  if (step > 0.01) {
    moveDir.x += (dx / step - moveDir.x) * 0.1;
    moveDir.z += (dz / step - moveDir.z) * 0.1;
    moveDir.normalize();
  }
  lastPlayer.copyFrom(me.pos);
  planes = G.scene.activeCamera ? Frustum.GetPlanes(G.scene.getTransformMatrix()) : [];

  const ev = WAVES[region].events;
  while (eventIndex < ev.length && minutes() >= ev[eventIndex].at) runEvent(ev[eventIndex++], rand, announce);

  spawnT -= dt;
  if (spawnT <= 0) {
    const s = stage();
    spawnT = s.every;
    const alive = mobCount();
    const want = Math.min(s.alive, HORDE.cap);
    if (alive < want) spawnGroup(rand, want - alive);
  }

  relocateT -= dt;
  if (relocateT <= 0) {
    relocateT = HORDE.relocateEvery;
    for (const u of G.units) {
      if (u.kind !== 'mob' || !u.alive || !u.ai?.horde || u.ai.charge) continue;
      if (u.ai.target && u.ai.target !== me) continue;
      if (flatDist(u.pos, me.pos) > HORDE.relocateDist && !onScreen(u.pos)) relocate(u, rand);
    }
  }
}
