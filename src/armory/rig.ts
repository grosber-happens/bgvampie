import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { Scene } from '@babylonjs/core/scene';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Vector3, Matrix } from '@babylonjs/core/Maths/math.vector';
import { CLASS_GLOW, LOADOUT, forgeWeapon, type ClassId, type DesignId, type Forged } from './index';
import { getSpecies } from './species';

/**
 * The weapon rig: puts the class weapons in the character's hands and makes them move.
 *
 * - At rest the weapon rides in the hand bone (it swings with the run animation).
 * - When the player aims or attacks, it comes up to a ready pose and points where the camera aims.
 * - Melee attacks swing it (daggers and claws alternate hands); shots kick it back.
 * - It shows the class's state: one light per bullet, the wand's heat, the Mage's nano orbs,
 *   the sniper's charge, spare spears in the Fighter's quiver, the second sword.
 */

export type Hand = 'ranged' | 'melee';

/** What the class tells the rig every frame (all optional). */
export type Gauge = {
  ammo?: number;
  mag?: number;
  reloading?: boolean;
  /** Mage wand heat 0..1. */
  heat?: number;
  overheated?: boolean;
  /** Mage nano orbs. */
  orbs?: number;
  /** Fighter spears ready to throw (including the one in hand). */
  spears?: number;
  /** Fighter: second sword is out. */
  dual?: boolean;
  /** Scout scope charge 0..1. */
  charge?: number;
  /** Scout Switch weapons: shotgun blasts left (the shotgun is out while > 0), two guns at tier 3. */
  shotgun?: number;
  shotgunDual?: boolean;
};

export type RigState = { dt: number; pitch: number; ready: boolean; hand: Hand; gauge: Gauge };

/** The named weapon item the player wears, if any (main.ts fills this in). */
export const rigHooks = { named: (): { hand: Hand; gem: string } | null => null };

type Grip = {
  side: 0 | 1;
  node: TransformNode;
  hold: TransformNode;
  w: Forged;
  design: DesignId;
};

/** How each design sits in the hand at rest and in the ready pose (metres, radians, root space). */
const HOLD: Record<DesignId, { ready: [number, number, number]; restPitch: number; readyPitch?: number; tilt?: [number, number, number]; offset?: [number, number, number] }> = {
  pistol: { ready: [0.4, 1.27, 0.95], restPitch: 0.9 },
  dagger: { ready: [0.42, 1.1, 0.62], restPitch: 1.1, readyPitch: -0.15 },
  pen: { ready: [0.4, 1.28, 0.92], restPitch: 0.9 },
  lantern: { ready: [0.46, 1.0, 0.55], restPitch: 0, tilt: [-1.32, 0, 0], offset: [0, 0, 0] },
  sword: { ready: [0.46, 1.1, 0.6], restPitch: 0.9, readyPitch: -0.85 },
  spear: { ready: [0.4, 1.45, 0.3], restPitch: -1.15, readyPitch: -0.2, offset: [0, 0, -0.15] },
  quiver: { ready: [0, 0, 0], restPitch: 0 },
  rifle: { ready: [0.36, 1.32, 0.72], restPitch: 0.55 },
  claw: { ready: [0.4, 1.08, 0.6], restPitch: 0.6, readyPitch: 0 },
  shotgun: { ready: [0.4, 1.25, 0.9], restPitch: 0.9 },
};

const mirror = (v: [number, number, number], side: 0 | 1): [number, number, number] => (side === 0 ? v : [-v[0], v[1], v[2]]);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

class WeaponRig {
  readonly nodes: Record<Hand, TransformNode>;
  private grips: Record<Hand, Grip[]> = { ranged: [], melee: [] };
  private back: Forged | null = null;
  private backNode: TransformNode | null = null;
  /** Skill weapons that briefly replace the class weapons (Scout shotgun). */
  private alt: Grip[] = [];
  private altShown = 0;
  private stance = 0;
  private swingT = 9;
  private swingSide: 0 | 1 = 0;
  private kick = 0;
  private throwT = 9;
  private last: Gauge = {};
  private time = 0;
  private namedKey = '';
  private hands: { r?: TransformNode; l?: TransformNode; rootId?: number } = {};

  constructor(
    private scene: Scene,
    private root: TransformNode,
    readonly cls: ClassId,
  ) {
    this.nodes = {
      ranged: new TransformNode(`rig-${cls}-ranged`, scene),
      melee: new TransformNode(`rig-${cls}-melee`, scene),
    };
    for (const n of Object.values(this.nodes)) n.parent = root;
    this.forge();
  }

  /** Build (or rebuild) the weapons, e.g. when a named item is put on. */
  private forge() {
    for (const h of ['ranged', 'melee'] as Hand[]) {
      for (const g of this.grips[h]) g.node.dispose(false, false);
      this.grips[h] = [];
    }
    this.backNode?.dispose(false, false);
    this.back = null;
    this.backNode = null;
    for (const g of this.alt) g.node.dispose(false, false);
    this.alt = [];
    const sp = getSpecies();
    const lo = LOADOUT[this.cls];
    const named = rigHooks.named();
    this.namedKey = named ? `${named.hand}-${named.gem}` : '';
    for (const h of ['ranged', 'melee'] as Hand[]) {
      const design = lo[h];
      const sides: (0 | 1)[] = lo.twin === h || (this.cls === 'fighter' && h === 'melee') ? [0, 1] : [0];
      for (const side of sides) {
        const isNamed = named?.hand === h;
        const w = forgeWeapon(this.scene, design, this.cls, sp, { named: isNamed, gem: isNamed ? named!.gem : undefined, side });
        const node = new TransformNode(`grip-${h}-${side}`, this.scene);
        node.parent = this.nodes[h];
        const hold = new TransformNode(`hold-${h}-${side}`, this.scene);
        hold.parent = node;
        w.root.parent = hold;
        w.root.scaling.setAll(SCALE);
        const H = HOLD[design];
        if (H.tilt) w.root.rotation.set(...H.tilt);
        if (H.offset) w.root.position.set(...H.offset);
        this.prepare(w);
        this.grips[h].push({ side, node, hold, w, design });
      }
    }
    if (lo.back) {
      this.back = forgeWeapon(this.scene, lo.back, this.cls, sp, { named: named?.hand === 'ranged', gem: named?.hand === 'ranged' ? named.gem : undefined });
      this.backNode = onBack(this.scene, this.root, this.back);
      this.prepare(this.back);
    }
    if (this.cls === 'scout') {
      for (const side of [0, 1] as const) {
        const w = forgeWeapon(this.scene, 'shotgun', this.cls, sp, { named: false, side });
        const node = new TransformNode(`grip-alt-${side}`, this.scene);
        node.parent = this.root;
        const hold = new TransformNode(`hold-alt-${side}`, this.scene);
        hold.parent = node;
        w.root.parent = hold;
        w.root.scaling.setAll(SCALE);
        this.prepare(w);
        node.setEnabled(false);
        this.alt.push({ side, node, hold, w, design: 'shotgun' });
      }
    }
    // The orbs and quiver spears start hidden; update() shows the right number.
    this.last = {};
  }

  private prepare(w: Forged) {
    for (const m of w.root.getChildMeshes()) {
      m.isPickable = false;
      m.receiveShadows = false;
    }
  }

  private findHands() {
    if (this.hands.rootId === this.root.uniqueId && this.hands.r) return;
    const all = this.root.getChildTransformNodes(false);
    this.hands = {
      rootId: this.root.uniqueId,
      r: all.find((n) => n.name.endsWith('RightHand')),
      l: all.find((n) => n.name.endsWith('LeftHand')),
    };
  }

  /** The body was swapped (placeholder to hippo): follow the new root. */
  reparent(root: TransformNode) {
    this.root = root;
    for (const n of Object.values(this.nodes)) n.parent = root;
    if (this.backNode) this.backNode.parent = root;
    for (const g of this.alt) g.node.parent = root;
    this.hands = {};
  }

  /** A melee attack started. */
  swing() {
    this.swingT = 0;
    this.stance = Math.max(this.stance, 0.6);
    const twin = LOADOUT[this.cls].twin === 'melee';
    if (twin) this.swingSide = this.swingSide === 0 ? 1 : 0;
    else this.swingSide = 0;
  }

  dispose() {
    for (const n of Object.values(this.nodes)) n.dispose(false, false);
    this.backNode?.dispose(false, false);
    for (const g of this.alt) g.node.dispose(false, false);
  }

  private handLocal(side: 0 | 1, out: Vector3): boolean {
    this.findHands();
    const bone = side === 0 ? this.hands.r : this.hands.l;
    if (!bone) return false;
    this.root.computeWorldMatrix(true);
    const inv = Matrix.Invert(this.root.getWorldMatrix());
    Vector3.TransformCoordinatesToRef(bone.getAbsolutePosition(), inv, out);
    return true;
  }

  update(s: RigState) {
    const dt = s.dt;
    this.time += dt;
    const named = rigHooks.named();
    if ((named ? `${named.hand}-${named.gem}` : '') !== this.namedKey) this.forge();
    const g = s.gauge;
    const lo = LOADOUT[this.cls];

    // Shots and throws, read from the class state.
    if (g.ammo !== undefined && this.last.ammo !== undefined && g.ammo < this.last.ammo) this.kick = 1;
    if (g.heat !== undefined && this.last.heat !== undefined && g.heat > this.last.heat + 0.01) this.kick = 0.6;
    if (g.spears !== undefined && this.last.spears !== undefined && g.spears < this.last.spears) this.throwT = 0;
    if (g.shotgun !== undefined && this.last.shotgun !== undefined && g.shotgun < this.last.shotgun) this.kick = 1;
    this.last = { ...g };
    // The shotgun stays in hand a moment after the last blast.
    this.altShown = (g.shotgun ?? 0) > 0 ? 0.35 : Math.max(0, this.altShown - dt);
    const altOn = this.altShown > 0;
    for (const n of Object.values(this.nodes)) n.getChildren().forEach((c) => (c as TransformNode).setEnabled(!altOn));
    for (const a of this.alt) a.node.setEnabled(altOn && (a.side === 0 || !!g.shotgunDual));
    if (this.kick > 0.5 || this.throwT < 0.1) this.stance = Math.max(this.stance, 0.8);

    // Stance: ready while aiming or attacking, back to rest after a moment.
    const wantReady = s.ready || this.swingT < 0.8 || this.kick > 0.05 || this.throwT < 0.6;
    this.stance = Math.max(0, Math.min(1, this.stance + (wantReady ? dt * 7 : -dt * 2.2)));
    const st = this.stance * this.stance * (3 - 2 * this.stance);
    this.swingT += dt;
    this.throwT += dt;
    this.kick = Math.max(0, this.kick - dt * 7);

    const hp = new Vector3();
    for (const h of ['ranged', 'melee'] as Hand[]) {
      for (const grip of this.grips[h]) {
        const H = HOLD[grip.design];
        const ready = mirror(H.ready, grip.side);
        let rx = ready[0];
        let ry = ready[1];
        let rz = ready[2];
        if (this.handLocal(grip.side, hp)) {
          rx = lerp(hp.x * 0.92, rx, st);
          ry = lerp(hp.y + 0.02, ry, st);
          rz = lerp(hp.z + 0.06, rz, st);
        }
        grip.node.position.set(rx, ry, rz);
        const readyPitch = h === 'ranged' ? -s.pitch : (H.readyPitch ?? 0) - s.pitch * 0.4;
        grip.node.rotation.set(lerp(H.restPitch, readyPitch, st), grip.side === 0 ? -0.04 : 0.04, 0);
        this.animate(h, grip, dt);
      }
    }

    for (const grip of this.alt) {
      if (!grip.node.isEnabled(false)) continue;
      const H = HOLD.shotgun;
      grip.node.position.set(...mirror(H.ready, grip.side));
      grip.node.rotation.set(-s.pitch, 0, 0);
      grip.hold.position.z = -0.09 * this.kick;
      grip.hold.rotation.x = -0.4 * this.kick;
      for (let i = 0; i < 2; i++) grip.w.mats[`shell${i}`]?.emissiveColor.copyFrom(Color3.FromHexString(i < (g.shotgun ?? 0) ? '#ffd27a' : '#3a2a10'));
    }

    // Class state on the weapons.
    this.showState(g, lo.ranged);
  }

  /** Attack motion on the hold node (between the grip and the weapon). */
  private animate(h: Hand, grip: Grip, _dt: number) {
    const hold = grip.hold;
    hold.position.setAll(0);
    hold.rotation.setAll(0);
    if (h === 'ranged') {
      if (grip.design === 'spear') {
        // Throw: the spear goes forward and vanishes, a new one comes up from the quiver.
        const t = this.throwT;
        hold.position.z = t < 0.12 ? (t / 0.12) * 0.35 : 0;
        hold.scaling.setAll(t < 0.12 ? 1 : t < 0.35 ? 0.001 : Math.min(1, (t - 0.35) / 0.15));
        return;
      }
      const k = this.kick;
      const strength = grip.design === 'rifle' ? 1.4 : grip.design === 'pen' ? 0.5 : 1;
      hold.position.z = -0.07 * k * strength;
      hold.rotation.x = -0.28 * k * strength;
      return;
    }
    // Melee swings.
    const twin = LOADOUT[this.cls].twin === 'melee';
    const active = !twin || grip.side === this.swingSide;
    const D = grip.design === 'sword' ? 0.26 : grip.design === 'lantern' ? 0.32 : 0.18;
    const t = this.swingT / D;
    if (!active || t >= 1.6) return;
    // Out fast, back slower.
    const k = t < 1 ? Math.sin((t * Math.PI) / 2) : 1 - (t - 1) / 0.6;
    const a = t < 1 ? t : 1;
    const dir = grip.side === 0 ? 1 : -1;
    switch (grip.design) {
      case 'sword':
        hold.rotation.y = dir * lerp(1.3, -1.25, a) * Math.min(1, k * 1.5);
        hold.rotation.x = 0.75 * k;
        break;
      case 'lantern':
        hold.rotation.x = 1.5 * k;
        hold.position.z = 0.1 * k;
        break;
      case 'dagger':
        hold.rotation.y = dir * lerp(0.9, -0.8, a) * k;
        hold.rotation.z = dir * 0.6 * k;
        hold.position.z = 0.12 * k;
        break;
      case 'claw':
        hold.position.z = 0.28 * k;
        hold.rotation.y = dir * -0.25 * k;
        hold.rotation.x = 0.2 * k;
        break;
    }
  }

  private showState(g: Gauge, ranged: DesignId) {
    const glow = Color3.FromHexString(CLASS_GLOW[this.cls]);
    const dark = glow.scale(0.12);
    const parts = (h: Hand) => this.grips[h].map((x) => x.w);
    for (const w of parts('ranged')) {
      // Rogue: one light per bullet.
      if (ranged === 'pistol') {
        const mag = Math.min(8, g.mag ?? 6);
        for (let i = 0; i < 8; i++) {
          const n = w.parts[`ammo${i}`];
          const m = w.mats[`ammo${i}`];
          if (!n || !m) continue;
          n.setEnabled(i < mag);
          const lit = g.reloading ? Math.floor(this.time * 10) % mag === i : i < (g.ammo ?? mag);
          m.emissiveColor.copyFrom(lit ? glow : dark);
        }
      }
      // Mage: the crystal and the vent ring heat from blue to orange; red blink when overheated.
      if (ranged === 'pen') {
        const heat = g.heat ?? 0;
        const hot = Color3.FromHexString('#ff7a3b');
        const c = g.overheated ? (Math.floor(this.time * 8) % 2 ? Color3.FromHexString('#ff3b3b') : dark) : Color3.Lerp(glow, hot, heat);
        w.mats.core?.emissiveColor.copyFrom(c);
        w.mats.heat?.emissiveColor.copyFrom(Color3.Lerp(dark, hot, Math.min(1, heat * 1.3)));
      }
      // Scout: three ticks and the lens fill with the charge.
      if (ranged === 'rifle') {
        const c = g.charge ?? 0;
        for (let i = 0; i < 3; i++) w.mats[`tick${i}`]?.emissiveColor.copyFrom(c >= (i + 1) / 3 - 0.01 ? glow : dark);
        w.mats.lens?.emissiveColor.copyFrom(Color3.Lerp(dark, Color3.White(), 0.25 + c * 0.75).multiply(c >= 0.99 ? Color3.White() : glow));
      }
      // Fighter: the spear in hand is only there if one is left.
      if (ranged === 'spear') w.root.setEnabled((g.spears ?? 1) > 0);
    }
    for (const grip of this.grips.melee) {
      const w = grip.w;
      // Mage: nano orbs circle the lantern, one per orb.
      const orbs = w.parts.orbs;
      if (orbs) {
        const n = Math.min(8, g.orbs ?? 0);
        orbs.rotation.z = this.time * 1.8;
        for (let i = 0; i < 8; i++) {
          const o = w.parts[`orb${i}`];
          if (!o) continue;
          o.setEnabled(i < n);
          o.rotation.z = (i / Math.max(1, n)) * Math.PI * 2;
          o.position.z = Math.sin(this.time * 3 + i) * 0.04;
        }
        if (w.parts.gyro) w.parts.gyro.rotation.z += 0.025;
        if (w.parts.gyro2) w.parts.gyro2.rotation.x += 0.04;
        const pulse = 0.75 + Math.sin(this.time * 4) * 0.25;
        w.mats.core?.emissiveColor.copyFrom(glow.scale(pulse));
      }
      // Fighter: the left sword only shows while the second blade is out.
      if (grip.design === 'sword' && grip.side === 1) grip.node.setEnabled(!!g.dual);
      // Longbeam's lighthouse lamp blinks slowly.
      if (w.mats.lamp) w.mats.lamp.emissiveColor.copyFrom(glow.scale(Math.sin(this.time * 2) > 0.6 ? 1.4 : 0.35));
    }
    // Spare spears in the quiver.
    if (this.back) {
      const spare = Math.max(0, (g.spears ?? 1) - 1);
      for (let i = 0; i < 6; i++) this.back.parts[`q${i}`]?.setEnabled(i < spare);
    }
  }
}

/** Hang a quiver on the back: mouth up and a little back, leaning toward the right shoulder. */
function onBack(scene: Scene, root: TransformNode, w: Forged) {
  const n = new TransformNode('back-slot', scene);
  n.parent = root;
  n.position.set(0.1, 1.28, -0.34);
  n.rotation.z = BACK_LEAN;
  w.root.parent = n;
  w.root.scaling.setAll(SCALE * 1.15);
  w.root.rotation.x = -1.85;
  return n;
}
export const BACK_LEAN = -0.4;
/** The hippo body is broad: weapons are made a bit larger than life so they read on screen. */
const SCALE = 1.25;

let rig: WeaponRig | null = null;

/** Build the player's weapons on the body root. Returns the ranged and melee nodes (main shows one). */
export function armPlayer(scene: Scene, root: TransformNode, cls: ClassId): Record<Hand, TransformNode> {
  rig?.dispose();
  rig = new WeaponRig(scene, root, cls);
  return rig.nodes;
}

export function rigReparent(root: TransformNode) {
  rig?.reparent(root);
}

export function rigSwing() {
  rig?.swing();
}

export function updateRig(s: RigState) {
  rig?.update(s);
}

/**
 * A still copy of the weapon in hand for the Rogue's decoys (they must look like the player),
 * held in the ready pose.
 */
export function dressDecoy(scene: Scene, root: TransformNode, cls: ClassId, hand: Hand) {
  const lo = LOADOUT[cls];
  const named = rigHooks.named();
  const sides: (0 | 1)[] = lo.twin === hand ? [0, 1] : [0];
  for (const side of sides) {
    const design = lo[hand];
    const w = forgeWeapon(scene, design, cls, getSpecies(), { named: named?.hand === hand, gem: named?.hand === hand ? named.gem : undefined, side });
    const H = HOLD[design];
    const node = new TransformNode('decoy-grip', scene);
    node.parent = root;
    node.position.set(...mirror(H.ready, side));
    node.rotation.x = hand === 'ranged' ? 0.05 : (H.readyPitch ?? 0);
    w.root.parent = node;
    w.root.scaling.setAll(SCALE);
    if (H.tilt) w.root.rotation.set(...H.tilt);
    if (H.offset) w.root.position.set(...H.offset);
    for (const m of w.root.getChildMeshes()) m.isPickable = false;
  }
  if (lo.back) {
    onBack(scene, root, forgeWeapon(scene, lo.back, cls, getSpecies(), { named: false }));
  }
}
