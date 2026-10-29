/**
 * Which skills go with good results: average placement of players who own each skill,
 * compared with the class average (negative = better).
 *   node --experimental-strip-types --no-warnings sim/skills-report.ts [matches=120]
 */
import { CLASS_IDS, CLASSES } from './config.ts';
import { runMatch } from './match.ts';
import { SKILLS } from './kits.ts';

const M = Number(process.argv[2] ?? 120);
const all = Array.from({ length: M }, (_, i) => runMatch(5000 + i).players).flat();
const avg = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
for (const c of CLASS_IDS) {
  const ps = all.filter((p) => p.cls === c);
  const base = avg(ps.map((p) => p.place));
  const rows = Object.values(SKILLS)
    .filter((s) => s.cls === c)
    .map((s) => {
      const own = ps.filter((p) => p.skills.some((k) => k.startsWith(s.id)));
      return { name: s.name, n: own.length, d: own.length ? avg(own.map((p) => p.place)) - base : NaN };
    })
    .sort((a, b) => a.d - b.d);
  console.log(`${CLASSES[c].name} (ort sıra ${base.toFixed(1)}): ${rows.map((r) => `${r.name} ${r.d >= 0 ? '+' : ''}${r.d.toFixed(1)}`).join(', ')}`);
}
