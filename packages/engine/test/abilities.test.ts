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
    expect(state.players.w.meter.resource).toBe(BALANCE.revive.recovery[0].pawnAmount);
    const pawn = state.captured.w[0];
    state = setResource(state, 'w', COSTS.revive.p);
    state = useAbility(state, { pieceId: pawn.id, to: sq('d2') });
    expect(state.board[sq('d2')]?.id).toBe(pawn.id);
    expect(state.captured.w).toEqual([]);
    expect(state.players.w.meter.resource).toBe(0);
  });

  it('폰을 잃으면 0.5, 다른 기물을 잃으면 1 회복한다', () => {
    let state = game('4k3/8/8/2p5/1P6/8/2r5/2N1K3 b - - 0 1', { w: 'revive' });
    state = move(state, 'c5', 'b4'); // 백 폰 잃음 → +0.5
    expect(state.players.w.meter.resource).toBe(0.5);
    state = move(state, 'e1', 'f1');
    state = move(state, 'c2', 'c1'); // 백 나이트 잃음 → +1
    expect(state.players.w.meter.resource).toBe(1.5);
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

  it('중보병: 강화 폰은 시작 위치에서도 2칸 전진할 수 없다', () => {
    let state = charged('4k3/8/8/8/8/8/3P4/4K3 w - - 0 1', { w: 'heavyInfantry' });
    state = useAbility(state, { square: sq('d2') });
    state = move(state, 'e8', 'f8');
    const moves = targets(state, 'd2');
    expect(moves).toContain(sq('d3'));
    expect(moves).not.toContain(sq('d4'));
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

  it('전차: 대각선으로 한 칸 이동·잡기할 수 있고, 이어서 직선으로 움직이지는 못한다', () => {
    let state = charged('7k/8/8/8/8/8/1p6/R3K3 w - - 0 1', { w: 'chariot' });
    state = useAbility(state, { square: sq('a1') });
    state = move(state, 'h8', 'g8');
    const moves = targets(state, 'a1');
    expect(moves).toContain(sq('b2')); // 대각 한 칸의 상대 말 잡기
    expect(moves).not.toContain(sq('c3')); // 대각 두 칸 불가
    expect(moves).toContain(sq('a8')); // 기존 직선
  });

  it('전차: 대각 인접 칸의 킹에 체크를 건다', () => {
    let state = charged('8/8/8/8/8/8/1k6/R3K3 w - - 0 1', { w: 'chariot' });
    expect(isInCheck(state, 'b')).toBe(false); // 일반 룩은 대각을 공격하지 않음
    state = useAbility(state, { square: sq('a1') });
    expect(isInCheck(state, 'b')).toBe(true);
  });

  it('팔라딘: 강화 비숍의 공격은 자신의 말을 통과한다', () => {
    let state = charged('7k/8/8/8/8/2P5/8/B3K3 w - - 0 1', { w: 'paladin' });
    state = useAbility(state, { square: sq('a1') });
    expect(isInCheck(state, 'b')).toBe(true);
    expect(targets(state, 'h8')).not.toContain(sq('g7'));
  });

  it('팔라딘: 상하좌우로 한 칸 이동·잡기할 수 있고, 이어서 대각선으로 움직이지는 못한다', () => {
    let state = charged('7k/8/8/8/8/8/8/1pB1K3 w - - 0 1', { w: 'paladin' });
    state = useAbility(state, { square: sq('c1') });
    state = move(state, 'h8', 'g8');
    const moves = targets(state, 'c1');
    expect(moves).toContain(sq('d1')); // 오른쪽 한 칸
    expect(moves).toContain(sq('c2')); // 앞 한 칸
    expect(moves).toContain(sq('b1')); // 옆칸의 상대 말 잡기
    expect(moves).not.toContain(sq('c3')); // 두 칸 직진 불가
    expect(moves).not.toContain(sq('e2')); // 한 칸 이동 후 대각선으로 이어갈 수 없음
    expect(moves).toContain(sq('h6')); // 기존 대각선
  });

  it('팔라딘: 상하좌우 인접 칸의 킹에 체크를 건다', () => {
    let state = charged('8/8/8/8/8/8/2k5/2B1K3 w - - 0 1', { w: 'paladin' });
    expect(isInCheck(state, 'b')).toBe(false); // 일반 비숍은 바로 앞 칸을 공격하지 않음
    state = useAbility(state, { square: sq('c1') });
    expect(isInCheck(state, 'b')).toBe(true);
    // 흑 킹: 보호받지 않는 팔라딘(c1)은 잡을 수 있고, 팔라딘의 옆 칸(b1·d1)으로는 갈 수 없다
    const kingMoves = targets(state, 'c2');
    expect(kingMoves).toContain(sq('c1'));
    expect(kingMoves).not.toContain(sq('b1'));
    expect(kingMoves).not.toContain(sq('d1'));
  });
});

describe('여제', () => {
  it('체크 중에도 사용 가능하고, 이후 킹이 잡혀도 계속되며 퀸이 모두 잡히면 패배한다', () => {
    let state = createGame({ fen: '4k3/8/8/8/8/8/r7/3QK2r w - - 0 1', abilities: { w: 'empress' }, resources: { w: 1 } });
    expect(isInCheck(state, 'w')).toBe(true);
    state = useAbility(state);
    expect(usesCheckRule(state, 'w')).toBe(false);
    expect(isInCheck(state, 'w')).toBe(false);
    expect(royalSquares(state, 'w')).toEqual([sq('d1')]); // 킹은 왕족에서 빠짐

    state = move(state, 'h1', 'e1'); // 킹 포획
    expect(state.result.kind).toBe('ongoing');
    state = move(state, 'd1', 'd2');
    state = move(state, 'a2', 'd2'); // 마지막 퀸 포획
    expect(state.result).toEqual({ kind: 'win', winner: 'b', reason: 'royalsCaptured' });
  });

  // 여제는 되돌릴 수 없다. 킹이 몇이든 왕족은 그 퀸 하나뿐이라 잡히는 순간 왕족 전멸이다
  it('퀸이 잡히면 킹이 둘 남아 있어도 곧바로 패배한다', () => {
    let state = createGame({ fen: '4k3/P7/8/8/8/8/3r4/3QK3 w - - 0 1', abilities: { w: 'empress' }, resources: { w: 1 } });
    state = useAbility(state);
    state = move(state, 'e8', 'f8');
    state = move(state, 'a7', 'a8', 'k'); // 승급 킹 — 백은 킹이 둘이 된다
    expect(royalSquares(state, 'w')).toEqual([sq('d1')]); // 그래도 왕족은 퀸 하나뿐

    state = move(state, 'd2', 'd1'); // 여제의 퀸 포획
    expect(state.result).toEqual({ kind: 'win', winner: 'b', reason: 'royalsCaptured' });
  });

  it('여제 규칙은 판이 끝날 때까지 풀리지 않는다', () => {
    let state = createGame({ fen: '3rk3/1P6/8/8/8/8/7K/3Q4 w - - 0 1', abilities: { w: 'empress' }, resources: { w: 1 } });
    state = useAbility(state);
    state = move(state, 'd8', 'd2'); // 퀸을 잡지 않고 접근만
    expect(state.players.w.rules).toEqual({ queensRoyal: true, noQueenPromotion: true });

    // 퀸 프로모션 금지도 계속 유지된다
    const promotions = legalMoves(state).filter((m) => m.from === sq('b7')).map((m) => m.promotion);
    expect(promotions).not.toContain('q');
    expect(promotions).toContain('k');
  });

  it('퀸이 정확히 하나일 때만 사용할 수 있다', () => {
    const noQueen = setResource(game('4k3/8/8/8/8/8/8/R3K3 w - - 0 1', { w: 'empress' }), 'w', 1);
    expect(legalAbilityOptions(noQueen)).toEqual([]);
    const twoQueens = setResource(game('4k3/8/8/8/8/8/8/Q2QK3 w - - 0 1', { w: 'empress' }), 'w', 1);
    expect(legalAbilityOptions(twoQueens)).toEqual([]);
    const oneQueen = setResource(game('4k3/8/8/8/8/8/8/3QK3 w - - 0 1', { w: 'empress' }), 'w', 1);
    expect(legalAbilityOptions(oneQueen)).toEqual([{}]);
  });

  it('킹이 공격받는 칸으로 이동할 수 있고, 퀸 프로모션은 금지된다', () => {
    let state = setResource(game('4k3/P7/8/8/8/2Q5/8/4K2r w - - 0 1', { w: 'empress' }), 'w', 1);
    state = useAbility(state);
    state = move(state, 'e8', 'd8');
    expect(targets(state, 'e1')).toContain(sq('f1'));
    const promotions = legalMoves(state).filter((m) => m.from === sq('a7')).map((m) => m.promotion);
    expect(promotions).not.toContain('q');
    expect(promotions).toEqual(expect.arrayContaining(['k', 'r', 'b', 'n']));

    // 승급 킹은 킹처럼 움직이지만 왕족이 아니다 (여제 규칙에서는 퀸만 왕족)
    state = move(state, 'a7', 'a8', 'k');
    expect(state.board[sq('a8')]).toMatchObject({ type: 'k', royal: false, title: 'promoted' });
    expect(royalSquares(state, 'w')).toEqual([sq('c3')]);
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
  it('체크가 아니어도 사용할 수 있고, 왕족이 둘 이상이면 사용할 수 없다', () => {
    let state = charged('4k3/8/8/8/8/8/P7/4K3 w - - 0 1', { w: 'heir' });
    expect(isInCheck(state, 'w')).toBe(false);
    expect(legalAbilityOptions(state)).toEqual([{ square: sq('a2') }]);
    state = useAbility(state, { square: sq('a2') });
    state = move(state, 'e8', 'f8');
    expect(legalAbilityOptions(state)).toEqual([]); // 선왕·계승자 공존
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
  it('폰이 아닌 아군 기물도 계승자로 지정할 수 있다', () => {
    let state = charged('4k3/8/8/8/8/8/8/R3K2r w - - 0 1', { w: 'heir' });
    expect(legalAbilityOptions(state)).toEqual([{ square: sq('a1') }]);
    state = useAbility(state, { square: sq('a1') });
    expect(state.board[sq('a1')]).toMatchObject({ type: 'r', royal: true, title: 'heir' });
    expect(isInCheck(state, 'w')).toBe(false);
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
