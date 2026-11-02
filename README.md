# Vampire Battleground 3D (prototype)

3D third-person battle royale prototype, built with Babylon.js + TypeScript. This replaced the earlier 2D Replit prototype; that version is still in the git history.

Full game design brief: [`docs/GAME_DESIGN.md`](docs/GAME_DESIGN.md). Roadmap and workflow: [`docs/ROADMAP.md`](docs/ROADMAP.md). Rules for agents: [`AGENTS.md`](AGENTS.md).

## Run

```
pnpm install
pnpm dev      # http://localhost:22913
pnpm build    # typecheck + production build in dist/public
```

## Controls

WASD move · mouse aim · left click attack · F switch melee/ranged · R reload · Q, E, 1, 2, 3 skills · W W sprint · A/D + Space side dash · Space jump, double jump, wall kick · Ctrl/C in the air ground slam (heavy legs) · X bandage · I bag · G Last Reel (Noir set) · Tab level-up cards · Esc pause

Map planner: `/planner.html` grows a map from sliders and a seed and lets you edit it (see [`docs/MAP_PLANNER.md`](docs/MAP_PLANNER.md)).

`?debug=1` adds test keys: L gives a level, B spawns the boss, K gives 100 currency. `?seed=N` fixes the map.

## What is in it

- Over-the-shoulder camera, aimed attacks, shooting feel (tracers, muzzle flash, recoil, shake, sounds)
- 4 classes (Rogue, Mage, Fighter, Scout): 10 skills each with 3 tiers, two weapons, passives, 3 playstyle starts and a class-specific dash
- Level-up offer of 3 cards, max level 12, XP from players, mobs and bosses (balance in `src/balance.ts`)
- Local bots (Kenney survivors), zombie packs and a zombie boss at minutes 5, 13 and 21
- Ruined city block with walkable houses (voxelized colliders) and Kenney urban props
- The player is the hippo model, simplified and animated by `tools/hippo_blender.py`

- Gear: light/medium/heavy armor, rings and necklaces that level up, class weapons and the Noir detective set; title screen, settings and TR/EN (see `docs/GEAR.md`)
- Painted icons and a title poster made with Artlist (`tools/art/`, cut into `public/art/` by `tools/art/cut.py`)

## Files

- `src/main.ts`: game loop, player, camera, HUD, cards UI
- `src/core.ts`: units, damage, bullets, effects
- `src/kit.ts`: class kit registry and shared skill helpers
- `src/rogue.ts`, `src/mage.ts`, `src/fighter.ts`, `src/scout.ts`: the class kits
- `src/balance.ts`: every tunable number
- `src/look.ts`: clay and watercolor look
- `src/progression.ts`: XP, levels, card offers
- `src/ai.ts`: bots, mobs, boss, spawn director
- `src/world.ts`, `src/houses.ts`, `src/props.ts`: map, collision, props
- `src/characters.ts`, `src/actors.ts`, `src/gun.ts`: models and animation
- `src/feel.ts`: shooting feel and sounds
- `tools/`: Blender and voxelizer scripts used to prepare the assets
