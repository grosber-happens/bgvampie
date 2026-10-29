# Vampire Battleground 3D (prototype)

First 3D third-person shooter test area, built with Babylon.js + TypeScript. It sits next to the 2D prototype (`artifacts/vampire-battleground`) and does not change it.

Gameplay design doc: kept in the project files (`design/oynanis-tasarimi.md`).

## Run

```
pnpm install
pnpm --filter @workspace/vampire-3d run dev   # http://localhost:22913
```

## Controls

WASD move · mouse aim · left click fire · Shift sprint · Space dash (dodges bullets) · Esc pause

## What is in it

- Over-the-shoulder camera with pointer lock, pulls in when cover is behind you
- Aim ray from the camera through the crosshair; bullets fly from the gun to that point
- 7 local bots that wander, engage within sight, strafe and shoot back; they respawn after a kill
- Desert test arena with cover blocks and giant mushrooms, simple 2D collision
- Placeholder capsule characters; real art and class kits come later

## Files

- `src/main.ts` — game loop, player, bots, bullets, camera, HUD
- `src/world.ts` — arena, lights, obstacles, collision helpers
- `src/actors.ts` — placeholder character bodies
- `src/input.ts` — keyboard and mouse input
