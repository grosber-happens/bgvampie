/**
 * The interior designer: double-click a building in the planner to step inside. The floors above the one
 * you edit and the roof are cut away (a clip plane), props snap to the floor and against the walls, and the
 * checks list flags seats and tables at the wrong height for the character, props in walls or in the ceiling.
 *
 * A layout lives in the building's own frame (mapgen/interior.ts): editing the template changes every copy
 * of that building; "this house only" gives one house its own override.
 */
import type { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Plane } from '@babylonjs/core/Maths/math.plane';
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { Scene } from '@babylonjs/core/scene';
import { INTERIOR } from '../balance';
import { baseHeight, type Field, type Obj } from '../mapgen/generate';
import { houseKey, worldToLocal, furnToWorld, type Furn, type Interiors } from '../mapgen/interior';
import { IC, PROP_NAMES, enterable } from '../interiors';
import { sporShape } from '../collide';
import { icon } from './icons';
import { PROPS, kindName, propName, t, type PropGroup } from './strings';


export type DesignerHost = {
  scene: Scene;
  camera: ArcRotateCamera;
  panel: HTMLElement;
  interiors(): Interiors;
  field(): Field;
  objs(): Obj[];
  commit(): void;
  save(): void;
  redraw(): void;
  flash(msg: string): void;
  /** The designer opened or closed (the planner swaps its panels and tools). */
  changed(inside: boolean): void;
};

type Check = { level: 'warn'; text: string; items: number[] };
const cm = (m: number) => Math.round(m * 100);

export class InteriorDesigner {
  house: Obj | null = null;
  floor = 0;
  private placing: string | null = null;
  private sel = -1;
  private dragging = false;
  private dragCommitted = false;
  private snapOn = true;
  private filter = '';
  private saved: { a: number; b: number; r: number; t: Vector3; lo: number | null; hi: number | null } | null = null;
  private ghost: Mesh;
  private ghostMat: StandardMaterial;
  private lastDraw = 0;

  constructor(private h: DesignerHost) {
    this.ghostMat = new StandardMaterial('glow-ghost', h.scene);
    this.ghostMat.disableLighting = true;
    this.ghostMat.emissiveColor = Color3.FromHexString('#f2b33d');
    this.ghostMat.alpha = 0.35;
    this.ghost = MeshBuilder.CreateBox('interior-ghost', { size: 1 }, h.scene);
    this.ghost.material = this.ghostMat;
    this.ghost.isPickable = false;
    this.ghost.setEnabled(false);
  }

  get active() {
    return !!this.house;
  }

  // ---- Frame -------------------------------------------------------------------------------------
  private get floors(): number[] {
    return (this.house && IC.floors[this.house.k]) || [0];
  }
  private ground(): number {
    return baseHeight(this.h.field(), this.house!);
  }
  /** Ceiling over a floor (local m): the next floor's slab, or the default room height. */
  private ceiling(f: number): number {
    const fl = this.floors;
    return f + 1 < fl.length ? fl[f + 1] - 0.3 : fl[f] + INTERIOR.ceiling;
  }
  private key(): string {
    return houseKey(this.house!);
  }
  get ownLayout(): boolean {
    return !!this.house && !!this.h.interiors().overrides[this.key()];
  }
  /** The list being edited (created on first write). */
  private list(write = false): Furn[] {
    const ints = this.h.interiors();
    const o = this.house!;
    const own = ints.overrides[this.key()];
    if (own) return own;
    if (write && !ints.templates[o.k]) ints.templates[o.k] = [];
    return ints.templates[o.k] ?? [];
  }

  // ---- Enter and leave ---------------------------------------------------------------------------
  canEnter(o: Obj | null): o is Obj {
    return !!o && enterable(o.k);
  }

  enter(o: Obj) {
    const cam = this.h.camera;
    if (!this.house) this.saved = { a: cam.alpha, b: cam.beta, r: cam.radius, t: cam.target.clone(), lo: cam.lowerRadiusLimit, hi: cam.upperRadiusLimit };
    this.house = o;
    this.floor = 0;
    this.sel = -1;
    this.placing = null;
    cam.lowerRadiusLimit = 1.5;
    cam.upperRadiusLimit = 60;
    this.setFloor(0);
    // After the target: setting a target recomputes the radius from where the camera stands.
    cam.radius = 14 * o.s;
    cam.beta = 0.6;
    this.h.changed(true);
    this.render();
  }

  exit() {
    if (!this.house) return;
    this.house = null;
    this.ghost.setEnabled(false);
    this.h.scene.clipPlane = null;
    const cam = this.h.camera;
    if (this.saved) {
      cam.lowerRadiusLimit = this.saved.lo;
      cam.upperRadiusLimit = this.saved.hi;
      cam.target = this.saved.t;
      cam.alpha = this.saved.a;
      cam.beta = this.saved.b;
      cam.radius = this.saved.r;
    }
    this.h.changed(false);
  }

  setFloor(f: number) {
    if (!this.house) return;
    this.floor = Math.max(0, Math.min(this.floors.length - 1, f));
    this.sel = -1;
    const o = this.house;
    const g = this.ground();
    const y = g + this.floors[this.floor] * o.s;
    // Everything above this floor's ceiling is cut away: upper floors and the roof.
    const cut = g + (this.ceiling(this.floor) - 0.15) * o.s;
    this.h.scene.clipPlane = new Plane(0, 1, 0, -cut);
    const cam = this.h.camera;
    const [a, b, r] = [cam.alpha, cam.beta, cam.radius];
    // Look at the middle of this floor (rooms are often off the model's center).
    const [cx, cz] = IC.centers[o.k]?.[this.floor] ?? [0, 0];
    const mid = furnToWorld(o, 0, { k: '', f: 0, x: cx, y: 0, z: cz, r: 0 });
    cam.target = new Vector3(mid.x, y + 1.2, mid.z);
    [cam.alpha, cam.beta, cam.radius] = [a, b, r];
    this.render();
  }

  // ---- Geometry ----------------------------------------------------------------------------------
  /** Pointer ray onto the current floor, in the building's frame. */
  private floorPoint(): { x: number; z: number } | null {
    const sc = this.h.scene;
    const o = this.house!;
    const y = this.ground() + this.floors[this.floor] * o.s;
    const ray = sc.createPickingRay(sc.pointerX, sc.pointerY, Matrix.Identity(), this.h.camera);
    if (Math.abs(ray.direction.y) < 1e-4) return null;
    const d = (y - ray.origin.y) / ray.direction.y;
    if (d < 0) return null;
    const p = ray.origin.add(ray.direction.scale(d));
    return worldToLocal(o, p.x, p.z);
  }

  /** Wall boxes of this floor in the building's frame: [x, z, hw, hd]. */
  private walls(): number[][] {
    const fy = this.floors[this.floor];
    return (sporShape(this.house!.k) ?? []).filter(([, , , , y0, y1]) => y1 - y0 >= 1 && y0 < fy + 1.8 && y1 > fy + 0.4);
  }

  /** Where a prop dropped at (x, z) ends up: on the floor, on a table, under the ceiling, or against a wall. */
  private placeAt(k: string, x: number, z: number, r: number, skip = -1): Furn {
    const size = IC.props[k];
    const role = PROPS[k]?.role ?? 'other';
    const fy = this.floors[this.floor];
    let y = fy;
    if (role === 'hang') y = this.ceiling(this.floor) - size.h - INTERIOR.hangGap;
    else if (role === 'top') {
      // Small things go on the table or counter under them.
      const under = this.list().find((f, i) => i !== skip && f.f === this.floor && ['table', 'counter'].includes(PROPS[f.k]?.role ?? '') && inside(f, x, z));
      if (under) y = under.y + (IC.props[under.k].top ?? IC.props[under.k].h);
    }
    if (this.snapOn && !['rug', 'hang', 'top'].includes(role)) {
      // The nearest wall point; its direction to the drop point is the wall's normal (works on round walls too).
      let best: { d: number; cx: number; cz: number } | null = null;
      for (const [bx, bz, hw, hd] of this.walls()) {
        const cx = Math.max(bx - hw, Math.min(bx + hw, x)), cz = Math.max(bz - hd, Math.min(bz + hd, z));
        const d = Math.hypot(x - cx, z - cz);
        if (d > 1e-3 && (!best || d < best.d)) best = { d, cx, cz };
      }
      if (best && best.d < INTERIOR.snap + size.d / 2) {
        const nx = (x - best.cx) / best.d, nz = (z - best.cz) / best.d;
        // The prop's back goes against the wall, its front (+z) faces the room.
        r = Math.atan2(nx, nz);
        const off = size.d / 2 + 0.02;
        x = best.cx + nx * off;
        z = best.cz + nz * off;
      }
    }
    return { k, f: this.floor, x: round(x), y: round(y), z: round(z), r: Math.round(r * 1000) / 1000 };
  }

  private pickProp(x: number, z: number): number {
    let best = -1, bestD = Infinity;
    this.list().forEach((f, i) => {
      if (f.f !== this.floor) return;
      const d = Math.hypot(f.x - x, f.z - z);
      // Things on top of tables win over the table under them.
      const score = d - (PROPS[f.k]?.role === 'top' ? 0.3 : 0);
      if (inside(f, x, z) && score < bestD) [best, bestD] = [i, score];
    });
    return best;
  }

  // ---- Input -------------------------------------------------------------------------------------
  /** Pointer events while inside. Returns true when the designer used the event. */
  pointer(type: 'down' | 'move' | 'up', button: number): boolean {
    if (!this.house) return false;
    const p = this.floorPoint();
    if (type === 'move') {
      if (p) this.showGhost(p);
      if (this.dragging && p && this.sel >= 0) {
        if (!this.dragCommitted) {
          this.h.commit();
          this.dragCommitted = true;
        }
        const list = this.list(true);
        const it = list[this.sel];
        list[this.sel] = this.placeAt(it.k, p.x, p.z, it.r, this.sel);
        this.redrawSoon();
      }
      return this.dragging;
    }
    if (button !== 0) return false;
    if (type === 'down' && p) {
      if (this.placing) {
        this.h.commit();
        this.list(true).push(this.placeAt(this.placing, p.x, p.z, 0));
        this.sel = this.list().length - 1;
        this.afterEdit();
        return true;
      }
      this.sel = this.pickProp(p.x, p.z);
      this.dragging = this.sel >= 0;
      this.dragCommitted = false;
      if (this.dragging) this.h.camera.detachControl();
      this.render();
      return this.dragging;
    }
    if (type === 'up' && this.dragging) {
      this.dragging = false;
      this.h.camera.attachControl(true);
      this.afterEdit();
      return true;
    }
    return false;
  }

  /** Keys while inside. Returns true when used. */
  keydown(e: KeyboardEvent): boolean {
    if (!this.house) return false;
    if (e.code === 'Escape') {
      if (this.placing) {
        this.placing = null;
        this.render();
      } else this.exit();
      return true;
    }
    if (e.code === 'PageUp') return this.setFloor(this.floor + 1), true;
    if (e.code === 'PageDown') return this.setFloor(this.floor - 1), true;
    if (this.sel < 0) return false;
    if (e.code === 'KeyR') return this.turn(e.shiftKey ? -INTERIOR.turn : INTERIOR.turn), true;
    if (e.code === 'Delete' || e.code === 'Backspace') return this.remove(), true;
    return false;
  }

  private turn(by: number) {
    this.h.commit();
    const it = this.list(true)[this.sel];
    it.r = Math.round((it.r + by) * 1000) / 1000;
    this.afterEdit();
  }

  private remove() {
    this.h.commit();
    this.list(true).splice(this.sel, 1);
    this.sel = -1;
    this.afterEdit();
  }

  private setScope(own: boolean) {
    const ints = this.h.interiors();
    const k = this.key();
    if (own === !!ints.overrides[k]) return;
    this.h.commit();
    if (own) ints.overrides[k] = structuredClone(ints.templates[this.house!.k] ?? []);
    else delete ints.overrides[k];
    this.sel = -1;
    this.afterEdit();
  }

  private afterEdit() {
    this.h.save();
    this.h.redraw();
    this.render();
  }

  private redrawSoon() {
    const now = performance.now();
    if (now - this.lastDraw < 60) return;
    this.lastDraw = now;
    this.h.redraw();
  }

  private showGhost(p: { x: number; z: number }) {
    const o = this.house!;
    const k = this.placing ?? (this.sel >= 0 ? this.list()[this.sel]?.k : null);
    if (!k || (!this.placing && !this.dragging && this.sel < 0)) return this.ghost.setEnabled(false);
    const f = this.placing ? this.placeAt(k, p.x, p.z, 0) : this.list()[this.sel];
    const size = IC.props[k];
    const w = furnToWorld(o, this.ground(), f);
    this.ghost.setEnabled(true);
    this.ghost.position.set(w.x, w.y + 0.02, w.z);
    this.ghost.rotation.y = w.r;
    this.ghost.scaling.set(size.w * o.s, 0.04, size.d * o.s);
  }

  // ---- Checks ------------------------------------------------------------------------------------
  checks(): Check[] {
    const out: Check[] = [];
    const list = this.list();
    const s = this.house!.s;
    const here = list.map((f, i) => ({ f, i })).filter(({ f }) => f.f === this.floor);
    const topOf = (f: Furn) => (IC.props[f.k]?.top ?? 0) * s + (f.y - this.floors[f.f]) * s;
    const range = (v: number, [a, b]: number[]) => v >= a - 0.005 && v <= b + 0.005;
    for (const { f, i } of here) {
      const role = PROPS[f.k]?.role;
      const name = propName(f.k);
      const top = topOf(f);
      if (role === 'seat' && !range(top, INTERIOR.seat)) out.push({ level: 'warn', items: [i], text: t('chk.seat', { name, h: cm(top), a: cm(INTERIOR.seat[0]), b: cm(INTERIOR.seat[1]) }) });
      if (role === 'table' && !range(top, INTERIOR.table)) out.push({ level: 'warn', items: [i], text: t('chk.table', { name, h: cm(top), a: cm(INTERIOR.table[0]), b: cm(INTERIOR.table[1]) }) });
      if (role === 'counter' && !range(top, INTERIOR.counter)) out.push({ level: 'warn', items: [i], text: t('chk.table', { name, h: cm(top), a: cm(INTERIOR.counter[0]), b: cm(INTERIOR.counter[1]) }) });
      if (f.y + IC.props[f.k].h > this.ceiling(f.f) - INTERIOR.headroom + (role === 'hang' ? INTERIOR.hangGap : 0)) out.push({ level: 'warn', items: [i], text: t('chk.ceiling', { name }) });
      if (role !== 'rug' && role !== 'hang' && this.walls().reduce((sum, b) => sum + overlapsBox(f, b), 0) > 0.35) out.push({ level: 'warn', items: [i], text: t('chk.wall', { name }) });
    }
    // Seats at tables: the table top should sit a forearm above the seat.
    for (const a of here.filter(({ f }) => PROPS[f.k]?.role === 'seat')) {
      const table = here
        .filter(({ f }) => PROPS[f.k]?.role === 'table')
        .map((b) => ({ ...b, d: Math.hypot(b.f.x - a.f.x, b.f.z - a.f.z) - Math.max(IC.props[b.f.k].w, IC.props[b.f.k].d) / 2 }))
        .filter((b) => b.d < INTERIOR.pairReach)
        .sort((p, q) => p.d - q.d)[0];
      if (!table) continue;
      const gap = topOf(table.f) - topOf(a.f);
      if (!range(gap, INTERIOR.pair)) out.push({ level: 'warn', items: [a.i, table.i], text: t('chk.pair', { seat: propName(a.f.k), table: propName(table.f.k), h: cm(gap), a: cm(INTERIOR.pair[0]), b: cm(INTERIOR.pair[1]) }) });
    }
    // Props inside each other (rugs and things on tables are meant to overlap).
    const solid = here.filter(({ f }) => !['rug', 'top', 'hang'].includes(PROPS[f.k]?.role ?? ''));
    for (let p = 0; p < solid.length; p++)
      for (let q = p + 1; q < solid.length; q++) {
        if (overlap(solid[p].f, solid[q].f) > INTERIOR.overlap) out.push({ level: 'warn', items: [solid[p].i, solid[q].i], text: t('chk.overlap', { a: propName(solid[p].f.k), b: propName(solid[q].f.k) }) });
      }
    return out;
  }

  // ---- Panel -------------------------------------------------------------------------------------
  render() {
    const host = this.h.panel;
    if (!this.house) {
      host.innerHTML = '';
      return;
    }
    const o = this.house;
    const ints = this.h.interiors();
    const copies = this.h.objs().filter((x) => x.k === o.k && !ints.overrides[houseKey(x)]).length;
    const list = this.list();
    const onFloor = list.filter((f) => f.f === this.floor).length;
    const checks = this.checks();
    const sel = this.sel >= 0 ? list[this.sel] : null;
    const groups: PropGroup[] = ['seat', 'table', 'store', 'kitchen', 'light', 'decor'];
    const q = this.filter.trim().toLocaleLowerCase();
    const names = PROP_NAMES.filter((k) => !q || propName(k).toLocaleLowerCase().includes(q) || k.includes(q));
    host.innerHTML = `
      <header class="in-head">
        <button class="btn ghost" data-act="leave">${icon('back', 18)}<span>${t('in.leave')}</span></button>
        <h2>${kindName(o.k)}</h2>
        <p class="sub">${t('in.count', { n: onFloor })}</p>
      </header>
      <section class="blk">
        <h3>${t('in.floor')}</h3>
        <div class="floors" role="radiogroup">${this.floors
          .map((y, i) => `<button role="radio" aria-checked="${i === this.floor}" class="${i === this.floor ? 'on' : ''}" data-floor="${i}"><b>${i === 0 ? t('in.ground') : t('in.floorN', { n: i })}</b><span>${y.toFixed(1)} m</span></button>`)
          .reverse()
          .join('')}</div>
      </section>
      <section class="blk">
        <h3>${t('in.scope')}</h3>
        <div class="seg" role="radiogroup">
          <button role="radio" aria-checked="${!this.ownLayout}" class="${this.ownLayout ? '' : 'on'}" data-scope="0">${t('in.template')}</button>
          <button role="radio" aria-checked="${this.ownLayout}" class="${this.ownLayout ? 'on' : ''}" data-scope="1">${t('in.house')}</button>
        </div>
        <p class="note">${this.ownLayout ? t('in.houseNote') : t('in.templateNote', { n: copies })}</p>
      </section>
      ${
        sel
          ? `<section class="blk sel">
        <h3>${t('in.selected')}</h3>
        <div class="sel-row"><b>${propName(sel.k)}</b>
          <button class="icon-btn" data-act="turn" title="${t('in.turn')} (R)">${icon('turn', 18)}</button>
          <button class="icon-btn danger" data-act="del" title="${t('sel.delete')} (Del)">${icon('trash', 18)}</button></div>
        <label class="row"><span class="lbl">${t('in.lift')}</span><span class="val">${cm(sel.y - this.floors[sel.f])} cm</span>
          <input type="range" min="0" max="${Math.max(0.5, this.ceiling(sel.f) - this.floors[sel.f] - 0.2).toFixed(2)}" step="0.01" value="${(sel.y - this.floors[sel.f]).toFixed(2)}" data-act="lift"></label>
      </section>`
          : ''
      }
      <section class="blk">
        <h3>${t('in.checks')}</h3>
        ${
          checks.length
            ? `<ul class="checks">${checks.map((c) => `<li data-items="${c.items.join(',')}">${icon('warn', 16)}<span>${c.text}</span></li>`).join('')}</ul>`
            : `<p class="ok">${icon('ok', 16)}<span>${t('in.ok')}</span></p>`
        }
      </section>
      <section class="blk grow">
        <div class="pal-head"><h3>${t('in.props')}</h3>
          <label class="chk small"><input type="checkbox" data-act="snap" ${this.snapOn ? 'checked' : ''}><span>${t('in.snap')}</span></label></div>
        <label class="search">${icon('search', 16)}<input type="search" placeholder="${t('pal.search')}" value="${this.filter.replace(/"/g, '&quot;')}" data-act="filter"></label>
        <div class="props">${
          names.length
            ? groups
                .map((g) => {
                  const ks = names.filter((k) => (PROPS[k]?.group ?? 'decor') === g);
                  return ks.length ? `<h4>${t(`pg.${g}`)}</h4><div class="kinds">${ks.map((k) => `<button data-prop="${k}" class="${k === this.placing ? 'on' : ''}">${propName(k)}</button>`).join('')}</div>` : '';
                })
                .join('')
            : `<p class="note">${t('pal.none')}</p>`
        }</div>
      </section>`;
    host.querySelector('[data-act=leave]')!.addEventListener('click', () => this.exit());
    host.querySelectorAll<HTMLButtonElement>('[data-floor]').forEach((b) => b.addEventListener('click', () => this.setFloor(Number(b.dataset.floor))));
    host.querySelectorAll<HTMLButtonElement>('[data-scope]').forEach((b) => b.addEventListener('click', () => this.setScope(b.dataset.scope === '1')));
    host.querySelector('[data-act=turn]')?.addEventListener('click', () => this.turn(INTERIOR.turn));
    host.querySelector('[data-act=del]')?.addEventListener('click', () => this.remove());
    const lift = host.querySelector<HTMLInputElement>('[data-act=lift]');
    if (lift) {
      let started = false;
      lift.addEventListener('input', () => {
        if (!started) this.h.commit();
        started = true;
        const it = this.list(true)[this.sel];
        it.y = round(this.floors[it.f] + Number(lift.value));
        (lift.previousElementSibling as HTMLElement).textContent = `${cm(Number(lift.value))} cm`;
        this.redrawSoon();
      });
      lift.addEventListener('change', () => {
        started = false;
        this.afterEdit();
      });
    }
    host.querySelector<HTMLInputElement>('[data-act=snap]')!.addEventListener('change', (e) => (this.snapOn = (e.target as HTMLInputElement).checked));
    const search = host.querySelector<HTMLInputElement>('[data-act=filter]')!;
    search.addEventListener('input', () => {
      this.filter = search.value;
      const pos = search.selectionStart;
      this.render();
      const again = this.h.panel.querySelector<HTMLInputElement>('[data-act=filter]')!;
      again.focus();
      again.setSelectionRange(pos, pos);
    });
    host.querySelectorAll<HTMLButtonElement>('[data-prop]').forEach((b) =>
      b.addEventListener('click', () => {
        this.placing = this.placing === b.dataset.prop ? null : b.dataset.prop!;
        this.sel = -1;
        this.render();
      }),
    );
    host.querySelectorAll<HTMLElement>('.checks li').forEach((li) =>
      li.addEventListener('click', () => {
        this.sel = Number(li.dataset.items!.split(',')[0]);
        this.render();
      }),
    );
  }

  /** The hint line while inside. */
  hint(): string {
    return this.placing ? `${propName(this.placing)} · ${t('hint.inside')}` : t('hint.inside');
  }
}

const round = (v: number) => Math.round(v * 1000) / 1000;

/** Is the point inside a prop's turned footprint? */
function inside(f: Furn, x: number, z: number): boolean {
  const size = IC.props[f.k];
  if (!size) return false;
  const c = Math.cos(f.r), s = Math.sin(f.r);
  const dx = x - f.x, dz = z - f.z;
  const lx = dx * c - dz * s, lz = dx * s + dz * c;
  return Math.abs(lx) <= size.w / 2 + 0.1 && Math.abs(lz) <= size.d / 2 + 0.1;
}

/** Axis-aligned footprint of a turned prop: [x0, x1, z0, z1]. */
function rect(f: Furn): number[] {
  const size = IC.props[f.k];
  const c = Math.abs(Math.cos(f.r)), s = Math.abs(Math.sin(f.r));
  const hw = (c * size.w + s * size.d) / 2, hd = (s * size.w + c * size.d) / 2;
  return [f.x - hw, f.x + hw, f.z - hd, f.z + hd];
}

/** Shared area over the smaller footprint (0–1). */
function overlap(a: Furn, b: Furn): number {
  const [a0, a1, a2, a3] = rect(a), [b0, b1, b2, b3] = rect(b);
  const w = Math.min(a1, b1) - Math.max(a0, b0), d = Math.min(a3, b3) - Math.max(a2, b2);
  if (w <= 0 || d <= 0) return 0;
  return (w * d) / Math.min((a1 - a0) * (a3 - a2), (b1 - b0) * (b3 - b2));
}

function overlapsBox(f: Furn, [bx, bz, hw, hd]: number[]): number {
  const [a0, a1, a2, a3] = rect(f);
  const w = Math.min(a1, bx + hw) - Math.max(a0, bx - hw), d = Math.min(a3, bz + hd) - Math.max(a2, bz - hd);
  if (w <= 0 || d <= 0) return 0;
  return (w * d) / ((a1 - a0) * (a3 - a2));
}
