# Balance simulator

A headless, simplified model of a full match, used to tune XP, bosses, mobs and class damage.
It does not draw anything and does not use Babylon.js, so thousands of matches run in minutes.

```
node --experimental-strip-types --no-warnings sim/run.ts 80 100        # full report (80 matches, 100 duels per pairing)
node --experimental-strip-types --no-warnings sim/quick.ts 200 100     # short summary on 4 threads
TUNED=1 node --experimental-strip-types --no-warnings sim/quick.ts     # same, with the proposed changes in tuning.ts
node --experimental-strip-types --no-warnings sim/solo.ts 12           # one player alone: farming speed per playstyle
node --experimental-strip-types --no-warnings sim/skills-report.ts     # placement of players per owned skill
TUNED=1 node --experimental-strip-types --no-warnings sim/shop-test.ts 96   # vendor machines, prices and S4 movement in full matches
```

## What is modelled

- **Map:** 1 km x 1 km, 5 regions. Kızıl Katedral is a 160 m disc in the middle; Mantar, Yıkık şehir,
  Maymun ağaç köyü and Çöl are the four corners. 48 mob camps (10 per outer region, 8 in the Katedral),
  2-4 mobs each (swarm, ranged, tank roles from design doc §3.5), respawn 60 s after being cleared.
  Katedral mobs have 1.5x health, damage and XP.
- **Bosses:** the region bosses at fixed minutes (config.ts `BOSS_SCHEDULE`), Kızıl Kontes last.
- **Ring:** shrinking safe zone that ends in the Katedral.
- **Players:** 20 bots, 5 per class, random playstyle. Weapons, passives and all 40 skills use the
  numbers from `src/balance.ts`, `src/rogue.ts`, `src/mage.ts`, `src/fighter.ts`, `src/scout.ts`.
  Level-ups offer 3 random cards; tier 3 needs 3 skills at tier 2 and a 40-coin token.
- **Duels:** two players at the same level with random builds, 35 m apart, no mobs.

## Simplifications (read before trusting a number)

- Flat 2D world: no walls, cover, height or line of sight. This favours ranged play; melee styles
  look weaker here than they will in the real game.
- No aiming: each shot rolls a hit chance from the bot's aim (0.5-0.8), the weapon and the distance.
- Bot behaviour (when to fight, flee, farm, take a boss) is a guess at how people play. Match length
  depends mostly on how aggressive players are (`AI.calmUntil` in config.ts), not on map size or health.
- Vehicles are only a speed bonus. Items come from drops and from vendor machines (`shop.ts`, using the game's
  placement and prices). Bots walk to a machine within 120 m when they have 50+ coins and nothing to fight.
- S4 movement (`move.ts`, `MOVE=0` turns it off): the breath bar pays for dashes, sprinting and the
  right-click specials. A dodge is a dice roll (the world is flat): a bot that sees an attack coming spends
  20 SP and the hit misses; slow or telegraphed attacks are easier to dodge than lasers. Double jumps,
  wall kicks and wall runs are not modelled.

## Files

- `config.ts`: the game's current numbers (baseline).
- `tuning.ts`: proposed changes, applied with `TUNED=1`.
- `kits.ts`: the 40 skills and the playstyles.
- `core.ts`: units, damage, XP and kills.
- `match.ts`: map, camps, bosses, ring, bot behaviour, duels.
- `move.ts`: breath bar, dodges, dashing out of stuns, sprint, right-click specials.
- `shop.ts`: vendor machines and the bots' shopping.
- `results/`: saved reports.
