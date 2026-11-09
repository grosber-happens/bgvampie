# Vampire Battleground — Game Design Brief

This is the brief for anyone continuing the game, including the agents (see `AGENTS.md`). It collects everything planned so far: gameplay, classes, skills, progression, art and the current state of the code.

- Tags: **[Decided]** means the owner approved it. **[Proposal]** means Claude suggested it and it still needs the owner's approval. Untagged lines describe the current prototype.
- The owner decides the design. Do not invent new classes, skills or rules. If something is missing or unclear, ask the owner. Small missing details (exact timings, effects) can be filled in, but say what you assumed.
- All gameplay numbers live in `src/balance.ts` and in each class file's `*NUM` table, for example `MNUM` in `src/mage.ts`. Every number is a starting value for playtesting; the code is the source for the current values.
- The owner sometimes writes in Turkish. The in-game text is Turkish for now.

---

## 1. Vision

- **Pitch:** a 3D third-person **battle royale** where combat feels like **Vampire Survivors**: mobs everywhere, fast levelling, a growing build. It is a futuristic-fantasy, post-apocalyptic world powered by nano technology, with a vampire theme.
- **Camera and combat [Decided]:** an over-the-shoulder camera with **manual aiming**. There is no auto-attack.
- **Platforms [Decided]:** a browser game first, then a desktop client from the same code (Electron or Tauri).
- **Match [Decided]:** 25–35 minutes, about 20 players, a shrinking ring and one large map split into regions. You can buy vehicles with currency, so the map has to be big.
- **Priority order [Decided]:**
  1. Gameplay and graphics, playable single-player against local AI bots.
  2. Content: regions, mobs, bosses, items, shops, vehicles.
  3. Real multiplayer comes last. Don't build networking yet.

## 2. Tech stack and repo

- **Engine [Decided]:** Babylon.js + TypeScript + Vite, as a single pnpm package at the repo root.
  - `pnpm install`, `pnpm dev`, then `pnpm build` (typecheck plus production build into `dist/public`).
- **Later multiplayer [Decided]:** server-authoritative over WebSocket, one room per match plus a lobby. Replit has no UDP, so the prototype server can live on Replit and production uses dedicated match servers.
- **Code map:**

  | File | What it does |
  |---|---|
  | `src/main.ts` | Game loop, player controller, camera, HUD, class and playstyle picker, level-up cards UI, `window.__game` test hooks |
  | `src/kit.ts` | `ClassKit` registry and shared skill helpers: cooldowns, charges, targeting, zones, effects, allies. Each class registers a kit |
  | `src/rogue.ts`, `src/mage.ts`, `src/fighter.ts`, `src/scout.ts` | The four class kits: weapons, passives, 10 skills × 3 tiers, playstyles, dash style |
  | `src/core.ts` | Units, damage pipeline (`dealDamage` with kit modifiers), bullets, DoT, stun, slow |
  | `src/progression.ts` | XP, levels, 3-card offers, tier-3 lock and token |
  | `src/ai.ts` | Bots, mob and boss AI |
  | `src/horde.ts` | Survivors-style mob spawn director (waves, ring spawns, events) |
  | `src/balance.ts` | Every tunable number |
  | `src/look.ts` | Clay and watercolor look (see §10) |
  | `src/world.ts`, `src/houses.ts`, `src/props.ts` | Map, collision (baked model shapes as turned boxes, broadphase grid), Kenney props |
  | `src/characters.ts`, `src/actors.ts`, `src/gun.ts` | Models and animation |
  | `src/feel.ts` | Hit feel and synthesized sounds |
  | `tools/hippo_blender.py` | Builds the player model `src/assets/hippo.glb` and its animations, including one dash per class |

- **Test URL parameters:**
  - `?class=rogue|mage|fighter|scout` picks the class.
  - `?seed=N` fixes the map.
  - `?look=classic` turns off the clay look.
  - `?debug=1` adds test keys: L gives a level, B spawns the boss, K gives currency.
- **Console hooks:** `window.__game` has `levelUp()`, `money(n)`, `sim(seconds)` (runs the game without drawing), `dummies([...])`, `state()` and more. To reach max level: `for (let i = 0; i < 11; i++) __game.levelUp(); __game.money(1000);`
- **Balance simulator:** a headless match simulator lives under `sim/` on the branch `claude/project-thread-odp5uf`. It was used for the approved balance package in §12.

## 3. Controls [Decided]

| Input | Action |
|---|---|
| WASD | Move |
| Mouse | Aim |
| Left click | Attack with the current weapon |
| Right click | Aim down sights; scopes and charges the Scout sniper |
| F | Switch between melee and ranged weapon |
| R | Reload |
| Q, E, 1, 2, 3 | The 5 skill slots |
| W W | Double tap W: sprint while W is held |
| A or D + Space | Side dash left or right |
| Space | Jump; against a wall for a wall kick (up to 3). No double jump (removed 2026-11-01) |
| Ctrl or C in the air | Ground slam (heavy legs only) |
| X | Bandage: free, 1.5 s channel that heals 10% every 0.5 s (30% total), 30 s cooldown. You walk at 60%; moving, jumping, attacking, a skill, a dash or any hit stops it (ticks already healed stay, half cooldown) |
| I | Bag (equip, unequip, drop) |
| G | Last Reel (5-piece Noir set) |
| Tab | Open the level-up cards; pick with 1, 2 or 3 |
| O | Camera: high (default) or classic over the shoulder (prototype, see below) |
| Mouse wheel | Zoom the high camera |
| Esc | Pause |

**Camera prototype (2026-11-04, the owner is trying it out):** a WoW-style camera, set a little higher and farther: behind and above the player, looking down about 50°, so the swarm around you shows. The mouse turns and tilts it; the wheel zooms from over the shoulder out to 16 m, and far out the view leads ahead of the player so the crosshair lands in front. Aiming (right click) still pulls in to the shoulder. Off-screen enemies and enemy bullets show as watercolor blots at the screen edge (`src/threats.ts`). The camera stops at walls. Inside a building (a ceiling close above the head, `src/indoor.ts`) the camera eases in to a close over-the-shoulder view at head height that fits the room and stops short of walls and ceilings; nothing is cut away, you walk through the rooms with the character, and it eases back out when you leave (owner, 2026-11-04: no view from above indoors). O switches back to the classic camera; the choice is remembered. Numbers: `HIGH_CAM` and `INDOOR_CAM` in `src/main.ts`, `THREAT`, `INDOOR`.

## 4. Progression inside a match

- **Levels [Decided]:**
  - Max character level is **12**. Each level gives 1 upgrade point.
  - A character holds at most **5 skills**, drawn from a **10-skill class pool**.
- **Card offer [Decided]:** each level-up offers **3 random cards**. A card is either a new skill or an upgrade of one you own.
- **Starting skill [Decided]:** at match start you pick a **playstyle**, which gives one starting skill and the starting weapon.
- **Tiers [Decided]:**
  - Every skill has 3 tiers, and a new skill starts at tier 1.
  - Maxing 5 skills would cost 15 points, but only 12 exist, so you always have to choose.
  - Tier 3 only unlocks once **at least 3 skills are at tier 2**, and each tier-3 upgrade also needs a **token** bought with currency.
  - In the prototype the card still buys the token directly for 40 currency (vendor machines sell items; see §5).
- **XP [Decided]:**
  - XP comes from mobs (worth more as the match goes on), other players and bosses.
  - XP to the next level: `[130, 190, 240, 340, 450, 550, 660, 920, 1150, 1450, 1800]`, 7880 in total.
  - Player kill: `60 + 30 × victim level`. Boss kill: `400 + 30 × match minute`. Mob kill: `20 × (1 + 0.05 × minute)`.
  - Target: an active player reaches level 12 at around minute 18–25.

## 5. Currency, shops and items

- **Currency [Decided]:**
  - You earn **x** per player kill and **y** per boss kill, and each mob kill has a **z%** chance to drop currency. The prototype uses x=30, y=80, z=20% for 5.
  - Currency is spent at **exchange or shop zones** on the map, on vehicles, items and tier-3 tokens.
  - [Proposal] Exchanging takes a few seconds, so shop zones become risky hot spots.
- **Vendor machines (Kurbağa Loncası) [Built]:** frog-guild kiosks spread over the map, about one per 0.1 km² (10 on a 1 km map, at least one per landscape). Walk up and press **V**. Two kinds, one machine in four is lucky (violet beam instead of amber). Prices and the sim results are in `docs/SHOP.md`.
  - **Normal machine:** 6 different items your class can wear. No paid refresh; the shelf rolls again by itself every 150 s and gets rarer as the match goes on (epic from minute 8, legendary from minute 16).
  - **Lucky machine:** 6 slots and the same item can show up more than once. Rarity odds follow your level and the match time together (TFT style): mostly common/rare at the start, mostly epic/legendary at max level or minute 30. Pull the lever (15 coins) to spin all 6 slots again; if three of the same item land, you win that item for free, about once every 7-8 pulls. Lever price and rarity odds are placeholders until the simulator models the machine.
  - **Repair:** both kinds repair chest and head armor (below) for 0.5 coin per lost point (rounded up to 5).
  - Sell bag items back for 30% of their price at either kind.
- **Items, 6 slots [Decided]:**

  | Slot | Effect | Variants |
  |---|---|---|
  | Weapon | Changes how you attack (style, range, damage). Class-locked | Per class |
  | Chest | Armor points, toughness and health | 3 types × common/rare/epic/legendary |
  | Feet | Move speed plus a utility, e.g. an extra dash or a trail of ice | 3 types × 4 rarities |
  | Head | Armor points plus a periodic healing or shield effect | 3 types × 4 rarities |
  | Necklace | % bonuses: damage, cooldown reduction, area size… | Has its own XP bar and levels up |
  | Ring | Same kind of % bonuses as the necklace | Has its own XP bar and levels up |

  - **Armor (Zırh) [Built 2026-11-02]:** chest and head pieces give armor points, extra health that soaks hits before your health bar (after temporary shields). It does not come back by itself: repair it at any vendor machine for coins. Light / medium / heavy: chest 15 / 25 / 35, head 10 / 15 / 20 (Noir coat 18, fedora 10), × rarity (1 / 1.2 / 1.4 / 1.6). Each piece keeps its own damage, so swapping pieces does not refill it. The older damage reduction stat is still on every armor piece, now shown as Toughness.
  - [Built] There is no out-of-combat health regen for anyone (2026-11-01); healing comes from the bandage, head pieces, lifesteal and skills.
  - [Built] The 3 armor types are light, medium and heavy. Rogue wears light, Mage and Scout light or medium, Fighter all three. Light legs add speed and a shorter dash, medium legs a wall run, heavy legs a ground slam and a ramming dash. Full tables, the Noir detective set, legendary rules and the balance report are in `docs/GEAR.md`.

## 6. Classes — shared rules [Decided]

- There are 4 classes, all reworked versions of classics: **Rogue, Mage, Fighter, Scout** (Scout replaced the old Archer).
- Each class has its own skills, passives, **1 melee weapon and 1 ranged weapon**, and its own dash. Some skills only work with one of the two weapons.
- Skills should change how you play, not just add numbers.
- [Proposal] Every class gets a readable silhouette and effect color (Rogue purple, Mage cyan, Fighter orange, Scout green) so you can tell classes apart at a distance.

---

### 6.1 Rogue

- **Weapons:**
  - Ranged: a short-range **assassination pistol** (6 bullets, hits hard).
  - Melee: **twin laser daggers**.
- **Armor and health:** light armor only. HP 125, +9 per level.
- **Passive 1 — Backstab [Decided]:** hits from behind do ×1.8 damage. "Behind" means more than 120° from where the target faces. Invisibility never grants a free Backstab; you have to actually get behind the target.
- **Passive 2 — Shadow trail (Gölge izi) [Decided, reworked]:**
  - **Dashing** leaves a copy where the dash starts (once every 8 s).
  - **Standing still for 2.5 s** makes you **faint for 10 s**. It no longer spawns a copy.
  - While faint, enemies more than 20 m away can't see you, and shots from beyond 8 m miss 50% of the time.
  - The faint state breaks when you attack, take damage, or an enemy within 8 m keeps you in sight for 1.5 s.
  - The point is an edge against long-range shooters.
- **Copies [Decided]:**
  - At most **4 copies** at once.
  - Enemies can't tell a copy from the real Rogue (same name, same health bar). Only the Rogue sees them tinted.
  - A copy dies to **2 hits**, whatever the damage.
- **Playstyles:**

  | Playstyle | Starting skill |
  |---|---|
  | Melee | Wink |
  | Ranged | Execute |
  | Deception | Copy |

- **Skills [Decided]:**

  | Skill | What it does | Tier 1 | Tier 2 | Tier 3 (token) |
  |---|---|---|---|---|
  | Invisibility | You turn invisible. Attacking breaks it, and a very close enemy sees a faint outline. Needs 2 s without dealing or taking damage | Longer duration | Longer duration | Permanently semi-faint out of combat; casting gives full invisibility |
  | Evasion | Damage reduction for a short time | Longer | Longer | Longer, plus the first 2 s are full immunity |
  | Copy (Kopya) | Leaves a fake copy. Recasting while on cooldown swaps you with the nearest copy | 1 stack | Lower cooldown | Each copy looks like another class, using a real player's name and look from the match |
  | Poison | Bullets and daggers slow and deal damage over time. Doesn't stack, only refreshes | Slow + DoT | Stronger | Poison is permanently on your weapon; casting doubles poison damage for a while |
  | Sprint | Move speed | Lower cooldown | +1 stack | Also faster attack, fire and reload |
  | Kidney shot | Short stun (melee) | Lower cooldown | Lower cooldown | Stun becomes 1 s (base ~0.55 s) |
  | Execute | Big hit that grows with the target's missing health | More damage | More damage | Cooldown resets on a kill |
  | Wink | Teleport behind the target under the crosshair (Backstab still applies) | More range, lower cooldown | More range, lower cooldown | 0.25 s stun on arrival |
  | Detonate | Blows up the copy under the crosshair, or the nearest one. 4.5 m / 5.5 m radius, 70 damage | Bigger blast, lower cooldown | Bigger blast, lower cooldown | All copies explode at once |
  | Insane | All copies run at the nearest enemy and shoot for ~30% of your damage, then fade 2 s later | More copy damage | Copies live longer | Each copy casts a random skill of the class it imitates |

- **The owner's builds** (listed in upgrade order; the last two names are the tier-3 picks):
  - **Melee:** Wink, Invisibility, Execute, Kidney shot, Detonate. Tier 3: Invisibility, Kidney shot. Sneak to the target's back while invisible.
  - **Copy:** Copy, Detonate, Insane, Invisibility, Wink. Tier 3: Copy, Detonate. Surround the target with copies, swap, then Insane and Detonate.

### 6.2 Mage

- **Theme:** a tech wizard whose power comes from **nano bots**.
- **Weapons:**
  - Ranged: a one-handed **wand** that fires lasers. It heats up with each shot and locks briefly when it overheats.
  - Melee: a long **rod** with slow, wide sweeps that push a little.
- **Health:** HP 105, +7 per level.
- **Passive 1 — Spell shield:** after 10 s out of combat, the next hit is fully blocked.
- **Passive 2 — Nano orbs:** one orb forms every 4 s and orbits you. Orbs don't attack; they are the **resource for (n) skills**. The cap grows with level: 3 at level 1, 4 at level 6, 5 at level 12.
- **Playstyles [Proposal]:**

  | Playstyle | Starting skill |
  |---|---|
  | Nano master (melee, rod) | Nano arms |
  | Laser (ranged, wand) | Laser mines |
  | Gravity (control) | Gravity |

- **Skills** (the skills are the owner's; the tiers are Claude's proposal and are implemented):

  | Skill | What it does | Tier 1 | Tier 2 | Tier 3 |
  |---|---|---|---|---|
  | Sonic boom | A cone sound wave that pushes enemies | Lower cooldown | Wider cone, more push | An enemy pushed into a wall is stunned 0.5 s |
  | Suicide bombs (n) | Orbs become small running robots that explode on enemies | More damage | One orb makes 2 robots | The blast leaves slowing nano dust |
  | Fog | A fog cloud; you stay unseen inside it even while casting | Longer | Bigger | Orbs refill twice as fast inside fog |
  | Sunray (n) | A robot that fires a strong sun beam at the target | More damage | Longer beam | When the target dies, the robot turns to the nearest enemy |
  | Nano bots (n) | Covers the target with bots for damage over time | More DoT | Longer | When the target dies, the bots jump to the nearest enemy |
  | Blink | Short teleport | More range | Lower cooldown | 2 charges |
  | Nano armor (n) | Shield 40/55/75 by tier; explodes when broken or expired for 40/65/65 | — | More shield, more blast | Each enemy hit returns 1 orb |
  | Nano arms (n) | Two robotic arms hit the nearest close enemy | 18 damage every 0.7 s for 8 s | 26 damage every 0.5 s | 30 damage every 0.4 s for 10 s; every 3rd hit stuns 0.25 s |
  | Gravity | Lift an enemy into the air, then slam them down | Longer lift | More slam damage | The slam also damages nearby enemies |
  | Laser mines | Shoot the ground with the wand to plant a mine; it doesn't hurt you | 2 at once | More damage | Mines are invisible to enemies (visual only for now) |

- **The owner's builds:**
  - **Melee:** Nano arms, Sonic boom, Fog, Nano armor, Blink. Tier 3: Nano arms, Nano armor. Go in with arms and armor on cooldown; use fog on the way in and at low health.
  - **Ranged nano:** Blink, Sunray, Nano bots, Gravity, Laser mines. Tier 3: Nano bots, Laser mines.

### 6.3 Fighter

- **Weapons:**
  - Melee: a **laser sword**.
  - Ranged: thrown tech **energy spears**. You hold 3, and they regenerate (one every 2.2 s).
    - A spear that hits **sticks in the target** (up to 8 per target) and rides along with them.
    - Spears that miss don't pile up on the ground; they fade.
- **Health:** HP 125, +8 per level.
- **Passive 1 — Shield generator:** +20 shield every 10 s, up to 40.
- **Passive 2 — Lifesteal:** heal 7% of damage dealt.
- **Playstyles:**

  | Playstyle | Starting skill |
  |---|---|
  | Dual sword (melee) | Second sword |
  | Spearman (ranged) | Spear rain |
  | Fortress (defense, [Proposal]) | Energy shield |

- **Skills** (Second sword and Spear rain are the owner's; the owner also edited Pierce, Charge and Recall; the rest are Claude's and implemented):

  | Skill | What it does | Tier 1 | Tier 2 | Tier 3 |
  |---|---|---|---|---|
  | Second sword | Draw a second sword for a while | Longer | Faster attacks | Each swing also throws a short laser wave |
  | Spear rain | Spears fall on a chosen spot | Bigger area | More damage | Spears stay a few seconds and slow anyone who walks through |
  | Energy shield | A frontal shield that blocks bullets | Longer | Tougher | Blocked damage is stored and released forward as a shock wave |
  | Chain spear | A chained spear that pulls the target to you | More range | Lower cooldown | The pulled target is slowed for 1 s |
  | Piercing spear | Pierces several enemies in a line. Pins a target that has a wall, tree or box within 3 m behind it, for 1.5 s up close down to 0.25 s at 40 m | More damage | Lower cooldown | The spear flies back to your hand and hits whoever is on the way |
  | Charge | Jet-assisted dash forward; stuns whoever you hit | More distance | Lower cooldown | A second stack (no longer stun) |
  | Jet leap | Leap into the air and slam down for area damage | More range | More damage | The slam knocks enemies up |
  | Blade whirl | Spin with the sword, hitting everyone around | Longer | More damage | You can move at full speed while spinning |
  | Overpower | More damage and lifesteal for a while | Longer | More lifesteal | Casting cleanses stuns and slows |
  | Spear recall | Pull back every spear stuck in enemies: 15 damage per stuck spear, plus damage to anyone on the return path | More damage | Lower cooldown | Returning spears slow what they hit |

- **The owner's builds:**
  - **Melee:** Second sword, Energy shield, Overpower, Blade whirl, Charge. Tier 3: Second sword, Energy shield. Close in from cover and charge.
  - **Spear:** Jet leap, Spear recall, Spear rain, Chain spear, Piercing spear. Tier 3: Spear recall, Chain spear. Throw a lot, recall, and pin enemies to walls.
- **Known open point:** in simulation the melee build is a bit strong and the spear build is behind (the issue is hitting targets, not damage). The owner left it as is for now.

### 6.4 Scout

- **World:** a post-apocalyptic, futuristic hunter with a **cybernetic wolf or hyena** companion, half animal and half machine.
- **Weapons:**
  - Melee: **claws**.
  - Ranged: a **sniper rifle** with a 4-round magazine. Damage grows while you stay scoped, from 28 to 80 over a 2 s charge; unscoped shots are weak.
- **Health:** HP 90, +6 per level.
- **Passive 1 — Companion:**
  - A wolf fights for you and takes no button.
  - It attacks the enemy you last hit with a weapon, within its range.
  - If it dies, it comes back after 20 s.
- **Passive 2 — High ground [Proposal, implemented]:** +20% damage to enemies standing lower than you. It works together with the Grappling hook.
- **Playstyles:**

  | Playstyle | Starting skill |
  |---|---|
  | Pack (companions) | Pack call |
  | Wild (claws) | Pounce |
  | Sniper | Fast charge |

- **Skills** (the first four are the owner's, and the owner edited Pack call and Switch weapons; the rest are Claude's and implemented):

  | Skill | What it does | Tier 1 | Tier 2 | Tier 3 |
  |---|---|---|---|---|
  | Switch weapons | Pull a short-range **shotgun** and fire two quick blasts forward | Base | Lower cooldown | A shotgun in each hand |
  | Grappling hook | Pull yourself to a point, e.g. up to high ground | More range | Lower cooldown | 2 charges |
  | Fast charge | Your next shot is instantly fully charged | Lower cooldown | Lower cooldown | Gives one more instant charge |
  | Smoke bomb | A damaging bomb that leaves smoke | Longer smoke | More damage | You see enemy silhouettes inside your smoke |
  | Pack call | Summon extra cyber beasts that stay until killed. Recasting off cooldown revives them all | 1 beast | 2 beasts | Also brings back the companion if it is dead, and all your creatures (you included) move faster |
  | Hunt mark | Mark an enemy: companions attack it, it shows through walls and takes extra damage | Longer | More bonus damage | When the marked enemy dies, the mark jumps to the nearest enemy |
  | Pounce | Leap at an enemy and strike with claws | More range | More damage | Knocks the target down for 0.5 s |
  | Rend | A fast claw combo that causes bleeding | More bleed | Longer combo | A bleeding enemy can't heal |
  | Scout drone | A drone that circles an area and reveals enemies | Longer | Bigger view | Marks what it sees, like Hunt mark |
  | Shock trap | A hidden trap that roots whoever steps on it | +1 trap | Longer root | The trapped enemy becomes the companion's target |

- **The owner's builds:**
  - **Claws and sniper:** Rend, Scout drone, Smoke bomb, Fast charge, Grappling hook. Tier 3: Fast charge, Rend. Play from high ground and claw anyone who comes close.
  - **Sniper and pets:** Switch weapons, Fast charge, Pack call, Hunt mark, Shock trap. Tier 3: Pack call, Switch weapons. Play on the ground, with the pack and the shotgun when someone comes close.

---

## 7. Enemies

- **Rival players:** local AI bots in single-player. They farm mobs, fight each other and you, retreat to cover at low health and level up. In the prototype a dead bot returns after 30 s; a real match will have no respawns.
- **Mobs:**
  - [Decided] Small packs, never a flood that hides the map.
  - [Proposal, 2026-11-09, survivors pivot] A spawn director (`src/horde.ts`, numbers in `HORDE` and `WAVES` in `src/balance.ts`) replaces the old "10 alive, a pack every 15 s" rule:
    - Each region has a minute-by-minute table: how many mobs to keep around the player, how often to spawn and which species (Spor Ormanı: 8 at minute 0, 14 at 2, 24 at 5, 40 at 10, 55 at 15).
    - Mobs grow out of the ground in a spore puff 28–45 m from the player, off screen when possible, 60% of the time in the half ahead of where the player is running. They chase the player (a fully invisible player shakes them off).
    - A mob left over 60 m behind, out of the fight and off screen, is moved to the ring ahead instead of being removed, so the pressure stays.
    - Events at set minutes: **ring** (mobs close in from every side, 15 m out), **stampede** (a deer herd runs straight across the player's spot; dash sideways), **elite** (a bigger, glowing mob with 8× health that drops 10× XP and sure currency).
    - A hard cap of 60 live mobs for performance. Each horde mob gives 35% of the old mob XP, because there are many more.
    - [Decided, owner 2026-11-09] A run in a region lasts **20 minutes** (`WAVES.spor.minutes`); then the director stops spawning. The end screen comes later.
    - [Decided, owner 2026-11-09] **Swarm creatures don't chase the player.** In some parts of the map they stay still inside houses (`NESTS` in `src/balance.ts`): a few nest areas are picked away from the start, and every enterable house inside one gets creatures on each floor. They only turn and bite whoever comes within reach. A nest loads when the player comes within 55 m and unloads past 110 m; killed creatures stay dead. The creature is a stand-in (a small green-tinted deer) until the owner designs it. [Proposal] the numbers.
    - Later, BG mode uses the same director, spawning along the shrinking creature ring.
  - The packs are the Spor Ormanı creatures made in Blender (`src/creatures.ts`, numbers in `MOB_SPECIES`): **antlered deer** (fast, packs of 2–4) and **giant snail** (slow and tough, hits hard, alone or in pairs). [Proposal] The species numbers are first guesses.
- **Bosses:**
  - The prototype spawns a zombie giant (slam and rock throw) at minutes 5, 13 and 21.
  - [Proposal, from the simulation] On the full map: two region bosses at minute 5, two at 11 and two at 16, then the final boss Crimson Countess at 21 with 1.3× health.
  - Late bosses must spawn inside the next safe ring, or nobody fights them.

## 8. World and regions

- **Regions [Decided]:**
  1. Mushroom region.
  2. Post-apocalyptic ruined city.
  3. Monkey settlement built in linked treetops.
  4. Desert.
  5. Not decided yet.
- **Palette:** it changes from region to region.
- **Blue puffball (Mavi puf) [Decided, numbers are first guesses]:** a small blue mushroom in Spor Ormanı. Shoot it and it bursts: its spores make a cloud that heals everyone inside (players and bots) for a few seconds, then it grows back. Numbers: `PUF` in `src/balance.ts`; code: `src/puf.ts`.
- **Effect regions [Decided]:** spores, fog and fireflies are set per region at a chosen percentage, in the map planner (`docs/MAP_PLANNER.md`, "Effect regions").
- **[Proposal] 5th region, "Crimson Cathedral" (Kızıl Katedral):**
  - A gothic cathedral-refinery kept running by old vampire nobles with nano tech, at the centre of the map, where the final ring usually closes.
  - Blood fountains heal you but briefly reveal your position to everyone.
  - A "Blood Moon" event powers up the mobs.
- **[Proposal] Region mobs and bosses:**

  | Region | Mob 1 | Mob 2 | Mob 3 | Boss |
  |---|---|---|---|---|
  | Mushroom | Spore spitter: ranged spore ball that leaves a poison cloud | Mycelium crawler: bursts from the ground in swarms and slows | Polka-dot bloater: slow, bursts into spores on death | Root Mother: roots that block areas, spawns baby mushrooms, spores block vision |
  | Ruined city | Zombie: melee swarm (in the prototype) | Scrap hound: fast, runs at gunfire | Watcher drone: flies, marks the player, calls nearby mobs | Scrap Giant: slam and rock throw (in the prototype as the zombie giant) |
  | Monkey treetops | Branch jumper: leaps between trees and attacks from above | Fruit bomber: throws exploding fruit from high up | Totem guard: shielded and slow, blocks frontal damage (a good Backstab target) | Silverback Shaman: drum rhythm buffs monkeys, breaks tree bridges |
  | Desert | Sand swimmer: moves under the sand and leaps out | Glass scorpion: poison tail, bullet-proof front shell | Mirage: faint and ghostly, appears up close and mimics your copy | Sandworm Mother: travels underground, warns with tremors, swallow attack |
  | Crimson Cathedral | Blood servant: swarms and lifesteals | Stained-glass guardian: a statue that wakes up close; breaks only from behind or with skills | Bat swarm: blocks vision, scatters and regroups | Crimson Countess: vampire lord; short teleports, blood shield, links two players so damage to one hits both |

## 9. Character creation and long-term progression [Decided]

- **Character creation:** a screen with several selectable character models, so players of the same class don't all look alike.
  - There will be **4 creature types**; the owner will send reference images.
  - Players can make small cosmetic changes.
- **Player model now:** the owner's **hippo** model, rigged with the owner's skeleton. Keep using the owner's rig; don't build a new one.
- **Class XP:** each match earns XP for the class you played. It unlocks new weapons and skills over time.
  - [Proposal] Unlocks should be side-grades (different, not stronger) plus cosmetics, so new and old players fight fairly.
- **[Proposal] Appearance is independent of class.** The class reads from its weapon, armor weight and effect color.

## 10. Art direction

- **Style [Decided]:** futuristic-fantasy, 3D.
- **Materials [Decided]:** **characters and buildings look like hand-shaped clay**: rounded, slightly imperfect forms, fingerprints, soft light. **The sky and effects are watercolor**, with paper texture and darker edges.
  - Don't put a full watercolor filter over the whole screen; fights must stay readable.
  - The implementation is in `src/look.ts`; `?look=classic` turns it off.
- **References [Decided]:** Kim Jung Gi, Moebius, Neri Oxman, Ukiyo-e, Yayoi Kusama, Xiaojing Yan, Karl Kopinski, Rembert Montald, Enki Bilal, P. Craig Russell. (The owner removed Beatrix Potter from the region pairing.)
- **[Proposal] Region–reference pairing:**
  - Mushroom: Kusama, Xiaojing Yan, Neri Oxman.
  - Ruined city: Enki Bilal, Karl Kopinski.
  - Monkey treetops: Ukiyo-e, Kim Jung Gi.
  - Desert: Moebius.
  - 5th region: Montald and P. Craig Russell.
  - Characters: Kim Jung Gi line energy and P. Craig Russell's ornate costume detail.
- **Dash animations [Decided: one per class]:**
  - Rogue: a low leaning slide.
  - Mage: an upright float with a blink (the body hides briefly).
  - Fighter: a shoulder charge.
  - Scout: a pounce.

  Each dash has its own speed, duration and color. The animations are written by `tools/hippo_blender.py` (`dash`, `dash_mage`, `dash_fighter`, `dash_scout`).
- **Concept art:** made with Artlist (the owner's account). The protagonist reference is a black-bob girl in a pink floral mecha suit, with clean Moebius/Terada linework.
- **Hit feel:** tracers, muzzle flash, recoil, camera shake, impact sparks, hit and kill markers, damage numbers, synthesized sounds.

## 11. What the prototype has, and what's next

**Done:**
- A third-person controller: aim, dash, jump, coyote time, weapon switching.
- All 4 classes, with every skill at all 3 tiers, both weapons, passives and playstyles.
- Level-up cards, XP, the tier-3 lock and token.
- Bots, Spor Ormanı creature packs (deer, snail) and the zombie giant boss.
- One ruined-city block with walkable houses (porch, stairs, balcony, roof).
- The Spor Ormanı test map with our own Blender models: mushroom houses and small-town houses you can enter, bridges, the mushroom-woman statue in its maze, the nomad camp, fantastical trees, floating rocks, and furniture inside the buildings.
- **Building scale [Decided, 2026-11-04]:** ground floor walls 4.5 m, upper floors 4.0 m, slabs 0.5 m, so a 2-storey building is 9.0 m and a 3-storey one 13.5 m inside; the roof or mushroom cap sits on top. Doors are 2.0 × 2.8 m (the hippo is 1.48 m wide), stairs are spiral, risers at most 0.3 m. Footprints grew about 15% to match. The Gaudí stained-glass house is one grand storey under tall domes; the mosaic house has two. The rules live in the Blender scripts' `olcek.py` (`/mnt/project-files/regions/evler-kat/scriptler`). **[Decided, 2026-11-09]** The five mushroom houses are placed 1.3× bigger on the map (`mushroomHouseScale` in `SPOR_MAP`), so their storeys read as about 5.9 m and 5.2 m next to the 1.90 m character; furniture inside keeps its own size.
- The clay and watercolor look.
- A playable single-file build for sharing.

The phases from here on are in [`ROADMAP.md`](ROADMAP.md); the short list below is kept for context.

**Not built yet, roughly in priority order:**
1. The full map: 5 regions, the shrinking ring, about 20 players.
2. Region mobs and bosses (§7–8).
3. Items and the 6 slots, shops or exchange zones, vehicles.
4. A character creation screen with the 4 creature types, and class XP unlocks.
5. Desktop packaging (Electron or Tauri).
6. Multiplayer, last.

## 12. Balance notes

- **The approved balance package** is in the code. A simulation of 1v1 arena duels with the owner's 8 builds gives every class a 48–53% win rate.
  - Scout was nerfed: sniper max damage 80, 2 s charge, HP 90.
  - Rogue: HP 125, Backstab 1.8×, Detonate 4.5/5.5 m for 70 damage, 4 copies.
  - Mage: HP 105, wand 13, stronger Nano arms and Nano armor scaled by tier.
  - Fighter: spear 45; spears stick in targets, and Piercing spear pins to walls based on distance.
- **2026-10-30 (owner approved):** Mage spell shield 0.6 s for 35 breath. Fighter HP 135 (+9/level), spear 50 damage, a spear returns every 1.8 s. The Fighter buff lifts Fighter's full-match win share in the sim from ~40% to ~57%, so watch it in playtests (docs/SHOP.md).
- **Rule:** after changing numbers, playtest or re-run the simulator; don't eyeball it.

## 13. Open questions and proposals waiting for the owner

- The Mage playstyles (Nano master, Laser, Gravity) and the Fighter's "Fortress" playstyle are Claude's ideas.
- Piercing spear's charge-up is an instant throw for now.
- The Mage laser mines tier 3 (invisible mines) is visual only for now.
- The 5th region and all region mobs and bosses (§8).
- Should the 2-second out-of-combat rule also apply to the Rogue's tier-3 semi-faint state?
- What drops when a player dies: currency, items?
- Final player count: is 20 enough for a 25–35 minute map?
- Currency amounts x, y and z, and the token price.
