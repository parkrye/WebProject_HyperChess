import { describe, expect, it } from 'vitest';
import { BALANCE, COSTS, createGame, isInCheck, legalAbilityOptions, legalMoves, royalSquares, usesCheckRule } from '../src';
import { game, move, setResource, sq, useAbility } from './helpers';

/** 모든 능력의 시작 자원이 0이므로, 효과 자체를 검증할 때는 자원을 채워 시작한다 */
const CHARGED = 9;
const charged = (fen: string, abilities: Parameters<typeof game>[1]) =>
  setResource(setResource(game(fen, abilities), 'w', CHARGED), 'b', CHARGED);

const targets = (state: Parameters<typeof legalMoves>[0], from: string) =>
  legalMoves(state).filter((m) => m.from === sq(from)).map((m) => m.to).sort((a, b) => a - b);

describe('염동력', () => {
  it('자신의 말을 1칸 옮기고 턴이 넘어간다', () => {
    let state = charged('4k3/8/8/8/8/8/8/R3K3 w - - 0 1', { w: 'telekinesis' });
    state = useAbility(state, { from: sq('a1'), to: sq('b2') });
    expect(state.board[sq('b2')]?.type).toBe('r');
    expect(state.turn).toBe('b');
    expect(state.players.w.meter.resource).toBe(CHARGED - COSTS.telekinesis);
  });

  it('상대 말들에 둘러싸인 말은 옮길 수 없다', () => {
    const state = setResource(game('4k3/8/3p4/2pnp3/3p4/8/8/4K3 w - - 0 1', { w: 'telekinesis' }), 'w', 1);
    const options = legalAbilityOptions(state);
    expect(options.some((o) => o.from === sq('d5'))).toBe(false);
    expect(options.some((o) => o.from === sq('d6'))).toBe(true);
  });

  it('자신의 체크를 유발할 수 없다', () => {
    const state = charged('4r1k1/8/8/8/8/8/4B3/4K3 w - - 0 1', { w: 'telekinesis' });
    const options = legalAbilityOptions(state).filter((o) => o.from === sq('e2'));
    expect(options.map((o) => o.to)).toEqual([sq('e3')]);
  });

});

describe('쿨다운', () => {
  it('사용 후 쿨다운 턴 수만큼 자신의 턴에 사용할 수 없다', () => {
    const cooldown = BALANCE.haste.cooldownTurns;
    expect(cooldown).toBeGreaterThan(0);
    let state = setResource(game('7k/8/8/8/8/8/8/R3K3 w - - 0 1', { w: 'haste' }), 'w', 99);
    state = useAbility(state);
    state = move(state, 'a1', 'a2');
    state = move(state, 'a2', 'a1');

    const shuffle = [['h8', 'g8'], ['g8', 'h8']];
    for (let turn = 0; turn < cooldown; turn++) {
      const [from, to] = shuffle[turn % 2];
      state = move(state, from, to);
      state = setResource(state, 'w', 99);
      expect(legalAbilityOptions(state)).toEqual([]);
      state = move(state, turn % 2 === 0 ? 'e1' : 'd1', turn % 2 === 0 ? 'd1' : 'e1');
    }
    state = move(state, cooldown % 2 === 0 ? 'h8' : 'g8', cooldown % 2 === 0 ? 'g8' : 'h8');
    expect(legalAbilityOptions(state).length).toBeGreaterThan(0);
  });
});

describe('가속', () => {
  it('한 턴에 두 수를 둔다', () => {
    let state = setResource(game('4k3/8/8/8/8/8/8/R3K3 w - - 0 1', { w: 'haste' }), 'w', 3);
    state = useAbility(state);
    state = move(state, 'a1', 'a2');
    expect(state.turn).toBe('w');
    state = move(state, 'a2', 'a3');
    expect(state.turn).toBe('b');
  });

  it('첫 수로 킹을 공격하면 두 번째 수는 사라진다', () => {
    let state = setResource(game('4k3/8/8/8/8/8/8/R3K3 w - - 0 1', { w: 'haste' }), 'w', 3);
    state = useAbility(state);
    state = move(state, 'a1', 'a8');
    expect(state.turn).toBe('b');
    expect(isInCheck(state, 'b')).toBe(true);
  });

  it('설정된 자신의 턴 주기마다 자원 회복', () => {
    const rule = BALANCE.haste.recovery[0];
    let state = createGame({ abilities: { w: 'haste' } });
    const files = 'abcdefgh';
    for (let round = 1; round < rule.every; round++) {
      expect(state.players.w.meter.resource).toBe(BALANCE.haste.startResource);
      state = move(state, files[round] + '2', files[round] + '3');
      state = move(state, files[round] + '7', files[round] + '6');
    }
    expect(state.players.w.meter.resource).toBe(BALANCE.haste.startResource + rule.amount);
  });
});

describe('순간 이동', () => {
  it('자신의 말 두 개의 위치를 바꾼다', () => {
    let state = setResource(game('4k3/8/8/8/8/8/8/R3K3 w - - 0 1', { w: 'teleport' }), 'w', 1);
    state = useAbility(state, { a: sq('a1'), b: sq('e1') });
    expect(state.board[sq('a1')]?.type).toBe('k');
    expect(state.board[sq('e1')]?.type).toBe('r');
  });

  it('자신의 체크를 유발하는 교환은 불가', () => {
    const state = setResource(game('r3k3/8/8/8/8/8/8/N3K3 w - - 0 1', { w: 'teleport' }), 'w', 1);
    expect(legalAbilityOptions(state)).toEqual([]);
  });
});

describe('부활', () => {
  it('말을 잃으면 자원을 얻고, 인접 빈칸에 부활시킨다', () => {
    let state = game('4k3/8/8/3p4/4P3/8/8/4K3 b - - 0 1', { w: 'revive' });
    state = move(state, 'd5', 'e4');
    expect(state.players.w.meter.resource).toBe(BALANCE.revive.recovery[0].amount);
    const pawn = state.captured.w[0];
    state = setResource(state, 'w', COSTS.revive.p);
    state = useAbility(state, { pieceId: pawn.id, to: sq('d2') });
    expect(state.board[sq('d2')]?.id).toBe(pawn.id);
    expect(state.captured.w).toEqual([]);
    expect(state.players.w.meter.resource).toBe(0);
  });

  it('자원이 부족한 말은 부활할 수 없다', () => {
    let state = game('4k3/8/8/8/3rQ3/8/8/4K3 b - - 0 1', { w: 'revive' });
    state = move(state, 'd4', 'e4');
    expect(state.players.w.meter.resource).toBe(1);
    expect(legalAbilityOptions(state)).toEqual([]);
  });
});

describe('시간 역행', () => {
  it('선택한 수만큼 자신의 과거 턴으로 돌아가고 자원은 유지된다', () => {
    let state = createGame({ abilities: { w: 'rewind' } });
    const initialBoard = state.board;
    state = move(state, 'e2', 'e4');
    state = move(state, 'e7', 'e5');
    state = move(state, 'g1', 'f3');
    state = move(state, 'b8', 'c6');
    state = setResource(state, 'w', 3);

    expect(legalAbilityOptions(state).map((o) => o.steps)).toEqual([1, 2]);
    state = useAbility(state, { steps: 2 });

    expect(state.board).toEqual(initialBoard);
    expect(state.turn).toBe('w');
    expect(state.players.w.meter.resource).toBe(1);
    expect(state.turnState.abilityUsed).toBe(true);
    const last = state.log[state.log.length - 1];
    expect(last.kind === 'ability' && last.undone?.length).toBe(4);

    state = move(state, 'd2', 'd4');
    expect(state.turn).toBe('b');
  });

  it('돌아갈 과거 턴이 없으면 사용할 수 없다', () => {
    const state = createGame({ abilities: { w: 'rewind' } });
    expect(legalAbilityOptions(state)).toEqual([]);
  });

  it('남은 수가 있으면 체크메이트가 아니다', () => {
    let state = createGame({ abilities: { w: 'rewind' } });
    state = move(state, 'f2', 'f3');
    state = move(state, 'e7', 'e5');
    state = move(state, 'g2', 'g4');
    state = setResource(state, 'w', 1);
    state = move(state, 'd8', 'h4');
    expect(state.result.kind).toBe('ongoing');
  });
});

describe('강화', () => {
  it('중보병: 강화 폰은 킹처럼 움직인다', () => {
    let state = charged('4k3/8/8/8/3P4/8/8/4K3 w - - 0 1', { w: 'heavyInfantry' });
    state = useAbility(state, { square: sq('d4') });
    state = move(state, 'e8', 'f8');
    expect(targets(state, 'd4')).toEqual(['c3', 'd3', 'e3', 'c4', 'e4', 'c5', 'd5', 'e5'].map(sq).sort((a, b) => a - b));
  });

  it('창기병: 나이트와 룩의 움직임을 모두 가진다', () => {
    let state = game('4k3/8/8/8/8/8/8/1N2K3 w - - 0 1', { w: 'lancer' });
    state = setResource(state, 'w', 2);
    state = useAbility(state, { square: sq('b1') });
    state = move(state, 'e8', 'f8');
    const moves = targets(state, 'b1');
    expect(moves).toContain(sq('b8'));
    expect(moves).toContain(sq('c3'));
    expect(moves).not.toContain(sq('e1'));
  });

  it('전차: 자신의 말을 뛰어넘고, 그 너머로 체크를 건다', () => {
    let state = charged('4k3/8/8/8/8/8/8/R2QK3 w - - 0 1', { w: 'chariot' });
    state = useAbility(state, { square: sq('a1') });
    state = move(state, 'e8', 'f8');
    expect(targets(state, 'a1')).toContain(sq('f1'));
    expect(targets(state, 'a1')).not.toContain(sq('d1'));
  });

  it('팔라딘: 강화 비숍의 공격은 자신의 말을 통과한다', () => {
    let state = charged('7k/8/8/8/8/2P5/8/B3K3 w - - 0 1', { w: 'paladin' });
    state = useAbility(state, { square: sq('a1') });
    expect(isInCheck(state, 'b')).toBe(true);
    expect(targets(state, 'h8')).not.toContain(sq('g7'));
  });

  it('팔라딘: 상하좌우 빈칸으로 옆걸음한 뒤 대각선으로 이어서 움직이고 공격한다', () => {
    let state = charged('8/7k/8/8/8/8/8/2B1K3 w - - 0 1', { w: 'paladin' });
    expect(isInCheck(state, 'b')).toBe(false);
    state = useAbility(state, { square: sq('c1') });
    // c1 → 옆걸음 c2 → 대각선 d3·e4·f5·g6·h7(흑 킹)
    expect(isInCheck(state, 'b')).toBe(true);

    state = move(state, 'h7', 'h8');
    const moves = targets(state, 'c1');
    expect(moves).toContain(sq('c2')); // 옆걸음만 하고 멈춤
    expect(moves).toContain(sq('b3')); // c2 경유 대각선
    expect(moves).toContain(sq('h6')); // 기존 대각선
    expect(moves).not.toContain(sq('c3')); // 옆걸음 두 번은 불가
  });
});

describe('여제', () => {
  it('체크 중에도 사용 가능하고, 이후 체크 없이 킹과 퀸이 모두 잡혀야 패배한다', () => {
    let state = setResource(game('4k3/8/8/8/8/8/8/3QK2r w - - 0 1', { w: 'empress' }), 'w', 1);
    expect(isInCheck(state, 'w')).toBe(true);
    state = useAbility(state);
    expect(usesCheckRule(state, 'w')).toBe(false);
    expect(isInCheck(state, 'w')).toBe(false);

    state = move(state, 'h1', 'e1');
    expect(state.result.kind).toBe('ongoing');
    expect(royalSquares(state, 'w')).toEqual([sq('d1')]);
  });

  it('킹이 공격받는 칸으로 이동할 수 있고, 퀸 프로모션은 금지된다', () => {
    let state = setResource(game('4k3/P7/8/8/8/8/8/4K2r w - - 0 1', { w: 'empress' }), 'w', 1);
    state = useAbility(state);
    state = move(state, 'e8', 'd8');
    expect(targets(state, 'e1')).toContain(sq('f1'));
    const promotions = legalMoves(state).filter((m) => m.from === sq('a7')).map((m) => m.promotion);
    expect(promotions).not.toContain('q');
    expect(promotions).toEqual(expect.arrayContaining(['k', 'r', 'b', 'n']));

    // 승급 킹은 킹처럼 움직이지만 왕족이 아니다
    state = move(state, 'a7', 'a8', 'k');
    expect(state.board[sq('a8')]).toMatchObject({ type: 'k', royal: false });
    expect(royalSquares(state, 'w')).toEqual([sq('e1')]);
  });

  it('여제는 한 번만 사용할 수 있다', () => {
    let state = setResource(game('4k3/8/8/8/8/8/8/3QK3 w - - 0 1', { w: 'empress' }), 'w', 1);
    state = useAbility(state);
    state = move(state, 'e8', 'f8');
    state = setResource(state, 'w', 1);
    expect(legalAbilityOptions(state)).toEqual([]);
  });
});

describe('계승자', () => {
  it('체크가 아니면 사용할 수 없다', () => {
    const state = game('4k3/8/8/8/8/8/P7/4K3 w - - 0 1', { w: 'heir' });
    expect(legalAbilityOptions(state)).toEqual([]);
  });

  it('선왕과 계승자가 모두 잡혀야 패배하고, 하나만 남으면 체크 규칙이 돌아온다', () => {
    let state = charged('4k3/8/8/8/8/8/P7/4K2r w - - 0 1', { w: 'heir' });
    expect(legalAbilityOptions(state)).toEqual([{ square: sq('a2') }]);

    state = useAbility(state, { square: sq('a2') });
    expect(state.board[sq('e1')]?.title).toBe('oldKing');
    expect(state.board[sq('a2')]?.title).toBe('heir');
    expect(isInCheck(state, 'w')).toBe(false);

    state = move(state, 'h1', 'e1');
    expect(state.result.kind).toBe('ongoing');
    expect(usesCheckRule(state, 'w')).toBe(true);
    // 1랭크는 룩이 공격 중이므로 계승자는 들어갈 수 없다
    expect(targets(state, 'a2')).toEqual(['b2', 'a3', 'b3', 'a4'].map(sq));
  });
  it('왕이 하나만 남아 다시 체크되면 자원을 회복한 뒤 재사용할 수 있다', () => {
    let state = charged('4k3/8/8/8/8/8/P6P/4K2r w - - 0 1', { w: 'heir' });
    state = useAbility(state, { square: sq('a2') });
    state = move(state, 'h1', 'e1'); // 선왕 포획 → 계승자(a2)만 남음
    state = move(state, 'h2', 'h3');
    state = move(state, 'e1', 'a1'); // 계승자 체크
    expect(isInCheck(state, 'w')).toBe(true);

    expect(legalAbilityOptions(setResource(state, 'w', 0))).toEqual([]);
    state = setResource(state, 'w', 1);
    expect(legalAbilityOptions(state)).toEqual([{ square: sq('h3') }]);
    state = useAbility(state, { square: sq('h3') });
    expect(state.board[sq('a2')]?.title).toBe('oldKing');
    expect(state.board[sq('h3')]?.title).toBe('heir');
    expect(isInCheck(state, 'w')).toBe(false);
  });
});
