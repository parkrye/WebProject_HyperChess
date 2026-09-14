import { BALANCE, COSTS } from './balance';
import type { AbilityDefinition } from './types';

export const empress: AbilityDefinition = {
  id: 'empress',
  name: '여제',
  description: '퀸이 하나뿐일 때 수를 놓는 대신 사용한다. 체크가 사라지고 퀸만 왕족이 되며, 프로모션은 퀸 대신 승급 킹으로 한다. 퀸이 잡히면 여제가 풀리고 남은 킹들이 왕족이 된다(킹이 하나 남을 때까지 체크 없음). 퀸을 다시 얻으면 재사용 가능.',
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
