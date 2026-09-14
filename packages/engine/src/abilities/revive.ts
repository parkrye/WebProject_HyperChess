import { isBackRank, neighbors } from '../square';
import type { AbilityParams, Square } from '../types';
import { BALANCE, COSTS } from './balance';
import type { AbilityDefinition } from './types';

export const revive: AbilityDefinition = {
  id: 'revive',
  name: '부활',
  description: '수를 놓는 대신, 잡힌 자신의 말을 자신의 말과 인접한 빈칸에 다시 배치한다.',
  timing: 'insteadOfMove',
  balance: BALANCE.revive,
  canRestoreMaterial: true,

  cost(state, color, params) {
    const piece = state.captured[color].find((p) => p.id === params.pieceId);
    return piece ? COSTS.revive[piece.type] : Infinity;
  },

  candidates(state, color) {
    const slots: Square[] = [];
    state.board.forEach((piece, sq) => {
      if (piece) return;
      const touchesOwn = neighbors(sq).some((n) => state.board[n]?.color === color);
      if (touchesOwn) slots.push(sq);
    });

    const result: AbilityParams[] = [];
    const seen = new Set<string>();
    for (const piece of state.captured[color]) {
      if (seen.has(piece.id)) continue;
      seen.add(piece.id);
      for (const to of slots) {
        if (piece.type === 'p' && isBackRank(to)) continue;
        result.push({ pieceId: piece.id, to });
      }
    }
    return result;
  },

  apply(state, color, params) {
    const to = Number(params.to);
    const piece = state.captured[color].find((p) => p.id === params.pieceId);
    if (!piece) throw new Error('Captured piece not found');
    const board = state.board.slice();
    board[to] = { ...piece, moved: true };
    return {
      ...state,
      board,
      captured: { ...state.captured, [color]: state.captured[color].filter((p) => p.id !== piece.id) },
    };
  },
};
