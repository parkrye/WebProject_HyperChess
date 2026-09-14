import { describe, expect, it } from 'vitest';
import {
  applyAction,
  attacks,
  createGame,
  isSquareAttacked,
  legalAbilityOptions,
  legalMoves,
  type Action,
  type Board,
  type Color,
  type GameState,
} from '../src';

function bruteForceAttacked(board: Board, target: number, by: Color): boolean {
  return board.some((piece, sq) => !!piece && piece.color === by && attacks(board, sq, target));
}

function seededRandom(seed: number) {
  let value = seed;
  return () => {
    value = (value * 1664525 + 1013904223) % 4294967296;
    return value / 4294967296;
  };
}

const ABILITY_PAIRS: [string, string][] = [
  ['chariot', 'paladin'],
  ['heavyInfantry', 'lancer'],
  ['telekinesis', 'teleport'],
  ['heir', 'empress'],
];

describe('역방향 공격 판정', () => {
  it('강화 말이 섞인 무작위 대국에서 전수 판정과 일치한다', () => {
    const random = seededRandom(42);
    let checked = 0;

    for (const [w, b] of ABILITY_PAIRS) {
      for (let game = 0; game < 6; game++) {
        let state: GameState = createGame({ abilities: { w, b } });
        for (let ply = 0; ply < 60 && state.result.kind === 'ongoing'; ply++) {
          // 강화가 자주 일어나도록 자원을 채워둔다
          const player = state.players[state.turn];
          state = { ...state, players: { ...state.players, [state.turn]: { ...player, meter: { ...player.meter, resource: 5, cooldown: 0 } } } };

          for (let sq = 0; sq < 64; sq++) {
            for (const by of ['w', 'b'] as const) {
              expect(isSquareAttacked(state.board, sq, by)).toBe(bruteForceAttacked(state.board, sq, by));
              checked++;
            }
          }

          const abilities = legalAbilityOptions(state).map((params): Action => ({ type: 'ability', params }));
          const moves = legalMoves(state).map((move): Action => ({ type: 'move', move }));
          const pool = random() < 0.35 && abilities.length ? abilities : moves.length ? moves : abilities;
          if (!pool.length) break;
          state = applyAction(state, pool[Math.floor(random() * pool.length)]);
        }
      }
    }
    expect(checked).toBeGreaterThan(10000);
  });
});
