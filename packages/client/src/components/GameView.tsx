import { getAbility, isInCheck, opposite, type Action, type Color, type DrawVote, type GameState } from '@hyperchess/engine';
import { useRef, useState, type ReactNode } from 'react';
import { COLOR_NAME } from '../abilityUi/text';
import type { StageView } from '../game/useStage';
import { useInteraction } from '../game/useInteraction';
import { useBgm, type BgmTrack } from '../audio/bgm';
import { uiIconSprite } from '../assets/sprites';
import { AbilityPanel } from './AbilityPanel';
import { SoundToggle } from './SoundToggle';
import { ClockBar } from './ClockBar';
import { Board } from './Board';
import { DrawOfferDialog, PromotionDialog, ResultDialog } from './Dialogs';
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
  /** 시계 표시용 시각 보정 (온라인: 서버 시각 - 로컬 시각) */
  readonly clockOffsetMs?: number;
  /** 무작위로 결정된 능력의 색 (플레이어 띠에 표시) */
  readonly randomized?: Partial<Record<Color, boolean>>;
  /** 관전 전용 (AI 내전): 보드 조작 불가 */
  readonly spectator?: boolean;
  /** 결과 창 표시 여부 (기본 true) */
  readonly showResultDialog?: boolean;
  /** 기권 (없으면 기권 버튼을 두지 않는다). 확인 절차는 화면 쪽에서 맡는다 */
  readonly onResign?: () => void;
  /** 무승부 제안에 답한다 (없으면 제안 창을 띄우지 않는다) */
  readonly onDrawVote?: (color: Color, vote: DrawVote) => void;
}

const COLORS: readonly Color[] = ['w', 'b'];

export function GameView(props: GameViewProps) {
  const { state, busy, stageView, dispatch, myColor } = props;
  const offer = state.draw.offer;
  // 무승부 제안에 답하기 전에는 보드도 능력도 건드릴 수 없다
  const canAct = !props.spectator && !offer && (myColor === null || state.turn === myColor);
  const interaction = useInteraction(state, dispatch, busy, canAct);
  // AI 대전/온라인은 항상 내가 왼쪽. 로컬 2인은 백이 왼쪽이고 수동으로만 바꾼다
  const [localLeft, setLocalLeft] = useState<Color>('w');
  const left: Color = myColor ?? localLeft;
  const right = opposite(left);

  useBgm(useBattleTrack(state, myColor));

  /**
   * 이 기기에서 지금 답할 색. 온라인·AI 대전은 내 색만, 핫시트는 아직 답하지 않은 쪽을 차례로.
   * null이면 상대의 답을 기다리는 중이다.
   */
  const askColor = (() => {
    if (!offer) return null;
    const pending = COLORS.filter((color) => !offer.votes[color]);
    if (myColor === null) return pending[0] ?? null;
    return pending.includes(myColor) ? myColor : null;
  })();

  const status = (() => {
    if (state.result.kind !== 'ongoing') return '게임 종료';
    if (offer) return '무승부 제안';
    const turnName = myColor === null ? `${COLOR_NAME[state.turn]} 차례` : state.turn === myColor ? '내 차례' : '상대 차례';
    const parts = [turnName];
    if (isInCheck(state, state.turn)) parts.push('체크!');
    const { movesAllowed, movesMade } = state.turnState;
    if (movesAllowed > 1) parts.push(`${getAbility('haste').name}: 남은 수 ${movesAllowed - movesMade}`);
    return parts.join(' · ');
  })();

  return (
    <div className={`game ${stageView.screenFx ? `screen-${stageView.screenFx}` : ''}`}>
      <header className="game-header">
        <button type="button" className="btn btn-ghost btn-icon-text" onClick={props.onMenu}>
          <img className="ui-icon" src={uiIconSprite('exit')} alt="" draggable={false} />
          나가기
        </button>
        <span className="game-status" aria-live="polite">
          {status}
        </span>
        <span className="game-header-actions">
          {props.onResign && state.result.kind === 'ongoing' && (
            <button type="button" className="btn btn-ghost btn-small" onClick={props.onResign}>
              기권
            </button>
          )}
          <SoundToggle />
          {myColor !== null ? null : (
            <button type="button" className="btn btn-ghost btn-icon" onClick={() => setLocalLeft(opposite)} aria-label="보드 좌우 뒤집기">
              <img className="ui-icon" src={uiIconSprite('flip')} alt="" draggable={false} />
            </button>
          )}
        </span>
      </header>

      <ClockBar state={state} leftColor={left} seats={props.seats} offsetMs={props.clockOffsetMs} />

      <div className="game-layout">
        <div className="board-row">
          <PlayerBar className="side-left" state={state} color={left} interaction={interaction} seat={props.seats?.[left]} randomized={props.randomized?.[left]} />
          <Board state={state} stage={stageView} interaction={interaction} leftColor={left} busy={busy} />
          <PlayerBar className="side-right" state={state} color={right} interaction={interaction} seat={props.seats?.[right]} randomized={props.randomized?.[right]} />
        </div>
        <aside className="under-board">
          {/* 알림 유무와 관계없이 한 줄 자리를 유지해 아래 패널이 밀리지 않게 한다 */}
          <p className={`notice notice-slot ${props.notice ? '' : 'is-empty'}`} title={props.notice ?? undefined}>
            {props.notice ?? '\u00a0'}
          </p>
          <AbilityPanel state={state} color={myColor ?? state.turn} interaction={interaction} busy={busy} />
          {props.sidebar}
        </aside>
      </div>

      <PromotionDialog state={state} interaction={interaction} />
      {props.onDrawVote && !props.spectator && <DrawOfferDialog state={state} askColor={askColor} onVote={props.onDrawVote} />}
      {!busy && props.showResultDialog !== false && <ResultDialog result={state.result}>{props.resultActions}</ResultDialog>}
    </div>
  );
}

const TENSION_PIECE_COUNT = 12;
const TENSION_HOLD_MS = 20_000;

/** 대국 배경음악: 기본 → (체크·종반) 긴장 → 결과에 따라 승리/패배 */
function useBattleTrack(state: GameState, myColor: Color | null): BgmTrack {
  const lastTension = useRef(0);
  const { result } = state;
  if (result.kind === 'win') return myColor === null || result.winner === myColor ? 'victory' : 'defeat';
  if (result.kind === 'draw') return 'defeat';

  const pieces = state.board.filter(Boolean).length;
  const tense = isInCheck(state, state.turn) || pieces <= TENSION_PIECE_COUNT;
  const now = Date.now();
  if (tense) lastTension.current = now;
  // 체크가 잠깐 풀려도 곡이 바로 되돌아가지 않도록 잠시 유지한다
  return tense || now - lastTension.current < TENSION_HOLD_MS ? 'tension' : 'battle';
}
