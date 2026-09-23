import { describe, expect, it } from 'vitest';
import {
  DRAFT_BUDGET,
  HIDDEN_SQUARE,
  THRONE_HOLD_TURNS,
  abilityRevealed,
  applyAction,
  concealAbilities,
  parseGameMode,
  chaosPlacement,
  createGame,
  deploySquare,
  draftError,
  fogView,
  kingOnlyPlacement,
  legalAbilityOptions,
  legalMoves,
  placementCost,
  placementFen,
  standardPlacement,
  START_FEN,
  STANDARD_MODE,
  visibleSquares,
  type GameSetup,
  type GameState,
  type Placement,
} from '../src';
import { move, setResource, sq } from './helpers';

const FOG = { ...STANDARD_MODE, fog: true };
const fogGame = (fen: string, abilities: GameSetup['abilities'] = {}): GameState => createGame({ fen, mode: FOG, abilities });

describe('징병 배치', () => {
  it('표준 배치는 예산과 같고 규칙에 맞다', () => {
    expect(placementCost(standardPlacement('w'))).toBe(DRAFT_BUDGET);
    expect(draftError('w', standardPlacement('w'))).toBeNull();
    expect(draftError('b', standardPlacement('b'))).toBeNull();
  });

  it('두 쪽 표준 배치로 만든 FEN은 표준 시작 FEN과 같다', () => {
    expect(placementFen(standardPlacement('w'), standardPlacement('b'))).toBe(START_FEN);
  });

  it('킹만 있어도 된다', () => {
    expect(draftError('b', kingOnlyPlacement('b'))).toBeNull();
  });

  it('둘째·셋째 줄에는 폰만, 넷째 줄부터는 둘 수 없다', () => {
    const king = kingOnlyPlacement('w');
    expect(draftError('w', [...king, { square: deploySquare('w', 0, 2), type: 'p' }])).toBeNull();
    expect(draftError('w', [...king, { square: deploySquare('w', 0, 1), type: 'n' }])).not.toBeNull();
    expect(draftError('w', [...king, { square: deploySquare('w', 0, 3), type: 'p' }])).not.toBeNull();
  });

  it('킹은 첫 줄에 하나', () => {
    expect(draftError('w', [{ square: deploySquare('w', 4, 1), type: 'k' }])).not.toBeNull();
    expect(draftError('w', [...kingOnlyPlacement('w'), { square: deploySquare('w', 0, 0), type: 'k' }])).not.toBeNull();
    expect(draftError('w', [])).not.toBeNull();
  });

  it('예산을 넘으면 안 된다', () => {
    const queens: Placement = [0, 1, 2, 3, 5].map((file) => ({ square: deploySquare('w', file, 0), type: 'q' as const }));
    expect(draftError('w', [...kingOnlyPlacement('w'), ...queens])).not.toBeNull();
  });

  it('셋째 줄 폰은 두 칸 전진을 못 하고, 킹이 옮겨지면 캐슬링이 없다', () => {
    const white: Placement = [
      { square: deploySquare('w', 3, 0), type: 'k' },
      { square: deploySquare('w', 7, 0), type: 'r' },
      { square: deploySquare('w', 0, 2), type: 'p' },
    ];
    const fen = placementFen(white, standardPlacement('b'));
    expect(fen.split(' ')[2]).toBe('kq');
    const state = createGame({ fen });
    const pawnMoves = legalMoves(state).filter((m) => m.from === sq('a3'));
    expect(pawnMoves.map((m) => m.to)).toEqual([sq('a4')]);
  });
});

describe('혼돈 배치', () => {
  it('16칸을 채우고 킹은 첫 줄에 하나다', () => {
    for (let i = 0; i < 50; i++) {
      const placement = chaosPlacement('b');
      expect(placement).toHaveLength(16);
      const kings = placement.filter((p) => p.type === 'k');
      expect(kings).toHaveLength(1);
      expect(kings[0].square).toBeGreaterThanOrEqual(56);
      createGame({ fen: placementFen(chaosPlacement('w'), placement) });
    }
  });
});

describe('안개전', () => {
  it('보이는 칸: 내 말과 갈 수 있는 칸', () => {
    const state = createGame({ mode: FOG });
    const visible = visibleSquares(state, 'w');
    expect(visible.has(sq('e2'))).toBe(true);
    expect(visible.has(sq('e4'))).toBe(true);
    expect(visible.has(sq('f3'))).toBe(true);
    expect(visible.has(sq('e5'))).toBe(false);
    expect(visible.has(sq('e7'))).toBe(false);
  });

  it('자기 킹을 공격받게 두는 수도 둘 수 있고, 두면 진다', () => {
    const state = fogGame('4k3/8/8/8/8/8/3r4/4K3 w - - 0 1');
    // 표준이면 f2는 룩에게 공격받아 갈 수 없다
    expect(legalMoves(state).some((m) => m.to === sq('f2'))).toBe(true);
    const after = move(state, 'e1', 'f2');
    expect(after.result).toEqual({ kind: 'win', winner: 'b', reason: 'checkmate' });
  });

  it('체크를 건 말은 보인다', () => {
    const state = fogGame('4k3/8/8/8/8/8/8/r3K3 w - - 0 1');
    expect(visibleSquares(state, 'w').has(sq('a1'))).toBe(true);
    const quiet = fogGame('4k3/8/8/8/8/8/7r/4K3 w - - 0 1');
    expect(visibleSquares(quiet, 'w').has(sq('h2'))).toBe(false);
  });

  it('체크를 피하면 계속 둔다', () => {
    const state = fogGame('4k3/8/8/8/8/8/8/r3K3 w - - 0 1');
    expect(move(state, 'e1', 'e2').result.kind).toBe('ongoing');
  });

  it('가린 상태에는 안 보이는 적 말이 없고 시야 표식이 붙는다', () => {
    const state = createGame({ mode: FOG });
    const view = fogView(state, 'w');
    expect(view.board.filter((p) => p?.color === 'b')).toHaveLength(0);
    expect(view.board.filter((p) => p?.color === 'w')).toHaveLength(16);
    expect(view.fogView?.viewer).toBe('w');
    expect(view.positionKeys).toEqual([]);
    expect(visibleSquares(view, 'w')).toEqual(visibleSquares(state, 'w'));
  });

  it('상대의 가려진 수는 칸이 지워진다', () => {
    const after = move(createGame({ mode: FOG }), 'g1', 'f3');
    const view = fogView(after, 'b');
    const event = view.log[view.log.length - 1];
    expect(event.kind === 'move' && event.move).toEqual({ from: HIDDEN_SQUARE, to: HIDDEN_SQUARE });
    expect(event.changes).toEqual([]);
  });

  it('안개가 없으면 가린 상태도 그대로다', () => {
    const state = createGame();
    expect(fogView(state, 'w')).toBe(state);
  });

  it('가려진 칸은 능력 대상이 되지 않는다', () => {
    const state = setResource(fogGame('4k3/8/8/8/8/8/4P3/4K3 w - - 0 1', { w: 'wall' }), 'w', 99);
    const options = legalAbilityOptions(state);
    const visible = visibleSquares(state, 'w');
    expect(options.length).toBeGreaterThan(0);
    expect(options.every((params) => visible.has(Number(params.square)))).toBe(true);
  });
});

describe('왕좌 점령', () => {
  const THRONE = { ...STANDARD_MODE, throne: true };

  it('왕좌에 머문 채 자기 턴을 정해진 번 맞으면 이긴다', () => {
    // 백 킹이 e4 옆, 흑은 멀리서 제자리걸음
    let state = createGame({ fen: '7k/p7/8/8/8/4K3/P7/8 w - - 0 1', mode: THRONE });
    state = move(state, 'e3', 'e4');
    const shuffle = [['h8', 'g8'], ['g8', 'h8'], ['h8', 'g8']];
    const steps = [['e4', 'd4'], ['d4', 'e4']];
    for (let i = 0; i < THRONE_HOLD_TURNS - 1; i++) {
      state = move(state, shuffle[i][0], shuffle[i][1]);
      expect(state.throne.w).toBe(i + 1);
      expect(state.result.kind).toBe('ongoing');
      // 왕좌 안에서 옮겨도 이어서 센다
      state = move(state, steps[i % 2][0], steps[i % 2][1]);
    }
    state = move(state, shuffle[THRONE_HOLD_TURNS - 1][0], shuffle[THRONE_HOLD_TURNS - 1][1]);
    expect(state.result).toEqual({ kind: 'win', winner: 'w', reason: 'throne' });
  });

  it('왕좌를 벗어나면 처음부터 다시 센다', () => {
    let state = createGame({ fen: '7k/p7/8/8/8/4K3/P7/8 w - - 0 1', mode: THRONE });
    state = move(state, 'e3', 'e4');
    state = move(state, 'h8', 'g8');
    expect(state.throne.w).toBe(1);
    state = move(state, 'e4', 'e3');
    state = move(state, 'g8', 'h8');
    expect(state.throne.w).toBe(0);
  });

  it('모드가 꺼져 있으면 세지 않는다', () => {
    let state = createGame({ fen: '7k/p7/8/8/8/4K3/P7/8 w - - 0 1' });
    state = move(state, 'e3', 'e4');
    state = move(state, 'h8', 'g8');
    expect(state.throne.w).toBe(0);
  });
});

describe('비밀 능력', () => {
  const SECRET = { ...STANDARD_MODE, secret: true };

  it('상대 능력은 쓰기 전까지 가려지고, 쓰면 드러난다', () => {
    let state = setResource(createGame({ mode: SECRET, abilities: { w: 'haste', b: 'rewind' } }), 'w', 99);
    const view = concealAbilities(state, 'b');
    expect(view.players.w.abilityId).toBeNull();
    expect(view.players.w.meter.resource).toBe(0);
    expect(view.players.b.abilityId).toBe('rewind');
    expect(abilityRevealed(state, 'w')).toBe(false);

    state = applyAction(state, { type: 'ability', params: {} });
    expect(abilityRevealed(state, 'w')).toBe(true);
    expect(concealAbilities(state, 'b').players.w.abilityId).toBe('haste');
  });

  it('모드가 꺼져 있으면 가리지 않는다', () => {
    const state = createGame({ abilities: { w: 'haste', b: null } });
    expect(concealAbilities(state, 'b')).toBe(state);
  });
});

describe('모드 값 읽기', () => {
  it('빠진 규칙은 꺼진 것으로 보고, 잘못된 값은 거부한다', () => {
    expect(parseGameMode({ deployment: 'draft', fog: true })).toEqual({ deployment: 'draft', fog: true, secret: false, throne: false });
    expect(parseGameMode({ deployment: 'nope' })).toBeNull();
    expect(parseGameMode({ deployment: 'standard', throne: 'yes' })).toBeNull();
  });
});
