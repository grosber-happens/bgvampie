import { Activity, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, BookOpen, Heart, Pause, Play, Shield, Skull, Timer, Zap } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Item, SkillSlot } from './useGameEngine';
import type { useGameEngine } from './useGameEngine';

type GameState = ReturnType<typeof useGameEngine>['state'];
type MatchHudProps = { state: GameState; onPause: () => void; onDash: () => void; onMove: (dx: number, dy: number) => void; children: ReactNode };
const skillMarks = [Zap, Activity, Shield, BookOpen, Heart];
const rarityColor: Record<string, string> = { common: '#b8b1a0', uncommon: '#8aaa83', rare: '#9da9c2', epic: '#c79b68', legendary: '#d8bd72' };

function formatTime(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds || 0));
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}

function ItemRow({ item }: { item: Item }) {
  const color = rarityColor[String(item.rarity).toLowerCase()] ?? '#b8b1a0';
  const bonusSummary = [
    item.bonus.attack > 0 ? `+${item.bonus.attack} attack` : '',
    item.bonus.defense > 0 ? `+${item.bonus.defense} defense` : '',
    item.bonus.maxHp > 0 ? `+${item.bonus.maxHp} health` : '',
    item.bonus.skillPower > 0 ? `+${item.bonus.skillPower} skill power` : '',
  ].filter(Boolean).join(' · ');
  return (
    <li className="flex items-start gap-2 border-t border-[#64563f]/40 py-2" data-testid={`item-${item.id}`}>
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center border text-[10px]" style={{ borderColor: `${color}66`, color }}><Shield size={12} /></span>
      <span className="min-w-0 flex-1"><span className="block text-[11px] leading-tight" style={{ color }}>{item.name}</span><span className="block text-[9px] leading-tight text-[#928978]">{item.slot} · {bonusSummary || item.description}</span><span className="mono mt-0.5 block text-[7px] uppercase tracking-wider text-[#9b8d70]">Bloodline only: {item.classId}</span></span>
    </li>
  );
}

function SkillRail({ skills }: { skills: SkillSlot[] }) {
  return (
    <div className="flex items-center gap-2" aria-label="Automatic skills">
      {Array.from({ length: 5 }, (_, index) => {
        const skill = skills[index];
        const Mark = skillMarks[index];
        return <div key={skill?.id ?? `empty-${index}`} title={skill ? `${skill.name} — ${skill.description}` : 'Skill awakening'} aria-label={skill ? `${skill.name}, level ${skill.level}, automatic` : 'Empty skill slot'} className={`relative flex h-11 w-11 items-center justify-center border ${skill ? 'border-[#a78955]/65 bg-[#2d2a25] text-[#ddc58f]' : 'border-[#514a3e] bg-[#181a1b] text-[#5f594c]'}`}>
          <Mark size={17} strokeWidth={1.6} />
          <span className="absolute -bottom-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center border border-[#77613b] bg-[#1b1a18] px-0.5 font-mono text-[8px] text-[#d5c69f]">{skill?.level ?? index + 1}</span>
          {skill && <span className="absolute -top-1 right-0 font-mono text-[7px] text-[#b29c6e]">{Math.ceil(skill.triggerSeconds)}s</span>}
        </div>;
      })}
    </div>
  );
}

export function MatchHud({ state, onPause, onDash, onMove, children }: MatchHudProps) {
  const hpPct = Math.max(0, (state.player.hp / state.player.maxHp) * 100);
  const xpPct = Math.min(100, (state.player.xp / state.player.nextXp) * 100);
  const dashReady = state.dashCooldownSeconds <= 0;
  const defensiveItems = state.inventory.filter((item) => /shield|armor|ward|defen|guard/i.test(`${item.slot} ${item.name} ${item.description}`));
  const logLines = state.eventLog.slice(-4).reverse();
  const padButton = (label: string, dx: number, dy: number, icon: typeof ArrowUp) => {
    const Icon = icon;
    return <button type="button" key={label} data-testid={`move-${label}`} aria-label={`Move ${label}`} onPointerDown={(event) => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); onMove(dx, dy); }} onPointerUp={() => onMove(0, 0)} onPointerCancel={() => onMove(0, 0)} onLostPointerCapture={() => onMove(0, 0)} className="touch-none flex h-9 w-9 items-center justify-center border border-[#746448] bg-[#232323] text-[#cdbd98] active:bg-[#5c4030]"><Icon size={15} /></button>;
  };
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <header className="panel flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-[185px] flex-1 items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center border border-[#c49e5d]/70 bg-[#51302c] text-[#e0c783]"><Activity size={17} /></div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <span className="serif text-xs uppercase tracking-[.1em]">{state.classId} <span className="mono ml-1 text-[9px] text-[#c5a665]">LV {state.player.level}</span></span>
              <span className="mono text-[10px] text-[#d5c6a8]">{Math.ceil(state.player.hp)} / {state.player.maxHp}</span>
            </div>
            <div className="mt-1 h-[7px] border border-[#5c3430] bg-[#151718] p-[1px]"><div className="h-full bg-gradient-to-r from-[#862e2e] to-[#c25a47] transition-[width] duration-200" style={{ width: `${hpPct}%` }} /></div>
            {state.player.shield > 0 && <div className="mt-1 flex items-center gap-1 text-[9px] text-[#9db3c6]"><Shield size={10} /> Ward {state.player.shield}</div>}
          </div>
        </div>
        <div className="flex items-center gap-5 border-l border-r border-[#746243]/45 px-4">
          <div className="text-center"><div className="mono text-[8px] uppercase tracking-[.16em] text-[#96896f]">Standing</div><div className="serif mt-0.5 text-sm text-[#eee0c0]">{state.alivePlayers}<span className="text-[#8b806b]"> / 20</span></div></div>
          <div className="text-center"><div className="mono text-[8px] uppercase tracking-[.16em] text-[#96896f]">Harvest</div><div className="serif mt-0.5 flex items-center justify-center gap-1 text-sm text-[#d69a79]"><Skull size={13} />{state.kills}</div></div>
          <div className="text-center"><div className="mono text-[8px] uppercase tracking-[.16em] text-[#96896f]">Nightfall</div><div className="mono mt-1 flex items-center gap-1 text-[11px] text-[#ded2b8]"><Timer size={12} />{formatTime(state.timeSeconds)}</div></div>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden text-right sm:block"><div className="mono text-[8px] uppercase tracking-[.15em] text-[#91846b]">Fog closes</div><div className="mono text-[10px] text-[#c7bba0]">{formatTime(state.fog.secondsToNext)}</div></div>
          <button type="button" data-testid="button-pause" onClick={onPause} aria-label={state.paused ? 'Resume match' : 'Pause match'} className="flex h-9 w-9 items-center justify-center border border-[#746448] bg-[#1d1f20] text-[#cfc2a7] hover:bg-[#35312b]">{state.paused ? <Play size={15} /> : <Pause size={15} />}</button>
        </div>
      </header>
      <div className="relative grid min-h-0 flex-1 gap-3 lg:grid-cols-[1fr_220px]">
        <div className="relative flex min-h-0 flex-col">
          <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center">
            <div className="border-x border-b border-[#84704b]/55 bg-[#181a1ae8] px-4 py-2 text-center">
              <div className="mono text-[8px] uppercase tracking-[.23em] text-[#a38d62]">The closing veil</div>
              <div className="mt-1 flex items-center gap-2"><div className="h-[3px] w-20 bg-[#131516]"><div className="h-full bg-[#a44b40]" style={{ width: `${Math.max(5, 100 - state.fog.stage * 13)}%` }} /></div><span className="mono text-[9px] text-[#c5ad7b]">STAGE {state.fog.stage}</span></div>
            </div>
          </div>
          <div className="min-h-[390px] flex-1 border border-[#8e7750]/55 bg-[#202722]">
            {children}
          </div>
          <div className="panel mt-2 flex flex-wrap items-center justify-between gap-3 px-3 py-2">
            <SkillRail skills={state.skills} />
            <div className="flex items-center gap-2">
              <div className="hidden text-right sm:block"><div className="mono text-[8px] uppercase tracking-[.15em] text-[#8d8068]">Dash charge</div><div className="mono text-[9px] text-[#c9bd9f]">{dashReady ? 'READY' : `${state.dashCooldownSeconds.toFixed(1)}s`}</div></div>
              <button type="button" data-testid="button-dash" onClick={onDash} disabled={!dashReady || state.paused} aria-label="Dash" className="flex h-11 min-w-[92px] items-center justify-center gap-2 border border-[#c09a59] bg-[#49362b] px-3 font-serif text-[10px] uppercase tracking-[.15em] text-[#edddb8] hover:bg-[#624532] disabled:cursor-not-allowed disabled:opacity-45"><Zap size={15} /> Dash <kbd className="mono border-l border-[#9b7b4e] pl-2 text-[9px]">SPACE</kbd></button>
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between gap-3">
            <div className="mono flex flex-wrap gap-x-4 gap-y-1 text-[9px] text-[#897f6d]"><span>WASD / ARROWS <b className="text-[#c8b893]">MOVE</b></span><span>SPACE <b className="text-[#c8b893]">DASH</b></span><span>E <b className="text-[#c8b893]">OPEN RELIC</b></span><span>ESC <b className="text-[#c8b893]">PAUSE</b></span></div>
            <div className="grid grid-cols-3 gap-1 md:hidden" aria-label="Touch movement controls">
              <span /><span>{padButton('north', 0, -1, ArrowUp)}</span><span />
              {padButton('west', -1, 0, ArrowLeft)}{padButton('south', 0, 1, ArrowDown)}{padButton('east', 1, 0, ArrowRight)}
            </div>
          </div>
        </div>
        <aside className="flex min-h-0 flex-col gap-3">
          <section className="panel p-3">
            <div className="mb-2 flex items-center justify-between"><h2 className="serif text-[11px] uppercase tracking-[.16em] text-[#ddcfb2]">Relics carried</h2><span className="mono text-[9px] text-[#92866f]">{state.inventory.length}</span></div>
            {state.inventory.length ? <ul className="max-h-[150px] overflow-y-auto scrollbar-slim">{state.inventory.map((item) => <ItemRow key={item.id} item={item} />)}</ul> : <div className="border-t border-[#64563f]/40 py-3 text-[10px] leading-relaxed text-[#8d8372]">No relics claimed. The Hollow keeps its gifts in scattered chests.</div>}
          </section>
          <section className="panel p-3">
            <div className="mb-2 flex items-center justify-between"><h2 className="serif text-[11px] uppercase tracking-[.16em] text-[#ddcfb2]">Ward & armor</h2><Shield size={13} className="text-[#a7b5be]" /></div>
            {defensiveItems.length ? <ul>{defensiveItems.map((item) => <ItemRow key={item.id} item={item} />)}</ul> : <p className="border-t border-[#64563f]/40 pt-2 text-[10px] leading-relaxed text-[#8d8372]">No defensive relics. A strong ward buys another breath.</p>}
          </section>
          <section className="panel flex min-h-[130px] flex-1 flex-col p-3">
            <div className="mb-2 flex items-center justify-between"><h2 className="serif text-[11px] uppercase tracking-[.16em] text-[#ddcfb2]">Field whispers</h2><span className="mono text-[8px] text-[#84785f]">LIVE</span></div>
            <div className="scrollbar-slim flex flex-1 flex-col gap-2 overflow-auto" aria-live="polite">
              {logLines.length ? logLines.map((line, index) => <p key={`${line}-${index}`} data-testid={`event-log-${index}`} className="border-l border-[#9d5c4c]/70 pl-2 text-[10px] leading-snug text-[#aaa18f]">{line}</p>) : <p className="text-[10px] text-[#817969]">The night is listening.</p>}
            </div>
          </section>
          <div className="border border-[#766447]/45 bg-[#181a1b] px-3 py-2">
            <div className="mono mb-1 text-[8px] uppercase tracking-[.16em] text-[#99865d]">Experience</div>
            <div className="h-[4px] bg-[#0d1011]"><div className="h-full bg-[#c19a54]" style={{ width: `${xpPct}%` }} /></div>
            <div className="mono mt-1 text-right text-[8px] text-[#968b75]">{state.player.xp} / {state.player.nextXp} XP</div>
          </div>
        </aside>
      </div>
    </div>
  );
}
