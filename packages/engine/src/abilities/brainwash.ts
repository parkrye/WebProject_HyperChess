import { isRoyal } from '../rules';
import { offset } from '../square';
import { opposite, type AbilityParams, type Board, type Color, type Square } from '../types';
import { BALANCE, COSTS } from './balance';
import type { AbilityDefinition } from './types';

/** 상대 말의 좌우 두 칸 또는 상하 두 칸이 모두 color의 말이면 갇힌 것. 보드 끝은 막는 쪽으로 치지 않는다 */
export function isTrapped(board: Board, square: Square, color: Color): boolean {
  const ownedBy = (sq: Square | null) => sq !== null && board[sq]?.color === color;
  const sideways = ownedBy(offset(square, -1, 0)) && ownedBy(offset(square, 1, 0));
  const vertical = ownedBy(offset(square, 0, -1)) && ownedBy(offset(square, 0, 1));
  return sideways || vertical;
}

export const brainwash: AbilityDefinition = {
  id: 'brainwash',
  name: '세뇌',
  description: '수를 놓는 대신, 좌우 또는 상하 양쪽을 자신의 말로 가둔 상대 말(킹 제외)을 영구히 자신의 말로 만든다. 비용은 말 종류에 따라 다르다.',
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
