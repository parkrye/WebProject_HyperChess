import { applyAction, checkTimeout, createGame, IllegalActionError, type Action, type GameSetup } from '@hyperchess/engine';
import { useCallback, useEffect, type RefObject } from 'react';
import { useAnimatedGame } from './useAnimatedGame';

const TIMEOUT_CHECK_MS = 250;

/** 한 기기에서 번갈아 두는 로컬 게임 (핫시트·AI 대전) */
export function useLocalGame(setup: GameSetup, speed?: RefObject<number>) {
  const game = useAnimatedGame(() => createGame({ ...setup, now: Date.now() }), speed);
  const { present, latest, busy } = game;

  // 시간 제한 감시: 현재 차례가 시간을 넘기면 즉시 패배 처리
  useEffect(() => {
    const timer = window.setInterval(() => {
      const current = latest.current;
      const next = checkTimeout(current, Date.now());
      if (next !== current) void present(next);
    }, TIMEOUT_CHECK_MS);
    return () => window.clearInterval(timer);
  }, [latest, present]);

  const dispatch = useCallback(
    (action: Action) => {
      if (busy) return;
      try {
        void present(applyAction(latest.current, action, Date.now()));
      } catch (error) {
        if (!(error instanceof IllegalActionError)) throw error;
      }
    },
    [busy, present, latest],
  );

  return { ...game, dispatch };
}
