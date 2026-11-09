/**
 * Survivors-style spawn director. Every region has a minute-by-minute table (WAVES in balance.ts):
 * how many mobs to keep around the player, how often to spawn and which species. Mobs grow out of the
 * ground off screen in a ring around the player, a little more often ahead of where the player runs,
 * and chase the player. Mobs left far behind are moved to the ring ahead instead of being removed.
 * Timed events (ring, stampede, elite) add moments that ask for movement. HORDE.cap bounds the count.
 * A run ends after WAVES[region].minutes. Swarm nests (NESTS) fill houses in a few parts of the map with
 * creatures that stay inside and never chase.
 */
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Frustum } from '@babylonjs/core/Maths/math.frustum';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Plane } from '@babylonjs/core/Maths/math.plane';
import { HORDE, MOBS, MOB_SPECIES, NESTS, WAVES, type HordeEvent, type MobSpecies } from './balance';
import { G, flatDist, inCombat, lineOfSight, minutes, removeUnit, ringFx, type Unit } from './core';
import { baseHeight } from './mapgen/generate';
import { IC } from './interiors';
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
let ended = false;

/** One spot inside a nest house: its creature while the nest is awake; dead spots stay empty. */
type NestSpot = { p: Vector3; yaw: number; unit: Unit | null; dead: boolean };
type Nest = { x: number; z: number; awake: boolean; spots: NestSpot[] };
let nests: Nest[] = [];

/** Pick a few nest areas away from the start; every enterable house inside one becomes a nest. */
function buildNests(rand: () => number) {
  nests = [];
  const f = G.world.field;
  const houses = (G.world.mapObjects ?? []).filter((o) => o.k.startsWith('ev_') && IC.floors[o.k] && IC.centers[o.k]);
  if (!f || !houses.length) return;
  const start = G.player.pos;
  const far = houses.filter((o) => Math.hypot(o.x - start.x, o.z - start.z) > NESTS.awayFromStart);
  const centers: { x: number; z: number }[] = [];
  for (let i = 0; i < 40 && centers.length < NESTS.zones && far.length; i++) {
    const o = far[Math.floor(rand() * far.length)];
    if (centers.every((c) => Math.hypot(c.x - o.x, c.z - o.z) > NESTS.zoneRadius * 1.5)) centers.push({ x: o.x, z: o.z });
  }
  for (const o of houses) {
    if (!centers.some((c) => Math.hypot(c.x - o.x, c.z - o.z) < NESTS.zoneRadius)) continue;
    if (Math.hypot(o.x - start.x, o.z - start.z) < NESTS.awayFromStart) continue;
    const y0 = baseHeight(f, o);
    const cos = Math.cos(o.r), sin = Math.sin(o.r);
    const spots: NestSpot[] = [];
    IC.floors[o.k].slice(0, NESTS.maxFloors).forEach((fy, i) => {
      const c = IC.centers[o.k][i];
      if (!c) return;
      for (let n = 0; n < NESTS.perFloor; n++) {
        const lx = c[0] + (rand() - 0.5) * NESTS.spread * 2, lz = c[1] + (rand() - 0.5) * NESTS.spread * 2;
        const p = new Vector3(o.x + (lx * cos + lz * sin) * o.s, y0 + fy * o.s, o.z + (-lx * sin + lz * cos) * o.s);
        spots.push({ p, yaw: rand() * Math.PI * 2, unit: null, dead: false });
      }
    });
    if (spots.length) nests.push({ x: o.x, z: o.z, awake: false, spots });
  }
}

function updateNests() {
  const me = G.player.pos;
  for (const n of nests) {
    for (const s of n.spots) if (s.unit && !s.unit.alive) {
      s.dead = true;
      s.unit = null;
    }
    const d = Math.hypot(n.x - me.x, n.z - me.z);
    if (!n.awake && d < NESTS.wakeDist) {
      n.awake = true;
      for (const s of n.spots) {
        if (s.dead) continue;
        const spec = MOB_SPECIES[NESTS.species];
        const hp = Math.round(MOBS.hp(minutes()) * spec.hp * NESTS.hp);
        const u = spawnMob(NESTS.species, s.p, s.p, hp, T('mobSwarm'), Math.random, NESTS.size);
        u.pos.y = s.p.y;
        u.yaw = s.yaw;
        u.ai!.nest = true;
        u.tint = Color3.FromHexString(NESTS.tint).scale(0.35);
        s.unit = u;
      }
    } else if (n.awake && d > NESTS.sleepDist && !n.spots.some((s) => s.unit && inCombat(s.unit))) {
      n.awake = false;
      for (const s of n.spots) if (s.unit) {
        removeUnit(s.unit);
        s.unit = null;
      }
    }
  }
}

/** Test hook: nest houses (x, z), awake or not, creatures alive. */
export const nestInfo = () => nests.map((n) => ({ x: Math.round(n.x), z: Math.round(n.z), awake: n.awake, alive: n.spots.filter((s) => !s.dead).length }));

export function resetHorde(rand: () => number, regionId = 'spor') {
  ended = false;
  region = WAVES[regionId] ? regionId : 'spor';
  spawnT = 0;
  relocateT = HORDE.relocateEvery;
  eventIndex = 0;
  lastPlayer.copyFrom(G.player.pos);
  moveDir.set(0, 0, 1);
  buildNests(rand);
}

/** Horde mobs only: nest creatures have their own count. */
const mobCount = () => G.units.reduce((n, u) => n + (u.kind === 'mob' && !u.ai?.nest ? 1 : 0), 0);

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
  updateNests();

  // The run is over: no more spawns (the end screen comes later).
  if (minutes() >= WAVES[region].minutes) {
    if (!ended) announce(T('runDone', { m: WAVES[region].minutes }));
    ended = true;
    return;
  }

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
