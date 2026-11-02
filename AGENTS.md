# Vampire Battleground: rules for agents (Claude, Codex)

## Read first
The full game plan is in [`docs/GAME_DESIGN.md`](docs/GAME_DESIGN.md): gameplay, all 4 classes and their skills, progression, art direction. The phases and the supervisor/worker workflow are in [`docs/ROADMAP.md`](docs/ROADMAP.md). Read both before any change.

## Working rules
- The owner decides the design. Build what the brief says. Do not invent classes, skills or rules; ask the owner when something is missing. Items tagged **[Proposal]** still need the owner's approval.
- Priority: gameplay and graphics first, single-player against local bots. Multiplayer is the last phase; do not add networking yet.
- Keep every gameplay number in `src/balance.ts` or the class file's `*NUM` table, never inline.
- A new class or skill goes through the `ClassKit` registry in `src/kit.ts` (see `src/rogue.ts` as the reference kit).
- Keep the art direction: clay characters and buildings, watercolor sky and effects (`src/look.ts`).
- One task = one branch = one PR, branched from the latest `main` (`claude/...` or `codex/...`). Never commit to `main` directly and never merge; the owner merges after review.
- Run `pnpm build` (typecheck + build) before you open a PR. Update the docs your change touches in the same PR.
- The owner sometimes writes in Turkish; reply in their language. In-game text is Turkish and English: every UI string goes through `t()` in `src/i18n.ts`, and skill names and texts live in `SKILL_TEXT` there.
- Item data (armor, jewels, weapons, Noir set, bandage) lives in `src/gear.ts`. Keep it free of Babylon imports, because the headless simulator in `sim/` imports it. Re-run `sim/gear-test.ts` after changing item numbers (see `docs/GEAR.md`).
- Painted icons come from `public/art/` (cut by `tools/art/cut.py`); without a file the game falls back to the SVG ink icon.

## Run
```
pnpm install
pnpm dev      # dev server on port 22913
pnpm build    # typecheck + production build into dist/public
```
Test URL parameters: `?class=rogue|mage|fighter|scout`, `?debug=1` (L level, B boss, K currency), `?seed=N`, `?look=classic`.
