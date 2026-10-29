/**
 * Fast tuning summary: runs matches and duels on 4 threads and prints the key numbers.
 *   node --experimental-strip-types --no-warnings sim/quick.ts [matches=80] [duels=80]
 */
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { CLASS_IDS, CLASSES, type ClassId } from './config.ts';
import { runDuel, runMatch, type MatchResult } from './match.ts';

type Job = { kind: 'match'; seeds: number[] } | { kind: 'duel'; level: number; pairs: [number, number][]; n: number };

if (!isMainThread) {
  const job = workerData as Job;
  if (job.kind === 'match') parentPort!.postMessage(job.seeds.map((s) => runMatch(s)));
  else {
    const out: Record<string, number> = {};
    for (const [i, j] of job.pairs) {
      const a = CLASS_IDS[i];
      const b = CLASS_IDS[j];
      let wa = 0;
      for (let k = 0; k < job.n; k++) {
        const flip = k % 2 === 1;
        const r = runDuel(7919 + job.level * 131 + i * 17 + j * 3 + k * 101, flip ? b : a, flip ? a : b, job.level);
        if (r.winner === -1) wa += 0.5;
        else if ((r.winner === 0) !== flip) wa += 1;
      }
      out[`${a}|${b}`] = wa / job.n;
    }
    parentPort!.postMessage(out);
  }
} else {
  const nums = process.argv.slice(2).filter((a) => /^\d+$/.test(a)).map(Number);
  const M = nums[0] ?? 80;
  const D = nums[1] ?? 80;
  const run = (job: Job) =>
    new Promise<any>((res, rej) => {
      const w = new Worker(new URL(import.meta.url), { workerData: job, execArgv: ['--experimental-strip-types', '--no-warnings'] });
      w.on('message', res);
      w.on('error', rej);
    });
  const avg = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const seeds = Array.from({ length: M }, (_, i) => 1000 + i);
  const chunks = [0, 1, 2, 3].map((k) => seeds.filter((_, i) => i % 4 === k));
  const pairs: [number, number][] = [];
  for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) pairs.push([i, j]);
  const t0 = Date.now();
  const [matchParts, ...duels] = await Promise.all([
    Promise.all(chunks.map((s) => run({ kind: 'match', seeds: s }))),
    ...(D > 0 ? [3, 7, 12].map((level) => run({ kind: 'duel', level, pairs, n: D })) : []),
  ]);
  const results: MatchResult[] = matchParts.flat();
  const all = results.flatMap((r) => r.players);
  console.log(`${M} maç, ${((Date.now() - t0) / 1000).toFixed(0)} sn. Süre ort ${avg(results.map((r) => r.minutes)).toFixed(1)} dk`);
  const line = (c: ClassId) => {
    const ps = all.filter((p) => p.cls === c);
    const deaths = ps.filter((p) => p.place > 1).length;
    const kills = all.filter((p) => p.killedBy === c).length;
    const styles = [...new Set(ps.map((p) => p.style))]
      .map((s) => {
        const sp = ps.filter((p) => p.style === s);
        return `${s} ${avg(sp.map((p) => p.place)).toFixed(1)}`;
      })
      .join(', ');
    return `${CLASSES[c].name.padEnd(8)} kazanma ${pct(results.filter((r) => r.winner === c).length / M).padEnd(5)} sıra ${avg(ps.map((p) => p.place)).toFixed(1)}  K/D ${(kills / Math.max(1, deaths)).toFixed(2)}  tarz sırası: ${styles}`;
  };
  for (const c of CLASS_IDS) console.log(line(c));
  const lv = [10, 15, 20, 25].map((m) => `${m}dk ${avg(results.flatMap((r) => CLASS_IDS.flatMap((c) => r.levelByMinute[m]?.[c] ?? []))).toFixed(1)}`);
  const firstL12 = results.map((r) => Math.min(...r.players.map((p) => p.levelAt[12] || Infinity))).filter(Number.isFinite);
  const winners = results.map((r) => r.players.find((p) => p.place === 1)!);
  console.log(`Seviye (yaşayanlar): ${lv.join(' · ')} | ilk L12 ort ${avg(firstL12).toFixed(1)} dk (${firstL12.length}/${M} maç) | kazanan seviyesi ${avg(winners.map((w) => w.level)).toFixed(1)}`);
  const xp = ['mob', 'player', 'boss'].map((k) => avg(all.map((p) => (p.xpBy as Record<string, number>)[k])));
  const xs = xp.reduce((a, b) => a + b, 0);
  console.log(`XP payı: mob ${pct(xp[0] / xs)}, oyuncu ${pct(xp[1] / xs)}, boss ${pct(xp[2] / xs)}`);
  const bossKeys = [...new Set(results.flatMap((r) => r.bosses.map((b) => `${b.spawn}|${b.name}`)))];
  console.log(
    'Boss öldürülme: ' +
      bossKeys
        .map((k) => {
          const [sp, n] = k.split('|');
          const bs = results.flatMap((r) => r.bosses.filter((b) => b.name === n && String(b.spawn) === sp));
          return `${sp}dk ${n} ${pct(bs.filter((b) => b.killedAt !== null).length / bs.length)}`;
        })
        .join(', '),
  );
  if (D > 0) {
    [3, 7, 12].forEach((level, li) => {
      const t = duels[li] as Record<string, number>;
      const score = (c: ClassId) => avg(CLASS_IDS.filter((o) => o !== c).map((o) => (t[`${c}|${o}`] !== undefined ? t[`${c}|${o}`] : 1 - t[`${o}|${c}`])));
      console.log(`Düello L${level}: ${CLASS_IDS.map((c) => `${CLASSES[c].name} ${pct(score(c))}`).join(' · ')}`);
    });
  }
}
