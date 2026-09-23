import {
  applyAction,
  checkTimeout,
  createGame,
  openDrawOffer,
  resign,
  voteDraw,
  type Action,
  type Color,
  type DrawVote,
  type GameMode,
  type GameState,
  type TimeControl,
} from '@hyperchess/engine';

/**
 * 대국을 다시 만드는 한 걸음. 엔진이 결정적이므로 시작 설정과 걸음(시각 포함)만으로 모든 국면을 되살린다.
 * 시계가 있는 대국은 행동 시각이 결과(시간 초과)를 바꾸므로 시각도 함께 남긴다.
 */
export type ReplayStep =
  | { readonly kind: 'action'; readonly action: Action; readonly at: number }
  | { readonly kind: 'drawOffer'; readonly at: number }
  | { readonly kind: 'drawVote'; readonly color: Color; readonly vote: DrawVote; readonly at: number }
  | { readonly kind: 'resign'; readonly color: Color; readonly at: number }
  | { readonly kind: 'timeout'; readonly at: number };

export interface ReplaySetup {
  readonly abilities: Readonly<Record<Color, string | null>>;
  readonly mode: GameMode;
  /** 표준이 아닌 시작 국면 */
  readonly fen?: string;
  readonly timeControl: TimeControl | null;
  readonly startedAt: number;
}

export interface ReplayData {
  readonly version: 1;
  readonly setup: ReplaySetup;
  readonly steps: readonly ReplayStep[];
}

export const replayStart = (setup: ReplaySetup): GameState =>
  createGame({ abilities: setup.abilities, mode: setup.mode, fen: setup.fen, timeControl: setup.timeControl, now: setup.startedAt });

export function applyReplayStep(state: GameState, step: ReplayStep): GameState {
  switch (step.kind) {
    case 'action':
      return applyAction(state, step.action, step.at);
    case 'drawOffer':
      return openDrawOffer(state, step.at);
    case 'drawVote':
      return voteDraw(state, step.color, step.vote, step.at);
    case 'resign':
      return resign(state, step.color);
    case 'timeout':
      return checkTimeout(state, step.at);
  }
}

/** 시작 국면부터 걸음마다의 국면 (길이 = 걸음 수 + 1). 규칙에 맞지 않는 걸음이 있으면 예외를 던진다 */
export function replayStates(data: ReplayData): GameState[] {
  const states = [replayStart(data.setup)];
  for (const step of data.steps) states.push(applyReplayStep(states[states.length - 1], step));
  return states;
}

/** 국면마다의 시각 (시계 표시용): 시작 시각, 이후는 그 걸음의 시각 */
export const replayTimes = (data: ReplayData): number[] => [data.setup.startedAt, ...data.steps.map((step) => step.at)];
