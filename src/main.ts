import { Engine } from '@babylonjs/core/Engines/engine';
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector';
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
import { addShake, feel, initFeel, kick, muzzleFlash, shakeOffset, sfx, sparksAt, unlockAudio, updateFeel } from './feel';
import { createHippoBody, loadCharacterKits } from './characters';
import { placeHouses } from './houses';
import { placeProps } from './props';
import { clayifyScene, initLook, splatPlane, watercolorFxMaterial } from './look';
import { buildWorld, ceilingHeight, groundHeight, pointHitsObstacle, resolveWalls } from './world';
import { createActorBody, forwardFromYaw, rightFromYaw } from './actors';
import { MAX_LEVEL, TOKEN_PRICE } from './balance';
import { G, MODS, PS, chest, glowMat, inCombat, lineFx, makeUnit, ringFx, spawnFx, tickStatus, updateBullets, updateFx, type Unit } from './core';
import {
  P,
  allKits,
  blockedReason,
  castSlot,
  def,
  kit,
  learn,
  maxCharges,
  playerFaded,
  playerVisibility,
  resetKit,
  setHost,
  setKit,
  skills,
  targetUnderCrosshair,
  updateZones,
  type ClassId,
  type Weapon,
} from './kit';
import { fadeState } from './rogue';
import './mage';
import './fighter';
import './scout';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { boss, botDied, resetDirector, spawnBoss, spawnDummy, updateAI } from './ai';
import { INV, debugKit, spawnDrop, bandageCdShare, bandageShare, dashTouch, gearAfterHit, gearAirDashes, gearAirJumps, gearAtkMult, gearDashCost, gearIncoming, gearOutgoing, gearSlam, gearSpeedMult, gearWallRun, landSlam, onKill as gearOnKill, reelReady, resetInventory, slamReady, stopBandage, tryBandage, tryReel, updateInventory } from './inventory';
import { SLAM, WALL_RUN } from './gear';
import { castHooks } from './kit';
import { applySkillLanguage, blurb, hud, onLang, t as T } from './i18n';
import { SETTINGS, initUi, invUi, paintArt, onSettings, renderInventory } from './ui';
import { loadArtIndex, skillIcon } from './icons';
import { killLog, xpLog, cardText, currentOffer, grantXp, pickCard, prog, resetProgression, rewardKill, tier3Open, xpNeeded } from './progression';

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
 * Leg gear adds air jumps, wall running (medium) or a ground slam (heavy).
 */
const S4 = {
  spMax: 100,
  spRegen: 34,
  /** Breath starts coming back this long after the last dash or sprint. */
  spDelay: 0.55,
  dashCost: 26,
  /** Shortest gap between two chained dashes. */
  dashLock: 0.16,
  sprintMult: 1.55,
  sprintDrain: 15,
  /** Holding Shift this long while moving turns into a sprint. */
  sprintHold: 0.22,
  /** Two W taps within this gap start a sprint that lasts while W is held. */
  doubleTap: 0.3,
  dashJumpWindow: 0.22,
  dashJumpSpeed: 12,
  doubleJump: 8.6,
  wallKick: { up: 9.5, out: 8, max: 3 },
  flipTime: 0.42,
};
const CAMERA = { distance: 5, shoulder: 1.05, height: 1.75, fov: 0.95 };
// Right-click aim: closer over-the-shoulder view with zoom and slower movement.
const AIM = { distance: 2.8, shoulder: 1.15, fov: 0.55, moveMult: 0.55, blendSpeed: 12 };
const SKILL_KEYS = [
  { code: 'KeyQ', label: 'Q' },
  { code: 'KeyE', label: 'E' },
  { code: 'Digit1', label: '1' },
  { code: 'Digit2', label: '2' },
  { code: 'Digit3', label: '3' },
];

const params = new URLSearchParams(location.search);
const seed = Number(params.get('seed')) || Math.floor(Math.random() * 1e6) + 1;
const DEBUG = params.has('debug');

const $ = (id: string) => document.getElementById(id)!;
const canvas = $('game') as HTMLCanvasElement;
const overlay = $('overlay');
const overlayText = $('overlay-text');
const playBtn = $('play') as HTMLButtonElement;
const crosshair = $('crosshair');
const slotsEl = $('slots');
const cardsEl = $('cards');

const engine = new Engine(canvas, true, { stencil: true });
const scene = new Scene(engine);
const world = buildWorld(scene, seed, { houseModel: true });
const input = new Input(canvas);
placeHouses(scene, world)
  .then(clayifyScene)
  .catch((e) => console.error('House model failed to load', e));
placeProps(scene, world)
  .then(clayifyScene)
  .catch((e) => console.error('Street props failed to load', e));
const seedText = () => ($('seed').textContent = `${T('city')} #${seed} · ${T('newCity')}${DEBUG ? ' · L lv · B boss · K $' : ''}`);
seedText();

const camera = new UniversalCamera('cam', new Vector3(0, 3, -6), scene);
camera.inputs.clear();
camera.fov = CAMERA.fov;
camera.minZ = 0.1;

Object.assign(G, { scene, world, camera, input });
initLook(scene, camera, world.shadows);
clayifyScene();
initFeel(scene);

// A tiny seeded random for spawns so a seed replays the same opening.
let rs = seed;
const rand = () => {
  rs = (rs * 16807) % 2147483647;
  return (rs - 1) / 2147483646;
};

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
  sp: 100,
  spIdle: 0,
  airJumps: 1,
  airDashes: 1,
  wallKicks: 3,
  dashLock: 0,
  shiftHeld: 0,
  sprinting: false,
  /** Time since the last W press, and whether a W double tap is sprinting. */
  sinceW: 9,
  wSprint: false,
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
  dashCd: 0,
  dashDir: new Vector3(),
  moving: false,
  aimTime: 0,
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
  const move = fwd.scale(input.axis('KeyS', 'KeyW')).add(right.scale(input.axis('KeyA', 'KeyD')));
  if (move.lengthSquared() > 0) move.normalize();
  ctl.moving = move.lengthSquared() > 0 || ctl.dashT > 0;
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
  // Shift: a tap dashes (chain them while breath lasts), holding it sprints.
  const shiftDown = input.keys.has('ShiftLeft') || input.keys.has('ShiftRight');
  ctl.dashLock -= dt;
  ctl.sinceDash += dt;
  ctl.shiftHeld = shiftDown ? ctl.shiftHeld + dt : 0;
  const cost = S4.dashCost * gearDashCost();
  const canDash = () => !stunned && ctl.dashLock <= 0 && ctl.sp >= cost && (ctl.grounded || ctl.airDashes > 0 || ctl.wallRunT > 0);
  const doDash = (dir: Vector3) => {
    ctl.dashDir = dir;
    ctl.dashT = dash.time;
    ctl.dashLock = S4.dashLock;
    ctl.sp -= cost;
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
  if (input.consume('ShiftLeft', 'ShiftRight') && canDash()) doDash(move.lengthSquared() > 0 ? move.clone() : fwd.clone());
  // W twice quickly: sprint for as long as W stays held.
  ctl.sinceW += dt;
  if (input.consume('KeyW')) {
    if (ctl.sinceW < S4.doubleTap) ctl.wSprint = true;
    ctl.sinceW = 0;
  }
  if (!input.keys.has('KeyW') || ctl.sp <= 0) ctl.wSprint = false;
  ctl.sprinting = !stunned && ((shiftDown && ctl.shiftHeld > S4.sprintHold) || ctl.wSprint) && move.lengthSquared() > 0 && ctl.grounded && ctl.sp > 0 && ctl.dashT <= 0 && !isAiming() && INV.bandT <= 0;
  if (ctl.sprinting) {
    ctl.sp = Math.max(0, ctl.sp - S4.sprintDrain * dt);
    ctl.spIdle = 0;
  } else if (ctl.dashT <= 0) {
    ctl.spIdle += dt;
    if (ctl.spIdle > S4.spDelay) ctl.sp = Math.min(S4.spMax, ctl.sp + S4.spRegen * dt);
  }

  // Space: with A or D held it is a side dash; otherwise ground jump, dash-jump, wall run jump-off,
  // wall kick (Space again next to a wall) or double jump.
  if (!stunned && input.consume('Space')) {
    const wn = ctl.grounded ? null : wallNormal();
    const side = input.axis('KeyA', 'KeyD');
    if (side !== 0 && !(wn && ctl.wallKicks > 0) && ctl.wallRunT <= 0) {
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
      ctl.airJumps = gearAirJumps();
      ctl.airDashes = gearAirDashes();
      ctl.wallKicks = S4.wallKick.max;
    } else if (wn && ctl.wallKicks > 0) {
      player.velY = S4.wallKick.up;
      ctl.velH = wn.scale(S4.wallKick.out).add(move.scale(2));
      ctl.wallKicks -= 1;
      ringFx(player.pos.add(wn.scale(-0.4)), 0.5, kit.dash.color, 0.25);
      flip(-1);
    } else if (ctl.airJumps > 0) {
      player.velY = S4.doubleJump;
      ctl.airJumps -= 1;
      ringFx(player.pos, 0.7, kit.dash.color, 0.3);
      flip(1);
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
    player.pos.addInPlace(ctl.dashDir.scale(dash.speed * dt));
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
    const run = ctl.sprinting ? S4.sprintMult : 1;
    const speed = stunned || ctl.slamming ? 0 : MOVE.speed * kit.speedMult() * gearSpeedMult() * run * slow * (ctl.grounded ? 1 : MOVE.airControl) * (isAiming() ? AIM.moveMult : 1);
    player.pos.addInPlace(move.scale(speed * dt)).addInPlace(ctl.velH.scale(dt));
    ctl.velH.scaleInPlace(Math.max(0, 1 - (ctl.grounded ? 10 : 1.2) * dt));
    player.velY -= MOVE.gravity * dt;
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
    ctl.airJumps = gearAirJumps();
    ctl.airDashes = gearAirDashes();
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
  ctl.fireCd -= dt;
  if (!stunned && input.firing && ctl.fireCd <= 0) {
    stopBandage(true);
    ctl.fireCd = kit.attack(ctl.weapon) / gearAtkMult();
    if (ctl.weapon === 'ranged') crosshairKick = 1;
  }
  // Health comes back out of combat.
  if (G.time - player.lastCombat > kit.stats.regenDelay && !(player.ai?.noHealT > G.time)) player.hp = Math.min(player.maxHp, player.hp + kit.stats.regenPerSec * dt);
  kit.update(dt, ctl.moving, ctl.grounded);
  updateInventory(dt);
  // Player animation: every class has its own dash.
  if (pBody.play) {
    if (ctl.dashT > 0) pBody.play(dash.anim, 1.5);
    else if (!ctl.grounded) pBody.play('jump');
    else if (move.lengthSquared() > 0 && !stunned) {
      if (isAiming() || player.slowT > 0 || INV.bandT > 0) pBody.play('walk', 1.2);
      else pBody.play('run', kit.speedMult() * (ctl.sprinting ? 1.45 : 1));
    } else pBody.play('idle');
  }
}

/** Dash trail in the class color; the Mage blinks (the body vanishes and pops back). */
function dashFx(begin: boolean) {
  const d = kit.dash;
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

/** Flips, wall-run lean, sprint lean and slam dive on top of the body animation. */
function poseBody(dt: number) {
  ctl.flipT = Math.max(0, ctl.flipT - dt);
  let rx = 0;
  let rz = 0;
  let up = 0;
  let fw = 0;
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
  else if (ctl.sprinting) rx = 0.14;
  else if (ctl.dashT > 0) rx = 0.22;
  const r = pBody.root;
  r.rotation.x += (rx - r.rotation.x) * (ctl.flipT > 0 ? 1 : Math.min(1, dt * 14));
  r.rotation.z += (rz - r.rotation.z) * Math.min(1, dt * 12);
  if (up || fw) r.position.copyFrom(player.pos.add(forwardFromYaw(player.yaw).scale(fw)).addInPlaceFromFloats(0, up, 0));
  else r.position.copyFrom(player.pos);
}

// ---- HUD ---------------------------------------------------------------------------
let hitMarkerT = 0;
let toastT = 0;
let crosshairKick = 0;
let killMarkerT = 0;
G.hooks.hitMarker = (crit) => {
  hitMarkerT = 0.12;
  sfx.hit(crit);
};
G.hooks.impact = (p, color) => {
  sparksAt(scene, p, color, 5, 5);
  if (Vector3.Distance(p, player.pos) < 25) sfx.impact();
};
G.hooks.shot = (from) => {
  const d = Vector3.Distance(from, player.pos);
  if (d < 60) sfx.farShot(d);
};
G.hooks.playerHurt = (dmg) => {
  feel.hurt = Math.min(1, feel.hurt + dmg / 40);
  addShake(Math.min(0.5, dmg / 60));
  sfx.hurt();
};

function toast(text: string, time = 1.6) {
  $('toast').textContent = text;
  $('toast').style.opacity = '1';
  toastT = time;
}

function feed(text: string) {
  const el = document.createElement('div');
  el.textContent = text;
  $('feed').prepend(el);
  setTimeout(() => el.remove(), 6000);
  while ($('feed').children.length > 6) $('feed').lastElementChild?.remove();
}

// Floating damage numbers.
type Num = { el: HTMLDivElement; pos: Vector3; t: number };
let nums: Num[] = [];
G.hooks.number = (pos, amount, style) => {
  if (!SETTINGS.numbers) return;
  if (style === 'hit' && amount < 0.5) return;
  const el = document.createElement('div');
  el.className = `num ${style}`;
  el.textContent = style === 'block' ? (T('level') === 'Sv' ? 'BLOK' : 'BLOCK') : style === 'crit' ? `${Math.round(amount)}!` : `${Math.round(amount)}`;
  $('numbers').appendChild(el);
  nums.push({ el, pos: pos.add(new Vector3((Math.random() - 0.5) * 0.4, 0.3, 0)), t: 0.9 });
};

function updateNumbers(dt: number) {
  const w = engine.getRenderWidth();
  const h = engine.getRenderHeight();
  const scale = canvas.clientWidth / w;
  const vp = camera.viewport.toGlobal(w, h);
  const tm = scene.getTransformMatrix();
  const aim = aimDirection();
  nums = nums.filter((n) => {
    n.t -= dt;
    n.pos.y += dt * 1.2;
    const p = Vector3.Project(n.pos, Matrix.Identity(), tm, vp);
    const behind = Vector3.Dot(n.pos.subtract(camera.position), aim) < 0;
    n.el.style.left = `${p.x * scale}px`;
    n.el.style.top = `${p.y * scale}px`;
    n.el.style.opacity = behind ? '0' : `${Math.min(1, n.t * 2)}`;
    if (n.t <= 0) n.el.remove();
    return n.t > 0;
  });
}

let slotKey = '';
function renderSlots() {
  const key = skills.map((s) => `${s.id}${s.tier}`).join(',');
  if (key === slotKey && slotsEl.children.length) return;
  slotKey = key;
  slotsEl.innerHTML = '';
  SKILL_KEYS.forEach((k, i) => {
    const s = skills[i];
    const el = document.createElement('div');
    el.className = `slot${s ? '' : ' empty'}`;
    el.innerHTML = s
      ? `<div class="icon">${skillIcon(s.id, def(s.id).name, kit.id)}</div><div class="cd"></div><span class="charges"></span><span class="cdtext"></span><span class="key">${k.label}</span><span class="name">${def(s.id).name}</span><span class="pips">${[1, 2, 3].map((t) => `<i class="${t <= s.tier ? 'on' : ''}"></i>`).join('')}</span>`
      : `<span class="key">${k.label}</span><span class="name">${T('empty')}</span>`;
    slotsEl.appendChild(el);
  });
}

function updateSlots() {
  renderSlots();
  skills.forEach((s, i) => {
    const el = slotsEl.children[i] as HTMLElement;
    const max = maxCharges(s);
    const frac = s.charges >= max ? 0 : Math.max(0, s.cd / def(s.id).cooldown(s.tier));
    (el.querySelector('.cd') as HTMLElement).style.height = s.charges > 0 ? '0' : `${frac * 100}%`;
    (el.querySelector('.cdtext') as HTMLElement).textContent = s.charges < max && s.cd > 0 ? `${Math.ceil(s.cd)}` : '';
    (el.querySelector('.charges') as HTMLElement).textContent = max > 1 ? `${s.charges}` : '';
    // Kopya stays lit during its cooldown when a swap is possible.
    const swapReady = s.id === 'decoy' && G.units.some((u) => u.kind === 'decoy');
    el.classList.toggle('blocked', !!blockedReason(s) || (s.charges <= 0 && !swapReady));
  });
}

function fmtTime(t: number) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function updateHud(dt: number) {
  $('hp-fill').style.width = `${(Math.max(0, player.hp) / player.maxHp) * 100}%`;
  $('hp-text').textContent = `${Math.ceil(Math.max(0, player.hp))} / ${player.maxHp}`;
  $('weapon').textContent = `${hud(kit.weaponText(ctl.weapon))} (F)`;
  $('sp-fill').style.width = `${(ctl.sp / S4.spMax) * 100}%`;
  $('sp-fill').parentElement!.classList.toggle('low', ctl.sp < S4.dashCost * gearDashCost());
  const band = bandageShare();
  ($('band-ring').firstElementChild as SVGCircleElement).style.strokeDasharray = `${band * 119.4} 200`;
  const bcd = bandageCdShare();
  $('band').classList.toggle('cool', bcd > 0);
  $('band-cd').textContent = bcd > 0 ? `${Math.ceil(INV.bandCd)}` : '';
  $('reel').classList.toggle('hidden', INV.set < 5);
  $('reel').classList.toggle('ready', reelReady());
  $('reel-cd').textContent = INV.reelCd > 0 ? `${Math.ceil(INV.reelCd)}` : '';
  $('level').textContent = `${T('level')} ${player.level}${player.level >= MAX_LEVEL ? ` (${T('max')})` : ''}`;
  $('money').textContent = `${T('money')} ${PS.currency}`;
  $('kills').textContent = `${PS.kills} ${T('kills')}`;
  const need = xpNeeded(player.level);
  $('xp-fill').style.width = need ? `${(player.xp / need) * 100}%` : '100%';
  $('xp-text').textContent = need ? `${Math.floor(player.xp)} / ${need} XP` : T('maxLevel');
  $('timer').textContent = fmtTime(G.time);
  $('pick-hint').classList.toggle('hidden', prog.pending <= 0);
  $('pick-hint').innerHTML = `${T('levelUp')} <b>Tab</b> ${prog.pending > 1 ? `${prog.pending} ${T('cards')}` : T('card')} ${T('pickCards')}`;
  crosshair.classList.toggle('hit', hitMarkerT > 0);
  crosshair.classList.toggle('kill', killMarkerT > 0);
  crosshairKick = Math.max(0, crosshairKick - dt * 6);
  killMarkerT -= dt;
  crosshair.style.transform = `scale(${1 + crosshairKick * 0.5})`;
  $('hurt').style.opacity = `${feel.hurt}`;
  crosshair.classList.toggle('aim', aimBlend > 0.5);

  const buffs: string[] = kit.buffs();
  if (P.shield > 0) buffs.push(`${T('shield')} ${Math.ceil(P.shield)}`);
  if (player.stunT > 0) buffs.push(T('stunned'));
  if (inCombat(player)) buffs.push(T('inCombat'));
  if (INV.bandT > 0) buffs.push(T('bandaging'));
  $('buffs').textContent = hud(buffs.join(' · '));

  if (boss?.alive) {
    $('boss').classList.remove('hidden');
    $('boss-fill').style.width = `${(boss.hp / boss.maxHp) * 100}%`;
  } else $('boss').classList.add('hidden');

  const t = targetUnderCrosshair(70, 4, (u) => u !== player);
  $('target').textContent = t ? (t.kind === 'decoy' ? `${T('yourCopy')} (${t.name})` : t.kind === 'pet' ? t.name : t.kind === 'mob' || t.kind === 'boss' ? t.name : `${t.name} · ${T('level')} ${t.level}`) : '';

  toastT -= dt;
  if (toastT <= 0) $('toast').style.opacity = '0';
  updateSlots();
  updateNumbers(dt);
}

// ---- Cards -------------------------------------------------------------------------
let cardsOpen = false;

function openCards() {
  const offer = currentOffer();
  if (!offer) return;
  cardsOpen = true;
  cardsEl.classList.remove('hidden');
  if (document.pointerLockElement) document.exitPointerLock();
  const row = $('card-row');
  row.innerHTML = '';
  offer.forEach((c, i) => {
    const txt = cardText(c);
    const el = document.createElement('div');
    el.className = `card${c.locked ? ' locked' : ''}`;
    el.innerHTML = `
      <div class="seal-wrap">${skillIcon(c.id, txt.name, kit.id)}</div>
      <div class="tag ${c.isNew ? 'new' : ''}">${c.isNew ? T('newSkill') : `${T('tier')} ${c.tier}`}</div>
      <h3>${txt.name}</h3>
      ${c.isNew ? `<div class="desc">${txt.desc}</div>` : ''}
      <div class="tier">${T('tier')} ${c.tier}: ${txt.tier}</div>
      ${c.cost ? `<div class="cost">${T('token', { c: c.cost })}${c.locked ? ` (${T('youHave', { c: PS.currency })})` : ''}</div>` : ''}
      <div class="key">${c.locked ? c.locked : T('pickKey', { n: i + 1 })}</div>`;
    el.addEventListener('click', () => choose(i));
    row.appendChild(el);
  });
  if (!offer.length) row.innerHTML = `<p>${T('allMax')}</p>`;
  $('tier-rule').textContent = tier3Open()
    ? T('tier3Open', { c: TOKEN_PRICE })
    : T('tier3Rule', { n: skills.filter((s) => s.tier >= 2).length });
}

function closeCards() {
  if (!cardsOpen) return;
  cardsOpen = false;
  cardsEl.classList.add('hidden');
  input.lock();
}

function choose(i: number) {
  if (!pickCard(i)) return;
  if (prog.pending > 0) openCards();
  else closeCards();
}

$('card-close').addEventListener('click', closeCards);

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
  slotKey = '';
  seedText();
  if (!started) buildStyles();
  if (!running && !dead) playBtn.textContent = !ready ? T('loading') : started ? T('resume') : T('play');
});
onSettings(() => {
  input.sensitivity = 0.0022 * SETTINGS.sens;
  CAMERA.fov = SETTINGS.fov;
});
loadArtIndex().then(() => {
  slotKey = '';
  paintArt();
});
window.addEventListener('keydown', (e) => {
  if (!cardsOpen) return;
  if (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit3') choose(Number(e.code.slice(5)) - 1);
  else if (e.code === 'Tab') closeCards();
  input.consume(e.code);
});

// ---- Kills -------------------------------------------------------------------------
G.hooks.kill = (killer, victim) => {
  const xp = rewardKill(killer, victim);
  gearOnKill(killer, victim);
  const credit = killer?.kind === 'decoy' || killer?.kind === 'pet' ? killer.owner : killer;
  if (credit === player && victim !== player && victim.kind !== 'decoy' && victim.kind !== 'pet') {
    killMarkerT = 0.35;
    sfx.kill();
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
  for (const u of [...G.units]) if (u !== player) u.body.root.dispose(false, true);
  G.units = [player];
  for (const b of G.bullets) b.mesh.dispose();
  G.bullets = [];
  G.time = 0;
  resetKit();
  resetProgression();
  ctl.sp = S4.spMax;
  MODS.damagePerLevel = kit.stats.damagePerLevel;
  Object.assign(PS, { kills: 0, currency: 0 });
  player.pos.set(0, groundHeight(new Vector3(0, 0.3, 0), player.radius, world.boxes), 0);
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
    toast(T('startedWith', { c: kit.name, s: style.name, k: kit.skills[style.skill].name }), 2.5);
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

document.addEventListener('pointerlockchange', () => {
  if (!input.locked && running && !cardsOpen && !invUi.isOpen() && !dead) {
    running = false;
    overlayText.textContent = T('paused');
    playBtn.textContent = T('resume');
    overlay.classList.add('paused');
    $('summary').textContent = levelLog();
    overlay.classList.remove('hidden');
  }
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
  hitMarkerT -= dt;
}

engine.runRenderLoop(() => {
  const dt = Math.min(engine.getDeltaTime() / 1000, 0.05);
  if (running && !cardsOpen && !invUi.isOpen() && input.consume('Tab') && prog.pending > 0) openCards();
  if (running && !cardsOpen && !invUi.isOpen() && input.consume('KeyI')) invUi.open();
  const live = running && !cardsOpen && !invUi.isOpen();
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
  updateHud(live ? dt : 0);
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
  spawnBoss: () => spawnBoss(rand),
  money: (n: number) => (PS.currency += n),
  openCards,
  choose,
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
  move: () => ({ sp: ctl.sp, dashT: ctl.dashT, airJumps: ctl.airJumps, wallRunT: ctl.wallRunT, sprinting: ctl.sprinting, grounded: ctl.grounded }),
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
