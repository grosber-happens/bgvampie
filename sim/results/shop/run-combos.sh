#!/bin/bash
# Duel balance after the S4 movement: combined fixes (150 repeats, levels 7 and 12, user builds, 50 m arena).
cd "$(dirname "$0")/../../.."
run() { echo "### $1"; env $2 SHOP=0 ONLY=b TUNED=1 node --experimental-strip-types --no-warnings sim/gear-test.ts 150 | grep -v "^$" | grep -v "^[0-9]* sn$"; }
run "yeni hareket" "MOVE=1"
run "A: kalkan 0.6 sn + hızlı sniper" "MOVE=1 VARIANT=mv_shield2,mv_sniper"
run "B: A + mızrak yenilenmesi 1.5 sn, 4 mızrak" "MOVE=1 VARIANT=mv_shield2,mv_sniper,f_ammo"
run "C: A + geri çağırma 25/mızrak" "MOVE=1 VARIANT=mv_shield2,mv_sniper,f_stuck25"
run "D: A + hızlı mızrak + yenilenme" "MOVE=1 VARIANT=mv_shield2,mv_sniper,mv_spear,f_ammo"
