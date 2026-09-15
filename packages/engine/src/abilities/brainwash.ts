import { isRoyal } from '../rules';
import { neighbors } from '../square';
import { opposite, type AbilityParams, type Board, type Color, type Square } from '../types';
import { BALANCE, BRAINWASH_NEIGHBORS, COSTS } from './balance';
import type { AbilityDefinition } from './types';

/** 상대 말을 둘러싼 8방향 인접 칸 중 color의 말이 있는 칸 */
export function trappingSquares(board: Board, square: Square, color: Color): Square[] {
  return neighbors(square).filter((sq) => board[sq]?.color === color);
}

/** 8방향 인접 칸 중 color의 말이 BRAINWASH_NEIGHBORS개 이상이면 갇힌 것. 보드 끝은 막는 쪽으로 치지 않는다 */
export function isTrapped(board: Board, square: Square, color: Color): boolean {
  return trappingSquares(board, square, color).length >= BRAINWASH_NEIGHBORS;
}

export const brainwash: AbilityDefinition = {
  id: 'brainwash',
  name: '세뇌',
  description: `수를 놓는 대신, 8방향으로 인접한 자신의 말이 ${BRAINWASH_NEIGHBORS}개 이상인 상대 말(킹 제외)을 영구히 자신의 말로 만든다. 비용은 말 종류에 따라 다르다.`,
  timing: 'insteadOfMove',
  balance: BALANCE.brainwash,

  cost(state, _color, params) {
    const piece = state.board[Number(params.square)];
    return piece ? COSTS.brainwash[piece.type] : Infinity;
  },

  candidates(state, color) {
    const enemy = opposite(color);
    const enemyRules = state.players[enemy].rules;
    const result: AbilityParams[] = [];
    state.board.forEach((piece, square) => {
      if (!piece || piece.color !== enemy || piece.type === 'k' || isRoyal(piece, enemyRules)) return;
      if (isTrapped(state.board, square, color)) result.push({ square });
    });
    return result;
  },

  apply(state, color, params) {
    const square = Number(params.square);
    const board = state.board.slice();
    const piece = board[square];
    if (!piece) throw new Error('No piece to brainwash');
    board[square] = { ...piece, color, moved: true };
    return { ...state, board };
  },
};
