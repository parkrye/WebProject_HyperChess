import { applyAction, createGame, IllegalActionError, type Action, type GameSetup, type GameState } from '@hyperchess/engine';
import { useCallback, useRef, useState } from 'react';
import { playEvent } from '../effects/playEvent';
import { useStage } from './useStage';

export function useGame(setup: GameSetup) {
  const [state, setState] = useState<GameState>(() => createGame(setup));
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const stage = useStage();

  const dispatch = useCallback(
    async (action: Action) => {
      if (busyRef.current) return;

      let after: GameState;
      try {
        after = applyAction(state, action);
      } catch (error) {
        if (error instanceof IllegalActionError) return;
        throw error;
      }

      const event = after.log[after.log.length - 1];
      busyRef.current = true;
      setBusy(true);
      try {
        if (event) await playEvent({ event, before: state, after, stage: stage.api });
      } finally {
        setState(after);
        stage.reset();
        busyRef.current = false;
        setBusy(false);
      }
    },
    [state, stage],
  );

  return { state, dispatch, busy, stageView: stage.view };
}
