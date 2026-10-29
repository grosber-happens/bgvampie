import { useState } from 'react';
import type { GameClass } from './useGameEngine';
import { ClassSelect } from './ClassSelect';
import { MatchScreen } from './MatchScreen';

export function GameApp() {
  const [classId, setClassId] = useState<GameClass>('rogue');
  const [inMatch, setInMatch] = useState(false);
  return <div className="game-shell dark">{inMatch ? <MatchScreen classId={classId} onChooseClass={() => setInMatch(false)} /> : <ClassSelect onStart={(picked) => { setClassId(picked); setInMatch(true); }} />}</div>;
}
