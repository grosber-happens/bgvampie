"""Build the game icons in public/art: hand-drawn icons from tools/art/hand win; anything not drawn yet is cut from the Artlist sprite sheets in tools/art/sheets into game icons in public/art.
Run: python3 tools/art/cut.py  (needs Pillow). Writes public/art/index.json."""
import json
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
SHEETS = ROOT / 'tools/art/sheets'
OUT = ROOT / 'public/art'
SIZE = 160

ITEM_SHEETS = {
    'armor': ['l_head', 'l_chest', 'l_legs', 'm_head', 'm_chest', 'm_legs', 'h_head', 'h_chest', 'h_legs'],
    'jewels': ['n_ember', 'n_clock', 'n_halo', 'n_pulse', 'r_blood', 'r_flint', 'r_shadow', 'r_stitch', 'bandage'],
    'noir-weapons': ['s_hat', 's_coat', 's_shoes', 's_ring', 's_locket', 'w_rogue_r', 'w_rogue_m', 'w_mage_r', 'w_mage_m'],
    'weapons-misc': ['w_fighter_r', 'w_fighter_m', 'w_scout_r', 'w_scout_m', 'reel', 'coin', 'essence', 'token', 'satchel'],
}
SKILL_SHEETS = {
    'rogue': ['invis', 'evasion', 'decoy', 'poison', 'sprint', 'kidney', 'execute', 'wink', 'detonate', 'insane', 'rogue_p1', 'rogue_p2'],
    'mage': ['sonic', 'bombs', 'fog', 'sunray', 'nanobots', 'blink', 'armor', 'arms', 'gravity', 'mines', 'mage_p1', 'mage_p2'],
    'fighter': ['second', 'rain', 'eshield', 'chain', 'pierce', 'charge', 'leap', 'whirl', 'overpower', 'recall', 'fighter_p1', 'fighter_p2'],
    'scout': ['shotgun', 'hook', 'fast', 'smoke', 'pack', 'hunt', 'pounce', 'rend', 'drone', 'trap', 'scout_p1', 'scout_p2'],
}

index = []
# Items drawn by hand in tools/art/hand win over the Artlist sheets.
HAND = {f.stem for f in (ROOT / 'tools/art/hand/svg').glob('*.svg')}

def grid(img, cols, rows):
    w, h = img.size
    cw, ch = w / cols, h / rows
    for r in range(rows):
        for c in range(cols):
            yield c * cw, r * ch, cw, ch

for sheet, ids in ITEM_SHEETS.items():
    img = Image.open(SHEETS / f'{sheet}.jpg').convert('RGB')
    for (x, y, cw, ch), id_ in zip(grid(img, 3, 3), ids):
        index.append(f'items/{id_}')
        if id_ in HAND:
            Image.open(ROOT / f'tools/art/hand/png/{id_}.png').convert('RGB').save(OUT / 'items' / f'{id_}.webp', quality=90)
            continue
        pad = cw * 0.06  # trim the paper gutter between tiles
        tile = img.crop((round(x + pad), round(y + pad), round(x + cw - pad), round(y + ch - pad))).resize((SIZE, SIZE), Image.LANCZOS)
        tile.save(OUT / 'items' / f'{id_}.webp', quality=88)

# Skills drawn by hand in tools/art/hand/skills.py win too (transparent PNGs).
HAND_SKILLS = {f.stem for f in (ROOT / 'tools/art/hand/svg-skills').glob('*.svg')}

for cls, ids in SKILL_SHEETS.items():
    img = Image.open(SHEETS / f'skills-{cls}.jpg').convert('RGB')
    # The mage sheet has English labels along the bottom of each circle: zoom in to keep only the picture.
    k = 0.36 if cls == 'mage' else 0.46
    up = 0.07 if cls == 'mage' else 0.0
    for (x, y, cw, ch), id_ in zip(grid(img, 4, 3), ids):
        if id_ in HAND_SKILLS:
            Image.open(ROOT / f'tools/art/hand/png/{id_}.png').convert('RGBA').save(OUT / 'skills' / f'{id_}.webp', quality=90)
            index.append(f'skills/{id_}')
            continue
        cx, cy = x + cw / 2, y + ch / 2 - ch * up
        r = min(cw, ch) * k
        tile = img.crop((round(cx - r), round(cy - r), round(cx + r), round(cy + r))).resize((SIZE, SIZE), Image.LANCZOS)
        mask = Image.new('L', (SIZE * 4, SIZE * 4), 0)
        ImageDraw.Draw(mask).ellipse((8, 8, SIZE * 4 - 8, SIZE * 4 - 8), fill=255)
        tile.putalpha(mask.resize((SIZE, SIZE), Image.LANCZOS))
        tile.save(OUT / 'skills' / f'{id_}.webp', quality=88)
        index.append(f'skills/{id_}')

# The hand-drawn poster (tools/art/hand/figures.py) wins over the old Artlist one.
hand_poster = ROOT / 'tools/art/hand/pages/poster.png'
poster = Image.open(hand_poster if hand_poster.exists() else SHEETS / 'poster.jpg').convert('RGB')
poster.save(OUT / 'ui' / 'poster.webp', quality=90)
index.append('ui/poster')

(OUT / 'index.json').write_text(json.dumps(index, indent=0))
print(len(index), 'images')
