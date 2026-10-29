"""Voxelize a GLB mesh into merged axis-aligned collision boxes (model units, Babylon handedness)."""
import json, struct, sys
import numpy as np

src, out, cell_xz, cell_y = sys.argv[1], sys.argv[2], float(sys.argv[3]), float(sys.argv[4])
d = open(src, 'rb').read()
n = struct.unpack('<I', d[12:16])[0]
j = json.loads(d[20:20 + n])
bin0 = 20 + n + 8

def acc(i):
    a = j['accessors'][i]; bv = j['bufferViews'][a['bufferView']]
    off = bin0 + bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    comp = {'SCALAR': 1, 'VEC3': 3}[a['type']]
    dt = {5126: np.float32, 5125: np.uint32, 5123: np.uint16}[a['componentType']]
    return np.frombuffer(d, dtype=dt, count=a['count'] * comp, offset=off).reshape(-1, comp) if comp > 1 else np.frombuffer(d, dtype=dt, count=a['count'], offset=off)

prim = j['meshes'][0]['primitives'][0]
P = acc(prim['attributes']['POSITION']).astype(np.float64).copy()
I = acc(prim['indices']).astype(np.int64).reshape(-1, 3)
P[:, 0] *= -1  # glTF -> Babylon (x flips after the loader's root transform is baked)
mn, mx = P.min(0), P.max(0)
print('bounds', mn.round(3), mx.round(3), 'tris', len(I))

nx = int(np.ceil((mx[0] - mn[0]) / cell_xz)) + 1
nz = int(np.ceil((mx[2] - mn[2]) / cell_xz)) + 1
ny = int(np.ceil((mx[1] - 0) / cell_y)) + 1
grid = np.zeros((nx, ny, nz), bool)
# Sample points densely on every triangle and mark their voxels.
step = min(cell_xz, cell_y) * 0.4
for a, b, c in P[I]:
    e1, e2 = b - a, c - a
    m = int(max(np.linalg.norm(e1), np.linalg.norm(e2), np.linalg.norm(c - b)) / step) + 1
    u, v = np.meshgrid(np.linspace(0, 1, m + 1), np.linspace(0, 1, m + 1))
    keep = (u + v) <= 1
    pts = a + np.outer(u[keep], e1) + np.outer(v[keep], e2)
    ix = ((pts[:, 0] - mn[0]) / cell_xz).astype(int)
    iy = np.clip((pts[:, 1] / cell_y).astype(int), 0, ny - 1)
    iz = ((pts[:, 2] - mn[2]) / cell_xz).astype(int)
    grid[ix, iy, iz] = True

# Columns: contiguous vertical runs per (x, z) cell.
runs = {}
for x in range(nx):
    for z in range(nz):
        col = grid[x, :, z]
        y = 0
        while y < ny:
            if col[y]:
                y0 = y
                while y < ny and col[y]: y += 1
                runs.setdefault((y0, y), set()).add((x, z))
            else:
                y += 1
# Greedy merge cells with the same run into rectangles.
boxes = []
for (y0, y1), cells in runs.items():
    cells = set(cells)
    while cells:
        x, z = min(cells)
        w = 1
        while (x + w, z) in cells: w += 1
        h = 1
        while all((x + k, z + h) in cells for k in range(w)): h += 1
        for k in range(w):
            for l in range(h): cells.discard((x + k, z + l))
        cx = mn[0] + (x + w / 2) * cell_xz
        cz = mn[2] + (z + h / 2) * cell_xz
        boxes.append([round(cx, 4), round(cz, 4), round(w * cell_xz / 2, 4), round(h * cell_xz / 2, 4), round(y0 * cell_y, 4), round(y1 * cell_y, 4)])
print('boxes', len(boxes), 'grid', nx, ny, nz)
json.dump(boxes, open(out, 'w'))
