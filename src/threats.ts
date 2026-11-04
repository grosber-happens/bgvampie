/**
 * Off-screen threat marks: a watercolor blot at the screen edge for each enemy or enemy bullet the
 * player cannot see (behind the camera or outside the view), pointing the way it comes from.
 * Numbers live in THREAT.
 */
import type { Camera } from '@babylonjs/core/Cameras/camera';
import type { Engine } from '@babylonjs/core/Engines/engine';
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Scene } from '@babylonjs/core/scene';
import { G, hostile } from './core';

export const THREAT = {
  /** Enemies closer than this get a mark when off screen (m). */
  range: 28,
  /** Enemy bullets closer than this and flying toward the player get a mark (m). */
  bulletRange: 18,
  /** At most this many marks at once, nearest first. */
  max: 8,
  /** Gap between a mark and the screen edge (px). */
  edge: 46,
  /** A unit counts as on screen inside this margin (px). */
  margin: 30,
};

export function createThreats(scene: Scene, engine: Engine, camera: Camera) {
  const layer = document.createElement('div');
  layer.id = 'threats';
  document.body.appendChild(layer);
  const pool: HTMLDivElement[] = [];
  for (let i = 0; i < THREAT.max; i++) {
    const d = document.createElement('div');
    d.className = 'threat';
    layer.appendChild(d);
    pool.push(d);
  }
  const fwd = new Vector3();
  const right = new Vector3();
  let on = true;

  return {
    set enabled(v: boolean) {
      on = v;
      if (!v) for (const d of pool) d.style.opacity = '0';
    },
    update() {
      if (!on) return;
      const me = G.player;
      const w = engine.getRenderWidth(), h = engine.getRenderHeight();
      const cw = layer.clientWidth, ch = layer.clientHeight;
      const scale = cw / w;
      camera.getDirectionToRef(Vector3.Forward(), fwd);
      camera.getDirectionToRef(Vector3.Right(), right);
      const vp = camera.viewport.toGlobal(w, h);
      const tm = scene.getTransformMatrix();
      const list: { p: Vector3; near: number; bullet: boolean }[] = [];
      for (const u of G.units) {
        if (!u.alive || u === me || !hostile(me, u)) continue;
        const d = Vector3.Distance(u.pos, me.pos);
        if (d < THREAT.range) list.push({ p: u.pos.add(new Vector3(0, 1, 0)), near: 1 - d / THREAT.range, bullet: false });
      }
      for (const b of G.bullets) {
        if (!hostile(me, b.owner)) continue;
        const to = me.pos.subtract(b.mesh.position);
        const d = to.length();
        if (d < THREAT.bulletRange && Vector3.Dot(to, b.vel) > 0) list.push({ p: b.mesh.position, near: 1 - d / THREAT.bulletRange, bullet: true });
      }
      list.sort((a, b) => b.near - a.near);
      let n = 0;
      for (const t of list) {
        if (n >= pool.length) break;
        const to = t.p.subtract(camera.position);
        const ahead = Vector3.Dot(to, fwd) > 0;
        if (ahead) {
          const s = Vector3.Project(t.p, Matrix.Identity(), tm, vp);
          const m = THREAT.margin / scale;
          if (s.x > m && s.x < w - m && s.y > m && s.y < h - m) continue;
        }
        // Direction on the ground, seen from the camera: straight ahead is the top of the screen.
        const x = Vector3.Dot(to, right), z = to.x * fwd.x + to.z * fwd.z;
        const a = Math.atan2(x, z);
        const rx = cw / 2 - THREAT.edge, ry = ch / 2 - THREAT.edge;
        const el = pool[n++];
        el.style.transform = `translate(${cw / 2 + Math.sin(a) * rx}px, ${ch / 2 - Math.cos(a) * ry}px) rotate(${a}rad)`;
        el.style.opacity = String(0.35 + 0.65 * t.near);
        el.classList.toggle('bullet', t.bullet);
      }
      for (; n < pool.length; n++) pool[n].style.opacity = '0';
    },
  };
}
