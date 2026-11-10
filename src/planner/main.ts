/**
 * Harita Planlayıcı: an in-game editor that grows a Harvest map from sliders and a seed, then lets you
 * place, move, erase, raise, paint effect regions and furnish buildings by hand. Open /planner.html.
 *
 * Layout: tool rail (left), the active tool's options (drawer), the map settings in tabs (right panel),
 * the interior designer in place of the panel while you are inside a building.
 */
import { sporLodModels } from '../spor';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Engine } from '@babylonjs/core/Engines/engine';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { Scene } from '@babylonjs/core/scene';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Tools } from '@babylonjs/core/Misc/tools';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import '@babylonjs/core/Culling/ray';
import '@fontsource-variable/shantell-sans/infm.css';
import '@fontsource/fredoka/400.css';
import './planner.css';
import { setLookScene } from '../look';
import { isLucky } from '../shop.ts';
import { getLang, setLang } from '../i18n';
import { BIOMES, DEFAULT_PARAMS, EDIT, Field, KINDS, KIND_LIST, NB, SPOR_KINDS, applyOps, generate, withKindScale, type Category, type Kind, type MapFile, type Obj, type Op, type Params, type SporGroup } from '../mapgen/generate';
import { FX, defaultFx, fxAt, type FxValues, type MapFx } from '../mapgen/fx';
import { emptyInteriors, moveOverride, type Interiors } from '../mapgen/interior';
import { Atmosphere, DEFAULT_ATMOS, PRESETS, type Atmos, type PresetId } from './atmos';
import { MapView, type Area } from './build';
import { vendorCount } from '../mapgen/vendors.ts';
import { PLANNER_SAVE_KEY, parseMapFile } from '../mapgen/mapfile';
import { InteriorView, enterable, placedProps } from '../interiors';
import { FxEditor, ZONE_COLORS } from './fxzones';
import { InteriorDesigner } from './interior';
import { icon } from './icons';
import { kindName, t } from './strings';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('view');
const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
const scene = new Scene(engine);
setLookScene(scene);
document.documentElement.lang = getLang();
document.title = `${t('pl.title')} · Vampire Battleground`;

const MIN_ORBIT_RADIUS = 2;
/** Minimap side in pixels. */
const MINIMAP_PX = 128;
const camera = new ArcRotateCamera('cam', -Math.PI / 2 + 0.6, 1.05, 230, new Vector3(0, 0, 0), scene);
camera.minZ = 0.3;
camera.maxZ = 3000;
camera.fov = 0.9;
camera.lowerRadiusLimit = MIN_ORBIT_RADIUS;
camera.upperRadiusLimit = 600;
camera.upperBetaLimit = 1.5;
camera.wheelDeltaPercentage = 0.02;
camera.panningSensibility = 40;
camera.attachControl(canvas, true);
// Right drag turns the camera in every tool, middle drag pans; WASD and the arrows move (see below).
camera.movement.input.setInteraction('pointer', { button: 2 }, 'rotate');
camera.movement.input.setInteraction('pointer', { button: 1 }, 'pan');
camera.inputs.removeByType('ArcRotateCameraKeyboardMoveInput');
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// ?q=low: half resolution and lighter shadows for slow machines.
const LOW = new URLSearchParams(location.search).get('q') === 'low';
if (LOW) engine.setHardwareScalingLevel(1.6);
const atmos = new Atmosphere(scene, camera, LOW);
const view = new MapView(scene);
view.onCasters = (m) => atmos.cast(m);
view.viewRadius = 800;
atmos.exclude(view.water);
// Spor Ormanı objects show their real Blender models, not stand-ins.
sporLodModels(scene).then(
  (list) => list.forEach(([k, m]) => view.useModels(k, [m])),
  (e) => console.error('Spor Ormanı models failed to load', e),
);
const interiorView = new InteriorView(scene);
interiorView.onCasters = (m) => atmos.cast(m);

// ---- State --------------------------------------------------------------------------------
type State = { gen: Params; ops: Op[]; atmos: Atmos; fx: MapFx; interiors: Interiors };
const SAVE_KEY = PLANNER_SAVE_KEY;
const fresh = (): State => ({ gen: structuredClone(DEFAULT_PARAMS), ops: [], atmos: { ...DEFAULT_ATMOS }, fx: defaultFx(), interiors: emptyInteriors() });
const fromFile = (f: MapFile): State => ({
  gen: { ...DEFAULT_PARAMS, ...f.gen },
  ops: f.ops ?? [],
  atmos: { ...DEFAULT_ATMOS, ...(f.atmos as Partial<Atmos>) },
  fx: f.fx ?? defaultFx(),
  interiors: f.interiors ?? emptyInteriors(),
});
const toFile = (): MapFile => ({ v: 1, gen: S.gen, ops: S.ops, atmos: S.atmos, fx: S.fx, interiors: S.interiors });
function load(): State {
  try {
    const parsed = parseMapFile(localStorage.getItem(SAVE_KEY));
    return parsed.ok ? fromFile(parsed.map) : fresh();
  } catch {
    return fresh();
  }
}
let S = load();
const url = new URLSearchParams(location.search);
if (url.get('seed')) S.gen.seed = Number(url.get('seed')) || S.gen.seed;
const undo: string[] = [];
const redo: string[] = [];
const snap = () => JSON.stringify(S);
function commit() {
  undo.push(snap());
  if (undo.length > EDIT.undoSteps) undo.shift();
  redo.length = 0;
}
function save() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(toFile()));
  } catch {
    /* storage may be blocked; the map still works for this visit */
  }
}

// ---- Build --------------------------------------------------------------------------------
let field = new Field(S.gen, S.ops);
let objs: Obj[] = [];
let genKey = '';
let genCache: Obj[] = [];
/**
 * Rebuild the map from the state. With areas, only the chunks those areas touch are redrawn
 * (a brush stroke or a moved object); the minimap waits for the stroke to end (`mini = false`).
 */
function rebuild(terrain = true, areas?: Area[], mini = true) {
  const t0 = performance.now();
  field = new Field(S.gen, S.ops);
  // Hand lifts do not change what grows (generate() ignores them), so only the settings matter.
  const key = JSON.stringify(S.gen);
  if (key !== genKey) {
    genCache = generate(field);
    genKey = key;
    areas = undefined;
  }
  objs = applyOps(genCache, S.ops);
  if (terrain) view.buildTerrain(field, areas);
  // Houses are drawn at their in-game size (HOUSE_SCALE); objs keep the hand-set size the editor saves.
  view.buildObjects(field, objs.map(withKindScale), areas);
  atmos.setMapSize(S.gen.size);
  camera.upperRadiusLimit = designer.active ? 60 : Math.min(S.gen.size * 2, 3000);
  camera.maxZ = Math.max(3000, Math.min(S.gen.size * 2, 3000) + S.gen.size);
  if (mini) drawMinimap(terrain);
  mirrorLines();
  fxEdit.draw();
  redrawInteriors();
  $('stat-count').textContent = `${t('pl.objects', { n: objs.length })} · ${t('pl.vendors', { n: objs.filter((o) => o.k === 'satici' || o.k === 'sansli').length })}`;
  $('stat-time').textContent = `${Math.round(performance.now() - t0)} ms`;
  save();
}

function redrawInteriors() {
  interiorView.set(placedProps({ field, mapObjects: objs.map(withKindScale), mapFile: { v: 1, gen: S.gen, ops: [], interiors: S.interiors } })).catch((e) => console.error('Interior props failed to load', e));
}

let pending = 0;
/** Debounced rebuild for sliders being dragged. */
function soon(terrain = true) {
  clearTimeout(pending);
  // Big maps take seconds to grow: wait until the slider rests.
  pending = window.setTimeout(() => rebuild(terrain), S.gen.size > 1000 ? 450 : 120);
}

// ---- Effect regions and the interior designer -----------------------------------------------
const fxEdit = new FxEditor({
  scene,
  fx: () => S.fx,
  field: () => field,
  commit,
  save,
  changed: () => {
    drawMinimap(false);
    if (tab === 'fx') renderTab();
  },
  exclude: (m) => atmos.exclude(m),
});

const designer: InteriorDesigner = new InteriorDesigner({
  scene,
  camera,
  panel: $('inside'),
  interiors: () => S.interiors,
  field: () => field,
  objs: () => objs,
  commit,
  save,
  redraw: redrawInteriors,
  flash,
  changed: (inside) => {
    document.body.classList.toggle('inside', inside);
    if (inside) setTool('view');
    crumbs();
    syncToolbar();
  },
});

function crumbs() {
  const el = $('crumbs');
  el.innerHTML = `<span>${t('pl.title')}</span>${designer.house ? `<span class="sep">/</span><span>${t('in.title')}</span><span class="sep">/</span><em>${kindName(designer.house.k)}</em>` : `<em>${t('pl.world')}</em>`}`;
}

// ---- Panels -------------------------------------------------------------------------------
type Slider = { key: string; min: number; max: number; step: number; fmt?: (v: number) => string };
const km = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(2)} km` : `${v} m`);
const TERRAIN: Slider[] = [
  { key: 'size', min: 160, max: 4000, step: 10, fmt: km },
  { key: 'relief', min: 0, max: 2.5, step: 0.05 },
  { key: 'roughness', min: 0.4, max: 2.5, step: 0.05 },
  { key: 'water', min: -4, max: 4, step: 0.1, fmt: (v) => `${v.toFixed(1)} m` },
  { key: 'canyon', min: 0, max: 2, step: 0.05 },
  { key: 'warp', min: 0, max: 1.2, step: 0.05 },
  { key: 'core', min: 0.04, max: 0.4, step: 0.01 },
];
const DENSITY: Slider[] = [
  { key: 'trees', min: 0, max: 2.5, step: 0.05 },
  { key: 'mushrooms', min: 0, max: 2.5, step: 0.05 },
  { key: 'giants', min: 0, max: 2.5, step: 0.05 },
  { key: 'mech', min: 0, max: 2.5, step: 0.05 },
  { key: 'ruins', min: 0, max: 2.5, step: 0.05 },
  { key: 'rocks', min: 0, max: 2.5, step: 0.05 },
  { key: 'dots', min: 0, max: 2.5, step: 0.05 },
  { key: 'scale', min: 0.6, max: 1.8, step: 0.05 },
  { key: 'vendors', min: 0, max: 2, step: 0.25, fmt: (v) => (v ? t('s.vendors.n', { n: Math.max(Math.round(vendorCount(S.gen.size) * v), S.gen.symmetry ? 1 : S.gen.biomes.filter(Boolean).length) }) : t('s.vendors.0')) },
];
const deg = (v: number) => `${v}°`;
const SKY: Slider[] = [
  { key: 'sunAz', min: 0, max: 360, step: 1, fmt: deg },
  { key: 'sunEl', min: 1, max: 70, step: 0.5, fmt: deg },
  { key: 'sunSize', min: 0.4, max: 3, step: 0.05 },
  { key: 'warmth', min: 0, max: 1, step: 0.02 },
  { key: 'exposure', min: 0.5, max: 1.8, step: 0.02 },
  { key: 'bloom', min: 0, max: 2, step: 0.05 },
  { key: 'rays', min: 0, max: 1.5, step: 0.05 },
  { key: 'ink', min: 0, max: 1, step: 0.02 },
  { key: 'grain', min: 0, max: 1, step: 0.02 },
];
const AIR: Slider[] = [
  { key: 'fog', min: 0, max: 3, step: 0.05 },
  { key: 'fogHeight', min: 1, max: 40, step: 0.5, fmt: (v) => `${v} m` },
  { key: 'haze', min: 0, max: 2, step: 0.05 },
  { key: 'spores', min: 0, max: 3, step: 0.05 },
  { key: 'koi', min: 0, max: 3, step: 1 },
];

function slider(host: HTMLElement, s: Slider, get: () => number, set: (v: number) => void) {
  const row = document.createElement('label');
  row.className = 'row';
  const fmt = s.fmt ?? ((v: number) => (Number.isInteger(s.step) ? `${v}` : v.toFixed(2)));
  row.innerHTML = `<span class="lbl">${t(`s.${s.key}`)}</span><span class="val"></span><input type="range" min="${s.min}" max="${s.max}" step="${s.step}">`;
  const input = row.querySelector('input')!;
  const val = row.querySelector('.val')!;
  input.value = String(get());
  val.textContent = fmt(get());
  let started = false;
  input.addEventListener('input', () => {
    if (!started) {
      commit();
      started = true;
    }
    set(Number(input.value));
    val.textContent = fmt(Number(input.value));
  });
  input.addEventListener('change', () => (started = false));
  host.appendChild(row);
}

function heading(host: HTMLElement, text: string) {
  const h = document.createElement('h3');
  h.textContent = text;
  host.appendChild(h);
}

function check(host: HTMLElement, label: string, get: () => boolean, set: (v: boolean) => void, swatch?: string) {
  const row = document.createElement('label');
  row.className = 'chk';
  row.innerHTML = `<input type="checkbox">${swatch ? `<i style="${swatch}"></i>` : ''}<span>${label}</span>`;
  const c = row.querySelector('input')!;
  c.checked = get();
  c.addEventListener('change', () => set(c.checked));
  host.appendChild(row);
}

type Tab = 'land' | 'objects' | 'sky' | 'fx' | 'file';
const TABS: Tab[] = ['land', 'objects', 'sky', 'fx', 'file'];
let tab: Tab = 'land';
try {
  tab = (TABS as string[]).includes(localStorage.getItem('bgv-planner-tab') ?? '') ? (localStorage.getItem('bgv-planner-tab') as Tab) : 'land';
} catch {
  /* private mode */
}

function buildTabs() {
  const bar = $('tabs');
  bar.innerHTML = '';
  for (const id of TABS) {
    const b = document.createElement('button');
    b.role = 'tab';
    b.textContent = t(`tab.${id}`);
    b.setAttribute('aria-selected', String(id === tab));
    b.addEventListener('click', () => {
      tab = id;
      try {
        localStorage.setItem('bgv-planner-tab', id);
      } catch {
        /* ignore */
      }
      bar.querySelectorAll('button').forEach((x, i) => x.setAttribute('aria-selected', String(TABS[i] === tab)));
      renderTab();
    });
    bar.appendChild(b);
  }
}

function renderTab() {
  const body = $('panel-body');
  body.innerHTML = '';
  fxEdit.show = tab === 'fx' || tool === 'zone';
  fxEdit.draw();
  if (tab === 'land') {
    heading(body, t('sec.seed'));
    const seed = document.createElement('div');
    seed.className = 'seed';
    seed.innerHTML = `<input type="number" min="1" step="1" aria-label="${t('sec.seed')}"><button class="icon-btn amber" title="${t('seed.dice')}">${icon('dice')}</button>`;
    const seedIn = seed.querySelector('input')!;
    seedIn.value = String(S.gen.seed);
    seedIn.addEventListener('change', () => {
      commit();
      S.gen.seed = Math.max(1, Math.floor(Number(seedIn.value) || 1));
      rebuild();
    });
    seed.querySelector('button')!.addEventListener('click', randomSeed);
    body.appendChild(seed);
    const sym = document.createElement('label');
    sym.className = 'row';
    sym.innerHTML = `<span class="lbl">${t('sym')}</span><select>${[0, 1, 2].map((i) => `<option value="${i}">${t(`sym.${i}`)}</option>`).join('')}</select>`;
    const symIn = sym.querySelector('select')!;
    symIn.value = String(S.gen.symmetry);
    symIn.addEventListener('change', () => {
      commit();
      S.gen.symmetry = Number(symIn.value) as 0 | 1 | 2;
      rebuild();
    });
    body.appendChild(sym);
    heading(body, t('sec.landscapes'));
    BIOMES.forEach((b, i) =>
      check(body, b.name, () => S.gen.biomes[i], (v) => {
        commit();
        S.gen.biomes[i] = v;
        rebuild();
      }, `background:${b.ground[1]};border-color:${b.accent}`),
    );
    for (const key of ['cathedral', 'colossus'] as const)
      check(body, t(key), () => S.gen[key], (v) => {
        commit();
        S.gen[key] = v;
        rebuild();
      }, 'background:var(--paper-2)');
    heading(body, t('sec.terrain'));
    for (const s of TERRAIN) slider(body, s, () => S.gen[s.key as keyof Params] as number, (v) => ((S.gen as Record<string, unknown>)[s.key] = v, soon(true)));
  } else if (tab === 'objects') {
    heading(body, t('sec.density'));
    for (const s of DENSITY) slider(body, s, () => S.gen[s.key as keyof Params] as number, (v) => ((S.gen as Record<string, unknown>)[s.key] = v, soon(false)));
  } else if (tab === 'sky') {
    heading(body, t('sec.presets'));
    const presets = document.createElement('div');
    presets.className = 'presets';
    for (const id of Object.keys(PRESETS) as PresetId[]) {
      const b = document.createElement('button');
      b.textContent = PRESETS[id].name;
      b.className = id === S.atmos.preset ? 'on' : '';
      const pal = PRESETS[id].pal;
      b.style.setProperty('--a', pal.horizon);
      b.style.setProperty('--b', pal.zenith);
      b.addEventListener('click', () => {
        commit();
        S.atmos = { ...S.atmos, ...PRESETS[id].atmos, preset: id };
        applyAtmos();
        renderTab();
      });
      presets.appendChild(b);
    }
    body.appendChild(presets);
    heading(body, t('sec.air'));
    for (const s of AIR) slider(body, s, () => S.atmos[s.key as keyof Atmos] as number, (v) => ((S.atmos as Record<string, unknown>)[s.key] = v, applyAtmos()));
    check(body, t('ring'), () => S.atmos.ring, (v) => ((S.atmos.ring = v), applyAtmos()), 'background:var(--rose)');
    heading(body, t('sec.light'));
    for (const s of SKY) slider(body, s, () => S.atmos[s.key as keyof Atmos] as number, (v) => ((S.atmos as Record<string, unknown>)[s.key] = v, applyAtmos()));
  } else if (tab === 'fx') {
    fxEdit.renderTab(body);
    const here = document.createElement('p');
    here.className = 'here';
    here.id = 'fx-here';
    body.appendChild(here);
  } else {
    body.innerHTML = `<p class="note">${t('file.note')}</p><div class="files">
      <button class="btn primary" data-f="play">${icon('play', 16)}<span>${t('file.play')}</span></button>
      <button class="btn" data-f="export">${icon('down', 16)}<span>${t('file.export')}</span></button>
      <button class="btn" data-f="import">${icon('up', 16)}<span>${t('file.import')}</span></button>
      <hr><button class="btn ghost" data-f="clear">${icon('erase', 16)}<span>${t('file.clear')}</span></button>
      <button class="btn ghost danger" data-f="reset">${icon('undo', 16)}<span>${t('file.reset')}</span></button></div>`;
    const on = (f: string, fn: () => void) => body.querySelector(`[data-f=${f}]`)!.addEventListener('click', fn);
    on('play', playInGame);
    on('export', exportMap);
    on('import', () => $<HTMLInputElement>('file').click());
    on('clear', clearEdits);
    on('reset', resetMap);
  }
}

function applyAtmos() {
  atmos.set(S.atmos);
  atmos.setLocal(local);
  save();
}

function randomSeed() {
  commit();
  S.gen.seed = 1 + Math.floor(Math.random() * 99999);
  if (tab === 'land') renderTab();
  rebuild();
}

// ---- Tools --------------------------------------------------------------------------------
type Tool = 'view' | 'place' | 'move' | 'erase' | 'raise' | 'lower' | 'zone' | 'walk';
type Action = Tool | 'mirror' | 'undo' | 'redo' | 'photo' | 'hide';
let tool: Tool = 'view';
let mirror = 0; // 0 none, 1 x, 2 z, 3 both
let brush = 6;
let strength = 1;
let placeKind: Kind = 'ev_kule';
let palGroup = 'all';
let palFilter = '';

const RAIL: ({ grp: string } | { id: Action; icon: string; key: string; act?: true })[] = [
  { grp: 'grp.look' },
  { id: 'view', icon: 'view', key: '1' },
  { id: 'walk', icon: 'walk', key: 'Y' },
  { grp: 'grp.edit' },
  { id: 'place', icon: 'place', key: '2' },
  { id: 'move', icon: 'move', key: '6' },
  { id: 'erase', icon: 'erase', key: '3' },
  { id: 'zone', icon: 'zone', key: 'Z' },
  { grp: 'grp.ground' },
  { id: 'raise', icon: 'raise', key: '4' },
  { id: 'lower', icon: 'lower', key: '5' },
  { grp: '' },
  { id: 'mirror', icon: 'mirror', key: 'M', act: true },
  { id: 'undo', icon: 'undo', key: 'Ctrl Z', act: true },
  { id: 'redo', icon: 'redo', key: 'Ctrl Y', act: true },
  { id: 'photo', icon: 'photo', key: 'P', act: true },
  { id: 'hide', icon: 'hide', key: 'H', act: true },
];

function buildToolbar() {
  const bar = $('tools');
  bar.innerHTML = '';
  for (const r of RAIL) {
    if ('grp' in r) {
      if (r.grp) bar.insertAdjacentHTML('beforeend', `<div class="grp">${t(r.grp)}</div>`);
      else bar.insertAdjacentHTML('beforeend', '<hr>');
      continue;
    }
    const b = document.createElement('button');
    b.dataset.tool = r.id;
    if (r.act) b.className = 'act';
    b.setAttribute('aria-label', t(`tool.${r.id}`));
    b.innerHTML = `${icon(r.icon)}${r.act ? '' : `<span class="lbl">${t(`tool.${r.id}`)}</span>`}<span class="tip">${t(`tool.${r.id}`)} <kbd>${r.key}</kbd></span>`;
    b.addEventListener('click', () => toolAction(r.id));
    bar.appendChild(b);
  }
}

/** Kinds by palette group: the Spor Ormanı groups first, then the old procedural kit by category. */
const SPOR_GROUPS: SporGroup[] = ['ev', 'kopru', 'anit', 'mantar', 'agac', 'tas', 'ucan', 'kamp', 'esya'];
const KIT_CATS: Category[] = ['trees', 'mushrooms', 'giants', 'mech', 'ruins', 'rocks', 'dots', 'landmark'];
function groupOf(k: Kind): string {
  const d = (SPOR_KINDS as Record<string, { group: SporGroup }>)[k];
  if (d) return d.group;
  if (k === 'morel' || k === 'cimen' || k === 'atesbocegi') return 'mantar';
  return 'kit';
}

/** The drawer: the active tool's options (palette, brush, selection). */
function renderDrawer() {
  const d = $('drawer');
  const show = ['place', 'erase', 'raise', 'lower'].includes(tool) || (tool === 'move' && !!sel);
  d.classList.toggle('hidden', !show);
  if (!show) return;
  d.innerHTML = '';
  if (tool === 'move' && sel) {
    const blk = document.createElement('div');
    blk.className = 'blk';
    blk.innerHTML = `<div class="sel-row"><b>${kindName(sel.k)}</b></div>`;
    slider(blk, { key: 'objsize', min: SIZE_MIN, max: SIZE_MAX, step: 0.05, fmt: (v) => `${v.toFixed(2)}×` }, () => sel?.s ?? 1, (v) => resizeSel(v, false));
    if (enterable(sel.k)) {
      const go = document.createElement('button');
      go.className = 'btn primary';
      go.innerHTML = `${icon('door', 16)}<span>${t('sel.enter')}</span>`;
      go.addEventListener('click', () => {
        const o = objs.find((x) => x.k === sel!.k && Math.abs(x.x - sel!.x) < 0.05 && Math.abs(x.z - sel!.z) < 0.05);
        if (o) designer.enter(o);
      });
      blk.appendChild(go);
    }
    d.appendChild(blk);
    return;
  }
  if (tool === 'place') {
    const head = document.createElement('div');
    head.className = 'blk';
    head.innerHTML = `<label class="search">${icon('search', 16)}<input type="search" placeholder="${t('pal.search')}"></label><div class="groups"></div>`;
    const search = head.querySelector('input')!;
    search.value = palFilter;
    search.addEventListener('input', () => {
      palFilter = search.value;
      renderKinds(list);
    });
    const groups = head.querySelector('.groups')!;
    for (const g of ['all', ...SPOR_GROUPS, 'kit']) {
      const b = document.createElement('button');
      b.textContent = g === 'all' ? t('pal.all') : t(`grp.${g}`);
      b.className = g === palGroup ? 'on' : '';
      b.addEventListener('click', () => {
        palGroup = g;
        groups.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
        renderKinds(list);
      });
      groups.appendChild(b);
    }
    d.appendChild(head);
    const list = document.createElement('div');
    list.className = 'blk grow';
    d.appendChild(list);
    renderKinds(list);
  }
  const bb = document.createElement('div');
  bb.className = 'blk';
  slider(bb, { key: 'brush', min: 1, max: 30, step: 0.5, fmt: (v) => `${v} m` }, () => brush, (v) => ((brush = v), cursorScale()));
  if (tool === 'raise' || tool === 'lower') slider(bb, { key: 'strength', min: 0.2, max: 4, step: 0.1 }, () => strength, (v) => (strength = v));
  d.appendChild(bb);
}

function renderKinds(host: HTMLElement) {
  const q = palFilter.trim().toLocaleLowerCase();
  const match = (k: Kind) => !q || kindName(k).toLocaleLowerCase().includes(q) || k.includes(q);
  const sections: [string, Kind[]][] = [];
  for (const g of SPOR_GROUPS) if (palGroup === 'all' || palGroup === g) sections.push([t(`grp.${g}`), KIND_LIST.filter((k) => groupOf(k) === g && match(k))]);
  if (palGroup === 'all' || palGroup === 'kit')
    for (const c of KIT_CATS) sections.push([`${t('grp.kit')} · ${t(`cat.${c}`)}`, KIND_LIST.filter((k) => groupOf(k) === 'kit' && KINDS[k].cat === c && match(k))]);
  const shown = sections.filter(([, ks]) => ks.length);
  host.innerHTML = shown.length ? shown.map(([title, ks]) => `<h4>${title}</h4><div class="kinds">${ks.map((k) => `<button data-kind="${k}" class="${k === placeKind ? 'on' : ''}">${kindName(k)}</button>`).join('')}</div>`).join('') : `<p class="note">${t('pal.none')}</p>`;
  host.querySelectorAll<HTMLButtonElement>('[data-kind]').forEach((b) =>
    b.addEventListener('click', () => {
      placeKind = b.dataset.kind as Kind;
      host.querySelectorAll('[data-kind]').forEach((x) => x.classList.toggle('on', x === b));
      cursorScale();
      syncToolbar();
    }),
  );
}

function toolAction(id: Action) {
  if (id === 'mirror') {
    mirror = (mirror + 1) % 4;
    flash(t(`mirror.${mirror}`));
    mirrorLines();
    syncToolbar();
  } else if (id === 'undo') doUndo();
  else if (id === 'redo') doRedo();
  else if (id === 'photo') photo();
  else if (id === 'hide') document.body.classList.toggle('clean');
  else setTool(id === tool && id !== 'view' ? 'view' : id);
}

function syncToolbar() {
  document.querySelectorAll<HTMLButtonElement>('#tools button').forEach((b) => {
    b.classList.toggle('on', b.dataset.tool === tool || (b.dataset.tool === 'mirror' && mirror > 0));
  });
  const hint = designer.active ? designer.hint() : t(`hint.${tool}`, { kind: kindName(placeKind) });
  $('hint').textContent = hint + (mirror && !designer.active ? ` · ${t(`mirror.${mirror}`)}` : '');
}

function setTool(next: Tool) {
  const was = tool;
  tool = next;
  const pointers = camera.inputs.attached.pointers as unknown as { buttons: number[] };
  pointers.buttons = next === 'view' || next === 'walk' ? [0, 1, 2] : [1, 2];
  if (next === 'walk') enterWalk();
  else if (was === 'walk') exitWalk();
  cursor.setEnabled(['erase', 'raise', 'lower', 'place', 'move'].includes(next));
  if (next !== 'move') select(null);
  cursorScale();
  fxEdit.show = tab === 'fx' || next === 'zone';
  fxEdit.draw();
  renderDrawer();
  syncToolbar();
}

function doUndo() {
  select(null);
  const s = undo.pop();
  if (!s) return flash(t('flash.noUndo'));
  redo.push(snap());
  restore(JSON.parse(s));
}
function doRedo() {
  select(null);
  const s = redo.pop();
  if (!s) return;
  undo.push(snap());
  restore(JSON.parse(s));
}

/** Map areas an op changes (objects are drawn by their center, so a small circle finds their chunk). Returns true when it moves the ground. */
function opAreas(op: Op, out: Area[]): boolean {
  if (op.t === 'add') out.push({ x: op.o.x, z: op.o.z, r: 2 });
  else if (op.t === 'erase') out.push({ x: op.x, z: op.z, r: op.r + 2 });
  else if (op.t === 'move') out.push({ x: op.x, z: op.z, r: 2 }, { x: op.nx, z: op.nz, r: 2 });
  else {
    // A lift reaches twice its radius (Field.rawHeight).
    out.push({ x: op.x, z: op.z, r: op.r * 2 + 2 });
    return true;
  }
  return false;
}

/**
 * Switch to an undo or redo state. Only the chunks the differing hand edits touch are redrawn;
 * the whole map is rebuilt only when the settings differ (or the edits are too many to redraw one by one).
 */
function restore(next: State) {
  const prev = S;
  S = next;
  renderTab();
  applyAtmos();
  fxEdit.draw();
  designer.render();
  drawMinimap(false);
  if (JSON.stringify(prev.gen) !== JSON.stringify(next.gen)) return rebuild();
  const a = prev.ops, b = next.ops;
  const n = Math.min(a.length, b.length);
  let k = 0;
  while (k < n && JSON.stringify(a[k]) === JSON.stringify(b[k])) k++;
  if (k === a.length && k === b.length) {
    // Only the atmosphere, the regions or the interiors changed.
    redrawInteriors();
    save();
    return;
  }
  const areas: Area[] = [];
  let terrain = false;
  for (let i = k; i < a.length; i++) terrain = opAreas(a[i], areas) || terrain;
  for (let i = k; i < b.length; i++) terrain = opAreas(b[i], areas) || terrain;
  if (areas.length > EDIT.undoMaxAreas) rebuild();
  else rebuild(terrain, areas);
}

let flashTimer = 0;
function flash(msg: string) {
  const el = $('flash');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(flashTimer);
  flashTimer = window.setTimeout(() => el.classList.remove('show'), 1800);
}

function photo() {
  document.body.classList.add('clean');
  setTimeout(() => {
    Tools.CreateScreenshot(engine, camera, { precision: 2 }, (data) => {
      const a = document.createElement('a');
      a.href = data;
      a.download = `harita-${S.gen.seed}.png`;
      a.click();
      document.body.classList.remove('clean');
    });
  }, 60);
}

// ---- Brush cursor and mirror guides ------------------------------------------------------
const cursor = MeshBuilder.CreateTorus('cursor', { diameter: 2, thickness: 0.12, tessellation: 48 }, scene);
const cursorMat = new StandardMaterial('glow-cursor', scene);
cursorMat.disableLighting = true;
cursorMat.emissiveColor = Color3.FromHexString('#f2b33d');
cursor.material = cursorMat;
cursor.isPickable = false;
cursor.setEnabled(false);
atmos.exclude(cursor);
function cursorScale() {
  const r = tool === 'place' ? Math.max(1, KINDS[placeKind].r * S.gen.scale) : tool === 'move' ? (sel ? Math.max(1, KINDS[sel.k].r * sel.s) : 2) : brush;
  cursor.scaling.set(r, 1, r);
}

let guides: Mesh[] = [];
function mirrorLines() {
  guides.forEach((g) => g.dispose());
  guides = [];
  const size = S.gen.size;
  const add = (along: 'x' | 'z') => {
    const g = MeshBuilder.CreateBox('mirror-guide', { width: along === 'x' ? size : 0.3, depth: along === 'z' ? size : 0.3, height: 40 }, scene);
    g.position.y = 10;
    g.material = cursorMat;
    g.visibility = 0.25;
    g.isPickable = false;
    atmos.exclude(g);
    guides.push(g);
  };
  if (mirror === 1 || mirror === 3) add('z');
  if (mirror === 2 || mirror === 3) add('x');
}

/** The point plus its mirror copies. */
function mirrored(x: number, z: number): [number, number, number][] {
  const out: [number, number, number][] = [[x, z, 0]];
  if (mirror === 1 || mirror === 3) out.push([-x, z, 1]);
  if (mirror === 2 || mirror === 3) out.push([x, -z, 2]);
  if (mirror === 3) out.push([-x, -z, 3]);
  return out;
}

// ---- Pointer editing ---------------------------------------------------------------------
let painting = false;
let lastPaint: Vector3 | null = null;
let lastTerrain = 0;
function groundPick(): Vector3 | null {
  const hit = scene.pick(scene.pointerX, scene.pointerY, (m) => view.isTerrain(m));
  return hit?.hit && hit.pickedPoint ? hit.pickedPoint : null;
}

/** Areas this stroke touched: redrawn when it ends. `fresh` holds the ones the terrain has not shown yet. */
let stroke: Area[] = [];
let freshAreas: Area[] = [];
function paintAt(p: Vector3) {
  const spacing = tool === 'place' ? Math.max(1.5, KINDS[placeKind].r * S.gen.scale * 2) : Math.max(0.8, brush * 0.4);
  if (lastPaint && Vector3.Distance(lastPaint, p) < spacing) return;
  lastPaint = p.clone();
  const reach = tool === 'place' ? KINDS[placeKind].r * S.gen.scale * 2.5 + 2 : brush + 2;
  const touched = mirrored(p.x, p.z).map(([x, z]) => ({ x, z, r: reach }));
  stroke.push(...touched);
  freshAreas.push(...touched);
  for (const [x, z, m] of mirrored(p.x, p.z)) {
    if (tool === 'place') {
      const def = KINDS[placeKind];
      const s = (def.s[0] + Math.random() * (def.s[1] - def.s[0])) * (placeKind === 'nokta' ? 1 : S.gen.scale);
      let r = Math.random() * Math.PI * 2;
      if (S.gen.symmetry === 0 && m === 1) r = -r;
      S.ops.push({ t: 'add', o: { k: placeKind, x, z, s, r, v: Math.floor(Math.random() * 1000), m: 1 } });
    } else if (tool === 'erase') S.ops.push({ t: 'erase', x, z, r: brush });
    else S.ops.push({ t: 'lift', x, z, r: brush, a: (tool === 'raise' ? 0.6 : -0.6) * strength });
  }
  if (tool === 'raise' || tool === 'lower') {
    // Terrain is the slow part: refresh it at most ~8 times a second while dragging.
    const now = performance.now();
    if (now - lastTerrain > 80) {
      lastTerrain = now;
      field = new Field(S.gen, S.ops);
      view.buildTerrain(field, freshAreas);
      freshAreas = [];
    }
  } else {
    rebuild(false, touched, false);
    freshAreas = [];
  }
}

// ---- Move tool: select an object, drag it, resize it -------------------------------------
type MoveOp = Extract<Op, { t: 'move' }>;
/** The selected object as it stands now (position and size after every op). */
let sel: { k: Kind; x: number; z: number; s: number } | null = null;
/** The move op that holds the selection's changes. Edited in place while it is the last op. */
let selOp: MoveOp | null = null;
let dragging = false;
let lastMove = 0;
const SIZE_MIN = 0.2;
const SIZE_MAX = 6;
/** The object under the cursor: the nearest one whose footprint holds the point. */
function objectAt(p: Vector3): Obj | null {
  let best: Obj | null = null;
  let bestD = Infinity;
  for (const o of objs) {
    const r = Math.max(1, KINDS[o.k].r * o.s);
    const d = ((o.x - p.x) ** 2 + (o.z - p.z) ** 2) / (r * r);
    // Prefer real objects over floor dots when both are under the cursor.
    const score = o.k === 'nokta' ? d + 0.5 : d;
    if (d <= 1 && score < bestD) {
      bestD = score;
      best = o;
    }
  }
  return best;
}
const selArea = (x: number, z: number) => ({ x, z, r: sel ? KINDS[sel.k].r * sel.s * 2.5 + 2 : 4 });
/** The op to edit for the selection: the last op if it is ours, else a new one (with an undo step). */
function selEdit(doCommit: boolean): MoveOp | null {
  if (!sel) return null;
  if (!selOp || S.ops[S.ops.length - 1] !== selOp) {
    if (doCommit) commit();
    selOp = { t: 'move', k: sel.k, x: sel.x, z: sel.z, nx: sel.x, nz: sel.z };
    S.ops.push(selOp);
  }
  return selOp;
}
function moveTo(p: Vector3, final: boolean) {
  const op = selOp;
  if (!sel || !op) return;
  const before = selArea(op.nx, op.nz);
  op.nx = p.x;
  op.nz = p.z;
  const now = performance.now();
  if (!final && now - lastMove < 50) return;
  lastMove = now;
  rebuild(false, [before, selArea(p.x, p.z)], final);
}
/** Set the selected object's size (its `s`), saved in the map file as the move op's `ns`. */
function resizeSel(v: number, doCommit: boolean) {
  const op = selEdit(doCommit);
  if (!sel || !op) return;
  const area = selArea(op.nx, op.nz);
  sel.s = op.ns = Math.max(SIZE_MIN, Math.min(SIZE_MAX, Math.round(v * 100) / 100));
  rebuild(false, [area, selArea(op.nx, op.nz)], false);
  cursorScale();
}
function select(o: Obj | null) {
  const had = !!sel;
  sel = o && { k: o.k, x: o.x, z: o.z, s: o.s };
  selOp = null;
  cursorScale();
  if (had || sel) renderDrawer();
}
// The wheel resizes the object (or region) while you hold it, instead of zooming.
canvas.addEventListener(
  'wheel',
  (e) => {
    const used = (dragging && sel && (resizeSel(sel.s * (e.deltaY < 0 ? 1.08 : 1 / 1.08), false), true)) || (tool === 'zone' && fxEdit.wheel(e.deltaY));
    if (!used) return;
    e.preventDefault();
    e.stopImmediatePropagation();
  },
  { capture: true, passive: false },
);

// Double-click a building to furnish it.
canvas.addEventListener('dblclick', () => {
  if (designer.active || tool === 'walk') return;
  const p = groundPick();
  const o = p && objectAt(p);
  if (designer.canEnter(o)) designer.enter(o);
});

scene.onPointerObservable.add((ev) => {
  const e = ev.event as PointerEvent;
  const type = ev.type === 1 ? 'down' : ev.type === 2 ? 'up' : ev.type === 4 ? 'move' : null;
  if (!type) return;
  if (designer.active) {
    designer.pointer(type, e.button);
    return;
  }
  if (tool === 'zone' && (e.button === 0 || type === 'move')) {
    const p = groundPick();
    if (type === 'move' && p) updateHere(p);
    if (fxEdit.pointer(type, p)) camera.inputs.attached.pointers?.detachControl();
    if (type === 'up') camera.inputs.attached.pointers?.attachControl(true);
    return;
  }
  if (type === 'down' && e.button === 0 && tool === 'move') {
    const p = groundPick();
    const o = p && objectAt(p);
    select(o ?? null);
    if (!o) return;
    commit();
    selEdit(false);
    dragging = true;
    camera.inputs.attached.mousewheel?.detachControl();
  } else if (type === 'down' && e.button === 0 && ['place', 'erase', 'raise', 'lower'].includes(tool)) {
    const p = groundPick();
    if (!p) return;
    commit();
    painting = true;
    lastPaint = null;
    stroke = [];
    freshAreas = [];
    paintAt(p);
  } else if (type === 'move') {
    const p = groundPick();
    if (p) {
      cursor.position.set(p.x, p.y + 0.3, p.z);
      updateHere(p);
      if (painting) paintAt(p);
      if (dragging) moveTo(p, false);
    }
  } else if (type === 'up' && dragging && sel && selOp) {
    dragging = false;
    camera.inputs.attached.mousewheel?.attachControl(true);
    const op = selOp;
    if (Math.hypot(op.nx - op.x, op.nz - op.z) < 0.05 && op.ns === undefined) {
      // A click without a drag or resize only selects: drop the op and its undo step.
      S.ops.pop();
      undo.pop();
      selOp = null;
    } else {
      // A moved house keeps its own interior layout.
      moveOverride(S.interiors, op.k, op.x, op.z, op.nx, op.nz);
      moveTo(new Vector3(op.nx, 0, op.nz), true);
    }
    sel.x = op.nx;
    sel.z = op.nz;
  } else if (type === 'up' && painting) {
    painting = false;
    rebuild(tool === 'raise' || tool === 'lower', stroke);
    stroke = [];
  }
});

const pct = (v: number) => `${Math.round(v * 100)}%`;
function updateHere(p: Vector3) {
  const b = BIOMES[field.biome(p.x, p.z)];
  $('stat-here').textContent = t('pl.here', { biome: b.name, h: p.y.toFixed(1) });
  const el = document.getElementById('fx-here');
  if (el) {
    const v = fxAt(S.fx, p.x, p.z, (x, z) => field.weights(x, z));
    el.textContent = t('fx.here', { s: pct(v.spores), f: pct(v.fog), b: pct(v.fireflies) });
  }
}

// ---- Walk mode ----------------------------------------------------------------------------
const keys = new Set<string>();
let orbitSaved: { a: number; b: number; r: number; t: Vector3 } | null = null;
function enterWalk() {
  orbitSaved = { a: camera.alpha, b: camera.beta, r: camera.radius, t: camera.target.clone() };
  const tg = camera.target;
  camera.lowerRadiusLimit = camera.upperRadiusLimit = 0.05;
  camera.radius = 0.05;
  camera.beta = Math.PI / 2;
  camera.upperBetaLimit = Math.PI - 0.1;
  camera.panningSensibility = 0;
  camera.angularSensibilityX = camera.angularSensibilityY = 2500;
  camera.target = new Vector3(tg.x, field.height(tg.x, tg.z) + 1.7, tg.z);
  camera.fov = 1.0;
  document.body.classList.add('walking');
}
function exitWalk() {
  camera.lowerRadiusLimit = MIN_ORBIT_RADIUS;
  camera.upperRadiusLimit = Math.min(S.gen.size * 2, 3000);
  camera.upperBetaLimit = 1.5;
  camera.panningSensibility = 40;
  camera.angularSensibilityX = camera.angularSensibilityY = 1000;
  camera.fov = 0.9;
  if (orbitSaved) {
    camera.target = orbitSaved.t;
    camera.alpha = orbitSaved.a;
    camera.beta = orbitSaved.b;
    camera.radius = orbitSaved.r;
  }
  document.body.classList.remove('walking');
}

/** Effect-region values where the camera looks, eased so a region's rim never pops. */
const local: FxValues = { spores: 1, fog: 1, fireflies: 1 };
const want: FxValues = { spores: 1, fog: 1, fireflies: 1 };
let fxT = 0;
scene.onBeforeRenderObservable.add(() => {
  const dt = engine.getDeltaTime() / 1000;
  // Objects build and show only near the camera, a few chunks per frame.
  view.viewRadius = Math.max(220, Math.min(700, camera.radius * 1.3));
  view.update(camera.target.x, camera.target.z, 2, Math.max(0, camera.position.y - camera.target.y));
  fxT += dt;
  if (fxT > 0.25) {
    fxT = 0;
    fxAt(S.fx, camera.target.x, camera.target.z, (x, z) => field.weights(x, z), want);
  }
  const k = Math.min(1, dt / FX.ease);
  local.spores += (want.spores - local.spores) * k;
  local.fog += (want.fog - local.fog) * k;
  atmos.setLocal(local);
  if (designer.active) return;
  const fwd = camera.getForwardRay(1).direction;
  fwd.y = 0;
  fwd.normalize();
  const right = new Vector3(fwd.z, 0, -fwd.x);
  const v = new Vector3();
  if (keys.has('KeyW') || keys.has('ArrowUp')) v.addInPlace(fwd);
  if (keys.has('KeyS') || keys.has('ArrowDown')) v.subtractInPlace(fwd);
  if (keys.has('KeyD') || keys.has('ArrowRight')) v.addInPlace(right);
  if (keys.has('KeyA') || keys.has('ArrowLeft')) v.subtractInPlace(right);
  if (v.lengthSquared() === 0) return;
  const fast = keys.has('ShiftLeft') || keys.has('ShiftRight');
  // Fly speed follows the zoom: about a screen width per second, three times that with Shift.
  const speed = tool === 'walk' ? (fast ? 22 : 9) : Math.max(25, Math.min(1500, camera.radius * 0.9)) * (fast ? 3 : 1);
  v.normalize().scaleInPlace(speed * dt);
  const tg = camera.target.add(v);
  if (tool === 'walk') {
    // Walking follows the ground at eye height.
    const ground = Math.max(field.height(tg.x, tg.z), S.gen.water - 1);
    tg.y += (ground + 1.7 - tg.y) * Math.min(1, dt * 10);
  } else {
    // Flying keeps its height, so hills do not bob the view up and down. It only climbs when the
    // camera itself would go into a hill.
    const eye = camera.position.add(v);
    const floor = Math.max(field.height(eye.x, eye.z), S.gen.water) + EDIT.flyClearance;
    if (eye.y < floor) tg.y += floor - eye.y;
  }
  camera.target = tg;
});

// ---- Keyboard -----------------------------------------------------------------------------
window.addEventListener('keydown', (e) => {
  const target = e.target as HTMLElement;
  if (target.closest('input, textarea, select, [contenteditable="true"]')) return;
  if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') {
    e.preventDefault();
    return e.shiftKey ? doRedo() : doUndo();
  }
  if ((e.ctrlKey || e.metaKey) && e.code === 'KeyY') {
    e.preventDefault();
    return doRedo();
  }
  if (designer.active) {
    if (designer.keydown(e)) e.preventDefault();
    return;
  }
  keys.add(e.code);
  if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code) && !e.ctrlKey && !e.metaKey) {
    e.preventDefault();
    return;
  }
  if (e.code === 'Escape') setTool('view');
  else if (e.ctrlKey || e.metaKey || e.altKey) return;
  else if (e.code === 'Digit1') setTool('view');
  else if (e.code === 'Digit2') setTool('place');
  else if (e.code === 'Digit3') setTool('erase');
  else if (e.code === 'Digit4') setTool('raise');
  else if (e.code === 'Digit5') setTool('lower');
  else if (e.code === 'Digit6') setTool('move');
  else if (e.code === 'KeyZ') setTool(tool === 'zone' ? 'view' : 'zone');
  else if (tool === 'move' && sel && (e.code === 'BracketLeft' || e.code === 'BracketRight')) resizeSel(sel.s * (e.code === 'BracketRight' ? 1.08 : 1 / 1.08), true);
  else if (e.code === 'KeyM') toolAction('mirror');
  else if (e.code === 'KeyY') setTool(tool === 'walk' ? 'view' : 'walk');
  else if (e.code === 'KeyP') photo();
  else if (e.code === 'KeyH') document.body.classList.toggle('clean');
  else if (e.code === 'KeyR') randomSeed();
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());

// ---- Minimap ------------------------------------------------------------------------------
const mini = $<HTMLCanvasElement>('minimap');
/** The minimap's ground layer, kept while only objects change. */
let miniGround: ImageData | null = null;
/** Draw the minimap. The ground is sampled again only when `terrain` is set (or never drawn yet). */
function drawMinimap(terrain = true) {
  const N = MINIMAP_PX;
  if (mini.width !== N) mini.width = mini.height = N;
  const ctx = mini.getContext('2d')!;
  const size = S.gen.size;
  if (terrain || !miniGround) {
    miniGround = ctx.createImageData(N, N);
    const data = miniGround.data;
    const w = new Float32Array(NB);
    const cols = BIOMES.map((b) => Color3.FromHexString(b.ground[1]));
    for (let j = 0; j < N; j++)
      for (let i = 0; i < N; i++) {
        const x = -size / 2 + ((i + 0.5) / N) * size;
        const z = size / 2 - ((j + 0.5) / N) * size;
        field.weights(x, z, w);
        const h = field.height(x, z);
        let r = 0, g = 0, b = 0;
        for (let k = 0; k < NB; k++) {
          r += w[k] * cols[k].r;
          g += w[k] * cols[k].g;
          b += w[k] * cols[k].b;
        }
        const shade = 0.75 + Math.max(-0.3, Math.min(0.35, h * 0.03));
        const wet = h < S.gen.water;
        const o = (j * N + i) * 4;
        data[o] = wet ? 63 : r * 255 * shade;
        data[o + 1] = wet ? 184 : g * 255 * shade;
        data[o + 2] = wet ? 175 : b * 255 * shade;
        data[o + 3] = 255;
      }
  }
  // Objects as ink in a pixel buffer: each one darkens the pixels it covers, like a 40% ink dab.
  // Hundreds of thousands of canvas calls took seconds on a 4 km map; this is one pass.
  const ink = new Uint16Array(N * N);
  for (const o of objs) {
    if (o.k === 'nokta') continue;
    const r = (KINDS[o.k].r * o.s * N) / size;
    const px = ((o.x + size / 2) / size) * N, py = ((size / 2 - o.z) / size) * N;
    if (r < 0.8) {
      const i = Math.floor(px), j = Math.floor(py);
      if (i >= 0 && j >= 0 && i < N && j < N) ink[j * N + i]++;
      continue;
    }
    const i0 = Math.max(0, Math.floor(px - r)), i1 = Math.min(N - 1, Math.floor(px + r));
    const j0 = Math.max(0, Math.floor(py - r)), j1 = Math.min(N - 1, Math.floor(py + r));
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) if ((i + 0.5 - px) ** 2 + (j + 0.5 - py) ** 2 <= r * r) ink[j * N + i]++;
  }
  const img = new ImageData(new Uint8ClampedArray(miniGround.data), N, N);
  const d = img.data;
  for (let p = 0; p < N * N; p++) {
    const n = ink[p];
    if (!n) continue;
    const keep = 0.6 ** Math.min(n, 12);
    d[p * 4] = d[p * 4] * keep + 21 * (1 - keep);
    d[p * 4 + 1] = d[p * 4 + 1] * keep + 19 * (1 - keep);
    d[p * 4 + 2] = d[p * 4 + 2] * keep + 26 * (1 - keep);
  }
  ctx.putImageData(img, 0, 0);
  // Effect regions: dashed pigment circles.
  S.fx.zones.forEach((z, i) => {
    if (z.shape !== 'circle') return;
    ctx.beginPath();
    ctx.arc(((z.x + size / 2) / size) * N, ((size / 2 - z.z) / size) * N, (z.r / size) * N, 0, Math.PI * 2);
    ctx.setLineDash([3, 2]);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = ZONE_COLORS[i % ZONE_COLORS.length];
    ctx.stroke();
    ctx.setLineDash([]);
  });
  // Vendor machines: amber dots (violet = lucky) with an ink rim.
  for (const o of objs) {
    if (o.k !== 'satici' && o.k !== 'sansli') continue;
    ctx.beginPath();
    ctx.arc(((o.x + size / 2) / size) * N, ((size / 2 - o.z) / size) * N, 2.6, 0, Math.PI * 2);
    ctx.fillStyle = o.k === 'sansli' || (!o.m && isLucky(o.v)) ? '#c58cf0' : '#ffb347';
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#15131a';
    ctx.stroke();
  }
  // The sun is always west: mark it on the rim.
  const az = (S.atmos.sunAz * Math.PI) / 180;
  ctx.fillStyle = '#ff7a1a';
  ctx.beginPath();
  ctx.arc(N / 2 + Math.sin(az) * N * 0.46, N / 2 - Math.cos(az) * N * 0.46, 4, 0, Math.PI * 2);
  ctx.fill();
}
mini.addEventListener('click', (e) => {
  const r = mini.getBoundingClientRect();
  const size = S.gen.size;
  const x = ((e.clientX - r.left) / r.width - 0.5) * size;
  const z = (0.5 - (e.clientY - r.top) / r.height) * size;
  camera.target = new Vector3(x, field.height(x, z), z);
});

// ---- File ---------------------------------------------------------------------------------
function exportMap() {
  const blob = new Blob([JSON.stringify(toFile(), null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `harita-${S.gen.seed}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}
// Play this map in the game: the game reads the same autosave with ?map=planner.
function playInGame() {
  save();
  location.href = './?map=planner';
}
$<HTMLInputElement>('file').addEventListener('change', async (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const parsed = parseMapFile(await file.text());
  if (!parsed.ok) return flash(t('flash.badFile', { why: parsed.reason }));
  commit();
  S = fromFile(parsed.map);
  renderTab();
  applyAtmos();
  rebuild();
  flash(t('flash.loaded'));
});
function clearEdits() {
  if (!S.ops.length) return flash(t('flash.noEdits'));
  commit();
  S.ops = [];
  rebuild();
  flash(t('flash.cleared'));
}
function resetMap() {
  commit();
  S = fresh();
  renderTab();
  applyAtmos();
  rebuild();
}

// ---- Chrome -------------------------------------------------------------------------------
const langBtn = $('lang');
langBtn.innerHTML = `${icon('lang', 16)}<span>${t('pl.lang')}</span>`;
langBtn.addEventListener('click', () => {
  setLang(getLang() === 'tr' ? 'en' : 'tr');
  // Every label is built from t(): a reload redraws them all in the new language.
  save();
  location.reload();
});
const toggle = $('panel-toggle');
toggle.innerHTML = icon('panel');
toggle.setAttribute('aria-label', t('tab.land'));
toggle.addEventListener('click', () => document.body.classList.toggle('panel-opened'));

// ---- Start --------------------------------------------------------------------------------
buildTabs();
buildToolbar();
crumbs();
renderTab();
applyAtmos();
rebuild();
setTool('view');

let fpsT = 0;
engine.runRenderLoop(() => {
  scene.render();
  fpsT += engine.getDeltaTime();
  if (fpsT > 500) {
    fpsT = 0;
    $('stat-fps').textContent = `${Math.round(engine.getFps())} fps`;
  }
});
window.addEventListener('resize', () => engine.resize());
// For tests and screenshots.
Object.assign(window, {
  planner: {
    get S() {
      return S;
    },
    engine,
    scene,
    camera,
    rebuild,
    setTool,
    commit,
    undo: doUndo,
    redo: doRedo,
    designer,
    fxEdit,
    paintAt: (x: number, z: number) => paintAt(new Vector3(x, 0, z)),
    field: () => field,
    objs: () => objs,
    setState: (s: Partial<State>) => {
      S = { ...S, ...s };
      renderTab();
      applyAtmos();
      rebuild();
    },
  },
});
