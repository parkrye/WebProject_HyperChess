import { legalMoves } from '../rules';
import { BALANCE, COSTS } from './balance';
import type { AbilityDefinition } from './types';

export const haste: AbilityDefinition = {
  id: 'haste',
  name: '가속',
  description: '수를 놓기 전에 사용한다. 이번 턴에 한 번 더 수를 놓을 수 있다. 첫 수로 상대 킹을 공격하면 두 번째 수는 사라진다.',
  timing: 'beforeMove',
  balance: BALANCE.haste,
  cost: () => COSTS.haste,

  candidates(state, color) {
    return legalMoves(state, color).length > 0 ? [{}] : [];
  },

  apply(state) {
    return { ...state, turnState: { ...state.turnState, movesAllowed: 2 } };
  },
};
