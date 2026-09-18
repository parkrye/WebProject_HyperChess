import {
  applyAction,
  checkTimeout,
  createGame,
  drawByAgreement,
  drawOfferDue,
  IllegalActionError,
  openDrawOffer,
  resign,
  voteDraw,
  type Action,
  type Color,
  type DrawVote,
  type GameSetup,
} from '@hyperchess/engine';
import { useCallback, useEffect, useRef, type RefObject } from 'react';
import { useAnimatedGame } from './useAnimatedGame';

const WATCH_MS = 250;

export interface LocalGameOptions {
  /** 무승부 제안을 묻지 않고 바로 합의 무승부로 끝낸다 (AI 내전) */
  readonly autoDraw?: boolean;
}

/** 한 기기에서 번갈아 두는 로컬 게임 (핫시트·AI 대전·AI 내전) */
export function useLocalGame(setup: GameSetup, speed?: RefObject<number>, options: LocalGameOptions = {}) {
  const game = useAnimatedGame(() => createGame({ ...setup, now: Date.now() }), speed);
  const { present, latest, busy } = game;
  /** 이번 게임에서 둔 행동 순서 (기록용) */
  const actions = useRef<Action[]>([]);
  // 이펙트를 다시 걸지 않도록 값이 아니라 ref로 본다
  const autoDraw = useRef(options.autoDraw ?? false);
  autoDraw.current = options.autoDraw ?? false;

  // 시간 제한 감시와 무승부 제안 감시: 차례가 시간을 넘기면 패배, 말 변동이 오래 없으면 제안
  useEffect(() => {
    const timer = window.setInterval(() => {
      const current = latest.current;
      const timed = checkTimeout(current, Date.now());
      if (timed !== current) {
        void present(timed);
        return;
      }
      if (!drawOfferDue(current)) return;
      void present(autoDraw.current ? drawByAgreement(current, Date.now()) : openDrawOffer(current, Date.now()));
    }, WATCH_MS);
    return () => window.clearInterval(timer);
  }, [latest, present]);

  const dispatch = useCallback(
    (action: Action) => {
      if (busy) return;
      try {
        const next = applyAction(latest.current, action, Date.now());
        actions.current.push(action);
        void present(next);
      } catch (error) {
        if (!(error instanceof IllegalActionError)) throw error;
      }
    },
    [busy, present, latest],
  );

  /**
   * 무승부 제안에 답한다. 여러 색을 한 번에 받는 것은 AI 대전에서 AI가 사람의 선택을
   * 그대로 따르기 때문이다 (present는 비동기라 한 번에 이어 붙여야 한다).
   */
  const vote = useCallback(
    (colors: readonly Color[], choice: DrawVote) => {
      try {
        let next = latest.current;
        const now = Date.now();
        for (const color of colors) next = voteDraw(next, color, choice, now);
        void present(next);
      } catch (error) {
        if (!(error instanceof IllegalActionError)) throw error;
      }
    },
    [present, latest],
  );

  const giveUp = useCallback(
    (color: Color) => {
      try {
        void present(resign(latest.current, color));
      } catch (error) {
        if (!(error instanceof IllegalActionError)) throw error;
      }
    },
    [present, latest],
  );

  return { ...game, dispatch, actions, vote, giveUp };
}
