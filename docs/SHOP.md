# Vendor machines, prices and the S4 movement balance

Kurbağa Loncası (the Frog Guild) runs vendor machines all over the map: clay kiosks carried like a frog's shell-house, with a teal screen and an amber beacon. This page covers where they stand, what they cost, and what the simulator says about the new movement and items (run on 2026-10-30).

## In the game

- Walk up to a machine and press **V**. The shop shows a shelf of 4 items your class can wear, your coins, and your bag. Click a shelf item to buy it (it is worn at once if it is clearly better, otherwise it goes to the bag). Right click a bag item to sell it for 30% of its price.
- Each machine rolls a new shelf every 150 s. The shelf is personal: two players of different classes see different items at the same machine.
- Shelf rarity follows the match: minutes 0–8 common 65% / rare 35%; minutes 8–16 common 25% / rare 45% / epic 30%; from minute 16 rare 35% / epic 50% / legendary 15%. A shelf slot is a Gece Karakolu set piece 8% of the time.
- The prototype city is only 80 m across, so it has 2 machines. Like the bag, the shop pauses the single-player match while it is open.
- Code: `src/shop.ts` (prices, shelves; pure, shared with the simulator), `src/mapgen/vendors.ts` (placement; pure), `src/vendor.ts` (machines in the city, buy and sell), `src/ui.ts` (`renderShop`). The planner draws the same machine (`vendorMachine` in `src/planner/kit.ts`).
- Test hooks: `__game.vendors()` lists the machines, `__game.openShop()` opens the one you stand at.

## How many machines, and where

`vendorCount(size)` aims for the nearest machine to be at most 200 m away anywhere on the map (a hex grid with spacing 200·√3). That is one machine for about every 0.1 km²:

| Map side | Machines |
| --- | --- |
| 300 m (planner default) | 6 (the minimum is one per landscape) |
| 1 km (simulator) | 10 |
| 2 km (a full Harvest slice) | 38 |

`placeVendors()` uses best-candidate sampling: each new machine takes the spot farthest from the machines already placed, so they spread evenly without a visible grid. Every landscape gets one first. Spots must be dry, flat (slope under 0.35) and at least 6 m away from landmarks; machines face the map center. With symmetry on, they are mirrored like everything else.

Why 200 m: the simulator swept the coverage distance (48 matches each, 1 km map, S4 movement on):

| Coverage | Machines | Nearest machine (avg) | Match length | Visits per player | Items bought (top 5) | Walked to machines per player |
| --- | --- | --- | --- | --- | --- | --- |
| none | 0 | | 26.3 min | | | |
| 300 m | 4 | 209 m | 29.9 min | 0.8 | 1.6 | 107 m |
| **200 m** | **10** | **130 m** | **28.8 min** | **1.3** | **2.0** | **215 m** |
| 150 m | 17 | 94 m | 31.4 min | 1.9 | 2.5 | 374 m |
| 100 m | 38 | 60 m | 32.5 min | 3.5 | 2.9 | 596 m |

More machines mean more shopping trips, and every trip is time not spent fighting, so matches get longer. 200 m keeps matches near the no-shop length while the top players still buy about two items. The walk distance matters most: bots that walk up to 220 m to a machine instead of 80 m made matches about 5 minutes longer (the default is 120 m). So machines belong on the natural paths (between camps, near landscape borders), not tucked away.

## Prices

Price = slot base × rarity multiplier (× 1.3 for Gece Karakolu set pieces), rounded to 5. Selling gives 30%.

| Slot | Common | Rare | Epic | Legendary |
| --- | --- | --- | --- | --- |
| Head | 20 | 30 | 50 | 80 |
| Legs | 25 | 40 | 65 | 100 |
| Chest | 30 | 50 | 75 | 120 |
| Necklace, ring | 35 | 55 | 90 | 140 |
| Weapon | 45 | 70 | 115 | 180 |
| Set head / legs / chest | 25 / 35 / 40 | 40 / 50 / 60 | 65 / 80 / 100 | 105 / 130 / 155 |
| Set necklace / ring | 45 | 75 | 115 | 180 |
| Tier-3 token (card, unchanged) | 40 | | | |

The thinking: a player earns about 100 coins in a match on average and the top five about 275 (coins come from mobs 20% × 5, bosses 80, player kills 30). A common piece costs a few minutes of farming, a rare one is a mid-game buy, and an epic or legendary is what a winner saves for. Jewels cost more than armor because they level up with you. A first pass with higher prices (common 30–55, legendary x4.5) left the top five buying only 1.8 items, so prices came down about 25%.

With the final prices (96 matches, 10 machines): players visit a machine 1.3 times and buy 0.8 items on average; the top five buy 2.1 items for about 100 coins, and their gear score at the end goes from 210 to 256 (+22%). Coins left at death average 61, mostly from players who die early before their first trip.

If the shop should matter more, raise income rather than cutting prices further: for example mob coins 35% × 5 instead of 20% × 5.

## The S4 movement in the simulator

`sim/move.ts` adds the breath bar (100 SP, regen 32/s after 0.6 s), side-dash dodges (20 SP), dashing out of a stun (35 SP), sprinting (x1.55, 6 SP/s) and the right-click specials from `src/specials.ts`. Dashes now cost breath instead of waiting for the class cooldown, and `dashCd` gear makes them cheaper, as in the game. A dodge is a dice roll: a bot that sees an attack coming (not hidden, not from behind; half as likely when it is busy with someone else) spends 20 SP and the hit misses. Base chances: wand laser 10%, pistol 18%, melee swing 20%, targeted skill 20%, ground area 30%, Fighter wind-up 35%, spear 40%, charged sniper shot 45%. Double jumps, wall kicks and wall runs are not modelled.

### Full matches (96 each)

| Setup | Length | Rogue | Mage | Fighter | Scout | Kills per match |
| --- | --- | --- | --- | --- | --- | --- |
| Old model (no breath bar, no shop) | 27.6 min | 25% | 27% | 44% | 4% | 18.5 |
| S4 movement | 27.1 min | 29% | 26% | 44% | 1% | 18.7 |
| S4 movement + machines | 29.5 min | 25% | 32% | 40% | 3% | 18.6 |

Each player dodges about 0.5 times, dashes out of a stun 0.1 times, uses 1.1 specials and sprints 6–7 minutes per match. In big matches most player damage comes from area skills, so the movement barely moves the class shares; it shows up in 1v1 fights. Scout still wins few full matches, which earlier reports traced to the bots playing the pet and the sniper badly in crowds.

### Duels (user's 8 builds, 50 m arena with cover, levels 7 and 12, 150 repeats per pairing)

| Build | Old model | S4 movement | + Proposal A |
| --- | --- | --- | --- |
| Rogue close | 61% | 54% | 54% |
| Rogue clones | 42% | 54% | 55% |
| Mage close | 42% | **60%** | 51% |
| Mage ranged | 53% | 54% | 52% |
| Fighter close | 65% | 58% | 60% |
| Fighter ranged | 44% | **34%** | 34% |
| Scout claws | 46% | 43% | 48% |
| Scout pet | 48% | 45% | 47% |
| **By class** | R 51 · M 48 · F 54 · S 47 | R 54 · M 57 · F 46 · S 44 | R 55 · M 52 · F 47 · S 47 |

(Averages of the no-gear and natural-epic-gear runs.) Duels got about 1 second shorter (11.9 → 10.8 s) because the specials add burst.

What changed:
- **Mage close jumped from 42% to 60%.** Half of that comes from dodging and half from the spell shield: 1 s of blocking everything, every 3 s, lands right when the burst comes in.
- **Fighter ranged fell from 44% to 34%.** Spears fly slowly enough to dodge, and most of the build's damage (recall, rain, pierce) is skill and area damage that can now be dodged too.
- **Rogue clones rose from 42% to 54%** (the lunge stab gets the Backstab bonus), and **Rogue close fell from 61% to 54%** (targets now dodge some hits and dash out of stuns).
- **Fighter close fell from 65% to 58%**, closer to the pack.

Proposal A (tested, not applied to the game): spell shield 1 s → 0.6 s and 30 → 35 breath; charged sniper shot flies faster (dodge chance 45% → 30%). It brings Mage close back to 51% and Scout claws to 48% without touching anything else. A cooldown change on the shield (3 → 6 s) did nothing, because it is rarely needed twice in 6 s.

Fighter ranged needs its own fix. Faster spears alone (+2 points) and more damage (+1) do little. Spear regen 2.2 → 1.5 s with 4 spears brings it to 37–41%, but also lifts Fighter close to 62%.

## How to run

```
TUNED=1 node --experimental-strip-types --no-warnings sim/shop-test.ts 96            # full matches: old / movement / machines
TUNED=1 SETUPS=c300,c200,c150,c100 node ... sim/shop-test.ts 48                       # coverage sweep
MOVE=0 SHOP=0 ONLY=b TUNED=1 node ... sim/gear-test.ts 150                            # duels, old model
MOVE=1 SHOP=0 ONLY=b TUNED=1 VARIANT=mv_shield2,mv_sniper node ... sim/gear-test.ts 150   # duels with proposal A
```

Flags: `MOVE=0` (old movement), `SPECIALS=0` (no right-click specials), `SHOP=0` (no machines), `COVER=200` or `VENDORS=10` (machine count), `DETOUR=120` (how far bots walk to a machine), `BUDGET=50` (coins before a trip). Saved results are in `sim/results/shop/`.
