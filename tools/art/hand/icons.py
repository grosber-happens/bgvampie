"""Hand-drawn item icons: flat colour, ink outline, hatching, on a 64 x 64 grid.
Every drawing here is written by hand (no image model). `render.cjs` turns them into
public/art/items/<id>.webp. Run: python3 tools/art/hand/icons.py && node tools/art/hand/render.cjs && python3 tools/art/cut.py"""
import json
from pathlib import Path

K = '#1d1a22'  # ink
C = {
    'paper': '#f3ead7', 'cloth': '#e6dcc4', 'cloth2': '#c9bfa6', 'amber': '#f2b33d', 'brass': '#c99a3b', 'teal': '#4fb3bf',
    'teal2': '#2f7f88', 'rose': '#e2475c', 'red': '#b8283c', 'lilac': '#9b7fd1', 'leaf': '#7ab86a', 'steel': '#a7b0b8',
    'steel2': '#6f7a85', 'iron': '#555c66', 'leather': '#8a5a3c', 'leather2': '#5e3b27', 'coat': '#c8a36a', 'night': '#3a3550',
    'glass': '#bfe3e6', 'orange': '#ff7a1a', 'white': '#fffaf0',
}

def ink(d, fill='none', w=2.2, extra=''):
    return f'<path d="{d}" fill="{fill}" stroke="{K}" stroke-width="{w}" stroke-linecap="round" stroke-linejoin="round" {extra}/>'

def hatch(d):
    """Shade an area with diagonal hatching (clipped to the shape)."""
    return f'<path d="{d}" fill="url(#hatch)" stroke="none"/>'

def line(d, w=1.1, c=K, o=1):
    return f'<path d="{d}" fill="none" stroke="{c}" stroke-width="{w}" stroke-linecap="round" stroke-linejoin="round" opacity="{o}"/>'

def wash(color, cx=32, cy=34, r=24):
    return f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{color}" opacity="0.28" filter="url(#bleed)"/>'

I = {}

# ---- Light armor -------------------------------------------------------------------------
I['l_head'] = wash(C['teal']) + ink('M14 50 C12 34 18 14 32 12 C46 14 52 34 50 50 C44 54 20 54 14 50 Z', C['cloth']) + \
    ink('M21 47 C20 36 25 26 32 26 C39 26 44 36 43 47 Z', C['night']) + hatch('M21 47 C20 36 25 26 32 26 C39 26 44 36 43 47 Z') + \
    line('M32 12 C30 22 27 30 26 38', 1.2, K, .5) + line('M38 15 C40 22 44 30 46 42', 1.2, K, .5) + \
    line('M10 22 l-2 6 M14 16 l-2 5 M54 20 l2 6 M50 13 l2 5', 1.6, C['teal2'])
I['l_chest'] = wash(C['lilac']) + ink('M20 12 L32 18 L44 12 L54 20 L50 30 L46 28 L46 54 L18 54 L18 28 L14 30 L10 20 Z', C['white']) + \
    ink('M32 18 V54') + line('M26 16 L30 26 M38 16 L34 26', 1.6) + \
    line('M22 32 c2 1 3 -1 5 0 M22 40 c2 1 3 -1 5 0 M37 32 c2 1 3 -1 5 0 M37 40 c2 1 3 -1 5 0', 1.2, C['lilac']) + \
    line('M18 46 h28', 1.2, K, .5) + line('M12 24 l-3 -2 M52 24 l3 -2', 1.2, C['lilac'])
I['l_legs'] = wash(C['amber']) + ink('M14 10 H26 V40 C26 44 28 46 30 48 V54 H12 V44 C14 42 14 40 14 38 Z', C['amber']) + \
    ink('M36 10 H48 V40 C48 44 50 46 52 48 V54 H34 V44 C36 42 36 40 36 38 Z', C['amber']) + \
    hatch('M14 10 H18 V40 H14 Z') + hatch('M36 10 H40 V40 H36 Z') + \
    ink('M12 54 h18 M34 54 h18', 'none', 2.6) + \
    '<circle cx="16" cy="51" r="1.6" fill="#e2475c"/><circle cx="22" cy="52" r="1.6" fill="#e2475c"/><circle cx="38" cy="51" r="1.6" fill="#e2475c"/><circle cx="44" cy="52" r="1.6" fill="#e2475c"/>' + \
    line('M28 56 c1 2 3 2 4 0 M50 56 c1 2 3 2 4 0', 1.4)

# ---- Medium armor ------------------------------------------------------------------------
I['m_head'] = wash(C['amber']) + ink('M12 38 C12 22 20 12 32 12 C44 12 52 22 52 38 Z', C['white']) + \
    ink('M16 36 C18 26 24 22 32 22 C40 22 46 26 48 36 C40 40 24 40 16 36 Z', C['amber']) + \
    line('M22 28 c4 -3 8 -3 10 -2', 2, C['white']) + ink('M10 38 H54 L50 44 H14 Z', C['steel']) + \
    ink('M18 44 C18 50 22 52 26 52') + hatch('M12 38 C12 30 14 24 18 20 L20 22 C16 26 15 32 16 36 Z')
I['m_chest'] = wash(C['teal']) + ink('M22 10 L32 16 L42 10 L48 16 V54 H16 V16 Z', C['teal2']) + \
    '<pattern id="knit" width="5" height="5" patternUnits="userSpaceOnUse"><path d="M0 2.5 l2.5 -2 l2.5 2 M0 5 l2.5 -2 l2.5 2" fill="none" stroke="#1d1a22" stroke-width=".7" opacity=".45"/></pattern>' + \
    '<path d="M22 10 L32 16 L42 10 L48 16 V54 H16 V16 Z" fill="url(#knit)"/>' + ink('M32 16 V54') + \
    ''.join(f'<circle cx="35" cy="{y}" r="1.6" fill="{C["brass"]}" stroke="{K}" stroke-width=".8"/>' for y in (24, 32, 40, 48)) + \
    ink('M24 34 h6 v5 h-6 Z', C['teal'], 1.4)
I['m_legs'] = wash(C['leather']) + ink('M12 14 H24 V36 L30 42 V50 H8 V40 L12 36 Z', C['leather']) + \
    ink('M34 14 H46 V36 L54 42 V50 H32 V40 L34 36 Z', C['leather']) + hatch('M12 14 H16 V36 L12 38 Z') + hatch('M34 14 H38 V36 L34 38 Z') + \
    ink('M7 50 H31 V54 H7 Z', C['iron']) + ink('M31 50 H55 V54 H31 Z', C['iron']) + \
    line('M14 20 l6 2 M14 26 l6 2 M36 20 l6 2 M36 26 l6 2', 1.3, C['paper']) + line('M10 56 h2 M16 56 h2 M22 56 h2 M34 56 h2 M40 56 h2 M46 56 h2', 1.6)

# ---- Heavy armor -------------------------------------------------------------------------
I['h_head'] = wash(C['steel2']) + ink('M14 50 C12 34 16 16 32 12 C48 16 52 34 50 50 Z', C['steel']) + \
    ink('M28 8 h8 v6 h-8 Z', C['steel2']) + ink('M22 30 H42 M32 30 V48', 'none', 3.2) + \
    hatch('M14 50 C12 34 16 16 32 12 C24 18 20 34 22 50 Z') + line('M40 16 C46 22 48 30 48 40', 2, C['white'], .8) + \
    ink('M10 50 H54 V54 H10 Z', C['iron'])
I['h_chest'] = wash(C['amber']) + ink('M14 14 C20 10 44 10 50 14 L54 28 L48 54 H16 L10 28 Z', C['steel']) + \
    ink('M8 16 C8 10 14 8 18 12 L16 24 L8 24 Z', C['steel2']) + ink('M56 16 C56 10 50 8 46 12 L48 24 L56 24 Z', C['steel2']) + \
    '<circle cx="32" cy="32" r="7" fill="#f2b33d" stroke="#1d1a22" stroke-width="2"/>' + \
    line('M32 21 v-3 M32 43 v3 M21 32 h-3 M43 32 h3 M24 24 l-2 -2 M40 24 l2 -2 M24 40 l-2 2 M40 40 l2 2', 1.6) + \
    hatch('M14 14 L10 28 L16 54 H22 L20 28 Z') + line('M18 48 H46', 1.2, K, .6)
I['h_legs'] = wash(C['steel2']) + ink('M14 8 H26 V44 L28 50 V54 H12 V48 L14 44 Z', C['steel']) + \
    ink('M38 8 H50 V44 L52 50 V54 H36 V48 L38 44 Z', C['steel']) + \
    ink('M12 22 H28 V30 H12 Z', C['steel2']) + ink('M36 22 H52 V30 H36 Z', C['steel2']) + \
    ink('M20 22 L16 14 M44 22 L48 14', 'none', 2.6) + hatch('M14 8 H18 V44 H14 Z') + hatch('M38 8 H42 V44 H38 Z') + \
    line('M14 38 H26 M38 38 H50', 1.3)

# ---- Necklaces -----------------------------------------------------------------------------
CHAIN = line('M12 8 C14 22 22 30 32 32 C42 30 50 22 52 8', 1.6, K, .8) + line('M12 8 C14 22 22 30 32 32 C42 30 50 22 52 8', 3.4, C['brass'], .35)
I['n_ember'] = wash(C['orange']) + CHAIN + ink('M32 30 A12 12 0 1 0 32.01 30 Z', C['brass']) + ink('M32 34 A8 8 0 1 0 32.01 34 Z', C['night']) + \
    ink('M32 37 C35 41 37 43 37 46 C37 49 35 50 32 50 C29 50 27 49 27 46 C27 43 30 42 32 37 Z', C['orange'], 1.4) + \
    '<path d="M32 42 C33.5 44 34 45 34 46.5 C34 48 33 48.5 32 48.5 C31 48.5 30 48 30 46.5 C30 45 31 44 32 42 Z" fill="#ffe08a"/>'
I['n_clock'] = wash(C['teal']) + CHAIN + ink('M32 30 V26') + ink('M32 32 A13 13 0 1 0 32.01 32 Z', C['brass']) + ink('M32 35 A10 10 0 1 0 32.01 35 Z', C['white']) + \
    line('M32 37 v2 M32 53 v2 M22 45 h2 M40 45 h2', 1.4) + ink('M32 45 L27 41', 'none', 2) + ink('M32 45 L35 51', 'none', 1.6) + \
    line('M40 36 a10 10 0 0 0 -6 -3', 1.4, C['rose']) + ink('M37 32 l-3 1 l2 2', 'none', 1.4)
I['n_halo'] = wash(C['amber']) + line('M14 8 C16 18 22 24 26 26 M50 8 C48 18 42 24 38 26', 1.6) + \
    ink('M12 36 C12 28 22 24 32 24 C42 24 52 28 52 36 C52 44 42 48 32 48 C22 48 12 44 12 36 Z', C['cloth']) + \
    ink('M20 36 C20 32 25 30 32 30 C39 30 44 32 44 36 C44 40 39 42 32 42 C25 42 20 40 20 36 Z', C['paper']) + \
    ink('M44 26 L40 34 L46 38 L42 46', 'none', 2) + hatch('M12 36 C12 44 22 48 32 48 C24 46 18 42 16 36 Z') + \
    line('M8 30 l-3 -2 M56 30 l3 -2 M32 18 v-4', 1.6, C['amber'])
I['n_pulse'] = wash(C['rose']) + CHAIN + ink('M32 54 L18 40 C12 34 15 26 22 26 C26 26 29 28 32 32 C35 28 38 26 42 26 C49 26 52 34 46 40 Z', C['glass']) + \
    '<path d="M32 50 L22 40 C19 37 20 33 24 33 C27 33 30 35 32 38 C34 35 37 33 40 33 C44 33 45 37 42 40 Z" fill="#e2475c" opacity=".85"/>' + \
    line('M20 30 c2 -2 4 -2 6 -1', 1.6, C['white'])

# ---- Rings -------------------------------------------------------------------------------------
def band(color, top=24):
    return ink(f'M32 {top+8} C20 {top+8} 14 {top+14} 14 {top+20} C14 {top+28} 22 {top+32} 32 {top+32} C42 {top+32} 50 {top+28} 50 {top+20} C50 {top+14} 44 {top+8} 32 {top+8} Z M32 {top+13} C24 {top+13} 20 {top+16} 20 {top+20} C20 {top+25} 25 {top+27} 32 {top+27} C39 {top+27} 44 {top+25} 44 {top+20} C44 {top+16} 40 {top+13} 32 {top+13} Z', color, 2, 'fill-rule="evenodd"')
I['r_blood'] = wash(C['red']) + band(C['brass']) + ink('M24 30 L32 14 L40 30 C40 36 24 36 24 30 Z', C['red']) + \
    line('M29 22 l3 -5', 1.6, C['white']) + ink('M32 36 v3', 'none', 1.4)
I['r_flint'] = wash(C['amber']) + band(C['iron']) + ink('M22 30 L28 16 L42 18 L44 30 Z', C['steel2']) + hatch('M22 30 L28 16 L32 18 L30 30 Z') + \
    line('M46 14 l4 -4 M48 20 l6 -1 M42 10 l1 -5', 2, C['orange']) + '<circle cx="50" cy="16" r="1.4" fill="#f2b33d"/>'
I['r_shadow'] = wash(C['lilac']) + '<ellipse cx="40" cy="54" rx="18" ry="4" fill="#3a3550" opacity=".55"/>' + band(C['night']) + \
    ink('M36 18 A9 9 0 1 0 38 33 A7 7 0 1 1 36 18 Z', C['white'], 1.8)
I['r_stitch'] = wash(C['rose']) + ink('M20 54 C20 40 22 22 32 20 C42 22 44 40 44 54 Z', C['brass']) + \
    ''.join(f'<circle cx="{x}" cy="{y}" r="1" fill="{K}" opacity=".6"/>' for x, y in ((27, 30), (32, 28), (37, 30), (26, 38), (31, 36), (36, 38), (41, 38), (25, 46), (30, 44), (35, 46), (40, 46))) + \
    ink('M20 54 H44') + ink('M10 12 C20 10 26 16 30 22', 'none', 1.8) + line('M30 22 C40 14 50 20 52 30 C54 40 48 48 44 50', 1.8, C['red']) + \
    '<circle cx="10" cy="12" r="1.6" fill="none" stroke="#1d1a22" stroke-width="1.4"/>'

# ---- Weapons (drawn from the 3D designs in src/armory/designs.ts, so the icon matches what is in your hand) ----
GLOW_R, GLOW_O, GLOW_B = '#ff5a6e', '#ff9a3c', '#8fe3f0'
# Rogue ranged: Wet Street Pistol: curved grip with a ball pommel, banded silencer, ammo lights.
I['w_rogue_r'] = wash(C['lilac']) + ink('M8 22 H34 V30 H8 Z', C['iron']) + ink('M34 23 H58 V29 H34 Z', C['night']) + \
    line('M40 23 V29 M46 23 V29 M52 23 V29', 1, C['steel']) + ink('M12 30 H26 L24 36 C22 44 20 50 16 54', 'none', 2.4) + \
    ink('M12 30 H26 L24 36 C22 44 20 50 16 54 L10 52 C14 46 16 40 16 34 Z', C['leather']) + '<circle cx="13" cy="54" r="3" fill="#c99a3b" stroke="#1d1a22" stroke-width="1.6"/>' + \
    ink('M24 34 C26 40 30 40 30 34', 'none', 1.4) + ''.join(f'<circle cx="{x}" cy="26" r="1.2" fill="{GLOW_R}"/>' for x in (12, 16, 20, 24, 28)) + hatch('M8 27 H34 V30 H8 Z')
# Rogue melee: Moonshard Daggers: a pair, each a forked emitter holding a jagged red shard.
def shard(x, flip):
    t = f'transform="translate({x} 0) scale({-1 if flip else 1} 1)"'
    return f'<g {t}>' + ink('M-4 60 L-2 46 H4 L6 60 Z', C['leather']) + line('M-3 50 h8 M-3 55 h8', 1, C['brass']) + \
        ink('M-6 46 H8 L6 42 H-4 Z', C['iron'], 1.8) + ink('M-3 42 L-6 30 M5 42 L8 30', 'none', 1.8) + \
        ink('M1 42 L-3 30 L0 22 L-2 12 L3 4 L5 16 L3 24 L6 32 Z', GLOW_R, 1.6) + line('M1 38 L0 26 L2 12', 1, C['white']) + '</g>'
I['w_rogue_m'] = wash(C['rose']) + shard(22, False) + shard(42, True)
# Mage ranged: Light Pen: a pen body with a clip, heat vents and a three-prong cage around a blue crystal.
I['w_mage_r'] = wash(C['teal']) + '<g transform="rotate(-40 32 32)">' + ink('M4 28 H40 V36 H4 Z', C['cloth']) + ink('M4 28 C2 28 2 36 4 36', 'none', 2) + \
    ink('M10 26 H26 V28 H10 Z', C['brass'], 1.4) + line('M30 28 V36 M33 28 V36 M36 28 V36', 1, C['iron']) + ink('M40 29 H44 V35 H40 Z', C['iron'], 1.6) + \
    ink('M44 29 C52 24 56 28 58 32 M44 35 C52 40 56 36 58 32 M44 32 H58', 'none', 1.6) + ink('M48 32 L52 27 L57 32 L52 37 Z', GLOW_B, 1.4) + \
    line('M51 30 l1 -1', 1, C['white']) + hatch('M4 32 H40 V36 H4 Z') + '</g>'
# Mage melee: Lantern Staff: a long staff crowned with a caged lantern and gyroscope rings.
I['w_mage_m'] = wash(C['teal']) + ink('M12 60 L38 26', 'none', 4.4) + line('M12 60 L38 26', 2.2, C['leather']) + line('M20 50 l3 2 M26 42 l3 2', 1.4, C['brass']) + \
    ink('M46 18 m-8 0 a8 8 0 1 0 16 0 a8 8 0 1 0 -16 0', GLOW_B, 2) + ink('M46 10 V26 M38 18 H54', 'none', 1.2) + \
    ink('M46 18 m-13 0 a13 6 30 1 0 26 0 a13 6 30 1 0 -26 0', 'none', 1.6) + line('M46 18 m-6 -11 a6 13 30 1 0 12 22', 1.2, C['rose']) + \
    ink('M36 26 L40 22 L42 28 Z', C['iron'], 1.4) + '<circle cx="46" cy="4" r="2" fill="#555c66" stroke="#1d1a22" stroke-width="1.2"/>'
# Fighter ranged: Lightning Spears: a leather quiver on a strap, spear heads with glowing tips.
I['w_fighter_r'] = wash(C['amber']) + '<g transform="rotate(-30 32 34)">' + \
    ''.join(ink(f'M{x} 22 V6', 'none', 1.8) + ink(f'M{x} 2 l-3 6 h6 Z', C['steel'], 1.4) + f'<circle cx="{x}" cy="1.5" r="1.6" fill="{GLOW_O}"/>' for x in (24, 30, 36, 42)) + \
    ink('M18 20 H48 L46 58 H20 Z', C['leather']) + line('M18 28 H48 M19 48 H47', 1.6, C['white']) + line('M18 24 H48', 1, C['rose']) + hatch('M18 20 H24 L25 58 H20 Z') + '</g>' + \
    line('M12 52 C20 60 40 60 52 50', 1.6, C['cloth2'])
# Fighter melee: Dawn Blade: wrapped hilt, a sunrise-finned emitter and an orange light blade.
I['w_fighter_m'] = wash(C['orange']) + '<g transform="rotate(-45 32 32)">' + ink('M28 40 H36 V58 H28 Z', C['cloth']) + \
    line('M28 44 H36 M28 48 H36 M28 52 H36', 1.2, C['red']) + ink('M29 58 L32 62 L35 58', C['iron'], 1.4) + \
    ink('M24 40 C24 34 28 32 32 32 C36 32 40 34 40 40 Z', C['iron']) + ink('M24 38 L18 32 M40 38 L46 32', 'none', 2) + \
    ink('M29 32 L28 6 L32 0 L36 6 L35 32 Z', GLOW_O, 1.6) + line('M32 30 V6', 1.2, C['white']) + '</g>'
# Scout ranged: Far Eye: sniper rifle, cream stock, long scope with a red cap, muzzle brake.
I['w_scout_r'] = wash(C['leaf']) + '<g transform="translate(32 32) scale(.86) rotate(-20) translate(-32 -32)">' + \
    ink('M2 34 C2 30 6 28 12 28 H22 V38 H12 C8 38 4 40 2 40 Z', C['cloth']) + ink('M22 28 H38 V38 H22 Z', C['iron']) + ink('M38 30 H58 V34 H38 Z', C['steel2'], 1.6) + \
    ink('M58 29 H62 V35 H58 Z', C['iron'], 1.4) + ink('M24 38 L22 46 H27 L29 38', C['cloth'], 1.6) + \
    ink('M20 18 H44 V24 H20 Z', C['night']) + ink('M44 17 H50 V25 H44 Z', C['rose'], 1.6) + line('M26 24 V28 M38 24 V28', 1.6) + \
    line('M40 34 L46 42 M44 34 L50 42', 1.2) + hatch('M22 33 H38 V38 H22 Z') + '</g>'
# Scout melee: Cat Nails: a leather bracer with brass bands and four hooked claws.
I['w_scout_m'] = wash(C['leaf']) + ink('M6 30 C6 22 12 20 18 20 H32 V44 H18 C12 44 6 40 6 30 Z', C['leather']) + \
    line('M14 20 V44 M24 20 V44', 2, C['cloth2']) + ink('M32 22 H38 V42 H32 Z', C['iron'], 1.6) + \
    ''.join(ink(f'M38 {y} C46 {y - 2} 54 {y + 2} 58 {y + 8} L56 {y + 10}', 'none', 2.2) + line(f'M38 {y + 1.2} C46 {y - .8} 52 {y + 3} 56 {y + 8}', 1, '#7ad77a') for y in (22, 28, 34, 40)) + \
    '<circle cx="35" cy="26" r="1.6" fill="#ff7a1a"/>' + hatch('M6 30 C6 38 12 44 18 44 V32 Z')

# ---- Currency and bags ---------------------------------------------------------------------------
I['coin'] = wash(C['amber']) + ink('M32 32 m-20 0 a20 20 0 1 0 40 0 a20 20 0 1 0 -40 0', C['amber']) + \
    line('M32 32 m-16 0 a16 16 0 1 0 32 0 a16 16 0 1 0 -32 0', 1.2) + \
    ink('M22 34 C26 26 36 24 42 30 C38 34 30 38 22 34 Z M42 30 L46 24 M42 30 L47 34', 'none', 1.6) + \
    '<circle cx="38" cy="30" r="1" fill="#1d1a22"/>' + line('M26 33 c2 -1 4 -1 6 0', 1, C['brass']) + hatch('M12 32 a20 20 0 0 0 20 20 V48 a16 16 0 0 1 -16 -16 Z')
I['essence'] = wash(C['rose']) + ink('M26 8 H38 V14 H26 Z', C['leather'], 1.8) + ink('M27 14 H37 V22 C46 26 50 34 48 44 C46 54 38 58 32 58 C26 58 18 54 16 44 C14 34 18 26 27 22 Z', C['glass']) + \
    '<path d="M18 40 C24 36 40 44 46 40 C47 48 42 56 32 56 C22 56 17 48 18 40 Z" fill="#e2475c"/>' + \
    line('M22 32 C21 36 21 40 22 42', 1.6, C['white']) + line('M20 4 c2 2 2 4 0 6 M44 6 c-2 2 -2 4 0 6', 1, C['rose']) + line('M18 40 C24 36 40 44 46 40', 1)
I['token'] = wash(C['teal']) + ink('M32 10 L50 20 V44 L32 54 L14 44 V20 Z', C['brass']) + \
    ink('M32 26 m-5 0 a5 5 0 1 0 10 0 a5 5 0 1 0 -10 0', C['paper'], 1.6) + \
    ink('M22 40 C22 34 26 32 32 32 C38 32 42 34 42 40 C38 44 26 44 22 40 Z', C['leaf'], 1.6) + \
    '<circle cx="27" cy="34" r="2.4" fill="#fffaf0" stroke="#1d1a22" stroke-width="1.2"/><circle cx="37" cy="34" r="2.4" fill="#fffaf0" stroke="#1d1a22" stroke-width="1.2"/>' + \
    line('M28 41 c2 1 6 1 8 0', 1) + hatch('M14 20 L32 10 V14 L18 22 V42 L14 44 Z')
I['satchel'] = wash(C['leather']) + line('M14 26 C14 8 50 8 50 26', 2.4) + ink('M8 26 H56 V54 C56 56 54 58 52 58 H12 C10 58 8 56 8 54 Z', C['leather']) + \
    ink('M8 26 H56 V38 C46 42 18 42 8 38 Z', C['leather2']) + ink('M28 36 H36 V46 H28 Z', C['brass'], 1.6) + \
    line('M12 30 h40 M12 52 h40', 1, C['paper'], .6) + hatch('M8 40 H16 V58 H12 C10 58 8 56 8 54 Z')

# ---- Noir set ------------------------------------------------------------------------------------
I['s_hat'] = wash(C['night']) + ink('M4 40 C14 46 50 46 60 40 C56 37 50 36 46 36 L44 18 C40 12 24 12 20 18 L18 36 C14 36 8 37 4 40 Z', C['night']) + \
    ink('M18 32 H46 V36 H18 Z', C['rose'], 1.6) + line('M26 16 l6 5 l6 -5', 1.6, C['steel']) + \
    line('M10 46 v4 M20 48 v6 M34 48 v5 M46 48 v4 M54 46 v5', 1.4, C['teal'])
I['s_coat'] = wash(C['coat']) + ink('M20 6 L32 16 L44 6 L54 14 L52 58 H12 L10 14 Z', C['coat']) + ink('M32 16 V58') + \
    ink('M20 6 L26 22 L32 16 M44 6 L38 22 L32 16', C['cloth2']) + ink('M12 36 H52 V40 H12 Z', C['leather2'], 1.6) + \
    ink('M38 44 h10 v8 h-10 Z', C['white'], 1.4) + line('M40 46 l3 3 l3 -3', 1.2) + hatch('M10 14 L12 58 H18 L16 20 Z')
I['s_shoes'] = wash(C['teal']) + '<ellipse cx="32" cy="52" rx="26" ry="5" fill="#4fb3bf" opacity=".45"/>' + \
    ink('M6 44 C6 36 14 34 20 34 L24 28 H32 C38 28 42 32 44 42 V48 H6 Z', C['leather2']) + \
    ink('M6 48 H44', 'none', 2.6) + line('M22 34 L28 42 M26 30 L32 38', 1.3, C['paper']) + line('M12 40 c3 -2 6 -2 8 -1', 1.4, C['white'], .7) + \
    line('M48 52 c2 -1 4 -1 6 0 M10 54 c2 -1 4 -1 6 0', 1.2, C['white'])
I['s_ring'] = wash(C['brass']) + band(C['brass'], 26) + \
    ink('M32 8 L36 14 H42 V20 L46 24 L42 28 V34 H36 L32 40 L28 34 H22 V28 L18 24 L22 20 V14 H28 Z', C['amber'], 2) + \
    ink('M32 17 L34 22 H39 L35 25 L37 30 L32 27 L27 30 L29 25 L25 22 H30 Z', C['white'], 1.2)
I['s_locket'] = wash(C['rose']) + line('M14 4 C16 14 24 20 32 20 C40 20 48 14 50 4', 1.6) + \
    ink('M32 20 V22') + ink('M18 22 H46 V58 H18 Z', C['brass']) + ink('M22 26 H42 V50 H22 Z', C['cloth']) + \
    ink('M32 32 A4 4 0 1 0 32.01 32 Z', C['cloth2'], 1.4) + ink('M25 48 C25 40 39 40 39 48', C['cloth2'], 1.4) + \
    '<rect x="22" y="26" width="20" height="24" fill="#f3ead7" opacity=".45"/>' + line('M24 54 h16', 1.2)

# ---- Misc (HUD) ------------------------------------------------------------------------------------
I['bandage'] = wash(C['rose']) + ink('M10 44 C10 30 20 24 30 24 H50 V44 H30 C26 44 22 40 22 36', C['white']) + \
    ink('M30 24 C22 24 16 30 16 36 C16 42 20 44 24 44', 'none', 1.6) + ink('M50 24 V44', 'none', 2) + \
    ink('M36 30 h8 v8 h-8 Z', C['rose'], 1.4) + line('M38 34 h4 M40 32 v4', 1.6, C['white']) + line('M10 44 C10 50 16 54 24 54 H34', 1.6)
I['reel'] = wash(C['night']) + ink('M32 32 m-20 0 a20 20 0 1 0 40 0 a20 20 0 1 0 -40 0', C['steel']) + \
    ''.join(f'<circle cx="{32 + 11 * dx}" cy="{32 + 11 * dy}" r="5" fill="#1d1a22"/>' for dx, dy in ((0, -1), (0.95, -0.31), (0.59, 0.81), (-0.59, 0.81), (-0.95, -0.31))) + \
    '<circle cx="32" cy="32" r="3" fill="#f3ead7" stroke="#1d1a22" stroke-width="1.4"/>' + ink('M50 44 C56 50 58 56 54 60 H40', 'none', 2) + \
    ink('M40 56 H54 V62 H40 Z', C['night'], 1.4)

DEFS = '''<defs>
<pattern id="hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(40)"><line x1="0" y1="0" x2="0" y2="4" stroke="#1d1a22" stroke-width=".9" opacity=".45"/></pattern>
<filter id="bleed" x="-30%" y="-30%" width="160%" height="160%"><feTurbulence type="fractalNoise" baseFrequency=".09" numOctaves="2" seed="3"/><feDisplacementMap in="SourceGraphic" scale="6"/><feGaussianBlur stdDeviation=".6"/></filter>
<filter id="hand" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency=".05" numOctaves="2" seed="SEED"/><feDisplacementMap in="SourceGraphic" scale="1.3"/></filter>
</defs>'''

out = {}
for n, (k, body) in enumerate(I.items()):
    out[k] = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">{DEFS.replace("SEED", str(n + 1))}<g filter="url(#hand)">{body}</g></svg>'
    (Path(__file__).parent / 'svg').mkdir(exist_ok=True)
    (Path(__file__).parent / 'svg' / f'{k}.svg').write_text(out[k])
(Path(__file__).parent / 'icons.json').write_text(json.dumps(out))
print(len(out), 'icons')
