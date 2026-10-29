import { useMemo } from 'react';
import { Box, Crown, Skull } from 'lucide-react';
import type { Combatant, GameClass } from './useGameEngine';
import type { useGameEngine } from './useGameEngine';

type GameState = ReturnType<typeof useGameEngine>['state'];
type ArenaMapProps = { state: GameState; onOpenChest: (id: string) => void };
const classColors: Record<GameClass, string> = { rogue: '#d47b5c', mage: '#b39ad0', fighter: '#d3b267', archer: '#91b48e' };

function Token({ entity, player = false, onActivate }: { entity: Combatant; player?: boolean; onActivate?: () => void }) {
  if (!entity.alive && !player) return null;
  const color = classColors[entity.classId];
  return (
    <div className={`map-entity ${player ? 'z-[8]' : ''}`} style={{ left: `${entity.x / 10}%`, top: `${entity.y / 10}%` }} title={player ? 'You' : entity.name}>
      <div className={`relative flex h-7 w-7 items-center justify-center ${player ? 'rounded-full border-2 border-[#f0d796] bg-[#803d36]' : entity.kind === 'mob' ? 'rounded-[40%] border border-[#b8624b] bg-[#432723]' : 'rotate-45 border border-[#c4a66a] bg-[#343a3b]'}`} aria-label={player ? 'Your character' : `${entity.kind}: ${entity.name}`}>
        {player ? <Crown size={13} className="text-[#f4d990]" /> : entity.kind === 'mob' ? <Skull size={12} className="rotate-[-45deg] text-[#db8064]" /> : <span className="mono rotate-[-45deg] text-[8px] font-bold text-[#ded1b6]">{entity.name.slice(0, 1)}</span>}
      </div>
      <div className="health-track"><div className="health-fill" style={{ width: `${Math.max(0, (entity.hp / entity.maxHp) * 100)}%`, background: player ? '#c89859' : undefined }} /></div>
      {player && <div className="absolute left-1/2 top-[33px] -translate-x-1/2 whitespace-nowrap font-serif text-[9px] uppercase tracking-widest text-[#f1dfb7]">You</div>}
      {onActivate && <button type="button" aria-label={`Open chest ${entity.name}`} onClick={onActivate} className="absolute -inset-2" />}
    </div>
  );
}

export function ArenaMap({ state, onOpenChest }: ArenaMapProps) {
  const aliveRivals = useMemo(() => state.rivals.filter((rival) => rival.alive), [state.rivals]);
  const nearestChest = state.chests.find((chest) => !chest.opened && Math.hypot(chest.x - state.player.x, chest.y - state.player.y) < 70);
  const fogRadius = Math.min(100, Math.max(12, (state.fog.radius / 1000) * 100));
  return (
    <section aria-label="Battleground map" className="relative min-h-[390px] flex-1 overflow-hidden border border-[#8e7750]/55 bg-[#202722] md:min-h-0">
      <div className="arena-map absolute inset-0" role="application" aria-label="Arena. Use WASD or arrow keys to move, Space to dash, E to open nearby chests.">
        <div className="map-path" style={{ left: '-20%', top: '48%' }} />
        <div className="map-forest" style={{ left: '8%', top: '10%', width: '23%', height: '25%' }} />
        <div className="map-forest" style={{ left: '66%', top: '9%', width: '25%', height: '24%' }} />
        <div className="map-forest" style={{ left: '11%', top: '67%', width: '22%', height: '25%' }} />
        <div className="map-forest" style={{ left: '68%', top: '68%', width: '24%', height: '22%' }} />
        <div className="absolute inset-0 z-[1] pointer-events-none" style={{ background: `radial-gradient(circle at ${state.fog.x / 10}% ${state.fog.y / 10}%, transparent ${fogRadius}%, rgba(10,13,16,.62) ${fogRadius + 9}%, rgba(10,13,16,.82) 100%)` }} />
        <div className="pointer-events-none absolute z-[2] rounded-full border border-[#d9c38b]/50" style={{ left: `${state.fog.x / 10 - fogRadius}%`, top: `${state.fog.y / 10 - fogRadius}%`, width: `${fogRadius * 2}%`, height: `${fogRadius * 2}%` }} />
        {state.rivals.map((rival) => <Token key={rival.id} entity={rival} />)}
        {state.mobs.map((mob) => <Token key={mob.id} entity={mob} />)}
        {state.chests.filter((chest) => !chest.opened).map((chest) => (
          <button key={chest.id} type="button" data-testid={`chest-${chest.id}`} disabled={Math.hypot(chest.x - state.player.x, chest.y - state.player.y) >= 70} aria-label={`Open chest${nearestChest?.id === chest.id ? ', nearby' : ', move closer first'}`} onClick={() => onOpenChest(chest.id)} className="map-entity flex h-7 w-7 items-center justify-center border border-[#d2b66f] bg-[#58472c] text-[#f0d58c] shadow-[0_0_13px_#d3ac5544] hover:bg-[#755a30] disabled:cursor-not-allowed disabled:opacity-55" style={{ left: `${chest.x / 10}%`, top: `${chest.y / 10}%` }}>
            <Box size={14} />
          </button>
        ))}
        <Token entity={{ id: 'player', name: 'You', kind: 'rival', classId: state.classId, x: state.player.x, y: state.player.y, hp: state.player.hp, maxHp: state.player.maxHp, alive: state.phase === 'playing' }} player />
      </div>
      <div className="pointer-events-none absolute left-3 top-3 z-10 flex items-center gap-2 border border-[#8d7955]/50 bg-[#17191ae8] px-3 py-2">
        <span className="h-2 w-2 rounded-full bg-[#d16d59] shadow-[0_0_8px_#d16d59]" />
        <span className="mono text-[9px] uppercase tracking-[.17em] text-[#d2c6ad]">The Hollow</span>
      </div>
      {nearestChest && <div className="pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2 border border-[#c4a15d]/70 bg-[#1b1b18e8] px-3 py-2 text-center text-[11px] text-[#efdfb9]">Nearby relic chest <kbd className="mono ml-2 border border-[#90794b] px-1.5 py-0.5 text-[9px]">E</kbd></div>}
      <div className="pointer-events-none absolute bottom-3 right-3 z-10 border border-[#8d7955]/50 bg-[#17191ae8] px-2 py-1.5">
        <div className="relative h-[78px] w-[78px] overflow-hidden border border-[#7c735d] bg-[#30392f]">
          <div className="absolute inset-[14%] rounded-full border border-[#bd9e61]/70" />
          <div className="absolute h-2 w-2 rounded-full bg-[#f3d487] shadow-[0_0_8px_#f3d487]" style={{ left: `${state.player.x / 10}%`, top: `${state.player.y / 10}%` }} />
          {aliveRivals.slice(0, 20).map((rival) => <span key={rival.id} className="absolute h-1 w-1 rounded-full bg-[#c97b68]" style={{ left: `${rival.x / 10}%`, top: `${rival.y / 10}%` }} />)}
        </div>
        <div className="mono mt-1 text-center text-[7px] tracking-widest text-[#93866b]">FIELD MAP</div>
      </div>
    </section>
  );
}
