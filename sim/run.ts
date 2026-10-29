/**
 * Balance report.
 *   node --experimental-strip-types sim/run.ts [matches=40] [duels=60] [--json out.json]
 * Runs full battle royale matches on the 5-region map plus a 1v1 duel table per level.
 */
import { CLASS_IDS, CLASSES, REGIONS, type ClassId, type RegionId } from './config.ts';
import { runDuel, runMatch, type MatchResult } from './match.ts';
import { writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const nums = args.filter((a) => /^\d+$/.test(a)).map(Number);
const MATCHES = nums[0] ?? 40;
const DUELS = nums[1] ?? 60;
const jsonOut = args.includes('--json') ? args[args.indexOf('--json') + 1] : null;
const seed0 = Number(process.env.SEED ?? 1);

const avg = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);
const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
const f1 = (x: number) => (Number.isFinite(x) ? x.toFixed(1) : '-');
const pad = (s: string | number, n: number) => String(s).padEnd(n);
const name = (c: ClassId) => CLASSES[c].name;

const out: Record<string, unknown> = {};

// ---- Matches --------------------------------------------------------------
const results: MatchResult[] = [];
const t0 = Date.now();
for (let i = 0; i < MATCHES; i++) results.push(runMatch(seed0 * 1000 + i));
const secs = (Date.now() - t0) / 1000;

console.log(`\n=== ${MATCHES} maç, 20 oyuncu (her sınıftan 5), 5 bölgelik 1 km harita (${secs.toFixed(0)} sn) ===`);
const lengths = results.map((r) => r.minutes);
console.log(`Maç süresi: ort ${f1(avg(lengths))} dk, en kısa ${f1(Math.min(...lengths))}, en uzun ${f1(Math.max(...lengths))}`);

const all = results.flatMap((r) => r.players);
const buckets = [0, 5, 10, 15, 20, 25, 30, 35];
console.log(`Ölüm zamanları: ${buckets.map((b) => `${b}-${b + 5} dk ${pct(all.filter((p) => p.place > 1 && p.deathMin >= b && p.deathMin < b + 5).length / all.length)}`).join(' · ')}`);
console.log(`\n${pad('Sınıf', 9)}${pad('Kazanma', 9)}${pad('Ort. sıra', 10)}${pad('Top 5', 7)}${pad('Öldürme', 9)}${pad('PvP hasar', 10)}${pad('Boss', 6)}${pad('Mob', 6)}${pad('Ölüm dk', 8)}Seviye`);
const classRows: Record<string, unknown> = {};
for (const c of CLASS_IDS) {
  const ps = all.filter((p) => p.cls === c);
  const wins = results.filter((r) => r.winner === c).length / results.length;
  const row = {
    win: wins,
    place: avg(ps.map((p) => p.place)),
    top5: ps.filter((p) => p.place <= 5).length / ps.length,
    kills: avg(ps.map((p) => p.kills)),
    dmg: avg(ps.map((p) => p.dmgToPlayers)),
    boss: avg(ps.map((p) => p.bossKills)),
    mobs: avg(ps.map((p) => p.mobKills)),
    death: avg(ps.map((p) => p.deathMin)),
    level: avg(ps.map((p) => p.level)),
  };
  classRows[c] = row;
  console.log(
    `${pad(name(c), 9)}${pad(pct(row.win), 9)}${pad(f1(row.place), 10)}${pad(pct(row.top5), 7)}${pad(f1(row.kills), 9)}${pad(row.dmg.toFixed(0), 10)}${pad(f1(row.boss), 6)}${pad(f1(row.mobs), 6)}${pad(f1(row.death), 8)}${f1(row.level)}`,
  );
}
out.classes = classRows;

console.log('\nOyun tarzına göre (kazanma oranı = o tarzla oynayanların maçı kazanma payı, eşit pay = %5):');
const styleRows: Record<string, unknown> = {};
for (const c of CLASS_IDS) {
  const styles = [...new Set(all.filter((p) => p.cls === c).map((p) => p.style))];
  const parts = styles.map((s) => {
    const ps = all.filter((p) => p.cls === c && p.style === s);
    const w = ps.filter((p) => p.place === 1).length / ps.length;
    styleRows[`${c}/${s}`] = { n: ps.length, win: w, place: avg(ps.map((p) => p.place)) };
    return `${s}: ${pct(w)} (sıra ${f1(avg(ps.map((p) => p.place)))})`;
  });
  console.log(`  ${pad(name(c), 9)}${parts.join(' · ')}`);
}
out.styles = styleRows;

// Levels.
console.log('\nYaşayan oyuncuların ortalama seviyesi (dakikaya göre):');
const mins = [5, 10, 15, 20, 25, 30];
console.log(`${pad('', 9)}${mins.map((m) => pad(`${m}. dk`, 8)).join('')}`);
const lvlRows: Record<string, number[]> = {};
for (const c of CLASS_IDS) {
  lvlRows[c] = mins.map((m) => avg(results.flatMap((r) => r.levelByMinute[m]?.[c] ?? [])));
  console.log(`${pad(name(c), 9)}${lvlRows[c].map((v) => pad(f1(v), 8)).join('')}`);
}
const allLv = mins.map((m) => avg(results.flatMap((r) => CLASS_IDS.flatMap((c) => r.levelByMinute[m]?.[c] ?? []))));
console.log(`${pad('Hepsi', 9)}${allLv.map((v) => pad(f1(v), 8)).join('')}`);
out.levels = { byClass: lvlRows, all: allLv };

const l12 = all.map((p) => p.levelAt[12]).filter((x) => x > 0);
const firstL12 = results.map((r) => Math.min(...r.players.map((p) => p.levelAt[12] || Infinity))).filter(Number.isFinite);
const l12Sorted = [...l12].sort((a, b) => a - b);
console.log(
  `\nSeviye 12: oyuncuların ${pct(l12.length / all.length)}'i ulaştı. Ulaşanlarda ort ${f1(avg(l12))}. dk (en erken ${f1(l12Sorted[0] ?? NaN)}). Maç başına ilk ulaşan: ort ${f1(avg(firstL12))}. dk. Hiç kimsenin ulaşmadığı maç: ${results.length - firstL12.length}/${results.length}`,
);
const winners = results.map((r) => r.players.find((p) => p.place === 1)!);
console.log(`Kazananların seviyesi: ort ${f1(avg(winners.map((w) => w.level)))}; seviye 12'ye ulaştıkları dakika: ort ${f1(avg(winners.map((w) => w.levelAt[12]).filter((x) => x > 0)))}`);
const reach = [6, 8, 10].map((l) => `${l}: ${f1(avg(all.map((p) => p.levelAt[l]).filter((x) => x > 0)))}. dk`);
console.log(`Seviyeye ulaşma dakikası (ulaşanlarda) → ${reach.join(' · ')}`);
out.level12 = { share: l12.length / all.length, avgMin: avg(l12), firstPerMatch: avg(firstL12) };

// XP sources.
const xpMob = avg(all.map((p) => p.xpBy.mob));
const xpPl = avg(all.map((p) => p.xpBy.player));
const xpBoss = avg(all.map((p) => p.xpBy.boss));
const xpSum = xpMob + xpPl + xpBoss;
console.log(`\nXP kaynakları (oyuncu başına ort): mob ${xpMob.toFixed(0)} (${pct(xpMob / xpSum)}), oyuncu ${xpPl.toFixed(0)} (${pct(xpPl / xpSum)}), boss ${xpBoss.toFixed(0)} (${pct(xpBoss / xpSum)})`);
const wXp = winners.map((w) => w.xpBy);
console.log(`Kazananlarda: mob ${avg(wXp.map((x) => x.mob)).toFixed(0)}, oyuncu ${avg(wXp.map((x) => x.player)).toFixed(0)}, boss ${avg(wXp.map((x) => x.boss)).toFixed(0)}`);
out.xp = { mob: xpMob, player: xpPl, boss: xpBoss };

// Bosses.
console.log('\nBosslar (doğduğu dk → öldürülme oranı, ort öldürülme dk, en çok kesen sınıf):');
const bossKeys = [...new Set(results.flatMap((r) => r.bosses.map((b) => `${b.spawn}|${b.name}`)))];
const bossRows: Record<string, unknown> = {};
for (const k of bossKeys) {
  const [spawn, bname] = k.split('|');
  const bs = results.flatMap((r) => r.bosses.filter((b) => b.name === bname && String(b.spawn) === spawn));
  const killed = bs.filter((b) => b.killedAt !== null);
  const by: Record<string, number> = {};
  for (const b of killed) by[b.by!] = (by[b.by!] ?? 0) + 1;
  const top = Object.entries(by).sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c} ${n}`).join(', ');
  bossRows[k] = { killRate: killed.length / bs.length, avgMin: avg(killed.map((b) => b.killedAt!)), by };
  console.log(`  ${pad(`${spawn}. dk ${bname}`, 26)}${pad(pct(killed.length / bs.length), 6)}${pad(f1(avg(killed.map((b) => b.killedAt!))) + '. dk', 10)}${top}`);
}
out.bosses = bossRows;

// Mob density.
const samples = results.flatMap((r) => r.mobSamples);
const regionAvg = (Object.keys(REGIONS) as RegionId[]).map((r) => `${REGIONS[r].name} ${f1(avg(samples.map((s) => s.alive[r])))}`);
const totalAlive = samples.map((s) => Object.values(s.alive).reduce((a, b) => a + b, 0));
console.log(`\nMob yoğunluğu: haritada ort ${f1(avg(totalAlive))} canlı mob (en çok ${Math.max(...totalAlive)}). Bölge başına ort: ${regionAvg.join(', ')}`);
console.log(`Bir oyuncunun 40 m çevresinde ort ${f1(avg(samples.map((s) => s.nearPlayer)))} mob, 80 m çevresinde ${f1(avg(samples.map((s) => s.inSight)))} mob`);
out.mobs = { avgAlive: avg(totalAlive), near40: avg(samples.map((s) => s.nearPlayer)), near80: avg(samples.map((s) => s.inSight)) };

// Who kills whom.
console.log('\nKim kimi öldürdü (satır: öldüren, sütun: ölen, maç başına):');
console.log(`${pad('', 9)}${CLASS_IDS.map((c) => pad(name(c), 9)).join('')}K/D`);
for (const a of CLASS_IDS) {
  const row = CLASS_IDS.map((b) => all.filter((p) => p.cls === b && p.killedBy === a).length / results.length);
  const deaths = all.filter((p) => p.cls === a && p.place > 1).length;
  const kills = all.filter((p) => p.killedBy === a).length;
  console.log(`${pad(name(a), 9)}${row.map((v) => pad(f1(v), 9)).join('')}${(kills / Math.max(1, deaths)).toFixed(2)}`);
}

// Death causes.
const causes: Record<string, number> = {};
for (const p of all) if (p.place > 1) causes[p.killedBy] = (causes[p.killedBy] ?? 0) + 1;
console.log(`Ölüm sebepleri: ${Object.entries(causes).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${pct(n / all.length)}`).join(', ')}`);

// ---- Duels ----------------------------------------------------------------
if (DUELS > 0) {
  console.log(`\n=== 1v1 düello (aynı seviye, rastgele tarz ve yetenekler, ${DUELS} düello/eşleşme) ===`);
  const duelOut: Record<string, unknown> = {};
  for (const level of [3, 7, 12]) {
    console.log(`\nSeviye ${level}: satırdaki sınıfın kazanma oranı`);
    console.log(`${pad('', 9)}${CLASS_IDS.map((c) => pad(name(c), 9)).join('')}Ortalama`);
    const table: Record<string, Record<string, number>> = {};
    const overall: Record<string, number[]> = {};
    for (const a of CLASS_IDS) {
      table[a] = {};
      overall[a] = [];
    }
    for (let i = 0; i < CLASS_IDS.length; i++)
      for (let j = i; j < CLASS_IDS.length; j++) {
        const a = CLASS_IDS[i];
        const b = CLASS_IDS[j];
        let wa = 0;
        let n = 0;
        for (let k = 0; k < DUELS; k++) {
          // Swap sides every other duel.
          const flip = k % 2 === 1;
          const r = runDuel(seed0 * 7919 + level * 131 + i * 17 + j * 3 + k * 101, flip ? b : a, flip ? a : b, level);
          n++;
          if (r.winner === -1) wa += 0.5;
          else if ((r.winner === 0) !== flip) wa += 1;
        }
        table[a][b] = wa / n;
        table[b][a] = 1 - wa / n;
      }
    for (const a of CLASS_IDS) {
      const others = CLASS_IDS.filter((b) => b !== a).map((b) => table[a][b]);
      console.log(`${pad(name(a), 9)}${CLASS_IDS.map((b) => pad(a === b ? '-' : pct(table[a][b]), 9)).join('')}${pct(avg(others))}`);
    }
    duelOut[level] = table;
  }
  out.duels = duelOut;
}

if (jsonOut) writeFileSync(jsonOut, JSON.stringify(out, null, 2));
