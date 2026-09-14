import { isSquareAttacked } from '../movegen';
import { isInCheck, royalSquares } from '../rules';
import { opposite, type AbilityParams } from '../types';
import { BALANCE, COSTS } from './balance';
import type { AbilityDefinition } from './types';

export const heir: AbilityDefinition = {
  id: 'heir',
  name: '계승자',
  description: '체크 상태일 때 수를 놓는 대신 사용한다. 킹을 선왕으로, 공격받지 않는 폰 하나를 계승자(킹의 움직임 추가)로 바꾼다. 둘 다 잡혀야 패배한다.',
  timing: 'insteadOfMove',
  balance: BALANCE.heir,
  cost: () => COSTS.heir,

  candidates(state, color) {
    if (!isInCheck(state, color)) return [];
    const royals = royalSquares(state, color);
    const king = royals.length === 1 ? state.board[royals[0]] : null;
    if (!king || king.type !== 'k' || king.title) return [];

    const enemy = opposite(color);
    const result: AbilityParams[] = [];
    state.board.forEach((piece, square) => {
      if (!piece || piece.color !== color || piece.type !== 'p' || piece.royal) return;
      if (isSquareAttacked(state.board, square, enemy)) return;
      result.push({ square });
    });
    return result;
  },

  apply(state, color, params) {
    const kingSquare = royalSquares(state, color)[0];
    const pawnSquare = Number(params.square);
    const board = state.board.slice();
    const king = board[kingSquare];
    const pawn = board[pawnSquare];
    if (!king || !pawn) throw new Error('Heir requires a king and a pawn');
    board[kingSquare] = { ...king, title: 'oldKing' };
    board[pawnSquare] = { ...pawn, royal: true, enhanced: false, title: 'heir' };
    return { ...state, board };
  },
};
