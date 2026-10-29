import { useState } from 'react';
import { ArrowRight, Crosshair, Flame, Shield, Sparkles, Swords } from 'lucide-react';
import type { GameClass } from './useGameEngine';

type ClassSelectProps = { onStart: (classId: GameClass) => void };
const classes: { id: GameClass; name: string; epithet: string; role: string; color: string; description: string; stats: [string, number][]; icon: typeof Swords }[] = [
  { id: 'rogue', name: 'Duskblade', epithet: 'The Unseen Fang', role: 'Rogue', color: '#bd6651', description: 'Slip through the melee. Strike hard, vanish before the answer comes.', stats: [['Mobility', 5], ['Might', 3], ['Ward', 2]], icon: Crosshair },
  { id: 'mage', name: 'Gravecaller', epithet: 'Keeper of Embers', role: 'Mage', color: '#a78ac1', description: 'Call old fire from beneath the earth and let it find your enemies.', stats: [['Mobility', 2], ['Might', 5], ['Ward', 3]], icon: Flame },
  { id: 'fighter', name: 'Iron Vow', epithet: 'The Last Bastion', role: 'Fighter', color: '#c6a25e', description: 'Hold the line when the circle closes. Outlast what you cannot outrun.', stats: [['Mobility', 2], ['Might', 4], ['Ward', 5]], icon: Shield },
  { id: 'archer', name: 'Thornwatch', epithet: 'The Far-Sighted', role: 'Archer', color: '#82a483', description: 'Keep the distance. One measured arrow is worth a dozen desperate swings.', stats: [['Mobility', 4], ['Might', 4], ['Ward', 2]], icon: Swords },
];

export function ClassSelect({ onStart }: ClassSelectProps) {
  const [selected, setSelected] = useState<GameClass>('rogue');
  const chosen = classes.find((entry) => entry.id === selected) ?? classes[0];
  const Icon = chosen.icon;
  return (
    <main className="relative z-10 flex min-h-[100dvh] flex-col items-center justify-center px-4 py-10 md:px-8">
      <div className="screen-enter w-full max-w-[1100px]">
        <header className="mb-9 text-center">
          <div className="mono mb-3 flex items-center justify-center gap-3 text-[10px] uppercase tracking-[.38em] text-[#a99773]">
            <span className="h-px w-10 bg-[#8f7950]" /> A last light in the dark <span className="h-px w-10 bg-[#8f7950]" />
          </div>
          <h1 className="serif text-4xl font-semibold uppercase tracking-[.12em] text-[#eee5d1] md:text-6xl">Vampire <span className="text-[#a9473d]">Battleground</span></h1>
          <p className="mt-3 text-sm tracking-wide text-[#a59b89]">Twenty enter the Hollow. The night keeps one.</p>
        </header>

        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <section aria-label="Choose your class" className="grid gap-3 sm:grid-cols-2">
            {classes.map((item, index) => {
              const ClassIcon = item.icon;
              return (
                <button key={item.id} type="button" aria-pressed={selected === item.id} data-testid={`select-class-${item.id}`} onClick={() => setSelected(item.id)} className="class-card panel relative flex min-h-[210px] flex-col overflow-hidden p-5 text-left">
                  <span className="mono absolute right-4 top-4 text-[10px] text-[#746c5e]">0{index + 1}</span>
                  <div className="mb-5 flex items-center gap-3">
                    <span className="flex h-11 w-11 items-center justify-center border border-[#9a8152]/55 bg-[#17191a] text-2xl" style={{ color: item.color }}><ClassIcon size={23} strokeWidth={1.5} /></span>
                    <div><div className="serif text-lg font-semibold uppercase tracking-[.08em]">{item.name}</div><div className="mono text-[9px] uppercase tracking-[.18em] text-[#988b72]">{item.role}</div></div>
                  </div>
                  <p className="max-w-[310px] text-sm leading-relaxed text-[#b7ae9d]">{item.description}</p>
                  <div className="mt-auto flex gap-4 pt-5">
                    {item.stats.map(([label, value]) => <div key={label} className="flex-1"><div className="mono mb-1 text-[8px] uppercase tracking-[.13em] text-[#827a6a]">{label}</div><div className="h-[3px] bg-[#121416]"><div className="h-full" style={{ width: `${Number(value) * 20}%`, backgroundColor: item.color }} /></div></div>)}
                  </div>
                  {selected === item.id && <span className="absolute bottom-0 left-0 h-[2px] w-full" style={{ backgroundColor: item.color }} />}
                </button>
              );
            })}
          </section>
          <aside className="panel etched flex flex-col p-6">
            <div className="mono text-[9px] uppercase tracking-[.25em] text-[#9c8b69]">Your oath</div>
            <div className="my-6 flex items-center gap-4 border-b border-[#746243]/40 pb-6">
              <div className="ember flex h-[66px] w-[66px] items-center justify-center rounded-full border border-[#8d7145]/60 bg-[#17191a] shadow-[0_0_35px_#9a482655]" style={{ color: chosen.color }}><Icon size={31} strokeWidth={1.4} /></div>
              <div><h2 className="serif text-xl uppercase tracking-wide">{chosen.name}</h2><div className="mt-1 text-xs italic text-[#a69b88]">{chosen.epithet}</div></div>
            </div>
            <div className="space-y-4 text-sm text-[#b8ad9a]">
              <p>The Hollow is shrinking. Your blade, spell, or bow acts without command. Move to survive; choose your ground with care.</p>
              <p className="flex items-center gap-2 border-l border-[#a64c3f] pl-3 text-xs text-[#c4b69c]"><Sparkles size={14} className="shrink-0 text-[#c3a15d]" /> Relics remember the bloodline that claims them.</p>
            </div>
            <button type="button" data-testid="button-enter-battleground" onClick={() => onStart(selected)} className="mt-auto flex min-h-12 items-center justify-between border border-[#b89558] bg-[#7a332e] px-4 pt-3 text-left text-sm font-semibold uppercase tracking-[.13em] text-[#f0e5d2] transition hover:bg-[#923e36] focus-visible:outline">
              Enter the Hollow <ArrowRight size={17} />
            </button>
            <div className="mono mt-4 text-center text-[9px] tracking-wider text-[#817766]">A LOCAL SKIRMISH · 20 COMBATANTS</div>
          </aside>
        </div>
      </div>
    </main>
  );
}
