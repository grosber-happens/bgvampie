# Movement (S4 League feel, our own code)

Our movement takes the *feel* of S4 League: a breath bar (SP) that pays for acrobatics.
We never copy S4 code, animation or asset files. The numbers below are our own; the S4
column is what the player community documented on the S4 League wiki, used only as a
reference for ratios.

| Action | Input | Our cost | S4 (community wiki) |
| --- | --- | --- | --- |
| Side dash (dodge) | A/D + Space | 20 SP | 20 SP |
| Wall kick | Space next to a wall, while rising | 20 SP | 20 SP |
| Sprint | W W, hold W | 6 SP/s, ground only | 5 SP/s |
| Air sprint (fast drop) | W W in the air | free | lower than sprinting ("bunny hop") |
| Breath bar | | 100, regen 32/s after 0.6 s | 100 (+40 with SP Mastery) |

## Rules

- **Dash** is a burst then a slide. A side dash is a no-hands cartwheel: one full turn
  around the hips in 0.40 s with no wind-up, upside down at 0.1 s, a short hang at the top
  (125-175 ms), touchdown at 0.365 s, straight back into running. The timing comes from
  frame-by-frame study of the user's own S4 recordings (design/s4-video-analizi-animasyon-spec.md
  in the project files); the class dash keeps its distance and is stretched to that time.
  Sprinting leans the body about 17 degrees forward. This is a body-level turn for now;
  hand-keyed limb animation (split legs at the top, gun arm holding aim) comes later.
- **Dash-jump (wave dash):** Space during a dash, or just after it, cancels the slide into a
  long low leap that keeps the dash speed. In the air you can dash again (gear gives air
  dashes), then land and jump-cancel again. It is the fastest way to move and the most
  expensive in breath.
- **Sprint in the air** drops you faster (gravity x1.75) and keeps sprint speed. Breath
  only drains on the ground, so hopping (jump, air sprint, land, jump) costs less breath
  than running but covers less ground. It works with an empty bar.
- **Wall kick** only works while rising or at the top of a jump, never while falling.
  The kick mirrors your incoming speed off the wall (angle in = angle out), so you can
  cross gaps by kicking off a wall at a shallow angle. Max 3 kicks before touching ground.
- **Dodge out of a stun:** while stunned, A/D + Space still dashes and breaks the stun,
  for 35 SP instead of 20 (S4 has a separate "dodge after stun" cost).
- **Direction speeds:** strafing runs at 92% speed and backpedalling at 78% (S4 has
  separate front, side and back speed rates).
- **Out of breath (winded):** no regen and slower steps for 1.1 s.

The S4 tuning knobs are listed by name in the open-source NetspherePirates server
(`ConstantInfoDto.cs`: dodge speed, decel, time and delay, walljump force, delay before
jump, jump and landing time, fastrun cost and decrement delay, back-hit bonus). We only
used that list to know which knobs exist; the values are ours.

All tuning lives in the `S4` object in `src/main.ts`.

## Melee special (right click)

With the melee weapon out, right click is a class special paid with breath (the same bar
as dashes, so you choose between running and hitting). Defined in `src/specials.ts`.
Holding left click for a heavy attack was considered and dropped.

| Class | Special | Breath | Cooldown | What it does |
| --- | --- | --- | --- | --- |
| Rogue | Saplama (lunge stab) | 25 | 1.2 s | Rushes up to 5 m, stops at the first enemy in reach, stabs (40) |
| Fighter | Karşı duruş (counter stance) | 30 | 1.4 s | 0.55 s guard; the first hit does 20% and is answered by a 360° swing (35, push, short stun) |
| Scout | Fırlatan tekme (launch kick) | 25 | 1.2 s | Small hop forward, kick (28), push 2.5 m, 0.6 s stun |
| Mage | İtme dalgası (push wave) | 30 | 1.4 s | Wave around the body: 18 damage, push 4 m, 40% slow |

## Test hooks

`__game.move()` reports breath, dash, sprint, air sprint, wall kicks and vertical speed.
`__game.god()` stops the player dying, and `__game.frame(dt)` draws one frame by hand
after `scene().getEngine().stopRenderLoop()` to freeze a pose for screenshots.
