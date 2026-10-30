# Vendored design skill

Project-level Claude Code skill, copied from upstream so every Claude session
on this repo (local or cloud) can use it without installing anything.

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

To update, re-copy the same files from a newer upstream commit and keep the
notes above in sync.
