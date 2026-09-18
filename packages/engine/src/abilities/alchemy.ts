import { isRoyal } from '../rules';
import { promotionRank, rankOf } from '../square';
import { opposite, type AbilityParams, type PieceType } from '../types';
import { ALCHEMY_VALUE, BALANCE, COSTS } from './balance';
import type { AbilityDefinition } from './types';

type AlchemyType = keyof typeof ALCHEMY_VALUE;

const ALCHEMY_TYPES = Object.keys(ALCHEMY_VALUE) as AlchemyType[];
const PROMOTION_TYPES: readonly PieceType[] = ['q', 'r', 'b', 'n'];

const isAlchemyType = (type: PieceType): type is AlchemyType => type in ALCHEMY_VALUE;

export const alchemy: AbilityDefinition = {
  id: 'alchemy',
  name: '연금술',
  description: '수를 놓는 대신, 자신의 말 하나(킹 제외)를 가치가 같거나 낮은 다른 말로 바꾼다.',
  timing: 'insteadOfMove',
  balance: BALANCE.alchemy,
  cost: () => COSTS.alchemy,

  candidates(state, color) {
    const { rules } = state.players[color];
    const result: AbilityParams[] = [];
    state.board.forEach((piece, square) => {
      if (!piece || piece.color !== color || !isAlchemyType(piece.type) || isRoyal(piece, rules)) return;
      const value = ALCHEMY_VALUE[piece.type];
      const rank = rankOf(square);

      for (const type of ALCHEMY_TYPES) {
        if (type === piece.type || ALCHEMY_VALUE[type] > value) continue;
        if (type !== 'p') {
          result.push({ square, type });
          continue;
        }
        if (rank === promotionRank(opposite(color))) continue;
        if (rank !== promotionRank(color)) {
          result.push({ square, type });
          continue;
        }
        for (const candidate of PROMOTION_TYPES) {
          const promotion = candidate === 'q' && rules.noQueenPromotion ? 'k' : candidate;
          if (promotion !== piece.type) result.push({ square, type, promotion });
        }
      }
    });
    return result;
  },

  apply(state, _color, params) {
    const square = Number(params.square);
    const board = state.board.slice();
    const piece = board[square];
    if (!piece) throw new Error('No piece to transmute');
    const type = String(params.promotion ?? params.type) as PieceType;
    board[square] = { ...piece, type, moved: true, enhanced: false, ...(type === 'k' ? { title: 'promoted' as const } : {}) };
    return { ...state, board };
  },
};
