import { getAbility, isInCheck, opposite, type Action, type Color, type GameState } from '@hyperchess/engine';
import { useState, type ReactNode } from 'react';
import { COLOR_NAME } from '../abilityUi/text';
import type { StageView } from '../game/useStage';
import { useInteraction } from '../game/useInteraction';
import { AbilityPanel } from './AbilityPanel';
import { Board } from './Board';
import { PromotionDialog, ResultDialog } from './Dialogs';
import { PlayerBar, type SeatLabel } from './PlayerBar';

export interface GameViewProps {
  readonly state: GameState;
  readonly busy: boolean;
  readonly stageView: StageView;
  readonly dispatch: (action: Action) => void;
  /** 온라인에서 내 색. 로컬(핫시트)이면 null */
  readonly myColor: Color | null;
  readonly seats?: Readonly<Record<Color, SeatLabel>>;
  readonly onMenu: () => void;
  readonly resultActions: ReactNode;
  readonly sidebar?: ReactNode;
  readonly notice?: string | null;
}

export function GameView(props: GameViewProps) {
  const { state, busy, stageView, dispatch, myColor } = props;
  const canAct = myColor === null || state.turn === myColor;
  const interaction = useInteraction(state, dispatch, busy, canAct);
  const [flipped, setFlipped] = useState(myColor === 'b');

  const bottom: Color = flipped ? 'b' : 'w';
  const top = opposite(bottom);

  const status = (() => {
    if (state.result.kind !== 'ongoing') return '게임 종료';
    const turnName = myColor === null ? `${COLOR_NAME[state.turn]} 차례` : canAct ? '내 차례' : '상대 차례';
    const parts = [turnName];
    if (isInCheck(state, state.turn)) parts.push('체크!');
    const { movesAllowed, movesMade } = state.turnState;
    if (movesAllowed > 1) parts.push(`${getAbility('haste').name}: 남은 수 ${movesAllowed - movesMade}`);
    return parts.join(' · ');
  })();

  return (
    <div className={`game ${stageView.screenFx ? `screen-${stageView.screenFx}` : ''}`}>
      <header className="game-header">
        <button type="button" className="btn btn-ghost" onClick={props.onMenu}>
          ← 나가기
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
          <PlayerBar state={state} color={top} interaction={interaction} seat={props.seats?.[top]} />
          <Board state={state} stage={stageView} interaction={interaction} flipped={flipped} busy={busy} />
          <PlayerBar state={state} color={bottom} interaction={interaction} seat={props.seats?.[bottom]} />
        </div>
        <aside className="side-column">
          {props.notice && <p className="notice">{props.notice}</p>}
          <AbilityPanel state={state} color={myColor ?? state.turn} interaction={interaction} busy={busy} />
          {props.sidebar}
        </aside>
      </div>

      <PromotionDialog state={state} interaction={interaction} />
      {!busy && <ResultDialog result={state.result}>{props.resultActions}</ResultDialog>}
    </div>
  );
}
