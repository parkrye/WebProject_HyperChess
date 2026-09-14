import { BALANCE, COSTS } from './balance';
import type { AbilityDefinition } from './types';

export const empress: AbilityDefinition = {
  id: 'empress',
  name: '여제',
  description: '1회성. 퀸이 하나뿐일 때 수를 놓는 대신 사용한다. 체크/체크메이트가 사라지고 킹이 잡혀도 계속하며, 대신 퀸이 잡히면 패배한다. 이후 프로모션은 퀸 대신 승급 킹으로 한다.',
  timing: 'insteadOfMove',
  balance: BALANCE.empress,
  cost: () => COSTS.empress,

  candidates(state, color) {
    if (state.players[color].rules.queensRoyal) return [];
    // 퀸이 정확히 하나일 때만 사용 가능 (이후 퀸 프로모션이 막혀 그 퀸이 유일한 왕족이 된다)
    const queens = state.board.filter((piece) => piece?.color === color && piece.type === 'q').length;
    return queens === 1 ? [{}] : [];
  },

  apply(state, color) {
    const player = state.players[color];
    return {
      ...state,
      players: {
        ...state.players,
        [color]: { ...player, rules: { ...player.rules, queensRoyal: true, noQueenPromotion: true } },
      },
    };
  },
};
