import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Engine } from '@babylonjs/core/Engines/engine';
import type { Scene } from '@babylonjs/core/scene';
import type { UniversalCamera } from '@babylonjs/core/Cameras/universalCamera';
import { MAX_LEVEL } from './balance';
import { G, PS, inCombat } from './core';
import { P, blockedReason, def, kit, maxCharges, skills, targetUnderCrosshair, type Weapon } from './kit';
import { INV, bandageCdShare, bandageShare, gearDashCost, reelReady } from './inventory';
import { feel, addShake, sfx, sparksAt } from './feel';
import { hud, t as T } from './i18n';
import { prog, xpNeeded } from './progression';
import { SETTINGS, shopUi } from './ui';
import { nearMachine } from './vendor';
import { skillIcon } from './icons';
import { visualRandom } from './random';

export const SKILL_KEYS = [
  { code: 'KeyQ', label: 'Q' },
  { code: 'KeyE', label: 'E' },
  { code: 'Digit1', label: '1' },
  { code: 'Digit2', label: '2' },
  { code: 'Digit3', label: '3' },
];

const $ = (id: string) => document.getElementById(id)!;

type HudRuntime = {
  engine: Engine;
  scene: Scene;
  camera: UniversalCamera;
  canvas: HTMLCanvasElement;
  ctl: { weapon: Weapon; sp: number; winded: number };
  running: () => boolean;
  aimBlend: () => number;
  aimDirection: () => Vector3;
  spMax: number;
  dashCost: number;
};

/** Owns the combat HUD, floating hit numbers, and combat feedback hooks. */
export function createGameHud(runtime: HudRuntime) {
  const crosshair = $('crosshair');
  const slotsEl = $('slots');
  let hitMarkerT = 0;
  let toastT = 0;
  let crosshairKick = 0;
  let killMarkerT = 0;
  let slotKey = '';
  type Num = { el: HTMLDivElement; pos: Vector3; t: number };
  let nums: Num[] = [];

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

  G.hooks.hitMarker = (crit) => {
    hitMarkerT = 0.12;
    sfx.hit(crit);
  };
  G.hooks.impact = (p, color) => {
    sparksAt(runtime.scene, p, color, 5, 5);
    if (Vector3.Distance(p, G.player.pos) < 25) sfx.impact();
  };
  G.hooks.shot = (from) => {
    const d = Vector3.Distance(from, G.player.pos);
    if (d < 60) sfx.farShot(d);
  };
  G.hooks.playerHurt = (dmg) => {
    feel.hurt = Math.min(1, feel.hurt + dmg / 40);
    addShake(Math.min(0.5, dmg / 60));
    sfx.hurt();
  };
  G.hooks.number = (pos, amount, style) => {
    if (!SETTINGS.numbers) return;
    if (style === 'hit' && amount < 0.5) return;
    const el = document.createElement('div');
    el.className = `num ${style}`;
    el.textContent = style === 'block' ? (T('level') === 'Sv' ? 'BLOK' : 'BLOCK') : style === 'crit' ? `${Math.round(amount)}!` : `${Math.round(amount)}`;
    $('numbers').appendChild(el);
    nums.push({ el, pos: pos.add(new Vector3((visualRandom() - 0.5) * 0.4, 0.3, 0)), t: 0.9 });
  };

  function updateNumbers(dt: number) {
    const w = runtime.engine.getRenderWidth();
    const h = runtime.engine.getRenderHeight();
    const scale = runtime.canvas.clientWidth / w;
    const vp = runtime.camera.viewport.toGlobal(w, h);
    const tm = runtime.scene.getTransformMatrix();
    const aim = runtime.aimDirection();
    nums = nums.filter((n) => {
      n.t -= dt;
      n.pos.y += dt * 1.2;
      const p = Vector3.Project(n.pos, Matrix.Identity(), tm, vp);
      const behind = Vector3.Dot(n.pos.subtract(runtime.camera.position), aim) < 0;
      n.el.style.left = `${p.x * scale}px`;
      n.el.style.top = `${p.y * scale}px`;
      n.el.style.opacity = behind ? '0' : `${Math.min(1, n.t * 2)}`;
      if (n.t <= 0) n.el.remove();
      return n.t > 0;
    });
  }

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
      const swapReady = s.id === 'decoy' && G.units.some((u) => u.kind === 'decoy');
      el.classList.toggle('blocked', !!blockedReason(s) || (s.charges <= 0 && !swapReady));
    });
  }

  function update(dt: number) {
    const player = G.player;
    const ctl = runtime.ctl;
    $('hp-fill').style.width = `${(Math.max(0, player.hp) / player.maxHp) * 100}%`;
    $('hp-text').textContent = `${Math.ceil(Math.max(0, player.hp))} / ${player.maxHp}`;
    $('weapon').textContent = `${hud(kit.weaponText(ctl.weapon))} (F)`;
    $('sp-fill').style.width = `${(ctl.sp / runtime.spMax) * 100}%`;
    $('sp-fill').parentElement!.classList.toggle('low', ctl.sp < runtime.dashCost * gearDashCost());
    $('sp-fill').parentElement!.classList.toggle('winded', ctl.winded > 0);
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
    const atShop = runtime.running() && !shopUi.isOpen() && !!nearMachine(player.pos);
    $('shop-hint').classList.toggle('hidden', !atShop);
    if (atShop) $('shop-hint').innerHTML = T('shopHint');
    $('pick-hint').innerHTML = `${T('levelUp')} <b>Tab</b> ${prog.pending > 1 ? `${prog.pending} ${T('cards')}` : T('card')} ${T('pickCards')}`;
    crosshair.classList.toggle('hit', hitMarkerT > 0);
    crosshair.classList.toggle('kill', killMarkerT > 0);
    crosshairKick = Math.max(0, crosshairKick - dt * 6);
    killMarkerT -= dt;
    crosshair.style.transform = `scale(${1 + crosshairKick * 0.5})`;
    $('hurt').style.opacity = `${feel.hurt}`;
    crosshair.classList.toggle('aim', runtime.aimBlend() > 0.5);

    const buffs: string[] = kit.buffs();
    if (P.shield > 0) buffs.push(`${T('shield')} ${Math.ceil(P.shield)}`);
    if (player.stunT > 0) buffs.push(T('stunned'));
    if (inCombat(player)) buffs.push(T('inCombat'));
    if (INV.bandT > 0) buffs.push(T('bandaging'));
    $('buffs').textContent = hud(buffs.join(' · '));

    const boss = G.units.find((u) => u.kind === 'boss' && u.alive);
    if (boss) {
      $('boss').classList.remove('hidden');
      $('boss-fill').style.width = `${(boss.hp / boss.maxHp) * 100}%`;
    } else $('boss').classList.add('hidden');

    const target = targetUnderCrosshair(70, 4, (u) => u !== player);
    $('target').textContent = target ? (target.kind === 'decoy' ? `${T('yourCopy')} (${target.name})` : target.kind === 'pet' ? target.name : target.kind === 'mob' || target.kind === 'boss' ? target.name : `${target.name} · ${T('level')} ${target.level}`) : '';

    toastT -= dt;
    if (toastT <= 0) $('toast').style.opacity = '0';
    updateSlots();
    updateNumbers(dt);
  }

  return {
    toast,
    feed,
    update,
    step: (dt: number) => { hitMarkerT -= dt; },
    kickCrosshair: () => { crosshairKick = 1; },
    markKill: () => { killMarkerT = 0.35; sfx.kill(); },
    invalidateSlots: () => { slotKey = ''; },
  };
}

export function fmtTime(t: number) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
