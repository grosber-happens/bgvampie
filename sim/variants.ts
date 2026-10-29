/**
 * Balance experiments, picked with VARIANT=a,b,c (applied after tuning.ts).
 *   TUNED=1 VARIANT=s_dmg,r_hp node --experimental-strip-types --no-warnings sim/fade-test.ts 400 user-builds.json
 */
import { CLASSES, PASSIVES } from './config.ts';
import { M, R, S } from './kits.ts';

export const VARIANTS: Record<string, { name: string; apply: () => void }> = {
  // ---- Scout nerfs
  s_dmg: { name: 'Sniper tam şarj 100 → 80', apply: () => void (CLASSES.scout.ranged.dmg = 80) },
  s_charge: { name: 'Sniper şarj süresi 1.4 → 2.0 sn', apply: () => void (CLASSES.scout.ranged.charge = 2.0) },
  s_high: { name: 'Yükseklik bonusu 1.2 → 1.05', apply: () => void (PASSIVES.scout.highGroundMult = 1.05) },
  s_beast: { name: 'Yoldaş hasarı 12 → 9, can 70 → 55', apply: () => ((PASSIVES.scout.beastDmg = 9), (PASSIVES.scout.beastHp = 55)) },
  s_hp: { name: 'Scout can 100 → 90 (+6/seviye)', apply: () => ((CLASSES.scout.hp = 90), (CLASSES.scout.hpPerLevel = 6)) },
  // ---- Rogue buffs
  r_hp: { name: 'Rogue can 110 → 125 (+9/seviye)', apply: () => ((CLASSES.rogue.hp = 125), (CLASSES.rogue.hpPerLevel = 9)) },
  r_back: { name: 'Backstab 1.5x → 1.8x', apply: () => void (PASSIVES.rogue.backstabMult = 1.8) },
  r_dagger: { name: 'Hançer 22 → 27', apply: () => void (CLASSES.rogue.melee.dmg = 27) },
  r_invis: { name: 'Görünmezlik süresi +1.5 sn', apply: () => void (R.invis.dur = [4.5, 6, 6]) },
  r_clone: { name: 'Detonate alanı 3.5/4.5 → 4.5/5.5 m, hasar 55 → 70, en fazla kopya 3 → 4', apply: () => ((R.detonate.radius = [4.5, 5.5, 5.5]), (R.detonate.damage = 70), (R.decoy.max = 4)) },
  // ---- Mage buffs (mostly the melee build, which fades late)
  m_arms: { name: 'Nano kollar hasarı 14/20 → 18/26', apply: () => void (M.arms.damage = [18, 26, 26]) },
  m_armor: { name: 'Nano zırh kalkanı 40 → 60', apply: () => void (M.armor.shield = 60) },
  m_armor2: { name: 'Nano zırh kalkanı 60 → 75, patlama 30/50 → 40/65', apply: () => ((M.armor.shield = 75), (M.armor.damage = [40, 65, 65])) },
  f_spear: { name: 'Mızrak hasarı 38 → 45', apply: () => void (CLASSES.fighter.ranged.dmg = 45) },
  f_spear_rate: { name: 'Mızrak hasarı 38 → 42, atış aralığı 0.6 → 0.5 sn', apply: () => ((CLASSES.fighter.ranged.dmg = 42), (CLASSES.fighter.ranged.rate = 0.5)) },
  f_ammo: { name: 'Mızrak yenilenmesi 2.2 → 1.5 sn, şarjör 3 → 4', apply: () => ((CLASSES.fighter.ranged.ammoRegen = 1.5), (CLASSES.fighter.ranged.mag = 4)) },
  m_arms3a: { name: 'Nano kollar 3. seviye hasar 26 → 34', apply: () => void (M.arms.damage = [18, 26, 34]) },
  m_arms3b: { name: 'Nano kollar 3. seviye hasar 26 → 30, vuruş aralığı 0.5 → 0.4 sn, süre 8 → 10 sn', apply: () => ((M.arms.damage = [18, 26, 30]), (M.arms.every = [0.7, 0.5, 0.4]), (M.arms.dur3 = 10)) },
  m_armor_tier: { name: 'Nano zırh kalkanı seviyeye bağlı 40/55/75 (patlama 40/65/65 kalır)', apply: () => void (M.armor.shieldByTier = [40, 55, 75]) },
  m_wand: { name: 'Asa hasarı 14 → 13', apply: () => void (CLASSES.mage.ranged.dmg = 13) },
  m_hp: { name: 'Mage can 95 → 105 (+7/seviye)', apply: () => ((CLASSES.mage.hp = 105), (CLASSES.mage.hpPerLevel = 7)) },
  m_lvl: { name: 'Mage seviye başı hasar %6 → %8', apply: () => void (CLASSES.mage.dmgPerLevel = 0.08) },
};
void S;

for (const id of (process.env.VARIANT ?? '').split(',').filter(Boolean)) {
  if (!VARIANTS[id]) throw new Error(`unknown variant ${id}`);
  VARIANTS[id].apply();
}
