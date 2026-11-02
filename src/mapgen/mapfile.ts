/**
 * Reading a planner MapFile safely. Pure data, no Babylon: the game, the planner and the sim can share it.
 * A file that fails any check is rejected as a whole, so the game never builds half a map.
 */
import { DEFAULT_PARAMS, KINDS, NB, type MapFile, type Op } from './generate';

/** Where the planner autosaves its map in the browser. The game reads it for `?map=planner`. */
export const PLANNER_SAVE_KEY = 'bgv-planner-map';

export type MapParse = { ok: true; map: MapFile } | { ok: false; reason: string };

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function opError(op: unknown, i: number): string | null {
  if (!isObj(op)) return `ops[${i}] is not an object`;
  if (op.t === 'erase' || op.t === 'lift') {
    if (!num(op.x) || !num(op.z) || !num(op.r)) return `ops[${i}] needs numeric x, z, r`;
    if (op.t === 'lift' && !num(op.a)) return `ops[${i}] needs numeric a`;
    return null;
  }
  if (op.t === 'add') {
    const o = op.o;
    if (!isObj(o)) return `ops[${i}].o is missing`;
    if (typeof o.k !== 'string' || !(o.k in KINDS)) return `ops[${i}] has unknown kind "${String(o.k)}"`;
    if (![o.x, o.z, o.s, o.r, o.v].every(num)) return `ops[${i}].o needs numeric x, z, s, r, v`;
    return null;
  }
  if (op.t === 'move') {
    if (typeof op.k !== 'string' || !(op.k in KINDS)) return `ops[${i}] has unknown kind "${String(op.k)}"`;
    if (![op.x, op.z, op.nx, op.nz].every(num)) return `ops[${i}] needs numeric x, z, nx, nz`;
    return null;
  }
  return `ops[${i}] has unknown type "${String(op.t)}"`;
}

/** Parse and check a MapFile. Missing generator settings fall back to the planner defaults. */
export function parseMapFile(text: string | null | undefined): MapParse {
  if (!text) return { ok: false, reason: 'empty file' };
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'not valid JSON' };
  }
  if (!isObj(data)) return { ok: false, reason: 'not a map object' };
  if (data.v !== 1) return { ok: false, reason: `unsupported version ${String(data.v)}` };
  if (!isObj(data.gen)) return { ok: false, reason: 'gen is missing' };
  const gen = { ...DEFAULT_PARAMS, ...data.gen };
  if (!num(gen.seed)) return { ok: false, reason: 'gen.seed is not a number' };
  if (!num(gen.size) || gen.size < 50 || gen.size > 8000) return { ok: false, reason: 'gen.size must be 50–8000 m' };
  if (!Array.isArray(gen.biomes) || gen.biomes.length !== NB) return { ok: false, reason: `gen.biomes must list ${NB} landscapes` };
  const ops = data.ops ?? [];
  if (!Array.isArray(ops)) return { ok: false, reason: 'ops is not a list' };
  for (let i = 0; i < ops.length; i++) {
    const err = opError(ops[i], i);
    if (err) return { ok: false, reason: err };
  }
  const atmos = isObj(data.atmos) ? (data.atmos as MapFile['atmos']) : undefined;
  return { ok: true, map: { v: 1, gen, ops: ops as Op[], atmos } };
}
