import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Scene } from '@babylonjs/core/scene';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { World } from './world';

export type ActorBody = {
  root: TransformNode;
  meshes: Mesh[];
  bodyMat: StandardMaterial;
  baseColor: Color3;
  hpBar?: Mesh;
};

function material(scene: Scene, name: string, hex: string): StandardMaterial {
  const m = new StandardMaterial(name, scene);
  m.diffuseColor = Color3.FromHexString(hex);
  m.specularColor = new Color3(0.1, 0.1, 0.1);
  return m;
}

/**
 * Placeholder humanoid: cloak body, head, and a weapon on the right side.
 * Real character art replaces this later.
 */
export function createActorBody(
  scene: Scene,
  world: World,
  name: string,
  colors: { body: string; head: string; weapon: string },
  withHpBar: boolean,
  metadata: Record<string, unknown>,
): ActorBody {
  const root = new TransformNode(name, scene);
  const bodyMat = material(scene, `${name}-body`, colors.body);
  const headMat = material(scene, `${name}-head`, colors.head);
  const weaponMat = material(scene, `${name}-weapon`, colors.weapon);
  weaponMat.emissiveColor = Color3.FromHexString(colors.weapon).scale(0.4);

  const body = MeshBuilder.CreateCylinder(`${name}-torso`, { height: 1.4, diameterTop: 0.55, diameterBottom: 0.95, tessellation: 12 }, scene);
  body.position.y = 0.7;
  body.material = bodyMat;

  const head = MeshBuilder.CreateSphere(`${name}-head`, { diameter: 0.5, segments: 12 }, scene);
  head.position.y = 1.65;
  head.material = headMat;

  const weapon = MeshBuilder.CreateBox(`${name}-weapon`, { width: 0.12, height: 0.14, depth: 0.8 }, scene);
  weapon.position.set(0.42, 1.2, 0.35);
  weapon.material = weaponMat;

  const meshes = [body, head, weapon];
  for (const m of meshes) {
    m.parent = root;
    m.metadata = metadata;
    world.shadows.addShadowCaster(m);
  }

  let hpBar: Mesh | undefined;
  if (withHpBar) {
    hpBar = MeshBuilder.CreatePlane(`${name}-hp`, { width: 1, height: 0.1 }, scene);
    hpBar.parent = root;
    hpBar.position.y = 2.15;
    hpBar.billboardMode = Mesh.BILLBOARDMODE_ALL;
    hpBar.isPickable = false;
    const hpMat = new StandardMaterial(`${name}-hpmat`, scene);
    hpMat.emissiveColor = Color3.FromHexString('#e0533f');
    hpMat.disableLighting = true;
    hpBar.material = hpMat;
  }

  return { root, meshes, bodyMat, baseColor: bodyMat.diffuseColor.clone(), hpBar };
}

/** Brief white flash when an actor takes damage. */
export function flash(body: ActorBody, t: number) {
  body.bodyMat.emissiveColor = t > 0 ? new Color3(0.9, 0.9, 0.9).scale(t) : Color3.Black();
}

export function disposeBody(body: ActorBody) {
  body.root.dispose(false, true);
}

export function forwardFromYaw(yaw: number): Vector3 {
  return new Vector3(Math.sin(yaw), 0, Math.cos(yaw));
}

export function rightFromYaw(yaw: number): Vector3 {
  return new Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
}
