import { Engine } from '@babylonjs/core/Engines/engine';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Ray } from '@babylonjs/core/Culling/ray';
import { Scene } from '@babylonjs/core/scene';
import { UniversalCamera } from '@babylonjs/core/Cameras/universalCamera';
// Side-effect imports: register shadow and picking support on the scene.
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent';
import '@babylonjs/core/Culling/ray';
import './style.css';
import { Input } from './input';
import { addShake, feel, initFeel, kick, muzzleFlash, shakeOffset, sfx, unlockAudio, updateFeel } from './feel';
import { createHippoBody, loadCharacterKits } from './characters';
import { placeHouses } from './houses';
import { placeProps } from './props';
import { clayifyScene, initLook, splatPlane, watercolorFxMaterial } from './look';
import { buildWorld, ceilingHeight, groundHeight, pointHitsObstacle, resolveWalls } from './world';
import { placeNatureAssets } from './nature';
import { createActorBody, forwardFromYaw, rightFromYaw } from './actors';

import { G, MODS, PS, chest, glowMat, lineFx, makeUnit, ringFx, spawnFx, tickStatus, updateBullets, updateFx, type Unit } from './core';
import {
  P,
  allKits,
  castSlot,
  def,
  kit,
  learn,
  playerFaded,
  playerVisibility,
  resetKit,
  setHost,
  setKit,
  skills,
  updateZones,
  type ClassId,
  type Weapon,
} from './kit';
import { fadeState } from './rogue';
import './mage';
import './fighter';
import './scout';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { botDied, resetDirector, spawnBoss, spawnDummy, updateAI } from './ai';
import { INV, debugKit, spawnDrop, dashTouch, gearAfterHit, gearAtkMult, gearDashCost, gearIncoming, gearOutgoing, gearSlam, gearSpeedMult, gearWallRun, landSlam, onKill as gearOnKill, resetInventory, slamReady, stopBandage, tryBandage, tryReel, updateInventory } from './inventory';
import { ITEM, RARITY_COLOR, SLAM, WALL_RUN } from './gear';
import { SPECIALS } from './specials';
import { rigHooks, rigReparent, rigSwing, updateRig } from './armory/rig';
import { SPECIES, SPECIES_IDS, getSpecies, setSpecies, type SpeciesId } from './armory/species';
import { castHooks, meleeTargets } from './kit';
import { applySkillLanguage, blurb, getLang, onLang, t as T } from './i18n';
import { SETTINGS, initUi, invUi, paintArt, onSettings, renderInventory, renderShop, shopUi } from './ui';
import { MACHINES, buildVendors, nearMachine } from './vendor';
import { loadArtIndex } from './icons';
import { killLog, xpLog, currentOffer, grantXp, prog, resetProgression, rewardKill, xpNeeded } from './progression';
import { random, setRandomSeed, visualRandom } from './random';
import { createLevelUpUi } from './level-up-ui';
import { createGameHud, fmtTime, SKILL_KEYS } from './game-hud';
import bundledMapRaw from './assets/maps/harita-47216.json?raw';
import bundledMap8011Raw from './assets/maps/harita-8011.json?raw';
import type { MapFile } from './mapgen/generate';
import { PLANNER_SAVE_KEY, parseMapFile } from './mapgen/mapfile';

// ---- Tuning (movement and camera) -------------------------------------------
const MOVE = {
  speed: 8.5,
  airControl: 0.85,
  jumpSpeed: 9,
  gravity: 26,
  coyoteTime: 0.1,
};
const STEP_DOWN = 0.45;
/**
 * S4 League style movement: a breath (stamina) bar pays for chained dashes and sprinting,
 * a jump right after a dash becomes a long dash-jump, everyone has a double jump and can kick off walls.
 * Leg gear adds wall running (medium) or a ground slam (heavy).
 * Costs follow the ratios S4 players documented (a dodge or a wall kick is a fifth of the bar,
 * sprinting is a slow drain); see docs/MOVEMENT.md. The code and numbers here are our own.
 */
const S4 = {
  spRegen: 32,
  /** Breath starts coming back this long after the last dash or sprint. */
  spDelay: 0.6,
  /** A fifth of the bar: five dashes back to back empty it. */
  dashCost: 20,
  /** A side dash also breaks a stun (dodge out of it), at a higher price. */
  stunDashCost: 35,
  sideRate: 0.92,
  backRate: 0.78,
  /** Shortest gap between two chained dashes: the next dash can cut into the slide of the last one. */
  dashLock: 0.12,
  /** A dash is a burst then a short slide: the slide adds this much time (fraction of the class dash time). */
  slide: 0.4,
  /** Running out of breath: no regen and slower steps for this long. */
  winded: 1.1,
  windedSlow: 0.82,
  sprintMult: 1.55,
  /** Sprinting is cheap per second (about 16 s from full); breath only drains on the ground. */
  sprintDrain: 6,
  /** Sprinting in the air (W W after a jump): drop faster and keep sprint speed, for bunny hops. */
  airSprintGravity: 1.75,
  airSprintMult: 1.3,
  /** Two W taps within this gap start a sprint that lasts while W is held. */
  doubleTap: 0.3,
  dashJumpWindow: 0.22,
  dashJumpSpeed: 12,
  /**
   * Wall kick: costs breath, only while rising or at the top of a jump (not while falling),
   * and bounces off the wall like light off a mirror (angle in = angle out).
   */
  wallKick: { up: 9.5, out: 8, max: 3, cost: 20, minVelY: -2.5, keep: 0.9 },
  flipTime: 0.42,
  /**
   * The side dash cartwheel lasts this long (timed from the user's own S4 recordings, 120 fps):
   * push-off with no wind-up, upside down at 0.1 s, a hang at the top, touchdown at 0.365 s.
   * The class dash keeps its distance; only its time is stretched to match.
   */
  cartwheelTime: 0.4,
  /** Body turn (degrees) at each time (ms) of the cartwheel: fast start, hang at the top, fast finish. */
  cartwheelKeys: [
    [0, 20],
    [25, 70],
    [75, 135],
    [100, 180],
    [125, 200],
    [175, 225],
    [200, 250],
    [250, 290],
    [325, 350],
    [365, 360],
    [400, 360],
  ] as [number, number][],
};
const BREATH_MAX: Record<ClassId, number> = { rogue: 120, fighter: 110, scout: 100, mage: 90 };
const breathMax = () => BREATH_MAX[kit.id];
const CAMERA = { distance: 5, shoulder: 1.05, height: 1.75, fov: 0.95 };
// Right-click aim: closer over-the-shoulder view with zoom and slower movement.
const AIM = { distance: 2.8, shoulder: 1.15, fov: 0.55, moveMult: 0.55, blendSpeed: 12 };

const params = new URLSearchParams(location.search);
const mapId = params.get('map')?.replace(/^harita-/, '');
// ?map=47216 | 8011 plays a bundled planner map, ?map=planner the planner's browser autosave.
// A missing or broken file falls back to the city block and says why.
const BUNDLED_MAPS: Record<string, string> = { '47216': bundledMapRaw, '8011': bundledMap8011Raw };
let playingMap: MapFile | undefined;
let mapError = '';
if (mapId) {
  let raw: string | null | undefined = Object.hasOwn(BUNDLED_MAPS, mapId) ? BUNDLED_MAPS[mapId] : undefined;
  if (mapId === 'planner') {
    try {
      raw = localStorage.getItem(PLANNER_SAVE_KEY);
    } catch {
      raw = null;
    }
  }
  if (raw === undefined) mapError = `unknown map "${mapId}"`;
  else {
    const parsed = parseMapFile(raw);
    if (parsed.ok) playingMap = parsed.map;
    else mapError = parsed.reason;
  }
  if (mapError) console.warn(`Map ${mapId} could not be loaded: ${mapError}. Using the city block.`);
}
const mapLabel = mapId === 'planner' ? T('plannerMap') : `#${mapId}`;
const seed = Number(params.get('seed')) || playingMap?.gen.seed || Math.floor(Math.random() * 1e6) + 1;
setRandomSeed(seed);
const DEBUG = params.has('debug');

const $ = (id: string) => document.getElementById(id)!;
let gameHud: ReturnType<typeof createGameHud>;
function toast(text: string, time = 1.6) { gameHud.toast(text, time); }
function feed(text: string) { gameHud.feed(text); }
const canvas = $('game') as HTMLCanvasElement;
const overlay = $('overlay');
const overlayText = $('overlay-text');
const playBtn = $('play') as HTMLButtonElement;
const crosshair = $('crosshair');
const slotsEl = $('slots');
const cardsEl = $('cards');

const engine = new Engine(canvas, true, { stencil: true });
const scene = new Scene(engine);
const world = buildWorld(scene, seed, { houseModel: true, mapFile: playingMap });
if (world.field && world.mapObjects) {
  placeNatureAssets(scene, world.field, world.mapObjects).catch((e) => console.error('Nature models failed to load', e));
}
buildVendors(scene, world, seed);
const input = new Input(canvas);
const levelUpUi = createLevelUpUi(input);
placeHouses(scene, world)
  .then(clayifyScene)
  .catch((e) => console.error('House model failed to load', e));
placeProps(scene, world)
  .then(clayifyScene)
  .catch((e) => console.error('Street props failed to load', e));
const seedText = () => ($('seed').textContent = `${playingMap ? `${T('map')} ${mapLabel}` : `${mapError ? `${T('mapFailed')} · ` : ''}${T('city')} #${seed} · ${T('newCity')}`}${DEBUG ? ' · L lv · B boss · K $' : ''}`);
seedText();

const camera = new UniversalCamera('cam', new Vector3(0, 3, -6), scene);
camera.inputs.clear();
camera.fov = CAMERA.fov;
camera.minZ = 0.1;

Object.assign(G, { scene, world, camera, input });
initLook(scene, camera, world.shadows);
clayifyScene();
initFeel(scene);

// Match randomness is shared so the seed replays the same decisions and drops.
const rand = random;

// ---- Player -----------------------------------------------------------------
const playerColors = { body: '#7a1f2b', head: '#e9d6c0', weapon: '#ffd27a' };
let pBody = createActorBody(scene, world, 'player', playerColors, false, {});
setKit((params.get('class') as ClassId) || 'rogue');
const player: Unit = makeUnit('player', 'Sen', pBody, new Vector3(), 0, kit.stats.maxHp, { colors: playerColors });
G.player = player;
for (const m of pBody.meshes) m.isPickable = false;

const ctl = {
  grounded: true,
  sinceGrounded: 0,
  sp: breathMax(),
  spIdle: 0,
  airDashes: 1,
  wallKicks: 3,
  dashLock: 0,
  sprinting: false,
  /** Time since the last W press, and whether a W double tap is sprinting. */
  sinceW: 9,
  wSprint: false,
  airSprint: false,
  sinceDash: 9,
  velH: new Vector3(),
  flipT: 0,
  flipDir: 1,
  wallRunT: 0,
  wallRunDone: false,
  wallN: new Vector3(),
  slamming: false,
  weapon: 'ranged' as Weapon,
  fireCd: 0,
  dashT: 0,
  dashTotal: 0,
  dashCommit: false,
  winded: 0,
  ghostT: 0,
  dashCd: 0,
  dashDir: new Vector3(),
  dashSpeedMul: 1,
  /** A new dash began this frame (restart the cartwheel even if one is playing). */
  dashStarted: false,
  /** Right-click melee special: cooldown, lunge timer and direction, counter stance timer. */
  specialCd: 0,
  lungeT: 0,
  lungeTotal: 0,
  lungeDir: new Vector3(),
  shieldT: 0,
  windupT: 0,
  wasRight: false,
  moving: false,
  aimTime: 0,
};

/** A named weapon item changes how that weapon looks; its rarity shows as a gem. */
rigHooks.named = () => {
  const it = INV.load.weapon;
  const d = it && ITEM[it.id];
  return it && d?.hand ? { hand: d.hand, gem: RARITY_COLOR[it.rarity] } : null;
};

/** The class's two weapons, parented to the player's body (built when the match starts). */
let weaponNodes: Record<Weapon, TransformNode> | null = null;
function buildWeapons() {
  if (weaponNodes) for (const n of Object.values(weaponNodes)) n.dispose();
  weaponNodes = kit.buildWeapons(pBody.root);
  setWeapon(ctl.weapon);
}

/** Swap the placeholder body for the user's hippo once it has loaded. */
function usePlayerModel() {
  const body = createHippoBody(scene, world, 'player-hippo');
  if (!body) return;
  for (const m of body.meshes) {
    m.isPickable = false;
    m.metadata = { unitId: player.id };
  }
  if (weaponNodes) for (const n of Object.values(weaponNodes)) n.parent = body.root;
  rigReparent(body.root);
  for (const m of pBody.meshes) m.dispose();
  pBody.root.dispose(true);
  pBody = body;
  player.body = body;
}

function setWeapon(w: Weapon) {
  ctl.weapon = w;
  ctl.aimTime = 0;
  if (weaponNodes) {
    weaponNodes.ranged.setEnabled(w === 'ranged');
    weaponNodes.melee.setEnabled(w === 'melee');
  }
  crosshair.classList.toggle('melee', w === 'melee');
}

function aimDirection(): Vector3 {
  const cp = Math.cos(input.pitch);
  return new Vector3(Math.sin(input.yaw) * cp, Math.sin(input.pitch), Math.cos(input.yaw) * cp);
}

function muzzle(): Vector3 {
  return player.pos.add(rightFromYaw(input.yaw).scale(0.42)).add(forwardFromYaw(input.yaw).scale(0.8)).addInPlaceFromFloats(0, 1.2, 0);
}

function isMyAllyMesh(m: { metadata?: { unitId?: number } }) {
  const u = G.units.find((x) => x.id === m.metadata?.unitId);
  return u?.kind === 'decoy' || u?.kind === 'pet';
}

/** The world point under the crosshair: the aim ray goes from the camera, bullets fly from the weapon to it. */
function aimPoint(range: number, worldOnly = false): Vector3 {
  const dir = aimDirection();
  const ray = new Ray(camera.position.clone(), dir, range);
  const pick = scene.pickWithRay(
    ray,
    (m) => m.isPickable && m.isVisible && m.metadata?.unitId !== player.id && !isMyAllyMesh(m) && !(worldOnly && m.metadata?.unitId),
  );
  return pick?.hit && pick.pickedPoint ? pick.pickedPoint : camera.position.add(dir.scale(range));
}

setHost({
  aimDir: aimDirection,
  aimOrigin: () => camera.position.add(aimDirection().scale(Vector3.Distance(camera.position, chest(player)))),
  aimPoint,
  muzzle,
  weapon: () => ctl.weapon,
  setWeapon,
  teleport: (pos, yaw) => {
    player.pos.copyFrom(pos);
    player.pos.y = groundHeight(new Vector3(pos.x, pos.y + 0.3, pos.z), player.radius, world.boxes);
    resolveWalls(player.pos, player.radius, player.height, world.boxes);
    player.velY = 0;
    input.yaw = yaw;
    player.yaw = yaw;
  },
  message: (t) => toast(t),
  isAiming,
  aimTime: () => ctl.aimTime,
  launch: (v) => {
    if (ctl.dashCommit) return;
    player.velY = v;
    ctl.grounded = false;
    ctl.sinceGrounded = MOVE.coyoteTime;
  },
  grounded: () => ctl.grounded,
});

// Class rules for damage: the kit first (evasion, spell shield), then any shield points.
MODS.outgoing = (t, d, src, opts) => {
  const o = kit.outgoing?.(t, d, src, opts) ?? { dmg: d, crit: false };
  return { dmg: gearOutgoing(t, o.dmg, src), crit: o.crit };
};
MODS.incoming = (d, src) => {
  let dmg = kit.incoming ? kit.incoming(d, src) : d;
  // Mage spell shield: nothing gets through while it is up.
  if (ctl.shieldT > 0) dmg = 0;
  if (dmg > 0) dmg = gearIncoming(dmg, src);
  if (dmg > 0 && P.shield > 0) {
    const absorbed = Math.min(P.shield, dmg);
    P.shield -= absorbed;
    dmg -= absorbed;
  }
  return dmg;
};
MODS.afterHit = (t, d, src) => {
  kit.afterHit?.(t, d, src);
  gearAfterHit(t, d, src);
};
castHooks.onCast = () => stopBandage(true);

/** The wall the player touches (its outward normal), if any. */
function wallNormal(): Vector3 | null {
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const d = new Vector3(Math.sin(a), 0, Math.cos(a));
    const p = player.pos.add(d.scale(player.radius + 0.35)).addInPlaceFromFloats(0, 1.0, 0);
    if (pointHitsObstacle(p, world.boxes)) return d.scale(-1);
  }
  return null;
}

function flip(dir: number) {
  ctl.flipT = S4.flipTime;
  ctl.flipDir = dir;
}

// ---- Player update -------------------------------------------------------------
function updatePlayer(dt: number) {
  const fwd = forwardFromYaw(input.yaw);
  const right = rightFromYaw(input.yaw);
  const fb = input.axis('KeyS', 'KeyW');
  const move = fwd.scale(fb).add(right.scale(input.axis('KeyA', 'KeyD')));
  if (move.lengthSquared() > 0) move.normalize();
  // Strafing is a bit slower than running forward, backpedalling slower still.
  if (fb < 0) move.scaleInPlace(S4.backRate);
  else if (fb === 0) move.scaleInPlace(S4.sideRate);
  ctl.moving = move.lengthSquared() > 0 || ctl.dashT > 0;
  if (INV.bandT > 0 && (move.lengthSquared() > 0 || input.keys.has('Space'))) stopBandage(true);
  const stunned = player.stunT > 0;

  if (input.consume('KeyF')) setWeapon(ctl.weapon === 'ranged' ? 'melee' : 'ranged');
  if (input.consume('KeyR')) kit.reload?.();
  SKILL_KEYS.forEach((k, i) => {
    if (input.consume(k.code)) {
      castSlot(i);
      const el = slotsEl.children[i] as HTMLElement | undefined;
      if (el) {
        el.classList.remove('pulse');
        void el.offsetWidth; // restart the CSS animation
        el.classList.add('pulse');
      }
    }
  });

  const dash = kit.dash;
  if (input.consume('KeyX')) {
    const why = tryBandage();
    if (why) toast(why);
  }
  if (input.consume('KeyG') && !tryReel() && INV.set >= 5) toast(T('reel'));
  ctl.dashLock -= dt;
  ctl.winded = Math.max(0, ctl.winded - dt);
  ctl.sinceDash += dt;
  if (ctl.dashCommit && ctl.grounded && ctl.dashT <= 0) ctl.dashCommit = false;
  const cost = (stunned ? S4.stunDashCost : S4.dashCost) * gearDashCost();
  const canDash = () => !ctl.dashCommit && ctl.dashLock <= 0 && ctl.sp >= cost && (ctl.grounded || ctl.airDashes > 0 || ctl.wallRunT > 0);
  const doDash = (dir: Vector3) => {
    if (stunned) player.stunT = 0;
    ctl.dashDir = dir;
    ctl.dashStarted = true;
    ctl.dashCommit = true;
    ctl.dashT = ctl.dashTotal = dash.time * (1 + S4.slide);
    // Stretch to the cartwheel's time but keep the distance (the Mage's blink stays instant).
    ctl.dashSpeedMul = 1;
    if (!dash.blink) {
      ctl.dashSpeedMul = ctl.dashTotal / S4.cartwheelTime;
      ctl.dashT = ctl.dashTotal = S4.cartwheelTime;
    }
    ctl.ghostT = 0;
    feel.fovPunch += 0.07;
    ctl.dashLock = S4.dashLock;
    ctl.sp -= cost;
    if (ctl.sp <= 0.5) ctl.winded = S4.winded;
    ctl.spIdle = 0;
    ctl.sinceDash = 0;
    ctl.velH.setAll(0);
    ctl.wallRunT = 0;
    stopBandage(true);
    kit.onDash?.();
    dashFx(true);
    if (!ctl.grounded) ctl.airDashes -= 1;
    player.velY = Math.max(player.velY, 0);
  };
  // W twice quickly: sprint for as long as W stays held.
  ctl.sinceW += dt;
  if (input.consume('KeyW')) {
    if (ctl.sinceW < S4.doubleTap) ctl.wSprint = true;
    ctl.sinceW = 0;
  }
  // Out of breath ends a ground sprint, but an air sprint (fast drop) still works with an empty bar.
  if (!input.keys.has('KeyW') || (ctl.sp <= 0 && ctl.grounded)) ctl.wSprint = false;
  ctl.sprinting = !stunned && ctl.wSprint && move.lengthSquared() > 0 && ctl.grounded && ctl.sp > 0 && ctl.dashT <= 0 && !isAiming() && INV.bandT <= 0;
  // In the air a sprint is a fast drop that keeps its speed: cheaper than running, so hopping saves breath.
  ctl.airSprint = !stunned && ctl.wSprint && !ctl.grounded && ctl.dashT <= 0 && ctl.wallRunT <= 0 && !ctl.slamming && move.lengthSquared() > 0;
  if (ctl.sprinting) {
    ctl.sp = Math.max(0, ctl.sp - S4.sprintDrain * dt);
    if (ctl.sp <= 0) ctl.winded = S4.winded;
    ctl.spIdle = 0;
  } else if (ctl.dashT <= 0 && !ctl.airSprint) {
    ctl.spIdle += dt;
    if (ctl.spIdle > S4.spDelay && ctl.winded <= 0) ctl.sp = Math.min(breathMax(), ctl.sp + S4.spRegen * dt);
  }

  // Space: with A or D held it is a side dash; otherwise ground jump, wall run jump-off or wall kick.
  // While stunned, only a side dash works (it breaks the stun).
  if (input.consume('Space') && !ctl.dashCommit && (!stunned || input.axis('KeyA', 'KeyD') !== 0)) {
    const wn = ctl.grounded || stunned ? null : wallNormal();
    const side = input.axis('KeyA', 'KeyD');
    const kickCost = S4.wallKick.cost * gearDashCost();
    const canKick = !stunned && !!wn && ctl.wallKicks > 0 && player.velY > S4.wallKick.minVelY && ctl.sp >= kickCost;
    if (stunned) {
      if (canDash()) doDash(right.scale(side));
    } else if (side !== 0 && !canKick && ctl.wallRunT <= 0) {
      if (canDash()) doDash(right.scale(side));
    } else if (ctl.wallRunT > 0) {
      player.velY = WALL_RUN.jumpOff;
      ctl.velH = ctl.wallN.scale(7).add(fwd.scale(4));
      ctl.wallRunT = 0;
      flip(-1);
    } else if (ctl.grounded || ctl.sinceGrounded < MOVE.coyoteTime) {
      if (ctl.dashT > 0 || ctl.sinceDash < S4.dashJumpWindow) {
        // Dash-jump: keep the dash's speed for a long, low leap.
        player.velY = MOVE.jumpSpeed * 0.85;
        ctl.velH = ctl.dashDir.scale(S4.dashJumpSpeed);
        if (ctl.dashT > 0) dashFx(false);
        ctl.dashT = 0;
        flip(1);
      } else player.velY = MOVE.jumpSpeed;
      ctl.grounded = false;
      ctl.sinceGrounded = MOVE.coyoteTime;
      ctl.airDashes = 1;
      ctl.wallKicks = S4.wallKick.max;
    } else if (wn && canKick) {
      player.velY = S4.wallKick.up;
      // Mirror the incoming horizontal speed off the wall, then make sure it pushes away hard enough.
      const run = MOVE.speed * kit.speedMult() * gearSpeedMult() * MOVE.airControl;
      const vin = move.scale(run).add(ctl.velH);
      vin.y = 0;
      const into = Vector3.Dot(vin, wn);
      const vout = vin.subtract(wn.scale(2 * into)).scale(S4.wallKick.keep);
      const outward = Vector3.Dot(vout, wn);
      if (outward < S4.wallKick.out) vout.addInPlace(wn.scale(S4.wallKick.out - outward));
      ctl.velH = vout;
      ctl.wallKicks -= 1;
      ctl.sp -= kickCost;
      ctl.spIdle = 0;
      if (ctl.sp <= 0.5) ctl.winded = S4.winded;
      ringFx(player.pos.add(wn.scale(-0.4)), 0.5, kit.dash.color, 0.25);
      flip(-1);
    }
  }
  // Heavy legs: drop and slam (Ctrl or C in the air).
  if (!stunned && !ctl.grounded && !ctl.slamming && input.consume('ControlLeft', 'KeyC') && slamReady() && gearSlam() > 0) {
    ctl.slamming = true;
    ctl.wallRunT = 0;
    ctl.velH.setAll(0);
    player.velY = -SLAM.fallSpeed;
  }
  // Medium legs: touching a wall in the air while moving starts a wall run.
  if (gearWallRun() > 0 && !ctl.grounded && ctl.wallRunT <= 0 && !ctl.wallRunDone && !ctl.slamming && move.lengthSquared() > 0 && ctl.dashT <= 0) {
    const wn = wallNormal();
    if (wn && Math.abs(Vector3.Dot(wn, fwd)) < 0.6) {
      ctl.wallRunT = gearWallRun();
      ctl.wallN = wn;
      ctl.wallRunDone = true;
      player.velY = Math.max(player.velY, 1.5);
    }
  }

  if (ctl.dashT > 0) {
    ctl.dashT -= dt;
    // Burst then slide: full push for the first ~70%, then the feet catch the ground.
    const k = 1 - Math.max(0, ctl.dashT) / ctl.dashTotal;
    const burst = 0.7;
    const f = k < burst ? 1.3 - 0.5 * (k / burst) : 0.45 * (1 - (k - burst) / (1 - burst));
    player.pos.addInPlace(ctl.dashDir.scale(dash.speed * ctl.dashSpeedMul * f * dt));
    ctl.ghostT -= dt;
    if (k < burst && ctl.ghostT <= 0 && !dash.blink) {
      ctl.ghostT = 0.035;
      dashGhost();
    }
    dashTouch(ctl.dashDir);
    if (ctl.dashT <= 0) dashFx(false);
  } else if (ctl.wallRunT > 0) {
    const along = fwd.subtract(ctl.wallN.scale(Vector3.Dot(fwd, ctl.wallN)));
    if (along.lengthSquared() > 0.01) player.pos.addInPlace(along.normalize().scale(WALL_RUN.speed * dt));
    player.pos.addInPlace(ctl.wallN.scale(-0.5 * dt));
    player.velY -= WALL_RUN.gravity * dt;
    ctl.wallRunT -= dt;
    if (!wallNormal()) ctl.wallRunT = 0;
  } else {
    const slow = player.slowT > 0 ? player.slowMul : 1;
    const run = (ctl.sprinting ? S4.sprintMult : ctl.airSprint ? S4.airSprintMult / MOVE.airControl : 1) * (ctl.winded > 0 ? S4.windedSlow : 1);
    const speed = stunned || ctl.slamming ? 0 : MOVE.speed * kit.speedMult() * gearSpeedMult() * run * slow * (ctl.grounded ? 1 : MOVE.airControl) * (isAiming() ? AIM.moveMult : 1) * (ctl.windupT > 0 ? 0.5 : 1);
    player.pos.addInPlace(move.scale(speed * dt)).addInPlace(ctl.velH.scale(dt));
    ctl.velH.scaleInPlace(Math.max(0, 1 - (ctl.grounded ? 10 : 1.2) * dt));
    player.velY -= MOVE.gravity * (ctl.airSprint && player.velY < 4 ? S4.airSprintGravity : 1) * dt;
  }
  resolveWalls(player.pos, player.radius, player.height, world.boxes);

  // Vertical movement: land on roofs, crates and walls, bump into overhangs.
  const nextY = player.pos.y + player.velY * dt;
  if (player.velY > 0) {
    const ceil = ceilingHeight(player.pos, player.radius, player.height, world.boxes);
    if (nextY + player.height > ceil) {
      player.pos.y = ceil - player.height;
      player.velY = 0;
    } else player.pos.y = nextY;
  } else {
    player.pos.y = Math.max(nextY, player.pos.y - 3);
  }
  const floor = groundHeight(new Vector3(player.pos.x, Math.max(player.pos.y, nextY), player.pos.z), player.radius, world.boxes);
  if (player.pos.y <= floor && player.velY <= 0) {
    player.pos.y = floor;
    player.velY = 0;
    if (!ctl.grounded && ctl.slamming) {
      landSlam();
      addShake(0.35);
    }
    ctl.slamming = false;
    ctl.grounded = true;
    ctl.sinceGrounded = 0;
    ctl.airDashes = 1;
    ctl.wallKicks = S4.wallKick.max;
    ctl.wallRunT = 0;
    ctl.wallRunDone = false;
  } else if (player.pos.y > floor + 0.02 || player.velY > 0) {
    if (ctl.grounded && player.velY <= 0 && player.pos.y - floor < STEP_DOWN) player.pos.y = floor;
    else {
      ctl.grounded = false;
      ctl.sinceGrounded += dt;
    }
  }
  player.yaw = input.yaw;

  ctl.aimTime = isAiming() ? ctl.aimTime + dt : 0;
  // Right click with the melee weapon: the class special (paid with breath).
  ctl.specialCd -= dt;
  ctl.shieldT = Math.max(0, ctl.shieldT - dt);
  const rightDown = input.aiming;
  if (rightDown && !ctl.wasRight && ctl.weapon === 'melee' && running) {
    const sp = SPECIALS[kit.id];
    const sCost = sp.cost * gearDashCost();
    if (stunned || ctl.specialCd > 0 || ctl.lungeT > 0 || ctl.windupT > 0 || ctl.dashT > 0) {
      // Not ready: ignore.
    } else if (ctl.sp < sCost) toast(T('noBreath'));
    else {
      ctl.sp -= sCost;
      ctl.spIdle = 0;
      if (ctl.sp <= 0.5) ctl.winded = S4.winded;
      ctl.specialCd = sp.cd;
      stopBandage(true);
      if (sp.lunge) {
        ctl.lungeT = ctl.lungeTotal = sp.lunge.time;
        ctl.lungeDir = fwd.clone();
        if (sp.lunge.hop) player.velY = Math.max(player.velY, sp.lunge.hop);
        feel.fovPunch += 0.05;
      } else if (sp.windup) ctl.windupT = sp.windup;
      else {
        if (sp.shield) ctl.shieldT = sp.shield;
        sp.hit();
      }
      ringFx(player.pos, 0.6, sp.color, 0.2);
    }
  }
  ctl.wasRight = rightDown;
  if (ctl.windupT > 0) {
    ctl.windupT -= dt;
    if (ctl.windupT <= 0) {
      ctl.windupT = 0;
      SPECIALS[kit.id].hit();
      rigSwing();
      addShake(0.2);
    }
  }
  if (ctl.lungeT > 0) {
    const sp = SPECIALS[kit.id];
    const step = Math.min(dt, ctl.lungeT);
    ctl.lungeT -= dt;
    player.pos.addInPlace(ctl.lungeDir.scale(((sp.lunge?.dist ?? 0) / ctl.lungeTotal) * step));
    resolveWalls(player.pos, player.radius, player.height, world.boxes);
    // Stop as soon as someone is in reach, so the rush never runs past the target.
    if (meleeTargets(1.1, 80).length > 0) ctl.lungeT = 0;
    if (ctl.lungeT <= 0) {
      ctl.lungeT = 0;
      sp.hit();
      addShake(0.1);
    }
  }
  ctl.fireCd -= dt;
  if (!stunned && input.firing && ctl.fireCd <= 0) {
    stopBandage(true);
    ctl.fireCd = kit.attack(ctl.weapon) / gearAtkMult();
    if (ctl.weapon === 'ranged') gameHud.kickCrosshair();
    else rigSwing();
  }
  // Health comes back out of combat.
  kit.update(dt, ctl.moving, ctl.grounded);
  updateInventory(dt);
  // Weapons in hand: ready pose while aiming or attacking, class state on the models.
  updateRig({ dt, pitch: input.pitch, ready: isAiming() || (input.firing && !stunned), hand: ctl.weapon, gauge: kit.gauge?.() ?? {} });
  // Player animation: every class has its own dash.
  if (pBody.play) {
    // Side dash: the cartwheel (timed to its 0.40 s); the Mage keeps its blink pose.
    if (ctl.dashT > 0) {
      if (dash.blink) pBody.play(dash.anim, 1.5);
      else pBody.play('cartwheel', 1, ctl.dashStarted);
      ctl.dashStarted = false;
    }
    else if (!ctl.grounded) pBody.play('jump');
    else if (move.lengthSquared() > 0 && !stunned) {
      if (isAiming() || player.slowT > 0 || INV.bandT > 0) pBody.play('walk', 1.2);
      else if (ctl.sprinting) pBody.play('sprint', kit.speedMult());
      else pBody.play('run', kit.speedMult());
    } else pBody.play('idle');
  }
}

/** Dash trail in the class color; the Mage blinks (the body vanishes and pops back). */
/** A fading after-image along the dash: a thin slab the size of the body, in the class colour. */
function dashGhost() {
  const m = MeshBuilder.CreateBox('ghost', { width: 0.55, height: 1.5, depth: 0.22 }, scene);
  m.rotation.y = player.yaw;
  spawnFx(m, player.pos.add(new Vector3(0, 0.85, 0)), kit.dash.color, 0.2, 0, 0.32);
}
function dashFx(begin: boolean) {
  const d = kit.dash;
  if (begin) {
    // Dust kicked up where the dash starts, behind the feet.
    for (let i = 0; i < 4; i++) {
      const puff = MeshBuilder.CreateSphere('dust', { diameter: 0.35, segments: 6 }, scene);
      const off = ctl.dashDir.scale(-0.4 - visualRandom() * 0.4).add(new Vector3((visualRandom() - 0.5) * 0.6, 0.15, (visualRandom() - 0.5) * 0.6));
      spawnFx(puff, player.pos.add(off), '#d8cbb0', 0.35, 2.2, 0.5);
    }
  }
  ringFx(player.pos, begin ? 0.9 : 0.7, d.color, 0.3);
  if (d.blink) {
    spawnFx(MeshBuilder.CreateSphere('blink', { diameter: 1.4, segments: 8 }, scene), chest(player), d.color, 0.3, 2.5, 0.5);
    blinkHidden = begin;
  } else if (begin) spawnFx(MeshBuilder.CreateSphere('dash', { diameter: 0.9, segments: 8 }, scene), chest(player), d.color, 0.25, 2, 0.35);
}
let blinkHidden = false;

function isAiming() {
  return running && input.aiming && ctl.weapon === 'ranged';
}

// ---- Camera ----------------------------------------------------------------------
let aimBlend = 0;
let viewOffset: Vector3 | null = null;
function updateCamera(dt: number) {
  aimBlend += ((isAiming() ? 1 : 0) - aimBlend) * Math.min(1, AIM.blendSpeed * dt);
  const lerp = (a: number, b: number) => a + (b - a) * aimBlend;
  camera.fov = lerp(CAMERA.fov, AIM.fov) + feel.fovPunch;
  // Recoil lifts the view a little and springs back.
  const cp = Math.cos(input.pitch + feel.recoilPitch);
  const dir = new Vector3(Math.sin(input.yaw) * cp, Math.sin(input.pitch + feel.recoilPitch), Math.cos(input.yaw) * cp);
  const head = player.pos.add(new Vector3(0, CAMERA.height, 0));
  const pivot = head.add(rightFromYaw(input.yaw).scale(lerp(CAMERA.shoulder, AIM.shoulder)));
  const maxDist = lerp(CAMERA.distance, AIM.distance);
  let dist = maxDist;
  for (let d = 0.5; d <= maxDist; d += 0.25) {
    if (pointHitsObstacle(pivot.subtract(dir.scale(d)), world.boxes)) {
      dist = Math.max(0.6, d - 0.3);
      break;
    }
  }
  const pos = pivot.subtract(dir.scale(dist));
  pos.y = Math.max(0.4, pos.y);
  pos.addInPlace(shakeOffset());
  camera.position.copyFrom(pos);
  if (viewOffset) {
    // Test hook: look at the player from a fixed offset.
    camera.position.copyFrom(player.pos.add(viewOffset));
    camera.setTarget(player.pos.add(new Vector3(0, 1.1, 0)));
  }
  // The weapon kicks back toward the player after each shot.
  if (weaponNodes) weaponNodes.ranged.position.z = -feel.gunKick;
  if (!viewOffset) camera.setTarget(pos.add(dir));
  // Fade the character while aiming, when the camera is close, and while invisible.
  const vis = playerVisibility();
  let fade = aimBlend > 0.5 || dist < 1.6 ? 0.3 : 1;
  if (vis === 0) fade = Math.min(fade, 0.2);
  else if (vis < 1 || playerFaded()) fade = Math.min(fade, 0.55);
  if (blinkHidden) fade = 0;
  poseBody(dt);
  for (const m of pBody.meshes) m.visibility = fade;
  if (weaponNodes) for (const n of Object.values(weaponNodes)) for (const m of n.getChildMeshes()) m.visibility = fade;
}

/** Cartwheel body turn in degrees at a time in ms, eased between the keys. */
function cartwheelAngle(ms: number): number {
  const keys = S4.cartwheelKeys;
  for (let i = 1; i < keys.length; i++) {
    const [t1, a1] = keys[i];
    if (ms <= t1) {
      const [t0, a0] = keys[i - 1];
      const u = (ms - t0) / (t1 - t0);
      return a0 + (a1 - a0) * (u * u * (3 - 2 * u));
    }
  }
  return keys[keys.length - 1][1];
}

/** Flips, wall-run lean, sprint lean and slam dive on top of the body animation. */
function poseBody(dt: number) {
  ctl.flipT = Math.max(0, ctl.flipT - dt);
  let rx = 0;
  let rz = 0;
  let up = 0;
  let fw = 0;
  let cartwheel = false;
  let sd = 0;
  if (ctl.flipT > 0) {
    const k = 1 - ctl.flipT / S4.flipTime;
    // Ease out so the flip snaps and settles.
    const a = ctl.flipDir * (1 - (1 - k) * (1 - k)) * Math.PI * 2;
    const h = 0.9;
    rx = a;
    up = h * (1 - Math.cos(a));
    fw = -h * Math.sin(a);
  } else if (ctl.wallRunT > 0) {
    const side = Vector3.Dot(ctl.wallN, rightFromYaw(player.yaw));
    rz = side > 0 ? -0.42 : 0.42;
  } else if (ctl.slamming) rx = 0.55;
  // Sprint: body 15-20 degrees forward (from the recordings).
  else if (ctl.sprinting) rx = 0.3;
  else if (ctl.airSprint) rx = 0.32;
  else if (ctl.lungeT > 0) rx = 0.45;
  else if (ctl.windupT > 0) {
    rx = -0.12;
    up = -0.15;
  }
  else if (ctl.dashT > 0) {
    // Lean into the dash; a side dash tips the body sideways, the slide sinks it low.
    const side = Vector3.Dot(ctl.dashDir, rightFromYaw(player.yaw));
    const ahead = Vector3.Dot(ctl.dashDir, forwardFromYaw(player.yaw));
    const k = 1 - ctl.dashT / ctl.dashTotal;
    if (Math.abs(side) > 0.7 && !kit.dash.blink) {
      // Side dash: a no-hands cartwheel (aerial). One full turn during the burst, a low landing in the slide.
      cartwheel = true;
      const ms = k * S4.cartwheelTime * 1000;
      const deg = cartwheelAngle(ms);
      rz = (-Math.sign(side) * deg * Math.PI) / 180;
      rx = 0.08;
      // Turn around the hips, not the feet; the hips rise a little, most at the hang (~150 ms).
      const h = 0.9;
      const air = Math.max(0, Math.min(1, ms / 365));
      up = h * (1 - Math.cos(rz)) + 0.35 * Math.sin(air * Math.PI);
      sd = h * Math.sin(rz);
    } else {
      rx = 0.3 * ahead + 0.12;
      rz = -0.55 * side;
      up = k > 0.6 ? -0.18 * Math.sin(((k - 0.6) / 0.4) * Math.PI) : 0;
    }
  } else if (ctl.winded > 0) rx = 0.2;
  const r = pBody.root;
  r.rotation.x += (rx - r.rotation.x) * (ctl.flipT > 0 ? 1 : Math.min(1, dt * 14));
  if (cartwheel) r.rotation.z = rz;
  else {
    // Unwind any leftover turn from a cartwheel the short way.
    r.rotation.z = Math.atan2(Math.sin(r.rotation.z), Math.cos(r.rotation.z));
    r.rotation.z += (rz - r.rotation.z) * Math.min(1, dt * 12);
  }
  if (up || fw || sd) r.position.copyFrom(player.pos.add(forwardFromYaw(player.yaw).scale(fw)).add(rightFromYaw(player.yaw).scale(sd)).addInPlaceFromFloats(0, up, 0));
  else r.position.copyFrom(player.pos);
}

// ---- Bag (I) ---------------------------------------------------------------------------
invUi.open = () => {
  $('inventory').classList.remove('hidden');
  renderInventory();
  if (document.pointerLockElement) document.exitPointerLock();
};
invUi.close = () => {
  if (!invUi.isOpen()) return;
  $('inventory').classList.add('hidden');
  input.lock();
};
// ---- Vendor machine (V) ---------------------------------------------------------------------
shopUi.ctx = () => ({ cls: kit.id as ClassId, seconds: G.time });
shopUi.message = (text) => toast(text);
shopUi.open = (m) => {
  $('shop').classList.remove('hidden');
  renderShop(m);
  if (document.pointerLockElement) document.exitPointerLock();
};
shopUi.close = () => {
  if (!shopUi.isOpen()) return;
  $('shop').classList.add('hidden');
  input.lock();
};
$('shop-close').addEventListener('click', () => shopUi.close());
window.addEventListener('keydown', (e) => {
  if (!shopUi.isOpen()) return;
  if (e.code === 'KeyV' || e.code === 'Escape' || e.code === 'Tab') shopUi.close();
  input.consume(e.code);
});
window.addEventListener('keydown', (e) => {
  if (!invUi.isOpen()) return;
  if (e.code === 'KeyI' || e.code === 'Escape' || e.code === 'Tab') invUi.close();
  input.consume(e.code);
});

// ---- Language and settings ----------------------------------------------------------------
initUi();
applySkillLanguage(allKits());
onLang(() => {
  applySkillLanguage(allKits());
  gameHud.invalidateSlots();
  seedText();
  if (!started) buildStyles();
  if (!running && !dead) playBtn.textContent = !ready ? T('loading') : started ? T('resume') : T('play');
});
onSettings(() => {
  input.sensitivity = 0.0022 * SETTINGS.sens;
  CAMERA.fov = SETTINGS.fov;
});
loadArtIndex().then(() => {
  gameHud.invalidateSlots();
  paintArt();
});


// ---- Kills -------------------------------------------------------------------------
G.hooks.kill = (killer, victim) => {
  const xp = rewardKill(killer, victim);
  gearOnKill(killer, victim);
  const credit = killer?.kind === 'decoy' || killer?.kind === 'pet' ? killer.owner : killer;
  if (credit === player && victim !== player && victim.kind !== 'decoy' && victim.kind !== 'pet') {
    gameHud.markKill();

  }
  if (victim.kind === 'bot') botDied(victim);
  if (victim === player) return die(killer);
  if (victim.kind === 'decoy' || victim.kind === 'pet') return;
  const kName = killer ? (killer === player ? T('you') : killer.name) : T('poison');
  if (victim.kind !== 'mob' || killer === player) feed(`${kName} ▸ ${victim.name}${killer === player && xp ? `  +${xp} XP` : ''}`);
  if (victim.kind === 'boss') toast(killer === player ? T('bossDown') : T('bossDownBy', { n: kName }), 2.5);
};

// ---- Match ---------------------------------------------------------------------------
let running = false;
let started = false;
let dead = false;
let styleIndex = 0;

gameHud = createGameHud({ engine, scene, camera, canvas, ctl, running: () => running, aimBlend: () => aimBlend, aimDirection, spMax: breathMax, dashCost: S4.dashCost });



function levelLog() {
  const lines = prog.levelTimes.map((l) => `${T('level')} ${l.level}: ${fmtTime(l.t)}`);
  return lines.length ? `${T('levelTimes')}\n${lines.join('\n')}` : '';
}

function die(killer: Unit | null) {
  dead = true;
  running = false;
  if (document.pointerLockElement) document.exitPointerLock();
  overlayText.textContent = `${T('died')}${killer && killer !== player ? ` (${killer.name})` : ''}. ${T('diedLine', { t: fmtTime(G.time), l: player.level, k: PS.kills })}`;
  playBtn.textContent = T('again');
  overlay.classList.add('paused');
  $('summary').textContent = levelLog();
  overlay.classList.remove('hidden');
}

function buildStyles() {
  const box = $('styles');
  box.innerHTML = '';
  // Class first, then the playstyle (each playstyle starts with one skill).
  const classes = document.createElement('div');
  classes.className = 'class-row';
  for (const k of allKits()) {
    const b = document.createElement('button');
    b.className = `style class${k.id === kit.id ? ' on' : ''}`;
    b.innerHTML = `<b>${k.name}</b><span>${blurb(k)}</span>`;
    b.addEventListener('click', () => {
      if (k.id === kit.id) return;
      setKit(k.id);
      styleIndex = 0;
      if (ready) resetMatch();
      buildStyles();
    });
    classes.appendChild(b);
  }
  box.appendChild(classes);
  // Species: only the look of the weapons (and later the body), never stats.
  const species = document.createElement('div');
  species.className = 'style-row species-row';
  for (const id of SPECIES_IDS) {
    const sp = SPECIES[id];
    const b = document.createElement('button');
    b.className = `style species${getSpecies().id === id ? ' on' : ''}`;
    b.innerHTML = `<b>${sp.name[getLang()]}</b><span>${sp.blurb[getLang()]}</span>`;
    b.addEventListener('click', () => {
      setSpecies(id as SpeciesId);
      if (weaponNodes) buildWeapons();
      buildStyles();
    });
    species.appendChild(b);
  }
  box.appendChild(species);
  const styles = document.createElement('div');
  styles.className = 'style-row';
  kit.playstyles.forEach((s, i) => {
    const b = document.createElement('button');
    b.className = `style${i === styleIndex ? ' on' : ''}`;
    b.innerHTML = `<b>${s.name}</b><span>${T('start')}: ${kit.skills[s.skill].name}</span>`;
    b.addEventListener('click', () => {
      styleIndex = i;
      buildStyles();
    });
    styles.appendChild(b);
  });
  box.appendChild(styles);
  const pass = document.createElement('div');
  pass.className = 'passives';
  pass.textContent = `${T('passives')}: ${kit.passives.join(' · ')} · ${T('weapons')}: ${kit.weaponNames.ranged}, ${kit.weaponNames.melee}`;
  box.appendChild(pass);
}
buildStyles();

function resetMatch() {
  setRandomSeed(seed);
  for (const u of [...G.units]) if (u !== player) u.body.root.dispose(false, true);
  G.units = [player];
  for (const b of G.bullets) b.mesh.dispose();
  G.bullets = [];
  G.time = 0;
  resetKit();
  resetProgression();
  ctl.sp = breathMax();
  ctl.spIdle = 0;
  ctl.winded = 0;
  ctl.dashT = ctl.dashTotal = 0;
  ctl.dashCommit = false;
  ctl.dashLock = 0;
  ctl.sinceDash = 9;
  ctl.airDashes = 1;
  ctl.velH.setAll(0);
  ctl.grounded = true;
  MODS.damagePerLevel = kit.stats.damagePerLevel;
  Object.assign(PS, { kills: 0, currency: 0 });
  const spawn = world.spawn ?? new Vector3(0, 0, 0);
  player.pos.set(spawn.x, groundHeight(new Vector3(spawn.x, spawn.y + 0.3, spawn.z), player.radius, world.boxes), spawn.z);
  resolveWalls(player.pos, player.radius, player.height, world.boxes);
  player.velY = 0;
  player.level = 1;
  player.xp = 0;
  player.maxHp = kit.stats.maxHp;
  player.hp = player.maxHp;
  resetInventory();
  player.hp = player.maxHp;
  input.yaw = 0;
  input.pitch = -0.12;
  resetDirector(rand);
}

function start() {
  if (!ready) return;
  if (dead) {
    location.reload();
    return;
  }
  if (!started) {
    started = true;
    const style = kit.playstyles[styleIndex];
    buildWeapons();
    learn(style.skill);
    setWeapon(style.weapon);
    $('styles').classList.add('hidden');
    overlayText.textContent = '';
    toast(mapError ? T('mapFailed') : T('startedWith', { c: kit.name, s: style.name, k: kit.skills[style.skill].name }), mapError ? 4 : 2.5);
  }
  running = true;
  overlay.classList.add('hidden');
  overlay.classList.add('paused');
}

playBtn.addEventListener('click', () => {
  unlockAudio();
  start();
  input.lock();
});

const panelOpen = () => levelUpUi.isOpen() || invUi.isOpen() || shopUi.isOpen();
function pause() {
  running = false;
  overlayText.textContent = T('paused');
  playBtn.textContent = T('resume');
  overlay.classList.add('paused');
  $('summary').textContent = levelLog();
  overlay.classList.remove('hidden');
}
document.addEventListener('pointerlockchange', () => {
  if (!input.locked && running && !panelOpen() && !dead) pause();
});
// Closing a panel with Esc (or after a long Tab hold) is not a click, so the browser may refuse
// to lock the mouse again. Then show the pause screen instead of leaving the game without a mouse.
document.addEventListener('pointerlockerror', () => {
  if (running && !panelOpen() && !dead) pause();
});
// A click on the game also takes the mouse back.
canvas.addEventListener('click', () => {
  if (running && !input.locked && !panelOpen() && !dead) input.lock();
});

// Characters (Kenney survivors and zombies) load first; the match is set up once they are in.
let ready = false;
playBtn.disabled = true;
playBtn.textContent = T('loading');
loadCharacterKits(scene)
  .catch((e) => console.error('Character kit failed to load', e))
  .then(() => {
    usePlayerModel();
    resetMatch();
    ready = true;
    playBtn.disabled = false;
    playBtn.textContent = T('play');
  });
setWeapon('ranged');
updateCamera(1);

function simStep(dt: number) {
  G.time += dt;
  updatePlayer(dt);
  updateAI(dt, rand, (t) => toast(t, 3));
  for (const u of [...G.units]) if (u.alive) tickStatus(u, dt);
  updateBullets(dt);
  updateFx(dt);
  updateZones(dt);
  updateFeel(dt);
  gameHud.step(dt);
}

engine.runRenderLoop(() => {
  const dt = Math.min(engine.getDeltaTime() / 1000, 0.05);
  if (running && !levelUpUi.isOpen() && !invUi.isOpen() && !shopUi.isOpen() && input.consume('Tab') && prog.pending > 0) levelUpUi.open();
  if (running && !levelUpUi.isOpen() && !invUi.isOpen() && !shopUi.isOpen() && input.consume('KeyI')) invUi.open();
  if (running && !levelUpUi.isOpen() && !invUi.isOpen() && !shopUi.isOpen() && input.consume('KeyV')) {
    const m = nearMachine(player.pos);
    if (m) shopUi.open(m);
  }
  const live = running && !levelUpUi.isOpen() && !invUi.isOpen() && !shopUi.isOpen();
  if (live) {
    if (input.consume('KeyN')) {
      location.search = '';
      return;
    }
    if (DEBUG) {
      if (input.consume('KeyL')) grantXp(player, xpNeeded(player.level) - player.xp);
      if (input.consume('KeyB')) spawnBoss(rand);
      if (input.consume('KeyK')) PS.currency += 100;
    }
    simStep(dt);
  }
  input.endFrame();
  updateCamera(dt);
  gameHud.update(live ? dt : 0);
  scene.render();
});

window.addEventListener('resize', () => engine.resize());

// Debug/test hook: lets automated tests drive the game without pointer lock.
(window as unknown as { __game: unknown }).__game = {
  input,
  scene: () => scene,
  start,
  houses: () => world.houses.map((h) => [h.x, h.z, h.scale]),
  teleport: (x: number, z: number) => {
    player.pos.set(x, 3, z);
    player.velY = 0;
  },
  levelUp: () => grantXp(player, xpNeeded(player.level) - player.xp),
  /** Test hook: the player cannot die (for movement tests and screenshots). */
  god: () => (player.maxHp = player.hp = 1e9),
  /** Test hook: draw one frame by hand (use after stopping the render loop to freeze a pose). */
  frame: (dt = 1 / 60) => {
    updateCamera(dt);
    scene.render();
  },
  spawnBoss: () => spawnBoss(rand),
  money: (n: number) => (PS.currency += n),
  vendors: () => MACHINES.map((m) => ({ id: m.id, x: m.pos.x, z: m.pos.z, yaw: m.yaw })),
  openShop: () => {
    const m = nearMachine(player.pos);
    if (m) shopUi.open(m);
    return !!m;
  },
  openCards: levelUpUi.open,
  openInventory: () => invUi.open(),
  choose: levelUpUi.choose,
  learn,
  resetSkills: () => resetKit(),
  setClass: (id: ClassId) => {
    setKit(id);
    styleIndex = 0;
    resetMatch();
    buildStyles();
    if (weaponNodes) buildWeapons();
  },
  shield: () => ({ ...P }),
  kitIds: () => Object.keys(kit.skills),
  /** Remove every other unit and put dummies in front of the player (for skill tests). */
  dummies: (dists: number[], hp = 400) => {
    for (const u of [...G.units]) if (u !== player) {
      u.alive = false;
      u.body.root.dispose(false, true);
    }
    G.units = [player];
    const f = forwardFromYaw(player.yaw);
    const r = rightFromYaw(player.yaw);
    return dists.map((d, i) => {
      // On the crosshair line (the camera sits over the right shoulder).
      const u = spawnDummy(player.pos.add(f.scale(d)).add(r.scale(CAMERA.shoulder * 0.9 + (i % 2) * 0.3)), hp);
      u.stunT = 1e6;
      return u.id;
    });
  },
  setWeapon,
  gear: (w: 'light' | 'medium' | 'heavy' | 'noir', r: 'common' | 'rare' | 'epic' | 'legendary' = 'epic') => debugKit(w, r),
  inv: () => ({ load: INV.load, bag: INV.bag, s: INV.s, set: INV.set, bandT: INV.bandT, bandCd: INV.bandCd }),
  move: () => ({ sp: ctl.sp, dashT: ctl.dashT, dashCommit: ctl.dashCommit, wallRunT: ctl.wallRunT, sprinting: ctl.sprinting, airSprint: ctl.airSprint, lungeT: ctl.lungeT, windupT: ctl.windupT, shieldT: ctl.shieldT, specialCd: ctl.specialCd, wallKicks: ctl.wallKicks, velY: player.velY, grounded: ctl.grounded }),
  dropItem: (id: string, rarity: 'common' | 'rare' | 'epic' | 'legendary' = 'rare') => spawnDrop({ id, rarity, xp: 0 }, player.pos.add(new Vector3(0, 0, 0.5))),
  orbs: (n: number) => (P.orbs = n),
  /** Hold the player in a pose (for screenshots): plays the animation, then freezes it. */
  pose: (anim: string, at = 0.15) => {
    if (!weaponNodes) buildWeapons();
    const a = (anim === 'classdash' ? kit.dash.anim : anim) as Parameters<NonNullable<typeof pBody.play>>[0];
    pBody.play?.(a, 1);
    setTimeout(() => pBody.play?.(a, 0.0001), at * 1000);
  },
  cast: (i: number) => castSlot(i),
  setStyle: (i: number) => (styleIndex = i),
  skills: () => skills.map((s) => ({ ...s })),
  offer: () => currentOffer(),
  timeWarp: (sec: number) => (G.time += sec),
  /** Run the game for `sec` seconds without drawing (for tests and balance checks). */
  sim: (sec: number, step = 1 / 30) => {
    for (let t = 0; t < sec && !dead; t += step) {
      simStep(step);
      input.endFrame();
    }
  },
  cam: () => camera.position.asArray(),
  /** Show long-lived samples of the effects in front of the player (for look screenshots). */
  fxDemo: () => {
    const f = new Vector3(Math.sin(player.yaw), 0, Math.cos(player.yaw));
    const r = new Vector3(f.z, 0, -f.x);
    const at = (fw: number, side: number, up: number) => player.pos.add(f.scale(fw)).add(r.scale(side)).add(new Vector3(0, up, 0));
    lineFx(at(1, 0.4, 1.3), at(14, -1.5, 1.6), '#ffc46a', 6);
    lineFx(at(1, 0.6, 1.2), at(12, 2.5, 1.0), '#9cff8a', 6);
    ringFx(at(8, -4, 0), 2.4, '#ff7a3b', 6);
    spawnFx(MeshBuilder.CreateSphere('boom', { diameter: 2.4, segments: 12 }, scene), at(11, 5, 1.4), '#ffb14a', 6, 0, 0.5);
    spawnFx(MeshBuilder.CreateSphere('puff', { diameter: 1.4, segments: 8 }, scene), at(7, -2.5, 1.6), '#b58cff', 6, 0, 0.45);
    for (let i = 0; i < 4; i++) {
      const p = splatPlane('demo-splat', 0.5 + i * 0.15);
      p.position.copyFrom(at(4 + i * 1.2, 1.4 + i * 0.6, 1.2 + (i % 2) * 0.5));
      p.material = watercolorFxMaterial(['#ffd27a', '#ff5a6e', '#ffd27a', '#9cff8a'][i], 1, 'splat') ?? glowMat('#ffd27a');
    }
  },
  logs: () => ({ xpLog, killLog }),
  viewFrom: (x: number | null, y = 0, z = 0) => (viewOffset = x === null ? null : new Vector3(x, y, z)),
  showColliders: (x: number, z: number, r: number) => {
    const m = glowMat('#00ffaa', 0.35);
    for (const b of world.boxes) {
      if (Math.abs(b.x - x) > r || Math.abs(b.z - z) > r || b.y1 - b.y0 < 0.05) continue;
      const box = MeshBuilder.CreateBox('col', { width: b.hw * 2, depth: b.hd * 2, height: b.y1 - b.y0 }, scene);
      box.position.set(b.x, (b.y0 + b.y1) / 2, b.z);
      box.material = m;
      box.isPickable = false;
    }
  },
  debugMeshes: (prefix: string) =>
    scene.meshes
      .filter((m) => m.name.startsWith(prefix))
      .slice(0, 6)
      .map((m) => {
        m.computeWorldMatrix(true);
        const bb = m.getBoundingInfo().boundingBox;
        return { name: m.name, enabled: m.isEnabled(), vis: m.isVisible, verts: m.getTotalVertices(), min: bb.minimumWorld.asArray().map((v) => +v.toFixed(2)), max: bb.maximumWorld.asArray().map((v) => +v.toFixed(2)), skel: !!m.skeleton, parent: m.parent?.name };
      }),
  freeze: (sec: number) => {
    for (const u of G.units) if (u !== player) u.stunT = sec;
  },
  setPlayerYaw: (yaw: number, pitch: number) => {
    input.yaw = yaw;
    input.pitch = pitch;
    updateCamera(1);
  },
  ghost: () => {
    MODS.incoming = () => 0;
    PS.invisT = 1e9;
  },
  state: () => ({
    hp: player.hp,
    pos: player.pos.asArray(),
    yaw: player.yaw,
    grounded: ctl.grounded,
    weapon: ctl.weapon,
    level: player.level,
    xp: player.xp,
    pending: prog.pending,
    currency: PS.currency,
    kills: PS.kills,
    time: G.time,
    invis: PS.invisT,
    fade: fadeState(),
    alive: player.alive,
    units: G.units.map((u) => ({ id: u.id, kind: u.kind, name: u.name, hp: Math.round(u.hp), level: u.level, pos: u.pos.asArray().map((v) => +v.toFixed(1)), stun: u.stunT, poison: u.poisonT })),
  }),
};
