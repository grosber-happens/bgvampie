import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Engine } from '@babylonjs/core/Engines/engine';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Ray } from '@babylonjs/core/Culling/ray';
import { Scene } from '@babylonjs/core/scene';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { UniversalCamera } from '@babylonjs/core/Cameras/universalCamera';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
// Side-effect imports: register shadow and picking support on the scene.
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent';
import '@babylonjs/core/Culling/ray';
import './style.css';
import { Input } from './input';
import { ARENA_RADIUS, buildWorld, pointHitsObstacle, resolveCollisions, type World } from './world';
import { createActorBody, disposeBody, flash, forwardFromYaw, rightFromYaw, type ActorBody } from './actors';

// ---- Tuning ---------------------------------------------------------------
const PLAYER = { maxHp: 100, speed: 8, sprint: 12.5, radius: 0.5, dashSpeed: 28, dashTime: 0.16, dashCd: 1.2 };
const PLAYER_GUN = { fireRate: 0.14, damage: 20, speed: 75, range: 120 };
const BOT = { count: 7, maxHp: 100, speed: 5, radius: 0.5, sight: 40, range: 14, damage: 7, bulletSpeed: 32, respawn: 4 };
const CAMERA = { distance: 5, shoulder: 1.05, height: 1.75 };

type Bullet = { mesh: Mesh; vel: Vector3; life: number; fromPlayer: boolean; damage: number };
type Bot = {
  id: number;
  body: ActorBody;
  pos: Vector3;
  hp: number;
  yaw: number;
  fireCd: number;
  strafe: number;
  strafeTimer: number;
  wander: Vector3;
  flashT: number;
};

const canvas = document.getElementById('game') as HTMLCanvasElement;
const overlay = document.getElementById('overlay')!;
const overlayText = document.getElementById('overlay-text')!;
const playBtn = document.getElementById('play') as HTMLButtonElement;
const hpFill = document.getElementById('hp-fill')!;
const hpText = document.getElementById('hp-text')!;
const killsEl = document.getElementById('kills')!;
const crosshair = document.getElementById('crosshair')!;

const engine = new Engine(canvas, true, { stencil: true });
const scene = new Scene(engine);
const world: World = buildWorld(scene);
const input = new Input(canvas);

const camera = new UniversalCamera('cam', new Vector3(0, 3, -6), scene);
camera.inputs.clear();
camera.fov = 0.95;
camera.minZ = 0.1;

const bulletMats = {
  player: emissive('#ffd27a'),
  bot: emissive('#b46cff'),
};
function emissive(hex: string) {
  const m = new StandardMaterial(`bullet-${hex}`, scene);
  m.emissiveColor = Color3.FromHexString(hex);
  m.disableLighting = true;
  return m;
}

// ---- State ----------------------------------------------------------------
const player = {
  body: createActorBody(scene, world, 'player', { body: '#7a1f2b', head: '#e9d6c0', weapon: '#ffd27a' }, false, { player: true }),
  pos: new Vector3(0, 0, -20),
  hp: PLAYER.maxHp,
  fireCd: 0,
  dashT: 0,
  dashCd: 0,
  dashDir: new Vector3(),
  flashT: 0,
};
for (const m of player.body.meshes) m.isPickable = false;

let bots: Bot[] = [];
let bullets: Bullet[] = [];
let kills = 0;
let nextBotId = 1;
let respawnQueue: number[] = [];
let running = false;
let dead = false;
let hitMarkerT = 0;

function randomSpawn(minDistFromPlayer: number): Vector3 {
  for (let i = 0; i < 50; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = Math.random() * (ARENA_RADIUS - 5);
    const p = new Vector3(Math.cos(a) * d, 0, Math.sin(a) * d);
    const before = p.clone();
    resolveCollisions(p, BOT.radius, world.obstacles);
    if (Vector3.Distance(p, before) > 0.01) continue; // spawned inside cover
    if (Vector3.Distance(p, player.pos) >= minDistFromPlayer) return p;
  }
  return new Vector3(ARENA_RADIUS - 8, 0, 0);
}

function spawnBot() {
  const id = nextBotId++;
  const body = createActorBody(scene, world, `bot${id}`, { body: '#4b3f6b', head: '#c9c2d8', weapon: '#b46cff' }, true, { botId: id });
  const pos = randomSpawn(25);
  bots.push({ id, body, pos, hp: BOT.maxHp, yaw: 0, fireCd: 1 + Math.random(), strafe: 1, strafeTimer: 0, wander: randomSpawn(0), flashT: 0 });
}

function resetMatch() {
  for (const b of bots) disposeBody(b.body);
  for (const b of bullets) b.mesh.dispose();
  bots = [];
  bullets = [];
  respawnQueue = [];
  kills = 0;
  player.pos.set(0, 0, -20);
  player.hp = PLAYER.maxHp;
  player.fireCd = 0;
  player.dashT = 0;
  player.dashCd = 0;
  input.yaw = 0;
  input.pitch = -0.12;
  for (let i = 0; i < BOT.count; i++) spawnBot();
  dead = false;
}

// ---- Helpers --------------------------------------------------------------
function aimDirection(): Vector3 {
  const cp = Math.cos(input.pitch);
  return new Vector3(Math.sin(input.yaw) * cp, Math.sin(input.pitch), Math.cos(input.yaw) * cp);
}

function hasLineOfSight(a: Vector3, b: Vector3): boolean {
  const d = b.subtract(a);
  const len = d.length();
  const steps = Math.ceil(len / 0.8);
  for (let i = 1; i < steps; i++) {
    if (pointHitsObstacle(a.add(d.scale(i / steps)), world.obstacles)) return false;
  }
  return true;
}

function fireBullet(from: Vector3, to: Vector3, speed: number, fromPlayer: boolean, damage: number, spread = 0) {
  const dir = to.subtract(from).normalize();
  if (spread) {
    dir.x += (Math.random() - 0.5) * spread;
    dir.y += (Math.random() - 0.5) * spread * 0.5;
    dir.z += (Math.random() - 0.5) * spread;
    dir.normalize();
  }
  const mesh = MeshBuilder.CreateSphere('bullet', { diameter: fromPlayer ? 0.16 : 0.26, segments: 6 }, scene);
  mesh.isPickable = false;
  mesh.material = fromPlayer ? bulletMats.player : bulletMats.bot;
  mesh.position.copyFrom(from);
  bullets.push({ mesh, vel: dir.scale(speed), life: (fromPlayer ? PLAYER_GUN.range : 60) / speed, fromPlayer, damage });
}

function muzzle(pos: Vector3, yaw: number): Vector3 {
  return pos.add(rightFromYaw(yaw).scale(0.42)).add(forwardFromYaw(yaw).scale(0.8)).addInPlaceFromFloats(0, 1.2, 0);
}

function damageBot(bot: Bot, dmg: number) {
  bot.hp -= dmg;
  bot.flashT = 1;
  hitMarkerT = 0.12;
  if (bot.hp <= 0) {
    disposeBody(bot.body);
    bots = bots.filter((b) => b !== bot);
    kills++;
    respawnQueue.push(BOT.respawn);
  }
}

function damagePlayer(dmg: number) {
  player.hp = Math.max(0, player.hp - dmg);
  player.flashT = 1;
  if (player.hp <= 0 && !dead) {
    dead = true;
    running = false;
    document.exitPointerLock();
    overlayText.textContent = `Öldün. Öldürme sayın: ${kills}`;
    playBtn.textContent = 'Tekrar oyna';
    overlay.classList.remove('hidden');
  }
}

// ---- Update ---------------------------------------------------------------
function updatePlayer(dt: number) {
  const fwd = forwardFromYaw(input.yaw);
  const right = rightFromYaw(input.yaw);
  const move = fwd.scale(input.axis('KeyS', 'KeyW')).add(right.scale(input.axis('KeyA', 'KeyD')));
  if (move.lengthSquared() > 0) move.normalize();

  player.dashCd -= dt;
  if (input.consumeDash() && player.dashCd <= 0) {
    player.dashDir = move.lengthSquared() > 0 ? move.clone() : fwd.clone();
    player.dashT = PLAYER.dashTime;
    player.dashCd = PLAYER.dashCd;
  }

  if (player.dashT > 0) {
    player.dashT -= dt;
    player.pos.addInPlace(player.dashDir.scale(PLAYER.dashSpeed * dt));
  } else {
    const speed = input.keys.has('ShiftLeft') ? PLAYER.sprint : PLAYER.speed;
    player.pos.addInPlace(move.scale(speed * dt));
  }
  resolveCollisions(player.pos, PLAYER.radius, world.obstacles);

  // Character always faces where the camera aims (shooter style).
  player.body.root.position.copyFrom(player.pos);
  player.body.root.rotation.y = input.yaw;

  player.fireCd -= dt;
  if (input.firing && player.fireCd <= 0) {
    player.fireCd = PLAYER_GUN.fireRate;
    // Aim ray goes from the camera through the crosshair; the bullet flies from the gun to that point.
    const dir = aimDirection();
    const ray = new Ray(camera.position.clone(), dir, PLAYER_GUN.range);
    const pick = scene.pickWithRay(ray, (m) => m.isPickable);
    const target = pick?.hit && pick.pickedPoint ? pick.pickedPoint : camera.position.add(dir.scale(PLAYER_GUN.range));
    fireBullet(muzzle(player.pos, input.yaw), target, PLAYER_GUN.speed, true, PLAYER_GUN.damage);
  }

  player.flashT = Math.max(0, player.flashT - dt * 6);
  flash(player.body, player.flashT);
}

function updateBots(dt: number) {
  const chest = player.pos.add(new Vector3(0, 1.2, 0));
  for (const bot of bots) {
    const toPlayer = player.pos.subtract(bot.pos);
    toPlayer.y = 0;
    const dist = toPlayer.length();
    const eye = bot.pos.add(new Vector3(0, 1.4, 0));
    const sees = dist < BOT.sight && hasLineOfSight(eye, chest);
    let move = Vector3.Zero();

    if (sees) {
      const dir = toPlayer.normalize();
      bot.yaw = Math.atan2(dir.x, dir.z);
      if (dist > BOT.range + 4) move.addInPlace(dir);
      else if (dist < BOT.range - 5) move.subtractInPlace(dir);
      bot.strafeTimer -= dt;
      if (bot.strafeTimer <= 0) {
        bot.strafe = Math.random() < 0.5 ? -1 : 1;
        bot.strafeTimer = 0.8 + Math.random() * 1.5;
      }
      move.addInPlace(rightFromYaw(bot.yaw).scale(bot.strafe * 0.8));

      bot.fireCd -= dt;
      if (bot.fireCd <= 0) {
        bot.fireCd = 0.9 + Math.random() * 0.9;
        fireBullet(muzzle(bot.pos, bot.yaw), chest, BOT.bulletSpeed, false, BOT.damage, 0.08);
      }
    } else {
      const toWander = bot.wander.subtract(bot.pos);
      toWander.y = 0;
      if (toWander.length() < 2) bot.wander = randomSpawn(0);
      else {
        move = toWander.normalize();
        bot.yaw = Math.atan2(move.x, move.z);
      }
      // A bot that just lost sight can still fire once it sees again.
      bot.fireCd = Math.max(bot.fireCd, 0.4);
    }

    if (move.lengthSquared() > 0) bot.pos.addInPlace(move.normalize().scale(BOT.speed * dt));
    resolveCollisions(bot.pos, BOT.radius, world.obstacles);
    bot.body.root.position.copyFrom(bot.pos);
    bot.body.root.rotation.y = bot.yaw;
    if (bot.body.hpBar) {
      const f = Math.max(0, bot.hp / BOT.maxHp);
      bot.body.hpBar.scaling.x = f;
    }
    bot.flashT = Math.max(0, bot.flashT - dt * 6);
    flash(bot.body, bot.flashT);
  }

  respawnQueue = respawnQueue.map((t) => t - dt);
  while (respawnQueue.length && respawnQueue[0] <= 0) {
    respawnQueue.shift();
    spawnBot();
  }
}

function updateBullets(dt: number) {
  const alive: Bullet[] = [];
  for (const b of bullets) {
    const step = b.vel.scale(dt);
    const substeps = Math.max(1, Math.ceil(step.length() / 0.4));
    const inc = step.scale(1 / substeps);
    let done = false;
    for (let i = 0; i < substeps && !done; i++) {
      b.mesh.position.addInPlace(inc);
      const p = b.mesh.position;
      if (pointHitsObstacle(p, world.obstacles)) {
        done = true;
        break;
      }
      if (b.fromPlayer) {
        for (const bot of bots) {
          if (p.y > 0 && p.y < 2 && Math.hypot(p.x - bot.pos.x, p.z - bot.pos.z) < 0.55) {
            damageBot(bot, b.damage);
            done = true;
            break;
          }
        }
      } else if (p.y > 0 && p.y < 2 && Math.hypot(p.x - player.pos.x, p.z - player.pos.z) < 0.55) {
        if (player.dashT <= 0) damagePlayer(b.damage); // dashing dodges bullets
        done = true;
      }
    }
    b.life -= dt;
    if (done || b.life <= 0) b.mesh.dispose();
    else alive.push(b);
  }
  bullets = alive;
}

function updateCamera() {
  const dir = aimDirection();
  const head = player.pos.add(new Vector3(0, CAMERA.height, 0));
  const shoulder = rightFromYaw(input.yaw).scale(CAMERA.shoulder);
  const pivot = head.add(shoulder);
  // Pull the camera in if cover is between it and the player.
  let dist = CAMERA.distance;
  for (let d = 0.5; d <= CAMERA.distance; d += 0.25) {
    if (pointHitsObstacle(pivot.subtract(dir.scale(d)), world.obstacles)) {
      dist = Math.max(0.6, d - 0.3);
      break;
    }
  }
  const pos = pivot.subtract(dir.scale(dist));
  pos.y = Math.max(0.4, pos.y);
  camera.position.copyFrom(pos);
  camera.setTarget(pos.add(dir));
}

function updateHud() {
  const f = player.hp / PLAYER.maxHp;
  hpFill.style.width = `${f * 100}%`;
  hpText.textContent = `${Math.ceil(player.hp)} / ${PLAYER.maxHp}`;
  killsEl.textContent = `Öldürme: ${kills}`;
  crosshair.classList.toggle('hit', hitMarkerT > 0);
}

// ---- Loop -----------------------------------------------------------------
resetMatch();
updateCamera();

engine.runRenderLoop(() => {
  const dt = Math.min(engine.getDeltaTime() / 1000, 0.05);
  if (running) {
    updatePlayer(dt);
    updateBots(dt);
    updateBullets(dt);
    hitMarkerT -= dt;
  }
  updateCamera();
  updateHud();
  scene.render();
});

window.addEventListener('resize', () => engine.resize());

playBtn.addEventListener('click', () => {
  if (dead) resetMatch();
  running = true;
  overlay.classList.add('hidden');
  input.lock();
});

// Pause when the pointer is released (Esc).
document.addEventListener('pointerlockchange', () => {
  if (!input.locked && running) {
    running = false;
    overlayText.textContent = 'Duraklatıldı.';
    playBtn.textContent = 'Devam et';
    overlay.classList.remove('hidden');
  }
});

// Debug/test hook: lets automated tests drive the game without pointer lock.
(window as unknown as { __game: unknown }).__game = {
  input,
  start: () => {
    if (dead) resetMatch();
    running = true;
    overlay.classList.add('hidden');
  },
  state: () => ({ hp: player.hp, kills, bots: bots.length, bullets: bullets.length, pos: player.pos.asArray(), botPos: bots.map((b) => b.pos.asArray()) }),
};
