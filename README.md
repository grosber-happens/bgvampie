# Vampire Battleground 3D (prototype)

3D third-person battle royale prototype, built with Babylon.js + TypeScript. This replaced the earlier 2D Replit prototype; that version is still in the git history.

Gameplay design doc: kept in the project files (`design/oynanis-tasarimi.md`).

## Run

```
pnpm install
pnpm dev      # http://localhost:22913
pnpm build    # typecheck + production build in dist/public
```

## Controls

WASD move · mouse aim · left click attack · F switch melee/ranged · R reload · Q, E, 1, 2, 3 skills · Shift dash · Space jump · Tab level-up cards · Esc pause

`?debug=1` adds test keys: L gives a level, B spawns the boss, K gives 100 currency. `?seed=N` fixes the map.

## What is in it

- Over-the-shoulder camera, aimed attacks, shooting feel (tracers, muzzle flash, recoil, shake, sounds)
- Rogue class: all 10 skills with 3 tiers, Backstab and shadow-trail passives, 3 playstyle starts
- Level-up offer of 3 cards, max level 12, XP from players, mobs and bosses (balance in `src/balance.ts`)
- Local bots (Kenney survivors), zombie packs and a zombie boss at minutes 5, 13 and 21
- Ruined city block with walkable houses (voxelized colliders) and Kenney urban props
- The player is the hippo model, simplified and animated by `tools/hippo_blender.py`

## Files

- `src/main.ts`: game loop, player, camera, HUD, cards UI
- `src/core.ts`: units, damage, bullets, effects
- `src/rogue.ts`: Rogue skills and passives
- `src/progression.ts`: XP, levels, card offers
- `src/ai.ts`: bots, mobs, boss, spawn director
- `src/world.ts`, `src/houses.ts`, `src/props.ts`: map, collision, props
- `src/characters.ts`, `src/actors.ts`, `src/gun.ts`: models and animation
- `src/feel.ts`: shooting feel and sounds
- `tools/`: Blender and voxelizer scripts used to prepare the assets
