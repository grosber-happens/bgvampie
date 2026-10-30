/**
 * Silah Atölyesi (armory.html): every class weapon on one table, in each species' style, with
 * or without its named item. Used to review the models and take screenshots.
 * URL: ?species=balcik|yamali|katip &named=1 &only=<design> &still=1
 */
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { Engine } from '@babylonjs/core/Engines/engine';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Scene } from '@babylonjs/core/scene';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent';
import '@fontsource/fredoka';
import { clayMat } from './forge';
import { CLASS_GLOW, forgeWeapon, type ClassId, type DesignId } from './index';
import { SPECIES, SPECIES_IDS, getSpecies, setSpecies, type SpeciesId } from './species';
import { initLook } from '../look';

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('c') as HTMLCanvasElement;
const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
const scene = new Scene(engine);
scene.clearColor = new Color4(0.96, 0.92, 0.85, 1);

const camera = new ArcRotateCamera('cam', -Math.PI / 2, 1.3, 6.2, new Vector3(0, 1.2, 0), scene);
camera.attachControl(canvas, true);
camera.lowerRadiusLimit = 1;
camera.upperRadiusLimit = 14;
camera.wheelPrecision = 40;
camera.minZ = 0.05;

const hemi = new HemisphericLight('hemi', new Vector3(0.2, 1, -0.3), scene);
hemi.groundColor = Color3.FromHexString('#8a7a6a');
const sun = new DirectionalLight('sun', new Vector3(-0.5, -1, 0.6), scene);
sun.position = new Vector3(6, 10, -6);
const shadows = new ShadowGenerator(1024, sun);
shadows.useBlurExponentialShadowMap = true;
initLook(scene, camera, shadows);

// The workbench.
const table = MeshBuilder.CreateBox('table', { width: 10, height: 0.2, depth: 3 }, scene);
table.position.y = -0.1;
table.material = clayMat(scene, '#c99a6b', 0.05);
table.receiveShadows = true;

type Slot = { cls: ClassId; design: DesignId; name: string; named: string; x: number; y: number; twin?: boolean; extra?: DesignId };
const COLS: Record<ClassId, number> = { rogue: -3.4, mage: -1.15, fighter: 1.15, scout: 3.4 };
const SLOTS: Slot[] = [
  { cls: 'rogue', design: 'pistol', name: 'Islak Sokak Tabancası', named: 'Fısıltı', x: COLS.rogue, y: 1.75 },
  { cls: 'rogue', design: 'dagger', name: 'Ay Kırığı Hançerler', named: 'İkiz Ay', x: COLS.rogue, y: 0.75, twin: true },
  { cls: 'mage', design: 'pen', name: 'Işık Kalemi', named: 'Soğuk Mercek', x: COLS.mage, y: 1.75 },
  { cls: 'mage', design: 'lantern', name: 'Fener Asası', named: 'Ağırlık Asası', x: COLS.mage, y: 0.75 },
  { cls: 'fighter', design: 'spear', name: 'Yıldırım Mızrakları', named: 'Dörtlü Sadak', x: COLS.fighter, y: 1.75, extra: 'quiver' },
  { cls: 'fighter', design: 'sword', name: 'Şafak Kılıcı', named: 'Uzun Işın', x: COLS.fighter, y: 0.75 },
  { cls: 'scout', design: 'rifle', name: 'Uzak Göz', named: 'Sabırlı Dürbün', x: COLS.scout, y: 1.75 },
  { cls: 'scout', design: 'claw', name: 'Kedi Tırnakları', named: 'Kanca Pençe', x: COLS.scout, y: 0.75, twin: true },
];

let named = params.get('named') === '1';
const only = params.get('only') as DesignId | null;
const still = params.has('still');
let shown: { node: TransformNode; slot: Slot; label: HTMLDivElement; phase: number }[] = [];
const labels = document.getElementById('labels')!;

function centerOf(n: TransformNode) {
  const { min, max } = n.getHierarchyBoundingVectors(true);
  return min.add(max).scale(0.5);
}

function build() {
  for (const s of shown) {
    s.node.dispose(false, false);
    s.label.remove();
  }
  shown = [];
  const sp = getSpecies();
  const slots = only ? SLOTS.filter((s) => s.design === only).map((s) => ({ ...s, x: 0, y: 1 })) : SLOTS;
  for (const slot of slots) {
    const holder = new TransformNode(`show-${slot.design}`, scene);
    const parts: TransformNode[] = [];
    const gem = named ? '#f2b33d' : undefined;
    const sides: (0 | 1)[] = slot.twin ? [0, 1] : [0];
    for (const side of sides) {
      const w = forgeWeapon(scene, slot.design, slot.cls, sp, { named, gem, side });
      w.root.parent = holder;
      if (slot.twin) w.root.position.y = side === 0 ? 0.07 : -0.07;
      // Orbs and quiver spears are all shown here.
      parts.push(w.root);
    }
    if (slot.extra) {
      const q = forgeWeapon(scene, slot.extra, slot.cls, sp, { named, gem });
      q.root.parent = holder;
      q.root.position.set(0.0, -0.55, 0.62);
      q.root.rotation.set(-0.2, 0, 0);
      parts.push(q.root);
    }
    // Lay the weapon sideways so its length runs along the table, centred on its slot.
    holder.rotation.y = Math.PI / 2;
    holder.computeWorldMatrix(true);
    const c = centerOf(holder);
    const pivot = new TransformNode(`pivot-${slot.design}`, scene);
    pivot.position.set(slot.x, slot.y, 0);
    holder.parent = pivot;
    holder.position.set(-c.x, -c.y, -c.z);
    for (const m of holder.getChildMeshes()) {
      shadows.addShadowCaster(m);
      m.receiveShadows = true;
    }
    const label = document.createElement('div');
    label.className = 'lbl';
    label.innerHTML = `<b style="color:${CLASS_GLOW[slot.cls]};text-shadow:0 0 1px #15131a">${named ? slot.named : slot.name}</b>${slot.cls}`;
    labels.appendChild(label);
    shown.push({ node: pivot, slot, label, phase: shown.length * 0.7 });
  }
  if (only) {
    camera.target.set(0, 1, 0);
    camera.radius = Number(params.get('r')) || 1.6;
    camera.beta = Number(params.get('beta')) || 0.95;
    camera.alpha = Number(params.get('alpha')) || -Math.PI / 2;
  }
  note();
}

function note() {
  const sp = getSpecies();
  document.getElementById('note')!.innerHTML = `<b>${sp.name.tr}</b>: ${sp.blurb.tr}<br>${
    named ? 'İsimli eşyalar takılı: her biri kendi süsünü ekler, taş rengi nadirliği gösterir.' : 'Atölye hâli: sınıfın kendi silahları. Işık rengi sınıfı uzaktan belli eder.'
  } Fareyle çevir, tekerlekle yaklaş.`;
}

function buttons() {
  const sBox = document.getElementById('species')!;
  sBox.innerHTML = '';
  for (const id of SPECIES_IDS) {
    const b = document.createElement('button');
    b.textContent = SPECIES[id].name.tr;
    b.className = getSpecies().id === id ? 'on' : '';
    b.onclick = () => {
      setSpecies(id as SpeciesId);
      buttons();
      build();
    };
    sBox.appendChild(b);
  }
  const mBox = document.getElementById('modes')!;
  mBox.innerHTML = '';
  for (const [on, text] of [[false, 'Atölye'], [true, 'İsimli eşya']] as const) {
    const b = document.createElement('button');
    b.textContent = text;
    b.className = named === on ? 'on' : '';
    b.onclick = () => {
      named = on;
      buttons();
      build();
    };
    mBox.appendChild(b);
  }
}

buttons();
build();

let t = 0;
const tmp = new Vector3();
scene.onBeforeRenderObservable.add(() => {
  const dt = engine.getDeltaTime() / 1000;
  t += dt;
  for (const s of shown) {
    if (!still) {
      s.node.rotation.y = Math.sin(t * 0.6 + s.phase) * 0.55;
      s.node.rotation.x = Math.sin(t * 0.4 + s.phase) * 0.15;
    }
    // Spin the lantern's gyroscope like the game does.
    for (const n of s.node.getChildTransformNodes(false)) {
      if (n.name === 'gyro') n.rotation.z += dt * 1.4;
      if (n.name === 'gyro2') n.rotation.x += dt * 2.1;
      if (n.name === 'orbs') n.rotation.z -= dt * 1.8;
      if (n.name.startsWith('orb') && n.name.length <= 4) n.rotation.z = Number(n.name.slice(3)) * (Math.PI / 4);
    }
    Vector3.ProjectToRef(
      tmp.set(s.slot.x, s.slot.y - (s.slot.y > 1.2 ? 0.42 : 0.5), 0),
      Matrix.IdentityReadOnly,
      scene.getTransformMatrix(),
      camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight()),
      tmp,
    );
    const scale = canvas.clientWidth / engine.getRenderWidth();
    s.label.style.left = `${tmp.x * scale}px`;
    s.label.style.top = `${tmp.y * scale}px`;
    s.label.style.display = only ? 'none' : '';
  }
});

engine.runRenderLoop(() => scene.render());
window.addEventListener('resize', () => engine.resize());
(window as any).armory = { scene, ready: true };
