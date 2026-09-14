import { isBackRank } from '../square';
import type { AbilityParams, Piece, Square } from '../types';
import { BALANCE, COSTS } from './balance';
import type { AbilityDefinition } from './types';

const sameShape = (a: Piece, b: Piece) =>
  a.type === b.type && a.enhanced === b.enhanced && a.royal === b.royal && a.title === b.title;

const pawnBlocked = (piece: Piece, to: Square) => piece.type === 'p' && isBackRank(to);

export const teleport: AbilityDefinition = {
  id: 'teleport',
  name: '순간 이동',
  description: '수를 놓는 대신, 자신의 말 두 개의 위치를 서로 바꾼다.',
  timing: 'insteadOfMove',
  balance: BALANCE.teleport,
  cost: () => COSTS.teleport,

  candidates(state, color) {
    const own: Square[] = [];
    state.board.forEach((piece, sq) => {
      if (piece && piece.color === color) own.push(sq);
    });

    const result: AbilityParams[] = [];
    for (let i = 0; i < own.length; i++) {
      for (let j = i + 1; j < own.length; j++) {
        const a = own[i];
        const b = own[j];
        const pa = state.board[a];
        const pb = state.board[b];
        if (!pa || !pb || sameShape(pa, pb)) continue;
        if (pawnBlocked(pa, b) || pawnBlocked(pb, a)) continue;
        result.push({ a, b });
      }
    }
    return result;
  },

  apply(state, _color, params) {
    const a = Number(params.a);
    const b = Number(params.b);
    const board = state.board.slice();
    const pa = board[a];
    const pb = board[b];
    if (!pa || !pb) throw new Error('Teleport requires two pieces');
    board[a] = { ...pb, moved: true };
    board[b] = { ...pa, moved: true };
    return { ...state, board };
  },
};
