import { applyAction, createGame, IllegalActionError, type Action, type Color, type DrawVote, type GameMode } from '@hyperchess/engine';

const isPrimitive = (value: unknown) => typeof value === 'number' || typeof value === 'string';

/** 외부에서 받은 값이 행동(수·능력) 모양인지 */
export function isAction(value: unknown): value is Action {
  if (!value || typeof value !== 'object') return false;
  const action = value as Record<string, unknown>;
  if (action.type === 'move') {
    const move = action.move as Record<string, unknown> | null;
    return !!move && typeof move.from === 'number' && typeof move.to === 'number' && (move.promotion === undefined || typeof move.promotion === 'string');
  }
  if (action.type === 'ability') {
    const params = action.params;
    return !!params && typeof params === 'object' && Object.values(params).every(isPrimitive);
  }
  return false;
}

/** 외부에서 받은 값이 무승부 제안 응답인지 */
export const isDrawVote = (value: unknown): value is DrawVote => value === 'accept' || value === 'decline' || value === 'judge';

/** 시작 국면에서 수순을 끝까지 재생할 수 있는지 (규칙 위반·끝난 뒤의 행동이 있으면 false) */
export function isReplayable(
  abilities: Readonly<Record<Color, string | null>>,
  actions: readonly Action[],
  start: { readonly mode?: GameMode; readonly fen?: string } = {},
): boolean {
  let state = createGame({ abilities, ...start });
  try {
    for (const action of actions) state = applyAction(state, action, 0);
    return true;
  } catch (error) {
    if (error instanceof IllegalActionError) return false;
    throw error;
  }
}
