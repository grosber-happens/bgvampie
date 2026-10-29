import { runMatch } from './match.ts';
import { CLASS_IDS } from './config.ts';
import { STYLES } from './kits.ts';
const MIN = Number(process.argv[2] ?? 15);
for (const c of CLASS_IDS) for (let s = 0; s < 3; s++) {
  let lv = 0, died = 0, mobs = 0; const n = 12;
  for (let k = 0; k < n; k++) { const r = runMatch(500 + k, { classes: [c], styles: [s], soloMinutes: MIN }); const p = r.players[0]; lv += p.level + (p.deathMin < MIN - 0.1 ? 0 : 0); if (p.place && p.deathMin < MIN - 0.1) died++; mobs += p.mobKills; }
  console.log(`${c}/${STYLES[c][s].id}`.padEnd(20), 'level@' + MIN, (lv / n).toFixed(1), 'mobs', (mobs / n).toFixed(0), 'died', died);
}
