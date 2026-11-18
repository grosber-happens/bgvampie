# Map planner (Harita Planlayıcı)

Open `/planner.html` (or the "Harita planlayıcı" button on the title screen). It grows one Harvest map of Ufuk-i Kehribar from a seed and sliders, then lets you edit it by hand.

## How the map is made

- `src/mapgen/` is pure TypeScript (no Babylon), so the game, the sim or a server can rebuild the exact map from a saved file.
  - `generate.ts`: landscapes, terrain height, object kinds and placement. `Field` answers height, slope and landscape weights at any point; `generate()` places objects; `applyOps()` replays hand edits.
  - `noise.ts`: seeded random and value/fractal/ridged noise.
- Landscapes follow `design/dunya-tasarimi.md`: Kızıl Kanyon in the middle; clockwise from north Spor Ormanı, Asma Köyler, Turkuaz Lagün, Kehribar Kumu, Kemik Şehir. Borders are wobbly and blended, never hard lines. Each landscape has its own terrain shape (canyon cuts, rolling spore hills, high village ridges, lagoon islands, dunes, city terraces).
- Landmarks: the Kızıl Katedral in the canyon center and the Fallen Giant (Düşmüş Dev, design §11.1). The ground flattens under them.
- Vendor machines (Kurbağa Loncası, `src/mapgen/vendors.ts`): placed before everything else on dry, flat ground away from landmarks, spread evenly (best-candidate sampling) with at least one per landscape. The count follows the map size: one machine for about every 0.1 km² (nearest machine about 130 m away on average, 200 m at worst). The "Satıcı makineleri" slider scales the count (0 = none); the minimap shows them as amber dots, lucky ones (one in four) violet. You can also place machines by hand: Yerleştir (2) → Simge → "Satıcı makinesi" (normal) or "Şanslı makine" (lucky, violet shell). A hand-placed machine is exactly the kind you picked. See `docs/SHOP.md`.
- Objects are made only of primitives (box, cylinder, cone, sphere, dome, ring, rock) in `src/planner/kit.ts`: 28 kinds, such as tower mushrooms with balconies and windows, Moebius flat-top trees, giant flowers, Gardener robots, walking houses, buried gears, blood pipes, boilers, antenna towers, monowheels, stone heads and hands, clay domes, brutalist blocks, hanging highways, capsule houses, red gates, lagoon arches, moss hills with faces and Kusama polka dots. All parts are thin instances: about one draw call per shape.
- Bouncy morel (Zıplama mantarı, `morel`, in the "Mantar ve çiçek" palette): a 2 m jump pad that is never scattered by the generator; place it by hand. In the game it throws players who land on it (`docs/MOVEMENT.md`).

## Editor

- Layout: a top bar (map name, object count, build time, fps, language chip TR/EN), the tool rail on the left, a drawer next to it for the active tool (palette, brush, selection), the panel on the right with five tabs (Land, Objects, Atmosphere, Effects, File; the last tab is remembered), and the minimap bottom right. Every string goes through `t()` (`src/planner/strings.ts`); icons are inline SVG (`src/planner/icons.ts`). Styles: `src/planner/planner.css` (paper and ink tokens, soft shadows, Shantell Sans). Under 900 px the panel folds behind a button.
- Tools: browse (1), place (2, the drawer shows the palette with search and group chips: Spor Ormanı groups first, then the old kit), erase brush (3), raise / lower terrain (4 / 5), move (6), effect region (Z), walk (Y), mirror (M), undo / redo (Ctrl+Z / Ctrl+Y; only the chunks the undone edits touch are redrawn), photo (P), hide UI (H), new seed (R).
- Camera, in every tool: WASD or the arrows move along the view (speed follows the zoom, Shift is three times faster). The camera keeps its height while it moves and only climbs when it would go into a hill (`EDIT.flyClearance`). Right drag turns, middle drag pans, the wheel zooms. In the browse tool left drag also turns.
- Move tool: click an object to select it, drag to move it. Resize it with the wheel while holding it, `[` / `]`, or the size slider in the drawer (0.2× to 6×). It writes a `move` op (`{ t: 'move', k, x, z, nx, nz, ns? }`). Mirror does not apply. A selected building shows an "Enter" button.
- The map autosaves in the browser. The File tab exports / imports a JSON `MapFile` (`{ v, gen, ops, atmos?, fx?, interiors? }`): the generator settings plus the ordered hand edits, so files stay small. "Play in game" saves and opens `?map=planner`.
- `?q=low` renders at lower resolution with lighter shadows.

## Effect regions

Spores, fog and fireflies are set per region, as a share of the atmosphere preset (0 to 300%). Data and math are pure (`src/mapgen/fx.ts`); the editor is `src/planner/fxzones.ts`.

- **Outside**: the values everywhere no region covers (default: no spores, normal fog and fireflies).
- **Circle regions**: with the effect region tool (Z), click empty ground to add a 60 m circle, click a circle to select it, drag to move it, hold and wheel to resize it. The planner draws circles as soft colored walls; the minimap shows them too. The edge fades over the outer 30%.
- **Landscape regions**: the Effects tab can add a whole landscape (Spor Ormanı, Kızıl Kanyon…); it follows the landscape weights, so the blend at the border stays soft.
- Later regions in the list win over earlier ones where they overlap. Each region has its own spores / fog / fireflies sliders and, for circles, a radius slider.
- The planner atmosphere eases toward the values under the camera; the game uses the values under the player (`src/regionfx.ts`): fog density, spore drift rate, and how many firefly swarms wake up.

## Interior designer

Double-click a house or the camp tent (or "Enter" in the move tool) to go inside (`src/planner/interior.ts`).

- The camera moves into the building, and a clip plane hides everything above the current floor's ceiling, so the roof and upper floors disappear. Floors come from the model (`src/assets/spor/ic/ic.json`, baked by `tools/assets/bake-interior.mjs`); PgUp / PgDn or the floor buttons switch floors. Esc or "Back" leaves.
- The panel lists the 51 interior props (Gaudí furniture, mushroom stools, lamps, rugs, pots…) by group with search. Click the floor to place; click a prop to select and drag it; R / Shift+R turn it by 15°; Del removes it; the lift slider raises it.
- Snap: a prop near a wall turns to face the room and backs up to the wall; hanging lamps go under the ceiling; small "top" items (plates, candles) land on the nearest table or counter.
- Checks: seat height (0.38–0.55 m), table (0.68–0.84 m) and counter (0.78–0.98 m) heights, a seat-table pair height gap, headroom under the ceiling, props sunk in walls and props overlapping each other. Numbers: `INTERIOR` in `src/balance.ts`.
- Layouts are saved in building-local coordinates. By default a layout is the **template** for that building kind, shared by every copy on the map; switch to "This house only" to make an override for one house (`interiors.overrides`, keyed by kind and position; moving the house keeps it). Data: `src/mapgen/interior.ts`.
- In the game the props are drawn as thin instances and get collision boxes (`src/interiors.ts`).

## Map size and chunks

- The default map is 4 × 4 km (`size: 4000`); the "Harita boyu" slider goes from 160 m to 4 km.
- `MapView` (`src/planner/build.ts`) splits the map into chunks: terrain chunks of 64 cells (cells are about 2.5 m on small maps, 5 m on big ones, at most 920 per side), and object buckets a quarter of that size (80 m on a 4 km map). A brush stroke, a placed or a moved object rebuilds only the chunks it touches.
- Object buckets stream around the camera (planner) or the player (game), with LODs for objects and terrain and one thin-instance batch per shape, material and LOD. The rules and numbers are in [`PERFORMANCE.md`](PERFORMANCE.md). The planner loads 220 to 700 m around the camera, following the zoom; the minimap shows the whole map.
- Objects grow on the natural terrain: `generate()` ignores hand lifts, so a terrain stroke moves the objects in it up or down instead of re-rolling the map.
- A 4 km map at default density has about 344,000 objects; growing it takes several seconds after each slider change. Making it light enough for the game (chunk streaming, colliders, density) is Phase 1 work in `docs/ROADMAP.md`.

## Look

`src/planner/atmos.ts`: watercolor sky shader with the huge amber sun in the west, depth-based height fog that glows toward the sun, Moebius-style ink outlines from depth edges, god rays, spores in the air, up to three koi high in the sky, and the Kızıl Sis ring at the map edge.

Spores (`src/sporfx.ts`, numbers in `SPORE_FX`) are watercolor dabs: irregular pigment blots with a darker drying rim and paper granulation, in two pigments per preset, drifting on slow noise. The planner and the game use the same particle system; the effect regions scale how many there are.

## In the game

- With no `?map` the game plays the **Spor Ormanı test map** (`src/mapgen/spormap.ts`, numbers in its `SPOR_MAP` table): 1.5×1.5 km, Spor Ormanı only, no kit objects. A creek meanders north to south (hand lifts) with 6 bridges, 4 villages of 3–4 mushroom houses (drawn at `HOUSE_SCALE`, like every house on every map) with morels, grass and fireflies, and forest groves and glades of giant clusters, big, medium and small mushrooms, moss mounds, red sprouts and enoki clumps, plus the landmarks below. Every Spor Ormanı model is on it: rocks and cut stones, five small forest mushrooms, blue puffballs, the five giant cluster variants, lamps and props round each village and the town, two Gaudí bridges over the creek, and a showcase clearing at (0, -560) with the four balcony bridges and the mycelium tunnel pieces. The layout is rebuilt from code on load; `?map=city` plays the old city block.
- Houses (`ev_*`) are drawn at `HOUSE_SCALE` (mushroom 1.3×, glass and Gaudí 1.4×, in `src/mapgen/generate.ts`) in the planner and in the game. The size slider and the saved `s`/`ns` stay the hand-set size (1.00× is the normal house); the factor comes on top (`withKindScale`), so maps saved before 2026-11-10 get the bigger houses too.
- `?map=47216` and `?map=8011` play the two maps bundled in `src/assets/maps/` (also buttons on the title screen). `?map=planner` plays the planner's browser autosave; the planner's **Oyunda oyna** button saves and opens it (same browser only).
- `src/mapgen/mapfile.ts` checks every file before the game builds it (`parseMapFile`): version 1, numeric seed, size 50–8000 m, one flag per landscape, and well-formed hand edits with known kinds. Missing generator settings take the planner defaults. The planner's import uses the same check.
- A broken, empty or unknown map never crashes the game: it plays the old city block, the title line and the start toast say "Harita yüklenemedi, şehir bloğu açıldı", and the console logs why.
- `src/world.ts` builds the terrain and objects with the planner's `MapView`. Actors walk on the terrain height, and the map edge stops them (`resolveWalls`).
- Spor Ormanı and small-town Blender models (`SPOR_KINDS` in `src/mapgen/generate.ts`, 101 kinds in 9 palette groups: 10 houses, 9 bridges, 11 monuments (mycelium gates, the mushroom-woman statue, maze walls, posts and paths), 20 mushrooms, 9 fantastical trees, 14 rocks and street props, 8 floating rocks, 12 camp pieces, 8 outdoor props). Placed by hand only; the planner and the game both draw the .glb with its LOD0/1/2 meshes. Houses, bridges, landmarks and animated models are full models in the game (`placeSpor`, which also swaps LODs by distance); the rest are thin instances streamed by the map view (`sporInstanced`, `useSporModels`). Floating rocks hover over the ground (`lift` in `SPOR_KINDS`). Bridges rest on the lower of their two banks (`baseHeight`). Collision boxes are baked from the model (`src/assets/spor/carpisma.json`, unpacked by `src/collide.ts`): you can walk in the door, up the stairs, across bridge decks and through the maze. Walkable models (houses, bridges, rocks, the statue, the maze) get floor slabs and wall boxes on a 25 cm grid; everything else that stands in the way (mushrooms, trees, camp kit, lamps, crates, fences) is voxelized, filled and merged into boxes that follow its shape (`SOLID` in `bake-collision.mjs`, with a box budget per kind). Grass, enoki, tiny mushrooms, sprouts and pebbles stay walk-through. Boxes keep the model's turn, so a turned model is not fattened into an axis-aligned box, and each model's boxes are only built when something comes near.
- Asset tools (`tools/assets/`, run with node): `spor-assets.mjs` lists every model, its source in the project files and its triangle budget; `pack-spor.mjs [names]` packs them (shared watercolor paper texture taken out, LOD0 simplified to budget, meshopt compression) and writes `olcu.json`; `bake-collision.mjs [names]` bakes collision boxes; a model's `cut` boxes in `spor-assets.mjs` remove parts at pack time (the temple tree's door leaves); `bake-interior.mjs` finds each building's floors and each interior prop's size and table top (`ic/ic.json`).
- The test map also has the statue in its maze, the nomad camp, a small town of seven plaster, glass and mosaic houses, the temple tree with floating rocks, fantastical trees through the forest, and effect regions (thick spores in the villages, the town, the maze and the camp; thin spores elsewhere).
- Spor Ormanı ground cover (`src/cimen.ts`, numbers in its `CIMEN` table), both in the "Mantar ve çiçek" palette and placed by hand; you walk through them:
  - Grass patch (Çimen alanı, `cimen`): a 6 m circle at size 1. The game scatters dark green grass clumps over it (4 Blender variants `cimen_*.glb`, about 0.9 clumps per m², thinning out at the edge so painted patches blend into one field). Only grass within 110 m draws, with LOD0/1/2 at 20 and 50 m. The planner shows a dark disc with a few tufts.
  - Fireflies (Ateş böcekleri, `atesbocegi`): a swarm over an 8 m circle at size 1. While the player is within 45 m, its fireflies drift and blink as soft watercolor blots of light (`isik_lekesi.png`, additive sprites); farther away the swarm sleeps and costs nothing.
- Every object except Kusama dots becomes one solid box from its footprint (`r × 0.72` half size). The box starts at the lowest ground under its footprint, so nothing slips under it on a slope. Vendor machines come from the map's `satici` and `sansli` objects.

## Not yet

- Bridges (kopru), arches (kemer), the Kızıl Katedral and the Fallen Giant are single solid boxes: you cannot walk under or climb them yet.
- The planner atmosphere (sky shader, ink lines, god rays, koi) is not in the game; only the fog density and the spores carry over.
- Water is only visual: the lagoon bed is walkable ground.
