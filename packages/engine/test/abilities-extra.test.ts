import { describe, expect, it } from 'vitest';
import { BALANCE, COSTS, WALL_DURATION, WALL_LIMIT, isInCheck, legalAbilityOptions, legalMoves, royalSquares, type GameState } from '../src';
import { game, move, setResource, sq, useAbility } from './helpers';

/** 효과 자체를 검증할 때는 자원을 채워 시작한다 */
const CHARGED = 9;
const charged = (fen: string, abilities: Parameters<typeof game>[1]) =>
  setResource(setResource(game(fen, abilities), 'w', CHARGED), 'b', CHARGED);

const targets = (state: GameState, from: string) =>
  legalMoves(state).filter((m) => m.from === sq(from)).map((m) => m.to).sort((a, b) => a - b);

describe('연금술', () => {
  it('가치가 같거나 낮은 말로만 바꿀 수 있고, 자신의 1랭크에서는 폰이 될 수 없다', () => {
    const state = charged('4k3/8/8/8/8/8/8/R3K3 w - - 0 1', { w: 'alchemy' });
    const types = legalAbilityOptions(state).filter((o) => o.square === sq('a1')).map((o) => o.type).sort();
    expect(types).toEqual(['b', 'n']);
    expect(legalAbilityOptions(state).some((o) => o.square === sq('e1'))).toBe(false);
  });

  it('말을 바꾸고 턴이 넘어간다', () => {
    let state = charged('4k3/8/8/8/8/8/8/R3K3 w - - 0 1', { w: 'alchemy' });
    state = useAbility(state, { square: sq('a1'), type: 'n' });
    expect(state.board[sq('a1')]?.type).toBe('n');
    expect(state.turn).toBe('b');
    expect(state.players.w.meter.resource).toBe(CHARGED - COSTS.alchemy);
  });

  it('프로모션 칸에서 폰으로 바꾸면 바로 프로모션한다', () => {
    let state = charged('R7/8/7k/8/8/8/8/4K3 w - - 0 1', { w: 'alchemy' });
    const promotions = legalAbilityOptions(state).filter((o) => o.square === sq('a8') && o.type === 'p').map((o) => o.promotion).sort();
    expect(promotions).toEqual(['b', 'n', 'q']);
    state = useAbility(state, { square: sq('a8'), type: 'p', promotion: 'q' });
    expect(state.board[sq('a8')]?.type).toBe('q');
  });
});

describe('세뇌', () => {
  it('좌우를 가둔 상대 말을 가져온다. 비용은 말 종류에 따라 다르다', () => {
    let state = charged('4k3/8/8/8/2NqN3/8/8/4K3 w - - 0 1', { w: 'brainwash' });
    expect(legalAbilityOptions(state)).toEqual([{ square: sq('d4') }]);
    state = useAbility(state, { square: sq('d4') });
    expect(state.board[sq('d4')]?.color).toBe('w');
    expect(state.players.w.meter.resource).toBe(CHARGED - COSTS.brainwash.q);
  });

  it('보드 끝은 가두는 벽이 아니며 킹은 가져올 수 없다', () => {
    expect(legalAbilityOptions(charged('4k3/8/8/8/rN6/8/8/4K3 w - - 0 1', { w: 'brainwash' }))).toEqual([]);
    expect(legalAbilityOptions(charged('8/8/8/8/2NkN3/8/8/4K3 w - - 0 1', { w: 'brainwash' }))).toEqual([]);
  });

  it('자원이 비용보다 적으면 쓸 수 없다', () => {
    const state = setResource(game('4k3/8/8/8/2NqN3/8/8/4K3 w - - 0 1', { w: 'brainwash' }), 'w', COSTS.brainwash.q - 1);
    expect(legalAbilityOptions(state)).toEqual([]);
  });

  it('가져온 폰은 새 주인의 방향으로 전진한다', () => {
    let state = charged('8/2NpN3/8/8/8/8/8/4K2k w - - 0 1', { w: 'brainwash' });
    state = useAbility(state, { square: sq('d7') });
    state = move(state, 'h1', 'h2');
    state = move(state, 'd7', 'd8', 'q');
    expect(state.board[sq('d8')]).toMatchObject({ type: 'q', color: 'w' });
  });
});

describe('성벽', () => {
  it('벽은 슬라이딩 이동을 막고 그 칸에 들어갈 수 없다', () => {
    let state = charged('7k/8/8/8/8/8/8/R3K3 w - - 0 1', { w: 'wall' });
    state = useAbility(state, { square: sq('a4') });
    state = move(state, 'h8', 'g8');
    expect(targets(state, 'a1')).toEqual([sq('b1'), sq('c1'), sq('d1'), sq('a2'), sq('a3')].sort((a, b) => a - b));
  });

  it('벽으로 체크를 막을 수 있다', () => {
    let state = charged('4r2k/8/8/8/8/8/8/4K3 w - - 0 1', { w: 'wall' });
    const squares = legalAbilityOptions(state).map((o) => Number(o.square)).sort((a, b) => a - b);
    expect(squares).toEqual(['e2', 'e3', 'e4', 'e5', 'e6', 'e7'].map(sq));
    state = useAbility(state, { square: sq('e4') });
    expect(isInCheck(state, 'w')).toBe(false);
  });

  it(`설치자의 턴 ${WALL_DURATION}번이 시작되면 사라진다`, () => {
    let state = charged('7k/8/8/8/8/8/P7/4K3 w - - 0 1', { w: 'wall' });
    state = useAbility(state, { square: sq('a4') });
    for (let turn = 1; turn <= WALL_DURATION; turn++) {
      state = move(state, turn % 2 ? 'h8' : 'g8', turn % 2 ? 'g8' : 'h8');
      expect(state.walls.length).toBe(turn < WALL_DURATION ? 1 : 0);
      state = move(state, turn % 2 ? 'e1' : 'd1', turn % 2 ? 'd1' : 'e1');
    }
  });

  it(`동시에 ${WALL_LIMIT}개까지 세울 수 있고, 염동력은 벽 칸으로 옮길 수 없다`, () => {
    const base = charged('7k/8/8/8/8/8/8/R3K3 w - - 0 1', { w: 'wall', b: 'telekinesis' });
    const walls = Array.from({ length: WALL_LIMIT }, (_, i) => ({ square: sq('c3') + i, owner: 'w' as const, turnsLeft: WALL_DURATION }));
    expect(legalAbilityOptions({ ...base, walls })).toEqual([]);

    let state = useAbility(base, { square: sq('g7') });
    expect(legalAbilityOptions(state).some((o) => o.to === sq('g7'))).toBe(false);
  });
});

describe('총진군', () => {
  it('앞칸이 빈 폰만 한 칸씩 전진한다', () => {
    let state = charged('4k3/8/8/8/8/1P6/PP6/4K3 w - - 0 1', { w: 'march' });
    state = useAbility(state);
    expect(state.board[sq('a3')]?.type).toBe('p');
    expect(state.board[sq('b4')]?.type).toBe('p');
    expect(state.board[sq('b2')]?.type).toBe('p');
    expect(state.board[sq('b3')]).toBeNull();
    expect(state.turn).toBe('b');
  });

  it('마지막 랭크에 도달하면 퀸으로 프로모션한다', () => {
    let state = charged('7k/P7/8/8/8/8/8/4K3 w - - 0 1', { w: 'march' });
    state = useAbility(state);
    expect(state.board[sq('a8')]).toMatchObject({ type: 'q', color: 'w' });
  });

  it('전진할 폰이 없으면 쓸 수 없다', () => {
    expect(legalAbilityOptions(charged('4k3/8/8/8/8/p7/P7/4K3 w - - 0 1', { w: 'march' }))).toEqual([]);
  });
});

describe('저격', () => {
  it('공격하는 상대 말을 제자리에서 잡는다', () => {
    let state = setResource(game('4k3/8/8/8/r7/8/8/R3K3 w - - 0 1', { w: 'snipe', b: 'revive' }), 'w', CHARGED);
    expect(legalAbilityOptions(state)).toContainEqual({ from: sq('a1'), to: sq('a4') });
    state = useAbility(state, { from: sq('a1'), to: sq('a4') });
    expect(state.board[sq('a1')]?.type).toBe('r');
    expect(state.board[sq('a4')]).toBeNull();
    expect(state.captured.b.map((p) => p.type)).toEqual(['r']);
    // 수로 잡은 것과 같이 잃은 쪽의 자원이 회복된다
    expect(state.players.b.meter.resource).toBe(BALANCE.revive.recovery[0].amount);
  });

  it('성벽 너머는 저격할 수 없다', () => {
    const state = charged('4k3/8/8/8/r7/8/8/R3K3 w - - 0 1', { w: 'snipe' });
    const walled = { ...state, walls: [{ square: sq('a2'), owner: 'b' as const, turnsLeft: 3 }] };
    expect(legalAbilityOptions(walled).some((o) => o.to === sq('a4'))).toBe(false);
  });

  it('체크가 없는 상태에서는 왕족도 저격할 수 있다', () => {
    const base = charged('4k3/8/8/8/8/8/p3R3/4K3 w - - 0 1', { w: 'snipe' });
    const board = base.board.slice();
    board[sq('a2')] = { ...board[sq('a2')]!, royal: true, title: 'heir' };
    let state: GameState = { ...base, board };
    state = useAbility(state, { from: sq('e2'), to: sq('e8') });
    expect(state.result.kind).toBe('ongoing');
    expect(royalSquares(state, 'b')).toEqual([sq('a2')]);
  });
});
