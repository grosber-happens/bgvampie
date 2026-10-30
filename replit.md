# Vampire Battleground (3D prototype)

## Read first
The full game plan is in [`docs/GAME_DESIGN.md`](docs/GAME_DESIGN.md): gameplay, all 4 classes and their skills, progression, art direction, what is built and what is next. Read it before any change.

## Working rules
- The owner decides the design. Build what the brief says. Do not invent classes, skills or rules; ask the owner when something is missing. Items tagged **[Proposal]** still need the owner's approval.
- Priority: gameplay and graphics first, single-player against local bots. Multiplayer is the last phase; do not add networking yet.
- Keep every gameplay number in `src/balance.ts` or the class file's `*NUM` table, never inline.
- A new class or skill goes through the `ClassKit` registry in `src/kit.ts` (see `src/rogue.ts` as the reference kit).
- Keep the art direction: clay characters and buildings, watercolor sky and effects (`src/look.ts`).
- Run `pnpm build` (typecheck + build) before you commit. Claude Code also works on this repo through Git, so keep commits small and pull before you start.
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
