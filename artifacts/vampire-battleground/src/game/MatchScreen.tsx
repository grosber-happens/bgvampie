import { useEffect, useRef } from 'react';
import { ArrowLeft, Crown, RotateCcw, ShieldAlert, Skull } from 'lucide-react';
import type { GameClass } from './useGameEngine';
import { useGameEngine } from './useGameEngine';
import { ArenaMap } from './ArenaMap';
import { MatchHud } from './MatchHud';

type MatchScreenProps = { classId: GameClass; onChooseClass: () => void };

function MatchOutcome({ victory, kills, survivors, onRestart, onChooseClass }: { victory: boolean; kills: number; survivors: number; onRestart: () => void; onChooseClass: () => void }) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#0b0d0f]/85 p-5 backdrop-blur-[3px]">
      <section className="panel screen-enter w-full max-w-[430px] border-[#aa8d57]/70 px-7 py-8 text-center">
        <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full border ${victory ? 'border-[#c7a95e] bg-[#4b4028] text-[#ebd28a]' : 'border-[#90524a] bg-[#392625] text-[#d08c76]'}`}>
          {victory ? <Crown size={29} /> : <Skull size={28} />}
        </div>
        <div className="mono mt-5 text-[9px] uppercase tracking-[.3em] text-[#9e8d69]">The Hollow remembers</div>
        <h2 className="serif mt-2 text-3xl uppercase tracking-[.09em]">{victory ? 'Last one standing' : 'The night takes you'}</h2>
        <p className="mt-3 text-sm leading-relaxed text-[#b5ab99]">{victory ? 'Your name is the last the old stones will carry.' : 'Your run ends here. The Hollow has not finished with you.'}</p>
        <div className="my-6 flex justify-center gap-7 border-y border-[#746243]/40 py-4">
          <div><div className="mono text-[8px] uppercase tracking-widest text-[#91846d]">Blood earned</div><div className="serif mt-1 text-xl text-[#d0a77b]">{kills}</div></div>
          <div><div className="mono text-[8px] uppercase tracking-widest text-[#91846d]">Combatants left</div><div className="serif mt-1 text-xl text-[#d8c9a9]">{survivors}</div></div>
        </div>
        <button type="button" data-testid="button-restart-result" onClick={onRestart} className="flex min-h-12 w-full items-center justify-center gap-2 border border-[#b89558] bg-[#793a32] font-serif text-xs uppercase tracking-[.16em] text-[#f0e5d2] hover:bg-[#91443a]"><RotateCcw size={15} /> Return to the fight</button>
        <button type="button" data-testid="button-change-class" onClick={onChooseClass} className="mt-3 flex min-h-10 w-full items-center justify-center gap-2 text-xs text-[#a69a84] hover:text-[#e3d5b8]"><ArrowLeft size={14} /> Choose another oath</button>
      </section>
    </div>
  );
}

export function MatchScreen({ classId, onChooseClass }: MatchScreenProps) {
  const { state, move, dash, openChest, restart, pause } = useGameEngine(classId, true);
  const direction = useRef<[number, number]>([0, -1]);
  const pressedKeys = useRef(new Set<string>());
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const movementKeys: Record<string, [number, number]> = {
      w: [0, -1], arrowup: [0, -1],
      s: [0, 1], arrowdown: [0, 1],
      a: [-1, 0], arrowleft: [-1, 0],
      d: [1, 0], arrowright: [1, 0],
    };
    const refreshMovement = () => {
      let dx = 0;
      let dy = 0;
      for (const key of pressedKeys.current) {
        const vector = movementKeys[key];
        if (vector) {
          dx += vector[0];
          dy += vector[1];
        }
      }
      if (dx !== 0 || dy !== 0) direction.current = [dx, dy];
      move(dx, dy);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      const current = stateRef.current;
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const key = event.key.toLowerCase();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(key)) event.preventDefault();
      if (movementKeys[key]) {
        pressedKeys.current.add(key);
        if (current.phase === 'playing' && !current.paused) refreshMovement();
        return;
      }
      if (key === 'escape') {
        if (current.phase === 'playing') pause();
        return;
      }
      if (current.phase !== 'playing' || current.paused) return;
      if (key === ' ') {
        dash(direction.current[0], direction.current[1]);
        return;
      }
      if (key === 'e') {
        const chest = current.chests.find((entry) => !entry.opened && Math.hypot(entry.x - current.player.x, entry.y - current.player.y) <= 70);
        if (chest) openChest(chest.id);
        return;
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (!movementKeys[key]) return;
      pressedKeys.current.delete(key);
      refreshMovement();
    };
    const onBlur = () => {
      pressedKeys.current.clear();
      move(0, 0);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [dash, move, openChest, pause]);

  const onDash = () => dash(direction.current[0], direction.current[1]);
  const result = state.phase !== 'playing';
  return (
    <main className="relative z-10 flex min-h-[100dvh] flex-col p-3 md:p-5">
      <div className="mx-auto flex w-full max-w-[1500px] flex-1 flex-col">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="serif flex h-8 w-8 items-center justify-center border border-[#94794b] text-[10px] font-bold text-[#cdb474]">VB</div>
            <div><h1 className="serif text-sm uppercase tracking-[.16em]">Vampire Battleground</h1><div className="mono text-[8px] tracking-[.18em] text-[#887d67]">THE HOLLOW · LOCAL SKIRMISH</div></div>
          </div>
          <div className="mono flex items-center gap-2 text-[9px] uppercase tracking-widest text-[#93866b]"><span className="h-1.5 w-1.5 rounded-full bg-[#b5a168]" /> Simulation active</div>
        </div>
        <MatchHud state={state} onPause={pause} onDash={onDash} onMove={(dx, dy) => { direction.current = [dx, dy]; move(dx, dy); }}>
          <ArenaMap state={state} onOpenChest={openChest} />
        </MatchHud>
      </div>
      {state.paused && !result && <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#0a0d0f]/75 p-4 backdrop-blur-[2px]">
        <section className="panel w-full max-w-sm px-7 py-8 text-center">
          <ShieldAlert className="mx-auto text-[#c6a361]" size={29} />
          <div className="mono mt-4 text-[9px] uppercase tracking-[.24em] text-[#a28e64]">Time held still</div>
          <h2 className="serif mt-2 text-2xl uppercase tracking-widest">The hunt waits</h2>
          <p className="mt-2 text-sm text-[#a69b89]">The combatants are held while you gather your breath.</p>
          <button type="button" data-testid="button-resume" onClick={pause} className="mt-6 min-h-11 w-full border border-[#ba995d] bg-[#49392b] font-serif text-xs uppercase tracking-[.15em] text-[#e7d9b9] hover:bg-[#624933]">Return to battle</button>
        </section>
      </div>}
      {result && <MatchOutcome victory={state.phase === 'victory'} kills={state.kills} survivors={state.alivePlayers} onRestart={restart} onChooseClass={onChooseClass} />}
    </main>
  );
}
