import { applyAction, createGame, legalAbilityOptions, legalMoves, listAbilities, type Action, type GameState } from '@hyperchess/engine';
import { describe, expect, it } from 'vitest';
import { evaluate } from '../src/evaluate';
import { dot, extractFeatures, weightObject, weightVector, WEIGHT_KEYS } from '../src/features';
import { WEIGHTS } from '../src/weights';
import { LEGACY_WEIGHTS } from './legacyWeights';
import { evaluate as legacyEvaluate } from './legacyEvaluate';

function seeded(seed: number) {
  let value = seed;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

/** 능력을 섞어 무작위로 둔 국면들 */
function randomPositions(games: number, plies: number): GameState[] {
  const random = seeded(42);
  const abilities = listAbilities().map((a) => a.id);
  const positions: GameState[] = [];
  for (let g = 0; g < games; g++) {
    let state = createGame({ abilities: { w: abilities[g % abilities.length], b: abilities[(g * 7 + 3) % abilities.length] } });
    for (let p = 0; p < plies && state.result.kind === 'ongoing'; p++) {
      const abilityOptions = legalAbilityOptions(state);
      const moves = legalMoves(state);
      const useAbility = abilityOptions.length > 0 && (moves.length === 0 || random() < 0.25);
      const action: Action = useAbility
        ? { type: 'ability', params: abilityOptions[Math.floor(random() * abilityOptions.length)] }
        : { type: 'move', move: moves[Math.floor(random() * moves.length)] };
      state = applyAction(state, action, 0);
      positions.push(state);
    }
  }
  return positions;
}

describe('평가 항목 (선형 평가)', () => {
  const positions = randomPositions(44, 80);

  it('선형화 이전 가중치로 계산하면 기존 평가 함수와 모든 국면에서 같다 (튜닝 적용과 무관)', () => {
    expect(positions.length).toBeGreaterThan(1000);
    const legacy = weightVector(LEGACY_WEIGHTS);
    for (const state of positions) {
      expect(dot(legacy, extractFeatures(state))).toBeCloseTo(legacyEvaluate(state, 'w'), 6);
    }
  });

  it('평가 = 가중치 · 항목값, 가중치 객체와 벡터는 서로 변환된다', () => {
    const weights = weightVector(WEIGHTS);
    expect(weightVector(weightObject(weights))).toEqual(weights);
    expect(Object.keys(weightObject(weights))).toEqual(WEIGHT_KEYS);
    const state = positions[500];
    expect(dot(weights, extractFeatures(state))).toBeCloseTo(evaluate(state, 'w'), 6);
    expect(evaluate(state, 'b')).toBeCloseTo(-evaluate(state, 'w'), 6);
  });
});
