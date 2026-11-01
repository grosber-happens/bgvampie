/**
 * Saves a live scene as one .glb file (for viewing in the Babylon.js Sandbox or Blender).
 * Only used by tools/export/export-glb.mjs, which loads it in the dev server; the game never imports it.
 */
import { GLTF2Export } from '@babylonjs/serializers/glTF/2.0';
import '@babylonjs/serializers/glTF/2.0/Extensions';
import type { Scene } from '@babylonjs/core/scene';
import type { Node } from '@babylonjs/core/node';

/** Returns the .glb as base64 so Playwright can carry it out of the page. */
export async function exportGlb(scene: Scene, name: string): Promise<string> {
  const skip = (n: Node) => {
    const nm = n.name.toLowerCase();
    // Effects, colliders and helper meshes are not part of the look.
    return nm.startsWith('col') || nm.includes('fx') || nm.includes('splat') || nm.includes('hitbox');
  };
  const data = await GLTF2Export.GLBAsync(scene, name, {
    shouldExportNode: (n) => n.isEnabled() && !skip(n),
    exportUnusedUVs: false,
  });
  const blob = Object.values(data.files)[0] as Blob;
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
