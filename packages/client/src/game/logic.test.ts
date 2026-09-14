import { applyAction, createGame, fromAlgebraic as sq, legalAbilityOptions } from '@hyperchess/engine';
import { describe, expect, it } from 'vitest';
import { abilityUi } from '../abilityUi/specs';
import { revertChanges } from './replay';
import { completedParams, currentStep, stepValues, uiOptions } from './targeting';

describe('targeting', () => {
  it('순간 이동은 어느 순서로 골라도 엔진 형식으로 정규화된다', () => {
    const state = createGame({ abilities: { w: 'teleport' }, fen: '4k3/8/8/8/8/8/8/R3K3 w - - 0 1' });
    const spec = abilityUi('teleport');
    const options = uiOptions(spec, legalAbilityOptions(state));

    expect(stepValues(options, {}, 'a').map(Number).sort()).toEqual([sq('a1'), sq('e1')].sort());
    const picks = { a: sq('e1'), b: sq('a1') };
    expect(currentStep(spec, picks)).toBeNull();
    expect(completedParams(spec, options, picks)).toEqual({ a: sq('a1'), b: sq('e1') });
  });

  it('선택이 덜 끝나면 파라미터를 만들지 않는다', () => {
    const spec = abilityUi('telekinesis');
    expect(completedParams(spec, [{ from: 1, to: 2 }], { from: 1 })).toBeNull();
    expect(currentStep(spec, { from: 1 })?.key).toBe('to');
  });
});

describe('revertChanges', () => {
  it('교환과 잡기를 되돌리면 이전 보드가 된다', () => {
    let state = createGame({ abilities: { w: 'teleport' } });
    const initial = state.board;
    state = applyAction(state, { type: 'move', move: { from: sq('e2'), to: sq('e4') } });
    state = applyAction(state, { type: 'move', move: { from: sq('d7'), to: sq('d5') } });
    state = applyAction(state, { type: 'move', move: { from: sq('e4'), to: sq('d5') } });
    state = applyAction(state, { type: 'move', move: { from: sq('d8'), to: sq('d5') } });
    state = applyAction(state, { type: 'ability', params: { a: sq('d1'), b: sq('e1') } });

    let board = state.board;
    for (const event of [...state.log].reverse()) board = revertChanges(board, event.changes);
    // 연출용이므로 칸별 말 배치(id)만 비교한다
    const layout = (b: typeof board) => b.map((piece) => piece?.id ?? null);
    expect(layout(board)).toEqual(layout(initial));
  });
});
