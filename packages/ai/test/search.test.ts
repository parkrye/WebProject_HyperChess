import { applyAction, createGame, fromAlgebraic as sq, legalAbilityOptions, legalMoves, type Action, type GameState } from '@hyperchess/engine';
import { describe, expect, it } from 'vitest';
import { chooseAction, MATE_SCORE } from '../src';

const moveOf = (action: Action) => (action.type === 'move' ? action.move : null);

function withResource(state: GameState, resource: number): GameState {
  const player = state.players[state.turn];
  return { ...state, players: { ...state.players, [state.turn]: { ...player, meter: { ...player.meter, resource } } } };
}

describe('AI 탐색', () => {
  it('1수 메이트를 찾는다', () => {
    const state = createGame({ fen: '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1' });
    const result = chooseAction(state, 'normal');
    expect(moveOf(result.action)).toMatchObject({ from: sq('a1'), to: sq('a8') });
    expect(result.score).toBeGreaterThan(MATE_SCORE - 10);
  });

  it('공짜 퀸을 잡는다', () => {
    const state = createGame({ fen: '4k3/8/3q4/8/4N3/8/8/4K3 w - - 0 1' });
    const result = chooseAction(state, 'normal');
    expect(moveOf(result.action)).toMatchObject({ from: sq('e4'), to: sq('d6') });
  });

  it('잡히는 곳에 퀸을 두지 않는다 (quiescence)', () => {
    const state = createGame({ fen: '4k3/8/8/4p3/8/8/8/3QK3 w - - 0 1' });
    const result = chooseAction(state, 'normal');
    const move = moveOf(result.action);
    const unsafe = [sq('d4'), sq('f4')];
    expect(move && move.from === sq('d1') && unsafe.includes(move.to)).toBe(false);
  });

  it('체크메이트 위기에서 계승자 능력으로 벗어난다', () => {
    const state = createGame({ fen: '4k3/8/8/8/8/8/P4PPP/1r4K1 w - - 0 1', abilities: { w: 'heir' } });
    expect(legalMoves(state)).toEqual([]);
    const result = chooseAction(state, 'normal');
    expect(result.action.type).toBe('ability');
  });

  it('모든 난이도가 합법 행동을 제한 시간 안에 반환한다', () => {
    let state = withResource(createGame({ abilities: { w: 'telekinesis', b: 'teleport' } }), 1);
    for (const difficulty of ['easy', 'normal', 'hard'] as const) {
      const started = performance.now();
      const { action } = chooseAction(state, difficulty, { timeLimitMs: 800 });
      expect(performance.now() - started).toBeLessThan(6000);
      state = applyAction(state, action);
    }
    expect(state.log.length).toBe(3);
  });

  it('유리한 강화 능력을 사용한다', () => {
    const state = withResource(
      createGame({ fen: '4k3/8/8/8/8/8/8/1N2K3 w - - 0 1', abilities: { w: 'lancer' } }),
      2,
    );
    expect(legalAbilityOptions(state).length).toBe(1);
    const result = chooseAction(state, 'normal');
    expect(result.action.type).toBe('ability');
  });
});
