import type { Difficulty } from '@hyperchess/ai';
import type { Action, Color, GameState } from '@hyperchess/engine';
import { useEffect, useRef, useState } from 'react';
import type { AiRequest, AiResponse } from './ai.worker';

/** 너무 빨리 두면 연출을 따라가기 어려워 최소 대기 시간을 둔다 */
const MIN_THINK_MS = 450;

export interface AiConfig {
  readonly color: Color;
  readonly difficulty: Difficulty;
}

/** AI 차례가 되면 Web Worker에서 수를 계산해 dispatch 한다 */
export function useAiOpponent(state: GameState, ai: AiConfig | null, busy: boolean, dispatch: (action: Action) => void) {
  const workerRef = useRef<Worker | null>(null);
  const requestId = useRef(0);
  const [thinking, setThinking] = useState(false);

  useEffect(() => {
    if (!ai) return;
    const worker = new Worker(new URL('./ai.worker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;
    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, [ai]);

  const aiTurn = !!ai && state.turn === ai.color && state.result.kind === 'ongoing';

  useEffect(() => {
    const worker = workerRef.current;
    if (!aiTurn || busy || !worker) return;

    const id = ++requestId.current;
    const startedAt = performance.now();
    let cancelled = false;
    setThinking(true);

    const onMessage = (event: MessageEvent<AiResponse>) => {
      const response = event.data;
      if (response.id !== id) return;
      worker.removeEventListener('message', onMessage);
      const delay = Math.max(0, MIN_THINK_MS - (performance.now() - startedAt));
      window.setTimeout(() => {
        if (cancelled) return;
        setThinking(false);
        if ('action' in response) dispatch(response.action);
        else console.error('[ai]', response.error);
      }, delay);
    };

    worker.addEventListener('message', onMessage);
    worker.postMessage({ id, state, difficulty: ai!.difficulty } satisfies AiRequest);

    return () => {
      cancelled = true;
      worker.removeEventListener('message', onMessage);
      setThinking(false);
    };
  }, [aiTurn, busy, state, ai, dispatch]);

  return { thinking: aiTurn && thinking };
}
