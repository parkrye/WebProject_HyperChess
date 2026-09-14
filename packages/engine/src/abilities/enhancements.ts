import type { AbilityParams, PieceType } from '../types';
import { BALANCE, COSTS } from './balance';
import type { AbilityBalance, AbilityDefinition } from './types';

interface EnhancementSpec {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly pieceType: PieceType;
  readonly balance: AbilityBalance;
  readonly cost: number;
}

function createEnhancement(spec: EnhancementSpec): AbilityDefinition {
  return {
    id: spec.id,
    name: spec.name,
    description: spec.description,
    timing: 'insteadOfMove',
    balance: spec.balance,
    cost: () => spec.cost,

    candidates(state, color) {
      const result: AbilityParams[] = [];
      state.board.forEach((piece, square) => {
        if (!piece || piece.color !== color || piece.type !== spec.pieceType) return;
        if (piece.enhanced || piece.royal) return;
        result.push({ square });
      });
      return result;
    },

    apply(state, _color, params) {
      const square = Number(params.square);
      const board = state.board.slice();
      const piece = board[square];
      if (!piece) throw new Error('No piece to enhance');
      board[square] = { ...piece, enhanced: true };
      return { ...state, board };
    },
  };
}

export const heavyInfantry = createEnhancement({
  id: 'heavyInfantry',
  name: '중보병',
  description: '수를 놓는 대신, 자신의 폰 하나를 강화한다. 강화 폰은 폰의 움직임에 더해 킹처럼 움직일 수 있다.',
  pieceType: 'p',
  balance: BALANCE.heavyInfantry,
  cost: COSTS.heavyInfantry,
});

export const lancer = createEnhancement({
  id: 'lancer',
  name: '창기병',
  description: '수를 놓는 대신, 자신의 나이트 하나를 강화한다. 강화 나이트는 나이트와 룩의 움직임을 모두 가진다.',
  pieceType: 'n',
  balance: BALANCE.lancer,
  cost: COSTS.lancer,
});

export const chariot = createEnhancement({
  id: 'chariot',
  name: '전차',
  description: '수를 놓는 대신, 자신의 룩 하나를 강화한다. 강화 룩은 자신의 말을 뛰어넘어 움직일 수 있다.',
  pieceType: 'r',
  balance: BALANCE.chariot,
  cost: COSTS.chariot,
});

export const paladin = createEnhancement({
  id: 'paladin',
  name: '팔라딘',
  description: '수를 놓는 대신, 자신의 비숍 하나를 강화한다. 강화 비숍은 자신의 말을 뛰어넘어 대각선으로 움직이거나, 좌우 빈칸으로 한 칸 옆걸음할 수 있다.',
  pieceType: 'b',
  balance: BALANCE.paladin,
  cost: COSTS.paladin,
});
