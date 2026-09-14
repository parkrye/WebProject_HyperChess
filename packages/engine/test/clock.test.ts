import { describe, expect, it } from 'vitest';
import { applyAction, checkTimeout, clockView, createGame, fromAlgebraic as sq, type GameState } from '../src';

const CONTROL = { turnLimitMs: 120_000, totalLimitMs: 600_000 };
const move = (state: GameState, from: string, to: string, now: number) =>
  applyAction(state, { type: 'move', move: { from: sq(from), to: sq(to) } }, now);

describe('플레이 타이머', () => {
  it('시간 제한이 없으면 시계가 없다', () => {
    const state = createGame();
    expect(state.clock).toBeNull();
    expect(clockView(state, Date.now())).toBeNull();
  });

  it('차례가 넘어가면 사용한 시간이 차감되고 상대 차례가 시작된다', () => {
    let state = createGame({ timeControl: CONTROL, now: 0 });
    state = move(state, 'e2', 'e4', 30_000);
    expect(state.clock?.remainingMs).toEqual({ w: 570_000, b: 600_000 });
    expect(state.clock?.turnStartedAt).toBe(30_000);

    const view = clockView(state, 40_000);
    expect(view).toEqual({ turn: 'b', turnRemainingMs: 110_000, totalRemainingMs: { w: 570_000, b: 590_000 } });
  });

  it('한 차례에 2분을 넘기면 즉시 패배한다', () => {
    const state = createGame({ timeControl: CONTROL, now: 0 });
    expect(checkTimeout(state, 119_999).result.kind).toBe('ongoing');
    const timedOut = checkTimeout(state, 120_000);
    expect(timedOut.result).toEqual({ kind: 'win', winner: 'b', reason: 'timeout' });

    // 시간을 넘긴 뒤 둔 수는 적용되지 않고 시간 초과로 끝난다
    const late = move(state, 'e2', 'e4', 130_000);
    expect(late.result).toEqual({ kind: 'win', winner: 'b', reason: 'timeout' });
    expect(late.board[sq('e2')]?.type).toBe('p');
  });

  it('게임 전체 시간을 다 쓰면 차례 시간이 남아도 패배한다', () => {
    let state = createGame({ timeControl: { turnLimitMs: 120_000, totalLimitMs: 150_000 }, now: 0 });
    state = move(state, 'e2', 'e4', 100_000); // 백 남은 전체 50초
    state = move(state, 'e7', 'e5', 110_000);
    expect(clockView(state, 150_000)?.turnRemainingMs).toBe(10_000); // 차례 2분이 아니라 전체 남은 시간이 한도
    expect(checkTimeout(state, 159_999).result.kind).toBe('ongoing');
    expect(checkTimeout(state, 160_000).result).toEqual({ kind: 'win', winner: 'b', reason: 'timeout' });
  });

  it('가속으로 같은 차례가 이어지면 차례 시계도 이어진다', () => {
    let state = createGame({ fen: '4k3/8/8/8/8/8/8/R3K3 w - - 0 1', abilities: { w: 'haste' }, resources: { w: 3 }, timeControl: CONTROL, now: 0 });
    state = applyAction(state, { type: 'ability', params: {} }, 10_000);
    state = move(state, 'a1', 'a2', 20_000);
    expect(state.turn).toBe('w');
    expect(state.clock?.turnStartedAt).toBe(0);
    state = move(state, 'a2', 'a3', 30_000);
    expect(state.turn).toBe('b');
    expect(state.clock?.remainingMs.w).toBe(570_000);
  });
});
