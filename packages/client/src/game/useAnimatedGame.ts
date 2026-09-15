import type { GameEvent, GameState } from '@hyperchess/engine';
import { useCallback, useRef, useState, type RefObject } from 'react';
import { playEvent } from '../effects/playEvent';
import { useStage } from './useStage';

const sameEvent = (a: GameEvent | undefined, b: GameEvent | undefined) => JSON.stringify(a) === JSON.stringify(b);

/**
 * 새 상태를 받으면 직전 상태와 비교해 마지막 이벤트를 연출한 뒤 반영한다 (순차 큐).
 * speed: 연출 배속, 0이면 연출 없이 바로 반영
 */
export function useAnimatedGame(initial: GameState | (() => GameState), speed?: RefObject<number>) {
  const [state, setState] = useState(initial);
  const [busy, setBusy] = useState(false);
  const stage = useStage(speed);
  const latest = useRef(state);
  const queue = useRef<Promise<void>>(Promise.resolve());

  const present = useCallback(
    (next: GameState) => {
      queue.current = queue.current.then(async () => {
        const before = latest.current;
        latest.current = next;
        const event = next.log[next.log.length - 1];
        const isNewEvent = next.log.length > 0 && !sameEvent(event, before.log[before.log.length - 1]);

        if (!event || !isNewEvent || speed?.current === 0) {
          setState(next);
          return;
        }

        setBusy(true);
        try {
          await playEvent({ event, before, after: next, stage: stage.api });
        } finally {
          setState(next);
          stage.reset();
          setBusy(false);
        }
      });
      return queue.current;
    },
    [stage, speed],
  );

  return { state, busy, stageView: stage.view, present, latest };
}
