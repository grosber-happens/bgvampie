import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Forge, type Palette } from './forge';

/**
 * The three playable species (docs/WORLD.md §11.2). Species give no stats: they only change how
 * a weapon is made. Every class weapon is forged in the species' own workshop style.
 */
export type SpeciesId = 'balcik' | 'yamali' | 'katip';

export type Species = {
  id: SpeciesId;
  name: { tr: string; en: string };
  /** One line for the picker. */
  blurb: { tr: string; en: string };
  palette: Palette;
  /** Chunky frogs, slender insects. */
  thick: number;
  /** The species' signature trinket, hung on a weapon socket. */
  trinket(f: Forge, at: TransformNode, size?: number): void;
};

/** Balçıklar: the Frog Guild's cast brass, rivets and a little pressure gauge. */
const BALCIK: Species = {
  id: 'balcik',
  name: { tr: 'Balçık', en: 'Balçık' },
  blurb: { tr: 'Mekanik kurbağa. Döküm pirinç, perçin, basınç saati.', en: 'Mechanical frog. Cast brass, rivets, a pressure gauge.' },
  palette: { metal: '#b8863b', metal2: '#9c5530', grip: '#46502f', accent: '#5f9e8a', dark: '#2a2622', bone: '#e8d9b8' },
  thick: 1.15,
  trinket(f, at, size = 1) {
    const s = size;
    // A pressure gauge: a brass cup, a bone face, a glowing needle and two rivets.
    f.rod('metal', 0.02 * s, 0.06 * s, [0, 0, 0], { parent: at, rot: [-Math.PI / 2, 0, 0] });
    f.ring('metal2', 0.06 * s, 0.01 * s, [0, 0.011 * s, 0], { parent: at, rot: [-Math.PI / 2, 0, 0] });
    f.rod('bone', 0.004, 0.048 * s, [0, 0.011 * s, 0], { parent: at, rot: [-Math.PI / 2, 0, 0] });
    f.box('glow', [0.004, 0.003, 0.022 * s], [0.005 * s, 0.014 * s, 0.004 * s], [0, 0.6, 0], { parent: at, keepThick: true });
    for (const x of [-1, 1]) f.ball('dark', 0.012 * s, [x * 0.045 * s, 0, 0], { parent: at });
  },
};

/** Yamalılar: patched humans. Blackened steel, a bolted-on plate and a coil of wire. */
const YAMALI: Species = {
  id: 'yamali',
  name: { tr: 'Yamalı', en: 'Yamalı' },
  blurb: { tr: 'Yarı mekanik insan. Kararmış çelik, cıvatalı yama, tel sargı.', en: 'Half-mechanical human. Blackened steel, bolted patches, wire.' },
  palette: { metal: '#4a4a52', metal2: '#8a4b2e', grip: '#c9b48a', accent: '#b23a2e', dark: '#1d1c20', bone: '#d8cfc0' },
  thick: 1,
  trinket(f, at, size = 1) {
    const s = size;
    // A crooked patch plate held by four bolts, and a short coil of red wire.
    f.box('metal2', [0.07 * s, 0.008, 0.06 * s], [0, 0, 0], [0, 0.18, 0.05], { parent: at, keepThick: true });
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) f.ball('dark', 0.011 * s, [x * 0.027 * s, 0.005, z * 0.022 * s], { parent: at });
    const coil: [number, number, number][] = [];
    for (let i = 0; i <= 28; i++) {
      const a = (i / 28) * Math.PI * 6;
      coil.push([Math.cos(a) * 0.012 * s, 0.012 * s + Math.sin(a) * 0.012 * s, -0.045 * s + (i / 28) * 0.05 * s]);
    }
    f.tube('accent', coil, 0.0025, 0.0025, { parent: at, pos: [0.04 * s, 0, 0] });
  },
};

/** Kâtipler: wingless insects. Bone enamel, lace filigree and a feeler with a lamp. */
const KATIP: Species = {
  id: 'katip',
  name: { tr: 'Kâtip', en: 'Kâtip' },
  blurb: { tr: 'Kanatsız böcek. Kemik emaye, kitin, dantel gibi oyma.', en: 'Wingless insect. Bone enamel, chitin, lace-like carving.' },
  palette: { metal: '#ece3cf', metal2: '#2f3d3a', grip: '#6b4f6e', accent: '#c9a14a', dark: '#1c2222', bone: '#f4ecdc' },
  thick: 0.85,
  trinket(f, at, size = 1) {
    const s = size;
    // Two crossed filigree rings and a curled feeler with a tiny lamp at its end.
    f.ring('accent', 0.07 * s, 0.004, [0, 0, 0], { parent: at, rot: [0, 0.5, 0] });
    f.ring('accent', 0.05 * s, 0.004, [0, 0, 0], { parent: at, rot: [0, -0.5, Math.PI / 2] });
    const feeler: [number, number, number][] = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      feeler.push([0, 0.01 * s + t * 0.09 * s, -t * 0.03 * s + Math.sin(t * Math.PI) * 0.02 * s - t * t * 0.03 * s]);
    }
    f.tube('metal2', feeler, 0.004, 0.0015, { parent: at });
    const end = feeler[feeler.length - 1];
    f.ball('glow', 0.016 * s, end, { parent: at });
  },
};

export const SPECIES: Record<SpeciesId, Species> = { balcik: BALCIK, yamali: YAMALI, katip: KATIP };
export const SPECIES_IDS = Object.keys(SPECIES) as SpeciesId[];

const KEY = 'vb.species';
let current: SpeciesId = 'yamali';
try {
  const q = new URLSearchParams(location.search).get('species');
  const saved = localStorage.getItem(KEY);
  if (q && q in SPECIES) current = q as SpeciesId;
  else if (saved && saved in SPECIES) current = saved as SpeciesId;
} catch {
  /* private mode */
}

export const getSpecies = () => SPECIES[current];
export function setSpecies(id: SpeciesId) {
  current = id;
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* ignore */
  }
}
