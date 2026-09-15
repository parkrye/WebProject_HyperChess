import { isWall } from '../movegen';
import { ORTHOGONAL_DELTAS, isBackRank, neighbors, offset } from '../square';
import type { AbilityParams, Board, Square } from '../types';
import { BALANCE, COSTS } from './balance';
import type { AbilityDefinition } from './types';

/** 상하좌우 중 한 곳이라도 보드 끝, 빈칸, 다른 색 말이면 노출된 말 */
export function isExposed(board: Board, sq: Square): boolean {
  const piece = board[sq];
  if (!piece) return false;
  return ORTHOGONAL_DELTAS.some(([df, dr]) => {
    const next = offset(sq, df, dr);
    if (next === null) return true;
    const occupant = board[next];
    return !occupant || occupant.color !== piece.color;
  });
}

export const telekinesis: AbilityDefinition = {
  id: 'telekinesis',
  name: '염동력',
  description: '수를 놓는 대신, 자신의 말이나 노출된 상대의 말을 인접한 빈칸으로 1칸 이동시킨다.',
  timing: 'insteadOfMove',
  balance: BALANCE.telekinesis,
  cost: () => COSTS.telekinesis,

  candidates(state, color) {
    const result: AbilityParams[] = [];
    state.board.forEach((piece, from) => {
      if (!piece) return;
      if (piece.color !== color && !isExposed(state.board, from)) return;
      for (const to of neighbors(from)) {
        if (state.board[to] || isWall(state.walls, to)) continue;
        if (piece.type === 'p' && isBackRank(to)) continue;
        result.push({ from, to });
      }
    });
    return result;
  },

  apply(state, _color, params) {
    const from = Number(params.from);
    const to = Number(params.to);
    const board = state.board.slice();
    const piece = board[from];
    if (!piece) throw new Error('No piece to move');
    board[from] = null;
    board[to] = { ...piece, moved: true };
    return { ...state, board };
  },
};
