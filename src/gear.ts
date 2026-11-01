/**
 * Gear: armor (head, chest, legs) in three weights, necklaces and rings that level up,
 * class weapons, the noir set and the bandage. Pure data and math, no Babylon imports,
 * so the balance simulator (sim/) uses the same numbers as the game.
 *
 * Armor turns into damage reduction with armor / (armor + 100): 15 armor = 13%, 36 = 26%, 66 = 40%.
 * Numbers were tuned with the simulator (sim/gear-test.ts, report in docs/GEAR.md).
 */

export type Lang = 'tr' | 'en';
export type Txt = Record<Lang, string>;
export type ClassId = 'rogue' | 'mage' | 'fighter' | 'scout';
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';
export type Weight = 'light' | 'medium' | 'heavy';
export type Slot = 'weapon' | 'head' | 'chest' | 'legs' | 'necklace' | 'ring';
export const SLOTS: Slot[] = ['weapon', 'head', 'chest', 'legs', 'necklace', 'ring'];
export const RARITIES: Rarity[] = ['common', 'rare', 'epic', 'legendary'];

/** Every number gear can change. Shares are fractions (0.05 = 5%). */
export type Stats = {
  armor: number;
  hp: number;
  /** Max health share. */
  hpPct: number;
  /** Run speed share (negative = slower). */
  speed: number;
  /** Dash cooldown share (negative = shorter). */
  dashCd: number;
  /** All damage dealt. */
  dmg: number;
  /** Damage while the melee / ranged weapon is in hand (skills included). */
  meleeDmg: number;
  rangedDmg: number;
  /** Attack speed share. */
  atkSpeed: number;
  /** Skill cooldown reduction share. */
  cdr: number;
  /** Area radius share (explosions, sweeps, zones). */
  aoe: number;
  lifesteal: number;
  /** Stun and slow durations are cut by this share. */
  tenacity: number;
  /** Bandage: cooldown share (negative = shorter) and healing share. */
  bandageCd: number;
  bandageHeal: number;
  /** Head pieces: heal `regenPct` of max health every `regenEvery` s (0 = off). */
  regenEvery: number;
  regenPct: number;
  /** Heavy head: a shield of `guardPct` max health every `guardEvery` s. */
  guardEvery: number;
  guardPct: number;
  /** Weapon numbers. */
  mag: number;
  heat: number;
  charge: number;
  reach: number;
  backstab: number;
  spears: number;
  /** Movement from leg pieces: seconds of wall running, or a ground slam from the air. */
  wallRun: number;
  slam: number;
};

export const ZERO: Stats = {
  armor: 0, hp: 0, hpPct: 0, speed: 0, dashCd: 0, dmg: 0, meleeDmg: 0, rangedDmg: 0, atkSpeed: 0, cdr: 0, aoe: 0,
  lifesteal: 0, tenacity: 0, bandageCd: 0, bandageHeal: 0, regenEvery: 0, regenPct: 0, guardEvery: 0, guardPct: 0, mag: 0, heat: 0,
  charge: 0, reach: 0, backstab: 0, spears: 0, wallRun: 0, slam: 0,
};

/** Keys that rarity scales. Penalties (negative speed, longer dash) and timers stay the same. */
const SCALES: (keyof Stats)[] = ['armor', 'hp', 'hpPct', 'dmg', 'meleeDmg', 'rangedDmg', 'atkSpeed', 'cdr', 'aoe', 'lifesteal', 'tenacity', 'bandageHeal', 'regenPct', 'guardPct', 'backstab'];
/** Rarity multiplier for the numbers above. */
export const RARITY_MULT: Record<Rarity, number> = { common: 1, rare: 1.2, epic: 1.4, legendary: 1.6 };
export const RARITY_COLOR: Record<Rarity, string> = { common: '#c9c2b2', rare: '#5fb4d9', epic: '#c58cf0', legendary: '#f2b33d' };
export const RARITY_NAME: Record<Rarity, Txt> = {
  common: { tr: 'Sıradan', en: 'Common' },
  rare: { tr: 'Nadir', en: 'Rare' },
  epic: { tr: 'Destansı', en: 'Epic' },
  legendary: { tr: 'Efsanevi', en: 'Legendary' },
};
export const WEIGHT_NAME: Record<Weight, Txt> = {
  light: { tr: 'Hafif', en: 'Light' },
  medium: { tr: 'Orta', en: 'Medium' },
  heavy: { tr: 'Ağır', en: 'Heavy' },
};
export const SLOT_NAME: Record<Slot, Txt> = {
  weapon: { tr: 'Silah', en: 'Weapon' },
  head: { tr: 'Baş', en: 'Head' },
  chest: { tr: 'Gövde', en: 'Chest' },
  legs: { tr: 'Bacak', en: 'Legs' },
  necklace: { tr: 'Kolye', en: 'Necklace' },
  ring: { tr: 'Yüzük', en: 'Ring' },
};

/** Which armor weights a class can wear (Rogue: light only, user rule). Set pieces fit everyone. */
export const WEARS: Record<ClassId, Weight[]> = {
  rogue: ['light'],
  mage: ['light', 'medium'],
  scout: ['light', 'medium'],
  fighter: ['light', 'medium', 'heavy'],
};

/** Ground slam (heavy legs): in the air press Space again or Ctrl to drop and hit everything in `radius`. Damage is the item's `slam`. */
export const SLAM = { radius: 3.5, slow: 0.4, slowTime: 1.2, cd: 6, fallSpeed: 30 };
/** Wall run (medium legs): run along a wall you touch in the air, for up to the item's `wallRun` seconds. */
export const WALL_RUN = { speed: 9.5, gravity: 4, jumpOff: 9 };

/** A legendary piece's own rule. The game and the sim read these ids. */
export type Unique =
  | 'frostTrail' // medium legs: dashing leaves ice that slows enemies 35%
  | 'ramDash' // heavy legs: the dash knocks enemies back and stuns 0.4 s
  | 'secondWind' // light chest: under 30% health, 3 s of +30% speed (60 s)
  | 'stitchedLining' // medium chest: the bandage also gives 25 shield
  | 'bulwark' // heavy chest: 15% less damage from the front... modelled as 6% DR
  | 'clearSight' // light head: see faded and invisible enemies within 10 m
  | 'nurse' // medium head: pills cast 40% faster
  | 'ironCrown' // heavy head: the guard shield is twice as big
  | 'lastBullet' // rogue gun: the last shot of a magazine deals double
  | 'moonCut' // rogue daggers: backstabs slow 40% for 1 s
  | 'chainBolt' // mage wand: every 5th bolt jumps to a second enemy
  | 'orbPress' // mage rod: rod hits make orbs 30% faster
  | 'longQuiver' // fighter spears: thrown spears pierce one more enemy
  | 'tideBlade' // fighter sword: every 4th swing sends a 15 damage wave
  | 'markShot' // scout sniper: full-charge hits mark (+10% damage taken, 4 s)
  | 'packClaw'; // scout claws: the companion deals +25%

export type ItemDef = {
  id: string;
  slot: Slot;
  /** Armor only. */
  weight?: Weight;
  /** Weapons only. */
  cls?: ClassId;
  /** Which hand the weapon item upgrades. */
  hand?: 'melee' | 'ranged';
  /** Part of the noir set. */
  set?: 'noir';
  name: Txt;
  /** One line of world text. */
  lore: Txt;
  stats: Partial<Stats>;
  unique?: { id: Unique; text: Txt };
  /** Necklaces and rings: extra per jewel level above 1. */
  perLevel?: Partial<Stats>;
  /** Short icon key for the hand-drawn icon and the Artlist prompt. */
  icon: string;
};

// ---- Armor ------------------------------------------------------------------------
/**
 * Light (Tül): little armor, speed and a shorter dash, small self-heal.
 * Medium (Örgü): balanced, cooldowns and a better bandage.
 * Heavy (Döküm): lots of armor and health, slower, longer dash, shrugs off stuns.
 */
export const ARMOR: ItemDef[] = [
  // Light
  {
    id: 'l_head', slot: 'head', weight: 'light', icon: 'hood',
    name: { tr: 'Yağmur Kukuletası', en: 'Rain Hood' },
    lore: { tr: 'Islak sokaklarda kimse yüzüne bakmaz. Kukuleta da bunu bilir.', en: 'Nobody looks at your face on wet streets. The hood knows it.' },
    stats: { armor: 3, hp: 4, regenEvery: 14, regenPct: 0.05 },
    unique: { id: 'clearSight', text: { tr: '10 m içindeki silik ve görünmez rakipleri görürsün', en: 'See faded and invisible enemies within 10 m' } },
  },
  {
    id: 'l_chest', slot: 'chest', weight: 'light', icon: 'coat',
    name: { tr: 'Tül Ceket', en: 'Gossamer Jacket' },
    lore: { tr: 'Bir terzi robotun son işi: dikişleri hâlâ nefes alıyor.', en: "A tailor robot's last work: the seams still breathe." },
    stats: { armor: 4, hp: 6, atkSpeed: 0.03, dmg: 0.03, speed: 0.01 },
    unique: { id: 'secondWind', text: { tr: 'Canın %30 altına inince 3 sn +%30 hız (60 sn)', en: 'Below 30% health: +30% speed for 3 s (60 s)' } },
  },
  {
    id: 'l_legs', slot: 'legs', weight: 'light', icon: 'boots_light',
    name: { tr: 'Kedi Adımı', en: 'Catstep Boots' },
    lore: { tr: 'Taban kaplaması bir kedi pençesinden kopyalandı. Kedi hâlâ dava açmayı düşünüyor.', en: 'The soles were copied from a cat. The cat is still thinking of suing.' },
    stats: { armor: 3, hp: 3, speed: 0.06, dashCd: -0.2 },
  },
  // Medium
  {
    id: 'm_head', slot: 'head', weight: 'medium', icon: 'visor',
    name: { tr: 'Müfettiş Vizörü', en: "Inspector's Visor" },
    lore: { tr: 'Camında eski davaların yansıması kalmış. Bazen biri el sallıyor.', en: 'Old cases still reflect in the glass. Sometimes one of them waves.' },
    stats: { armor: 5, hp: 8, bandageCd: -0.15, bandageHeal: 0.1 },
    unique: { id: 'nurse', text: { tr: 'Pills %40 daha hızlı içilir', en: 'Pills cast 40% faster' } },
  },
  {
    id: 'm_chest', slot: 'chest', weight: 'medium', icon: 'vest',
    name: { tr: 'Örgü Yelek', en: 'Weave Vest' },
    lore: { tr: 'Nano tellerle örüldü. Kurşun girer, ama kibarca geri çıkması rica edilir.', en: 'Knitted from nano wire. Bullets get in, then are politely asked to leave.' },
    stats: { armor: 8, hp: 12, cdr: 0.06 },
    unique: { id: 'stitchedLining', text: { tr: 'Pills ayrıca 25 kalkan verir', en: 'Pills also give 25 shield' } },
  },
  {
    id: 'm_legs', slot: 'legs', weight: 'medium', icon: 'boots_medium',
    name: { tr: 'Kaldırım Botları', en: 'Pavement Boots' },
    lore: { tr: 'Şehrin her taşını ezbere bilir. Kayan taşları özellikle.', en: 'They know every stone in the city. Especially the loose ones.' },
    stats: { armor: 5, hp: 8, speed: 0.02, dashCd: -0.1, wallRun: 1.2 },
    unique: { id: 'frostTrail', text: { tr: 'Dash arkanda buz bırakır, rakipleri %35 yavaşlatır', en: 'Dashing leaves ice that slows enemies 35%' } },
  },
  // Heavy
  {
    id: 'h_head', slot: 'head', weight: 'heavy', icon: 'helm',
    name: { tr: 'Dökme Miğfer', en: 'Cast Helm' },
    lore: { tr: 'Kızıl Katedral’in eski çan döküm kalıbından. İçinde hâlâ uğultu var.', en: "Cast in the Red Cathedral's old bell mould. It still hums inside." },
    stats: { armor: 7, hp: 6, guardEvery: 20, guardPct: 0.08, tenacity: 0.1 },
    unique: { id: 'ironCrown', text: { tr: 'Koruma kalkanı iki kat büyük', en: 'The guard shield is twice as big' } },
  },
  {
    id: 'h_chest', slot: 'chest', weight: 'heavy', icon: 'plate',
    name: { tr: 'Çan Göğüslüğü', en: 'Bell Cuirass' },
    lore: { tr: 'Vurulduğunda tek bir nota çalar. Sahibi o notayı sevmeyi öğrenir.', en: 'It rings one note when struck. Its owner learns to love that note.' },
    stats: { armor: 10, hp: 12, speed: -0.03, atkSpeed: -0.04 },
    unique: { id: 'bulwark', text: { tr: 'Önden gelen hasar %15 azalır', en: '15% less damage from the front' } },
  },
  {
    id: 'h_legs', slot: 'legs', weight: 'heavy', icon: 'greaves',
    name: { tr: 'Kazık Dizlikler', en: 'Stake Greaves' },
    lore: { tr: 'Yere bastığında yer biraz geri çekilir. Saygıdan.', en: 'When it steps, the ground gives a little. Out of respect.' },
    stats: { armor: 6, hp: 6, speed: -0.05, dashCd: 0.2, tenacity: 0.25, slam: 30 },
    unique: { id: 'ramDash', text: { tr: 'Dash önündekini geri iter ve 0.4 sn sersemletir', en: 'The dash knocks enemies back and stuns 0.4 s' } },
  },
];

// ---- Necklaces and rings ------------------------------------------------------------
/** Jewels gain this share of the character's XP. */
export const JEWEL_XP_SHARE = 0.6;
/** Total jewel XP for levels 2, 3, 4, 5. */
export const JEWEL_LEVELS = [400, 1000, 1900, 3200];
/** Highest jewel level per rarity; legendary jewels start at level 2. */
export const JEWEL_MAX: Record<Rarity, number> = { common: 3, rare: 4, epic: 5, legendary: 5 };

export const JEWELS: ItemDef[] = [
  {
    id: 'n_ember', slot: 'necklace', icon: 'ember',
    name: { tr: 'Kor Madalyonu', en: 'Ember Locket' },
    lore: { tr: 'İçinde bir kibrit alevi saklı. Söndüğü gün sahibi de sönecek, derler.', en: 'A match flame is kept inside. They say its owner goes out with it.' },
    stats: { dmg: 0.05 }, perLevel: { dmg: 0.0125 },
  },
  {
    id: 'n_clock', slot: 'necklace', icon: 'clock',
    name: { tr: 'Geri Sayan Saat', en: 'Backward Watch' },
    lore: { tr: 'Akrebi geriye döner. Kimse kaç kez kurulduğunu bilmiyor.', en: 'Its hand turns backward. Nobody knows how often it was wound.' },
    stats: { cdr: 0.06 }, perLevel: { cdr: 0.015 },
  },
  {
    id: 'n_halo', slot: 'necklace', icon: 'halo',
    name: { tr: 'Kırık Hale', en: 'Broken Halo' },
    lore: { tr: 'Bir azizin heykelinden düştü. Etrafındaki boşluğu büyütür.', en: "It fell from a saint's statue. It widens the empty space around it." },
    stats: { aoe: 0.15, dmg: 0.04 }, perLevel: { aoe: 0.03, dmg: 0.005 },
  },
  {
    id: 'n_pulse', slot: 'necklace', icon: 'heart',
    name: { tr: 'Nabız Kolyesi', en: 'Pulse Chain' },
    lore: { tr: 'Kalbinle aynı anda atar. Sen yorulunca o hızlanır.', en: 'It beats with your heart. When you tire, it beats faster.' },
    stats: { hpPct: 0.06 }, perLevel: { hpPct: 0.015 },
  },
  {
    id: 'r_blood', slot: 'ring', icon: 'drop',
    name: { tr: 'Kan Mührü', en: 'Blood Seal' },
    lore: { tr: 'Katedral kontlarının mührü. Her vuruşta bir yudum alır, bir yudum verir.', en: 'Seal of the Cathedral counts. Every hit takes a sip and gives one back.' },
    stats: { lifesteal: 0.03 }, perLevel: { lifesteal: 0.0075 },
  },
  {
    id: 'r_flint', slot: 'ring', icon: 'flint',
    name: { tr: 'Çakmaktaşı', en: 'Flint Band' },
    lore: { tr: 'Parmağında kıvılcım bekler. Tetiği sen değil, o çeker.', en: 'A spark waits on your finger. It pulls the trigger, not you.' },
    stats: { atkSpeed: 0.04 }, perLevel: { atkSpeed: 0.01 },
  },
  {
    id: 'r_shadow', slot: 'ring', icon: 'moon',
    name: { tr: 'Gölge Halkası', en: 'Shadow Loop' },
    lore: { tr: 'Gölgen bir adım önde yürür. Yetişmek için koşarsın.', en: 'Your shadow walks one step ahead. You run to keep up.' },
    stats: { dashCd: -0.08, speed: 0.02 }, perLevel: { dashCd: -0.02 },
  },
  {
    id: 'r_stitch', slot: 'ring', icon: 'needle',
    name: { tr: 'Terzi Yüksüğü', en: "Tailor's Thimble" },
    lore: { tr: 'Yara da bir dikiş işidir, derdi Kör Terzi Nuran.', en: 'A wound is only sewing, said Nuran the Blind Tailor.' },
    stats: { bandageCd: -0.12, bandageHeal: 0.1 }, perLevel: { bandageCd: -0.03 },
  },
];

// ---- Class weapons --------------------------------------------------------------------
/** Each class has an upgrade for its melee and its ranged weapon. */
export const WEAPONS: ItemDef[] = [
  {
    id: 'w_rogue_r', slot: 'weapon', cls: 'rogue', hand: 'ranged', icon: 'pistol',
    name: { tr: 'Fısıltı', en: 'Whisper' },
    lore: { tr: 'Susturucusu bir keman ustasının işi. Atış sesi bir özür gibi.', en: 'A violin maker built the silencer. Each shot sounds like an apology.' },
    stats: { rangedDmg: 0.14, mag: 1 },
    unique: { id: 'lastBullet', text: { tr: 'Şarjörün son mermisi çift hasar verir', en: 'The last shot of a magazine deals double' } },
  },
  {
    id: 'w_rogue_m', slot: 'weapon', cls: 'rogue', hand: 'melee', icon: 'daggers',
    name: { tr: 'İkiz Ay', en: 'Twin Moons' },
    lore: { tr: 'Biri dolunay, biri hilal. İkisi aynı gece kesmez.', en: 'One full, one crescent. They never cut on the same night.' },
    stats: { atkSpeed: 0.03, backstab: 0.05 },
    unique: { id: 'moonCut', text: { tr: 'Arkadan vuruşlar 1 sn %40 yavaşlatır', en: 'Backstabs slow 40% for 1 s' } },
  },
  {
    id: 'w_mage_r', slot: 'weapon', cls: 'mage', hand: 'ranged', icon: 'wand',
    name: { tr: 'Soğuk Mercek', en: 'Cold Lens' },
    lore: { tr: 'Merceği bir buzul gözünden kesildi. Lazer ısınmaya utanır.', en: "The lens was cut from a glacier's eye. The laser is ashamed to heat up." },
    stats: { rangedDmg: 0.12, heat: -0.2 },
    unique: { id: 'chainBolt', text: { tr: 'Her 5. atış ikinci bir rakibe sıçrar', en: 'Every 5th bolt jumps to a second enemy' } },
  },
  {
    id: 'w_mage_m', slot: 'weapon', cls: 'mage', hand: 'melee', icon: 'rod',
    name: { tr: 'Ağırlık Asası', en: 'Plumb Rod' },
    lore: { tr: 'Ucunda bir avuç nötron yıldızı tozu. Taşıyan değil, asa yürür.', en: 'A pinch of neutron star dust at the tip. The rod walks, not you.' },
    stats: { meleeDmg: 0.18, reach: 0.3 },
    unique: { id: 'orbPress', text: { tr: 'Asa vuruşları nano küreleri %30 hızlı doldurur', en: 'Rod hits make nano orbs 30% faster' } },
  },
  {
    id: 'w_fighter_r', slot: 'weapon', cls: 'fighter', hand: 'ranged', icon: 'quiver',
    name: { tr: 'Dörtlü Sadak', en: 'Fourfold Quiver' },
    lore: { tr: 'Dört mızrak, dört yemin. Hepsi aynı kişiye geri döner.', en: 'Four spears, four oaths. All of them come home to one hand.' },
    stats: { rangedDmg: 0.2, spears: 1 },
    unique: { id: 'longQuiver', text: { tr: 'Mızraklar bir rakibi daha deler', en: 'Spears pierce one more enemy' } },
  },
  {
    id: 'w_fighter_m', slot: 'weapon', cls: 'fighter', hand: 'melee', icon: 'sword',
    name: { tr: 'Uzun Işın', en: 'Longbeam' },
    lore: { tr: 'Işığı bir deniz fenerinden ödünç. Gemiler hâlâ onu arıyor.', en: 'Its light was borrowed from a lighthouse. Ships still look for it.' },
    stats: { reach: 0.3 },
    unique: { id: 'tideBlade', text: { tr: 'Her 4. savuruş 15 hasarlık bir dalga yollar', en: 'Every 4th swing sends a 15 damage wave' } },
  },
  {
    id: 'w_scout_r', slot: 'weapon', cls: 'scout', hand: 'ranged', icon: 'scope',
    name: { tr: 'Sabırlı Dürbün', en: 'Patient Scope' },
    lore: { tr: 'Ustası kırk yıl bir serçeyi izledi. Dürbün o sabrı hatırlıyor.', en: 'Its maker watched one sparrow for forty years. The scope remembers.' },
    stats: { rangedDmg: 0.18, charge: -0.2 },
    unique: { id: 'markShot', text: { tr: 'Tam şarjlı isabet 4 sn işaretler (+%10 hasar alır)', en: 'Full-charge hits mark for 4 s (+10% damage taken)' } },
  },
  {
    id: 'w_scout_m', slot: 'weapon', cls: 'scout', hand: 'melee', icon: 'claws',
    name: { tr: 'Kanca Pençe', en: 'Hook Claws' },
    lore: { tr: 'Kurt yoldaşın kendi pençesinden dökülmüş. İkiniz aynı yerden kanarsınız.', en: "Cast from your wolf's own claw. You two bleed from the same place." },
    stats: { meleeDmg: 0.2, atkSpeed: 0.05 },
    unique: { id: 'packClaw', text: { tr: 'Yoldaşın %25 fazla hasar verir', en: 'Your companion deals 25% more' } },
  },
];

// ---- The noir set: "Yağmurdaki Tanık" -----------------------------------------------
/** Set pieces count as light armor but fit every class. */
export const NOIR: ItemDef[] = [
  {
    id: 's_hat', slot: 'head', set: 'noir', weight: 'light', icon: 'fedora',
    name: { tr: 'Tanığın Fötrü', en: "Witness's Fedora" },
    lore: { tr: 'Kenarından yağmur hiç kesilmez. İçinde bir tanığın son cümlesi kayıtlı.', en: "Rain never stops falling from its brim. A witness's last sentence is recorded inside." },
    stats: { armor: 3, hp: 5, regenEvery: 16, regenPct: 0.04 },
  },
  {
    id: 's_coat', slot: 'chest', set: 'noir', weight: 'light', icon: 'trench',
    name: { tr: 'Uzun Palto', en: 'The Long Coat' },
    lore: { tr: 'Cebinde hiç açılmamış bir mektup var. Adres: yarın.', en: 'An unopened letter in the pocket. Address: tomorrow.' },
    stats: { armor: 5, hp: 8, cdr: 0.04 },
  },
  {
    id: 's_shoes', slot: 'legs', set: 'noir', weight: 'light', icon: 'oxfords',
    name: { tr: 'Sessiz Kunduralar', en: 'Quiet Oxfords' },
    lore: { tr: 'Islak kaldırımda iz bırakmaz. Sadece bir kez, bir cinayet gecesi bıraktı.', en: 'They leave no print on wet stone. Only once, on a murder night.' },
    stats: { armor: 3, hp: 4, speed: 0.05, dashCd: -0.12 },
  },
  {
    id: 's_ring', slot: 'ring', set: 'noir', icon: 'badge',
    name: { tr: 'Rozet Yüzüğü', en: 'Badge Ring' },
    lore: { tr: 'Gece Karakolu kapandığında rozetler eritildi. Biri yüzük olarak kurtuldu.', en: 'When the Night Precinct closed, the badges were melted. One escaped as a ring.' },
    stats: { dmg: 0.03, lifesteal: 0.015 }, perLevel: { dmg: 0.008 },
  },
  {
    id: 's_locket', slot: 'necklace', set: 'noir', icon: 'photo',
    name: { tr: 'Kayıp Kişi Madalyonu', en: 'Missing Person Locket' },
    lore: { tr: 'İçindeki fotoğraf her açılışta biraz daha soluyor. Yüz kimin, bilen yok.', en: 'The photo inside fades a little each time. Nobody knows whose face it is.' },
    stats: { cdr: 0.04, dmg: 0.02 }, perLevel: { cdr: 0.01 },
  },
];

/** Noir set bonuses (2, 3 and 5 pieces). */
export const NOIR_SET = {
  name: { tr: 'Yağmurdaki Tanık', en: 'Witness in the Rain' },
  /** 2: hitting someone marks them (seen through walls, +6% damage from you). */
  clue: { pieces: 2, markTime: 6, dmg: 0.06 },
  /** 3: first hit on someone who has not been in combat for 3 s deals +30%. */
  coldOpen: { pieces: 3, quiet: 3, dmg: 0.2 },
  /** 5: active (G): the world goes black and white for 5 s; +20% damage to marked, +15% speed, see the faded and invisible. */
  lastReel: { pieces: 5, key: 'KeyG', dur: 5, cd: 60, dmg: 0.2, speed: 0.15 },
  text: {
    2: { tr: 'İpucu: vurduğun rakip 6 sn işaretlenir, duvar arkasından görünür, ona %6 fazla vurursun', en: 'Clue: anyone you hit is marked for 6 s, seen through walls, and takes 6% more from you' },
    3: { tr: 'Soğuk açılış: 3 sn savaşmamış birine ilk vuruşun +%30', en: 'Cold open: your first hit on someone out of combat for 3 s deals +30%' },
    5: { tr: 'Son Kare (G): 5 sn dünya siyah beyaz, işaretlilere +%20 hasar, +%15 hız, silik ve görünmezleri görürsün (60 sn)', en: 'Last Reel (G): 5 s of black and white, +20% damage to the marked, +15% speed, see the faded and invisible (60 s)' },
  } as Record<number, Txt>,
};

// ---- Bandage ------------------------------------------------------------------------------
/**
 * X: free, no item needed. Wrap for `channel` s and heal `healPct` of max health over it.
 * You walk at `moveMult` speed. Attacking, a skill, a dash or one hit of `breakAt` max health stops it
 * (the healing done so far stays, and the cooldown is `cancelCd` of the full one).
 */
/** Pills (X): a 0.5 s cast, then heal at once. Taking a big hit during the cast breaks it. */
export const BANDAGE = { key: 'KeyX', channel: 3, healPct: 0.3, cd: 30, cancelCd: 0.5, moveMult: 0.6 };

// ---- Lookup and math ---------------------------------------------------------------------
export const ALL_ITEMS: ItemDef[] = [...ARMOR, ...JEWELS, ...WEAPONS, ...NOIR];
export const ITEM = Object.fromEntries(ALL_ITEMS.map((d) => [d.id, d])) as Record<string, ItemDef>;

/** One item someone owns. Jewels keep their own XP. */
export type Item = { id: string; rarity: Rarity; xp: number };

export function canWear(cls: ClassId, d: ItemDef): boolean {
  if (d.slot === 'weapon') return d.cls === cls;
  if (d.set) return true;
  if (d.weight) return WEARS[cls].includes(d.weight);
  return true;
}

export function jewelLevel(it: Item): number {
  const d = ITEM[it.id];
  if (d.slot !== 'ring' && d.slot !== 'necklace') return 1;
  let lv = it.rarity === 'legendary' ? 2 : 1;
  for (const need of JEWEL_LEVELS) if (it.xp >= need) lv = Math.max(lv, JEWEL_LEVELS.indexOf(need) + 2);
  return Math.min(lv, JEWEL_MAX[it.rarity]);
}

/** The numbers one item gives, rarity and jewel level included. */
export function itemStats(it: Item): Stats {
  const d = ITEM[it.id];
  const out: Stats = { ...ZERO };
  const m = RARITY_MULT[it.rarity];
  for (const [k, v] of Object.entries(d.stats) as [keyof Stats, number][]) {
    const scale = SCALES.includes(k) || (v < 0 && (k === 'dashCd' || k === 'bandageCd' || k === 'heat' || k === 'charge'));
    out[k] += scale ? v * m : v;
  }
  // Integer weapon numbers grow at epic and legendary.
  if (d.stats.mag && (it.rarity === 'epic' || it.rarity === 'legendary')) out.mag += 1;
  const lv = jewelLevel(it) - 1;
  if (lv > 0 && d.perLevel) for (const [k, v] of Object.entries(d.perLevel) as [keyof Stats, number][]) out[k] += v * lv * m;
  return out;
}

export type Loadout = Partial<Record<Slot, Item>>;

export function setPieces(l: Loadout): number {
  return Object.values(l).filter((it) => it && ITEM[it.id].set === 'noir').length;
}

export function uniques(l: Loadout): Set<Unique> {
  const s = new Set<Unique>();
  for (const it of Object.values(l)) if (it && it.rarity === 'legendary' && ITEM[it.id].unique) s.add(ITEM[it.id].unique!.id);
  return s;
}

/** Everything the loadout gives, added up. Damage reduction comes from `armorToDr`. */
export function totalStats(l: Loadout): Stats {
  const t: Stats = { ...ZERO };
  for (const it of Object.values(l)) {
    if (!it) continue;
    const s = itemStats(it);
    for (const k of Object.keys(t) as (keyof Stats)[]) {
      // Timers: the shortest wins (only one head piece anyway).
      if (k === 'regenEvery' || k === 'guardEvery') t[k] = t[k] && s[k] ? Math.min(t[k], s[k]) : t[k] || s[k];
      else t[k] += s[k];
    }
  }
  const u = uniques(l);
  if (u.has('ironCrown')) t.guardPct *= 2;
  // Caps so stacking never breaks a rule.
  t.cdr = Math.min(t.cdr, 0.4);
  t.dashCd = Math.max(t.dashCd, -0.5);
  t.bandageCd = Math.max(t.bandageCd, -0.5);
  t.tenacity = Math.min(t.tenacity, 0.6);
  return t;
}

export const armorToDr = (armor: number) => armor / (armor + 100);

/** A rough value for comparing items of one slot (higher = better). */
export function itemScore(it: Item): number {
  const s = itemStats(it);
  return s.armor * 1 + s.hp * 0.8 + s.hpPct * 300 + s.speed * 250 - s.dashCd * 60 + s.dmg * 500 + s.meleeDmg * 300 + s.rangedDmg * 300 + s.atkSpeed * 350 + s.cdr * 300 + s.aoe * 150 + s.lifesteal * 600 + s.tenacity * 60 + s.regenPct * 200 + s.guardPct * 200 - s.bandageCd * 40 + s.bandageHeal * 40 + s.mag * 10 - s.heat * 60 - s.charge * 80 + s.reach * 30 + s.backstab * 100 + s.spears * 15 + RARITIES.indexOf(it.rarity) * 5;
}

/** Drop rarity by match minute: early drops are mostly common, the last third is mostly epic. */
export function rollRarity(min: number, rand: () => number, boss = false): Rarity {
  const r = rand();
  const lv = Math.min(1, min / 24) + (boss ? 0.45 : 0);
  const leg = 0.02 + 0.1 * lv;
  const epic = 0.06 + 0.3 * lv;
  const rare = 0.3 + 0.15 * lv;
  if (r < leg) return 'legendary';
  if (r < leg + epic) return 'epic';
  if (r < leg + epic + rare) return 'rare';
  return 'common';
}

/** A random item this class can use. Set pieces are rare (bosses drop them more). */
export function rollItem(cls: ClassId, min: number, rand: () => number, boss = false): Item {
  const setChance = boss ? 0.25 : 0.05;
  const pool = rand() < setChance ? NOIR : [...ARMOR, ...JEWELS, ...WEAPONS].filter((d) => canWear(cls, d));
  const d = pool[Math.floor(rand() * pool.length)];
  return { id: d.id, rarity: rollRarity(min, rand, boss), xp: 0 };
}

/** Item text for the inventory and tooltips. */
export function statLines(it: Item, lang: Lang): string[] {
  const s = itemStats(it);
  const tr = lang === 'tr';
  const pct = (v: number) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}%`;
  const L: string[] = [];
  const add = (cond: boolean, t: string, e: string) => cond && L.push(tr ? t : e);
  add(s.armor > 0, `Zırh ${Math.round(s.armor)} (%${Math.round(armorToDr(s.armor) * 100)} hasar azaltma)`, `Armor ${Math.round(s.armor)} (${Math.round(armorToDr(s.armor) * 100)}% less damage)`);
  add(s.hp > 0, `+${Math.round(s.hp)} can`, `+${Math.round(s.hp)} health`);
  add(s.hpPct !== 0, `${pct(s.hpPct)} en yüksek can`, `${pct(s.hpPct)} max health`);
  add(s.speed !== 0, `${pct(s.speed)} hız`, `${pct(s.speed)} speed`);
  add(s.dashCd !== 0, `${pct(s.dashCd)} dash bekleme`, `${pct(s.dashCd)} dash cooldown`);
  add(s.dmg !== 0, `${pct(s.dmg)} hasar`, `${pct(s.dmg)} damage`);
  add(s.meleeDmg !== 0, `${pct(s.meleeDmg)} yakın silahla hasar`, `${pct(s.meleeDmg)} damage with melee in hand`);
  add(s.rangedDmg !== 0, `${pct(s.rangedDmg)} uzak silahla hasar`, `${pct(s.rangedDmg)} damage with ranged in hand`);
  add(s.atkSpeed !== 0, `${pct(s.atkSpeed)} saldırı hızı`, `${pct(s.atkSpeed)} attack speed`);
  add(s.cdr !== 0, `${pct(-s.cdr)} yetenek bekleme`, `${pct(-s.cdr)} skill cooldowns`);
  add(s.aoe !== 0, `${pct(s.aoe)} alan`, `${pct(s.aoe)} area`);
  add(s.lifesteal !== 0, `%${(s.lifesteal * 100).toFixed(1)} can çalma`, `${(s.lifesteal * 100).toFixed(1)}% lifesteal`);
  add(s.tenacity !== 0, `${pct(-s.tenacity)} sersemlik ve yavaşlama süresi`, `${pct(-s.tenacity)} stun and slow time`);
  add(s.bandageCd !== 0, `${pct(s.bandageCd)} pills bekleme`, `${pct(s.bandageCd)} pills cooldown`);
  add(s.bandageHeal !== 0, `${pct(s.bandageHeal)} pills iyileştirme`, `${pct(s.bandageHeal)} pills healing`);
  add(s.regenEvery > 0, `${s.regenEvery} sn'de bir canının %${Math.round(s.regenPct * 100)}'i kadar iyileşirsin`, `Heal ${Math.round(s.regenPct * 100)}% of max health every ${s.regenEvery} s`);
  add(s.guardEvery > 0, `${s.guardEvery} sn'de bir canının %${Math.round(s.guardPct * 100)}'i kadar kalkan`, `A shield of ${Math.round(s.guardPct * 100)}% max health every ${s.guardEvery} s`);
  add(s.mag > 0, `+${s.mag} şarjör`, `+${s.mag} magazine`);
  add(s.heat !== 0, `${pct(s.heat)} asa ısınması`, `${pct(s.heat)} wand heat`);
  add(s.charge !== 0, `${pct(s.charge)} dürbün şarj süresi`, `${pct(s.charge)} scope charge time`);
  add(s.reach > 0, `+${s.reach.toFixed(1)} m yakın menzil`, `+${s.reach.toFixed(1)} m melee reach`);
  add(s.backstab > 0, `+${s.backstab.toFixed(2)}x arkadan vuruş`, `+${s.backstab.toFixed(2)}x backstab`);
  add(s.spears > 0, `+${s.spears} mızrak`, `+${s.spears} spear`);
  const d = ITEM[it.id];
  if (d.unique && it.rarity === 'legendary') L.push(`★ ${d.unique.text[lang]}`);
  else if (d.unique) L.push(tr ? `(Efsanevi: ${d.unique.text.tr})` : `(Legendary: ${d.unique.text.en})`);
  return L;
}
