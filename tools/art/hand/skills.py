"""Hand-drawn skill icons: one ink symbol on a class-coloured disc (passives sit on a hexagon), 64 x 64 grid.
Written by hand, no image model. Each icon must still read at 48 px: one shape, one action.
Run: python3 tools/art/hand/skills.py && node tools/art/hand/render.cjs && python3 tools/art/cut.py"""
import json
from pathlib import Path

K = '#1d1a22'  # ink
PAPER = '#f3ead7'
WHITE = '#fffaf0'
# Class colours from the shared palette (paper-friendly versions of CLASS_INK in src/icons.ts).
CLS = {'rogue': '#9b7fd1', 'mage': '#4fb3bf', 'fighter': '#f2b33d', 'scout': '#7ab86a'}
ROSE, RED, AMBER, TEAL, STEEL, LEAF, NIGHT, BRASS, ORANGE = '#e2475c', '#b8283c', '#f2b33d', '#4fb3bf', '#a7b0b8', '#5e9e4f', '#3a3550', '#c99a3b', '#ff7a1a'


def ink(d, fill='none', w=2.4, extra=''):
    """Main contour: heavy ink."""
    return f'<path d="{d}" fill="{fill}" stroke="{K}" stroke-width="{w}" stroke-linecap="round" stroke-linejoin="round" {extra}/>'


def fine(d, w=1.0, c=K, o=1, extra=''):
    """Inner detail: a thin pen line, so the outline carries the weight (Moebius, not sticker)."""
    return f'<path d="{d}" fill="none" stroke="{c}" stroke-width="{w}" stroke-linecap="round" stroke-linejoin="round" opacity="{o}" {extra}/>'


def hatch(d):
    return f'<path d="{d}" fill="url(#hatch)" stroke="none"/>'


def dot(x, y, r, fill=K, w=0):
    s = f' stroke="{K}" stroke-width="{w}"' if w else ''
    return f'<circle cx="{x}" cy="{y}" r="{r}" fill="{fill}"{s}/>'


S = {}  # id -> (class, passive, body)

# ---- Rogue ---------------------------------------------------------------------------------------
S['invis'] = ('rogue', False,  # Nobody: a figure that is only a dashed outline.
    ink('M32 13 a7 7 0 1 0 0.01 0', 'none', 2.4, 'stroke-dasharray="4 3.5"') +
    ink('M17 50 C17 36 24 30 32 30 C40 30 47 36 47 50', 'none', 2.4, 'stroke-dasharray="4 3.5"') +
    fine('M24 48 h3 M37 48 h3', 1.2, K, .5))
S['evasion'] = ('rogue', False,  # Bend with the Wind: a reed bowing under three gusts.
    ink('M26 52 C26 40 30 28 44 18', 'none', 3) + ink('M44 18 C38 18 34 22 33 27 C38 26 42 23 44 18 Z', LEAF, 1.8) +
    fine('M12 24 C18 22 22 26 28 24 M10 32 C16 30 22 34 30 32 M14 40 C18 38 22 42 26 40', 1.6) + ink('M20 52 h14', 'none', 2))
S['decoy'] = ('rogue', False,  # My Twin Lies: two hooded heads, the right one only hatched.
    ink('M12 48 C12 30 18 20 25 20 C32 20 36 30 36 48 Z', NIGHT) + ink('M19 36 C19 30 22 28 25 28 C28 28 31 30 31 36 Z', PAPER, 1.6) +
    ink('M30 48 C30 30 36 20 43 20 C50 20 54 30 54 48 Z', 'none', 2, 'stroke-dasharray="3.5 2.5"') + hatch('M30 48 C30 30 36 20 43 20 C50 20 54 30 54 48 Z') +
    fine('M21 32 h2 M27 32 h2', 1.4))
S['poison'] = ('rogue', False,  # Sweet Ending: a dagger tip dripping a green drop.
    ink('M14 14 L38 38 L34 42 L10 18 Z', STEEL) + fine('M14 16 L36 38', 1, WHITE) + ink('M36 44 L44 36 M40 40 L48 48', 'none', 3) +
    ink('M42 18 C46 24 48 27 48 30 A6 6 0 0 1 36 30 C36 27 38 24 42 18 Z', LEAF, 2) + fine('M40 30 a2.5 2.5 0 0 0 2.5 2.5', 1.2, WHITE))
S['sprint'] = ('rogue', False,  # The Last Train: a tram front with its lamp lit, speed lines behind.
    ink('M22 14 H46 C50 14 52 18 52 22 V44 H16 V22 C16 18 18 14 22 14 Z', ROSE) + ink('M20 20 H48 V30 H20 Z', PAPER, 1.6) +
    dot(34, 38, 3.4, AMBER, 1.6) + ink('M20 44 L16 52 M48 44 L52 52', 'none', 2) + fine('M34 20 V30', 1) + fine('M4 24 h8 M2 32 h10 M4 40 h8', 1.6))
S['kidney'] = ('rogue', False,  # Short of Breath: a bowed head with stars circling it.
    ink('M20 54 C20 44 25 38 32 38 C39 38 44 44 44 54', PAPER) + f'<circle cx="32" cy="29" r="7" fill="{PAPER}" stroke="{K}" stroke-width="2.4"/>' +
    fine('M29 28 l2 2 M31 28 l-2 2 M33 28 l2 2 M35 28 l-2 2', 1.1) +
    ink('M12 22 C16 14 48 14 52 22', 'none', 1.4, 'stroke-dasharray="2 3"') +
    ''.join(ink(f'M{x} {y - 4} L{x + 1.2} {y - 1.2} L{x + 4} {y} L{x + 1.2} {y + 1.2} L{x} {y + 4} L{x - 1.2} {y + 1.2} L{x - 4} {y} L{x - 1.2} {y - 1.2} Z', AMBER, 1.3) for x, y in ((14, 21), (32, 13), (50, 21))))
S['execute'] = ('rogue', False,  # Last Word: a crosshair closing on a cracked heart.
    ink('M32 46 L20 34 C15 29 18 21 24 21 C28 21 30 23 32 26 C34 23 36 21 40 21 C46 21 49 29 44 34 Z', RED) +
    ink('M32 26 L29 32 L34 35 L31 42', 'none', 1.8) + fine('M32 8 V16 M32 48 V56 M8 32 H14 M50 32 H56', 2.2) + fine('M32 10 A22 22 0 1 1 31.99 10', 1.2, K, .7))
S['wink'] = ('rogue', False,  # A Wink: one open eye, one shut with lashes.
    ink('M8 30 C12 22 22 22 26 30 C22 38 12 38 8 30 Z', PAPER) + dot(17, 30, 3.6) + dot(18.2, 28.8, 1, WHITE) +
    ink('M38 31 C42 36 52 36 56 31', 'none', 2.6) + fine('M41 34 l-2 4 M47 35.5 v4.5 M53 34 l2 4', 1.6) + fine('M38 22 C42 20 50 20 54 23', 1.6))
S['detonate'] = ('rogue', False,  # Farewell Letter: an envelope with a lit fuse.
    ink('M10 24 H48 V50 H10 Z', PAPER) + ink('M10 24 L29 38 L48 24', 'none', 2) + ink('M10 50 L24 36 M48 50 L34 36', 'none', 1.4) +
    ink('M48 24 C52 18 50 14 54 10', 'none', 1.8) + fine('M54 10 l4 -3 M55 12 l5 0 M53 8 l0 -4', 1.6, ORANGE) + dot(54.5, 9.5, 2, AMBER, 1))
S['insane'] = ('rogue', False,  # When Mirrors Riot: a hand mirror cracked through.
    ink('M32 10 C42 10 48 18 48 28 C48 38 42 44 32 44 C22 44 16 38 16 28 C16 18 22 10 32 10 Z', '#bfe3e6') +
    ink('M28 44 H36 L35 56 H29 Z', NIGHT, 2) + ink('M32 12 L30 22 L36 28 L28 36 L32 44', 'none', 1.8) + fine('M30 22 L20 20 M36 28 L46 26 M28 36 L18 38', 1.2) +
    fine('M22 16 c2 -2 4 -2 6 -2', 1.4, WHITE))
S['rogue_p1'] = ('rogue', True,  # A Chill Down the Spine: a dagger at a stack of vertebrae.
    ''.join(ink(f'M26 {y} H38 L40 {y + 3} L38 {y + 6} H26 L24 {y + 3} Z', PAPER, 1.8) for y in (12, 21, 30, 39)) +
    ink('M54 14 L42 30 L40 28 L52 12 Z', STEEL, 1.8) + ink('M44 31 L40 27 M42 29 L36 35', 'none', 2.6) + fine('M14 18 l-4 -2 M12 26 h-5 M14 34 l-4 2', 1.4, TEAL))
S['rogue_p2'] = ('rogue', True,  # Leaves No Footprints: one print, the next only a ghost.
    ink('M18 50 C14 44 14 34 20 32 C26 32 28 42 26 48 C25 52 20 53 18 50 Z', NIGHT) + dot(16, 28, 2, NIGHT, 1.2) + dot(21, 26, 2, NIGHT, 1.2) + dot(26, 28, 1.8, NIGHT, 1.2) +
    ink('M40 36 C36 30 36 20 42 18 C48 18 50 28 48 34 C47 38 42 39 40 36 Z', 'none', 1.6, 'stroke-dasharray="3 3"') + fine('M38 14 h0.1 M43 12 h0.1 M48 14 h0.1', 3, K, .4))

# ---- Mage ------------------------------------------------------------------------------------------
S['sonic'] = ('mage', False,  # The Name of Thunder: a cone of sound rings.
    ink('M12 32 L22 26 V38 Z', NIGHT, 2) + ''.join(fine(f'M{x} {32 - h} C{x + 4} {32 - h / 2} {x + 4} {32 + h / 2} {x} {32 + h}', 2.6 - i * .4) for i, (x, h) in enumerate(((28, 8), (36, 13), (44, 18)))) +
    fine('M50 10 l4 -4 M54 54 l4 4', 1.4))
S['bombs'] = ('mage', False,  # Little Martyrs: a tiny round robot running with a fuse.
    ink('M32 20 a13 13 0 1 0 0.01 0', STEEL) + dot(27, 31, 2.4) + dot(37, 31, 2.4) + fine('M26 38 h12', 1.4) +
    ink('M24 44 L18 54 M40 44 L46 54', 'none', 2.4) + ink('M32 20 C32 14 36 10 40 10', 'none', 1.8) + dot(41, 9, 2.4, AMBER, 1.2) + fine('M44 6 l3 -2 M45 10 h4', 1.4, ORANGE) +
    hatch('M19 33 a13 13 0 0 0 26 0 Z'))
S['fog'] = ('mage', False,  # Forgetful Fog: soft bands of mist hiding a dim eye.
    ink('M10 22 C16 18 22 26 30 22 C38 18 44 26 54 22', 'none', 2.4) + ink('M8 32 C14 28 22 36 32 32 C42 28 48 36 56 32', 'none', 2.4) +
    ink('M12 42 C18 38 24 46 32 42 C40 38 46 46 52 42', 'none', 2.4) + fine('M28 32 c2 -3 6 -3 8 0', 1.2, K, .6))
S['sunray'] = ('mage', False,  # Noon Prayer: a small sun pouring one beam down.
    ink('M32 10 a8 8 0 1 0 0.01 0', AMBER) + fine('M32 4 V7 M22 10 l2 2 M42 10 l-2 2 M20 18 h3 M41 18 h3', 1.6) +
    ink('M28 26 L36 26 L46 54 L18 54 Z', '#ffe08a', 2) + fine('M30 30 L24 52 M34 30 L40 52', 1, ORANGE))
S['nanobots'] = ('mage', False,  # Whispering Rust: a spiral swarm of dots.
    ''.join(dot(32 + r * __import__('math').cos(a), 32 + r * __import__('math').sin(a), 1.2 + r / 12, K if i % 3 else BRASS, .8 if i % 3 == 0 else 0)
            for i, (r, a) in enumerate((2 + i * 1.2, i * .62) for i in range(18))))
S['blink'] = ('mage', False,  # Change of Address: from one mark to another along a dotted hop.
    ink('M10 46 a5 2.4 0 1 0 0.01 0', 'none', 2) + ink('M44 46 a5 2.4 0 1 0 0.01 0', TEAL, 2) +
    ink('M15 42 C18 18 40 14 46 36', 'none', 2.2, 'stroke-dasharray="1 5"') + ink('M41 32 L46 38 L50 31', 'none', 2.4))
S['armor'] = ('mage', False,  # Silver Shell: a dome of hex plates over the ground.
    ink('M10 46 C10 26 20 14 32 14 C44 14 54 26 54 46 Z', '#dfe6ea') + fine('M20 26 l6 -4 l6 4 v7 l-6 4 l-6 -4 Z M32 26 l6 -4 l6 4 v7 l-6 4 l-6 -4 Z M26 37 l6 -4 l6 4 v7', 1.1) +
    ink('M6 46 H58', 'none', 2.4) + fine('M18 22 C20 18 24 16 28 16', 1.6, WHITE))
S['arms'] = ('mage', False,  # Borrowed Hands: one robotic hand, fingers open.
    ink('M22 56 V38 L18 26 M22 38 H40 V56', STEEL) +
    ''.join(ink(f'M{x} 38 V{t}', 'none', 3.6) + dot(x, t, 1.6, WHITE, 1) for x, t in ((24, 20), (30, 15), (36, 17))) + ink('M40 38 L46 30', 'none', 3.6) +
    fine('M22 46 H40 M28 46 V56 M34 46 V56', 1))
S['gravity'] = ('mage', False,  # Where the Apple Falls: an apple with its fall drawn below.
    ink('M32 20 C22 14 12 22 16 34 C18 42 26 46 32 42 C38 46 46 42 48 34 C52 22 42 14 32 20 Z', ROSE) + ink('M32 20 C32 14 34 10 36 8', 'none', 2) +
    ink('M34 14 C38 10 44 12 44 12 C42 16 38 16 34 14 Z', LEAF, 1.4) + fine('M22 26 c1 -3 3 -4 5 -4', 1.4, WHITE) + fine('M32 48 V58 M28 54 L32 58 L36 54', 2))
S['mines'] = ('mage', False,  # Patient Lights: a flat mine with one waiting light.
    ink('M12 42 C12 36 20 32 32 32 C44 32 52 36 52 42 C52 46 44 48 32 48 C20 48 12 46 12 42 Z', STEEL) + ink('M28 32 V28 H36 V32', NIGHT, 1.8) +
    dot(32, 25, 3, '#e2475c', 1.4) + fine('M32 16 V12 M24 18 l-3 -3 M40 18 l3 -3', 1.6, ROSE) + hatch('M12 42 C12 46 20 48 32 48 V42 Z'))
S['mage_p1'] = ('mage', True,  # Premonition: an open eye behind a small shield.
    ink('M8 26 C16 14 48 14 56 26 C48 38 16 38 8 26 Z', PAPER) + dot(32, 26, 6, TEAL, 2) + dot(32, 26, 2.4) +
    ink('M24 40 H40 V46 C40 52 32 56 32 56 C32 56 24 52 24 46 Z', STEEL, 2))
S['mage_p2'] = ('mage', True,  # Stars in the Pocket: three nano orbs over an open pocket.
    ink('M16 36 H48 V52 C40 56 24 56 16 52 Z', NIGHT) + fine('M16 40 H48', 1, PAPER, .7) +
    dot(22, 24, 5, '#bfe3e6', 2) + dot(34, 16, 5, '#bfe3e6', 2) + dot(44, 28, 5, '#bfe3e6', 2) + fine('M20 22 l2 -1 M32 14 l2 -1 M42 26 l2 -1', 1.2, WHITE))

# ---- Fighter -------------------------------------------------------------------------------------------
BLADE = '#ffd27a'
S['second'] = ('fighter', False,  # Sister Blade: two light blades side by side, not crossed.
    ''.join(ink(f'M{x} 8 L{x + 4} 12 V38 H{x - 4} V12 Z', BLADE, 2) + fine(f'M{x} 12 V36', 1.2, WHITE) + ink(f'M{x - 7} 38 H{x + 7}', 'none', 3) +
            ink(f'M{x - 2} 40 H{x + 2} V54 H{x - 2} Z', '#8a5a3c', 1.8) for x in (24, 40)))
S['rain'] = ('fighter', False,  # Iron Monsoon: spears falling from a cloud line.
    ink('M8 16 C12 10 20 12 22 14 C26 8 36 8 40 14 C44 10 54 12 56 18', 'none', 2.2) +
    ''.join(ink(f'M{x} {y} L{x + 6} {y + 26}', 'none', 2) + ink(f'M{x + 6} {y + 26} l-3.6 -5 l5.6 -1.4 Z', STEEL, 1.6) for x, y in ((14, 22), (28, 20), (42, 22))))
S['eshield'] = ('fighter', False,  # A Closed Door: an arched door, barred.
    ink('M16 56 V26 C16 16 24 10 32 10 C40 10 48 16 48 26 V56 Z', '#8a5a3c') + fine('M24 56 V22 M32 56 V12 M40 56 V22', 1.1) +
    ink('M12 36 H52 V42 H12 Z', STEEL, 2) + dot(42, 48, 1.6, BRASS, 1) + fine('M8 26 l-3 -2 M56 26 l3 -2 M8 50 l-3 2 M56 50 l3 2', 1.6, AMBER))
S['chain'] = ('fighter', False,  # Bring Them Home: a spearhead trailing chain links back.
    ink('M44 12 L56 8 L52 20 Z', STEEL) + ''.join(ink(f'M{x - 4} {y} a4 2.6 -40 1 0 8 0 a4 2.6 -40 1 0 -8 0', 'none', 1.8) for x, y in ((44, 22), (37, 29), (30, 36), (23, 43))) +
    ink('M12 52 C14 48 18 46 20 48', 'none', 2.2))
S['pierce'] = ('fighter', False,  # The Nail: a spear driven through into a plank.
    ink('M38 10 H54 V56 H38 Z', '#8a5a3c', 2) + fine('M42 16 C44 24 42 34 44 50 M50 14 C48 26 50 40 48 54', 1) +
    ink('M6 32 H40', 'none', 3.4) + ink('M40 28 L48 32 L40 36 Z', STEEL, 1.8) + fine('M10 26 l-4 -2 M10 38 l-4 2', 1.4) + ink('M6 28 L12 32 L6 36', 'none', 1.8))
S['charge'] = ('fighter', False,  # The Bull's Oath: a bull's head, horns lowered.
    ink('M22 22 C22 34 26 50 32 52 C38 50 42 34 42 22 C38 18 26 18 22 22 Z', '#8a5a3c') + ink('M22 22 C14 22 8 16 8 8 C12 14 18 16 24 16', PAPER, 2) +
    ink('M42 22 C50 22 56 16 56 8 C52 14 46 16 40 16', PAPER, 2) + dot(27, 30, 1.8) + dot(37, 30, 1.8) + ink('M28 46 a4 3 0 1 0 8 0', PAPER, 1.6) + fine('M30 42 v1 M34 42 v1', 1.6))
S['leap'] = ('fighter', False,  # Man on the Roof: a high arc landing on a roof peak.
    ink('M8 52 L22 40 L36 52', '#8a5a3c', 2) + ink('M30 52 L44 36 L58 52', '#8a5a3c', 2) + ink('M14 36 C16 10 40 6 44 28', 'none', 2.2, 'stroke-dasharray="4 3"') +
    ink('M40 24 L44 31 L49 25', 'none', 2.6) + fine('M38 36 l-3 -2 M50 36 l3 -2', 1.4, AMBER))
S['whirl'] = ('fighter', False,  # The Whirling Saint: a spiral that ends in a blade.
    ink('M32 32 C32 28 38 28 38 32 C38 38 28 40 26 32 C24 22 40 20 44 30 C48 42 30 50 20 42 C12 34 16 18 28 14', 'none', 2.4) +
    ink('M28 14 L44 8 L42 12 L30 18 Z', BLADE, 1.8) + fine('M10 50 l-3 3 M54 50 l3 3', 1.4))
S['overpower'] = ('fighter', False,  # Once More, Harder: a raised fist with a strike burst.
    ink('M22 30 C22 24 26 22 30 24 C30 20 36 20 37 24 C38 20 44 21 44 26 V40 C44 48 38 54 32 54 C26 54 22 48 22 42 Z', PAPER) +
    fine('M30 24 V32 M37 24 V32 M22 34 C26 32 30 34 30 34', 1.2) + fine('M14 14 l4 4 M32 6 v6 M50 14 l-4 4 M10 28 h5 M54 28 h-5', 2, RED))
S['recall'] = ('fighter', False,  # Spears, Come Home: three spears turning back to one point.
    dot(32, 32, 5, AMBER, 2) + ''.join(ink(f'M{x1} {y1} L{x2} {y2}', 'none', 2) + ink(f'M{x2} {y2} l{ax} {ay} l{bx} {by} Z', STEEL, 1.6)
                                        for x1, y1, x2, y2, ax, ay, bx, by in ((8, 10, 24, 24, -1, -6, -4, 4), (56, 10, 40, 24, 1, -6, 4, 4), (32, 58, 32, 41, -4, 5, 8, 0))))
S['fighter_p1'] = ('fighter', True,  # An Old Vow: a round shield with a ring of oath marks.
    ink('M32 10 a20 20 0 1 0 0.01 0', STEEL) + ink('M32 18 a12 12 0 1 0 0.01 0', '#8a5a3c', 2) + dot(32, 30, 4, AMBER, 1.6) +
    fine('M32 12 v3 M32 47 v3 M14 30 h3 M47 30 h3 M19 17 l2 2 M45 17 l-2 2 M19 43 l2 -2 M45 43 l-2 -2', 1.4))
S['fighter_p2'] = ('fighter', True,  # Blood Debt: a drop that comes back as a heart.
    ink('M24 10 C30 18 34 22 34 28 A10 10 0 0 1 14 28 C14 22 18 18 24 10 Z', RED) + fine('M18 28 a5 5 0 0 0 4 5', 1.4, WHITE) +
    ink('M42 54 L32 44 C28 40 30 34 35 34 C38 34 40 36 42 38 C44 36 46 34 49 34 C54 34 56 40 52 44 Z', ROSE, 2) + fine('M30 40 C24 44 24 50 30 52', 1.4, K, .7, 'stroke-dasharray="2 2"'))

# ---- Scout ---------------------------------------------------------------------------------------------
S['shotgun'] = ('scout', False,  # Door Knocker: two barrels, seen from the front.
    ink('M10 18 H54 V46 H10 Z', '#6f7a85', 2) + ink('M22 32 a8 8 0 1 0 0.01 0', K) + ink('M42 32 a8 8 0 1 0 0.01 0', K) +
    fine('M22 26 a6 6 0 0 1 4 2 M42 26 a6 6 0 0 1 4 2', 1.2, WHITE) + fine('M32 18 V46', 1) + hatch('M10 18 H16 V46 H10 Z'))
S['hook'] = ('scout', False,  # Hold on to the Clouds: a three-pronged grappling hook on a rope.
    ink('M32 8 V40', 'none', 3) + ink('M20 30 C18 40 22 48 32 48 C42 48 46 40 44 30', 'none', 3) + ink('M32 40 V52', 'none', 3) +
    ink('M17 30 l3 -5 l3 5', 'none', 2) + ink('M41 30 l3 -5 l3 5', 'none', 2) + ink('M29 52 l3 5 l3 -5', 'none', 2) +
    dot(32, 8, 3, STEEL, 1.6) + fine('M32 8 C26 4 20 8 14 4', 1.4, '#8a5a3c'))
S['fast'] = ('scout', False,  # Hold Your Breath: one bullet glowing in the scope.
    fine('M32 8 A24 24 0 1 1 31.99 8', 1.4) + fine('M32 6 V16 M32 48 V58 M6 32 H16 M48 32 H58', 1.8) +
    ink('M24 38 L38 24 C42 20 48 20 48 20 C48 20 48 26 44 30 L30 44 Z', BRASS, 2) + ink('M24 38 L30 44 L26 48 L20 42 Z', '#8a5a3c', 1.8) + fine('M40 26 l3 3', 1.2, WHITE))
S['smoke'] = ('scout', False,  # Incense: a little bomb breathing smoke curls.
    ink('M32 40 a10 10 0 1 0 0.01 0', NIGHT) + ink('M29 40 V36 H35 V40', STEEL, 1.6) + fine('M28 46 c0 -2 2 -3 4 -3', 1.4, WHITE) +
    ink('M32 36 C26 30 34 26 28 20 C24 16 28 10 34 10', 'none', 2) + ink('M38 34 C44 30 40 24 46 20', 'none', 1.6) + ink('M26 34 C20 30 22 24 16 22', 'none', 1.6))
S['pack'] = ('scout', False,  # Night Shift: two wolves under the moon.
    ink('M46 8 A9 9 0 1 0 54 20 A7 7 0 1 1 46 8 Z', PAPER, 1.6) +
    ''.join(ink(f'M{x} {y + 18} L{x - 7} {y + 6} L{x - 8} {y - 4} L{x - 3} {y + 1} H{x + 3} L{x + 8} {y - 4} L{x + 7} {y + 6} Z', '#6f7a85', 2) + dot(x - 3, y + 7, 1.2, AMBER) + dot(x + 3, y + 7, 1.2, AMBER)
            for x, y in ((20, 32), (38, 30))))
S['hunt'] = ('scout', False,  # Take the Scent: a paw print inside a target ring.
    fine('M32 10 A22 22 0 1 1 31.99 10', 2.2, ROSE) + ink('M32 46 C24 46 22 40 26 36 C28 34 30 32 32 32 C34 32 36 34 38 36 C42 40 40 46 32 46 Z', NIGHT) +
    ''.join(dot(x, y, 3.2, NIGHT, 1.6) for x, y in ((22, 28), (28, 22), (36, 22), (42, 28))))
S['pounce'] = ('scout', False,  # Hello from Above: claws coming down from the top.
    ink('M32 6 V18 M26 12 L32 18 L38 12', 'none', 2) +
    ''.join(ink(f'M{x} 24 C{x + 2} 34 {x + 1} 44 {x - 4} 54', 'none', 3.2) for x in (20, 30, 40)) + ink('M14 24 H46', 'none', 4.4) + fine('M14 24 H46', 1.6, '#8a5a3c'))
S['rend'] = ('scout', False,  # Paper Cut: three clean claw slashes.
    ''.join(ink(f'M{x} 10 C{x + 6} 22 {x + 8} 38 {x + 4} 54 C{x + 4} 38 {x + 2} 22 {x} 10 Z', RED, 1.8) for x in (14, 26, 38)) + fine('M8 44 l-3 3 M54 18 l3 -3', 1.4))
S['drone'] = ('scout', False,  # Witness in the Sky: a small drone with one eye.
    ink('M20 28 H44 C46 28 48 30 48 34 C48 40 42 44 32 44 C22 44 16 40 16 34 C16 30 18 28 20 28 Z', '#6f7a85') + dot(32, 36, 4.6, PAPER, 1.6) + dot(32, 36, 2) +
    ink('M18 28 V22 M46 28 V22', 'none', 2) + ink('M8 20 H28 M36 20 H56', 'none', 2.4) + fine('M24 50 l-2 4 M40 50 l2 4 M32 50 v5', 1.4, K, .6))
S['trap'] = ('scout', False,  # The Doorstep: open trap jaws on the ground.
    ink('M8 44 H56', 'none', 2.4) + ink('M12 44 C12 30 20 22 32 22 C44 22 52 30 52 44', STEEL, 2) +
    ink('M16 44 L18 36 L22 42 L26 34 L30 42 L34 34 L38 42 L42 34 L46 42 L48 36', 'none', 1.6) + dot(32, 48, 3, BRASS, 1.4) + hatch('M12 44 C12 34 16 28 22 25 L24 44 Z'))
S['scout_p1'] = ('scout', True,  # Faithful Shadow: a wolf head with its shadow behind it.
    ink('M36 54 L24 38 L22 20 L30 28 H42 L50 20 L48 38 Z', NIGHT, 0, 'transform="translate(4 2)" opacity=".35"') +
    ink('M32 52 L20 36 L18 14 L28 24 H36 L46 14 L44 36 Z', '#6f7a85') + dot(27, 32, 1.8, AMBER, 1) + dot(37, 32, 1.8, AMBER, 1) +
    ink('M29 44 L32 48 L35 44 Z', K, 1.2) + fine('M22 18 L26 24 M42 18 L38 24', 1))
S['scout_p2'] = ('scout', True,  # Bird's-Eye: a bird gliding, looking down at the ground.
    ink('M8 22 C18 14 26 18 32 24 C38 18 46 14 56 22 C48 22 40 26 36 30 L32 34 L28 30 C24 26 16 22 8 22 Z', PAPER) + dot(32, 27, 1.2) +
    fine('M32 38 V48 M28 44 L32 48 L36 44', 2) + ink('M14 54 H50', 'none', 2.2) + fine('M22 54 v-3 M42 54 v-3', 1.4))

DEFS = '''<defs>
<pattern id="hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(40)"><line x1="0" y1="0" x2="0" y2="4" stroke="#1d1a22" stroke-width=".9" opacity=".45"/></pattern>
<filter id="hand" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency=".05" numOctaves="2" seed="SEED"/><feDisplacementMap in="SourceGraphic" scale="1.2"/></filter>
<filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".8" numOctaves="2" seed="SEED" result="n"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .14 0"/><feComposite in2="SourceGraphic" operator="in"/></filter>
</defs>'''


def plate(color, passive):
    """The seal under the symbol: a disc for skills, a hexagon for passives. Thick outer ink, thin paper rim inside."""
    if passive:
        d = 'M32 2 L58 17 V47 L32 62 L6 47 V17 Z'
        rim = 'M32 6 L54.5 19 V45 L32 58 L9.5 45 V19 Z'
    else:
        d = 'M32 2 A30 30 0 1 0 32.01 2 Z'
        rim = 'M32 6 A26 26 0 1 0 32.01 6 Z'
    return (f'<path d="{d}" fill="{color}" stroke="{K}" stroke-width="2.8" stroke-linejoin="round"/>'
            f'<path d="{d}" fill="{K}" filter="url(#grain)"/>'
            f'<path d="{rim}" fill="none" stroke="{PAPER}" stroke-width="1.2" stroke-opacity=".7"/>')


out = {}
svg_dir = Path(__file__).parent / 'svg-skills'
svg_dir.mkdir(exist_ok=True)
for n, (k, (cls, passive, body)) in enumerate(S.items()):
    out[k] = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">{DEFS.replace("SEED", str(n + 7))}'
              f'{plate(CLS[cls], passive)}<g filter="url(#hand)"><g transform="translate(32 32) scale(.8) translate(-32 -32)">{body}</g></g></svg>')
    (svg_dir / f'{k}.svg').write_text(out[k])
(Path(__file__).parent / 'skills.json').write_text(json.dumps(out))
print(len(out), 'skill icons')
