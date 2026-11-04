/**
 * Effect regions in the planner (mapgen/fx.ts): circles you click onto the map, or whole landscapes, each
 * with its own share of spores, fog and fireflies. Circles show as soft painted walls; the atmosphere reads
 * the values where the camera looks.
 */
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { Scene } from '@babylonjs/core/scene';
import { BIOMES, type Field } from '../mapgen/generate';
import { FX, type FxValues, type FxZone, type MapFx } from '../mapgen/fx';
import { icon } from './icons';
import { t } from './strings';

/** Watercolor pigments for the regions, in order. */
export const ZONE_COLORS = ['#e2475c', '#4fb3bf', '#f2b33d', '#8a6bd1', '#5f9e4f', '#d9855a'];

export type FxHost = {
  scene: Scene;
  fx(): MapFx;
  field(): Field;
  commit(): void;
  save(): void;
  /** Regions changed: redraw the minimap and the atmosphere. */
  changed(): void;
  exclude(m: Mesh): void;
};

const pct = (v: number) => `${Math.round(v * 100)}%`;

export class FxEditor {
  sel = -1;
  show = false;
  private dragging = false;
  private moved = false;
  private meshes: Mesh[] = [];

  constructor(private h: FxHost) {}

  zones(): FxZone[] {
    return this.h.fx().zones;
  }

  /** Redraw the circle regions (call after any change). */
  draw() {
    this.meshes.forEach((m) => m.dispose());
    this.meshes = [];
    if (!this.show) return;
    const field = this.h.field();
    this.zones().forEach((z, i) => {
      if (z.shape !== 'circle') return;
      const col = Color3.FromHexString(ZONE_COLORS[i % ZONE_COLORS.length]);
      const mat = new StandardMaterial(`glow-zone-${i}`, this.h.scene);
      mat.disableLighting = true;
      mat.emissiveColor = col;
      mat.alpha = i === this.sel ? 0.3 : 0.16;
      mat.backFaceCulling = false;
      const y = field.height(z.x, z.z);
      const wall = MeshBuilder.CreateCylinder(`zone-${i}`, { diameter: 2, height: 1, tessellation: 72, cap: Mesh.NO_CAP, sideOrientation: Mesh.DOUBLESIDE }, this.h.scene);
      wall.scaling.set(z.r, 36, z.r);
      wall.position.set(z.x, y + 8, z.z);
      wall.material = mat;
      wall.isPickable = false;
      this.h.exclude(wall);
      const rimMat = mat.clone(`glow-zone-rim-${i}`);
      rimMat.alpha = i === this.sel ? 0.9 : 0.55;
      const rim = MeshBuilder.CreateTorus(`zone-rim-${i}`, { diameter: 2, thickness: 0.02, tessellation: 96 }, this.h.scene);
      rim.scaling.set(z.r, 1, z.r);
      rim.position.set(z.x, y + 1, z.z);
      rim.material = rimMat;
      rim.isPickable = false;
      this.h.exclude(rim);
      // The soft inner rim where the region fades out.
      const inner = rim.clone(`zone-in-${i}`);
      inner.scaling.set(z.r * (1 - FX.rim), 1, z.r * (1 - FX.rim));
      this.meshes.push(wall, rim, inner);
    });
  }

  private at(x: number, z: number): number {
    let best = -1, bestD = Infinity;
    this.zones().forEach((zone, i) => {
      if (zone.shape !== 'circle') return;
      const d = Math.hypot(zone.x - x, zone.z - z) / zone.r;
      if (d <= 1 && d < bestD) [best, bestD] = [i, d];
    });
    return best;
  }

  /** Effect-region tool. Returns true when it used the event. */
  pointer(type: 'down' | 'move' | 'up', p: Vector3 | null): boolean {
    if (type === 'down' && p) {
      const i = this.at(p.x, p.z);
      this.h.commit();
      if (i < 0) {
        this.zones().push({ shape: 'circle', x: round(p.x), z: round(p.z), r: FX.radius, ...FX.zone });
        this.sel = this.zones().length - 1;
        this.dragging = false;
        this.done();
        return true;
      }
      this.sel = i;
      this.dragging = true;
      this.moved = false;
      this.done();
      return true;
    }
    if (type === 'move' && this.dragging && p) {
      const z = this.zones()[this.sel];
      if (z?.shape !== 'circle') return false;
      z.x = round(p.x);
      z.z = round(p.z);
      this.moved = true;
      this.draw();
      return true;
    }
    if (type === 'up' && this.dragging) {
      this.dragging = false;
      if (this.moved) this.done();
      return true;
    }
    return false;
  }

  /** Wheel while holding a region: its radius. */
  wheel(dy: number): boolean {
    const z = this.zones()[this.sel];
    if (!this.dragging || z?.shape !== 'circle') return false;
    z.r = Math.max(8, Math.round(z.r * (dy < 0 ? 1.08 : 1 / 1.08)));
    this.draw();
    this.h.changed();
    return true;
  }

  private done() {
    this.draw();
    this.h.save();
    this.h.changed();
  }

  // ---- Panels ------------------------------------------------------------------------------------
  /** Three share sliders for a set of values. */
  private shares(host: HTMLElement, v: FxValues, rerender: () => void) {
    for (const key of ['spores', 'fog', 'fireflies'] as const) {
      const row = document.createElement('label');
      row.className = 'row';
      row.innerHTML = `<span class="lbl">${t(`fx.${key}`)}</span><span class="val">${pct(v[key])}</span><input type="range" min="0" max="${FX.max}" step="0.05" value="${v[key]}">`;
      const input = row.querySelector('input')!;
      let started = false;
      input.addEventListener('input', () => {
        if (!started) this.h.commit();
        started = true;
        v[key] = Number(input.value);
        row.querySelector('.val')!.textContent = pct(v[key]);
        this.h.changed();
      });
      input.addEventListener('change', () => {
        started = false;
        this.h.save();
        rerender();
      });
      host.appendChild(row);
    }
  }

  /** The Effects tab: values outside every region, the region list, and the selected region. */
  renderTab(host: HTMLElement) {
    const fx = this.h.fx();
    const rerender = () => this.renderTab(host);
    host.innerHTML = `<p class="note">${t('fx.intro')}</p><h3>${t('fx.outside')}</h3><div class="outside"></div><h3>${t('fx.zones')}</h3>`;
    this.shares(host.querySelector('.outside')!, fx.outside, rerender);
    if (!fx.zones.length) host.insertAdjacentHTML('beforeend', `<p class="note empty">${t('fx.empty')}</p>`);
    const list = document.createElement('ul');
    list.className = 'zones';
    let circles = 0;
    fx.zones.forEach((z, i) => {
      const li = document.createElement('li');
      li.className = i === this.sel ? 'on' : '';
      const name = z.shape === 'circle' ? t('fx.circle', { n: ++circles }) : BIOMES[z.b].name;
      li.innerHTML = `<button class="zone-name"><i style="background:${ZONE_COLORS[i % ZONE_COLORS.length]}"></i><span>${name}</span><small>${pct(z.spores)} · ${pct(z.fog)} · ${pct(z.fireflies)}</small></button>`;
      li.querySelector('button')!.addEventListener('click', () => {
        this.sel = this.sel === i ? -1 : i;
        this.draw();
        rerender();
      });
      if (i === this.sel) {
        const body = document.createElement('div');
        body.className = 'zone-body';
        this.shares(body, z, rerender);
        if (z.shape === 'circle') {
          const row = document.createElement('label');
          row.className = 'row';
          row.innerHTML = `<span class="lbl">${t('fx.radius')}</span><span class="val">${z.r} m</span><input type="range" min="8" max="600" step="1" value="${z.r}">`;
          const input = row.querySelector('input')!;
          let started = false;
          input.addEventListener('input', () => {
            if (!started) this.h.commit();
            started = true;
            z.r = Number(input.value);
            row.querySelector('.val')!.textContent = `${z.r} m`;
            this.draw();
            this.h.changed();
          });
          input.addEventListener('change', () => {
            started = false;
            this.h.save();
          });
          body.appendChild(row);
        }
        const del = document.createElement('button');
        del.className = 'btn ghost danger';
        del.innerHTML = `${icon('trash', 16)}<span>${t('fx.remove')}</span>`;
        del.addEventListener('click', () => {
          this.h.commit();
          fx.zones.splice(i, 1);
          this.sel = -1;
          this.done();
          rerender();
        });
        body.appendChild(del);
        li.appendChild(body);
      }
      list.appendChild(li);
    });
    host.appendChild(list);
    // Landscape regions.
    const add = document.createElement('label');
    add.className = 'row';
    add.innerHTML = `<span class="lbl">${t('fx.addBiome')}</span><select><option value="">—</option>${BIOMES.map((b, i) => `<option value="${i}">${b.name}</option>`).join('')}</select>`;
    add.querySelector('select')!.addEventListener('change', (e) => {
      const b = Number((e.target as HTMLSelectElement).value);
      if (!(e.target as HTMLSelectElement).value) return;
      this.h.commit();
      fx.zones.push({ shape: 'biome', b, ...FX.zone });
      this.sel = fx.zones.length - 1;
      this.done();
      rerender();
    });
    host.appendChild(add);
  }
}

const round = (v: number) => Math.round(v * 10) / 10;
