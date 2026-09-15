import { isWall } from '../movegen';
import type { AbilityParams } from '../types';
import { BALANCE, COSTS, WALL_DURATION, WALL_LIMIT } from './balance';
import type { AbilityDefinition } from './types';

export const wall: AbilityDefinition = {
  id: 'wall',
  name: '성벽',
  description: `수를 놓기 전에, 빈칸 하나에 성벽을 세운다. 성벽은 누구도 들어가거나 지나가거나 공격할 수 없고, 자신의 턴 ${WALL_DURATION}번이 지나면 사라진다. 동시에 ${WALL_LIMIT}개까지 세울 수 있다.`,
  timing: 'beforeMove',
  balance: BALANCE.wall,
  cost: () => COSTS.wall,

  candidates(state, color) {
    if (state.walls.filter((w) => w.owner === color).length >= WALL_LIMIT) return [];
    const result: AbilityParams[] = [];
    state.board.forEach((piece, square) => {
      if (!piece && !isWall(state.walls, square) && state.enPassant?.target !== square) result.push({ square });
    });
    return result;
  },

  apply(state, color, params) {
    const square = Number(params.square);
    // 설치자의 다음 턴 시작부터 줄어들므로, 상대의 턴 WALL_DURATION번 동안 남는다
    return { ...state, walls: [...state.walls, { square, owner: color, turnsLeft: WALL_DURATION }] };
  },
};
