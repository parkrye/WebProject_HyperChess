import { attacks } from '../movegen';
import { opposite, type AbilityParams, type Square } from '../types';
import { BALANCE, COSTS } from './balance';
import type { AbilityDefinition } from './types';

export const snipe: AbilityDefinition = {
  id: 'snipe',
  name: '저격',
  description: '수를 놓는 대신, 자신의 말이 공격하고 있는 상대 말(킹 포함)을 제자리에서 잡는다. 저격한 말은 움직이지 않는다.',
  timing: 'insteadOfMove',
  balance: BALANCE.snipe,
  cost: () => COSTS.snipe,

  candidates(state, color) {
    const enemy = opposite(color);
    const shooters: Square[] = [];
    const targets: Square[] = [];
    state.board.forEach((piece, square) => {
      if (piece?.color === color) shooters.push(square);
      else if (piece?.color === enemy) targets.push(square);
    });

    const result: AbilityParams[] = [];
    for (const from of shooters) {
      for (const to of targets) {
        if (attacks(state.board, from, to, state.walls)) result.push({ from, to });
      }
    }
    return result;
  },

  apply(state, _color, params) {
    const to = Number(params.to);
    const target = state.board[to];
    if (!target) throw new Error('No piece to snipe');
    const board = state.board.slice();
    board[to] = null;
    return {
      ...state,
      board,
      captured: { ...state.captured, [target.color]: [...state.captured[target.color], target] },
    };
  },
};
