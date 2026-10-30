# Vendored design skills

Project-level Claude Code skills, copied from upstream so every Claude session
on this repo (local or cloud) can use them without installing anything.

## impeccable

- Source: https://github.com/pbakaus/impeccable (npm `impeccable` 4.8.0),
  commit `02523aec3e4c4580102d996d1b6a71fbe062e03f`
- License: Apache-2.0 (`impeccable/LICENSE`, third-party notices in `impeccable/NOTICE.md`)
- Included: `SKILL.md` and `reference/` (unmodified).
- Left out on purpose:
  - `scripts/` — the `impeccable` launcher downloads a prebuilt binary from
    GitHub releases on first run. Without it the skill uses its built-in
    "Launcher unavailable" fallback (reads PRODUCT.md / DESIGN.md directly).
    Detector and `live` browser features are therefore off.
  - The `.claude/settings.json` hooks that `npx impeccable install` adds
    (they run the binary after every Edit/Write and on Stop).

## ui-ux-pro-max

- Source: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill (v2.15.0),
  commit `28b3b8dee8c976df4fa3e94aed4e092ad43fcb03`
- License: MIT (`ui-ux-pro-max/LICENSE`)
- Included: `SKILL.md`, `references/`, `data/` (CSV catalogs) and the search
  scripts (`search.py`, `core.py`, `design_system.py`, `reasoning_contract.py`).
  These are offline, standard-library-only Python; no network access.
- Change: in `SKILL.md`, `${CLAUDE_PLUGIN_ROOT}` was replaced with
  `${CLAUDE_PROJECT_DIR:-.}` so the script path resolves as a project skill.
- Left out: tests, `validate_data.py`, and the sibling skills from the same repo
  (banner-design, brand, design, design-system, slides, ui-styling).

To update, re-copy the same folders from a newer upstream commit and keep the
notes above in sync.
