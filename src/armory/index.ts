import type { Scene } from '@babylonjs/core/scene';
import { DESIGNS, type DesignId, type DesignOpts } from './designs';
import { Forge, type Forged } from './forge';
import type { Species } from './species';

export type ClassId = 'rogue' | 'mage' | 'fighter' | 'scout';

/** Each class's signature glow (readable from far away: you know the class by its light). */
export const CLASS_GLOW: Record<ClassId, string> = { rogue: '#ff5a6e', mage: '#7ad7ff', fighter: '#ff9a3b', scout: '#7be36f' };

/** Which design each class carries in each hand. `twin` weapons come as a pair (one per hand). */
export const LOADOUT: Record<ClassId, { ranged: DesignId; melee: DesignId; twin?: 'melee'; back?: DesignId }> = {
  rogue: { ranged: 'pistol', melee: 'dagger', twin: 'melee' },
  mage: { ranged: 'pen', melee: 'lantern' },
  fighter: { ranged: 'spear', melee: 'sword', back: 'quiver' },
  scout: { ranged: 'rifle', melee: 'claw', twin: 'melee' },
};

/** Build one weapon in the species' workshop style. */
export function forgeWeapon(scene: Scene, design: DesignId, cls: ClassId, species: Species, o: DesignOpts = { named: false }): Forged {
  const f = new Forge(scene, `w-${cls}-${design}-${o.side ?? 0}`, species.palette, CLASS_GLOW[cls], species.thick);
  DESIGNS[design](f, species, o);
  return f.done();
}

export type { DesignId, DesignOpts, Forged };
