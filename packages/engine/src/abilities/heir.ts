import { isSquareAttacked } from '../movegen';
import { isInCheck, royalSquares } from '../rules';
import { opposite, type AbilityParams } from '../types';
import { BALANCE, COSTS } from './balance';
import type { AbilityDefinition } from './types';

export const heir: AbilityDefinition = {
  id: 'heir',
  name: '계승자',
  description: '체크 상태일 때 수를 놓는 대신 사용한다. 남은 왕을 선왕으로, 공격받지 않는 폰 하나를 계승자(킹의 움직임 추가)로 바꾼다. 둘 다 잡혀야 패배하며, 자원이 회복되면 다시 쓸 수 있다.',
  timing: 'insteadOfMove',
  balance: BALANCE.heir,
  cost: () => COSTS.heir,

  candidates(state, color) {
    if (!isInCheck(state, color)) return [];
    // 왕(킹·선왕·계승자 무엇이든)이 하나만 남아 체크일 때 사용할 수 있다
    if (royalSquares(state, color).length !== 1) return [];

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
    const rulerSquare = royalSquares(state, color)[0];
    const pawnSquare = Number(params.square);
    const board = state.board.slice();
    const ruler = board[rulerSquare];
    const pawn = board[pawnSquare];
    if (!ruler || !pawn) throw new Error('Heir requires a ruler and a pawn');
    board[rulerSquare] = { ...ruler, title: 'oldKing' };
    board[pawnSquare] = { ...pawn, royal: true, enhanced: false, title: 'heir' };
    return { ...state, board };
  },
};
