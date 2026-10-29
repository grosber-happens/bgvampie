/**
 * Replays the 8-build arena tournament from results/builds.json (same builds, same seeds).
 * Compare with and without the Gölge izi fade:
 *   TUNED=1 FADE=1 node --experimental-strip-types --no-warnings sim/fade-test.ts [repeats=200] [arena=50]
 */
import { readFileSync } from 'node:fs';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { CLASS_IDS, type ClassId } from './config.ts';
import './tuning.ts';
import { STYLES } from './kits.ts';
import { runDuel } from './match.ts';

const LEVELS = [3, 5, 7, 9, 12];
const data = JSON.parse(readFileSync(new URL('./results/builds.json', import.meta.url), 'utf8'));
const builds = data.builds.map((b: any) => {
  const cls = CLASS_IDS.find((c) => b.label.toLowerCase().startsWith(c)) as ClassId;
  const sid = b.label.split(':')[0].split(' ').slice(1).join(' ');
  return { name: b.name, cls, style: STYLES[cls].findIndex((s) => s.id === sid), picks: b.picks };
});
const nums = process.argv.slice(2).filter((a) => /^\d+$/.test(a)).map(Number);
const REPEATS: number = isMainThread ? (nums[0] ?? 200) : workerData.repeats;
const ARENA: number = isMainThread ? (nums[1] ?? 50) : workerData.arena;

if (!isMainThread) {
  const { li } = workerData as { li: number };
  const n = builds.length;
  const wins = builds.map(() => builds.map(() => 0));
  // Same seed scheme as builds.ts so FADE=0 reproduces its numbers.
  let id = li * ((n * (n - 1)) / 2) * REPEATS;
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++)
      for (let k = 0; k < REPEATS; k++) {
        const flip = k % 2 === 1;
        const [A, B] = flip ? [builds[j], builds[i]] : [builds[i], builds[j]];
        const r = runDuel(900000 + id++ * 13, A.cls, B.cls, LEVELS[li], A.style, B.style, { builds: [A.picks, B.picks], arena: ARENA });
        const iWon = r.winner === -1 ? 0.5 : (r.winner === 0) !== flip ? 1 : 0;
        wins[i][j] += iWon;
        wins[j][i] += 1 - iWon;
      }
  parentPort!.postMessage(wins);
} else {
  const run = (li: number) =>
    new Promise<number[][]>((res, rej) => {
      const w = new Worker(new URL(import.meta.url), { workerData: { li, repeats: REPEATS, arena: ARENA }, execArgv: ['--experimental-strip-types', '--no-warnings'] });
      w.on('message', res);
      w.on('error', rej);
    });
  const all = await Promise.all(LEVELS.map((_, li) => run(li)));
  const n = builds.length;
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const games = (n - 1) * REPEATS;
  console.log(`Gölge izi silik görüntü: ${process.env.FADE === '1' ? 'AÇIK' : 'kapalı'} · ${REPEATS} tekrar · ${ARENA} m arena`);
  console.log(`${'Build'.padEnd(11)}${LEVELS.map((l) => `L${l}`.padEnd(7)).join('')}Toplam`);
  const tot = builds.map((_: any, i: number) => all.reduce((s, w) => s + w[i].reduce((a, b) => a + b, 0), 0));
  for (const i of builds.map((_: any, i: number) => i).sort((a: number, b: number) => tot[b] - tot[a]))
    console.log(`${builds[i].name.padEnd(11)}${all.map((w) => pct(w[i].reduce((a, b) => a + b, 0) / games).padEnd(7)).join('')}${pct(tot[i] / (games * LEVELS.length))}`);
  const cls = CLASS_IDS.map((c) => {
    const idx = builds.map((b: any, i: number) => (b.cls === c ? i : -1)).filter((i: number) => i >= 0);
    return `${c} ${pct(idx.reduce((s: number, i: number) => s + tot[i], 0) / (idx.length * games * LEVELS.length))}`;
  });
  console.log(`Sınıflar: ${cls.join(' · ')}`);
  console.log(`\nRogue eşleşmeleri (satırdaki build'in kazanma oranı):`);
  console.log(`${''.padEnd(11)}${builds.map((b: any) => b.name.padEnd(11)).join('')}`);
  for (let i = 0; i < 2; i++)
    console.log(`${builds[i].name.padEnd(11)}${builds.map((_: any, j: number) => (i === j ? '-' : pct(all.reduce((s, w) => s + w[i][j], 0) / (REPEATS * LEVELS.length))).padEnd(11)).join('')}`);
}
