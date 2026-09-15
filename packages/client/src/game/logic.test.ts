import { applyAction, createGame, fromAlgebraic as sq, legalAbilityOptions, type Color, type GameState } from '@hyperchess/engine';
import { describe, expect, it } from 'vitest';
import { abilityUi } from '../abilityUi/specs';
import { revertChanges } from './replay';
import { completedParams, currentStep, stepValues, uiOptions } from './targeting';

function withResource(state: GameState, color: Color, resource: number): GameState {
  const player = state.players[color];
  return { ...state, players: { ...state.players, [color]: { ...player, meter: { ...player.meter, resource } } } };
}

describe('targeting', () => {
  it('순간 이동은 어느 순서로 골라도 엔진 형식으로 정규화된다', () => {
    const state = withResource(createGame({ abilities: { w: 'teleport' }, fen: '4k3/8/8/8/8/8/8/R3K3 w - - 0 1' }), 'w', 1);
    const spec = abilityUi('teleport');
    const options = uiOptions(spec, legalAbilityOptions(state));

    expect(stepValues(options, {}, 'a').map(Number).sort()).toEqual([sq('a1'), sq('e1')].sort());
    const picks = { a: sq('e1'), b: sq('a1') };
    expect(currentStep(spec, picks)).toBeNull();
    expect(completedParams(spec, options, picks)).toEqual({ a: sq('a1'), b: sq('e1') });
  });

  it('연금술은 프로모션 칸에서 폰을 고를 때만 프로모션 단계를 거친다', () => {
    const state = withResource(createGame({ abilities: { w: 'alchemy' }, fen: 'R7/8/7k/8/8/8/8/4K2R w - - 0 1' }), 'w', 1);
    const spec = abilityUi('alchemy');
    const options = legalAbilityOptions(state);

    expect(completedParams(spec, options, { square: sq('h1'), type: 'n' })).toEqual({ square: sq('h1'), type: 'n' });
    const promoting = { square: sq('a8'), type: 'p' };
    expect(currentStep(spec, promoting, options)?.key).toBe('promotion');
    expect(completedParams(spec, options, { ...promoting, promotion: 'q' })).toEqual({ ...promoting, promotion: 'q' });
    expect(completedParams(spec, options, { square: sq('a8'), type: 'n' })).toEqual({ square: sq('a8'), type: 'n' });
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
    state = applyAction(withResource(state, 'w', 1), { type: 'ability', params: { a: sq('d1'), b: sq('e1') } });

    let board = state.board;
    for (const event of [...state.log].reverse()) board = revertChanges(board, event.changes);
    // 연출용이므로 칸별 말 배치(id)만 비교한다
    const layout = (b: typeof board) => b.map((piece) => piece?.id ?? null);
    expect(layout(board)).toEqual(layout(initial));
  });
});
