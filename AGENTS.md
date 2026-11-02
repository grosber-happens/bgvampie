# Vampire Battleground: rules for agents (Claude, Codex)

Read [`docs/GAME_DESIGN.md`](docs/GAME_DESIGN.md) (the game) and [`docs/ROADMAP.md`](docs/ROADMAP.md) (phases and workflow) before any change. Run commands are in the README.

- The owner decides the design. Do not invent classes, skills or rules; ask when something is missing. Items tagged **[Proposal]** need the owner's approval.
- One task = one branch = one PR, branched from the latest `main` (`claude/...` or `codex/...`). Never commit to `main` directly and never merge; the owner merges after review.
- Run `pnpm build` before you open a PR. Update the docs your change touches in the same PR.
- Gameplay numbers live in `src/balance.ts` or the class file's `*NUM` table, never inline.
- New classes and skills go through the `ClassKit` registry in `src/kit.ts`.
- Every UI string goes through `t()` in `src/i18n.ts` (Turkish and English).
- Keep `src/gear.ts` and `src/mapgen/` free of Babylon imports; the simulator in `sim/` imports them.
