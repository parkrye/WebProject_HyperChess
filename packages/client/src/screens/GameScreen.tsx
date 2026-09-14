import { getAbility, isInCheck, opposite } from '@hyperchess/engine';
import { useMemo, useState } from 'react';
import { COLOR_NAME } from '../abilityUi/text';
import { AbilityPanel } from '../components/AbilityPanel';
import { Board } from '../components/Board';
import { PromotionDialog, ResultDialog } from '../components/Dialogs';
import { PlayerBar } from '../components/PlayerBar';
import { useGame } from '../game/useGame';
import { useInteraction } from '../game/useInteraction';
import type { AbilityChoice } from './SetupScreen';

interface GameScreenProps {
  readonly abilities: AbilityChoice;
  readonly onRestart: () => void;
  readonly onMenu: () => void;
}

export function GameScreen({ abilities, onRestart, onMenu }: GameScreenProps) {
  const setup = useMemo(() => ({ abilities }), [abilities]);
  const { state, dispatch, busy, stageView } = useGame(setup);
  const interaction = useInteraction(state, (action) => void dispatch(action), busy);
  const [flipped, setFlipped] = useState(false);

  const bottom = flipped ? 'b' : 'w';
  const top = opposite(bottom);

  const status = (() => {
    if (state.result.kind !== 'ongoing') return '게임 종료';
    const parts = [`${COLOR_NAME[state.turn]} 차례`];
    if (isInCheck(state, state.turn)) parts.push('체크!');
    const { movesAllowed, movesMade } = state.turnState;
    if (movesAllowed > 1) parts.push(`${getAbility('haste').name}: 남은 수 ${movesAllowed - movesMade}`);
    return parts.join(' · ');
  })();

  return (
    <div className={`game ${stageView.screenFx ? `screen-${stageView.screenFx}` : ''}`}>
      <header className="game-header">
        <button type="button" className="btn btn-ghost" onClick={onMenu}>
          ← 메뉴
        </button>
        <span className="game-status" aria-live="polite">
          {status}
        </span>
        <button type="button" className="btn btn-ghost" onClick={() => setFlipped((v) => !v)} aria-label="보드 뒤집기">
          ⇅
        </button>
      </header>

      <div className="game-layout">
        <div className="board-column">
          <PlayerBar state={state} color={top} interaction={interaction} />
          <Board state={state} stage={stageView} interaction={interaction} flipped={flipped} busy={busy} />
          <PlayerBar state={state} color={bottom} interaction={interaction} />
        </div>
        <aside className="side-column">
          <AbilityPanel state={state} interaction={interaction} busy={busy} />
        </aside>
      </div>

      <PromotionDialog state={state} interaction={interaction} />
      {!busy && <ResultDialog result={state.result} onRestart={onRestart} onMenu={onMenu} />}
    </div>
  );
}
