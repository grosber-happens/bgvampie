/**
 * Gear balance: armor weights per class, class balance with gear, rarity gap, fight length, bandage in matches.
 *   TUNED=1 node --experimental-strip-types --no-warnings sim/gear-test.ts [repeats=60] [matches=40]
 * Uses the user's 8 builds (results/user-builds.json) in the 50 m arena with cover, levels 7 and 12.
 */
import { readFileSync } from 'node:fs';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { CLASS_IDS, type ClassId } from './config.ts';
import './tuning.ts';
import { STYLES } from './kits.ts';
import { runDuel, runMatch } from './match.ts';
import { BAND_TOTALS, kitLoadout } from './gear.ts';
import { WEARS, type Loadout, type Rarity } from '../src/gear.ts';

type Build = { name: string; cls: ClassId; style: number; picks: string[]; plan?: string; melee: boolean };
const data = JSON.parse(readFileSync(new URL('./results/user-builds.json', import.meta.url), 'utf8'));
const MELEE = new Set((process.env.MELEE_HAND ?? 'Rogue-yakın,Mage-yakın,Fighter-yakın').split(','));
const builds: Build[] = data.builds.map((b: any) => {
  const cls = CLASS_IDS.find((c) => b.label.toLowerCase().startsWith(c)) as ClassId;
  const sid = b.label.split(':')[0].split(' ').slice(1).join(' ');
  return { name: b.name, cls, style: STYLES[cls].findIndex((s) => s.id === sid), picks: b.picks, plan: b.plan, melee: MELEE.has(b.name) };
});
type W = 'light' | 'medium' | 'heavy' | 'noir' | 'none';
/** The armor weight each build would wear. */
const NATURAL: Record<string, W> = { 'Rogue-yakın': 'light', 'Rogue-kopya': 'light', 'Mage-yakın': 'medium', 'Mage-uzak': 'light', 'Fighter-yakın': 'medium', 'Fighter-uzak': 'medium', 'Scout-pençe': 'light', 'Scout-pet': 'medium' };
/** Necklace + ring each build would pick. */
const JEWELS: Record<string, [string, string]> = {
  'Rogue-yakın': ['n_ember', 'r_shadow'],
  'Rogue-kopya': ['n_pulse', 'r_flint'],
  'Mage-yakın': ['n_ember', 'r_blood'],
  'Mage-uzak': ['n_ember', 'r_blood'],
  'Fighter-yakın': ['n_pulse', 'r_flint'],
  'Fighter-uzak': ['n_ember', 'r_stitch'],
  'Scout-pençe': ['n_ember', 'r_blood'],
  'Scout-pet': ['n_pulse', 'r_stitch'],
};
const DROP = (process.env.DROP_SLOTS ?? '').split(',').filter(Boolean);
const load = (b: Build, w: W, r: Rarity, j?: [string, string]): Loadout | null => {
  if (w === 'none') return null;
  if (w === 'nat' as W) w = NATURAL[b.name];
  const l = kitLoadout(b.cls, w, r, b.melee ? 'melee' : 'ranged', j ?? JEWELS[b.name]);
  for (const s of DROP) delete (l as any)[s];
  return l;
};
const LEVELS = [7, 12];

type Side = { b: number; w: W; r: Rarity; j?: [string, string] };
type Job = { pairs: [Side, Side][]; repeats: number; seed: number };

function duel(A: Side, B: Side, k: number, seed: number, level: number) {
  const a = builds[A.b];
  const b = builds[B.b];
  const flip = k % 2 === 1;
  const [x, y] = flip ? [B, A] : [A, B];
  const [bx, by] = flip ? [b, a] : [a, b];
  const r = runDuel(seed, bx.cls, by.cls, level, bx.style, by.style, { builds: [bx.picks, by.picks], plans: [bx.plan, by.plan], arena: 50, gear: [load(bx, x.w, x.r, x.j), load(by, y.w, y.r, y.j)] });
  const aWon = r.winner === -1 ? 0.5 : (r.winner === 0) !== flip ? 1 : 0;
  return { aWon, time: r.time };
}

if (!isMainThread) {
  const job = workerData as Job;
  const out = job.pairs.map(([A, B], pi) => {
    let w = 0;
    let t = 0;
    let n = 0;
    for (const level of LEVELS)
      for (let k = 0; k < job.repeats; k++) {
        const r = duel(A, B, k, job.seed + pi * 7919 + level * 131 + k * 17, level);
        w += r.aWon;
        t += r.time;
        n++;
      }
    return { w: w / n, t: t / n };
  });
  parentPort!.postMessage(out);
} else {
  const nums = process.argv.slice(2).filter((a) => /^\d+$/.test(a)).map(Number);
  const R = nums[0] ?? 60;
  const M = nums[1] ?? 40;
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  async function runPairs(pairs: [Side, Side][], seed: number) {
    const idx = [0, 1, 2, 3].map((c) => pairs.map((_, i) => i).filter((i) => i % 4 === c));
    const parts = await Promise.all(
      idx.map(
        (ids, c) =>
          new Promise<{ w: number; t: number }[]>((res, rej) => {
            const w = new Worker(new URL(import.meta.url), { workerData: { pairs: ids.map((i) => pairs[i]), repeats: R, seed: seed + c * 100003 }, execArgv: ['--experimental-strip-types', '--no-warnings'] });
            w.on('message', res);
            w.on('error', rej);
          }),
      ),
    );
    const out: { w: number; t: number }[] = new Array(pairs.length);
    idx.forEach((ids, c) => ids.forEach((i, j) => (out[i] = parts[c][j])));
    return out;
  }
  const natural: Record<ClassId, W> = { rogue: 'light', mage: 'light', fighter: 'medium', scout: 'light' };
  const t0 = Date.now();
  const only = process.env.ONLY ?? 'abcd';

  // A) Armor weights: each build in each weight it can wear (epic) vs every other build in its natural weight (epic).
  if (only.includes('a')) {
    console.log(`\nA) Zırh ağırlığı (destansı set, rakipler kendi doğal ağırlığında), L7+L12, ${R} tekrar`);
    const pairs: [Side, Side][] = [];
    const meta: { b: number; w: W }[] = [];
    builds.forEach((b, i) => {
      for (const w of [...WEARS[b.cls], 'noir'] as W[])
        builds.forEach((o, j) => {
          if (j === i) return;
          pairs.push([{ b: i, w, r: 'epic' }, { b: j, w: 'nat' as W, r: 'epic' }]);
          meta.push({ b: i, w });
        });
    });
    const res = await runPairs(pairs, 11);
    const rows = new Map<string, number[]>();
    res.forEach((r, i) => {
      const key = `${builds[meta[i].b].name}|${meta[i].w}`;
      rows.set(key, [...(rows.get(key) ?? []), r.w]);
    });
    for (const b of builds) console.log(`${b.name.padEnd(14)} ${[...WEARS[b.cls], 'noir'].map((w) => `${w} ${pct(avg(rows.get(`${b.name}|${w}`)!))}`).join('  ')}`);
  }

  // J) Best necklace + ring per build.
  if (only.includes('j')) {
    console.log(`\nJ) Kolye + yüzük taraması (doğal destansı set)`);
    const N = ['n_ember', 'n_clock', 'n_halo', 'n_pulse'];
    const Rg = ['r_blood', 'r_flint', 'r_shadow', 'r_stitch'];
    for (const [i, b] of builds.entries()) {
      const pairs: [Side, Side][] = [];
      const combos: [string, string][] = [];
      for (const n of N) for (const r of Rg) combos.push([n, r]);
      for (const c of combos) builds.forEach((_, j) => j !== i && pairs.push([{ b: i, w: 'nat' as W, r: 'epic', j: c }, { b: j, w: 'nat' as W, r: 'epic' }]));
      const res = await runPairs(pairs, 53);
      const per = combos.map((c, k) => ({ c, w: avg(res.slice(k * 7, k * 7 + 7).map((r) => r.w)) })).sort((a, b) => b.w - a.w);
      console.log(`${b.name.padEnd(14)} ${per.slice(0, 4).map((p) => `${p.c.join('+')} ${pct(p.w)}`).join('  ')}  ... en kötü ${per[per.length - 1].c.join('+')} ${pct(per[per.length - 1].w)}`);
    }
  }

  // B) Class balance: everyone in natural epic gear vs everyone without gear.
  if (only.includes('b')) {
    for (const [label, w] of [['eşyasız', 'none'], ['doğal destansı', 'nat']] as const) {
      const pairs: [Side, Side][] = [];
      for (let i = 0; i < builds.length; i++) for (let j = i + 1; j < builds.length; j++) pairs.push([{ b: i, w: w === 'none' ? 'none' : ('nat' as W), r: 'epic' }, { b: j, w: w === 'none' ? 'none' : ('nat' as W), r: 'epic' }]);
      const res = await runPairs(pairs, 23);
      const score = builds.map(() => [] as number[]);
      const times: number[] = [];
      res.forEach((r, k) => {
        const [A, B] = pairs[k];
        score[A.b].push(r.w);
        score[B.b].push(1 - r.w);
        times.push(r.t);
      });
      const cls = CLASS_IDS.map((c) => `${c} ${pct(avg(builds.flatMap((b, i) => (b.cls === c ? score[i] : []))))}`).join(' · ');
      console.log(`\nB) ${label}: ${cls} · ortalama düello ${avg(times).toFixed(1)} sn`);
      console.log('   ' + builds.map((b, i) => `${b.name} ${pct(avg(score[i]))}`).join(', '));
    }
  }

  // C) Rarity gap: same build, legendary vs common (and epic vs rare).
  if (only.includes('c')) {
    const gap = async (hi: Rarity, lo: Rarity) => {
      const pairs = builds.map((b, i) => [{ b: i, w: 'nat' as W, r: hi }, { b: i, w: 'nat' as W, r: lo }] as [Side, Side]);
      const res = await runPairs(pairs, 37);
      return avg(res.map((r) => r.w));
    };
    console.log(`\nC) Nadirlik farkı (aynı build): efsanevi > sıradan ${pct(await gap('legendary', 'common'))}, destansı > nadir ${pct(await gap('epic', 'rare'))}`);
    const nog = builds.map((b, i) => [{ b: i, w: 'nat' as W, r: 'common' }, { b: i, w: 'none', r: 'common' }] as [Side, Side]);
    const r2 = await runPairs(nog, 41);
    console.log(`   sıradan set > eşyasız ${pct(avg(r2.map((r) => r.w)))}`);
  }

  // D) Full matches: drops on, bandage on/off.
  if (only.includes('d')) {
    console.log(`\nD) Tam maç (${M} maç, eşya düşmeleri açık)`);
    const seeds = Array.from({ length: M }, (_, i) => 5000 + i);
    const results = seeds.map((s) => runMatch(s));
    const mins = avg(results.map((r) => r.minutes));
    const wins = CLASS_IDS.map((c) => `${c} ${pct(results.filter((r) => r.winner === c).length / M)}`).join(' · ');
    console.log(`   süre ort ${mins.toFixed(1)} dk · kazanan sınıf: ${wins}`);
    runDuel(1, 'rogue', 'mage', 1); // flushes the last match into the totals
    const T = BAND_TOTALS;
    if (T.players) console.log(`   bandaj: oyuncu başına ${(T.uses / T.players).toFixed(1)} kez, %${Math.round((T.broken / Math.max(1, T.uses)) * 100)} yarıda kaldı, oyuncu başına ${Math.round(T.heal / T.players)} can`);
    const kills = avg(results.map((r) => r.players.reduce((s, p) => s + p.kills, 0)));
    const lv = avg(results.map((r) => r.players.find((p) => p.place === 1)!.level));
    console.log(`   maç başına oyuncu öldürme ${kills.toFixed(1)}, kazananın seviyesi ${lv.toFixed(1)}`);
  }
  console.log(`\n${((Date.now() - t0) / 1000).toFixed(0)} sn`);
}

function avg(a: number[]) {
  return a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN;
}
