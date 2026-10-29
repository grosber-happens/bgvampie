# Vampire Battleground

A local fantasy arena prototype combining automatic survivors-style combat with a shrinking-ring battleground, PvE enemies, class-restricted loot, and a manual dash.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/vampire-battleground/` — playable browser prototype
- `artifacts/vampire-battleground/src/game/useGameEngine.ts` — local match rules, bot simulation, class skills, loot, and fog
- `artifacts/vampire-battleground/src/game/` — class selection, arena rendering, and match HUD
- `artifacts/vampire-battleground/src/index.css` — game theme and map styling

## Architecture decisions

- The first playable version simulates 19 rival bots locally; it does not provide online multiplayer, matchmaking, or server-authoritative combat.
- Keep the initial prototype focused on the match loop before adding persistent progression or live multiplayer infrastructure.

## Product

Players choose Rogue, Mage, Fighter, or Archer, then enter a shrinking fantasy arena with automatic attacks, five class skills, PvE enemies, class-locked chests, defensive gear, and a manual cooldown dash.

## User preferences

- The user plans to use Claude Code alongside Replit Agent for much of the game coding. Keep work easy to hand off through a shared Git source and avoid overlapping edits without clear ownership.

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
