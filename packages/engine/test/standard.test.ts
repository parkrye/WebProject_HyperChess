import { describe, expect, it } from 'vitest';
import { applyAction, createGame, legalMoves, resign, type GameState } from '../src';
import { game, move } from './helpers';

function perft(state: GameState, depth: number): number {
  const moves = legalMoves(state);
  if (depth === 1) return moves.length;
  let nodes = 0;
  for (const m of moves) nodes += perft(applyAction(state, { type: 'move', move: m }), depth - 1);
  return nodes;
}

describe('perft', () => {
  const cases: [string, string, number[]][] = [
    ['시작 포지션', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', [20, 400, 8902]],
    ['Kiwipete', 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', [48, 2039]],
    ['Position 3', '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', [14, 191, 2812]],
    ['Position 4', 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', [6, 264, 9467]],
    ['Position 5', 'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', [44, 1486]],
  ];

  for (const [name, fen, expected] of cases) {
    it(name, () => {
      const state = game(fen);
      expected.forEach((nodes, index) => expect(perft(state, index + 1)).toBe(nodes));
    });
  }
});

describe('종료 판정', () => {
  it('기권하면 상대가 승리하고 이후 행동은 불가', () => {
    const state = resign(createGame(), 'w');
    expect(state.result).toEqual({ kind: 'win', winner: 'b', reason: 'resign' });
    expect(() => move(state, 'e2', 'e4')).toThrow();
  });

  it('바보의 메이트는 체크메이트', () => {
    let state = createGame();
    state = move(state, 'f2', 'f3');
    state = move(state, 'e7', 'e5');
    state = move(state, 'g2', 'g4');
    state = move(state, 'd8', 'h4');
    expect(state.result).toEqual({ kind: 'win', winner: 'b', reason: 'checkmate' });
  });

  it('스테일메이트는 무승부', () => {
    const state = game('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
    expect(state.result).toEqual({ kind: 'draw', reason: 'stalemate' });
  });

  it('맨 킹끼리는 기물 부족 무승부', () => {
    const state = move(game('7k/8/8/8/3r4/3K4/8/8 w - - 0 1'), 'd3', 'd4');
    expect(state.result).toEqual({ kind: 'draw', reason: 'insufficientMaterial' });
  });

  it('3회 반복은 무승부', () => {
    let state = createGame();
    for (let i = 0; i < 2; i++) {
      state = move(state, 'g1', 'f3');
      state = move(state, 'g8', 'f6');
      state = move(state, 'f3', 'g1');
      state = move(state, 'f6', 'g8');
    }
    expect(state.result).toEqual({ kind: 'draw', reason: 'threefold' });
  });
});
