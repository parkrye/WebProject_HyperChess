import { applyAction, createGame, isSquareAttacked, isTrapped, isWall, legalAbilityOptions, legalMoves, neighbors, opposite, trappingSquares, type Action, type Color, type GameState } from '@hyperchess/engine';
import { describe, expect, it } from 'vitest';
import { ABILITY_FEATURE_KEYS, addAbilityFeatures, hasEmptyNeighbor, isSurrounded, touchesColor } from '../src/abilityFeatures';

function seeded(seed: number) {
  let value = seed;
  return () => ((value = (Math.imul(value, 1664525) + 1013904223) >>> 0), value / 4294967296);
}

/** 능력 항목이 붙은 네 능력으로 무작위 대국을 두어 국면을 모은다 */
function positions(): GameState[] {
  const random = seeded(11);
  const out: GameState[] = [];
  for (const abilityId of ['revive', 'brainwash', 'telekinesis', 'teleport']) {
    for (let g = 0; g < 6; g++) {
      let state = createGame({ abilities: { w: abilityId, b: abilityId } });
      for (let p = 0; p < 70 && state.result.kind === 'ongoing'; p++) {
        const options = legalAbilityOptions(state);
        const moves = legalMoves(state);
        const action: Action =
          options.length > 0 && (moves.length === 0 || random() < 0.3)
            ? { type: 'ability', params: options[Math.floor(random() * options.length)] }
            : { type: 'move', move: moves[Math.floor(random() * moves.length)] };
        state = applyAction(state, action, 0);
        out.push(state);
      }
    }
  }
  return out;
}

describe('능력 고유 항목의 인접 칸 판정', () => {
  const states = positions();

  it('국면이 충분히 모인다', () => {
    expect(states.length).toBeGreaterThan(1000);
  });

  // 평가는 노드마다 불려서 배열을 만들지 않는 자체 구현을 쓴다. 엔진 함수와 결과가 같아야 한다
  it('isSurrounded는 엔진의 isTrapped와 모든 칸에서 같다', () => {
    for (const state of states) {
      for (let sq = 0; sq < state.board.length; sq++) {
        for (const color of ['w', 'b'] as const) {
          expect(isSurrounded(state.board, sq, color)).toBe(isTrapped(state.board, sq, color));
        }
      }
    }
  });

  it('touchesColor는 엔진의 trappingSquares가 비지 않은 것과 같다', () => {
    for (const state of states) {
      for (let sq = 0; sq < state.board.length; sq++) {
        for (const color of ['w', 'b'] as const) {
          expect(touchesColor(state.board, sq, color)).toBe(trappingSquares(state.board, sq, color).length > 0);
        }
      }
    }
  });

  it('hasEmptyNeighbor는 엔진의 neighbors로 센 빈칸 유무와 같다', () => {
    for (const state of states) {
      for (let sq = 0; sq < state.board.length; sq++) {
        const expected = neighbors(sq).some((n) => !state.board[n] && !isWall(state.walls, n));
        expect(hasEmptyNeighbor(state.board, state.walls, sq)).toBe(expected);
      }
    }
  });
});


/** positions()와 같은 방식으로 여제 국면만 모은다 */
function empressPositions(): GameState[] {
  const random = seeded(29);
  const out: GameState[] = [];
  for (let g = 0; g < 24; g++) {
    let state = createGame({ abilities: { w: 'empress', b: 'empress' } });
    for (let p = 0; p < 70 && state.result.kind === 'ongoing'; p++) {
      const options = legalAbilityOptions(state);
      const moves = legalMoves(state);
      const action: Action =
        options.length > 0 && (moves.length === 0 || random() < 0.4)
          ? { type: 'ability', params: options[Math.floor(random() * options.length)] }
          : { type: 'move', move: moves[Math.floor(random() * moves.length)] };
      state = applyAction(state, action, 0);
      out.push(state);
    }
  }
  return out;
}

/** 여제 항목 두 개만 떼어 돌려준다 */
function empressFeatures(state: GameState, color: Color): { attacked: number; defended: number } {
  const out = new Float64Array(ABILITY_FEATURE_KEYS.length);
  addAbilityFeatures(out, 0, state, color, 1);
  return {
    attacked: out[ABILITY_FEATURE_KEYS.indexOf('empress.royalAttacked')],
    defended: out[ABILITY_FEATURE_KEYS.indexOf('empress.royalDefended')],
  };
}

describe('여제 항목', () => {
  const states = empressPositions();
  const royal = states.filter((s) => s.players.w.rules.queensRoyal || s.players.b.rules.queensRoyal);

  // 여제를 한 번도 켜지 않았다면 아래 검사들이 전부 0 대 0으로 통과해 버린다
  it('여제가 켜진 국면이 실제로 모인다', () => {
    expect(royal.length).toBeGreaterThan(50);
  });

  it('여제가 꺼져 있으면 두 항목 모두 0이다', () => {
    for (const state of states) {
      for (const color of ['w', 'b'] as const) {
        if (state.players[color].rules.queensRoyal) continue;
        expect(empressFeatures(state, color)).toEqual({ attacked: 0, defended: 0 });
      }
    }
  });

  it('여제가 켜지면 공격받는/지켜지는 왕족 퀸의 수와 같다', () => {
    for (const state of states) {
      for (const color of ['w', 'b'] as const) {
        if (!state.players[color].rules.queensRoyal) continue;
        let attacked = 0;
        let defended = 0;
        for (let sq = 0; sq < state.board.length; sq++) {
          const piece = state.board[sq];
          if (piece?.color !== color || piece.type !== 'q') continue;
          if (isSquareAttacked(state.board, sq, opposite(color), state.walls)) attacked++;
          if (isSquareAttacked(state.board, sq, color, state.walls)) defended++;
        }
        expect(empressFeatures(state, color)).toEqual({ attacked, defended });
      }
    }
  });
});
