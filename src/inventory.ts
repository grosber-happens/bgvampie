/**
 * The player's gear in the game: six slots, a bag, items dropped on the ground, the bandage (X)
 * and the noir set's Last Reel (G). Numbers live in gear.ts (shared with the simulator).
 */
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { BACKSTAB, DAGGERS, FIGHTER, GUN, MAGE, SCOUT, XP_TO_NEXT } from './balance';
import { G, MODS, dealDamage, flatDist, minutes, ringFx, slowUnit, stun, type Unit } from './core';
import {
  BANDAGE,
  ITEM,
  JEWEL_XP_SHARE,
  NOIR_SET,
  RARITY_COLOR,
  SLAM,
  ZERO,
  armorToDr,
  canWear,
  itemScore,
  itemStats,
  rollItem,
  setPieces,
  totalStats,
  uniques,
  type Item,
  type Loadout,
  type Slot,
  type Stats,
  type Unique,
} from './gear';
import { getLang, t } from './i18n';
import { random } from './random';
const getLangSafe = () => getLang();
import { AOE, CDR, P, enemiesNear, host, kit, type ClassId } from './kit';

export const BAG_SIZE = 8;
export const INV = {
  load: {} as Loadout,
  bag: [] as Item[],
  s: { ...ZERO } as Stats,
  u: new Set<Unique>(),
  set: 0,
  /** Bandage: seconds left of wrapping (0 = not wrapping) and cooldown. */
  bandT: 0,
  bandCd: 0,
  /** Bandage heal ticks already given in this wrap. */
  bandTicks: 0,
  regenT: 0,
  guardT: 0,
  reelT: 0,
  reelCd: 0,
  windT: 0,
  windCd: 0,
  slamCd: 0,
  meleeHits: 0,
  rangedHits: 0,
  lastXp: 0,
  lastLevel: 1,
  /** Units hit by the player with the noir set: id -> time the mark ends. */
  marks: new Map<number, number>(),
  /** Patient Scope marks: id -> time. */
  scoped: new Map<number, number>(),
};

/** Called when the gear changes (main.ts redraws the HUD). */
export const invHooks = { changed: () => {}, message: (_t: string) => {} };

// ---- Base numbers of the class weapons (gear changes them on top) ------------------------
const BASE = {
  gunMag: GUN.magazine,
  daggerRange: DAGGERS.range,
  backstab: BACKSTAB.mult,
  heat: MAGE.wand.heatPerShot,
  rodRange: MAGE.rod.range,
  spears: FIGHTER.spear.count,
  swordRange: FIGHTER.sword.range,
  charge: SCOUT.sniper.chargeTime,
  clawRange: SCOUT.claws.range,
};

function applyWeaponNumbers() {
  const s = INV.s;
  GUN.magazine = BASE.gunMag + s.mag;
  DAGGERS.range = BASE.daggerRange + s.reach;
  BACKSTAB.mult = BASE.backstab + s.backstab;
  MAGE.wand.heatPerShot = BASE.heat * (1 + s.heat);
  MAGE.rod.range = BASE.rodRange + s.reach;
  FIGHTER.spear.count = BASE.spears + s.spears;
  FIGHTER.sword.range = BASE.swordRange + s.reach;
  SCOUT.sniper.chargeTime = BASE.charge * (1 + s.charge);
  SCOUT.claws.range = BASE.clawRange + s.reach;
  AOE.mult = 1 + s.aoe;
  CDR.rate = 1 / (1 - s.cdr);
  MODS.tenacity = s.tenacity;
}

function baseMaxHp() {
  return kit.stats.maxHp + kit.stats.hpPerLevel * (G.player.level - 1);
}

/** Max health from class, level and gear; keeps the current health share. */
export function recomputeHp() {
  const p = G.player;
  const max = Math.round((baseMaxHp() + INV.s.hp) * (1 + INV.s.hpPct));
  const share = p.maxHp > 0 ? p.hp / p.maxHp : 1;
  p.maxHp = max;
  p.hp = Math.min(max, Math.max(1, share * max));
}

function refresh() {
  INV.s = totalStats(INV.load);
  INV.u = uniques(INV.load);
  INV.set = setPieces(INV.load);
  applyWeaponNumbers();
  recomputeHp();
  invHooks.changed();
}

export function resetInventory() {
  INV.load = {};
  INV.bag = [];
  Object.assign(INV, { bandT: 0, bandCd: 0, regenT: 0, guardT: 0, reelT: 0, reelCd: 0, windT: 0, windCd: 0, slamCd: 0, meleeHits: 0, rangedHits: 0, lastXp: 0, lastLevel: 1 });
  INV.marks.clear();
  INV.scoped.clear();
  for (const d of drops) d.mesh.dispose();
  drops = [];
  refresh();
  setReelLook(false);
}

const cls = () => kit.id as ClassId;
export const wearable = (it: Item) => canWear(cls(), ITEM[it.id]);

/** Put a bag item on (the worn one goes into the bag). */
export function equipFromBag(i: number) {
  const it = INV.bag[i];
  if (!it) return;
  if (!wearable(it)) return invHooks.message(t('cantWear'));
  const slot = ITEM[it.id].slot;
  const old = INV.load[slot];
  INV.bag.splice(i, 1);
  if (old) INV.bag.push(old);
  INV.load[slot] = it;
  refresh();
}

export function unequip(slot: Slot) {
  const it = INV.load[slot];
  if (!it || INV.bag.length >= BAG_SIZE) return;
  delete INV.load[slot];
  INV.bag.push(it);
  refresh();
}

export function dropFromBag(i: number) {
  const it = INV.bag.splice(i, 1)[0];
  if (it) spawnDrop(it, G.player.pos.add(new Vector3(random() - 0.5, 0, random() - 0.5).scale(2)), 4);
  invHooks.changed();
}

/** A new item: worn at once if the slot is empty or it is clearly better, else into the bag. */
export function gainItem(it: Item): boolean {
  const d = ITEM[it.id];
  const cur = INV.load[d.slot];
  if (wearable(it) && (!cur || itemScore(it) > itemScore(cur) * 1.15)) {
    if (cur) {
      if (INV.bag.length >= BAG_SIZE) return false;
      INV.bag.push(cur);
    }
    INV.load[d.slot] = it;
    refresh();
    return true;
  }
  if (INV.bag.length >= BAG_SIZE) return false;
  INV.bag.push(it);
  invHooks.changed();
  return true;
}

// ---- Items on the ground ------------------------------------------------------------------
type Drop = { it: Item; pos: Vector3; mesh: Mesh; t: number; lock: number };
let drops: Drop[] = [];
const dropMats = new Map<string, StandardMaterial>();
function dropMat(color: string) {
  let m = dropMats.get(color);
  if (!m) {
    m = new StandardMaterial(`drop-${color}`, G.scene);
    m.emissiveColor = Color3.FromHexString(color);
    m.diffuseColor = Color3.Black();
    m.disableLighting = true;
    m.alpha = 0.92;
    dropMats.set(color, m);
  }
  return m;
}

export function spawnDrop(it: Item, at: Vector3, lock = 0) {
  const color = RARITY_COLOR[it.rarity];
  const gem = MeshBuilder.CreatePolyhedron('drop', { type: 1, size: 0.32 }, G.scene);
  const beam = MeshBuilder.CreateCylinder('drop-beam', { height: it.rarity === 'common' ? 1.2 : 3.2, diameter: 0.07 }, G.scene);
  beam.parent = gem;
  beam.position.y = it.rarity === 'common' ? 0.5 : 1.5;
  gem.material = dropMat(color);
  beam.material = dropMat(color);
  gem.isPickable = beam.isPickable = false;
  gem.position.copyFrom(at).addInPlaceFromFloats(0, 0.6, 0);
  drops.push({ it, pos: at.clone(), mesh: gem, t: 90, lock });
}

/** Mobs, bosses and bots drop items when the player kills them. */
export function onKill(killer: Unit | null, victim: Unit) {
  const credit = killer && (killer.kind === 'decoy' || killer.kind === 'pet') ? killer.owner : killer;
  if (credit !== G.player || victim === G.player) return;
  const min = minutes();
  const at = victim.pos;
  const roll = (boss = false) => rollItem(cls(), min, random, boss);
  if (victim.kind === 'mob' && random() < 0.08) spawnDrop(roll(), at);
  if (victim.kind === 'boss') for (let i = 0; i < 2; i++) spawnDrop(roll(true), at.add(new Vector3(i * 1.2 - 0.6, 0, 0)));
  if (victim.kind === 'bot') spawnDrop(roll(), at);
}

function updateDrops(dt: number) {
  const p = G.player;
  drops = drops.filter((d) => {
    d.t -= dt;
    d.lock -= dt;
    d.mesh.rotation.y += dt * 1.6;
    d.mesh.position.y = d.pos.y + 0.6 + Math.sin(G.time * 3 + d.pos.x) * 0.12;
    if (d.lock <= 0 && p.alive && flatDist(d.pos, p.pos) < 1.6 && Math.abs(d.pos.y - p.pos.y) < 2) {
      if (gainItem(d.it)) {
        invHooks.message(t('picked', { n: ITEM[d.it.id].name[getLangSafe()] }));
        d.mesh.dispose();
        return false;
      }
      invHooks.message(t('bagFull'));
      d.lock = 3;
    }
    if (d.t <= 0) d.mesh.dispose();
    return d.t > 0;
  });
}

// ---- Combat hooks ---------------------------------------------------------------------------
const markedByMe = (u: Unit) => (INV.marks.get(u.id) ?? 0) > G.time;

/** Damage the player deals, after the class rules. */
export function gearOutgoing(target: Unit, dmg: number, src: Unit | null): number {
  const s = INV.s;
  const melee = host.weapon() === 'melee';
  let m = 1 + s.dmg + (src && src.kind === 'pet' ? 0 : melee ? s.meleeDmg : s.rangedDmg);
  if (src && src.kind === 'pet' && INV.u.has('packClaw')) m += 0.25;
  if (target.kind === 'bot' || target.kind === 'decoy') {
    if (INV.set >= NOIR_SET.clue.pieces && markedByMe(target)) m += NOIR_SET.clue.dmg;
    if (INV.set >= NOIR_SET.coldOpen.pieces && G.time - target.lastCombat > NOIR_SET.coldOpen.quiet) m += NOIR_SET.coldOpen.dmg;
    if (INV.reelT > 0 && markedByMe(target)) m += NOIR_SET.lastReel.dmg;
  }
  if ((INV.scoped.get(target.id) ?? 0) > G.time) m += 0.1;
  return dmg * m;
}

/** Damage the player takes, after armor. */
export function gearIncoming(dmg: number, src: Unit | null): number {
  let dr = armorToDr(INV.s.armor);
  if (INV.u.has('bulwark') && src) {
    const to = src.pos.subtract(G.player.pos);
    const f = new Vector3(Math.sin(G.player.yaw), 0, Math.cos(G.player.yaw));
    if (Vector3.Dot(to.normalize(), f) > 0.3) dr += 0.15;
  }
  const out = dmg * (1 - Math.min(0.75, dr));
  if (INV.bandT > 0 && out > 0) stopBandage(true);
  return out;
}

export function gearAfterHit(target: Unit, dmg: number, src: Unit | null) {
  const p = G.player;
  if (INV.s.lifesteal > 0 && dmg > 0) p.hp = Math.min(p.maxHp, p.hp + dmg * INV.s.lifesteal);
  if (INV.set >= NOIR_SET.clue.pieces) INV.marks.set(target.id, G.time + NOIR_SET.clue.markTime);
  if (src && src !== p) return;
  if (host.weapon() === 'melee') {
    INV.meleeHits++;
    if (INV.u.has('tideBlade') && INV.meleeHits % 4 === 0 && target.alive) later(() => target.alive && dealDamage(p, target, 15, { noBackstab: true }));
    if (INV.u.has('orbPress') && INV.meleeHits % 4 === 0) P.orbs = Math.min(5, P.orbs + 1);
  } else {
    INV.rangedHits++;
    if (INV.u.has('markShot') && kit.id === 'scout' && dmg >= 60) INV.scoped.set(target.id, G.time + 4);
    if (INV.u.has('chainBolt') && kit.id === 'mage' && INV.rangedHits % 5 === 0) {
      const other = enemiesNear(target.pos, 8).find((u) => u !== target);
      if (other) later(() => other.alive && dealDamage(p, other, dmg * 0.7, { noBackstab: true }));
    }
  }
}
/** Run a follow-up hit next frame (never inside another hit). */
const queue: (() => void)[] = [];
const later = (f: () => void) => queue.push(f);

/** Shorter stuns and slows on the player (heavy armor). */
export const tenacity = () => INV.s.tenacity;

// ---- Movement numbers main.ts reads ---------------------------------------------------------
export function gearSpeedMult() {
  let m = 1 + INV.s.speed;
  if (INV.bandT > 0) m *= BANDAGE.moveMult;
  if (INV.windT > 0) m *= 1.3;
  if (INV.reelT > 0) m *= 1 + NOIR_SET.lastReel.speed;
  return m;
}
export const gearAtkMult = () => 1 + INV.s.atkSpeed;
/** Dash costs this share of the normal breath cost. */
export const gearDashCost = () => 1 + INV.s.dashCd;
export const gearWallRun = () => INV.s.wallRun;
export const gearSlam = () => INV.s.slam;
export const has = (u: Unique) => INV.u.has(u);

/** Heavy legs: land a slam. */
export function landSlam() {
  const p = G.player;
  const hit = enemiesNear(p.pos, SLAM.radius);
  for (const u of hit) {
    dealDamage(p, u, INV.s.slam, { noBackstab: true });
    if (u.alive) slowUnit(u, SLAM.slow, SLAM.slowTime);
  }
  ringFx(p.pos, SLAM.radius, '#f2b33d', 0.35);
  INV.slamCd = SLAM.cd;
}
export const slamReady = () => INV.s.slam > 0 && INV.slamCd <= 0;

/** During a dash: Stake Greaves knock enemies back, Pavement Boots leave ice. */
export function dashTouch(dir: Vector3) {
  const p = G.player;
  if (has('ramDash'))
    for (const u of enemiesNear(p.pos, 1.4)) {
      if (u.stunT > 0) continue;
      stun(u, 0.4);
      u.pos.addInPlace(dir.scale(1.5));
    }
  if (has('frostTrail')) for (const u of enemiesNear(p.pos, 2.2)) slowUnit(u, 0.35, 1.5);
}

// ---- Armor (Zırh): chest and head points that soak hits before health ------------------------
const ARMOR_SLOTS = ['chest', 'head'] as const;
const plateOf = (it: Item | undefined) => (it ? itemStats(it).plate : 0);
/** Armor points left and the most there can be. */
export const armorMax = () => ARMOR_SLOTS.reduce((a, k) => a + plateOf(INV.load[k]), 0);
export const armorNow = () => ARMOR_SLOTS.reduce((a, k) => a + Math.max(0, plateOf(INV.load[k]) - (INV.load[k]?.worn ?? 0)), 0);
/** Let the armor soak a hit (chest first). Returns the damage left for health. */
export function absorbArmor(dmg: number): number {
  for (const k of ARMOR_SLOTS) {
    const it = INV.load[k];
    if (!it || dmg <= 0) continue;
    const left = plateOf(it) - (it.worn ?? 0);
    if (left <= 0) continue;
    const take = Math.min(left, dmg);
    it.worn = (it.worn ?? 0) + take;
    dmg -= take;
    if (take >= left) invHooks.message(t('armorBroke'));
  }
  return dmg;
}
/** Vendor repair: every lost armor point comes back. */
export function repairArmor() {
  for (const k of ARMOR_SLOTS) if (INV.load[k]) INV.load[k]!.worn = 0;
  invHooks.changed();
}

// ---- Bandage and Last Reel --------------------------------------------------------------------
const channelTime = () => BANDAGE.channel * (has('nurse') ? 0.6 : 1);
const bandTicks = () => Math.round(BANDAGE.channel / BANDAGE.tick);

export function tryBandage(): string | null {
  const p = G.player;
  if (INV.bandT > 0) return null;
  if (INV.bandCd > 0) return `${t('bandageCd')} (${Math.ceil(INV.bandCd)})`;
  if (p.hp >= p.maxHp) return t('bandageFull');
  if (p.stunT > 0) return null;
  INV.bandT = channelTime();
  INV.bandTicks = 0;
  return null;
}

export function stopBandage(broken: boolean) {
  if (INV.bandT <= 0) return;
  INV.bandT = 0;
  INV.bandCd = BANDAGE.cd * (1 + INV.s.bandageCd) * (broken ? BANDAGE.cancelCd : 1);
  if (broken) invHooks.message(t('bandageBroke'));
}
export const bandageShare = () => (INV.bandT > 0 ? 1 - INV.bandT / channelTime() : 0);
export const bandageCdShare = () => (INV.bandCd > 0 ? INV.bandCd / (BANDAGE.cd * (1 + INV.s.bandageCd)) : 0);

export function tryReel(): boolean {
  if (INV.set < NOIR_SET.lastReel.pieces || INV.reelCd > 0) return false;
  INV.reelT = NOIR_SET.lastReel.dur;
  INV.reelCd = NOIR_SET.lastReel.cd;
  setReelLook(true);
  return true;
}
export const reelReady = () => INV.set >= NOIR_SET.lastReel.pieces && INV.reelCd <= 0;

function setReelLook(on: boolean) {
  const c = document.getElementById('game');
  if (c) c.style.filter = on ? 'grayscale(1) contrast(1.35) brightness(0.95)' : '';
  document.body.classList.toggle('reel', on);
}

/** Total XP the player has earned (for the jewels). */
function totalXp() {
  const p = G.player;
  let s = p.xp;
  for (let i = 0; i < p.level - 1; i++) s += XP_TO_NEXT[i] ?? 0;
  return s;
}

export function updateInventory(dt: number) {
  const p = G.player;
  while (queue.length) queue.shift()!();
  INV.bandCd -= dt;
  INV.reelCd -= dt;
  INV.windCd -= dt;
  INV.windT -= dt;
  INV.slamCd -= dt;
  if (INV.reelT > 0) {
    INV.reelT -= dt;
    if (INV.reelT <= 0) setReelLook(false);
  }
  // Jewels level with the character; level-ups also change max health.
  const xp = totalXp();
  if (xp > INV.lastXp) {
    const gain = xp - INV.lastXp;
    let changed = false;
    for (const slot of ['ring', 'necklace'] as const) {
      const it = INV.load[slot];
      if (it) (it.xp += gain * JEWEL_XP_SHARE), (changed = true);
    }
    if (changed) INV.s = totalStats(INV.load);
  }
  INV.lastXp = xp;
  if (p.level !== INV.lastLevel) {
    INV.lastLevel = p.level;
    recomputeHp();
  }
  if (!p.alive) return;
  // The bandage heals in ticks (every 0.5 s, 10% each); moving, damage, attacks, skills and dashes stop it.
  if (INV.bandT > 0) {
    INV.bandT -= dt;
    const total = channelTime();
    const due = Math.min(bandTicks(), Math.floor(((total - Math.max(0, INV.bandT)) / total) * bandTicks() + 1e-6));
    for (; INV.bandTicks < due; INV.bandTicks++) {
      p.hp = Math.min(p.maxHp, p.hp + (p.maxHp * BANDAGE.healPct * (1 + INV.s.bandageHeal)) / bandTicks());
      ringFx(p.pos, 0.6, '#f4efe2', 0.2);
    }
    if (INV.bandT <= 0) {
      INV.bandT = 0.0001;
      stopBandage(false);
      if (has('stitchedLining')) P.shield = Math.max(P.shield, 25);
    }
  }
  if (INV.s.regenEvery > 0) {
    INV.regenT += dt;
    if (INV.regenT >= INV.s.regenEvery) {
      INV.regenT = 0;
      p.hp = Math.min(p.maxHp, p.hp + p.maxHp * INV.s.regenPct);
      ringFx(p.pos, 0.6, '#9cff8a', 0.25);
    }
  }
  if (INV.s.guardEvery > 0) {
    INV.guardT += dt;
    if (INV.guardT >= INV.s.guardEvery) {
      INV.guardT = 0;
      P.shield = Math.max(P.shield, p.maxHp * INV.s.guardPct);
    }
  }
  if (has('secondWind') && INV.windCd <= 0 && p.hp < p.maxHp * 0.3) {
    INV.windT = 3;
    INV.windCd = 60;
  }
  updateDrops(dt);
}

/** Enemies the noir set shows through walls (marked) and the Rain Hood / Last Reel reveal. */
export function revealed(u: Unit): boolean {
  if (markedByMe(u)) return true;
  if (INV.reelT > 0) return flatDist(u.pos, G.player.pos) < 30;
  return has('clearSight') && flatDist(u.pos, G.player.pos) < 10;
}

/** Debug: give a full kit. */
export function debugKit(weight: 'light' | 'medium' | 'heavy' | 'noir', rarity: Item['rarity'] = 'epic') {
  const pick = (slot: Slot) => Object.values(ITEM).find((d) => d.slot === slot && (weight === 'noir' ? d.set === 'noir' : d.weight === weight && !d.set));
  for (const slot of ['head', 'chest', 'legs'] as Slot[]) {
    const d = pick(slot);
    if (d) INV.load[slot] = { id: d.id, rarity, xp: 0 };
  }
  const w = Object.values(ITEM).find((d) => d.slot === 'weapon' && d.cls === kit.id && d.hand === host.weapon());
  if (w) INV.load.weapon = { id: w.id, rarity, xp: 0 };
  INV.load.necklace = { id: weight === 'noir' ? 's_locket' : 'n_ember', rarity, xp: 0 };
  INV.load.ring = { id: weight === 'noir' ? 's_ring' : 'r_flint', rarity, xp: 0 };
  refresh();
}

