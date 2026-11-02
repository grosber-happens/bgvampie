# Performance: chunk streaming, LOD, instancing

ROADMAP Faz 1, first three topics. Goal: a 4×4 km map with dense objects runs in the browser.

## How it works

The rules are pure TypeScript in `src/mapgen/stream.ts` (no Babylon, numbers in its `STREAM` table). `MapView` in `src/planner/build.ts` draws with them, in the game and in the planner.

- **Chunk streaming.** Objects live in 80 m buckets (a quarter of a terrain chunk). A bucket loads (its parts are built) inside the load radius and is freed only outside the unload radius (`STREAM.unload / STREAM.load`, about 1.33×), so walking along the edge never loads and frees the same bucket over and over. At most `buildsPerFrame` buckets build per frame, nearest first. In the game the load radius follows the fog: about where an object fades out (2 / fog density), clamped to 220–1100 m. At spawn everything in sight builds at once.
- **LOD.** Objects: LOD0 under 50 m, LOD1 under 150 m, LOD2 beyond. Far levels use kit shapes with fewer sides (`SHAPE_DETAIL` in build.ts) and drop small parts (under 0.25 m at LOD1, 0.6 m at LOD2); glowing parts always stay. Terrain: every chunk keeps its vertices and switches between index lists that use every 1st, 2nd, 4th or 8th grid point (under 450 m, 1000 m, 1900 m, beyond). Skirts (6 m strips under every chunk edge) hide cracks between chunks of different detail.
- **Hysteresis.** A level changes only 25 m past its band edge (`lodFor`), so standing on a border does not flicker.
- **Instancing.** Every shape × material × LOD is one mesh with one thin-instance buffer holding the parts of every loaded bucket. The buffer is repacked only when a bucket loads, unloads, changes LOD or is edited, and it grows with spare room. Draw calls stay flat however big the map is.
- **Shadows.** In the game only LOD0 batches cast shadows and the terrain does not, so the shadow map covers the fight around the player instead of the whole 4 km map. Hills no longer shadow each other; that was 2 m per shadow texel on a 4 km map anyway.

## Blender models with LODs

`src/models.ts` loads a region .glb whose nodes are named `<name>_LOD0`, `<name>_LOD1`, `<name>_LOD2` (the Spor Ormanı scripts already export this way). `MapView.useModels(kind, models)` then draws those models for a map kind instead of its kit recipe, with the same streaming, LOD bands and batching; variants are picked by the object's number, and the model is scaled so its width matches the kind's footprint.

Which model replaces which kind is a content decision, so the game does not do it yet. `perf.html?models=1` tries it with the mushrooms (copy `mantar_kucuk/orta/buyuk`, `mantar_kumesi` and `yosun_tumsek` into `public/perf-models/`, which git ignores).

## Measuring

- `?map=perf` plays the test map: 4×4 km, seed 4040, denser trees, mushrooms, giants and rocks (`src/mapgen/perfmap.ts`), about 370 000 objects.
- `/perf.html` builds it like the game and flies a head-height camera along a loop through Spor Ormanı and the canyon. `?frames=`, `?step=` (meters per frame), `?size=` (a smaller map at the same density).
- `node tools/perf-bench.mjs [url] [frames] [step]` runs it in headless Chromium and prints the result (`SIZE=1000`, `VIEW=320x180`, `QUERY=&models=1`).
- `node --experimental-strip-types --no-warnings sim/stream-test.ts` checks the streaming and hysteresis rules.

Headless Chromium draws with SwiftShader (on the CPU), so its frame times are 50–100× slower than a laptop GPU. Compare runs with each other; draw calls and triangles are the same on any machine.

## Results (2026-11-02)

320×180, 30 frames, 6 m per frame, default fog. Before = the chunked planner map view of PR #22, where the game drew every bucket.

| | Before, 1 km | After, 1 km | Before, 4 km | After, 4 km |
|---|---|---|---|---|
| Objects | 23 484 | 23 484 | 370 877 | 370 877 |
| Draw calls (avg / max) | 961 / 1014 | 61 / 63 | no frame in 30 min | 151 / 154 |
| Triangles (avg / max) | 75.3 M / 82.6 M | 6.0 M / 9.0 M | — | 10.2 M / 12.5 M |
| Frame, SwiftShader (avg) | 13.5 s | 1.6 s | — | 2.3 s |
| JS heap | 90 MB | 65 MB | — | 291 MB |
| Map build | 1.9 s | 1.2 s | — | 11.6 s |

With the Blender mushrooms on the 1 km map: 65 draw calls, 7–8 M triangles. `mantar_kumesi` LOD0 is 30 500 triangles; 100 of them near the camera are 3 M triangles, the heaviest batch on the map. LOD0 of a repeated prop should stay near 5 000.

## Planner editing on 4 km (2026-11-02)

Default 4 km planner map (344 000 objects), 30 strokes of erase, place and raise (190 hand edits), measured in headless Chromium (CPU only, so real machines are faster; compare the columns).

| | Before | After |
|---|---|---|
| Undo (one step) | 4.0–8.9 s | 0.10–0.20 s |
| Redo (one step) | 3.7–4.3 s | 0.09–0.17 s |
| One brush dab | 311 ms | 49 ms |

What changed: undo and redo redraw only the chunks the differing edits touch (before: the whole terrain and every object). `applyOps` finds objects with a grid instead of scanning all of them for every erase and move, and `Field` finds hand lifts with a grid instead of looping over every lift for every height sample (same results, checked against the old code). The minimap draws objects into a pixel buffer and keeps its ground layer when only objects changed (before: one canvas call per object, up to 37 s in one case). Numbers are in `EDIT` in `src/mapgen/generate.ts`.

## Next

- Map build on 4 km takes about 12 s (object placement is 8 s of it): move `generate()` to a worker or cache the result.
- Collision boxes for all 370 000 objects stay in memory (likely a large part of the 291 MB heap, not measured yet); stream them with the same buckets.
- Batches are not frustum culled (one buffer per batch covers the whole loaded area); fine for now, revisit if the GPU becomes the limit.
- Frame budget, fixed timestep, time slicing and pooling are the next Faz 1 topics.
