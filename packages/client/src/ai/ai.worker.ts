import { chooseAction, type Difficulty } from '@hyperchess/ai';
import type { Action, GameState } from '@hyperchess/engine';

export interface AiRequest {
  readonly id: number;
  readonly state: GameState;
  readonly difficulty: Difficulty;
}

export type AiResponse = { readonly id: number; readonly action: Action } | { readonly id: number; readonly error: string };

// DOM 타입의 self를 워커 컨텍스트로 사용
const ctx = self as unknown as Worker;

ctx.onmessage = (event: MessageEvent<AiRequest>) => {
  const { id, state, difficulty } = event.data;
  try {
    const { action } = chooseAction(state, difficulty);
    ctx.postMessage({ id, action } satisfies AiResponse);
  } catch (error) {
    ctx.postMessage({ id, error: error instanceof Error ? error.message : String(error) } satisfies AiResponse);
  }
};
