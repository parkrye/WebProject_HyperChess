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
  // AI 대전/온라인은 항상 내가 왼쪽. 로컬 2인은 백이 왼쪽이고 수동으로만 바꾼다
  const [localLeft, setLocalLeft] = useState<Color>('w');
  const left: Color = myColor ?? localLeft;
  const right = opposite(left);

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
        {myColor === null ? (
          <button type="button" className="btn btn-ghost" onClick={() => setLocalLeft(opposite)} aria-label="보드 좌우 뒤집기">
            ⇄
          </button>
        ) : (
          <span className="game-header-spacer" />
        )}
      </header>

      <div className="game-layout">
        <div className="board-row">
          <PlayerBar className="side-left" state={state} color={left} interaction={interaction} seat={props.seats?.[left]} />
          <Board state={state} stage={stageView} interaction={interaction} leftColor={left} busy={busy} />
          <PlayerBar className="side-right" state={state} color={right} interaction={interaction} seat={props.seats?.[right]} />
        </div>
        <aside className="under-board">
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
