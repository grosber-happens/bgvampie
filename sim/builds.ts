/**
 * Finds 2 strong builds per class, then runs a 1v1 tournament between the 8 builds
 * in a small round arena (no mobs) at levels 3, 5, 7, 9 and 12.
 *   TUNED=1 node --experimental-strip-types --no-warnings sim/builds.ts [repeats=2] [arena radius=50] [--json out.json]
 *
 * A build is a playstyle plus 5 skills, levelled in this order (index = skill slot):
 *   L1 s1, L2 s2, L3 s3, L4 s1, L5 s2, L6 s3, L7 s1 (tier 3), L8 s4, L9 s5, L10 s2 (tier 3), L11 s4, L12 s3 (tier 3)
 * which ends at s1 3, s2 3, s3 3, s4 2, s5 1 (12 points) and follows the tier-3 rule.
 */
import { writeFileSync } from 'node:fs';
import { CLASS_IDS, CLASSES, type ClassId } from './config.ts';
import { POOL, SKILLS, STYLES } from './kits.ts';
import { runDuel } from './match.ts';
import { seeded } from './core.ts';

const ORDER = [0, 1, 2, 0, 1, 2, 0, 3, 4, 1, 3, 2];
const LEVELS = [3, 5, 7, 9, 12];
const args = process.argv.slice(2);
const nums = args.filter((a) => /^\d+$/.test(a)).map(Number);
const REPEATS = nums[0] ?? 2;
const ARENA = nums[1] ?? 50;
const jsonOut = args.includes('--json') ? args[args.indexOf('--json') + 1] : null;

type Build = { cls: ClassId; style: number; skills: string[]; picks: string[]; score?: number; byLevel?: number[] };
const picksOf = (skills: string[]) => ORDER.map((i) => skills[i]);
const label = (b: Build) => `${CLASSES[b.cls].name} ${STYLES[b.cls][b.style].id}: ${b.skills.map((s) => SKILLS[s].name).join(' > ')}`;
const avg = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
const pct = (x: number) => `${Math.round(x * 100)}%`;

/** Win share of build `b` against random builds of every class (random style, random cards). */
function vsField(b: Build, perLevel: number, seed: number): number[] {
  return LEVELS.map((level, li) => {
    let w = 0;
    for (let k = 0; k < perLevel; k++) {
      const opp = CLASS_IDS[k % 4];
      const flip = k % 2 === 1;
      const s = seed + li * 7919 + k * 31;
      const r = flip
        ? runDuel(s, opp, b.cls, level, undefined, b.style, { builds: [null, b.picks], arena: ARENA })
        : runDuel(s, b.cls, opp, level, b.style, undefined, { builds: [b.picks, null], arena: ARENA });
      if (r.winner === -1) w += 0.5;
      else if ((r.winner === 0) !== flip) w += 1;
    }
    return w / perLevel;
  });
}

// ---- 1. Search ------------------------------------------------------------
/**
 * Build 1 per class: the strongest build found with no limits.
 * Build 2 per class: the strongest build that fits the user's theme for that class.
 */
const THEMES: Record<ClassId, { name: string; styles: number[]; must: string[] }> = {
  rogue: { name: 'kopya odaklı', styles: [2], must: ['decoy', 'detonate', 'insane'] },
  mage: { name: 'yakın dövüş', styles: [0], must: ['arms'] },
  fighter: { name: 'mızrak', styles: [1], must: ['rain'] },
  scout: { name: 'sniper + yoldaş', styles: [2, 0], must: ['fast', 'pack'] },
};

const rand = seeded(42);
const chosen: Build[] = [];
const buildTags: string[] = [];
const searchLog: Record<string, { label: string; score: number; byLevel: number[] }[]> = {};

function candidates(cls: ClassId, styles: number[], must: string[], count: number): Build[] {
  const out: Build[] = [];
  const seen = new Set<string>();
  for (let tries = 0; out.length < count && tries < count * 20; tries++) {
    const style = styles[Math.floor(rand() * styles.length)];
    const start = STYLES[cls][style].skill;
    const rest = must.filter((m) => m !== start);
    const others = POOL[cls].filter((s) => s !== start && !rest.includes(s));
    while (rest.length < 4) rest.push(others.splice(Math.floor(rand() * others.length), 1)[0]);
    // Random order of the 4 other skills (order decides which reach tier 3).
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    const skills = [start, ...rest];
    const key = `${style}|${skills.join(',')}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ cls, style, skills, picks: picksOf(skills) });
  }
  return out;
}

function best(cands: Build[], keep: number): Build[] {
  for (const c of cands) c.score = avg(vsField(c, 16, 1000));
  cands.sort((a, b) => b.score! - a.score!);
  const top = cands.slice(0, keep);
  for (const c of top) {
    c.byLevel = vsField(c, 120, 50000);
    c.score = avg(c.byLevel);
  }
  return top.sort((a, b) => b.score! - a.score!);
}

console.log(`Build araması (arena yarıçapı ${ARENA} m, rakip: her sınıftan rastgele build'ler)`);
for (const cls of CLASS_IDS) {
  const free = best(candidates(cls, [0, 1, 2], [], 120), 6);
  const th = THEMES[cls];
  const themed = best(candidates(cls, th.styles, th.must, 60), 6);
  const first = free[0];
  const second = themed.find((c) => c.style !== first.style || c.skills.join() !== first.skills.join()) ?? themed[0];
  chosen.push(first, second);
  buildTags.push('Claude', `tema: ${th.name}`);
  searchLog[cls] = [...free, ...themed].map((c) => ({ label: label(c), score: c.score!, byLevel: c.byLevel! }));
  console.log(`\n${CLASSES[cls].name}, serbest arama, en iyi 6:`);
  for (const c of free) console.log(`  ${pct(c.score!).padEnd(5)} ${label(c)}  [${c.byLevel!.map(pct).join(' ')}]`);
  console.log(`${CLASSES[cls].name}, tema "${th.name}", en iyi 6:`);
  for (const c of themed) console.log(`  ${pct(c.score!).padEnd(5)} ${label(c)}  [${c.byLevel!.map(pct).join(' ')}]`);
}

// ---- 2. Tournament --------------------------------------------------------
const names = chosen.map((b, i) => `${CLASSES[b.cls].name}-${(i % 2) + 1}`);
console.log(`\nSeçilen 8 build:`);
chosen.forEach((b, i) => console.log(`  ${names[i].padEnd(10)} (${buildTags[i]}) ${label(b)}`));

function tournament(repeats: number) {
  const n = chosen.length;
  // wins[level][i][j] = duels i won against j (draws count half).
  const wins = LEVELS.map(() => chosen.map(() => chosen.map(() => 0)));
  let id = 0;
  LEVELS.forEach((level, li) => {
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++)
        for (let k = 0; k < repeats; k++) {
          const flip = k % 2 === 1;
          const [A, B] = flip ? [chosen[j], chosen[i]] : [chosen[i], chosen[j]];
          const r = runDuel(900000 + id++ * 13, A.cls, B.cls, level, A.style, B.style, { builds: [A.picks, B.picks], arena: ARENA });
          const iWon = r.winner === -1 ? 0.5 : (r.winner === 0) !== flip ? 1 : 0;
          wins[li][i][j] += iWon;
          wins[li][j][i] += 1 - iWon;
        }
  });
  return wins;
}

function printTournament(title: string, repeats: number, wins: number[][][]) {
  const n = chosen.length;
  console.log(`\n=== ${title} ===`);
  const games = (n - 1) * repeats;
  console.log(`Her build seviye başına ${games} düello yapar. Tablo: kazanılan düello sayısı (yüzde).`);
  console.log(`${'Build'.padEnd(11)}${LEVELS.map((l) => `L${l}`.padEnd(11)).join('')}Toplam`);
  const totals = chosen.map((_, i) => wins.reduce((s, w) => s + w[i].reduce((a, b) => a + b, 0), 0));
  const order = chosen.map((_, i) => i).sort((a, b) => totals[b] - totals[a]);
  for (const i of order) {
    const cells = LEVELS.map((_, li) => {
      const w = wins[li][i].reduce((a, b) => a + b, 0);
      return `${w}/${games} ${pct(w / games)}`.padEnd(11);
    });
    console.log(`${names[i].padEnd(11)}${cells.join('')}${totals[i]}/${games * LEVELS.length} ${pct(totals[i] / (games * LEVELS.length))}`);
  }
  const clsTotals = CLASS_IDS.map((c) => {
    const idx = chosen.map((b, i) => (b.cls === c ? i : -1)).filter((i) => i >= 0);
    return { c, v: idx.reduce((s, i) => s + totals[i], 0) / (idx.length * games * LEVELS.length) };
  }).sort((a, b) => b.v - a.v);
  console.log(`Sınıf sıralaması: ${clsTotals.map((x) => `${CLASSES[x.c].name} ${pct(x.v)}`).join(' · ')}`);
  return { totals, order };
}

const small = tournament(REPEATS);
const res = printTournament(`Turnuva: her eşleşme ${REPEATS} kez (yan değiştirerek), ${ARENA} m yarıçaplı arena`, REPEATS, small);
const BIG = 200;
const big = tournament(BIG);
printTournament(`Güven kontrolü: aynı turnuva, her eşleşme ${BIG} kez`, BIG, big);

// Matchup table at every level from the big run.
console.log(`\nEşleşme tablosu (${BIG} düello, tüm seviyelerin ortalaması; satırdaki build'in kazanma oranı):`);
console.log(`${''.padEnd(11)}${names.map((n) => n.padEnd(11)).join('')}`);
for (let i = 0; i < chosen.length; i++) {
  const row = chosen.map((_, j) => (i === j ? '-' : pct(big.reduce((s, w) => s + w[i][j], 0) / (BIG * LEVELS.length))));
  console.log(`${names[i].padEnd(11)}${row.map((c) => c.padEnd(11)).join('')}`);
}

if (jsonOut)
  writeFileSync(
    jsonOut,
    JSON.stringify({ arena: ARENA, levels: LEVELS, builds: chosen.map((b, i) => ({ name: names[i], label: label(b), picks: b.picks })), search: searchLog, tournament: small, big }, null, 1),
  );
void res;
