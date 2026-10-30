#!/bin/bash
# Duel balance after the S4 movement: baseline and single fixes (150 repeats, levels 7 and 12, user builds, 50 m arena).
cd "$(dirname "$0")/../../.."
run() { echo "### $1"; env $2 SHOP=0 ONLY=b TUNED=1 node --experimental-strip-types --no-warnings sim/gear-test.ts 150 | grep -v "^$" | grep -v " sn$"; }
run "eski (MOVE=0)" "MOVE=0"
run "yeni hareket" "MOVE=1"
for v in mv_shield mv_shield2 mv_spear mv_spear2 mv_heavy mv_sniper mv_kick; do run "$v" "MOVE=1 VARIANT=$v"; done
