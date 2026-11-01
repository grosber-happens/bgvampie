"""Hand-drawn character art: the three playable species as ink figures, built in code (no image model).
Writes SVG pages to tools/art/hand/pages/: the species scale and hitbox sheet, four class cards,
the hero presets and the title-screen poster. render_pages.cjs turns them into PNG/WebP.
Scale: 1 m = 200 px; every figure stands with its feet at (0, 0), y grows downward.
Run: python3 tools/art/hand/figures.py && node tools/art/hand/render_pages.cjs"""
import math
from pathlib import Path

K = '#1d1a22'
PAPER, PAPER2, WHITE = '#f3ead7', '#e6dcc4', '#fffaf0'
AMBER, TEAL, TEAL2, ROSE, RED, LILAC = '#f2b33d', '#4fb3bf', '#2f7f88', '#e2475c', '#b8283c', '#9b7fd1'
BRASS, IRON, STEEL, STEEL2 = '#c99a3b', '#555c66', '#a7b0b8', '#6f7a85'
LEATHER, LEATHER2, MOSS, MOSS2, BELLY = '#8a5a3c', '#5e3b27', '#7a9a4a', '#56743a', '#e8c86a'
SKIN, SKIN2, BONE, NIGHT, ORANGE, GLASS = '#c98a64', '#a86c4c', '#e9e2cf', '#3a3550', '#ff7a1a', '#bfe3e6'
GLOW_R, GLOW_O, GLOW_B = '#ff5a6e', '#ff9a3c', '#8fe3f0'
M = 200  # px per metre
HIT_R, HIT_H = 0.45, 1.85  # src/core.ts: every unit is a 0.45 m radius, 1.85 m tall cylinder


def ink(d, fill='none', w=3, extra=''):
    return f'<path d="{d}" fill="{fill}" stroke="{K}" stroke-width="{w}" stroke-linecap="round" stroke-linejoin="round" {extra}/>'


def fine(d, w=1.4, c=K, o=1, extra=''):
    return f'<path d="{d}" fill="none" stroke="{c}" stroke-width="{w}" stroke-linecap="round" stroke-linejoin="round" opacity="{o}" {extra}/>'


def hatch(d, o=1):
    return f'<path d="{d}" fill="url(#hatch)" opacity="{o}"/>'


def circ(x, y, r, fill='none', w=3):
    return f'<circle cx="{x}" cy="{y}" r="{r}" fill="{fill}" stroke="{K}" stroke-width="{w}"/>'


def dot(x, y, r, fill=K):
    return f'<circle cx="{x}" cy="{y}" r="{r}" fill="{fill}"/>'


def wash(d, color, o=.5):
    """A watercolour patch: soft colour that bleeds past the ink."""
    return f'<path d="{d}" fill="{color}" opacity="{o}" filter="url(#bleed)"/>'


def mirror(svg):
    return f'<g transform="scale(-1 1)">{svg}</g>'


def g(svg, x=0, y=0, s=1, rot=0, extra=''):
    return f'<g transform="translate({x} {y}) rotate({rot}) scale({s})" {extra}>{svg}</g>'


DEFS = '''<defs>
<pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(40)"><line x1="0" y1="0" x2="0" y2="6" stroke="#1d1a22" stroke-width="1.2" opacity=".5"/></pattern>
<pattern id="hatch2" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(-35)"><line x1="0" y1="0" x2="0" y2="9" stroke="#1d1a22" stroke-width="1" opacity=".35"/></pattern>
<pattern id="lace" width="14" height="14" patternUnits="userSpaceOnUse"><circle cx="7" cy="7" r="3" fill="none" stroke="#1d1a22" stroke-width=".9" opacity=".45"/><circle cx="0" cy="0" r="1.2" fill="#1d1a22" opacity=".35"/><circle cx="14" cy="14" r="1.2" fill="#1d1a22" opacity=".35"/></pattern>
<filter id="bleed" x="-20%" y="-20%" width="140%" height="140%"><feTurbulence type="fractalNoise" baseFrequency=".035" numOctaves="3" seed="4"/><feDisplacementMap in="SourceGraphic" scale="14"/><feGaussianBlur stdDeviation="1.2"/></filter>
<filter id="hand" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency=".03" numOctaves="2" seed="9"/><feDisplacementMap in="SourceGraphic" scale="2.6"/></filter>
<filter id="paper" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="3" seed="2" result="n"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 .1  0 0 0 0 .08  0 0 0 0 .06  0 0 0 .09 0"/><feComposite in2="SourceGraphic" operator="in"/></filter>
</defs>'''


# ---- Weapons in hand (figure scale) -------------------------------------------------------------
def w_pistol():
    return ink('M0 -6 H34 V4 H0 Z', IRON, 2.4) + ink('M34 -5 H58 V3 H34 Z', NIGHT, 2.4) + ink('M2 4 H14 L10 26 H0 Z', LEATHER, 2.4) + \
        ''.join(dot(x, -1, 1.6, GLOW_R) for x in (6, 12, 18, 24))


def w_dagger():
    return ink('M-3 0 H5 V18 H-3 Z', LEATHER, 2.2) + ink('M-8 -2 H10 V2 H-8 Z', IRON, 2) + \
        ink('M1 -2 L-3 -16 L1 -26 L-1 -40 L4 -52 L6 -36 L4 -24 L7 -12 Z', GLOW_R, 2) + fine('M1 -6 L1 -24 L3 -44', 1.2, WHITE)


def w_staff(h=330):
    return ink(f'M0 0 V{-h}', 'none', 7) + fine(f'M0 0 V{-h}', 3.6, LEATHER) + fine(f'M-4 {-h * .35} h8 M-4 {-h * .55} h8', 2, BRASS) + \
        circ(0, -h - 22, 18, GLOW_B, 3) + ink(f'M0 {-h - 40} V{-h - 4} M-18 {-h - 22} H18', 'none', 1.6) + \
        f'<ellipse cx="0" cy="{-h - 22}" rx="30" ry="11" transform="rotate(-25 0 {-h - 22})" fill="none" stroke="{K}" stroke-width="2.4"/>' + \
        f'<ellipse cx="0" cy="{-h - 22}" rx="11" ry="30" transform="rotate(-25 0 {-h - 22})" fill="none" stroke="{ROSE}" stroke-width="1.8"/>' + \
        circ(0, -h - 46, 4, IRON, 2) + f'<circle cx="0" cy="{-h - 22}" r="40" fill="{GLOW_B}" opacity=".25" filter="url(#bleed)"/>'


def w_blade(l=150):
    return ink('M-6 0 H6 V40 H-6 Z', PAPER2, 2.4) + fine('M-6 10 h12 M-6 20 h12 M-6 30 h12', 1.6, RED) + \
        ink('M-14 0 C-14 -10 -6 -14 0 -14 C6 -14 14 -10 14 0 Z', IRON, 2.4) + ink('M-14 -2 L-24 -12 M14 -2 L24 -12', 'none', 2.4) + \
        f'<path d="M-6 -14 L-7 {-l} L0 {-l - 14} L7 {-l} L6 -14 Z" fill="{GLOW_O}" opacity=".35" filter="url(#bleed)" transform="scale(1.6 1)"/>' + \
        ink(f'M-5 -14 L-5 {-l} L0 {-l - 12} L5 {-l} L5 -14 Z', GLOW_O, 2.2) + fine(f'M0 -18 V{-l}', 1.6, WHITE)


def w_quiver():
    spears = ''.join(ink(f'M{x} 0 V-46', 'none', 2.2) + ink(f'M{x} -54 l-5 10 h10 Z', STEEL, 2) + dot(x, -56, 2.4, GLOW_O) for x in (-12, -4, 4, 12))
    return spears + ink('M-20 0 H20 L17 80 H-17 Z', LEATHER, 2.6) + fine('M-20 12 H20 M-19 64 H19', 2, PAPER2) + hatch('M-20 0 H-10 L-9 80 H-17 Z')


def w_rifle(l=240):
    return ink(f'M0 -6 H{l * .3} V8 H0 C-16 8 -30 12 -40 14 V-4 C-30 -4 -16 -6 0 -6 Z', PAPER2, 2.4) + \
        ink(f'M{l * .3} -7 H{l * .55} V8 H{l * .3} Z', IRON, 2.4) + ink(f'M{l * .55} -3 H{l} V3 H{l * .55} Z', STEEL2, 2.2) + \
        ink(f'M{l * .25} -24 H{l * .62} V-14 H{l * .25} Z', NIGHT, 2.4) + ink(f'M{l * .62} -26 H{l * .68} V-12 H{l * .62} Z', ROSE, 2) + \
        fine(f'M{l * .32} -14 V-7 M{l * .55} -14 V-7', 2)


def w_claws():
    return ink('M-14 -10 H14 V22 H-14 Z', LEATHER, 2.4) + fine('M-14 0 H14 M-14 12 H14', 1.6, PAPER2) + \
        ''.join(ink(f'M{x} 22 C{x + 2} 40 {x - 2} 52 {x - 10} 60', 'none', 2.6) + fine(f'M{x + 1} 26 C{x + 2} 40 {x} 50 {x - 6} 56', 1.2, '#7ad77a') for x in (-10, -3, 4, 11))


def wolf(s=1):
    """Pas, the Scout's companion: a lean cyber-wolf, sitting."""
    body = ink('M-60 0 C-62 -30 -40 -60 -10 -64 C10 -66 20 -60 30 -70 L36 -96 L44 -82 L52 -96 L56 -70 C66 -60 70 -48 62 -40 L40 -38 C40 -20 30 -6 20 0 Z', STEEL2, 3) + \
        ink('M-60 0 C-80 -6 -92 -20 -96 -36 C-84 -26 -72 -20 -58 -18', STEEL2, 2.6) + \
        dot(44, -66, 3, AMBER) + ink('M58 -48 L66 -46 L60 -42 Z', K, 1.6) + \
        ink('M-20 -60 C-16 -40 -18 -20 -24 0 M8 -40 V0', 'none', 2) + fine('M-30 -50 h20 M-34 -40 h20', 1.4, BRASS) + \
        hatch('M-60 0 C-62 -30 -40 -60 -10 -64 C-30 -50 -40 -30 -36 0 Z') + ink('M-40 -54 H-4 V-46 H-40 Z', LEATHER, 2)
    return g(body, s=s)


# ---- Species --------------------------------------------------------------------------------------
def balcik(p=None, hold=None):
    """Balçık: a mechanical frog. Wide and low; the boiler on its back brings it to hitbox height."""
    p = {'skin': MOSS, 'skin2': MOSS2, 'belly': BELLY, 'metal': BRASS, 'cloth': ORANGE, **(p or {})}
    back = ink('M-58 -330 C-58 -350 58 -350 58 -330 V-250 H-58 Z', p['metal'], 3) + fine('M-58 -310 H58 M-58 -285 H58', 1.6) + \
        ''.join(dot(x, -320, 2.4) for x in (-44, -22, 0, 22, 44)) + ink('M30 -346 V-372 H46 V-346', IRON, 3) + ink('M26 -372 H50', 'none', 3.4) + \
        f'<path d="M38 -380 C30 -392 46 -400 38 -412" fill="none" stroke="{STEEL}" stroke-width="3" opacity=".7"/>'
    legs = ''.join(ink(f'M{s * 40} -70 C{s * 90} -90 {s * 112} -60 {s * 100} -24 L{s * 76} -8', p['skin'], 3) +
                   ink(f'M{s * 70} -4 L{s * 118} -4 L{s * 128} 0 L{s * 60} 0 Z', p['skin2'], 2.6) + fine(f'M{s * 90} -4 l{s * 4} 4 M{s * 106} -4 l{s * 4} 4', 1.4)
                   for s in (-1, 1))
    body = ink('M0 -308 C64 -308 92 -240 92 -160 C92 -86 62 -44 0 -44 C-62 -44 -92 -86 -92 -160 C-92 -240 -64 -308 0 -308 Z', p['skin'], 3.4) + \
        hatch('M-92 -160 C-92 -240 -64 -308 0 -308 C-44 -290 -70 -230 -68 -160 C-66 -100 -40 -60 0 -44 C-62 -44 -92 -86 -92 -160 Z') + \
        ink('M0 -210 C44 -210 60 -170 58 -128 C56 -86 34 -64 0 -64 C-34 -64 -56 -86 -58 -128 C-60 -170 -44 -210 0 -210 Z', p['belly'], 2.6) + \
        fine('M-40 -150 c10 6 20 6 30 0 M10 -120 c10 6 20 6 30 0 M-30 -100 c8 4 16 4 24 0', 1.2, LEATHER, .6) + \
        ink('M-62 -236 C-30 -220 30 -220 62 -236', 'none', 3) + \
        ''.join(circ(s * 46, -298, 24, p['skin'], 3) + circ(s * 46, -298, 15, PAPER, 2.4) + dot(s * 46, -296, 7) + dot(s * 42 + (2 if s > 0 else 0), -301, 2.4, WHITE) +
                ink(f'M{s * 22} -298 C{s * 30} -326 {s * 62} -326 {s * 70} -298', 'none', 2.6) for s in (-1, 1)) + \
        ''.join(dot(x, y, 3.2, p['skin2']) for x, y in ((-70, -200), (-60, -180), (70, -190), (64, -210), (-74, -130), (76, -140)))
    cloth = ink('M-26 -66 H26 L22 -14 L8 -20 L0 -8 L-8 -20 L-22 -14 Z', p['cloth'], 2.6) + fine('M-20 -54 H20', 1.4, PAPER)
    arms = ''.join(ink(f'M{s * 84} -220 C{s * 110} -200 {s * 118} -160 {s * 114} -120', 'none', 22) + fine(f'M{s * 84} -220 C{s * 110} -200 {s * 118} -160 {s * 114} -120', 15, p['metal']) +
                   fine(f'M{s * 104} -196 l{s * 14} -6 M{s * 112} -166 l{s * 14} -2', 2) + circ(s * 112, -150, 4, IRON, 2) +
                   ink(f'M{s * 104} -122 C{s * 100} -100 {s * 112} -92 {s * 120} -98 M{s * 114} -120 C{s * 116} -100 {s * 126} -96 {s * 132} -104 M{s * 124} -120 C{s * 130} -110 {s * 138} -110 {s * 140} -118', p['skin2'], 3)
                   for s in (-1, 1))
    held = ''
    if hold:
        held = hold
    return back + legs + body + cloth + arms + held


def yamali(p=None):
    """Yamalı: a person patched with machine parts. Slim, upright; one arm is always forged brass."""
    p = {'skin': SKIN, 'hair': K, 'coat': PAPER2, 'scarf': TEAL, 'pants': STEEL2, 'metal': BRASS, 'hairstyle': 'short', 'old': False, **(p or {})}
    legs = ''.join(ink(f'M{s * 6} -186 L{s * 30} -186 L{s * 26} -40 L{s * 8} -40 Z', p['pants'], 3) for s in (-1, 1)) + \
        ''.join(ink(f'M{s * 4} -50 H{s * 30} L{s * 32} -8 C{s * 40} -6 {s * 44} -2 {s * 44} 0 H{s * 4} Z', LEATHER2, 3) for s in (-1, 1)) + \
        hatch('M-30 -186 L-26 -40 L-18 -40 L-20 -186 Z')
    coat = ink('M-40 -296 C-24 -304 24 -304 40 -296 L50 -150 L44 -112 L36 -124 L28 -104 L16 -120 L10 -170 H-10 L-16 -120 L-28 -104 L-36 -124 L-44 -112 L-50 -150 Z', p['coat'], 3.2) + \
        ink('M-10 -170 L-14 -290 M10 -170 L14 -290', 'none', 2) + ink('M-34 -196 H34 V-184 H-34 Z', LEATHER, 2.2) + \
        hatch('M-50 -150 L-40 -296 C-34 -298 -30 -300 -28 -300 L-36 -150 L-44 -112 Z') + fine('M30 -260 l4 30 M-26 -240 l-2 20', 1.2, K, .6)
    arm_l = ink('M-40 -290 C-52 -270 -56 -230 -54 -186', p['coat'], 18) + fine('M-40 -290 C-52 -270 -56 -230 -54 -186', 12, p['coat']) + \
        circ(-54, -180, 8, p['skin'], 2.6)
    arm_r = ink('M40 -290 L50 -240', 'none', 14) + fine('M40 -290 L50 -240', 9, p['metal']) + circ(50, -238, 7, IRON, 2.6) + \
        ink('M50 -238 L54 -192', 'none', 12) + fine('M50 -238 L54 -192', 7, p['metal']) + fine('M47 -224 h7 M48 -210 h7', 1.4) + \
        ink('M48 -192 L48 -176 M54 -190 L56 -174 M60 -192 L62 -178', 'none', 3)
    neck = ink('M-8 -312 V-298 H8 V-312', p['skin'], 2.6)
    head = ink('M0 -364 C16 -364 24 -350 24 -334 C24 -318 14 -308 0 -308 C-14 -308 -24 -318 -24 -334 C-24 -350 -16 -364 0 -364 Z', p['skin'], 3)
    hair = {
        'short': ink('M-25 -334 C-28 -360 -10 -372 4 -370 C20 -368 30 -352 24 -336 C18 -346 6 -350 -4 -348 C-12 -346 -18 -342 -25 -334 Z', p['hair'], 2.6),
        'bob': ink('M-30 -312 C-34 -350 -18 -372 2 -372 C22 -372 34 -350 30 -312 L22 -316 C24 -332 22 -344 18 -348 C6 -340 -10 -342 -18 -348 C-22 -340 -24 -328 -22 -316 Z', p['hair'], 2.6),
        'buns': ink('M-25 -336 C-26 -358 -10 -370 2 -370 C18 -370 28 -356 24 -336 C16 -346 -14 -346 -25 -336 Z', p['hair'], 2.6) + circ(-22, -366, 10, p['hair'], 2.6) + circ(22, -366, 10, p['hair'], 2.6),
        'white': ink('M-26 -332 C-34 -352 -24 -376 -6 -374 C0 -382 18 -380 22 -370 C34 -366 34 -346 26 -332 C20 -344 8 -354 -6 -350 C-14 -348 -20 -342 -26 -332 Z', WHITE, 2.6) + fine('M-20 -360 c4 -4 8 -4 12 0 M4 -366 c4 -4 8 -4 12 0', 1.2),
    }[p['hairstyle']]
    face = dot(-9, -334, 2.6) + dot(9, -334, 2.6) + fine('M-14 -342 l8 -1 M6 -343 l8 1', 1.6) + fine('M-5 -320 c3 2 7 2 10 0', 1.6) + \
        (fine('M-16 -326 c2 2 4 2 6 0 M10 -326 c2 2 4 2 6 0', 1, K, .6) if p['old'] else '')
    scarf = ink('M-20 -304 C-10 -296 10 -296 20 -304 L22 -292 C10 -284 -10 -284 -22 -292 Z', p['scarf'], 2.6) + ink('M14 -290 L22 -250 L12 -246 L8 -288', p['scarf'], 2.4)
    extra = ''
    if p.get('headphones'):
        extra += ink('M-26 -340 C-26 -372 26 -372 26 -340', 'none', 3) + ink('M-32 -346 h10 v20 h-10 Z', ROSE, 2.4) + ink('M22 -346 h10 v20 h-10 Z', ROSE, 2.4)
    if p.get('goggles'):
        extra += ink('M-22 -356 H22', 'none', 4) + circ(-10, -356, 7, GLASS, 2.4) + circ(10, -356, 7, GLASS, 2.4)
    return legs + arm_l + coat + neck + scarf + head + hair + face + arm_r + extra


def katip(p=None):
    """Kâtip: a wingless insect people. Tall and narrow, four arms, a smooth face plate, a long lace cape."""
    p = {'shell': BONE, 'cape': TEAL2, 'joint': NIGHT, 'trim': AMBER, **(p or {})}
    cape = ink('M-30 -300 C-46 -220 -62 -100 -66 -20 L-48 -26 L-36 -14 L-20 -24 L0 -12 L20 -24 L36 -14 L48 -26 L66 -20 C62 -100 46 -220 30 -300 Z', p['cape'], 3) + \
        '<path d="M-30 -300 C-46 -220 -62 -100 -66 -20 L-48 -26 L-36 -14 L-20 -24 L0 -12 L20 -24 L36 -14 L48 -26 L66 -20 C62 -100 46 -220 30 -300 Z" fill="url(#lace)"/>'
    legs = ''.join(ink(f'M{s * 10} -158 L{s * 16} -84 L{s * 12} -10', 'none', 9) + fine(f'M{s * 10} -158 L{s * 16} -84 L{s * 12} -10', 5, p['shell']) +
                   circ(s * 16, -84, 5, p['joint'], 2.2) + ink(f'M{s * 12} -10 L{s * 4} 0 M{s * 12} -10 L{s * 24} 0', 'none', 3) for s in (-1, 1))
    body = ink('M-30 -300 C-30 -312 30 -312 30 -300 L22 -236 C16 -214 14 -202 12 -192 H-12 C-14 -202 -16 -214 -22 -236 Z', p['shell'], 3) + \
        fine('M-24 -284 C-10 -276 10 -276 24 -284 M-20 -258 C-8 -252 8 -252 20 -258 M-16 -232 C-6 -228 6 -228 16 -232', 1.4) + \
        ink('M-12 -192 C-24 -186 -26 -166 -18 -152 C-8 -144 8 -144 18 -152 C26 -166 24 -186 12 -192 Z', p['joint'], 3) + \
        fine('M-30 -300 L-26 -296 M-6 -296 V-206', 1.4, p['trim']) + hatch('M-30 -300 L-22 -236 C-16 -214 -14 -202 -12 -192 L-18 -192 C-22 -230 -26 -270 -30 -300 Z')
    upper = ''.join(ink(f'M{s * 28} -298 L{s * 50} -254 L{s * 58} -206', 'none', 8) + fine(f'M{s * 28} -298 L{s * 50} -254 L{s * 58} -206', 4, p['shell']) +
                    circ(s * 50, -254, 4.4, p['joint'], 2) + ink(f'M{s * 58} -206 l{s * -4} 10 M{s * 58} -206 l{s * 6} 9', 'none', 2.4) for s in (-1, 1))
    lower = ''.join(ink(f'M{s * 20} -250 L{s * 36} -214 L{s * 40} -170', 'none', 7) + fine(f'M{s * 20} -250 L{s * 36} -214 L{s * 40} -170', 3.4, p['shell']) +
                    circ(s * 36, -214, 3.8, p['joint'], 2) + ink(f'M{s * 40} -170 l{s * -4} 9 M{s * 40} -170 l{s * 5} 8', 'none', 2.2) for s in (-1, 1))
    head = ink('M0 -370 C14 -370 18 -350 16 -334 C14 -320 8 -312 0 -310 C-8 -312 -14 -320 -16 -334 C-18 -350 -14 -370 0 -370 Z', p['shell'], 3) + \
        fine('M-10 -346 C-4 -340 4 -340 10 -346', 2, K, .8) + fine('M0 -364 V-316', 1, K, .35) + hatch('M-16 -334 C-18 -350 -14 -370 0 -370 C-8 -360 -10 -340 -8 -312 C-12 -316 -15 -324 -16 -334 Z')
    antennae = ink('M-4 -368 C-10 -400 -30 -420 -46 -428', 'none', 2.4) + ink('M4 -368 C10 -400 30 -420 46 -428', 'none', 2.4) + dot(-46, -428, 3) + dot(46, -428, 3)
    return cape + legs + body + lower + upper + head + antennae


# Hand anchors (where the right / left hand ends) in figure coordinates.
HANDS = {'balcik': ((118, -110), (-118, -110)), 'yamali': ((54, -182), (-54, -180)), 'katip': ((58, -206), (-58, -206), (40, -170), (-40, -170))}


def species(name, p=None):
    return {'balcik': balcik, 'yamali': yamali, 'katip': katip}[name](p)


def page(w, h, body, bg=PAPER):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">{DEFS}'
            f'<rect width="{w}" height="{h}" fill="{bg}"/><rect width="{w}" height="{h}" fill="{bg}" filter="url(#paper)"/>'
            f'<g filter="url(#hand)">{body}</g></svg>')


def text(x, y, s, size=20, anchor='start', font='hand', color=K, rot=0, weight='normal'):
    fam = {'hand': "'Special Elite', monospace", 'display': "'Bungee', sans-serif", 'body': "'Fredoka', sans-serif"}[font]
    return f'<text x="{x}" y="{y}" font-family="{fam}" font-size="{size}" text-anchor="{anchor}" fill="{color}" font-weight="{weight}" transform="rotate({rot} {x} {y})">{s}</text>'


PAGES = {}

# ---- 1. Species scale and hitbox sheet ----------------------------------------------------------------
def scale_sheet():
    W, H = 1400, 900
    base = 720
    out = text(60, 80, 'Türler · boy ve hitbox', 40, font='display') + text(60, 116, 'Üç tür, tek hitbox: 0.45 m yarıçap, 1.85 m boy (src/core.ts). Kesik kırmızı kutu = hitbox.', 17) + text(60, 142, 'İnce uçlar (anten, baca, kol ve ayak uçları) kutudan taşabilir; oraya gelen vuruş sayılmaz.', 17)
    # Metre ruler.
    rx = 120
    out += ink(f'M{rx} {base} V{base - 2 * M}', 'none', 2.4)
    for i in range(0, 21):
        y = base - i * M / 10
        out += fine(f'M{rx} {y} h{-14 if i % 5 == 0 else -7}', 1.6)
    for m in (0, .5, 1, 1.5, 2):
        out += text(rx - 22, base - m * M + 6, f'{m:g} m', 15, 'end')
    xs = {'balcik': 380, 'yamali': 720, 'katip': 1060}
    names = {'balcik': ('Balçık', 'kurbağa · kutuyu tam doldurur'), 'yamali': ('Yamalı', 'insan · kutunun ~%55i'),
             'katip': ('Kâtip', 'böcek · pelerinle ~%70')}
    for k, x in xs.items():
        hw, hh = HIT_R * M, HIT_H * M
        out += f'<rect x="{x - hw}" y="{base - hh}" width="{2 * hw}" height="{hh}" fill="{AMBER}" opacity=".16" filter="url(#bleed)"/>'
        out += fine(f'M{x - hw} {base} V{base - hh} H{x + hw} V{base}', 2, RED, .8, 'stroke-dasharray="8 6"')
        out += f'<ellipse cx="{x}" cy="{base}" rx="{hw}" ry="14" fill="none" stroke="{RED}" stroke-width="2" stroke-dasharray="8 6" opacity=".8"/>'
        out += g(species(k), x, base)
        out += text(x, base + 56, names[k][0], 30, 'middle', 'display') + text(x, base + 84, names[k][1], 16, 'middle')
    out += ink(f'M60 {base} H{W - 60}', 'none', 3) + hatch(f'M60 {base} H{W - 60} V{base + 16} H60 Z', .6)
    out += fine(f'M{xs["katip"] + 70} {base - 2 * M - 30} C{xs["katip"] + 110} {base - 2 * M} {xs["katip"] + 120} {base - 1.9 * M} {xs["katip"] + 98} {base - 1.86 * M}', 1.6, RED)
    out += text(xs['katip'] + 76, base - 2 * M - 40, 'antenler hitbox dışı', 15, color=RED)
    out += text(xs['balcik'] + 100, base - 1.9 * M - 10, 'baca: hitbox dışı', 15, color=RED)
    out += text(60, H - 50, 'Bulgu: Balçık kutuyu dolduruyor ama Yamalı ve Kâtip ince; onların yanından geçen vuruşlar da isabet sayılıyor.', 17, color=RED) + text(60, H - 24, 'Öneri: tür başına yarıçap (Balçık 0.45, Yamalı 0.36, Kâtip 0.38 m) ya da herkese 0.38 m. Boy 1.85 m herkes için kalır.', 17)
    return page(W, H, out)


PAGES['tur-boy-hitbox'] = scale_sheet()


# ---- 2. Class cards ------------------------------------------------------------------------------------
CLASS = {
    'rogue': ('ROGUE', 'Haydut', LILAC, 'katip', {'cape': NIGHT, 'trim': ROSE}, 'Islak Sokak Tabancası · Ay Kırığı Hançerler', 'Ensedeki Soğukluk · İz Bırakmayan'),
    'mage': ('MAGE', 'Büyücü', TEAL, 'yamali', {'hairstyle': 'bob', 'headphones': True, 'coat': '#d9c7e8', 'scarf': ROSE, 'pants': NIGHT}, 'Işık Kalemi · Fener Asası', 'Önsezi · Cepteki Yıldızlar'),
    'fighter': ('FIGHTER', 'Savaşçı', AMBER, 'balcik', {'cloth': RED}, 'Yıldırım Mızrakları · Şafak Kılıcı', 'Eski Bir Yemin · Kan Borcu'),
    'scout': ('SCOUT', 'İzci', '#7ab86a', 'yamali', {'hairstyle': 'buns', 'hair': '#e8c86a', 'coat': '#5b7fa6', 'scarf': AMBER, 'goggles': True}, 'Uzak Göz · Kedi Tırnakları', 'Sadık Gölge · Kuş Bakışı'),
}


def class_card(cid):
    W, H = 600, 840
    title, tr, col, sp, pal, weapons, passives = CLASS[cid]
    out = f'<circle cx="420" cy="250" r="150" fill="{ORANGE}" opacity=".55" filter="url(#bleed)"/>' + circ(420, 250, 120, 'none', 2)
    out += f'<path d="M0 600 C120 580 200 610 300 596 C420 580 500 606 600 590 V840 H0 Z" fill="{col}" opacity=".45" filter="url(#bleed)"/>'
    out += ink('M0 610 C120 590 200 620 300 606 C420 590 500 616 600 600', 'none', 2.6) + f'<path d="M0 610 C120 590 200 620 300 606 C420 590 500 616 600 600 V650 H0 Z" fill="url(#hatch2)"/>'
    fig = species(sp, pal)
    back, front = '', ''
    if cid == 'rogue':
        (rx, ry), (lx, ly), (rx2, ry2), (lx2, ly2) = HANDS['katip']
        front = g(w_pistol(), rx, ry, 1, -10) + g(w_dagger(), lx, ly, 1, -20) + g(w_dagger(), lx2, ly2, 1, 15) + g(w_dagger(), rx2, ry2, 1, 25)
    elif cid == 'mage':
        (rx, ry), _ = HANDS['yamali']
        front = g(w_staff(), rx + 4, ry + 150, 1, 6)
    elif cid == 'fighter':
        (rx, ry), _ = HANDS['balcik']
        back = g(w_quiver(), -60, -250, 1, -25)
        front = g(w_blade(170), rx, ry, 1, 20)
    else:
        (rx, ry), _ = HANDS['yamali']
        back = g(w_rifle(), 40, -160, 1, -125)
        front = g(w_claws(), rx, ry + 6, .9, 0) + g(mirror(wolf(1)), 190, 0)
    s = 1.1 if sp == 'katip' else 1.2
    out += g(back + fig + front, 220 if cid == 'scout' else 300, 640, s)
    out += f'<rect x="0" y="0" width="{W}" height="96" fill="{col}"/>' + ink(f'M0 96 H{W}', 'none', 3)
    out += text(32, 66, title, 46, font='display') + text(W - 32, 62, tr, 24, 'end')
    out += f'<rect x="24" y="680" width="{W - 48}" height="132" fill="{PAPER}" stroke="{K}" stroke-width="2.6"/>'
    out += text(44, 718, 'Silahlar', 16, color=col if cid != 'fighter' else LEATHER) + text(44, 744, weapons, 19)
    out += text(44, 778, 'Pasifler', 16, color=col if cid != 'fighter' else LEATHER) + text(44, 802, passives, 19)
    out += ink(f'M6 6 H{W - 6} V{H - 6} H6 Z', 'none', 5)
    return page(W, H, out)


for c in CLASS:
    PAGES[f'class-{c}'] = class_card(c)


# ---- 3. Hero presets ---------------------------------------------------------------------------------
HEROES = [
    ('Mina', 'Yamalı', 'yamali', {'hairstyle': 'bob', 'headphones': True, 'coat': '#e9a6b8', 'scarf': NIGHT, 'pants': NIGHT}),
    ('Gurr', 'Balçık', 'balcik', {'metal': ORANGE, 'cloth': TEAL2, 'skin': '#5f8f5a', 'skin2': '#3f6b3e'}),
    ('Ilgın', 'Kâtip', 'katip', {'cape': '#1f2a2e', 'trim': TEAL, 'shell': '#dfe6ea'}),
    ('Nene Döküm', 'Yamalı', 'yamali', {'hairstyle': 'white', 'old': True, 'coat': LEATHER2, 'scarf': RED, 'pants': '#3f3a33', 'skin': '#d8a07c'}),
    ('Teker', 'Yamalı', 'yamali', {'hairstyle': 'buns', 'hair': '#e8c86a', 'coat': '#5b7fa6', 'scarf': AMBER, 'goggles': True}),
]


def heroes():
    W, H = 1500, 760
    out = text(60, 76, 'Kahraman preset’leri', 40, font='display') + text(60, 110, 'Kahraman = görünüm, class = kit. Her preset bir türün kostümü; Seraf (kedi) tür olmadığı için çıkarıldı.', 17)
    base = 610
    out += ink(f'M40 {base} H{W - 40}', 'none', 3) + hatch(f'M40 {base} H{W - 40} V{base + 14} H40 Z', .5)
    for i, (n, sp, k, pal) in enumerate(HEROES):
        x = 150 + i * 280
        out += f'<ellipse cx="{x}" cy="{base - 160}" rx="120" ry="200" fill="{[ROSE, MOSS, TEAL, LEATHER, AMBER][i]}" opacity=".22" filter="url(#bleed)"/>'
        out += g(species(k, pal), x, base, 1.1)
        if n == 'Teker':
            out += g(wolf(.7), x + 110, base)
        out += text(x, base + 52, n, 26, 'middle', 'display') + text(x, base + 78, sp, 17, 'middle')
    return page(W, H, out)


PAGES['kahramanlar'] = heroes()


# ---- 4. Title-screen poster ---------------------------------------------------------------------------
def poster():
    W, H = 448, 592
    sky = f'<rect width="{W}" height="{H}" fill="#f6d9a8" opacity=".7"/>' + \
        f'<path d="M0 0 H{W} V260 C320 240 140 280 0 250 Z" fill="{TEAL}" opacity=".35" filter="url(#bleed)"/>'
    sun = f'<circle cx="250" cy="250" r="128" fill="{ORANGE}" opacity=".8" filter="url(#bleed)"/>' + circ(250, 250, 112, 'none', 2.2)
    koi = g(ink('M0 0 C14 -10 34 -8 44 0 C34 8 14 10 0 0 Z', WHITE, 1.8) + ink('M44 0 L56 -8 L52 0 L56 8 Z', ORANGE, 1.6) +
            f'<path d="M10 -4 c6 -2 10 0 12 4 c-4 2 -8 2 -12 -4 Z" fill="{RED}"/>' + dot(6, -1, 1.4), 70, 120, 1, -12)
    # Bone City skyline: towers, a dome, a cable car line.
    city = ''
    blocks = [(0, 330, 46), (40, 300, 40), (76, 350, 36), (108, 280, 30), (130, 320, 44), (170, 260, 26), (190, 310, 50), (236, 290, 32),
              (264, 340, 40), (300, 270, 36), (332, 320, 46), (372, 296, 34), (402, 340, 46)]
    for x, top, w in blocks:
        city += ink(f'M{x} 470 V{top} H{x + w} V470', PAPER2, 2.4) + fine(f'M{x + 6} {top + 14} h{w - 12} M{x + 6} {top + 30} h{w - 12}', 1.2, K, .5)
        city += ''.join(f'<rect x="{x + 8 + j * 10}" y="{top + 44 + r * 20}" width="5" height="9" fill="{K}" opacity=".55"/>' for j in range(max(1, (w - 12) // 10)) for r in range(2))
    city += ink('M170 260 C170 236 196 236 196 260', AMBER, 2.4) + ink('M183 236 V220', 'none', 2)
    city += f'<path d="M0 470 V330 H46 V300 H80 V350 H108 V280 H138 V320 H174 V260 H196 V310 H240 V290 H268 V340 H304 V270 H336 V320 H378 V296 H406 V340 H448 V470 Z" fill="url(#hatch2)"/>'
    cable = fine('M0 200 C140 236 300 236 448 214', 1.6) + g(ink('M-14 0 H14 V18 H-14 Z', ROSE, 2) + fine('M0 -12 V0', 1.6) + fine('M-10 6 h20', 1.2, PAPER), 300, 236)
    roof = ink(f'M-10 470 H{W + 10} V{H + 10} H-10 Z', LEATHER2, 3) + f'<path d="M0 470 H{W} V{H} H0 Z" fill="url(#hatch)"/>' + fine(f'M0 486 H{W}', 2, PAPER2, .6) + ink(f'M-10 520 H{W + 10} V{H + 10} H-10 Z', LEATHER, 3) + fine(f'M0 540 H{W} M0 566 H{W}', 1.6, PAPER2, .5)
    trio = g(g(balcik(), -100, 0, .4) + g(yamali({'hairstyle': 'bob', 'headphones': True, 'coat': '#e9a6b8', 'scarf': NIGHT, 'pants': NIGHT}), -10, 0, .44) + g(katip(), 70, 0, .42), 200, 520)
    frame = ink(f'M8 8 H{W - 8} V{H - 8} H8 Z', 'none', 4)
    return page(W, H, sky + sun + koi + cable + city + roof + trio + frame)


PAGES['poster'] = poster()

out = Path(__file__).parent / 'pages'
out.mkdir(exist_ok=True)
for k, v in PAGES.items():
    (out / f'{k}.svg').write_text(v)
print(len(PAGES), 'pages')
