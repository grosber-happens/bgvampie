/**
 * Turkish and English text. `t(key)` for the interface; skill names, descriptions and tiers are
 * swapped on the class kits by `applySkillLanguage` so every existing screen shows the chosen language.
 * Skill names are the poetic set from docs/LORE.md (version A).
 */
import type { Lang } from './gear';
export type { Lang };

const KEY = 'vb.lang';
let lang: Lang = 'tr';
try {
  const saved = localStorage.getItem(KEY);
  if (saved === 'tr' || saved === 'en') lang = saved;
  else if (!navigator.language.toLowerCase().startsWith('tr')) lang = 'en';
} catch {
  /* private mode */
}
export const getLang = () => lang;
const listeners: (() => void)[] = [];
export function onLang(f: () => void) {
  listeners.push(f);
}
export function setLang(l: Lang) {
  lang = l;
  try {
    localStorage.setItem(KEY, l);
  } catch {
    /* ignore */
  }
  document.documentElement.lang = l;
  for (const f of listeners) f();
}

type Dict = Record<string, [tr: string, en: string]>;
const UI: Dict = {
  title: ['Vampire Battleground', 'Vampire Battleground'],
  subtitle: ['Güneş hiç batmadı. Hasat başlıyor.', 'The sun never set. The Harvest begins.'],
  play: ['Oyna', 'Play'],
  loading: ['Yükleniyor…', 'Loading…'],
  resume: ['Devam et', 'Resume'],
  again: ['Tekrar oyna', 'Play again'],
  settings: ['Ayarlar', 'Settings'],
  howto: ['Nasıl oynanır', 'How to play'],
  planner: ['Harita planlayıcı', 'Map planner'],
  back: ['Geri', 'Back'],
  paused: ['Duraklatıldı.', 'Paused.'],
  pickClass: ['Sınıfını ve tarzını seç. Başlangıç yeteneğin tarzına göre gelir.', 'Pick your class and style. Your first skill comes from the style.'],
  start: ['Başlangıç', 'Starts with'],
  passives: ['Pasifler', 'Passives'],
  weapons: ['Silahlar', 'Weapons'],
  language: ['Dil', 'Language'],
  sensitivity: ['Fare hassasiyeti', 'Mouse sensitivity'],
  volume: ['Ses', 'Volume'],
  fov: ['Görüş açısı', 'Field of view'],
  numbers: ['Hasar sayıları', 'Damage numbers'],
  look: ['Görünüm', 'Look'],
  lookClay: ['Kil ve sulu boya', 'Clay and watercolor'],
  lookClassic: ['Klasik', 'Classic'],
  shake: ['Kamera sarsıntısı', 'Camera shake'],
  on: ['Açık', 'On'],
  off: ['Kapalı', 'Off'],
  reloadNote: ['Görünüm değişikliği sayfayı yeniler.', 'Changing the look reloads the page.'],
  level: ['Sv', 'Lv'],
  max: ['max', 'max'],
  money: ['Para', 'Coins'],
  shopTitle: ['Kurbağa Loncası', 'Frog Guild'],
  shopShelf: ['Raf', 'Shelf'],
  shopSellTitle: ['Sat (çanta)', 'Sell (bag)'],
  shopHint: ['<b>V</b> Kurbağa Loncası makinesi', '<b>V</b> Frog Guild machine'],
  shopChip: ['Satıcı', 'Vendor'],
  shopBuy: ['{c} para', '{c} coins'],
  shopSellFor: ['Satış: {c} para', 'Sells for {c} coins'],
  shopSold: ['Satıldı', 'Sold'],
  shopNoMoney: ['Paran yetmiyor', 'Not enough coins'],
  shopBagFull: ['Çantan dolu', 'Your bag is full'],
  shopBought: ['Satın alındı: {n}', 'Bought: {n}'],
  shopRestock: ['Raf {s} sn sonra yenilenir. Sağ tıkla çantadan sat.', 'New shelf in {s} s. Right click a bag item to sell it.'],
  shopEmpty: ['Çanta boş', 'Bag is empty'],
  kills: ['leş', 'kills'],
  maxLevel: ['Maksimum seviye', 'Max level'],
  levelUp: ['Seviye atladın!', 'Level up!'],
  pickCards: ['basılı tut, kart seç', 'hold to pick'],
  cards: ['kart', 'cards'],
  card: ['Kart', 'Card'],
  cardsTitle: ['Seviye atladın: bir kart seç', 'Level up: pick a card'],
  later: ['Sonra seç (Tab bırak)', 'Later (release Tab)'],
  newSkill: ['Yeni yetenek', 'New skill'],
  tier: ['Seviye', 'Tier'],
  pickKey: ['Seç: {n} ya da tıkla', 'Pick: {n} or click'],
  token: ['Token: {c} para', 'Token: {c} coins'],
  youHave: ['sende {c}', 'you have {c}'],
  allMax: ['Tüm yeteneklerin en üst seviyede.', 'All your skills are maxed.'],
  tier3Open: ['3. seviye açık (token {c} para)', 'Tier 3 is open (token {c} coins)'],
  tier3Rule: ['3. seviye için en az 3 yetenek 2. seviyede olmalı (şu an {n})', 'Tier 3 needs 3 skills at tier 2 (now {n})'],
  orPress: ['1 2 3 ile de seçebilirsin', 'or press 1 2 3'],
  empty: ['boş', 'empty'],
  dash: ['Dash (A/D + Space)', 'Dash (A/D + Space)'],
  sp: ['Nefes', 'Breath'],
  bandage: ['Pills (X)', 'Pills (X)'],
  bandageChip: ['Pills', 'Pills'],
  bagChip: ['Çanta', 'Bag'],
  bandaging: ['Pills içiyorsun…', 'Taking pills…'],
  bandageCd: ['Pills hazır değil', 'Pills not ready'],
  bandageFull: ['Canın zaten dolu', 'Already at full health'],
  bandageBroke: ['Pills yarıda kaldı', 'Pills interrupted'],
  shield: ['Kalkan', 'Shield'],
  stunned: ['Sersem!', 'Stunned!'],
  inCombat: ['Savaşta', 'In combat'],
  died: ['Öldün', 'You died'],
  diedLine: ['Süre {t}, seviye {l}, {k} leş.', 'Time {t}, level {l}, {k} kills.'],
  levelTimes: ['Seviye zamanları', 'Level times'],
  inventory: ['Çanta (I)', 'Bag (I)'],
  equipped: ['Kuşanılan', 'Equipped'],
  bag: ['Çanta', 'Bag'],
  equip: ['Kuşan', 'Equip'],
  drop: ['Bırak', 'Drop'],
  cantWear: ['Sınıfın bunu giyemez', 'Your class cannot wear this'],
  picked: ['Aldın: {n}', 'Picked up: {n}'],
  bagFull: ['Çanta dolu', 'Bag is full'],
  set: ['Set', 'Set'],
  jewelLv: ['Sv {l}', 'Lv {l}'],
  reelReady: ['Son Kare hazır (G)', 'Last Reel ready (G)'],
  reel: ['Son Kare', 'Last Reel'],
  noBreath: ['Nefes yetmiyor', 'Out of breath'],
  boss: ['Zombi Devi', 'Zombie Giant'],
  you: ['Sen', 'You'],
  poison: ['Zehir', 'Poison'],
  yourCopy: ['Kopyan', 'Your copy'],
  city: ['Şehir', 'City'],
  newCity: ['N: yeni şehir', 'N: new city'],
  hint: [
    'WASD hareket · W W koş · A/D + Space yana dash · Space zıpla (havada tekrar: çift zıplama, duvarda Space Space: duvardan sek) · Sol tık ateş · Sağ tık nişan (yakın silahla: özel saldırı) · F silah · R şarjör · Q E 1 2 3 yetenek · X pills · I çanta · G set yeteneği · Tab basılı tut: kart · Esc duraklat',
    'WASD move · W W sprint · A/D + Space side dash · Space jump (again in the air: double jump, Space Space at a wall: wall kick) · Left click fire · Right click aim (melee: special attack) · F weapon · R reload · Q E 1 2 3 skills · X pills · I bag · G set skill · hold Tab: cards · Esc pause',
  ],
  credits: ['Bir Moebius rüyası, Kim Jung Gi çizgisi, Kopinski tozu.', 'A Moebius dream, a Kim Jung Gi line, Kopinski dust.'],
  postcard: ['Ufuk-i Kehribar’dan selamlar', 'Greetings from Ufuk-i Kehribar'],
  bossDown: ["Zombi Devi'ni sen devirdin!", 'You brought down the Zombie Giant!'],
  bossDownBy: ["{n} Zombi Devi'ni devirdi", '{n} brought down the Zombie Giant'],
  startedWith: ['{c} · {s}: {k} ile başladın', '{c} · {s}: you start with {k}'],
  cooldown: ['{n} bekleme süresinde', '{n} is on cooldown'],
  loot: ['Eşya', 'Item'],
  slam: ['Yere çakıl! (havada Ctrl)', 'Ground slam! (Ctrl in the air)'],
};

export function t(key: string, vars: Record<string, string | number> = {}): string {
  const e = UI[key];
  let s = e ? e[lang === 'tr' ? 0 : 1] : key;
  for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
  return s;
}

// ---- Skills ------------------------------------------------------------------------------
type SkillText = { tr: string; en: string; desc?: string; tiers?: [string, string, string] };
/** Poetic names (TR / EN) and English text. Turkish descriptions stay as written in the class files. */
export const SKILL_TEXT: Record<string, SkillText> = {
  // Rogue
  invis: { tr: 'Hiç Kimse', en: 'Nobody', desc: 'You turn invisible. Attacking breaks it, and up close you show as a faint shape. You must not have dealt or taken damage for 2 s.', tiers: ['3 s invisible', 'Lasts 4.5 s', 'Always half-faded out of combat. The skill makes you fully invisible'] },
  evasion: { tr: 'Rüzgâra Eğilmek', en: 'Bend with the Wind', desc: 'For a while you take half damage.', tiers: ['2.5 s of damage reduction', 'Lasts 4 s', 'Lasts 5.5 s and the first 2 s you take no damage'] },
  decoy: { tr: 'İkizim Yalan Söyler', en: 'My Twin Lies', desc: 'Leaves a fake copy that runs ahead. Press again during the cooldown to swap places with your nearest copy.', tiers: ['1 charge, 9 s cooldown', 'Cooldown 6 s', "The copy wears another player's name and look"] },
  poison: { tr: 'Tatlı Son', en: 'Sweet Ending', desc: 'Your bullets and daggers poison: the target slows and takes damage over time. Poison does not stack, it refreshes.', tiers: ['6 s poisoned weapons, 30% slow, 6 dmg/s', 'Stronger: 40% slow, 10 dmg/s', 'Poison stays on your weapons. The skill doubles poison damage for 5 s'] },
  sprint: { tr: 'Son Tren', en: 'The Last Train', desc: 'Run 45% faster for 4 s.', tiers: ['10 s cooldown', '+1 charge, cooldown 7 s', 'While sprinting you attack, fire and reload faster'] },
  kidney: { tr: 'Kısa Bir Nefes', en: 'Short of Breath', desc: 'Melee only: the enemy in front of you cannot move for a moment.', tiers: ['0.55 s stun, 12 s cooldown', 'Cooldown 9 s', 'The stun lasts 1 s'] },
  execute: { tr: 'Son Söz', en: 'Last Word', desc: 'A heavy strike or shot that hits harder the more health the target is missing. Works with both weapons.', tiers: ['70 damage + 40% of missing health', 'Damage 95', 'A kill resets the cooldown'] },
  wink: { tr: 'Göz Kırpımı', en: 'A Wink', desc: 'Teleport behind the enemy under your crosshair (perfect for a backstab).', tiers: ['12 m range, 9 s cooldown', '16 m range, 7 s cooldown', '20 m, 6 s, and the target is stunned 0.25 s'] },
  detonate: { tr: 'Veda Mektubu', en: 'Farewell Letter', desc: 'Blows up the copy under your crosshair (or the nearest one).', tiers: ['4.5 m blast, 70 damage, 11 s cooldown', '5.5 m blast, 8 s cooldown', 'All copies blow up at once'] },
  insane: { tr: 'Aynalar Ayaklanınca', en: 'When Mirrors Riot', desc: 'All your copies run at the nearest enemy and open fire (30% damage). A copy that fires fades after 2 s.', tiers: ['Copies attack, 12 s cooldown', 'Copies live longer (8 → 12 s)', 'A copy uses a random skill of the class it imitates'] },
  // Mage
  sonic: { tr: 'Gök Gürültüsünün Adı', en: 'The Name of Thunder', desc: 'A cone of sound in front of you pushes enemies back and hurts them.', tiers: ['70° cone, 4 m push, 9 s cooldown', 'Wider cone (95°), 6 m push', 'Enemies slammed into a wall are stunned 0.5 s'] },
  bombs: { tr: 'Küçük Fedailer', en: 'Little Martyrs', desc: '(n) Nano bots become tiny running robots that rush the nearest enemy and explode.', tiers: ['1 robot, 40 damage', 'One orb makes 2 robots', 'The blast leaves slowing nano dust'] },
  fog: { tr: 'Unutkan Sis', en: 'Forgetful Fog', desc: 'Fog covers you. Inside it you stay unseen even when using skills.', tiers: ['6 m fog, 7 s', 'Bigger (9 m)', 'Inside the fog nano orbs fill twice as fast'] },
  sunray: { tr: 'Öğle Duası', en: 'Noon Prayer', desc: '(n) Nano bots form a robot that burns the nearest enemy with a sunray.', tiers: ['3 s beam, 30 dmg/s', 'Beam lasts 5 s', 'When the target dies, the robot turns to the next one'] },
  nanobots: { tr: 'Fısıldayan Pas', en: 'Whispering Rust', desc: '(n) Covers the enemy under your crosshair with nano bots: damage over time.', tiers: ['12 dmg/s for 5 s', 'Lasts 8 s', 'If the target dies, the bots jump to the nearest enemy'] },
  blink: { tr: 'Adres Değişikliği', en: 'Change of Address', desc: 'Teleport a short way in the direction you look.', tiers: ['10 m, 8 s cooldown', '13 m, 6 s cooldown', '2 charges'] },
  armor: { tr: 'Gümüş Kabuk', en: 'Silver Shell', desc: '(n) A shield (40/55/75). When it breaks or 6 s pass, it bursts and hurts everyone near.', tiers: ['40 shield, 40 burst damage', '55 shield, 65 burst damage', '75 shield; every enemy the burst hits gives back 1 nano orb'] },
  arms: { tr: 'Ödünç Eller', en: 'Borrowed Hands', desc: '(n) Two robotic arms stay with you for 8 s (10 s at tier 3) and hit the nearest enemy.', tiers: ['18 damage every 0.7 s', 'Faster and harder: 0.5 s, 26 damage', '0.4 s, 30 damage, 10 s; every 3rd hit stuns 0.25 s'] },
  gravity: { tr: 'Elmanın Düştüğü Yer', en: 'Where the Apple Falls', desc: 'Lift the enemy under your crosshair into the air, then slam them down.', tiers: ['1.2 s in the air, 35 damage', '1.6 s in the air, 55 damage', 'The slam also hurts enemies around'] },
  mines: { tr: 'Sabırlı Işıklar', en: 'Patient Lights', desc: 'Shoot the ground with your wand to plant a laser mine. It never hurts you.', tiers: ['2 mines at once, 45 damage', 'Damage 65', 'Enemies cannot see the mines'] },
  // Fighter
  second: { tr: 'Kız Kardeş Kılıç', en: 'Sister Blade', desc: 'Draw a second laser sword for a while and fight with two (faster melee).', tiers: ['5 s with two swords', 'Lasts 7 s, faster swings', 'Every swing throws a short laser wave'] },
  rain: { tr: 'Demir Muson', en: 'Iron Monsoon', desc: 'Spears fall from the sky on the point under your crosshair.', tiers: ['3.5 m area, 40 damage', '5 m area, 60 damage', 'The spears stay 3 s and slow anyone passing with electricity'] },
  eshield: { tr: 'Kapalı Kapı', en: 'A Closed Door', desc: 'An energy shield in front of you blocks bullets and blows.', tiers: ['3 s, 80 strength', 'Lasts 5 s', 'Strength 140. When it closes, the blocked damage bursts forward as a shock wave'] },
  chain: { tr: 'Eve Dönüş', en: 'Bring Them Home', desc: 'Throw a spear on a chain and pull the enemy it hits to you.', tiers: ['16 m range, 10 s cooldown', '20 m range, 7 s cooldown', 'The pulled enemy is slowed 1 s'] },
  pierce: { tr: 'Mıh', en: 'The Nail', desc: 'A heavy spear that pierces enemies in a line. An enemy with a wall, tree or box within 3 m behind is nailed to it: 1.5 s up close, 0.25 s at 40 m.', tiers: ['60 damage, 11 s cooldown', '80 damage, 8 s cooldown', 'The spear flies back to your hand and hits anyone on the way'] },
  charge: { tr: 'Boğa Yemini', en: "The Bull's Oath", desc: 'A jet-driven rush forward. Whoever you hit is stunned.', tiers: ['9 m, 10 s cooldown', '12 m, 7 s cooldown', 'A 2nd charge (the stun does not grow)'] },
  leap: { tr: 'Çatıdaki Adam', en: 'Man on the Roof', desc: 'Your back jets throw you to the point under your crosshair and you crash down: area damage.', tiers: ['10 m, 35 damage', '13 m, 55 damage', 'The landing throws enemies into the air'] },
  whirl: { tr: 'Semazen', en: 'The Whirling Saint', desc: 'Spin with your laser sword and hit everyone around. You slow down while spinning.', tiers: ['2.5 s, 12 damage per hit', '3.5 s, 18 damage', 'Move at full speed while spinning'] },
  overpower: { tr: 'Bir Kez Daha', en: 'Once More, Harder', desc: 'For a while you deal 30% more damage and steal more health.', tiers: ['5 s, lifesteal +10%', '7 s, lifesteal +20%', 'Using it clears stuns and slows on you'] },
  recall: { tr: 'Mızraklar Eve', en: 'Spears, Come Home', desc: 'Pull every spear stuck in enemies back to your hand. Each stuck spear deals 15 damage, and they hit anyone on the way back.', tiers: ['25 damage, 10 s cooldown', '40 damage, 7 s cooldown', 'Returning spears slow whoever they hit by 40% for 2 s'] },
  // Scout
  shotgun: { tr: 'Kapı Tokmağı', en: 'Door Knocker', desc: 'Pull out a short shotgun and fire two quick blasts ahead.', tiers: ['2 shotgun blasts, 9 s cooldown', 'Cooldown 6 s', 'A shotgun in each hand: 4 blasts'] },
  hook: { tr: 'Bulutlara Tutunmak', en: 'Hold on to the Clouds', desc: 'Fire a hook at the wall or roof under your crosshair and pull yourself there.', tiers: ['18 m, 10 s cooldown', '24 m, 7 s cooldown', '2 charges'] },
  fast: { tr: 'Nefesini Tut', en: 'Hold Your Breath', desc: "The sniper's next shot comes out fully charged without waiting.", tiers: ['1 charged shot, 12 s cooldown', 'Cooldown 9 s', 'One more charged shot at once (2 shots)'] },
  smoke: { tr: 'Tütsü', en: 'Incense', desc: 'A bomb that hurts and fills the area with smoke. The smoke hides who is inside from those outside.', tiers: ['8 s of smoke, 25 damage', 'Damage 40', 'You see the outline of enemies inside the smoke'] },
  pack: { tr: 'Gece Vardiyası', en: 'Night Shift', desc: 'Call extra cybernetic beasts; they stay until they die. Using it again while they live calls them all back to you, fresh.', tiers: ['1 beast, 25 s cooldown', '2 beasts', 'Also brings back a dead companion; all your creatures and you get 5 s of haste'] },
  hunt: { tr: 'Kokuyu Al', en: 'Take the Scent', desc: 'Mark the enemy under your crosshair: your beasts go for them, they show through walls and take more damage.', tiers: ['6 s, +20% damage', '9 s, +30% damage', 'When the marked enemy dies, the mark jumps to the nearest one'] },
  pounce: { tr: 'Yukarıdan Selam', en: 'Hello from Above', desc: 'Leap at the enemy under your crosshair and strike with your claws.', tiers: ['10 m, 30 damage', '13 m, 45 damage', 'Knocks the target down for 0.5 s'] },
  rend: { tr: 'Kâğıt Kesiği', en: 'Paper Cut', desc: 'A fast flurry of claws on the enemy in front: every hit leaves a bleed.', tiers: ['5 hits, 8 dmg/s bleed', '7 hits', 'A bleeding enemy cannot heal'] },
  drone: { tr: 'Gökteki Tanık', en: 'Witness in the Sky', desc: 'A drone circles an area and shows enemies there through walls.', tiers: ['10 s, 14 m area', '15 s, 20 m area', 'The drone marks the enemies it sees (like Take the Scent)'] },
  trap: { tr: 'Kapı Eşiği', en: 'The Doorstep', desc: 'Hide a trap on the ground. Whoever steps on it is pinned in place.', tiers: ['2 traps at once, 1.5 s', 'Pinned 2.2 s', '3 traps at once; whoever steps in becomes your companion’s target'] },
};

/** Weapon and passive names, Turkish and English. The class files keep plain working names; these are the ones players see. */
export const KIT_EN: Record<string, { blurb?: string; weapons?: [string, string]; passives?: string[]; styles?: string[] }> = {
  rogue: { weapons: ['Wet Street Pistol', 'Moonshard Daggers'], passives: ['A Chill Down the Spine: hits from behind deal x1.8', 'Leaves No Footprints: a dash leaves a copy where it starts; standing still 2.5 s fades you for 10 s'], styles: ['Close quarters', 'Long range', 'Deception'] },
  mage: { weapons: ['Light Pen', 'Lantern Staff'], passives: ['Premonition: after 10 s out of combat the next hit is blocked', 'Stars in the Pocket: nano orbs, fuel for the (n) skills'], styles: ['Nano master (staff)', 'Laser (pen)', 'Gravity (control)'] },
  fighter: { weapons: ['Lightning Spears', 'Dawn Blade'], passives: ['An Old Vow: 20 shield every 10 s', 'Blood Debt: 7% of the damage you deal comes back as health'], styles: ['Two swords (melee)', 'Spearman (ranged)', 'Fortress (defense)'] },
  scout: { weapons: ['Far Eye', 'Cat Nails'], passives: ['Faithful Shadow: a wolf that hunts whoever you last hit (comes back 20 s after dying)', "Bird's-Eye: +20% damage on enemies below you"], styles: ['Pack (companion)', 'Wild (claws)', 'Marksman'] },
};
const KIT_TR: Record<string, { weapons: [string, string]; passives: string[] }> = {
  rogue: { weapons: ['Islak Sokak Tabancası', 'Ay Kırığı Hançerler'], passives: ['Ensedeki Soğukluk: arkadan vuruş x1.8', 'İz Bırakmayan: dash başladığı yerde kopya bırakır; 2.5 sn durunca 10 sn silikleşirsin'] },
  mage: { weapons: ['Işık Kalemi', 'Fener Asası'], passives: ['Önsezi: savaş dışında 10 sn sonra sıradaki vuruşu engeller', 'Cepteki Yıldızlar: nano küreler, (n) yeteneklerin kaynağı'] },
  fighter: { weapons: ['Yıldırım Mızrakları', 'Şafak Kılıcı'], passives: ['Eski Bir Yemin: 10 sn\'de bir 20 kalkan', 'Kan Borcu: verdiğin hasarın %7\'si can olarak döner'] },
  scout: { weapons: ['Uzak Göz', 'Kedi Tırnakları'], passives: ['Sadık Gölge: son vurduğun rakibe saldıran kurt (ölürse 20 sn sonra döner)', 'Kuş Bakışı: alçaktaki rakibe +%20 hasar'] },
};

type KitLike = { id: string; weaponNames: Record<'ranged' | 'melee', string>; passives: string[]; playstyles: { name: string }[]; skills: Record<string, { name: string; desc: string; tiers: [string, string, string] }> };
const original = new Map<object, any>();

/** Swap names and text on every kit to the current language. */
export function applySkillLanguage(kits: KitLike[]) {
  for (const k of kits) {
    if (!original.has(k)) original.set(k, { weapons: { ...k.weaponNames }, passives: [...k.passives], styles: k.playstyles.map((s) => s.name) });
    const o = original.get(k);
    const en = KIT_EN[k.id];
    const tr = lang === 'tr';
    const names = tr ? KIT_TR[k.id] : en;
    k.weaponNames.ranged = names?.weapons?.[0] ?? o.weapons.ranged;
    k.weaponNames.melee = names?.weapons?.[1] ?? o.weapons.melee;
    k.passives.splice(0, k.passives.length, ...(names?.passives ?? o.passives));
    k.playstyles.forEach((s, i) => (s.name = tr || !en?.styles ? o.styles[i] : en.styles[i]));
    for (const [id, s] of Object.entries(k.skills)) {
      if (!original.has(s)) original.set(s, { desc: s.desc, tiers: [...s.tiers] });
      const so = original.get(s);
      const st = SKILL_TEXT[id];
      if (!st) continue;
      s.name = tr ? st.tr : st.en;
      s.desc = tr || !st.desc ? so.desc : st.desc;
      s.tiers = (tr || !st.tiers ? so.tiers : st.tiers) as [string, string, string];
    }
  }
}

/** English for the short HUD lines the class files write in Turkish (weapon line and buffs). */
/** Working weapon names in the class files' HUD text, and the names players see: [working, TR, EN]. */
const WEAPON_SHOWN: [string, string, string][] = [
  ['Suikast tabancası', 'Islak Sokak Tabancası', 'Wet Street Pistol'], ['İkili lazer hançer', 'Ay Kırığı Hançerler', 'Moonshard Daggers'],
  ['Lazer wand', 'Işık Kalemi', 'Light Pen'], ['Uzun asa', 'Fener Asası', 'Lantern Staff'],
  ['Enerji mızrakları', 'Yıldırım Mızrakları', 'Lightning Spears'], ['Çift lazer kılıcı', 'Çifte Şafak', 'Double Dawn'], ['Lazer kılıcı', 'Şafak Kılıcı', 'Dawn Blade'],
  ['Sniper tüfeği', 'Uzak Göz', 'Far Eye'], ['Pençeler', 'Kedi Tırnakları', 'Cat Nails'], ['Büyü kalkanı', 'Önsezi', 'Premonition'],
];
const HUD_EN: [string, string][] = [
  ['dolduruluyor…', 'reloading…'], ['soğuyor…', 'cooling…'], ['ısı %', 'heat '],
  ['şarj %', 'charge '], ['Küre', 'Orbs'], ['Hasar almaz', 'Immune'],
  ['Kasırga', 'Whirl'], ['Sisin içinde', 'In the fog'], ['Sürü hızı', 'Pack haste'], ['Yarı silik', 'Half faded'], ['Zehir x2', 'Poison x2'],
  ['Zehirli silah', 'Poisoned weapon'], ['Aşırı güç', 'Overpower'], ['Dolu atış', 'Charged shot'], ['Enerji kalkanı', 'Energy shield'],
  ['Görünmez', 'Invisible'], ['Kurt', 'Wolf'], ['Nano kollar', 'Nano arms'], ['Nano zırh', 'Nano armor'], ['Silik', 'Faded'], ['Sürü', 'Pack'], ['Çift kılıç', 'Two swords'],
];
export function hud(text: string): string {
  for (const [w, tr, en] of WEAPON_SHOWN) text = text.split(w).join(lang === 'tr' ? tr : en);
  if (lang === 'tr') return text;
  for (const [a, b] of HUD_EN) text = text.split(a).join(b);
  return text;
}
const BLURB_EN: Record<string, string> = {
  rogue: 'Get behind, blow up, slip away. Fool them with invisibility and copies.',
  mage: 'A technomancer of nano bots. Area control and little robots.',
  fighter: 'Laser sword and energy spears. A tough front line that steals health.',
  scout: 'A hunter with claws and a sniper, and a cybernetic wolf at heel.',
};
const blurbTr = new Map<string, string>();
export function blurb(k: { id: string; blurb: string }) {
  if (!blurbTr.has(k.id)) blurbTr.set(k.id, k.blurb);
  return lang === 'tr' ? blurbTr.get(k.id)! : BLURB_EN[k.id] ?? k.blurb;
}
