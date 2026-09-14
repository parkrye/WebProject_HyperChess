import { applyAction, createGame, IllegalActionError, type Action, type GameSetup } from '@hyperchess/engine';
import { useCallback } from 'react';
import { useAnimatedGame } from './useAnimatedGame';

/** 한 기기에서 번갈아 두는 로컬 게임 */
export function useLocalGame(setup: GameSetup) {
  const game = useAnimatedGame(() => createGame(setup));
  const { present, latest, busy } = game;

  const dispatch = useCallback(
    (action: Action) => {
      if (busy) return;
      try {
        void present(applyAction(latest.current, action));
      } catch (error) {
        if (!(error instanceof IllegalActionError)) throw error;
      }
    },
    [busy, present, latest],
  );

  return { ...game, dispatch };
}
