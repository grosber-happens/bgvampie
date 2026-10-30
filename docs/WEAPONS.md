# Weapons

Every class weapon is a 3D model built in code from a small set of hand-made looking parts. Nothing is loaded from a file, so a weapon can change with the species, the item you wear and what the class is doing.

- Code: `src/armory/` (`forge.ts` parts, `designs.ts` the weapons, `species.ts` the three workshop styles, `rig.ts` hands and motion).
- Review page: `armory.html` (in dev: `/armory.html`). Buttons switch species and the named items. URL options: `?species=balcik|yamali|katip`, `&named=1`, `&only=<design>`, `&still=1`.

## The weapons

| Class | Hand | Name (TR / EN) | Model | What it shows in play |
|---|---|---|---|---|
| Rogue | ranged | Islak Sokak Tabancası / Wet Street Pistol | long duelling pistol, curved grip, banded silencer | one light per bullet on the side; they go dark as you shoot and run in a chase while reloading |
| Rogue | melee | Ay Kırığı Hançerler / Moonshard Daggers | two laser daggers, shard-shaped blades in a metal fork | hands alternate on each swing |
| Mage | ranged | Işık Kalemi / Light Pen | wand made like a fountain pen, clip, nib cage around a crystal | crystal and vent ring go from blue to orange with heat, blink red when overheated |
| Mage | melee | Fener Asası / Lantern Staff | tall staff with a lantern crown and two gyroscope rings | the Mage's nano orbs circle the lantern, one light per orb; the rings spin |
| Fighter | melee | Şafak Kılıcı / Dawn Blade | long laser blade, finned emitter like a sunrise | wide horizontal swing; the second sword appears in the left hand during Two Swords |
| Fighter | ranged | Yıldırım Mızrakları / Lightning Spears | banded spear with a leaf head of light | the spear leaves the hand on a throw and comes back; spare spears stand in the quiver on the back |
| Scout | ranged | Uzak Göz / Far Eye | long rifle, scope, muzzle brake, folded bipod | three ticks on the barrel and the scope lens fill with the scope charge |
| Scout | melee | Kedi Tırnakları / Cat Nails | gauntlet with three curved nails, per hand | punches alternate hands |
| Scout | skill | Switch weapons shotgun | sawn-off double barrel | out only during the skill; two shell lights; one in each hand at tier 3 |

Each class keeps its signature light color (Rogue rose, Mage blue, Fighter orange, Scout green) so you can tell the class from far away, whatever the species.

## Named items

Wearing the class's weapon item rebuilds that weapon with its own ornament, and a small gem in the rarity color:

| Item | Ornament |
|---|---|
| Fısıltı / Whisper | a violin scroll at the end of the silencer and two f-holes |
| İkiz Ay / Twin Moons | the right dagger gets a full-moon guard, the left one a crescent |
| Soğuk Mercek / Cold Lens | a lens of glacier ice in front of the crystal |
| Ağırlık Asası / Plumb Rod | a plumb bob of star dust hanging from the lantern |
| Uzun Işın / Longbeam | the pommel becomes a little lighthouse with a blinking lamp |
| Dörtlü Sadak / Fourfold Quiver | four oath rings around the quiver |
| Sabırlı Dürbün / Patient Scope | a brass sun shade and the sparrow sitting on the scope |
| Kanca Pençe / Hook Claws | hooked nail tips and a wolf tooth charm |

## Species

Species give no stats (docs/WORLD.md §11.2). They only decide how the weapon was made:

| Species | Materials | Proportions | Trinket |
|---|---|---|---|
| Balçık (mechanical frog) | cast brass, copper, verdigris, green leather | 15% thicker | a little pressure gauge with a glowing needle |
| Yamalı (half-mechanical human) | blackened steel, rust, canvas tape, red paint | as drawn | a crooked bolted patch and a coil of red wire |
| Kâtip (wingless insect) | bone enamel, dark chitin, violet lace wrap, gold | 15% slimmer | crossed filigree rings and a feeler with a tiny lamp |

The species is picked on the start screen (saved in the browser) or with `?species=`. The body is still the hippo for every species until the species models exist.

## In the hands

- At rest the weapon rides in the hand bone, so it swings with the run animation.
- While aiming or attacking it comes up to a ready pose and points where the camera aims, then goes back down about a second later.
- Shots kick the gun back (the rifle and shotgun harder), melee attacks swing (sword sweeps, staff smashes down, daggers slash, claws punch).
- The Rogue's decoys carry a copy of the weapon the player is holding.

## Adding a weapon

1. Write a design function in `designs.ts` with forge parts (`rod`, `turned`, `ring`, `tube`, `blade`, `box`, `ball`). +Z is forward, the origin is the hand.
2. Mark parts the game changes with `live: 'name'` and put a `socket('trinket', …)` where the species trinket should hang.
3. Add it to `LOADOUT` in `armory/index.ts` and its pose to `HOLD` in `rig.ts`.
