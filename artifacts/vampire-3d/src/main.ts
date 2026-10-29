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
import { placeHouses } from './houses';
import { attachGun } from './gun';
import { buildWorld, ceilingHeight, groundHeight, pointHitsObstacle, resolveWalls } from './world';
import { createActorBody, forwardFromYaw, rightFromYaw } from './actors';
import { DAGGERS, GUN, MAX_LEVEL, ROGUE, TOKEN_PRICE } from './balance';
import { G, PS, chest, dealDamage, fireBullet, glowMat, hostile, inCombat, makeUnit, spawnFx, tickStatus, updateBullets, updateFx, type Unit } from './core';
import {
  PLAYSTYLES,
  SKILLS,
  blockedReason,
  castSlot,
  enemyVisibility,
  hasteMult,
  learn,
  maxCharges,
  resetRogue,
  setRogueHost,
  skills,
  speedMult,
  targetUnderCrosshair,
  updateRogue,
  weaponPoisoned,
} from './rogue';
import { boss, botDied, resetDirector, spawnBoss, updateAI } from './ai';
import { killLog, xpLog, cardText, currentOffer, grantXp, pickCard, prog, resetProgression, rewardKill, tier3Open, xpNeeded } from './progression';

// ---- Tuning (movement and camera) -------------------------------------------
const MOVE = {
  speed: 8.5,
  airControl: 0.85,
  jumpSpeed: 9,
  gravity: 26,
  coyoteTime: 0.1,
  dashSpeed: 26,
  dashTime: 0.18,
  dashCd: 1.0,
};
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
placeHouses(scene, world).catch((e) => console.error('House model failed to load', e));
$('seed').textContent = `Şehir #${seed} · N: yeni şehir${DEBUG ? ' · L seviye · B boss · K para' : ''}`;

const camera = new UniversalCamera('cam', new Vector3(0, 3, -6), scene);
camera.inputs.clear();
camera.fov = CAMERA.fov;
camera.minZ = 0.1;

Object.assign(G, { scene, world, camera, input });

// A tiny seeded random for spawns so a seed replays the same opening.
let rs = seed;
const rand = () => {
  rs = (rs * 16807) % 2147483647;
  return (rs - 1) / 2147483646;
};

// ---- Player -----------------------------------------------------------------
const playerColors = { body: '#7a1f2b', head: '#e9d6c0', weapon: '#ffd27a' };
const pBody = createActorBody(scene, world, 'player', playerColors, false, {});
const player: Unit = makeUnit('player', 'Sen', pBody, new Vector3(), 0, ROGUE.maxHp, { colors: playerColors });
G.player = player;
for (const m of pBody.meshes) m.isPickable = false;

const ctl = {
  grounded: true,
  sinceGrounded: 0,
  airDashUsed: false,
  weapon: 'ranged' as Weapon,
  fireCd: 0,
  dashT: 0,
  dashCd: 0,
  dashDir: new Vector3(),
  ammo: GUN.magazine,
  reloadT: 0,
  side: 1,
  moving: false,
};

let gunMesh: Mesh = pBody.meshes[2];
attachGun(scene, world, pBody.root)
  .then((gun) => {
    gunMesh.dispose();
    gunMesh = gun;
    pBody.meshes[2] = gun;
    setWeapon(ctl.weapon);
  })
  .catch((e) => console.error('Gun model failed to load', e));

// Twin laser daggers, one in each hand.
const blades = [1, -1].map((s) => {
  const b = MeshBuilder.CreateBox('dagger', { width: 0.06, height: 0.06, depth: 0.75 }, scene);
  b.material = glowMat('#ff5a6e', 0.85);
  b.parent = pBody.root;
  b.position.set(0.45 * s, 1.1, 0.45);
  b.isPickable = false;
  return b;
});

function setWeapon(w: Weapon) {
  ctl.weapon = w;
  gunMesh.isVisible = w === 'ranged';
  for (const b of blades) b.isVisible = w === 'melee';
  crosshair.classList.toggle('melee', w === 'melee');
}

function aimDirection(): Vector3 {
  const cp = Math.cos(input.pitch);
  return new Vector3(Math.sin(input.yaw) * cp, Math.sin(input.pitch), Math.cos(input.yaw) * cp);
}

function muzzle(): Vector3 {
  return player.pos.add(rightFromYaw(input.yaw).scale(0.42)).add(forwardFromYaw(input.yaw).scale(0.8)).addInPlaceFromFloats(0, 1.2, 0);
}

setRogueHost({
  aimDir: aimDirection,
  aimOrigin: () => camera.position.add(aimDirection().scale(Vector3.Distance(camera.position, chest(player)))),
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
});

// ---- Attacks ----------------------------------------------------------------
function reload() {
  if (ctl.reloadT > 0 || ctl.ammo >= GUN.magazine) return;
  ctl.reloadT = GUN.reload / hasteMult();
}

function isMyDecoyMesh(m: { metadata?: { unitId?: number } }) {
  const u = G.units.find((x) => x.id === m.metadata?.unitId);
  return u?.kind === 'decoy';
}

function shoot() {
  if (ctl.reloadT > 0) return;
  if (ctl.ammo <= 0) return reload();
  ctl.fireCd = GUN.fireRate / hasteMult();
  ctl.ammo -= 1;
  // Aim ray goes from the camera through the crosshair; the bullet flies from the gun to that point.
  const dir = aimDirection();
  const ray = new Ray(camera.position.clone(), dir, GUN.range);
  const pick = scene.pickWithRay(ray, (m) => m.isPickable && m.isVisible && m.metadata?.unitId !== player.id && !isMyDecoyMesh(m));
  const target = pick?.hit && pick.pickedPoint ? pick.pickedPoint : camera.position.add(dir.scale(GUN.range));
  const from = muzzle();
  const poisoned = weaponPoisoned();
  fireBullet(player, from, target.subtract(from), GUN.speed, GUN.range, GUN.damage, poisoned ? '#7be36f' : '#ffd27a', poisoned);
  if (ctl.ammo <= 0) reload();
}

function swing() {
  ctl.fireCd = DAGGERS.rate / hasteMult();
  ctl.side *= -1;
  const fwd = forwardFromYaw(input.yaw);
  const halfArc = ((DAGGERS.arcDeg / 2) * Math.PI) / 180;
  for (const u of [...G.units]) {
    if (!hostile(player, u) || u.team === 0) continue;
    const to = u.pos.subtract(player.pos);
    if (Math.abs(to.y) > 1.8) continue;
    to.y = 0;
    const dist = to.length() - u.radius;
    if (dist > DAGGERS.range) continue;
    const angle = Math.acos(Math.max(-1, Math.min(1, Vector3.Dot(to.normalize(), fwd))));
    if (dist < 0.6 || angle <= halfArc) dealDamage(player, u, DAGGERS.damage, { poison: weaponPoisoned() });
  }
  const arc = MeshBuilder.CreateDisc('slash', { radius: DAGGERS.range, arc: DAGGERS.arcDeg / 360, tessellation: 20 }, scene);
  arc.rotation.x = Math.PI / 2;
  arc.rotation.z = ctl.side * 0.35;
  arc.rotation.y = input.yaw - Math.PI / 2 + halfArc;
  spawnFx(arc, player.pos.add(new Vector3(0, 1.1, 0)), weaponPoisoned() ? '#7be36f' : '#ff5a6e', 0.12, 0, 0.55);
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
  if (input.consume('KeyR')) reload();
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

  ctl.dashCd -= dt;
  if (!stunned && input.consume('ShiftLeft', 'ShiftRight') && ctl.dashCd <= 0 && (ctl.grounded || !ctl.airDashUsed)) {
    ctl.dashDir = move.lengthSquared() > 0 ? move.clone() : fwd.clone();
    ctl.dashT = MOVE.dashTime;
    ctl.dashCd = MOVE.dashCd;
    if (!ctl.grounded) ctl.airDashUsed = true;
    player.velY = Math.max(player.velY, 0);
  }
  if (!stunned && input.consume('Space') && (ctl.grounded || ctl.sinceGrounded < MOVE.coyoteTime) && ctl.dashT <= 0) {
    player.velY = MOVE.jumpSpeed;
    ctl.grounded = false;
    ctl.sinceGrounded = MOVE.coyoteTime;
  }

  if (ctl.dashT > 0) {
    ctl.dashT -= dt;
    player.pos.addInPlace(ctl.dashDir.scale(MOVE.dashSpeed * dt));
  } else {
    const slow = player.slowT > 0 ? player.slowMul : 1;
    const speed = stunned ? 0 : MOVE.speed * speedMult() * slow * (ctl.grounded ? 1 : MOVE.airControl) * (isAiming() ? AIM.moveMult : 1);
    player.pos.addInPlace(move.scale(speed * dt));
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
    ctl.grounded = true;
    ctl.sinceGrounded = 0;
    ctl.airDashUsed = false;
  } else if (player.pos.y > floor + 0.02 || player.velY > 0) {
    if (ctl.grounded && player.velY <= 0 && player.pos.y - floor < STEP_DOWN) player.pos.y = floor;
    else {
      ctl.grounded = false;
      ctl.sinceGrounded += dt;
    }
  }
  player.yaw = input.yaw;

  if (ctl.reloadT > 0) {
    ctl.reloadT -= dt;
    if (ctl.reloadT <= 0) ctl.ammo = GUN.magazine;
  }
  ctl.fireCd -= dt;
  if (!stunned && input.firing && ctl.fireCd <= 0) {
    if (ctl.weapon === 'ranged') shoot();
    else swing();
  }
  // Health comes back out of combat.
  if (G.time - player.lastCombat > ROGUE.regenDelay) player.hp = Math.min(player.maxHp, player.hp + ROGUE.regenPerSec * dt);
  updateRogue(dt, ctl.moving, ctl.grounded);
}

function isAiming() {
  return running && input.aiming && ctl.weapon === 'ranged';
}

// ---- Camera ----------------------------------------------------------------------
let aimBlend = 0;
function updateCamera(dt: number) {
  aimBlend += ((isAiming() ? 1 : 0) - aimBlend) * Math.min(1, AIM.blendSpeed * dt);
  const lerp = (a: number, b: number) => a + (b - a) * aimBlend;
  camera.fov = lerp(CAMERA.fov, AIM.fov);
  const dir = aimDirection();
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
  camera.position.copyFrom(pos);
  camera.setTarget(pos.add(dir));
  // Fade the character while aiming, when the camera is close, and while invisible.
  const vis = enemyVisibility();
  let fade = aimBlend > 0.5 || dist < 1.6 ? 0.3 : 1;
  if (vis === 0) fade = Math.min(fade, 0.2);
  else if (vis < 1) fade = Math.min(fade, 0.55);
  for (const m of pBody.meshes) m.visibility = fade;
  for (const b of blades) b.visibility = fade;
}

// ---- HUD ---------------------------------------------------------------------------
let hitMarkerT = 0;
let toastT = 0;
G.hooks.hitMarker = () => (hitMarkerT = 0.12);

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
  if (style === 'hit' && amount < 0.5) return;
  const el = document.createElement('div');
  el.className = `num ${style}`;
  el.textContent = style === 'block' ? 'BLOK' : style === 'crit' ? `${Math.round(amount)} SIRT!` : `${Math.round(amount)}`;
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
      ? `<div class="cd"></div><span class="charges"></span><span class="cdtext"></span><span class="key">${k.label}</span><span class="name">${SKILLS[s.id].name}</span><span class="pips">${[1, 2, 3].map((t) => `<i class="${t <= s.tier ? 'on' : ''}"></i>`).join('')}</span>`
      : `<span class="key">${k.label}</span><span class="name">boş</span>`;
    slotsEl.appendChild(el);
  });
}

function updateSlots() {
  renderSlots();
  skills.forEach((s, i) => {
    const el = slotsEl.children[i] as HTMLElement;
    const def = SKILLS[s.id];
    const max = maxCharges(s);
    const frac = s.charges >= max ? 0 : Math.max(0, s.cd / def.cooldown(s.tier));
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
  $('weapon').textContent =
    ctl.weapon === 'ranged' ? `Suikast tabancası ${ctl.reloadT > 0 ? 'dolduruluyor…' : `${ctl.ammo}/${GUN.magazine}`} (F)` : 'İkili lazer hançer (F)';
  $('dash-fill').style.width = `${Math.min(1, 1 - ctl.dashCd / MOVE.dashCd) * 100}%`;
  $('level').textContent = `Sv ${player.level}${player.level >= MAX_LEVEL ? ' (max)' : ''}`;
  $('money').textContent = `Para ${PS.currency}`;
  $('kills').textContent = `${PS.kills} leş`;
  const need = xpNeeded(player.level);
  $('xp-fill').style.width = need ? `${(player.xp / need) * 100}%` : '100%';
  $('xp-text').textContent = need ? `${Math.floor(player.xp)} / ${need} XP` : 'Maksimum seviye';
  $('timer').textContent = fmtTime(G.time);
  $('pick-hint').classList.toggle('hidden', prog.pending <= 0);
  $('pick-hint').innerHTML = `Seviye atladın! ${prog.pending > 1 ? `${prog.pending} kart` : 'Kart'} seçmek için <b>Tab</b>`;
  crosshair.classList.toggle('hit', hitMarkerT > 0);
  crosshair.classList.toggle('aim', aimBlend > 0.5);

  const buffs: string[] = [];
  if (PS.invisT > 0) buffs.push(`Görünmez ${PS.invisT.toFixed(1)}`);
  else if (enemyVisibility() < 1) buffs.push('Yarı silik');
  if (PS.evasionImmuneT > 0) buffs.push('Hasar almaz');
  else if (PS.evasionT > 0) buffs.push(`Evasion ${PS.evasionT.toFixed(1)}`);
  if (PS.poisonBoostT > 0) buffs.push('Zehir x2');
  else if (weaponPoisoned()) buffs.push('Zehirli silah');
  if (PS.sprintT > 0) buffs.push('Sprint');
  if (player.stunT > 0) buffs.push('Sersem!');
  if (inCombat(player)) buffs.push('Savaşta');
  $('buffs').textContent = buffs.join(' · ');

  if (boss?.alive) {
    $('boss').classList.remove('hidden');
    $('boss-fill').style.width = `${(boss.hp / boss.maxHp) * 100}%`;
  } else $('boss').classList.add('hidden');

  const t = targetUnderCrosshair(70, 4, (u) => u !== player);
  $('target').textContent = t ? (t.kind === 'decoy' ? `Kopyan (${t.name})` : t.kind === 'mob' || t.kind === 'boss' ? t.name : `${t.name} · Sv ${t.level}`) : '';

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
      <div class="tag ${c.isNew ? 'new' : ''}">${c.isNew ? 'Yeni yetenek' : `Seviye ${c.tier}`}</div>
      <h3>${txt.name}</h3>
      ${c.isNew ? `<div class="desc">${txt.desc}</div>` : ''}
      <div class="tier">Seviye ${c.tier}: ${txt.tier}</div>
      ${c.cost ? `<div class="cost">Token: ${c.cost} para${c.locked ? ` (sende ${PS.currency})` : ''}</div>` : ''}
      <div class="key">${c.locked ? c.locked : `Seç: ${i + 1} ya da tıkla`}</div>`;
    el.addEventListener('click', () => choose(i));
    row.appendChild(el);
  });
  if (!offer.length) row.innerHTML = '<p>Tüm yeteneklerin en üst seviyede.</p>';
  $('tier-rule').textContent = tier3Open()
    ? `3. seviye açık (token ${TOKEN_PRICE} para)`
    : `3. seviye için en az 3 yetenek 2. seviyede olmalı (şu an ${skills.filter((s) => s.tier >= 2).length})`;
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
window.addEventListener('keydown', (e) => {
  if (!cardsOpen) return;
  if (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit3') choose(Number(e.code.slice(5)) - 1);
  else if (e.code === 'Tab') closeCards();
  input.consume(e.code);
});

// ---- Kills -------------------------------------------------------------------------
G.hooks.kill = (killer, victim) => {
  const xp = rewardKill(killer, victim);
  if (victim.kind === 'bot') botDied(victim);
  if (victim === player) return die(killer);
  if (victim.kind === 'decoy') return;
  const kName = killer ? (killer === player ? 'Sen' : killer.name) : 'Zehir';
  if (victim.kind !== 'mob' || killer === player) feed(`${kName} ▸ ${victim.name}${killer === player && xp ? `  +${xp} XP` : ''}`);
  if (victim.kind === 'boss') toast(killer === player ? "Hurda Devi'ni sen devirdin!" : `${kName} Hurda Devi'ni devirdi`, 2.5);
};

// ---- Match ---------------------------------------------------------------------------
let running = false;
let started = false;
let dead = false;
let styleIndex = 0;

function levelLog() {
  const lines = prog.levelTimes.map((l) => `Sv ${l.level}: ${fmtTime(l.t)}`);
  return lines.length ? `Seviye zamanları\n${lines.join('\n')}` : '';
}

function die(killer: Unit | null) {
  dead = true;
  running = false;
  if (document.pointerLockElement) document.exitPointerLock();
  overlayText.textContent = `Öldün${killer && killer !== player ? ` (${killer.name})` : ''}. Süre ${fmtTime(G.time)}, seviye ${player.level}, ${PS.kills} leş.`;
  playBtn.textContent = 'Tekrar oyna';
  $('summary').textContent = levelLog();
  overlay.classList.remove('hidden');
}

function buildStyles() {
  const box = $('styles');
  box.innerHTML = '';
  PLAYSTYLES.forEach((s, i) => {
    const b = document.createElement('button');
    b.className = `style${i === styleIndex ? ' on' : ''}`;
    b.innerHTML = `<b>${s.name}</b><span>Başlangıç: ${SKILLS[s.skill].name}</span>`;
    b.addEventListener('click', () => {
      styleIndex = i;
      buildStyles();
    });
    box.appendChild(b);
  });
}
buildStyles();

function resetMatch() {
  for (const u of [...G.units]) if (u !== player) u.body.root.dispose(false, true);
  G.units = [player];
  for (const b of G.bullets) b.mesh.dispose();
  G.bullets = [];
  G.time = 0;
  resetRogue();
  resetProgression();
  Object.assign(PS, { kills: 0, currency: 0 });
  player.pos.set(0, groundHeight(new Vector3(0, 0.3, 0), player.radius, world.boxes), 0);
  resolveWalls(player.pos, player.radius, player.height, world.boxes);
  player.velY = 0;
  player.level = 1;
  player.xp = 0;
  player.maxHp = ROGUE.maxHp;
  player.hp = player.maxHp;
  input.yaw = 0;
  input.pitch = -0.12;
  resetDirector(rand);
}

function start() {
  if (dead) {
    location.reload();
    return;
  }
  if (!started) {
    started = true;
    const style = PLAYSTYLES[styleIndex];
    learn(style.skill);
    setWeapon(style.weapon);
    $('styles').classList.add('hidden');
    overlayText.textContent = '';
    toast(`${style.name}: ${SKILLS[style.skill].name} ile başladın`, 2.5);
  }
  running = true;
  overlay.classList.add('hidden');
}

playBtn.addEventListener('click', () => {
  start();
  input.lock();
});

document.addEventListener('pointerlockchange', () => {
  if (!input.locked && running && !cardsOpen && !dead) {
    running = false;
    overlayText.textContent = 'Duraklatıldı.';
    playBtn.textContent = 'Devam et';
    $('summary').textContent = levelLog();
    overlay.classList.remove('hidden');
  }
});

resetMatch();
setWeapon('ranged');
updateCamera(1);

function simStep(dt: number) {
  G.time += dt;
  updatePlayer(dt);
  updateAI(dt, rand, (t) => toast(t, 3));
  for (const u of [...G.units]) if (u.alive) tickStatus(u, dt);
  updateBullets(dt);
  updateFx(dt);
  hitMarkerT -= dt;
}

engine.runRenderLoop(() => {
  const dt = Math.min(engine.getDeltaTime() / 1000, 0.05);
  if (running && !cardsOpen && input.consume('Tab') && prog.pending > 0) openCards();
  const live = running && !cardsOpen;
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
  resetSkills: resetRogue,
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
  logs: () => ({ xpLog, killLog }),
  freeze: (sec: number) => {
    for (const u of G.units) if (u !== player) u.stunT = sec;
  },
  setPlayerYaw: (yaw: number, pitch: number) => {
    input.yaw = yaw;
    input.pitch = pitch;
    updateCamera(1);
  },
  ghost: () => {
    PS.evasionImmuneT = 1e9;
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
    alive: player.alive,
    units: G.units.map((u) => ({ id: u.id, kind: u.kind, name: u.name, hp: Math.round(u.hp), level: u.level, pos: u.pos.asArray().map((v) => +v.toFixed(1)), stun: u.stunT, poison: u.poisonT })),
  }),
};
