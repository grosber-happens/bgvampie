/**
 * Furnished interiors. A layout is a list of props in the building's own frame (meters from its origin,
 * turned with it, the same frame as its collision boxes), so a layout made for one house fits every copy:
 * - templates[kind] is the shared "interior layout template" for every building of that kind,
 * - overrides[houseKey] replaces it for one house only.
 * Pure data, no Babylon: the planner edits it, the game places the props, the sim can read it.
 */
import type { Obj } from './generate';

/** One prop. k: interior model name (src/assets/spor/ic/<k>.glb). f: floor index. y: height of its base. */
export type Furn = { k: string; f: number; x: number; y: number; z: number; r: number };

export type Interiors = { templates: Record<string, Furn[]>; overrides: Record<string, Furn[]> };

export const emptyInteriors = (): Interiors => ({ templates: {}, overrides: {} });

/** A house's key for its override: kind and spot (a moved house keeps its override, see moveOverride). */
export const houseKey = (o: { k: string; x: number; z: number }) => `${o.k}@${o.x.toFixed(1)},${o.z.toFixed(1)}`;

/** The layout a house uses: its own override, else its kind's template, else nothing. */
export function layoutFor(ints: Interiors | undefined, o: { k: string; x: number; z: number }): Furn[] {
  if (!ints) return [];
  return ints.overrides[houseKey(o)] ?? ints.templates[o.k] ?? [];
}

/** Carry a house's override along when the house is moved from (x, z) to (nx, nz). */
export function moveOverride(ints: Interiors, k: string, x: number, z: number, nx: number, nz: number) {
  const from = houseKey({ k, x, z }), to = houseKey({ k, x: nx, z: nz });
  if (from === to || !ints.overrides[from]) return;
  ints.overrides[to] = ints.overrides[from];
  delete ints.overrides[from];
}

/** A prop's place in the world: building-local (x, z) turned by the house's yaw; the spot scales with the house, the prop keeps its own size. */
export function furnToWorld(o: Pick<Obj, 'x' | 'z' | 'r' | 's'>, groundY: number, f: Furn): { x: number; y: number; z: number; r: number; s: number } {
  const c = Math.cos(o.r), sn = Math.sin(o.r);
  return { x: o.x + (f.x * c + f.z * sn) * o.s, y: groundY + f.y * o.s, z: o.z + (-f.x * sn + f.z * c) * o.s, r: o.r + f.r, s: 1 };
}

/** The inverse: a world point into the building's frame. */
export function worldToLocal(o: Pick<Obj, 'x' | 'z' | 'r' | 's'>, x: number, z: number): { x: number; z: number } {
  const dx = (x - o.x) / o.s, dz = (z - o.z) / o.s;
  const c = Math.cos(o.r), sn = Math.sin(o.r);
  return { x: dx * c - dz * sn, z: dx * sn + dz * c };
}

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function parseList(v: unknown): Furn[] | null {
  if (!Array.isArray(v)) return null;
  const out: Furn[] = [];
  for (const f of v as Record<string, unknown>[]) {
    if (!f || typeof f.k !== 'string' || ![f.f, f.x, f.y, f.z, f.r].every(num)) return null;
    out.push({ k: f.k, f: f.f as number, x: f.x as number, y: f.y as number, z: f.z as number, r: f.r as number });
  }
  return out;
}

/** Check an `interiors` block from a map file. Returns undefined when it is missing or broken. */
export function parseInteriors(data: unknown): Interiors | undefined {
  if (typeof data !== 'object' || data === null) return undefined;
  const d = data as Record<string, unknown>;
  const ints = emptyInteriors();
  for (const key of ['templates', 'overrides'] as const) {
    const src = d[key];
    if (src === undefined) continue;
    if (typeof src !== 'object' || src === null) return undefined;
    for (const [k, list] of Object.entries(src)) {
      const parsed = parseList(list);
      if (!parsed) return undefined;
      ints[key][k] = parsed;
    }
  }
  return ints;
}
