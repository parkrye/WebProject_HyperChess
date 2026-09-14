import { BALANCE, COSTS } from './balance';
import type { AbilityDefinition } from './types';

export const empress: AbilityDefinition = {
  id: 'empress',
  name: '여제',
  description: '1회성. 수를 놓는 대신 사용한다. 체크/체크메이트가 사라지고, 킹과 퀸이 모두 잡혀야 패배한다. 이후 프로모션은 퀸 대신 승급 킹(왕족 아님)으로 한다.',
  timing: 'insteadOfMove',
  balance: BALANCE.empress,
  cost: () => COSTS.empress,

  candidates(state, color) {
    return state.players[color].rules.queensRoyal ? [] : [{}];
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
