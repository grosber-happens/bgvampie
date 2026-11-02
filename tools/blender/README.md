# Blender region asset scripts

Each script builds one region's asset kit from simple primitives with code, then exports `.glb` files.
All colors are vertex colors on one shared material, so each asset is one draw call.

## Spor Ormanı (`spor_ormani.py`)

Reference: a giant mushroom cluster in soft watercolor tones (owner approved, 2026-11-02).

| Asset | What it is | Triangles LOD0 / LOD1 / LOD2 |
|---|---|---|
| `mantar_kumesi` | 1 giant mushroom (about 25 m) + 4 smaller ones on a moss mound, red sprouts | 30.5k / 10.7k / 3k |
| `mantar_kucuk` | single small mushroom (about 3 m) | 5.5k / 1.9k / 0.6k |
| `mantar_orta` | single medium mushroom (about 7.5 m) | 5.9k / 2.1k / 0.6k |
| `mantar_buyuk` | single large mushroom (about 15 m) | 6.6k / 2.3k / 0.7k |
| `yosun_tumsek` | moss mound (8 m wide) | 1.3k / 0.5k / 0.1k |
| `kizil_filiz` | bunch of red sprouts | 0.7k / 0.2k / 0.1k |

Each `.glb` holds three meshes named `<asset>_LOD0`, `_LOD1` and `_LOD2` at the same spot.
In Babylon, keep LOD0 visible and attach the others with `addLODLevel(distance, mesh)`.
Output copies live in `public/assets/spor-ormani/`.

Scale: 1 unit = 1 m. Characters are about 1.8 m.

### Run

With Blender installed:

```
blender -b -P tools/blender/spor_ormani.py -- out/spor-ormani --render
```

Or with the `bpy` pip module (Python 3.13): `pip install bpy` then `python3 tools/blender/spor_ormani.py out/spor-ormani --render`.

`--render` also writes preview PNGs to `out/spor-ormani/onizleme/` (Cycles on CPU, about 2 minutes).
The script also saves `spor_ormani.blend`; open it to edit by hand.

### Tweak

All numbers are at the top of the script: `PAL` (colors), `CLUSTER` (positions, heights, cap sizes, lean),
`SINGLES`, `LOD_RATIOS` and `SEED` (change it for a different random layout of spots and moss).
