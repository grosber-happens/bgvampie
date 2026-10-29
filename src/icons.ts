/**
 * Hand-drawn ink icons (inline SVG line art on a 48 x 48 grid) for items and skills.
 * Painted art from Artlist goes in public/art/items/<id>.webp and public/art/skills/<id>.webp;
 * when a file is there it is shown instead (see artUrl).
 */
const P: Record<string, string> = {
  hood: 'M10 40 C10 18 18 8 24 8 C30 8 38 18 38 40 M16 40 C16 26 20 20 24 20 C28 20 32 26 32 40 M20 30 h8',
  coat: 'M14 10 L24 16 L34 10 L40 18 L36 40 H12 L8 18 Z M24 16 V40 M18 26 h3 M27 26 h3',
  boots_light: 'M14 8 V30 L8 36 V40 H24 V34 L20 30 V8 M30 8 V30 L28 34 V40 H42 V36 L36 30 V8 M10 36 h8 M32 36 h8',
  visor: 'M8 26 C8 14 16 8 24 8 C32 8 40 14 40 26 Z M6 26 H42 M12 32 H36 L32 38 H16 Z',
  vest: 'M16 8 L24 14 L32 8 L36 14 V40 H12 V14 Z M18 20 h12 M18 26 h12 M18 32 h12',
  boots_medium: 'M12 8 H22 V32 L26 36 V40 H8 V34 L12 30 Z M28 8 H38 V30 L42 34 V40 H26 M14 18 h6 M30 18 h6',
  helm: 'M10 30 C10 16 16 8 24 8 C32 8 38 16 38 30 V38 H10 Z M10 24 H38 M24 24 V38 M18 30 h3 M27 30 h3',
  plate: 'M12 10 C16 8 32 8 36 10 L40 22 L36 40 H12 L8 22 Z M24 10 V40 M12 22 H36 M16 30 H32',
  greaves: 'M12 6 H22 V40 H10 V34 L12 32 Z M26 6 H36 V32 L38 34 V40 H26 Z M12 16 H22 M26 16 H36 M12 24 H22 M26 24 H36',
  ember: 'M24 6 C30 16 36 20 36 30 C36 38 30 42 24 42 C18 42 12 38 12 30 C12 24 18 22 20 14 C22 20 26 22 24 6 M24 42 C20 38 20 32 24 28 C28 32 28 38 24 42',
  clock: 'M24 8 A16 16 0 1 0 24.01 8 M24 14 V24 L18 30 M24 4 V8 M18 4 H30',
  halo: 'M8 20 A16 6 0 1 0 40 20 A16 6 0 1 0 8 20 M20 26 L18 40 M28 26 L30 40 M14 30 l4 -2 M34 30 l-4 -2',
  heart: 'M24 40 L10 26 C4 20 8 10 16 10 C20 10 22 12 24 16 C26 12 28 10 32 10 C40 10 44 20 38 26 Z M14 22 H20 L22 18 L26 28 L28 22 H34',
  drop: 'M24 6 C30 16 36 22 36 30 A12 12 0 0 1 12 30 C12 22 18 16 24 6 M18 30 A6 6 0 0 0 24 36',
  flint: 'M10 34 L22 10 L38 18 L32 38 Z M22 10 L26 26 L10 34 M26 26 L32 38 M38 8 l2 -4 M42 14 l4 -1 M40 11 l3 -3',
  moon: 'M30 6 A18 18 0 1 0 42 30 A14 14 0 1 1 30 6 M12 40 h8 M30 42 h10',
  needle: 'M8 40 L36 12 M34 10 A3 3 0 1 1 38 14 M36 12 C42 18 40 30 30 34 C22 38 14 32 18 26',
  pistol: 'M6 16 H34 V22 H40 V26 H30 L28 32 H22 L20 40 H12 L14 26 H6 Z M34 16 V12 H40 M22 26 L24 22',
  daggers: 'M10 40 L30 8 L32 12 L14 42 Z M8 36 l8 4 M38 40 L18 8 L16 12 L34 42 Z M40 36 l-8 4',
  wand: 'M8 40 L32 16 M30 14 L34 18 M36 6 V14 M32 10 H40 M38 18 l3 3 M28 8 l-2 -3',
  rod: 'M10 42 L34 10 M30 6 A6 6 0 1 1 38 14 A6 6 0 1 1 30 6 M16 34 l4 3 M20 28 l4 3',
  quiver: 'M14 14 L20 42 H30 L36 14 Z M18 14 L14 4 M24 14 V4 M30 14 L34 4 M12 6 l2 -2 l2 2 M22 6 l2 -2 l2 2 M32 6 l2 -2 l2 2',
  sword: 'M24 4 L28 10 V32 H20 V10 Z M14 32 H34 M24 32 V42 M20 42 H28',
  scope: 'M6 20 H36 V28 H6 Z M36 18 L42 16 V32 L36 30 M14 20 V14 H26 V20 M20 14 V10',
  claws: 'M10 40 C14 28 16 18 12 8 M20 40 C24 28 26 18 22 6 M30 40 C34 28 36 20 32 10 M8 40 H34',
  fedora: 'M4 32 C12 36 36 36 44 32 C40 30 36 30 34 30 L32 16 C28 12 20 12 16 16 L14 30 C12 30 8 30 4 32 M15 26 H33 M20 14 l4 4 l4 -4',
  trench: 'M16 6 L24 14 L32 6 L40 14 L38 42 H10 L8 14 Z M24 14 V42 M16 22 l4 4 M32 22 l-4 4 M12 30 H36 M20 36 h2 M26 36 h2',
  oxfords: 'M6 30 C6 24 14 22 20 22 L24 18 H30 C36 18 40 22 42 30 V34 H6 Z M20 22 L26 30 M24 18 L30 26 M6 34 H42',
  badge: 'M24 6 L30 12 H38 V20 L42 24 L38 28 V36 H30 L24 42 L18 36 H10 V28 L6 24 L10 20 V12 H18 Z M24 16 L26 22 H32 L27 26 L29 32 L24 28 L19 32 L21 26 L16 22 H22 Z',
  photo: 'M24 4 V10 M14 10 H34 V40 H14 Z M18 14 H30 V30 H18 Z M24 18 A3 3 0 1 1 24.01 18 M20 28 C20 24 28 24 28 28 M18 34 H30',
};

/** Painted art (from Artlist) for this item or skill, if the file exists. Filled at startup by `loadArtIndex`. */
const art = new Set<string>();
export async function loadArtIndex() {
  try {
    const r = await fetch(`${import.meta.env.BASE_URL}art/index.json`, { cache: 'no-cache' });
    if (r.ok) for (const k of (await r.json()) as string[]) art.add(k);
  } catch {
    /* no painted art yet */
  }
}
export const artUrl = (kind: 'items' | 'skills' | 'ui', id: string) => (art.has(`${kind}/${id}`) ? `${import.meta.env.BASE_URL}art/${kind}/${id}.webp` : null);

export function itemIcon(id: string, icon: string, color: string): string {
  const url = artUrl('items', id);
  if (url) return `<img class="art" src="${url}" alt="">`;
  const d = P[icon] ?? P.badge;
  return `<svg viewBox="0 0 48 48" class="ink"><path d="${d}" fill="none" stroke="${color}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="#15131a" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" transform="translate(1.2 1.4)" opacity="0.35"/></svg>`;
}

/** Class colors for skill seals. */
export const CLASS_INK: Record<string, string> = { rogue: '#b46cff', mage: '#5fb4d9', fighter: '#f2b33d', scout: '#7ad77a' };

/**
 * A skill seal: a round ink stamp in the class color with the first letters of the poetic name,
 * like a hanko on a detective's file.
 */
export function skillIcon(id: string, name: string, cls: string): string {
  const url = artUrl('skills', id);
  if (url) return `<img class="art" src="${url}" alt="">`;
  const words = name.split(/\s+/).filter((w) => w.length > 1);
  const letters = (words.length > 1 ? words[0][0] + words[1][0] : name.slice(0, 2)).toLocaleUpperCase();
  const c = CLASS_INK[cls] ?? '#f2b33d';
  // A slightly broken ring, like a rubber stamp pressed unevenly.
  return `<svg viewBox="0 0 48 48" class="seal"><circle cx="24" cy="24" r="19" fill="${c}" opacity="0.16"/><path d="M24 5 A19 19 0 1 1 7.5 14.5" fill="none" stroke="${c}" stroke-width="3" stroke-linecap="round"/><path d="M6 19 A19 19 0 0 1 9 12" fill="none" stroke="${c}" stroke-width="3" stroke-linecap="round" opacity="0.6"/><text x="24" y="30.5" text-anchor="middle" font-size="17" font-family="Bungee, sans-serif" fill="${c}">${letters}</text></svg>`;
}
