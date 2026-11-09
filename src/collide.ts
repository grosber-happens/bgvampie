/**
 * Baked collision shapes of the region models (tools/assets/bake-collision.mjs). Each model's boxes are
 * packed as base64 Int16 centimeters (x, z, hw, hd, y0, y1 per box) and unpacked on first use.
 * No Babylon here: the map tools and the planner share it.
 */
import packed from './assets/spor/carpisma.json';

const PACKED = packed as Record<string, string | undefined>;
const cache = new Map<string, number[][] | undefined>();

/** A model's boxes [x, z, hw, hd, y0, y1] in its own meters, or undefined when it has none. */
export function sporShape(kind: string): number[][] | undefined {
  if (cache.has(kind)) return cache.get(kind);
  const s = PACKED[kind];
  let out: number[][] | undefined;
  if (s) {
    const bin = atob(s);
    const view = new DataView(new ArrayBuffer(bin.length));
    for (let i = 0; i < bin.length; i++) view.setUint8(i, bin.charCodeAt(i));
    out = [];
    for (let o = 0; o + 12 <= bin.length; o += 12) {
      const b: number[] = [];
      for (let j = 0; j < 6; j++) b.push(view.getInt16(o + j * 2, true) / 100);
      out.push(b);
    }
  }
  cache.set(kind, out);
  return out;
}
