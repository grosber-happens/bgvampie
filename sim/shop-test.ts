/**
 * Vendor machines, prices and the S4 movement in full matches.
 *   TUNED=1 node --experimental-strip-types --no-warnings sim/shop-test.ts [matches=60]
 * Runs each setup on 4 threads (env per setup) and prints match length, class wins and the economy.
 * SETUPS=a,b,... picks setups by key (default: all).
 */
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { CLASS_IDS } from './config.ts';

type Setup = { key: string; name: string; env: Record<string, string> };
const SETUPS: Setup[] = [
  { key: 'old', name: 'Eski model (hareket yok, dükkan yok)', env: { MOVE: '0', SHOP: '0' } },
  { key: 'move', name: 'Yeni hareket, dükkan yok', env: { MOVE: '1', SHOP: '0' } },
  { key: 'nospec', name: 'Yeni hareket ama sağ tık özel yok, dükkan yok', env: { MOVE: '1', SPECIALS: '0', SHOP: '0' } },
  { key: 'c300', name: 'Hareket + dükkan, kapsama 300 m', env: { MOVE: '1', SHOP: '1', COVER: '300' } },
  { key: 'c200', name: 'Hareket + dükkan, kapsama 200 m', env: { MOVE: '1', SHOP: '1', COVER: '200' } },
  { key: 'c150', name: 'Hareket + dükkan, kapsama 150 m', env: { MOVE: '1', SHOP: '1', COVER: '150' } },
  { key: 'c100', name: 'Hareket + dükkan, kapsama 100 m', env: { MOVE: '1', SHOP: '1', COVER: '100' } },
  { key: 'fixA', name: 'Hareket + dükkan (200 m) + öneri A (kalkan 0.6 sn, hızlı sniper)', env: { MOVE: '1', SHOP: '1', COVER: '200', VARIANT: 'mv_shield2,mv_sniper' } },
];

if (!isMainThread) {
  const { seeds } = workerData as { seeds: number[] };
  await import('./tuning.ts');
  const { runMatch } = await import('./match.ts');
  const shop = await import('./shop.ts');
  const out = seeds.map((s) => {
    const r = runMatch(s);
    return { ...r, vendors: shop.vendors.length };
  });
  parentPort!.postMessage({ out, nearest: shop.SHOP_TOTALS.nearest, nearestN: shop.SHOP_TOTALS.nearestN });
} else {
  const nums = process.argv.slice(2).filter((a) => /^\d+$/.test(a)).map(Number);
  const M = nums[0] ?? 60;
  const pick = (process.env.SETUPS ?? '').split(',').filter(Boolean);
  const avg = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const t0 = Date.now();
  for (const S of SETUPS.filter((s) => !pick.length || pick.includes(s.key))) {
    const seeds = Array.from({ length: M }, (_, i) => 5000 + i);
    const parts = await Promise.all(
      [0, 1, 2, 3].map(
        (c) =>
          new Promise<any>((res, rej) => {
            const w = new Worker(new URL(import.meta.url), {
              workerData: { seeds: seeds.filter((_, i) => i % 4 === c) },
              env: { ...process.env, ...S.env },
              execArgv: ['--experimental-strip-types', '--no-warnings'],
            });
            w.on('message', res);
            w.on('error', rej);
          }),
      ),
    );
    const R = parts.flatMap((p) => p.out);
    const near = parts.reduce((s, p) => s + p.nearest, 0) / Math.max(1, parts.reduce((s, p) => s + p.nearestN, 0));
    const P = R.flatMap((r: any) => r.players.map((p: any) => ({ ...p, len: r.minutes })));
    const top = P.filter((p: any) => p.place <= 5);
    const wins = CLASS_IDS.map((c) => `${c} ${pct(R.filter((r: any) => r.winner === c).length / R.length)}`).join(' · ');
    console.log(`\n== ${S.name} (${R.length} maç${R[0].vendors ? `, ${R[0].vendors} makine` : ''})`);
    console.log(`   süre ${avg(R.map((r: any) => r.minutes)).toFixed(1)} dk · kazanan: ${wins}`);
    console.log(`   maç başına oyuncu öldürme ${avg(R.map((r: any) => r.players.reduce((s: number, p: any) => s + p.kills, 0))).toFixed(1)} · kazananın seviyesi ${avg(R.map((r: any) => r.players.find((p: any) => p.place === 1).level)).toFixed(1)}`);
    console.log(`   sınıf ortalama sıra: ${CLASS_IDS.map((c) => `${c} ${avg(P.filter((p: any) => p.cls === c).map((p: any) => p.place)).toFixed(1)}`).join(' · ')}`);
    console.log(`   para: kazanılan ${avg(P.map((p: any) => p.earned)).toFixed(0)} (ilk 5: ${avg(top.map((p: any) => p.earned)).toFixed(0)}) · harcanan dükkânda ${avg(P.map((p: any) => p.spent)).toFixed(0)} (ilk 5: ${avg(top.map((p: any) => p.spent)).toFixed(0)}) · ölünce cepte kalan ${avg(P.map((p: any) => p.left)).toFixed(0)}`);
    if (R[0].vendors)
      console.log(`   dükkân: oyuncu başına ${avg(P.map((p: any) => p.visits)).toFixed(1)} ziyaret, ${avg(P.map((p: any) => p.bought)).toFixed(1)} eşya (ilk 5: ${avg(top.map((p: any) => p.bought)).toFixed(1)}), makineye yürüme ${avg(P.map((p: any) => p.shopWalk)).toFixed(0)} m · en yakın makine ort. ${near.toFixed(0)} m`);
    console.log(`   eşya puanı (ilk 5, maç sonu): ${avg(top.map((p: any) => p.gearScore)).toFixed(0)}`);
    console.log(`   hareket: oyuncu başına ${avg(P.map((p: any) => p.dodges)).toFixed(1)} dodge, ${avg(P.map((p: any) => p.stunBreaks)).toFixed(1)} sersemlikten kaçış, ${avg(P.map((p: any) => p.specials)).toFixed(1)} sağ tık özel, ${avg(P.map((p: any) => p.sprintTime / 60)).toFixed(1)} dk sprint`);
  }
  console.log(`\n${((Date.now() - t0) / 1000).toFixed(0)} sn`);
}
