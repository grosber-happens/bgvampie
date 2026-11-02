/**
 * Harita Planlayıcı: an in-game editor that grows a Harvest map from sliders and a seed,
 * then lets you place, erase, raise and mirror by hand. Open /planner.html.
 */
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
import '@fontsource/fredoka/400.css';
import '@fontsource/fredoka/600.css';
import './planner.css';
import { setLookScene } from '../look';
import { isLucky } from '../shop.ts';
import { BIOMES, DEFAULT_PARAMS, Field, KINDS, KIND_LIST, NB, applyOps, generate, type Category, type Kind, type MapFile, type Obj, type Op, type Params } from '../mapgen/generate';
import { Atmosphere, DEFAULT_ATMOS, PRESETS, type Atmos, type PresetId } from './atmos';
import { MapView } from './build';
import { vendorCount } from '../mapgen/vendors.ts';
import { PLANNER_SAVE_KEY, parseMapFile } from '../mapgen/mapfile';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('view');
const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
const scene = new Scene(engine);
setLookScene(scene);

const MIN_ORBIT_RADIUS = 2;
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

// ?q=low: half resolution and lighter shadows for slow machines.
const LOW = new URLSearchParams(location.search).get('q') === 'low';
if (LOW) engine.setHardwareScalingLevel(1.6);
const atmos = new Atmosphere(scene, camera, LOW);
const view = new MapView(scene);
view.onCasters = (m) => atmos.cast(m);
atmos.cast([view.terrain]);
atmos.exclude(view.water);

// ---- State --------------------------------------------------------------------------------
type State = { gen: Params; ops: Op[]; atmos: Atmos };
const SAVE_KEY = PLANNER_SAVE_KEY;
function load(): State {
  const fresh = (): State => ({ gen: structuredClone(DEFAULT_PARAMS), ops: [], atmos: { ...DEFAULT_ATMOS } });
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return fresh();
    const f = JSON.parse(raw) as MapFile;
    return { gen: { ...DEFAULT_PARAMS, ...f.gen }, ops: f.ops ?? [], atmos: { ...DEFAULT_ATMOS, ...(f.atmos as Partial<Atmos>) } };
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
  if (undo.length > 120) undo.shift();
  redo.length = 0;
}
function save() {
  try {
    const f: MapFile = { v: 1, gen: S.gen, ops: S.ops, atmos: S.atmos };
    localStorage.setItem(SAVE_KEY, JSON.stringify(f));
  } catch {
    /* storage may be blocked; the map still works for this visit */
  }
}

// ---- Build --------------------------------------------------------------------------------
let field = new Field(S.gen, S.ops);
let objs: Obj[] = [];
let genKey = '';
let genCache: Obj[] = [];
function rebuild(terrain = true) {
  const t0 = performance.now();
  field = new Field(S.gen, S.ops);
  const key = JSON.stringify([S.gen, S.ops.filter((o) => o.t === 'lift')]);
  if (key !== genKey) {
    genCache = generate(field);
    genKey = key;
  }
  objs = applyOps(genCache, S.ops);
  if (terrain) view.buildTerrain(field);
  view.buildObjects(field, objs);
  atmos.setMapSize(S.gen.size);
  camera.upperRadiusLimit = S.gen.size * 2;
  drawMinimap();
  mirrorLines();
  $('stat-count').textContent = `${objs.length} nesne · ${objs.filter((o) => o.k === 'satici' || o.k === 'sansli').length} satıcı`;
  $('stat-time').textContent = `${Math.round(performance.now() - t0)} ms`;
  save();
}

let pending = 0;
/** Debounced rebuild for sliders being dragged. */
function soon(terrain = true) {
  clearTimeout(pending);
  pending = window.setTimeout(() => rebuild(terrain), 120);
}

// ---- Panels -------------------------------------------------------------------------------
type Slider = { key: string; label: string; min: number; max: number; step: number; fmt?: (v: number) => string };
const GEN_SLIDERS: [string, Slider[]][] = [
  ['Arazi', [
    { key: 'size', label: 'Harita boyu', min: 160, max: 480, step: 10, fmt: (v) => `${v} m` },
    { key: 'relief', label: 'Tepe yüksekliği', min: 0, max: 2.5, step: 0.05 },
    { key: 'roughness', label: 'Engebe sıklığı', min: 0.4, max: 2.5, step: 0.05 },
    { key: 'water', label: 'Su seviyesi', min: -4, max: 4, step: 0.1, fmt: (v) => `${v.toFixed(1)} m` },
    { key: 'canyon', label: 'Kanyon derinliği', min: 0, max: 2, step: 0.05 },
    { key: 'warp', label: 'Sınır dalgası', min: 0, max: 1.2, step: 0.05 },
    { key: 'core', label: 'Kanyon çekirdeği', min: 0.04, max: 0.4, step: 0.01 },
  ]],
  ['Nesneler', [
    { key: 'trees', label: 'Ağaçlar', min: 0, max: 2.5, step: 0.05 },
    { key: 'mushrooms', label: 'Mantar ve çiçek', min: 0, max: 2.5, step: 0.05 },
    { key: 'giants', label: 'Dev yapılar', min: 0, max: 2.5, step: 0.05 },
    { key: 'mech', label: 'Mekanik parçalar', min: 0, max: 2.5, step: 0.05 },
    { key: 'ruins', label: 'Yapı ve harabe', min: 0, max: 2.5, step: 0.05 },
    { key: 'rocks', label: 'Kaya ve yosun', min: 0, max: 2.5, step: 0.05 },
    { key: 'dots', label: 'Puantiye', min: 0, max: 2.5, step: 0.05 },
    { key: 'scale', label: 'Nesne boyu', min: 0.6, max: 1.8, step: 0.05 },
    { key: 'vendors', label: 'Satıcı makineleri', min: 0, max: 2, step: 0.25, fmt: (v) => (v ? `${Math.max(Math.round(vendorCount(S.gen.size) * v), S.gen.symmetry ? 1 : S.gen.biomes.filter(Boolean).length)} hedef` : 'yok') },
  ]],
];
const ATMOS_SLIDERS: Slider[] = [
  { key: 'fog', label: 'Sis yoğunluğu', min: 0, max: 3, step: 0.05 },
  { key: 'fogHeight', label: 'Sis yüksekliği', min: 1, max: 40, step: 0.5, fmt: (v) => `${v} m` },
  { key: 'haze', label: 'Uzak pus', min: 0, max: 2, step: 0.05 },
  { key: 'sunAz', label: 'Güneş yönü', min: 0, max: 360, step: 1, fmt: (v) => `${v}°` },
  { key: 'sunEl', label: 'Güneş yüksekliği', min: 1, max: 70, step: 0.5, fmt: (v) => `${v}°` },
  { key: 'sunSize', label: 'Güneş boyu', min: 0.4, max: 3, step: 0.05 },
  { key: 'warmth', label: 'Sıcaklık', min: 0, max: 1, step: 0.02 },
  { key: 'exposure', label: 'Pozlama', min: 0.5, max: 1.8, step: 0.02 },
  { key: 'bloom', label: 'Parıltı', min: 0, max: 2, step: 0.05 },
  { key: 'rays', label: 'Işık huzmesi', min: 0, max: 1.5, step: 0.05 },
  { key: 'ink', label: 'Mürekkep çizgisi', min: 0, max: 1, step: 0.02 },
  { key: 'spores', label: 'Havadaki spor', min: 0, max: 3, step: 0.05 },
  { key: 'koi', label: 'Gök koileri', min: 0, max: 3, step: 1 },
  { key: 'grain', label: 'Kâğıt dokusu', min: 0, max: 1, step: 0.02 },
];

const inputs = new Map<string, () => void>();
function slider(host: HTMLElement, s: Slider, get: () => number, set: (v: number) => void) {
  const row = document.createElement('label');
  row.className = 'row';
  const fmt = s.fmt ?? ((v: number) => (Number.isInteger(s.step) ? `${v}` : v.toFixed(2)));
  row.innerHTML = `<span class="lbl">${s.label}</span><span class="val"></span><input type="range" min="${s.min}" max="${s.max}" step="${s.step}">`;
  const input = row.querySelector('input')!;
  const val = row.querySelector('.val')!;
  const refresh = () => {
    input.value = String(get());
    val.textContent = fmt(get());
  };
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
  inputs.set(s.key, refresh);
  refresh();
  host.appendChild(row);
}

function section(title: string, open = true): HTMLElement {
  const d = document.createElement('details');
  d.open = open;
  d.innerHTML = `<summary>${title}</summary>`;
  const body = document.createElement('div');
  body.className = 'sec';
  d.appendChild(body);
  $('panel-body').appendChild(d);
  return body;
}

function buildPanel() {
  // Seed.
  const seedSec = section('Tohum');
  seedSec.innerHTML = `<div class="seed"><input id="seed" type="number" min="1" step="1"><button id="dice" title="Rastgele tohum (R)">🎲</button></div>
    <label class="row"><span class="lbl">Simetri</span><select id="sym"><option value="0">Yok</option><option value="1">Sol ↔ sağ ayna</option><option value="2">Dört yönlü ayna</option></select></label>`;
  const seedIn = $<HTMLInputElement>('seed');
  const symIn = $<HTMLSelectElement>('sym');
  inputs.set('seed', () => (seedIn.value = String(S.gen.seed)));
  inputs.set('symmetry', () => (symIn.value = String(S.gen.symmetry)));
  seedIn.addEventListener('change', () => {
    commit();
    S.gen.seed = Math.max(1, Math.floor(Number(seedIn.value) || 1));
    rebuild();
  });
  $('dice').addEventListener('click', randomSeed);
  symIn.addEventListener('change', () => {
    commit();
    S.gen.symmetry = Number(symIn.value) as 0 | 1 | 2;
    rebuild();
  });

  // Landscapes.
  const bio = section('Manzaralar');
  BIOMES.forEach((b, i) => {
    const row = document.createElement('label');
    row.className = 'chk';
    row.innerHTML = `<input type="checkbox"><i style="background:${b.ground[1]};border-color:${b.accent}"></i><span>${b.name}</span>`;
    const c = row.querySelector('input')!;
    inputs.set(`biome${i}`, () => (c.checked = S.gen.biomes[i]));
    c.addEventListener('change', () => {
      commit();
      S.gen.biomes[i] = c.checked;
      rebuild();
    });
    bio.appendChild(row);
  });
  for (const [key, label] of [['cathedral', 'Kızıl Katedral (merkez)'], ['colossus', 'Düşmüş Dev']] as const) {
    const row = document.createElement('label');
    row.className = 'chk';
    row.innerHTML = `<input type="checkbox"><i class="mark"></i><span>${label}</span>`;
    const c = row.querySelector('input')!;
    inputs.set(key, () => (c.checked = S.gen[key]));
    c.addEventListener('change', () => {
      commit();
      S.gen[key] = c.checked;
      rebuild();
    });
    bio.appendChild(row);
  }

  for (const [title, list] of GEN_SLIDERS) {
    const sec = section(title);
    for (const s of list)
      slider(sec, s, () => S.gen[s.key as keyof Params] as number, (v) => {
        (S.gen as Record<string, unknown>)[s.key] = v;
        soon(s.key !== 'scale' && !(GEN_SLIDERS[1][1] as Slider[]).includes(s));
      });
  }

  // Atmosphere.
  const at = section('Atmosfer');
  const presets = document.createElement('div');
  presets.className = 'presets';
  for (const id of Object.keys(PRESETS) as PresetId[]) {
    const b = document.createElement('button');
    b.textContent = PRESETS[id].name;
    b.dataset.preset = id;
    const pal = PRESETS[id].pal;
    b.style.setProperty('--a', pal.horizon);
    b.style.setProperty('--b', pal.zenith);
    b.addEventListener('click', () => {
      commit();
      S.atmos = { ...S.atmos, ...PRESETS[id].atmos, preset: id };
      applyAtmos();
      refreshInputs();
    });
    presets.appendChild(b);
  }
  at.appendChild(presets);
  for (const s of ATMOS_SLIDERS)
    slider(at, s, () => S.atmos[s.key as keyof Atmos] as number, (v) => {
      (S.atmos as Record<string, unknown>)[s.key] = v;
      applyAtmos();
    });
  const ringRow = document.createElement('label');
  ringRow.className = 'chk';
  ringRow.innerHTML = `<input type="checkbox"><i class="mark ring"></i><span>Kızıl Sis halkası</span>`;
  const rc = ringRow.querySelector('input')!;
  inputs.set('ring', () => (rc.checked = S.atmos.ring));
  rc.addEventListener('change', () => {
    S.atmos.ring = rc.checked;
    applyAtmos();
  });
  at.appendChild(ringRow);
}

function refreshInputs() {
  for (const f of inputs.values()) f();
  document.querySelectorAll<HTMLButtonElement>('.presets button').forEach((b) => b.classList.toggle('on', b.dataset.preset === S.atmos.preset));
}

function applyAtmos() {
  atmos.set(S.atmos);
  document.querySelectorAll<HTMLButtonElement>('.presets button').forEach((b) => b.classList.toggle('on', b.dataset.preset === S.atmos.preset));
  save();
}

function randomSeed() {
  commit();
  S.gen.seed = 1 + Math.floor(Math.random() * 99999);
  refreshInputs();
  rebuild();
}

// ---- Tools --------------------------------------------------------------------------------
type Tool = 'view' | 'place' | 'erase' | 'raise' | 'lower' | 'walk';
let tool: Tool = 'view';
let mirror = 0; // 0 none, 1 x, 2 z, 3 both
let brush = 6;
let strength = 1;
let placeKind: Kind = 'devmantar';
const MIRROR_NAMES = ['Ayna: kapalı', 'Ayna: sol ↔ sağ', 'Ayna: ön ↔ arka', 'Ayna: dört yön'];

const TOOLS: { id: Tool | 'mirror' | 'undo' | 'redo' | 'photo' | 'hide'; icon: string; label: string; key: string }[] = [
  { id: 'view', icon: '✋', label: 'Gözat', key: '1' },
  { id: 'place', icon: '🌳', label: 'Yerleştir', key: '2' },
  { id: 'erase', icon: '⌫', label: 'Sil', key: '3' },
  { id: 'raise', icon: '⛰', label: 'Yükselt', key: '4' },
  { id: 'lower', icon: '🕳', label: 'Alçalt', key: '5' },
  { id: 'mirror', icon: '⇋', label: 'Ayna', key: 'M' },
  { id: 'undo', icon: '↶', label: 'Geri al', key: 'Ctrl Z' },
  { id: 'redo', icon: '↷', label: 'İleri al', key: 'Ctrl Y' },
  { id: 'walk', icon: '🚶', label: 'Yürü', key: 'Y' },
  { id: 'photo', icon: '📷', label: 'Fotoğraf', key: 'P' },
  { id: 'hide', icon: '◐', label: 'Arayüzü gizle', key: 'H' },
];

function buildToolbar() {
  const bar = $('tools');
  for (const t of TOOLS) {
    const b = document.createElement('button');
    b.dataset.tool = t.id;
    b.innerHTML = `<span class="ic">${t.icon}</span><span class="tip">${t.label} <kbd>${t.key}</kbd></span>`;
    b.addEventListener('click', () => toolAction(t.id));
    bar.appendChild(b);
  }
  // Kind palette for the place tool.
  const pal = $('palette');
  const cats: [Category, string][] = [['trees', 'Ağaç'], ['mushrooms', 'Mantar ve çiçek'], ['giants', 'Dev'], ['mech', 'Mekanik'], ['ruins', 'Yapı'], ['rocks', 'Kaya'], ['dots', 'Zemin'], ['landmark', 'Simge']];
  for (const [cat, name] of cats) {
    const h = document.createElement('h4');
    h.textContent = name;
    pal.appendChild(h);
    const grid = document.createElement('div');
    grid.className = 'kinds';
    for (const k of KIND_LIST.filter((k) => KINDS[k].cat === cat)) {
      const b = document.createElement('button');
      b.textContent = KINDS[k].name;
      b.dataset.kind = k;
      b.addEventListener('click', () => {
        placeKind = k;
        setTool('place');
      });
      grid.appendChild(b);
    }
    pal.appendChild(grid);
  }
  const brushRow = $('brush');
  slider(brushRow, { key: 'brush', label: 'Fırça çapı', min: 1, max: 30, step: 0.5, fmt: (v) => `${v} m` }, () => brush, (v) => {
    brush = v;
    cursorScale();
  });
  slider(brushRow, { key: 'strength', label: 'Fırça gücü', min: 0.2, max: 4, step: 0.1 }, () => strength, (v) => (strength = v));
}

function toolAction(id: (typeof TOOLS)[number]['id']) {
  if (id === 'mirror') {
    mirror = (mirror + 1) % 4;
    flash(MIRROR_NAMES[mirror]);
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
  document.querySelectorAll<HTMLButtonElement>('#palette button').forEach((b) => b.classList.toggle('on', b.dataset.kind === placeKind));
  $('palette-wrap').classList.toggle('hidden', tool !== 'place');
  $('brush').classList.toggle('hidden', !['erase', 'raise', 'lower', 'place'].includes(tool));
  const hints: Record<Tool, string> = {
    view: 'WASD: kamerayı kaydır · Shift: hızlı · sol tık sürükle: döndür · sağ tık: kaydır · tekerlek: yakınlaş',
    place: `${KINDS[placeKind].name}: tıkla ya da sürükleyerek dağıt · sağ tık: döndür`,
    erase: 'Sürükleyerek sil · sağ tık: döndür',
    raise: 'Sürükleyerek araziyi yükselt',
    lower: 'Sürükleyerek araziyi alçalt (su birikir)',
    walk: 'WASD yürü · Shift koş · sol tık sürükle: bak · Esc çık',
  };
  $('hint').textContent = hints[tool] + (mirror ? ` · ${MIRROR_NAMES[mirror]}` : '');
}

function setTool(t: Tool) {
  const was = tool;
  tool = t;
  const pointers = camera.inputs.attached.pointers as unknown as { buttons: number[] };
  pointers.buttons = t === 'view' || t === 'walk' ? [0, 1, 2] : [1, 2];
  if (t === 'walk') enterWalk();
  else if (was === 'walk') exitWalk();
  cursor.setEnabled(['erase', 'raise', 'lower', 'place'].includes(t));
  cursorScale();
  syncToolbar();
}

function doUndo() {
  const s = undo.pop();
  if (!s) return flash('Geri alınacak bir şey yok');
  redo.push(snap());
  S = JSON.parse(s);
  refreshInputs();
  applyAtmos();
  rebuild();
}
function doRedo() {
  const s = redo.pop();
  if (!s) return;
  undo.push(snap());
  S = JSON.parse(s);
  refreshInputs();
  applyAtmos();
  rebuild();
}

let flashTimer = 0;
function flash(msg: string) {
  const el = $('flash');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(flashTimer);
  flashTimer = window.setTimeout(() => el.classList.remove('show'), 1600);
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
  const r = tool === 'place' ? Math.max(1, KINDS[placeKind].r * S.gen.scale) : brush;
  cursor.scaling.set(r, 1, r);
}

let guides: Mesh[] = [];
function mirrorLines() {
  guides.forEach((g) => g.dispose());
  guides = [];
  const mode = mirror;
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
  if (mode === 1 || mode === 3) add('z');
  if (mode === 2 || mode === 3) add('x');
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
  const hit = scene.pick(scene.pointerX, scene.pointerY, (m) => m === view.terrain);
  return hit?.hit && hit.pickedPoint ? hit.pickedPoint : null;
}

function paintAt(p: Vector3) {
  const spacing = tool === 'place' ? Math.max(1.5, KINDS[placeKind].r * S.gen.scale * 2) : Math.max(0.8, brush * 0.4);
  if (lastPaint && Vector3.Distance(lastPaint, p) < spacing) return;
  lastPaint = p.clone();
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
    if (now - lastTerrain > 120) {
      lastTerrain = now;
      field = new Field(S.gen, S.ops);
      view.buildTerrain(field);
    }
  } else rebuild(false);
}

scene.onPointerObservable.add((ev) => {
  const e = ev.event as PointerEvent;
  if (ev.type === 1 /* down */ && e.button === 0 && ['place', 'erase', 'raise', 'lower'].includes(tool)) {
    const p = groundPick();
    if (!p) return;
    commit();
    painting = true;
    lastPaint = null;
    paintAt(p);
  } else if (ev.type === 4 /* move */) {
    const p = groundPick();
    if (p) {
      cursor.position.set(p.x, p.y + 0.3, p.z);
      const b = BIOMES[field.biome(p.x, p.z)];
      $('stat-here').textContent = `${b.name} · ${p.y.toFixed(1)} m`;
      if (painting) paintAt(p);
    }
  } else if (ev.type === 2 /* up */ && painting) {
    painting = false;
    rebuild(tool === 'raise' || tool === 'lower');
  }
});

// ---- Walk mode ----------------------------------------------------------------------------
const keys = new Set<string>();
let orbitSaved: { a: number; b: number; r: number; t: Vector3 } | null = null;
function enterWalk() {
  orbitSaved = { a: camera.alpha, b: camera.beta, r: camera.radius, t: camera.target.clone() };
  const t = camera.target;
  camera.lowerRadiusLimit = camera.upperRadiusLimit = 0.05;
  camera.radius = 0.05;
  camera.beta = Math.PI / 2;
  camera.upperBetaLimit = Math.PI - 0.1;
  camera.panningSensibility = 0;
  camera.angularSensibilityX = camera.angularSensibilityY = 2500;
  camera.target = new Vector3(t.x, field.height(t.x, t.z) + 1.7, t.z);
  camera.fov = 1.0;
  document.body.classList.add('walking');
}
function exitWalk() {
  camera.lowerRadiusLimit = MIN_ORBIT_RADIUS;
  camera.upperRadiusLimit = S.gen.size * 2;
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
scene.onBeforeRenderObservable.add(() => {
  if (tool !== 'walk' && tool !== 'view') return;
  const dt = engine.getDeltaTime() / 1000;
  const fwd = camera.getForwardRay(1).direction;
  fwd.y = 0;
  fwd.normalize();
  const right = new Vector3(fwd.z, 0, -fwd.x);
  const v = new Vector3();
  if (keys.has('KeyW')) v.addInPlace(fwd);
  if (keys.has('KeyS')) v.subtractInPlace(fwd);
  if (keys.has('KeyD')) v.addInPlace(right);
  if (keys.has('KeyA')) v.subtractInPlace(right);
  if (v.lengthSquared() === 0) return;
  const fast = keys.has('ShiftLeft') || keys.has('ShiftRight');
  const speed = tool === 'walk' ? (fast ? 22 : 9) : Math.max(4, Math.min(100, camera.radius * 0.2)) * (fast ? 2.5 : 1);
  v.normalize().scaleInPlace(speed * dt);
  const t = camera.target.add(v);
  const ground = Math.max(field.height(t.x, t.z), S.gen.water - 1);
  const targetHeight = ground + (tool === 'walk' ? 1.7 : 0.5);
  t.y += (targetHeight - t.y) * Math.min(1, dt * 10);
  camera.target = t;
});

// ---- Keyboard -----------------------------------------------------------------------------
window.addEventListener('keydown', (e) => {
  const target = e.target as HTMLElement;
  if (target.closest('input, textarea, select, [contenteditable="true"]')) return;
  keys.add(e.code);
  if ((tool === 'walk' || tool === 'view') && ['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code)) {
    e.preventDefault();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') {
    e.preventDefault();
    e.shiftKey ? doRedo() : doUndo();
  } else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyY') {
    e.preventDefault();
    doRedo();
  } else if (e.code === 'Escape') setTool('view');
  else if (e.ctrlKey || e.metaKey || e.altKey) return;
  else if (e.code === 'Digit1') setTool('view');
  else if (e.code === 'Digit2') setTool('place');
  else if (e.code === 'Digit3') setTool('erase');
  else if (e.code === 'Digit4') setTool('raise');
  else if (e.code === 'Digit5') setTool('lower');
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
function drawMinimap() {
  const N = 128;
  mini.width = mini.height = N;
  const ctx = mini.getContext('2d')!;
  const img = ctx.createImageData(N, N);
  const size = S.gen.size;
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
      img.data[o] = wet ? 63 : r * 255 * shade;
      img.data[o + 1] = wet ? 184 : g * 255 * shade;
      img.data[o + 2] = wet ? 175 : b * 255 * shade;
      img.data[o + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
  ctx.fillStyle = 'rgba(21,19,26,0.4)';
  for (const o of objs) {
    if (o.k === 'nokta') continue;
    const r = Math.max(0.6, (KINDS[o.k].r * o.s * N) / size);
    ctx.beginPath();
    ctx.arc(((o.x + size / 2) / size) * N, ((size / 2 - o.z) / size) * N, r, 0, Math.PI * 2);
    ctx.fill();
  }
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

// ---- File menu ----------------------------------------------------------------------------
$('btn-export').addEventListener('click', () => {
  const f: MapFile = { v: 1, gen: S.gen, ops: S.ops, atmos: S.atmos };
  const blob = new Blob([JSON.stringify(f, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `harita-${S.gen.seed}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});
// Play this map in the game: the game reads the same autosave with ?map=planner.
$('btn-play').addEventListener('click', () => {
  save();
  location.href = './?map=planner';
});
$('btn-import').addEventListener('click', () => $<HTMLInputElement>('file').click());
$<HTMLInputElement>('file').addEventListener('change', async (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  try {
    const parsed = parseMapFile(await file.text());
    if (!parsed.ok) return flash(`Bu dosya okunamadı: ${parsed.reason}`);
    const f = parsed.map;
    commit();
    S = { gen: { ...DEFAULT_PARAMS, ...f.gen }, ops: f.ops ?? [], atmos: { ...DEFAULT_ATMOS, ...(f.atmos as Partial<Atmos>) } };
    refreshInputs();
    applyAtmos();
    rebuild();
    flash('Harita yüklendi');
  } catch {
    flash('Bu dosya okunamadı');
  }
});
$('btn-clear').addEventListener('click', () => {
  if (!S.ops.length) return flash('Elle yapılmış değişiklik yok');
  commit();
  S.ops = [];
  rebuild();
  flash('Elle yapılanlar temizlendi (Ctrl Z ile geri)');
});
$('btn-reset').addEventListener('click', () => {
  commit();
  S = { gen: structuredClone(DEFAULT_PARAMS), ops: [], atmos: { ...DEFAULT_ATMOS } };
  refreshInputs();
  applyAtmos();
  rebuild();
});
$('panel-toggle').addEventListener('click', () => document.body.classList.toggle('panel-closed'));

// ---- Start --------------------------------------------------------------------------------
buildPanel();
buildToolbar();
refreshInputs();
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
Object.assign(window, { planner: { get S() { return S; }, engine, scene, camera, rebuild, setTool, field: () => field, objs: () => objs, setState: (s: Partial<State>) => { S = { ...S, ...s }; refreshInputs(); applyAtmos(); rebuild(); } } });
