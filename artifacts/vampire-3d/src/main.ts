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
import { buildWorld, ceilingHeight, findOpenSpot, groundHeight, pointHitsObstacle, resolveWalls, type World } from './world';
import { createActorBody, disposeBody, flash, forwardFromYaw, rightFromYaw, type ActorBody } from './actors';

// ---- Tuning ---------------------------------------------------------------
const PLAYER = {
  maxHp: 100,
  speed: 8.5,
  airControl: 0.85,
  radius: 0.45,
  height: 1.85,
  jumpSpeed: 9,
  gravity: 26,
  coyoteTime: 0.1,
  dashSpeed: 26,
  dashTime: 0.18,
  dashCd: 1.0,
};
const RANGED = { fireRate: 0.14, damage: 20, speed: 80, range: 120 };
const MELEE = { rate: 0.45, damage: 30, range: 2.6, arcDeg: 110 };
const DUMMY = { count: 8, maxHp: 120, radius: 0.5, regenDelay: 3, respawn: 2 };
const STEP_DOWN = 0.45;
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

type Weapon = 'ranged' | 'melee';
type Bullet = { mesh: Mesh; vel: Vector3; life: number; damage: number };
type Dummy = { id: number; body: ActorBody; pos: Vector3; hp: number; sinceHit: number; flashT: number };

// City seed: ?seed=123 in the URL rebuilds the same city, otherwise a new random one.
const params = new URLSearchParams(location.search);
const seed = Number(params.get('seed')) || Math.floor(Math.random() * 1e6) + 1;

const canvas = document.getElementById('game') as HTMLCanvasElement;
const overlay = document.getElementById('overlay')!;
const overlayText = document.getElementById('overlay-text')!;
const playBtn = document.getElementById('play') as HTMLButtonElement;
const hpFill = document.getElementById('hp-fill')!;
const hpText = document.getElementById('hp-text')!;
const weaponEl = document.getElementById('weapon')!;
const dashEl = document.getElementById('dash-fill')!;
const seedEl = document.getElementById('seed')!;
const slotsEl = document.getElementById('slots')!;
const crosshair = document.getElementById('crosshair')!;

const engine = new Engine(canvas, true, { stencil: true });
const scene = new Scene(engine);
const world: World = buildWorld(scene, seed);
const input = new Input(canvas);
seedEl.textContent = `Şehir #${seed} · N: yeni şehir`;

const camera = new UniversalCamera('cam', new Vector3(0, 3, -6), scene);
camera.inputs.clear();
camera.fov = 0.95;
camera.minZ = 0.1;

const bulletMat = new StandardMaterial('bullet', scene);
bulletMat.emissiveColor = Color3.FromHexString('#ffd27a');
bulletMat.disableLighting = true;

const slashMat = new StandardMaterial('slash', scene);
slashMat.emissiveColor = Color3.FromHexString('#ff5a6e');
slashMat.disableLighting = true;
slashMat.alpha = 0.6;
slashMat.backFaceCulling = false;

// Skill slot placeholders: the class skills plug in here later.
const slotEls = SKILL_KEYS.map((k) => {
  const el = document.createElement('div');
  el.className = 'slot';
  el.innerHTML = `<span class="key">${k.label}</span><span class="name">boş</span>`;
  slotsEl.appendChild(el);
  return el;
});

// ---- State ----------------------------------------------------------------
const player = {
  body: createActorBody(scene, world, 'player', { body: '#7a1f2b', head: '#e9d6c0', weapon: '#ffd27a' }, false, { player: true }),
  pos: new Vector3(),
  velY: 0,
  grounded: true,
  sinceGrounded: 0,
  airDashUsed: false,
  hp: PLAYER.maxHp,
  weapon: 'ranged' as Weapon,
  fireCd: 0,
  dashT: 0,
  dashCd: 0,
  dashDir: new Vector3(),
};
for (const m of player.body.meshes) m.isPickable = false;
const gunMesh = player.body.meshes[2];
// Melee weapon: a long glowing blade held on the right side.
const blade = MeshBuilder.CreateBox('blade', { width: 0.08, height: 0.08, depth: 1.4 }, scene);
blade.material = slashMat;
blade.parent = player.body.root;
blade.position.set(0.45, 1.15, 0.7);
blade.isPickable = false;

let dummies: Dummy[] = [];
let bullets: Bullet[] = [];
let respawnQueue: number[] = [];
let slashes: { mesh: Mesh; t: number }[] = [];
let nextId = 1;
let running = false;
let hitMarkerT = 0;
let rand = Math.random;
let aimBlend = 0; // 0 = normal view, 1 = fully aimed

function spawnDummy() {
  const id = nextId++;
  const body = createActorBody(scene, world, `dummy${id}`, { body: '#4b3f6b', head: '#c9c2d8', weapon: '#b46cff' }, true, { dummyId: id });
  const pos = findOpenSpot(world.boxes, rand);
  body.root.position.copyFrom(pos);
  body.root.rotation.y = rand() * Math.PI * 2;
  dummies.push({ id, body, pos, hp: DUMMY.maxHp, sinceHit: 99, flashT: 0 });
}

function resetMatch() {
  for (const d of dummies) disposeBody(d.body);
  for (const b of bullets) b.mesh.dispose();
  dummies = [];
  bullets = [];
  respawnQueue = [];
  // Player starts in the open plaza at the center of the city.
  player.pos.set(0, groundHeight(new Vector3(0, 0.3, 0), PLAYER.radius, world.boxes), 0);
  resolveWalls(player.pos, PLAYER.radius, PLAYER.height, world.boxes);
  player.velY = 0;
  player.hp = PLAYER.maxHp;
  player.dashCd = 0;
  input.yaw = 0;
  input.pitch = -0.12;
  for (let i = 0; i < DUMMY.count; i++) spawnDummy();
}

// ---- Helpers --------------------------------------------------------------
function aimDirection(): Vector3 {
  const cp = Math.cos(input.pitch);
  return new Vector3(Math.sin(input.yaw) * cp, Math.sin(input.pitch), Math.cos(input.yaw) * cp);
}

function muzzle(): Vector3 {
  return player.pos.add(rightFromYaw(input.yaw).scale(0.42)).add(forwardFromYaw(input.yaw).scale(0.8)).addInPlaceFromFloats(0, 1.2, 0);
}

function damageDummy(d: Dummy, dmg: number) {
  d.hp -= dmg;
  d.flashT = 1;
  d.sinceHit = 0;
  hitMarkerT = 0.12;
  if (d.hp <= 0) {
    disposeBody(d.body);
    dummies = dummies.filter((x) => x !== d);
    respawnQueue.push(DUMMY.respawn);
  }
}

function setWeapon(w: Weapon) {
  player.weapon = w;
  gunMesh.isVisible = w === 'ranged';
  blade.isVisible = w === 'melee';
  crosshair.classList.toggle('melee', w === 'melee');
}

function shoot() {
  player.fireCd = RANGED.fireRate;
  // Aim ray goes from the camera through the crosshair; the bullet flies from the gun to that point.
  const dir = aimDirection();
  const ray = new Ray(camera.position.clone(), dir, RANGED.range);
  const pick = scene.pickWithRay(ray, (m) => m.isPickable);
  const target = pick?.hit && pick.pickedPoint ? pick.pickedPoint : camera.position.add(dir.scale(RANGED.range));
  const from = muzzle();
  const vel = target.subtract(from).normalize().scale(RANGED.speed);
  const mesh = MeshBuilder.CreateSphere('bullet', { diameter: 0.16, segments: 6 }, scene);
  mesh.isPickable = false;
  mesh.material = bulletMat;
  mesh.position.copyFrom(from);
  bullets.push({ mesh, vel, life: RANGED.range / RANGED.speed, damage: RANGED.damage });
}

function swing() {
  player.fireCd = MELEE.rate;
  const fwd = forwardFromYaw(input.yaw);
  const halfArc = ((MELEE.arcDeg / 2) * Math.PI) / 180;
  for (const d of [...dummies]) {
    const to = d.pos.subtract(player.pos);
    const dy = to.y;
    to.y = 0;
    const dist = to.length();
    if (dist > MELEE.range + DUMMY.radius || Math.abs(dy) > 1.6) continue;
    const angle = Math.acos(Math.max(-1, Math.min(1, Vector3.Dot(to.normalize(), fwd))));
    if (dist < 0.8 || angle <= halfArc) damageDummy(d, MELEE.damage);
  }
  // Short arc flash in front of the player.
  const arc = MeshBuilder.CreateDisc('slash', { radius: MELEE.range, arc: MELEE.arcDeg / 360, tessellation: 24 }, scene);
  arc.material = slashMat;
  arc.isPickable = false;
  arc.rotation.x = Math.PI / 2;
  arc.rotation.y = input.yaw - Math.PI / 2 + halfArc;
  arc.position.copyFrom(player.pos).addInPlaceFromFloats(0, 1.1, 0);
  slashes.push({ mesh: arc, t: 0.12 });
}

// ---- Update ---------------------------------------------------------------
function updatePlayer(dt: number) {
  const fwd = forwardFromYaw(input.yaw);
  const right = rightFromYaw(input.yaw);
  const move = fwd.scale(input.axis('KeyS', 'KeyW')).add(right.scale(input.axis('KeyA', 'KeyD')));
  if (move.lengthSquared() > 0) move.normalize();

  // Weapon switch and skill slots.
  if (input.consume('KeyF')) setWeapon(player.weapon === 'ranged' ? 'melee' : 'ranged');
  SKILL_KEYS.forEach((k, i) => {
    if (input.consume(k.code)) {
      slotEls[i].classList.remove('pulse');
      void slotEls[i].offsetWidth; // restart the CSS animation
      slotEls[i].classList.add('pulse');
    }
  });

  // Dash: works on the ground and once in the air; no gravity while dashing.
  player.dashCd -= dt;
  if (input.consume('ShiftLeft', 'ShiftRight') && player.dashCd <= 0 && (player.grounded || !player.airDashUsed)) {
    player.dashDir = move.lengthSquared() > 0 ? move.clone() : fwd.clone();
    player.dashT = PLAYER.dashTime;
    player.dashCd = PLAYER.dashCd;
    if (!player.grounded) player.airDashUsed = true;
    player.velY = Math.max(player.velY, 0);
  }

  // Jump with a short grace period after walking off a ledge.
  if (input.consume('Space') && (player.grounded || player.sinceGrounded < PLAYER.coyoteTime) && player.dashT <= 0) {
    player.velY = PLAYER.jumpSpeed;
    player.grounded = false;
    player.sinceGrounded = PLAYER.coyoteTime;
  }

  if (player.dashT > 0) {
    player.dashT -= dt;
    player.pos.addInPlace(player.dashDir.scale(PLAYER.dashSpeed * dt));
  } else {
    const speed = PLAYER.speed * (player.grounded ? 1 : PLAYER.airControl) * (isAiming() ? AIM.moveMult : 1);
    player.pos.addInPlace(move.scale(speed * dt));
    player.velY -= PLAYER.gravity * dt;
  }
  resolveWalls(player.pos, PLAYER.radius, PLAYER.height, world.boxes);

  // Vertical movement: land on roofs, crates and walls, bump into overhangs.
  const nextY = player.pos.y + player.velY * dt;
  if (player.velY > 0) {
    const ceil = ceilingHeight(player.pos, PLAYER.radius, PLAYER.height, world.boxes);
    if (nextY + PLAYER.height > ceil) {
      player.pos.y = ceil - PLAYER.height;
      player.velY = 0;
    } else player.pos.y = nextY;
  } else {
    player.pos.y = Math.max(nextY, player.pos.y - 3); // cap fall step
  }
  const floor = groundHeight(new Vector3(player.pos.x, Math.max(player.pos.y, nextY), player.pos.z), PLAYER.radius, world.boxes);
  if (player.pos.y <= floor && player.velY <= 0) {
    player.pos.y = floor;
    player.velY = 0;
    player.grounded = true;
    player.sinceGrounded = 0;
    player.airDashUsed = false;
  } else if (player.pos.y > floor + 0.02 || player.velY > 0) {
    if (player.grounded && player.velY <= 0 && player.pos.y - floor < STEP_DOWN) {
      // Walking down a small step: stick to the floor instead of floating.
      player.pos.y = floor;
    } else {
      player.grounded = false;
      player.sinceGrounded += dt;
    }
  }

  // Character always faces where the camera aims (shooter style).
  player.body.root.position.copyFrom(player.pos);
  player.body.root.rotation.y = input.yaw;

  player.fireCd -= dt;
  if (input.firing && player.fireCd <= 0) {
    if (player.weapon === 'ranged') shoot();
    else swing();
  }
}

function updateDummies(dt: number) {
  for (const d of dummies) {
    d.sinceHit += dt;
    if (d.sinceHit > DUMMY.regenDelay) d.hp = Math.min(DUMMY.maxHp, d.hp + 60 * dt);
    if (d.body.hpBar) d.body.hpBar.scaling.x = Math.max(0, d.hp / DUMMY.maxHp);
    d.flashT = Math.max(0, d.flashT - dt * 6);
    flash(d.body, d.flashT);
  }
  respawnQueue = respawnQueue.map((t) => t - dt);
  while (respawnQueue.length && respawnQueue[0] <= 0) {
    respawnQueue.shift();
    spawnDummy();
  }
  slashes = slashes.filter((s) => {
    s.t -= dt;
    if (s.t <= 0) s.mesh.dispose();
    return s.t > 0;
  });
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
      if (pointHitsObstacle(p, world.boxes)) {
        done = true;
        break;
      }
      for (const d of dummies) {
        if (p.y > d.pos.y && p.y < d.pos.y + 2 && Math.hypot(p.x - d.pos.x, p.z - d.pos.z) < 0.55) {
          damageDummy(d, b.damage);
          done = true;
          break;
        }
      }
    }
    b.life -= dt;
    if (done || b.life <= 0) b.mesh.dispose();
    else alive.push(b);
  }
  bullets = alive;
}

function isAiming() {
  return running && input.aiming && player.weapon === 'ranged';
}

function updateCamera(dt: number) {
  aimBlend += ((isAiming() ? 1 : 0) - aimBlend) * Math.min(1, AIM.blendSpeed * dt);
  const lerp = (a: number, b: number) => a + (b - a) * aimBlend;
  camera.fov = lerp(CAMERA.fov, AIM.fov);
  const dir = aimDirection();
  const head = player.pos.add(new Vector3(0, CAMERA.height, 0));
  const pivot = head.add(rightFromYaw(input.yaw).scale(lerp(CAMERA.shoulder, AIM.shoulder)));
  // Pull the camera in if a wall is between it and the player.
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
  camera.position.copyFrom(pos);
  camera.setTarget(pos.add(dir));
  // Fade the character while aiming or when the camera is pushed close, so it does not block the view.
  const fade = aimBlend > 0.5 || dist < 1.6 ? 0.3 : 1;
  for (const m of player.body.meshes) m.visibility = fade;
  blade.visibility = fade;
}

function updateHud() {
  hpFill.style.width = `${(player.hp / PLAYER.maxHp) * 100}%`;
  hpText.textContent = `${Math.ceil(player.hp)} / ${PLAYER.maxHp}`;
  weaponEl.textContent = player.weapon === 'ranged' ? 'Silah: Uzak (F)' : 'Silah: Yakın (F)';
  dashEl.style.width = `${Math.min(1, 1 - player.dashCd / PLAYER.dashCd) * 100}%`;
  crosshair.classList.toggle('hit', hitMarkerT > 0);
  crosshair.classList.toggle('aim', aimBlend > 0.5);
}

// ---- Loop -----------------------------------------------------------------
resetMatch();
setWeapon('ranged');
updateCamera(1);

engine.runRenderLoop(() => {
  const dt = Math.min(engine.getDeltaTime() / 1000, 0.05);
  if (running) {
    if (input.consume('KeyN')) {
      location.search = '';
      return;
    }
    updatePlayer(dt);
    updateDummies(dt);
    updateBullets(dt);
    hitMarkerT -= dt;
  }
  input.endFrame();
  updateCamera(dt);
  updateHud();
  scene.render();
});

window.addEventListener('resize', () => engine.resize());

function start() {
  running = true;
  overlay.classList.add('hidden');
}
playBtn.addEventListener('click', () => {
  start();
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
  start,
  state: () => ({
    hp: player.hp,
    pos: player.pos.asArray(),
    grounded: player.grounded,
    weapon: player.weapon,
    dummies: dummies.map((d) => ({ pos: d.pos.asArray(), hp: d.hp })),
  }),
};
