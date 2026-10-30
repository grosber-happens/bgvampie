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

- **Dash** is a burst then a slide. A side dash is a no-hands cartwheel (one full turn
  around the hips during the burst, a low landing in the slide). Forward/back dashes lean.
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

## Test hooks

`__game.move()` reports breath, dash, sprint, air sprint, wall kicks and vertical speed.
`__game.god()` stops the player dying, and `__game.frame(dt)` draws one frame by hand
after `scene().getEngine().stopRenderLoop()` to freeze a pose for screenshots.
