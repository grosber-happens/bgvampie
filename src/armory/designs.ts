import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Forge } from './forge';
import type { Species } from './species';

/**
 * The eight class weapons, built from forge parts. Each design is the workshop version; the
 * named item (Fısıltı, İkiz Ay, Soğuk Mercek…) adds its own ornament when it is worn, and the
 * item's rarity shows as a small gem. The species decides metal, thickness and a trinket.
 *
 * Weapon space: +Z forward, +Y up, origin in the hand.
 */

export type DesignId = 'pistol' | 'dagger' | 'pen' | 'lantern' | 'sword' | 'spear' | 'quiver' | 'rifle' | 'claw' | 'shotgun';
export type DesignOpts = { named: boolean; gem?: string; /** Twin weapons: 0 right hand, 1 left hand. */ side?: 0 | 1 };

type V3 = [number, number, number];
const PI = Math.PI;

function gem(f: Forge, o: DesignOpts, pos: V3, parent?: TransformNode, d = 0.022) {
  if (!o.gem) return;
  f.gem = o.gem;
  f.ball('gem', d, pos, { parent, live: 'gem', seg: 6 });
  f.ring('accent', d * 1.25, 0.005, pos, { parent, rot: [PI / 2, 0, 0] });
}

// ---- Rogue: Islak Sokak Tabancası (wet street pistol) -------------------------------------
/**
 * A long, quiet duelling pistol: curved grip, slim receiver, a fluted silencer, and one small
 * light per bullet along the side (they go dark as the magazine empties).
 */
function pistol(f: Forge, sp: Species, o: DesignOpts) {
  // Grip curves down and back, with a ball pommel.
  f.tube('grip', [[0, 0.03, 0.03], [0, -0.03, 0.01], [0, -0.09, -0.015], [0, -0.135, -0.045]], 0.021, 0.025);
  f.ball('metal', 0.048, [0, -0.145, -0.05]);
  // Receiver, rail, hammer.
  f.box('metal', [0.042, 0.064, 0.17], [0, 0.05, 0.055]);
  f.box('dark', [0.018, 0.014, 0.2], [0, 0.088, 0.065]);
  f.tube('metal2', [[0, 0.07, -0.03], [0, 0.1, -0.05], [0, 0.115, -0.04]], 0.008, 0.006);
  // Trigger guard and trigger.
  f.tube('metal2', Forge.arc(0.035, PI * 0.95, PI * 2.05, 10, 'yz', [0, 0.02, 0.05]), 0.005);
  f.box('dark', [0.006, 0.03, 0.008], [0, 0.0, 0.055], [0.3, 0, 0]);
  // Barrel and silencer with bands.
  f.rod('metal', 0.14, 0.034, [0, 0.055, 0.2]);
  f.turned('metal2', [[0.0, 0], [0.017, 0.002], [0.026, 0.014], [0.027, 0.18], [0.022, 0.2], [0.008, 0.205]], [0, 0.055, 0.265]);
  for (const z of [0.29, 0.36, 0.43]) f.ring('accent', 0.056, 0.006, [0, 0.055, z]);
  // Sights.
  f.box('glow', [0.008, 0.012, 0.01], [0, 0.1, 0.15], undefined, { keepThick: true });
  f.box('dark', [0.026, 0.014, 0.012], [0, 0.1, -0.015]);
  // Ammo lights: up to 8 along the left side of the receiver.
  for (let i = 0; i < 8; i++) f.ball('glow', 0.012, [-0.024 * f.thick, 0.035 + (i % 2) * 0.016, 0.0 + Math.floor(i / 2) * 0.034], { live: `ammo${i}`, seg: 6 });
  sp.trinket(f, f.socket('trinket', [0.026 * f.thick, 0.04, 0.06], [0, 0, -PI / 2]), 0.8);
  gem(f, o, [0, -0.05, -0.002]);
  if (o.named) {
    // Fısıltı: a violin maker's silencer: a scroll at the muzzle and two f-holes.
    const scroll: V3[] = [];
    for (let i = 0; i <= 30; i++) {
      const a = (i / 30) * PI * 3.2;
      const r = 0.03 * (1 - i / 38);
      scroll.push([0, 0.055 + Math.sin(a) * r + 0.03, 0.47 + (1 - Math.cos(a)) * r * 0.6]);
    }
    f.tube('bone', scroll, 0.007, 0.004);
    for (const s of [-1, 1]) f.tube('dark', [[s * 0.027, 0.07, 0.32], [s * 0.028, 0.06, 0.35], [s * 0.027, 0.05, 0.38]], 0.003);
  }
}

// ---- Rogue: Ay Kırığı Hançerler (moonshard daggers) --------------------------------------
/** One laser dagger: a wrapped grip, a fork that holds the light, a shard-shaped blade. */
function dagger(f: Forge, sp: Species, o: DesignOpts) {
  f.rod('grip', 0.12, 0.03, [0, 0, 0], { dFront: 0.028 });
  for (const z of [-0.04, 0, 0.04]) f.ring('accent', 0.034, 0.005, [0, 0, z]);
  f.turned('metal', [[0, -0.1], [0.022, -0.09], [0.018, -0.07], [0.014, -0.06]], [0, 0, 0]);
  // The emitter fork.
  f.box('metal', [0.1, 0.02, 0.024], [0, 0, 0.068]);
  for (const s of [-1, 1]) f.tube('metal2', [[s * 0.045, 0, 0.07], [s * 0.04, 0, 0.12], [s * 0.026, 0, 0.17]], 0.007, 0.004);
  // The shard: uneven like broken glass.
  const shard: [number, number, number?][] = [[0, 0.02], [0.06, 0.027, 0.002], [0.18, 0.024, -0.003], [0.27, 0.018, 0.004], [0.36, 0.009, 0], [0.4, 0]];
  f.blade('glow', shard, 0.012, [0, 0, 0.075]);
  f.blade('halo', shard.map(([z, w, b]) => [z, w * 1.8 + 0.006, b] as [number, number, number?]), 0.03, [0, 0, 0.07]);
  sp.trinket(f, f.socket('trinket', [0, -0.02, -0.02], [PI, 0, 0]), 0.55);
  gem(f, o, [0, 0.016, 0.068], undefined, 0.016);
  if (o.named) {
    if ((o.side ?? 0) === 0) {
      // İkiz Ay: the full moon, a coin-shaped guard with a glowing rim.
      f.rod('bone', 0.012, 0.11, [0, 0, 0.06]);
      f.ring('glow', 0.11, 0.006, [0, 0, 0.06]);
    } else {
      // …and the crescent.
      const c: V3[] = [];
      for (let i = 0; i <= 14; i++) {
        const a = PI * 0.15 + (i / 14) * PI * 1.1;
        c.push([Math.cos(a) * 0.055, Math.sin(a) * 0.055 - 0.01, 0.06]);
      }
      f.tube('bone', c, 0.012, 0.003);
    }
  }
}

// ---- Mage: Işık Kalemi (light pen) ---------------------------------------------------------
/**
 * A wand made like a fountain pen: a turned barrel, a clip, and a nib-shaped cage around a
 * crystal. The crystal and a ring of vents heat up as the wand fires.
 */
function pen(f: Forge, sp: Species, o: DesignOpts) {
  f.turned('bone', [[0, -0.14], [0.012, -0.138], [0.019, -0.12], [0.021, -0.02], [0.019, 0.12], [0.016, 0.2], [0.012, 0.23]], [0, 0, 0]);
  f.rod('grip', 0.11, 0.044, [0, 0, -0.04]);
  for (const z of [-0.1, 0.02, 0.12]) f.ring('accent', 0.044, 0.007, [0, 0, z]);
  // The pen clip.
  f.tube('metal', [[0, 0.02, -0.12], [0, 0.03, -0.11], [0, 0.03, 0.0], [0, 0.024, 0.02]], 0.005);
  // Heat vents.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * PI * 2 + PI / 4;
    f.box('metal2', [0.006, 0.03, 0.04], [Math.cos(a) * 0.022, Math.sin(a) * 0.022, 0.17], [0, 0, a + PI / 2]);
  }
  f.ring('glow', 0.04, 0.008, [0, 0, 0.2], { live: 'heat' });
  // The nib cage: three bent prongs closing around the crystal.
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * PI * 2;
    const r = (k: number) => [Math.cos(a) * k, Math.sin(a) * k] as const;
    const p = [0.014, 0.034, 0.036, 0.022, 0.004].map((k, j) => [...r(k), 0.22 + j * 0.035] as V3);
    f.tube('metal', p, 0.0055, 0.0025);
  }
  f.ball('glow', 0.04, [0, 0, 0.285], { scale: [1, 1, 1.5], live: 'core' });
  f.ball('halo', 0.075, [0, 0, 0.285], { scale: [1, 1, 1.3] });
  sp.trinket(f, f.socket('trinket', [0, -0.024, -0.07], [PI, 0, 0]), 0.6);
  gem(f, o, [0, 0.024, 0.08], undefined, 0.016);
  if (o.named) {
    // Soğuk Mercek: a lens of glacier ice held in front of the crystal.
    f.rod('glass', 0.008, 0.075, [0, 0, 0.375]);
    f.ring('metal', 0.078, 0.007, [0, 0, 0.375]);
    for (const s of [-1, 1]) f.tube('metal', [[s * 0.012, 0, 0.36], [s * 0.035, 0, 0.37]], 0.003);
  }
}

// ---- Mage: Fener Asası (lantern staff) --------------------------------------------------------
/**
 * A long staff with a lantern on top: a crown of bent ribs, a nano core inside, two gyroscope
 * rings that spin, and the Mage's nano orbs circling the lantern (one light per orb).
 */
function lantern(f: Forge, sp: Species, o: DesignOpts) {
  f.turned('metal2', [[0, -0.66], [0.016, -0.65], [0.022, -0.55], [0.018, -0.3], [0.023, -0.05], [0.018, 0.4], [0.024, 0.8], [0.02, 0.86]], [0, 0, 0]);
  f.turned('metal', [[0, -0.74], [0.012, -0.72], [0.024, -0.66], [0.022, -0.6]], [0, 0, 0]);
  f.rod('grip', 0.22, 0.052, [0, 0, 0.0]);
  for (const z of [-0.11, 0.11, 0.42, 0.78]) f.ring('accent', 0.05, 0.009, [0, 0, z]);
  // Lantern crown.
  f.turned('metal', [[0.02, 0.84], [0.05, 0.88], [0.052, 0.9], [0.03, 0.91]], [0, 0, 0]);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * PI * 2;
    const p = [0.045, 0.085, 0.09, 0.07, 0.02].map((k, j) => [Math.cos(a) * k, Math.sin(a) * k, 0.9 + j * 0.06] as V3);
    f.tube('metal', p, 0.008, 0.005);
  }
  f.turned('metal', [[0.03, 1.13], [0.04, 1.14], [0.02, 1.17], [0.0, 1.2]], [0, 0, 0]);
  f.ring('metal', 0.03, 0.01, [0, 0, 1.22], { rot: [0, PI / 2, 0] });
  f.ball('glow', 0.085, [0, 0, 1.02], { live: 'core' });
  f.ball('halo', 0.16, [0, 0, 1.02]);
  // Gyroscope rings around the lantern.
  const gyro = f.group('gyro', [0, 0, 1.02]);
  f.ring('accent', 0.25, 0.008, [0, 0, 0], { parent: gyro });
  const gyro2 = f.group('gyro2', [0, 0, 0], [0, PI / 2, 0], gyro);
  f.ring('metal', 0.21, 0.007, [0, 0, 0], { parent: gyro2 });
  // Nano orbs (shown by the rig, one per orb the Mage holds).
  const orbs = f.group('orbs', [0, 0, 1.02]);
  for (let i = 0; i < 8; i++) f.ball('glow', 0.03, [0.17, 0, 0], { parent: f.group(`orb${i}`, [0, 0, 0], [0, 0, 0], orbs), live: `orbBall${i}`, seg: 6 });
  sp.trinket(f, f.socket('trinket', [0, 0.03, 0.3], [-PI / 2, 0, 0]), 0.9);
  gem(f, o, [0, 0.03, 0.12], undefined, 0.024);
  if (o.named) {
    // Ağırlık Asası: a plumb bob of neutron star dust hangs from the crown on a chain.
    const chain: V3[] = [[0.05, 0, 0.9], [0.09, 0, 0.86], [0.11, 0, 0.8], [0.115, 0, 0.74]];
    f.tube('dark', chain, 0.004);
    f.turned('dark', [[0, 0.0], [0.035, 0.03], [0.03, 0.06], [0.008, 0.075]], [0.115, 0, 0.66], { rot: [0, 0, 0] });
    for (let i = 0; i < 5; i++) f.ball('glow', 0.008, [0.115 + Math.cos(i * 1.3) * 0.02, Math.sin(i * 1.3) * 0.02, 0.68 + i * 0.008], { seg: 4 });
  }
}

// ---- Fighter: Şafak Kılıcı (dawn blade) -------------------------------------------------------
/** A laser sword: long wrapped hilt, a finned emitter, a wide blade of light with a soft halo. */
function sword(f: Forge, sp: Species, o: DesignOpts) {
  f.rod('grip', 0.24, 0.044, [0, 0, 0]);
  for (const z of [-0.08, -0.03, 0.02, 0.07]) f.ring('accent', 0.048, 0.006, [0, 0, z]);
  f.turned('metal', [[0, -0.2], [0.03, -0.19], [0.036, -0.16], [0.026, -0.13], [0.024, -0.12]], [0, 0, 0]);
  // Emitter: a block with two swept fins, like a sunrise.
  f.box('metal', [0.17, 0.05, 0.07], [0, 0, 0.15]);
  for (const s of [-1, 1]) f.tube('metal2', [[s * 0.08, 0, 0.14], [s * 0.13, 0.0, 0.16], [s * 0.15, 0, 0.21]], 0.016, 0.006);
  for (let i = -2; i <= 2; i++) f.box('metal2', [0.012, 0.012, 0.04], [i * 0.028, 0.03, 0.17], [0, 0, 0]);
  f.turned('dark', [[0.03, 0.18], [0.034, 0.19], [0.026, 0.21]], [0, 0, 0]);
  const blade: [number, number, number?][] = [[0, 0.03], [0.1, 0.04], [0.5, 0.038], [0.85, 0.032], [1.02, 0.018], [1.12, 0]];
  f.blade('glow', blade, 0.018, [0, 0, 0.21]);
  f.blade('halo', blade.map(([z, w, b]) => [z, w * 1.6 + 0.01, b] as [number, number, number?]), 0.045, [0, 0, 0.2]);
  sp.trinket(f, f.socket('trinket', [0, 0.026, 0.15], [0, 0, 0]), 0.75);
  gem(f, o, [0, -0.03, 0.15]);
  if (o.named) {
    // Uzun Işın: the pommel is a little lighthouse with a turning lamp.
    f.turned('bone', [[0.03, -0.2], [0.028, -0.28], [0.02, -0.33]], [0, 0, 0]);
    for (const z of [-0.23, -0.29]) f.ring('accent', 0.056, 0.008, [0, 0, z]);
    f.rod('glass', 0.04, 0.036, [0, 0, -0.35]);
    f.ball('glow', 0.024, [0, 0, -0.35], { live: 'lamp' });
    f.turned('metal', [[0.026, -0.37], [0.03, -0.375], [0.0, -0.41]], [0, 0, 0]);
  }
}

// ---- Fighter: Yıldırım Mızrakları (lightning spears) -------------------------------------------
/** One energy spear: banded shaft, a leaf head of light, tail fins. */
function spear(f: Forge, sp: Species, o: DesignOpts, quiet = false) {
  f.rod('metal2', 1.4, 0.03, [0, 0, 0.1], { dFront: 0.026 });
  for (let z = -0.45; z <= 0.65; z += 0.22) f.ring('accent', 0.034, 0.006, [0, 0, z]);
  if (!quiet) f.rod('grip', 0.2, 0.04, [0, 0, 0]);
  const head = f.group('head', [0, 0, 0.8]);
  f.turned('metal', [[0.015, 0], [0.026, 0.03], [0.02, 0.07], [0.012, 0.08]], [0, 0, 0], { parent: head });
  const leaf: [number, number, number?][] = [[0, 0.015], [0.05, 0.045], [0.14, 0.04], [0.24, 0.016], [0.3, 0]];
  f.blade('glow', leaf, 0.016, [0, 0, 0.07], { parent: head });
  f.blade('halo', leaf.map(([z, w, b]) => [z, w * 1.7 + 0.008, b] as [number, number, number?]), 0.04, [0, 0, 0.06], { parent: head });
  // Tail fins and a glowing bead.
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * PI * 2;
    f.box('metal', [0.004, 0.05, 0.1], [Math.cos(a) * 0.025, Math.sin(a) * 0.025, -0.54], [0, 0, a + PI / 2], { keepThick: true });
  }
  f.ball('glow', 0.026, [0, 0, -0.62]);
  if (!quiet) {
    sp.trinket(f, f.socket('trinket', [0, 0.02, 0.2], [0, 0, 0]), 0.7);
    gem(f, o, [0, 0.022, -0.12]);
  }
}

/** The quiver on the Fighter's back, with one spear per spear left (not counting the one in hand). */
function quiver(f: Forge, sp: Species, o: DesignOpts) {
  f.turned('metal2', [[0.0, -0.32], [0.07, -0.31], [0.08, -0.25], [0.075, 0.2], [0.085, 0.24], [0.08, 0.26]], [0, 0, 0]);
  f.ring('metal', 0.17, 0.016, [0, 0, 0.25]);
  for (const z of [-0.2, 0.05]) f.ring('grip', 0.165, 0.02, [0, 0, z]);
  // Strap.
  f.tube('grip', [[0.08, -0.02, 0.1], [0.2, 0.06, 0.05], [0.3, 0.1, -0.2], [0.24, 0.05, -0.45]], 0.012);
  // Spear stubs: shafts with heads, up to six.
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * PI * 2;
    const g = f.group(`q${i}`, [Math.cos(a) * 0.04, Math.sin(a) * 0.04, 0.3], [Math.sin(a) * 0.08, -Math.cos(a) * 0.08, 0]);
    f.rod('metal2', 0.3, 0.024, [0, 0, 0], { parent: g });
    f.blade('glow', [[0, 0.012], [0.04, 0.03], [0.12, 0.012], [0.16, 0]], 0.012, [0, 0, 0.15], { parent: g });
  }
  sp.trinket(f, f.socket('trinket', [0.08, 0, -0.05], [0, 0, -PI / 2]), 1);
  if (o.named) {
    // Dörtlü Sadak: four oath rings around the mouth and a gem.
    for (let i = 0; i < 4; i++) f.ring('accent', 0.06, 0.01, [Math.cos(i * PI / 2) * 0.09, Math.sin(i * PI / 2) * 0.09, 0.2], { rot: [0, PI / 2, i * PI / 2] });
    gem(f, o, [0, 0.085, 0.1], undefined, 0.03);
  }
}

// ---- Scout: Uzak Göz (far eye) -------------------------------------------------------------
/** A long rifle: stock, bolt, long barrel and brake, a scope whose lens and three ticks show the charge. */
function rifle(f: Forge, sp: Species, o: DesignOpts) {
  // Stock and pistol grip.
  f.tube('grip', [[0, 0.02, -0.02], [0, 0.0, -0.18], [0, -0.04, -0.34], [0, -0.06, -0.44]], 0.032, 0.05);
  f.box('metal', [0.05, 0.13, 0.025], [0, -0.06, -0.46], [0.15, 0, 0]);
  f.tube('grip', [[0, 0.02, 0.02], [0, -0.05, 0.0], [0, -0.11, -0.03]], 0.02, 0.023);
  // Receiver and bolt.
  f.box('metal', [0.055, 0.075, 0.32], [0, 0.04, 0.13]);
  f.tube('metal2', [[0.03, 0.06, 0.05], [0.07, 0.06, 0.04], [0.08, 0.04, 0.03]], 0.008);
  f.ball('metal2', 0.024, [0.08, 0.04, 0.03]);
  f.tube('metal2', Forge.arc(0.03, PI * 0.95, PI * 2.05, 10, 'yz', [0, -0.005, 0.08]), 0.005);
  // Barrel, fore-end, brake.
  f.box('grip', [0.05, 0.05, 0.3], [0, 0.02, 0.42]);
  f.rod('metal', 0.72, 0.032, [0, 0.045, 0.62], { dFront: 0.028 });
  f.turned('metal', [[0.018, 0.96], [0.026, 0.97], [0.026, 1.05], [0.02, 1.06]], [0, 0.045, 0]);
  for (const z of [0.99, 1.02]) for (const s of [-1, 1]) f.box('dark', [0.004, 0.02, 0.012], [s * 0.025, 0.045, z], undefined, { keepThick: true });
  // Folded bipod.
  for (const s of [-1, 1]) f.rod('metal2', 0.28, 0.01, [s * 0.016, 0.0, 0.66], { rot: [0, s * 0.04, 0] });
  // Charge ticks on top of the barrel.
  for (let i = 0; i < 3; i++) f.box('glow', [0.012, 0.008, 0.03], [0, 0.065, 0.48 + i * 0.05], undefined, { live: `tick${i}`, keepThick: true });
  // Scope.
  const scope = f.group('scope', [0, 0.115, 0.12]);
  f.rod('dark', 0.3, 0.042, [0, 0, 0], { parent: scope });
  f.turned('dark', [[0.021, 0.15], [0.03, 0.17], [0.032, 0.22], [0.03, 0.225]], [0, 0, 0], { parent: scope });
  f.turned('dark', [[0.03, -0.205], [0.028, -0.19], [0.021, -0.15]], [0, 0, 0], { parent: scope });
  f.rod('glow', 0.006, 0.054, [0, 0, 0.222], { parent: scope, live: 'lens' });
  for (const z of [-0.07, 0.07]) {
    f.ring('metal', 0.05, 0.008, [0, 0, z], { parent: scope });
    f.box('metal', [0.012, 0.05, 0.016], [0, -0.035, z], undefined, { parent: scope });
  }
  f.rod('metal2', 0.02, 0.02, [0, 0.03, 0], { parent: scope, rot: [-PI / 2, 0, 0] });
  sp.trinket(f, f.socket('trinket', [-0.03 * f.thick, 0.03, 0.42], [0, 0, PI / 2]), 0.9);
  gem(f, o, [0, -0.02, -0.25]);
  if (o.named) {
    // Sabırlı Dürbün: a brass sun shade on the scope and the sparrow that its maker watched.
    f.rod('accent', 0.1, 0.07, [0, 0, 0.27], { parent: scope, dFront: 0.074 });
    const bird = f.group('sparrow', [0, 0.03, -0.03], [0, 0.3, 0], scope);
    f.ball('bone', 0.045, [0, 0.02, 0], { parent: bird, scale: [0.9, 0.85, 1.3] });
    f.ball('metal2', 0.03, [0, 0.042, 0.03], { parent: bird });
    f.rod('accent', 0.02, 0.012, [0, 0.04, 0.054], { parent: bird, dFront: 0.001 });
    f.box('metal2', [0.025, 0.004, 0.04], [0, 0.03, -0.04], [-0.4, 0, 0], { parent: bird, keepThick: true });
    f.ball('dark', 0.006, [0.012, 0.048, 0.04], { parent: bird, seg: 4 });
  }
}

// ---- Scout skill: Switch weapons (a short two-shot shotgun) ------------------------------------
/** A sawn-off double barrel with a pistol grip and two shell lights. */
function shotgun(f: Forge, sp: Species, o: DesignOpts) {
  f.tube('grip', [[0, 0.02, 0.0], [0, -0.04, -0.03], [0, -0.1, -0.07]], 0.024, 0.03);
  f.box('metal', [0.07, 0.07, 0.14], [0, 0.04, 0.05]);
  for (const s of [-1, 1]) {
    f.rod('metal', 0.36, 0.034, [s * 0.018, 0.05, 0.3]);
    f.ring('dark', 0.036, 0.006, [s * 0.018, 0.05, 0.48]);
  }
  f.box('grip', [0.06, 0.04, 0.16], [0, 0.015, 0.25]);
  f.tube('metal2', Forge.arc(0.03, PI * 0.95, PI * 2.05, 10, 'yz', [0, 0.0, 0.05]), 0.005);
  for (let i = 0; i < 2; i++) f.box('glow', [0.014, 0.014, 0.03], [-0.038 * f.thick, 0.04, 0.02 + i * 0.045], undefined, { live: `shell${i}`, keepThick: true });
  sp.trinket(f, f.socket('trinket', [0.036 * f.thick, 0.04, 0.05], [0, 0, -PI / 2]), 0.7);
  void o;
}

// ---- Scout: Kedi Tırnakları (cat nails) ---------------------------------------------------------
/** A clawed gauntlet: a bracer on the forearm, a knuckle plate and three curved nails. */
function claw(f: Forge, sp: Species, o: DesignOpts) {
  const side = (o.side ?? 0) === 0 ? 1 : -1;
  f.turned('metal2', [[0.042, -0.28], [0.05, -0.26], [0.052, -0.06], [0.045, -0.03]], [0, 0, 0]);
  for (const z of [-0.24, -0.16, -0.08]) f.ring('grip', 0.1, 0.01, [0, 0, z]);
  f.box('metal', [0.1, 0.03, 0.07], [0, 0.02, 0.01]);
  for (let i = 0; i < 3; i++) {
    const x = (i - 1) * 0.034;
    const pts: V3[] = [[x, 0.02, 0.03], [x, 0.03, 0.12], [x * 1.1, 0.01, 0.22], [x * 1.2, -0.04, 0.3]];
    if (o.named) pts.push([x * 1.2, -0.08, 0.31], [x * 1.2, -0.085, 0.285]);
    f.tube('metal', pts, 0.012, 0.003);
    f.tube('glow', pts.slice(1).map(([a, b, c]) => [a, b + 0.009, c] as V3), 0.004, 0.001);
  }
  sp.trinket(f, f.socket('trinket', [side * 0.05 * f.thick, 0, -0.16], [0, 0, -side * PI / 2]), 0.8);
  gem(f, o, [0, 0.04, 0.0], undefined, 0.018);
  if (o.named) {
    // Kanca Pençe: a wolf tooth charm hanging from the bracer.
    f.tube('dark', [[side * 0.05, -0.02, -0.1], [side * 0.06, -0.06, -0.1]], 0.003);
    f.turned('bone', [[0.012, 0], [0.01, 0.02], [0, 0.045]], [side * 0.06, -0.06, -0.1], { rot: [PI / 2, 0, 0] });
  }
}

export const DESIGNS: Record<DesignId, (f: Forge, sp: Species, o: DesignOpts) => void> = {
  pistol,
  dagger,
  pen,
  lantern,
  sword,
  spear,
  quiver,
  rifle,
  claw,
  shotgun,
};
