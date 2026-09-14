import type { AbilityParams, Color, GameState } from '../types';
import { BALANCE, COSTS, REWIND_MAX_STEPS } from './balance';
import type { AbilityDefinition } from './types';

/** 현재 턴 시작 스냅샷을 제외한, 자신의 턴 시작 스냅샷 인덱스들 (오래된 순) */
function ownPastSnapshotIndices(state: GameState, color: Color): number[] {
  const indices: number[] = [];
  state.history.forEach((snapshot, index) => {
    if (snapshot.turn === color) indices.push(index);
  });
  return indices.slice(0, -1);
}

export const rewind: AbilityDefinition = {
  id: 'rewind',
  name: '시간 역행',
  description: '수를 놓기 전에 사용한다. 1~3수 전 자신의 턴으로 되돌아간다. 능력 자원은 되돌아가지 않는다.',
  timing: 'beforeMove',
  balance: BALANCE.rewind,

  cost: (_state, _color, params) => Number(params.steps) * COSTS.rewindPerStep,

  candidates(state, color) {
    const available = Math.min(REWIND_MAX_STEPS, ownPastSnapshotIndices(state, color).length);
    const result: AbilityParams[] = [];
    for (let steps = 1; steps <= available; steps++) result.push({ steps });
    return result;
  },

  apply(state, color, params) {
    const indices = ownPastSnapshotIndices(state, color);
    const index = indices[indices.length - Number(params.steps)];
    const snapshot = index === undefined ? undefined : state.history[index];
    if (index === undefined || !snapshot) throw new Error('No snapshot to rewind to');

    return {
      ...snapshot,
      history: state.history.slice(0, index + 1),
      result: { kind: 'ongoing' },
    };
  },
};
