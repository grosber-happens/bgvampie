/**
 * Which items players pick up and when: source, rarity, minute, and whether they reach top-tier gear.
 *   TUNED=1 node --experimental-strip-types --no-warnings sim/items-test.ts [matches=96]
 * Uses the current defaults (S4 movement and vendor machines on). Runs on 4 threads.
 */
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { CLASS_IDS } from './config.ts';

if (!isMainThread) {
  const { seeds } = workerData as { seeds: number[] };
  await import('./tuning.ts');
  const { runMatch } = await import('./match.ts');
  parentPort!.postMessage(
    seeds.map((s) => {
      const r = runMatch(s);
      return { minutes: r.minutes, players: r.players.map((p) => ({ cls: p.cls, place: p.place, end: p.deathMin, level: p.level, gear: p.gear })) };
    }),
  );
} else {
  const M = Number(process.argv.slice(2).find((a) => /^\d+$/.test(a)) ?? 96);
  const seeds = Array.from({ length: M }, (_, i) => 5000 + i);
  const parts = await Promise.all(
    [0, 1, 2, 3].map(
      (c) =>
        new Promise<any[]>((res, rej) => {
          const w = new Worker(new URL(import.meta.url), { workerData: { seeds: seeds.filter((_, i) => i % 4 === c) }, execArgv: ['--experimental-strip-types', '--no-warnings'] });
          w.on('message', res);
          w.on('error', rej);
        }),
    ),
  );
  const R = parts.flat();
  const P = R.flatMap((r) => r.players.map((p: any) => ({ ...p, len: r.minutes })));
  const RAR = ['common', 'rare', 'epic', 'legendary'];
  const TR: Record<string, string> = { common: 'sıradan', rare: 'nadir', epic: 'destansı', legendary: 'efsanevi' };
  const SRC: Record<string, string> = { mob: 'mob', boss: 'boss', player: 'oyuncu', loot: 'leşten', shop: 'dükkân' };
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '-');
  const avg = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);
  const groups: [string, any[]][] = [
    ['kazanan', P.filter((p) => p.place === 1)],
    ['ilk 5', P.filter((p) => p.place <= 5)],
    ['6-10', P.filter((p) => p.place > 5 && p.place <= 10)],
    ['herkes', P],
  ];
  console.log(`${R.length} maç, ort. ${avg(R.map((r) => r.minutes)).toFixed(1)} dk\n`);

  console.log('## Maç sonu takılı eşyaların nadirliği (6 yuva)');
  for (const [name, g] of groups) {
    const cnt = Object.fromEntries(RAR.map((r) => [r, 0]));
    let empty = 0;
    for (const p of g) for (const slot of ['weapon', 'head', 'chest', 'legs', 'necklace', 'ring']) p.gear.load[slot] ? cnt[p.gear.load[slot]]++ : empty++;
    const tot = g.length * 6;
    const leg1 = g.filter((p) => Object.values(p.gear.load).includes('legendary')).length;
    const allEpic = g.filter((p) => ['weapon', 'head', 'chest', 'legs', 'necklace', 'ring'].every((s) => p.gear.load[s] === 'epic' || p.gear.load[s] === 'legendary')).length;
    console.log(`  ${name.padEnd(8)} boş ${pct(empty, tot)} · ${RAR.map((r) => `${TR[r]} ${pct(cnt[r], tot)}`).join(' · ')} · en az 1 efsanevi: ${pct(leg1, g.length)} · 6 yuva destansı+: ${pct(allEpic, g.length)}`);
  }

  console.log('\n## Yuvaya göre (kazanan, maç sonu)');
  const win = P.filter((p) => p.place === 1);
  for (const slot of ['weapon', 'head', 'chest', 'legs', 'necklace', 'ring']) {
    const v = win.map((p) => p.gear.load[slot]);
    console.log(`  ${slot.padEnd(8)} boş ${pct(v.filter((x) => !x).length, v.length)} · ${RAR.map((r) => `${TR[r]} ${pct(v.filter((x) => x === r).length, v.length)}`).join(' · ')}`);
  }

  console.log('\n## Ne zaman, nereden (ilk 5, takılan eşyalar)');
  const top = P.filter((p) => p.place <= 5);
  const picks = top.flatMap((p) => p.gear.log);
  const bands = [0, 5, 10, 15, 20, 25, 30];
  for (let i = 0; i < bands.length; i++) {
    const lo = bands[i];
    const hi = bands[i + 1] ?? 99;
    const b = picks.filter((x: any) => x.t >= lo && x.t < hi);
    if (!b.length) continue;
    const src = Object.keys(SRC).map((s) => `${SRC[s]} ${b.filter((x: any) => x.src === s).length}`).join(', ');
    console.log(`  ${String(lo).padStart(2)}-${hi === 99 ? '  ' : String(hi).padStart(2)} dk: oyuncu başına ${(b.length / top.length).toFixed(2)} eşya · ${RAR.map((r) => `${TR[r]} ${pct(b.filter((x: any) => x.rarity === r).length, b.length)}`).join(' · ')} · (${src})`);
  }

  console.log('\n## Kaynağa göre (ilk 5)');
  for (const s of Object.keys(SRC)) {
    const b = picks.filter((x: any) => x.src === s);
    if (!b.length) continue;
    console.log(`  ${SRC[s].padEnd(7)} ${(b.length / top.length).toFixed(2)}/oyuncu · ort. ${avg(b.map((x: any) => x.t)).toFixed(1)}. dk · ${RAR.map((r) => `${TR[r]} ${pct(b.filter((x: any) => x.rarity === r).length, b.length)}`).join(' · ')}${s === 'shop' ? ` · ort. fiyat ${avg(b.map((x: any) => x.price)).toFixed(0)}` : ''}`);
  }

  console.log('\n## İlk destansı / efsanevi eşya ne zaman takıldı (ilk 5)');
  for (const r of ['epic', 'legendary']) {
    const firsts = top.map((p) => p.gear.log.find((x: any) => RAR.indexOf(x.rarity) >= RAR.indexOf(r))?.t).filter((t: any) => t !== undefined);
    console.log(`  ${TR[r]}+: oyuncuların ${pct(firsts.length, top.length)}'i · ort. ${avg(firsts).toFixed(1)}. dk`);
  }

  console.log('\n## Sınıfa göre (ilk 5, maç sonu)');
  for (const c of CLASS_IDS) {
    const g = top.filter((p) => p.cls === c);
    if (!g.length) continue;
    const items = g.flatMap((p) => Object.values(p.gear.load));
    const shop = g.flatMap((p) => p.gear.log.filter((x: any) => x.src === 'shop'));
    console.log(`  ${c.padEnd(7)} ${g.length} oyuncu · takılı: ${RAR.map((r) => `${TR[r]} ${pct(items.filter((x) => x === r).length, g.length * 6)}`).join(' · ')} · dükkândan ${(shop.length / g.length).toFixed(1)} eşya`);
  }
}
