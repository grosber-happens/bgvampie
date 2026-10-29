/** The user's 8 builds (2026-10-29). Writes results/user-builds.json for fade-test.ts. */
import { writeFileSync } from 'node:fs';
import { CLASSES, type ClassId } from './config.ts';
import { SKILLS, STYLES } from './kits.ts';

type Spec = { name: string; cls: ClassId; style: string; skills: string[]; t3: string[] };
const SPECS: Spec[] = [
  { name: 'Rogue-yakın', cls: 'rogue', style: 'yakın', skills: ['wink', 'invis', 'execute', 'kidney', 'detonate'], t3: ['invis', 'kidney'] },
  { name: 'Rogue-kopya', cls: 'rogue', style: 'aldatmaca', skills: ['decoy', 'detonate', 'insane', 'invis', 'wink'], t3: ['decoy', 'detonate'] },
  { name: 'Mage-yakın', cls: 'mage', style: 'nano', skills: ['arms', 'sonic', 'fog', 'armor', 'blink'], t3: ['arms', 'armor'] },
  { name: 'Mage-uzak', cls: 'mage', style: 'lazer', skills: ['blink', 'sunray', 'nanobots', 'gravity', 'mines'], t3: ['nanobots', 'mines'] },
  { name: 'Fighter-yakın', cls: 'fighter', style: 'çift kılıç', skills: ['second', 'eshield', 'overpower', 'whirl', 'charge'], t3: ['second', 'eshield'] },
  { name: 'Fighter-uzak', cls: 'fighter', style: 'mızrakçı', skills: ['leap', 'recall', 'rain', 'chain', 'pierce'], t3: ['recall', 'chain'] },
  { name: 'Scout-pençe', cls: 'scout', style: 'nişancı', skills: ['rend', 'drone', 'smoke', 'fast', 'hook'], t3: ['fast', 'rend'] },
  { name: 'Scout-pet', cls: 'scout', style: 'nişancı', skills: ['shotgun', 'fast', 'pack', 'hunt', 'trap'], t3: ['pack', 'shotgun'] },
];

/** 12 level-up picks: style skill first, then the tier-3 skills, then the rest in the user's order. Ends at 3,3,2,2,2. */
function picks(s: Spec): string[] {
  const start = STYLES[s.cls].find((x) => x.id === s.style)!.skill;
  const target = Object.fromEntries(s.skills.map((k) => [k, s.t3.includes(k) ? 3 : 2]));
  const tier: Record<string, number> = Object.fromEntries(s.skills.map((k) => [k, 0]));
  const prio = [...s.t3, start, ...s.skills].filter((k, i, a) => a.indexOf(k) === i);
  const out = [start];
  tier[start] = 1;
  while (out.length < 12) {
    // Learn every skill once early (a 2-skill kit would lose to anyone), then raise by priority.
    const fresh = prio.find((k) => tier[k] === 0 && out.length >= 2);
    const two = Object.values(tier).filter((v) => v >= 2).length;
    const up = prio.find((k) => tier[k] > 0 && tier[k] < target[k] && (tier[k] < 2 || two >= 3));
    const k = out.length % 2 === 1 && fresh ? fresh : up ?? fresh!;
    tier[k]++;
    out.push(k);
  }
  return out;
}

const builds = SPECS.map((s) => {
  const p = picks(s);
  const label = `${CLASSES[s.cls].name} ${s.style}: ${s.skills.map((k) => `${SKILLS[k].name}${s.t3.includes(k) ? ' (3)' : ''}`).join(', ')}`;
  console.log(s.name.padEnd(14), p.map((k) => SKILLS[k].name).join(' > '));
  return { name: s.name, label, picks: p };
});
writeFileSync(new URL('./results/user-builds.json', import.meta.url), JSON.stringify({ builds }, null, 1));
