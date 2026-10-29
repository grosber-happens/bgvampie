# Gear, movement and the bandage

This is the design and balance record for the gear update: armor, jewels, class weapons, the Noir set, the bandage, S4 League style movement, the new UI and the painted icons. The data lives in `src/gear.ts` (pure, shared by the game and the simulator).

## Controls

| Key | Action |
| --- | --- |
| WASD | Move |
| Space | Jump. Again in the air: double jump. Against a wall in the air: wall kick (up to 3) |
| Shift (tap) | Dash. Taps chain while you have breath (SP). Dash then Space: dash-jump |
| Shift (hold) | Sprint (x1.55, drains breath) |
| Ctrl or C in the air | Ground slam (heavy legs only) |
| X | Bandage: free, 3 s channel, heals 30%, 35 s cooldown. Moving slows you to 60%. Taking a hit over 8% of max health breaks it |
| I | Bag. Click to equip, right click to unequip or drop |
| G | Last Reel (5 pieces of the Noir set) |
| Q E 1 2 3 | Skills · F: switch weapon · R: reload · Tab: cards · Esc: pause |

Medium legs let you run along walls. Light legs add an extra air jump.

## How the numbers work

- Damage reduction from armor is `armor / (armor + 100)`.
- Rarity multiplies every stat: common x1, rare x1.2, epic x1.4, legendary x1.6. Only legendary items unlock the item's unique rule (★).
- Rings and necklaces level up from 60% of the XP you earn. They level at 400, 1000, 1900 and 3200 XP. The maximum level is 3 for common, 4 for rare and 5 for epic or legendary.
- Who can wear what: Rogue wears light armor. Mage and Scout wear light or medium. Fighter wears all three. The Noir set counts as light, so every class can wear it.
- Drops: 8% of monsters, 2 items from a boss, 1 from a killed player. The bag holds 8 items.

## Items (common values)

| Name (TR / EN) | Slot | Stats | Lore |
| --- | --- | --- | --- |
| Yağmur Kukuletası / Rain Hood | head · light | Armor 3 (3% less damage); +4 health; Heal 5% of max health every 14 s; (Legendary: See faded and invisible enemies within 10 m) | Nobody looks at your face on wet streets. The hood knows it. |
| Tül Ceket / Gossamer Jacket | chest · light | Armor 4 (4% less damage); +6 health; +1% speed; +3% damage; +3% attack speed; (Legendary: Below 30% health: +30% speed for 3 s (60 s)) | A tailor robot's last work: the seams still breathe. |
| Kedi Adımı / Catstep Boots | legs · light | Armor 3 (3% less damage); +3 health; +6% speed; -20% dash cooldown; (Legendary: A second dash charge) | The soles were copied from a cat. The cat is still thinking of suing. |
| Müfettiş Vizörü / Inspector's Visor | head · medium | Armor 5 (5% less damage); +8 health; -15% bandage cooldown; +10% bandage healing; (Legendary: Bandaging is 40% faster) | Old cases still reflect in the glass. Sometimes one of them waves. |
| Örgü Yelek / Weave Vest | chest · medium | Armor 8 (7% less damage); +12 health; -6% skill cooldowns; (Legendary: The bandage also gives 25 shield) | Knitted from nano wire. Bullets get in, then are politely asked to leave. |
| Kaldırım Botları / Pavement Boots | legs · medium | Armor 5 (5% less damage); +8 health; +2% speed; -10% dash cooldown; (Legendary: Dashing leaves ice that slows enemies 35%) | They know every stone in the city. Especially the loose ones. |
| Dökme Miğfer / Cast Helm | head · heavy | Armor 7 (7% less damage); +6 health; -10% stun and slow time; A shield of 8% max health every 20 s; (Legendary: The guard shield is twice as big) | Cast in the Red Cathedral's old bell mould. It still hums inside. |
| Çan Göğüslüğü / Bell Cuirass | chest · heavy | Armor 10 (9% less damage); +12 health; -3% speed; -4% attack speed; (Legendary: 15% less damage from the front) | It rings one note when struck. Its owner learns to love that note. |
| Kazık Dizlikler / Stake Greaves | legs · heavy | Armor 6 (6% less damage); +6 health; -5% speed; +20% dash cooldown; -25% stun and slow time; (Legendary: The dash knocks enemies back and stuns 0.4 s) | When it steps, the ground gives a little. Out of respect. |
| Kor Madalyonu / Ember Locket | necklace | +5% damage | A match flame is kept inside. They say its owner goes out with it. |
| Geri Sayan Saat / Backward Watch | necklace | -6% skill cooldowns | Its hand turns backward. Nobody knows how often it was wound. |
| Kırık Hale / Broken Halo | necklace | +4% damage; +15% area | It fell from a saint's statue. It widens the empty space around it. |
| Nabız Kolyesi / Pulse Chain | necklace | +6% max health | It beats with your heart. When you tire, it beats faster. |
| Kan Mührü / Blood Seal | ring | 3.0% lifesteal | Seal of the Cathedral counts. Every hit takes a sip and gives one back. |
| Çakmaktaşı / Flint Band | ring | +4% attack speed | A spark waits on your finger. It pulls the trigger, not you. |
| Gölge Halkası / Shadow Loop | ring | +2% speed; -8% dash cooldown | Your shadow walks one step ahead. You run to keep up. |
| Terzi Yüksüğü / Tailor's Thimble | ring | -12% bandage cooldown; +10% bandage healing | A wound is only sewing, said Nuran the Blind Tailor. |
| Fısıltı / Whisper | weapon · rogue | +14% damage with ranged in hand; +1 magazine; (Legendary: The last shot of a magazine deals double) | A violin maker built the silencer. Each shot sounds like an apology. |
| İkiz Ay / Twin Moons | weapon · rogue | +3% attack speed; +0.05x backstab; (Legendary: Backstabs slow 40% for 1 s) | One full, one crescent. They never cut on the same night. |
| Soğuk Mercek / Cold Lens | weapon · mage | +12% damage with ranged in hand; -20% wand heat; (Legendary: Every 5th bolt jumps to a second enemy) | The lens was cut from a glacier's eye. The laser is ashamed to heat up. |
| Ağırlık Asası / Plumb Rod | weapon · mage | +18% damage with melee in hand; +0.3 m melee reach; (Legendary: Rod hits make nano orbs 30% faster) | A pinch of neutron star dust at the tip. The rod walks, not you. |
| Dörtlü Sadak / Fourfold Quiver | weapon · fighter | +20% damage with ranged in hand; +1 spear; (Legendary: Spears pierce one more enemy) | Four spears, four oaths. All of them come home to one hand. |
| Uzun Işın / Longbeam | weapon · fighter | +0.3 m melee reach; (Legendary: Every 4th swing sends a 15 damage wave) | Its light was borrowed from a lighthouse. Ships still look for it. |
| Sabırlı Dürbün / Patient Scope | weapon · scout | +18% damage with ranged in hand; -20% scope charge time; (Legendary: Full-charge hits mark for 4 s (+10% damage taken)) | Its maker watched one sparrow for forty years. The scope remembers. |
| Kanca Pençe / Hook Claws | weapon · scout | +20% damage with melee in hand; +5% attack speed; (Legendary: Your companion deals 25% more) | Cast from your wolf's own claw. You two bleed from the same place. |
| Tanığın Fötrü / Witness's Fedora | head · light | Armor 3 (3% less damage); +5 health; Heal 4% of max health every 16 s | Rain never stops falling from its brim. A witness's last sentence is recorded inside. |
| Uzun Palto / The Long Coat | chest · light | Armor 5 (5% less damage); +8 health; -4% skill cooldowns | An unopened letter in the pocket. Address: tomorrow. |
| Sessiz Kunduralar / Quiet Oxfords | legs · light | Armor 3 (3% less damage); +4 health; +5% speed; -12% dash cooldown | They leave no print on wet stone. Only once, on a murder night. |
| Rozet Yüzüğü / Badge Ring | ring | +3% damage; 1.5% lifesteal | When the Night Precinct closed, the badges were melted. One escaped as a ring. |
| Kayıp Kişi Madalyonu / Missing Person Locket | necklace | +2% damage; -4% skill cooldowns | The photo inside fades a little each time. Nobody knows whose face it is. |

The Noir set ("Gece Karakolu") bonuses: with 2 pieces, marked targets take +6% damage and marks last 6 s. With 3 pieces, hits deal +20% to targets that have not fought for 3 s. With 5 pieces you unlock Last Reel on G: for 5 s the screen turns black and white, and you get +20% damage and +15% speed (60 s cooldown).

### Legendary rules that are simplified in the game

The simulator models all of them. In the playable game:
- **Not in the game yet:** Whisper (`lastBullet`, the last shot of a magazine deals double), Twin Moons (`moonCut`, backstabs slow), Fourfold Quiver (`longQuiver`, spears pierce one more enemy).
- **Simplified:** Frost Trail (`frostTrail`) leaves a short slow zone and is not modelled in the simulator.

## Balance (headless simulator, `sim/gear-test.ts`)

Each number is a 1v1 duel win rate against all opponents.

| | Rogue | Mage | Fighter | Scout |
| --- | --- | --- | --- | --- |
| No gear | 49% | 48% | 54% | 49% |
| Natural epic gear | 54% | 46% | 54% | 46% |

By build, with gear: Rogue melee 62%, Rogue clone 46%, Mage melee 43%, Mage ranged 49%, Fighter melee 67%, Fighter ranged 42%, Scout claws 45%, Scout pet 46%. Fighter by armor weight: light 62%, medium 67%, heavy 71%. Heavy armor wins duels, but it pays with movement: no double jump, slower dashes and -5% speed. In the simulator, movement only shows up as a dodge factor.

Rarity: legendary beats common 73% of the time, epic beats rare 58%, and a common set beats no gear 85%. An average duel lasts 12.2 s.

Full matches (50 per row, 20 players with 5 per class, drops on):

| Gear | Bandage | Length | Rogue | Mage | Fighter | Scout |
| --- | --- | --- | --- | --- | --- | --- |
| off | off | 25.9 min | 32% | 38% | 22% | 8% |
| off | on | 24.3 min | 28% | 22% | 46% | 4% |
| on | off | 26.4 min | 20% | 30% | 44% | 6% |
| on | on | 27.6 min | 28% | 32% | 40% | 0% |

Matches stay in the 25 to 35 minute target. With 50 matches per row the class shares move by about ±10 points, so treat them as rough. Scout wins few full matches even without gear or the bandage. The bot AI plays the pet and the sniper badly in crowds, so this is a simulator limit more than a gear problem. Each player bandages about 0.6 times per match, and about a quarter of those get broken.

How to run: `TUNED=1 node --experimental-strip-types --no-warnings sim/gear-test.ts` (env flags `GEAR`, `BANDAGE`, `DROPS`, `ONLY=A,B,C,D`).

## Skill name variants

The game uses version A (in `src/i18n.ts`). B and C are alternatives with the same mood, to swap in if one reads better.

| Skill | A (game) | B | C |
| --- | --- | --- | --- |
| invis | Hiç Kimse / Nobody | Boş Palto / Empty Coat | Kimsenin Gölgesi / No One's Shadow |
| evasion | Rüzgâra Eğilmek / Bend with the Wind | Yağmurda Dans / Dancing in Rain | Söğüt Gibi / Like a Willow |
| decoy | İkizim Yalan Söyler / My Twin Lies | Aynadaki Tanık / The Mirror Witness | Yedek Ben / The Spare Me |
| poison | Tatlı Son / Sweet Ending | Son Kadeh / The Last Glass | Bal ve Pas / Honey and Rust |
| sprint | Son Tren / The Last Train | Kaçak Yolcu / Stowaway | Gece Seferi / Night Run |
| kidney | Kısa Bir Nefes / Short of Breath | Yarım Cümle / Half a Sentence | Durgun An / A Still Moment |
| execute | Son Söz / Last Word | Hesap Günü / Reckoning | Kapanış Repliği / Closing Line |
| wink | Göz Kırpımı / A Wink | Arka Kapı / Back Door | Omzunun Üstünden / Over Your Shoulder |
| detonate | Veda Mektubu / Farewell Letter | Yanık Zarf / Burnt Envelope | Mühürlü Veda / Sealed Goodbye |
| insane | Aynalar Ayaklanınca / When Mirrors Riot | Kalabalık Benim / I Am the Crowd | Kırık Aynalar Korosu / Choir of Broken Mirrors |
| sonic | Gök Gürültüsünün Adı / The Name of Thunder | Çan Sesi / The Bell | Dalga Boyu / Wavelength |
| bombs | Küçük Fedailer / Little Martyrs | Kurşun Askerler / Tin Soldiers | Saat Kurmalı Kahramanlar / Clockwork Heroes |
| fog | Unutkan Sis / Forgetful Fog | Silik Hatıra / Faded Memory | Puslu Tanıklık / Hazy Testimony |
| sunray | Öğle Duası / Noon Prayer | Güneşin Elçisi / Envoy of the Sun | Büyüteç / Magnifying Glass |
| nanobots | Fısıldayan Pas / Whispering Rust | Görünmez Karınca / Invisible Ants | Sabırlı Çürüme / Patient Decay |
| blink | Adres Değişikliği / Change of Address | Bir Adım Ötede / One Step Away | Kayıp Dakika / The Lost Minute |
| armor | Gümüş Kabuk / Silver Shell | Cam Fanus / Bell Jar | İnci Zırh / Pearl Shell |
| arms | Ödünç Eller / Borrowed Hands | Yabancı Kollar / Stranger's Arms | Dört Elle / With Four Hands |
| gravity | Elmanın Düştüğü Yer / Where the Apple Falls | Ağır Gerçek / Heavy Truth | Newton'un Öfkesi / Newton's Temper |
| mines | Sabırlı Işıklar / Patient Lights | Uykudaki Yıldızlar / Sleeping Stars | Eşikteki Lamba / Lamp on the Sill |
| second | Kız Kardeş Kılıç / Sister Blade | İkinci Yemin / Second Oath | Çifte Şafak / Double Dawn |
| rain | Demir Muson / Iron Monsoon | Gökten Hüküm / Verdict from Above | Mızrak Yağmuru / Spear Rain |
| eshield | Kapalı Kapı / A Closed Door | Sur / The Rampart | Hayır Diyen Duvar / The Wall That Says No |
| chain | Eve Dönüş / Bring Them Home | Olta / The Line | Zincirli Davet / Chained Invitation |
| pierce | Mıh / The Nail | Duvara Asılı / Pinned to the Wall | Tek Satır / One Line |
| charge | Boğa Yemini / The Bull's Oath | Kör Hücum / Blind Rush | Lokomotif / Locomotive |
| leap | Çatıdaki Adam / Man on the Roof | Düşen Yıldız / Falling Star | Kiremit Yağmuru / Tile Rain |
| whirl | Semazen / The Whirling Saint | Pervane / Propeller | Kasırga Kalbi / Heart of the Storm |
| overpower | Bir Kez Daha / Once More, Harder | İnat / Stubborn | Son Raunt / Last Round |
| recall | Mızraklar Eve / Spears, Come Home | Sadık Demir / Loyal Iron | Geri Dönen Sözler / Words That Return |
| shotgun | Kapı Tokmağı / Door Knocker | Komşu Ziyareti / A Neighbor Calls | İki Kere Çal / Knock Twice |
| hook | Bulutlara Tutunmak / Hold on to the Clouds | Çatı Katı / Penthouse | Gökyüzü Oltası / Sky Hook |
| fast | Nefesini Tut / Hold Your Breath | Tek Atış / One Shot | Sessiz Nişan / Quiet Aim |
| smoke | Tütsü / Incense | Duman Perdesi / Smoke Curtain | Sisli Dua / Misty Prayer |
| pack | Gece Vardiyası / Night Shift | Sürü / The Pack | Demir Dişler / Iron Teeth |
| hunt | Kokuyu Al / Take the Scent | İz Sürücü / Tracker | Kırmızı İp / Red String |
| pounce | Yukarıdan Selam / Hello from Above | Damdan Düşen / Off the Roof | Kartal Bakışı / Eagle's Glance |
| rend | Kâğıt Kesiği / Paper Cut | Kırk Çizik / Forty Scratches | Kedi Yazısı / Cat Handwriting |
| drone | Gökteki Tanık / Witness in the Sky | Uçan Göz / Flying Eye | Bekçi Kuş / Watchbird |
| trap | Kapı Eşiği / The Doorstep | Kurt Kapanı / Wolf Snare | Paspas Altı / Under the Mat |

## Art (Artlist)

- All icons and the title poster were made with Nano Banana 2 at 512 px (60 credits each), after a cheaper z-image Turbo test that came out too generic. About 950 credits were used in total.
- Larger outputs (2K) come back only as download links, and the sandbox's network policy blocks the Artlist download hosts. That is why everything is 512 px sheets. To get 2K art, allow `cms-toolkit-artifacts.artlist.io`, `ai-toolkit-generations.imgix.net` and `mcp.artlist.io` in the environment's network settings.
- The sheets are in `tools/art/sheets/` and the prompts are in `tools/art/prompts.json`. `python3 tools/art/cut.py` cuts them into `public/art/items`, `public/art/skills` and `public/art/ui` and writes `public/art/index.json`. The game shows a painted icon when one exists and falls back to the ink SVG icon when it does not.
