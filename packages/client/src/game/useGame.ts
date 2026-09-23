import {
  checkTimeout,
  createGame,
  drawOfferDue,
  IllegalActionError,
  type Action,
  type Color,
  type DrawVote,
  type GameSetup,
  type GameState,
} from '@hyperchess/engine';
import { applyReplayStep, type ReplayData, type ReplayStep } from '@hyperchess/protocol';
import { useCallback, useEffect, useRef, type RefObject } from 'react';
import { useAnimatedGame } from './useAnimatedGame';

const WATCH_MS = 250;

export interface LocalGameOptions {
  /** 무승부 제안을 묻지 않고 바로 합의 무승부로 끝낸다 (AI 내전) */
  readonly autoDraw?: boolean;
}

/** 한 기기에서 번갈아 두는 로컬 게임 (핫시트·AI 대전·AI 내전) */
export function useLocalGame(setup: GameSetup, speed?: RefObject<number>, options: LocalGameOptions = {}) {
  const startedAt = useRef(0);
  const game = useAnimatedGame(() => {
    startedAt.current = Date.now();
    return createGame({ ...setup, now: startedAt.current });
  }, speed);
  const { present, latest, busy } = game;
  /** 이번 게임에서 둔 행동 순서 (기록용) */
  const actions = useRef<Action[]>([]);
  /** 상태를 바꾼 걸음들 (리플레이용) */
  const steps = useRef<ReplayStep[]>([]);
  /**
   * 걸음을 적용한 최신 상태. latest는 연출 큐를 거쳐 늦게 바뀌므로, 연출 중에 들어온 걸음도
   * 앞 걸음 위에 쌓이도록 따로 둔다 (그래야 리플레이가 실제 대국과 같게 재생된다)
   */
  const truth = useRef<GameState | null>(null);
  const current = useCallback(() => truth.current ?? latest.current, [latest]);

  /** 걸음을 적용하고 남긴다. 규칙에 어긋나면 IllegalActionError를 그대로 던진다 */
  const take = useCallback(
    (...taken: ReplayStep[]) => {
      let next = current();
      for (const step of taken) next = applyReplayStep(next, step);
      truth.current = next;
      steps.current.push(...taken);
      void present(next);
    },
    [current, present],
  );

  const replay = useCallback(
    (): ReplayData => ({
      version: 1,
      setup: {
        abilities: { w: setup.abilities?.w ?? null, b: setup.abilities?.b ?? null },
        mode: current().mode,
        ...(setup.fen ? { fen: setup.fen } : {}),
        timeControl: setup.timeControl ?? null,
        startedAt: startedAt.current,
      },
      steps: [...steps.current],
    }),
    [setup, current],
  );
  // 이펙트를 다시 걸지 않도록 값이 아니라 ref로 본다
  const autoDraw = useRef(options.autoDraw ?? false);
  autoDraw.current = options.autoDraw ?? false;

  // 시간 제한 감시와 무승부 제안 감시: 차례가 시간을 넘기면 패배, 말 변동이 오래 없으면 제안
  useEffect(() => {
    const timer = window.setInterval(() => {
      const state = current();
      const at = Date.now();
      if (checkTimeout(state, at) !== state) {
        take({ kind: 'timeout', at });
        return;
      }
      if (!drawOfferDue(state)) return;
      // 합의 무승부(AI 내전)는 제안을 띄우고 양쪽이 바로 승낙한 것과 같다
      if (autoDraw.current) {
        take({ kind: 'drawOffer', at }, { kind: 'drawVote', color: 'w', vote: 'accept', at }, { kind: 'drawVote', color: 'b', vote: 'accept', at });
        return;
      }
      take({ kind: 'drawOffer', at });
    }, WATCH_MS);
    return () => window.clearInterval(timer);
  }, [current, take]);

  const dispatch = useCallback(
    (action: Action) => {
      if (busy) return;
      try {
        take({ kind: 'action', action, at: Date.now() });
        actions.current.push(action);
      } catch (error) {
        if (!(error instanceof IllegalActionError)) throw error;
      }
    },
    [busy, take],
  );

  /**
   * 무승부 제안에 답한다. 여러 색을 한 번에 받는 것은 AI 대전에서 AI가 사람의 선택을
   * 그대로 따르기 때문이다 (present는 비동기라 한 번에 이어 붙여야 한다).
   */
  const vote = useCallback(
    (colors: readonly Color[], choice: DrawVote) => {
      try {
        const at = Date.now();
        take(...colors.map((color): ReplayStep => ({ kind: 'drawVote', color, vote: choice, at })));
      } catch (error) {
        if (!(error instanceof IllegalActionError)) throw error;
      }
    },
    [take],
  );

  const giveUp = useCallback(
    (color: Color) => {
      try {
        take({ kind: 'resign', color, at: Date.now() });
      } catch (error) {
        if (!(error instanceof IllegalActionError)) throw error;
      }
    },
    [take],
  );

  return { ...game, dispatch, actions, vote, giveUp, replay };
}
