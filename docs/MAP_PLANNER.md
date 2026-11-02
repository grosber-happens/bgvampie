# Map planner (Harita Planlayıcı)

Open `/planner.html` (or the "Harita planlayıcı" button on the title screen). It grows one Harvest map of Ufuk-i Kehribar from a seed and sliders, then lets you edit it by hand.

## How the map is made

- `src/mapgen/` is pure TypeScript (no Babylon), so the game, the sim or a server can rebuild the exact map from a saved file.
  - `generate.ts`: landscapes, terrain height, object kinds and placement. `Field` answers height, slope and landscape weights at any point; `generate()` places objects; `applyOps()` replays hand edits.
  - `noise.ts`: seeded random and value/fractal/ridged noise.
- Landscapes follow `design/dunya-tasarimi.md`: Kızıl Kanyon in the middle; clockwise from north Spor Ormanı, Asma Köyler, Turkuaz Lagün, Kehribar Kumu, Kemik Şehir. Borders are wobbly and blended, never hard lines. Each landscape has its own terrain shape (canyon cuts, rolling spore hills, high village ridges, lagoon islands, dunes, city terraces).
- Landmarks: the Kızıl Katedral in the canyon center and the Fallen Giant (Düşmüş Dev, design §11.1). The ground flattens under them.
- Vendor machines (Kurbağa Loncası, `src/mapgen/vendors.ts`): placed before everything else on dry, flat ground away from landmarks, spread evenly (best-candidate sampling) with at least one per landscape. The count follows the map size: one machine for about every 0.1 km² (nearest machine about 130 m away on average, 200 m at worst). The "Satıcı makineleri" slider scales the count (0 = none); the minimap shows them as amber dots, lucky ones (one in four) violet. You can also place machines by hand: Yerleştir (2) → Simge → "Satıcı makinesi" (normal) or "Şanslı makine" (lucky, violet shell). A hand-placed machine is exactly the kind you picked. See `docs/SHOP.md`.
- Objects are made only of primitives (box, cylinder, cone, sphere, dome, ring, rock) in `src/planner/kit.ts`: 27 kinds, such as tower mushrooms with balconies and windows, Moebius flat-top trees, giant flowers, Gardener robots, walking houses, buried gears, blood pipes, boilers, antenna towers, monowheels, stone heads and hands, clay domes, brutalist blocks, hanging highways, capsule houses, red gates, lagoon arches, moss hills with faces and Kusama polka dots. All parts are thin instances: about one draw call per shape.

## Editor

- Tools (left): view, place (pick a kind), move (grab an object and drag it), erase brush, raise / lower terrain brush, mirror (left-right, front-back, four-way), undo / redo, walk (WASD, Shift to run), photo, hide UI.
- Camera, in every tool: WASD or the arrows move forward, back, left and right along the view, like walking (speed follows the zoom, Shift is three times faster). Right drag turns the camera, middle drag pans, the wheel zooms. In the view tool left drag also turns.
- Move tool: click an object to select it, drag to move it. Resize it with the wheel while holding it, `[` / `]`, or the "Nesne boyu" slider (0.2× to 6×). It writes a `move` op (`{ t: 'move', k, x, z, nx, nz, ns? }`): the object of kind `k` at (x, z) goes to (nx, nz) and, with `ns`, gets that size. It edits one object; mirror does not apply. The game uses the new size for drawing and for the collision box.
- Panel (right): seed and dice, symmetry for fair maps, landscape toggles, terrain sliders, density sliders, atmosphere presets (Altın Saat, Koi Tutulması, Kızıl Sis, Spor Sabahı) and sliders for fog, sun, bloom, god rays, ink lines, spores, koi and paper grain.
- Keys: 1–6 tools (6 is move), M mirror, Y walk, P photo, H hide UI, R new seed, Ctrl+Z / Ctrl+Y.
- The map autosaves in the browser. Export / import writes a JSON `MapFile` (`{ v, gen, ops, atmos }`): the generator settings plus the ordered hand edits, so files stay small.
- `?q=low` renders at lower resolution with lighter shadows.

## Map size and chunks

- The default map is 4 × 4 km (`size: 4000`); the "Harita boyu" slider goes from 160 m to 4 km.
- `MapView` (`src/planner/build.ts`) splits the map into chunks: terrain chunks of 64 cells (cells are about 2.5 m on small maps, 5 m on big ones, at most 920 per side), and object buckets half that size. A brush stroke, a placed or a moved object rebuilds only the chunks it touches.
- The planner builds and draws objects only near the camera (220 to 700 m, following the zoom), two buckets per frame, nearest first. The minimap shows the whole map. The game builds every bucket at once.
- Objects grow on the natural terrain: `generate()` ignores hand lifts, so a terrain stroke moves the objects in it up or down instead of re-rolling the map.
- A 4 km map at default density has about 344,000 objects; growing it takes several seconds after each slider change. Making it light enough for the game (chunk streaming, colliders, density) is Phase 1 work in `docs/ROADMAP.md`.

## Look

`src/planner/atmos.ts`: watercolor sky shader with the huge amber sun in the west, depth-based height fog that glows toward the sun, Moebius-style ink outlines from depth edges, god rays, spores in the air, up to three koi high in the sky, and the Kızıl Sis ring at the map edge.

## In the game

- `?map=47216` and `?map=8011` play the two maps bundled in `src/assets/maps/` (also buttons on the title screen). `?map=planner` plays the planner's browser autosave; the planner's **Oyunda oyna** button saves and opens it (same browser only).
- `src/mapgen/mapfile.ts` checks every file before the game builds it (`parseMapFile`): version 1, numeric seed, size 50–8000 m, one flag per landscape, and well-formed hand edits with known kinds. Missing generator settings take the planner defaults. The planner's import uses the same check.
- A broken, empty or unknown map never crashes the game: it plays the old city block, the title line and the start toast say "Harita yüklenemedi, şehir bloğu açıldı", and the console logs why.
- `src/world.ts` builds the terrain and objects with the planner's `MapView`. Actors walk on the terrain height, and the map edge stops them (`resolveWalls`).
- Spor Ormanı Blender models (`SPOR_KINDS` in `src/mapgen/generate.ts`, loaded by `src/spor.ts` from `src/assets/spor/`): 3 mushroom houses, 3 bridges, a giant mushroom cluster, 3 single mushrooms and 4 enoki clusters. Placed by hand only; the planner shows a simple stand-in, the game loads the .glb with its LOD0/1/2 meshes. Houses and bridges use collision boxes baked from the model (`src/assets/spor/carpisma.json`, made by `tools/blender/spor_carpisma.py`): you can walk in the door, up the stairs to the balcony, and across the bridge decks. Mushrooms only have a solid stem. Source scripts: `tools/blender/`.
- Every object except Kusama dots becomes one solid box from its footprint (`r × 0.72` half size). The box starts at the lowest ground under its footprint, so nothing slips under it on a slope. Vendor machines come from the map's `satici` and `sansli` objects.

## Not yet

- Bridges (kopru), arches (kemer), the Kızıl Katedral and the Fallen Giant are single solid boxes: you cannot walk under or climb them yet.
- The planner atmosphere (sky shader, ink lines, god rays, koi) is not in the game; only the fog density carries over.
- Water is only visual: the lagoon bed is walkable ground.
