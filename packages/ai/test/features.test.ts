import { applyAction, createGame, legalAbilityOptions, legalMoves, listAbilities, type Action, type GameState } from '@hyperchess/engine';
import { describe, expect, it } from 'vitest';
import { evaluate } from '../src/evaluate';
import { abilityIndex, ABILITY_IDS, dot, extractFeatures, extractSideFeatures, modelObjects, modelVector, sideWeights, weightObject, weightVector, WEIGHT_KEYS } from '../src/features';
import { ABILITY_WEIGHTS, WEIGHTS } from '../src/weights';
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

  it('가중치 객체와 벡터는 서로 변환된다', () => {
    const weights = weightVector(WEIGHTS);
    expect(weightVector(weightObject(weights))).toEqual(weights);
    expect(Object.keys(weightObject(weights))).toEqual(WEIGHT_KEYS);
  });

  it('평가 = (공통 + 자기 능력 보정) · 진영 항목값의 차', () => {
    // 능력별 보정이 있으면 진영마다 쓰는 가중치가 달라, 공통 가중치 하나로는 평가를 재현할 수 없다
    const model = modelVector(WEIGHTS, ABILITY_WEIGHTS);
    for (const state of positions.slice(0, 300)) {
      const { white, black } = extractSideFeatures(state);
      const score =
        dot(sideWeights(model, abilityIndex(state.players.w.abilityId)), white) -
        dot(sideWeights(model, abilityIndex(state.players.b.abilityId)), black);
      expect(score).toBeCloseTo(evaluate(state, 'w'), 6);
      expect(evaluate(state, 'b')).toBeCloseTo(-evaluate(state, 'w'), 6);
    }
  });

  it('진영별 항목값의 차이는 백 − 흑 항목값과 같다', () => {
    for (const state of positions.slice(0, 300)) {
      const { white, black } = extractSideFeatures(state);
      const diff = extractFeatures(state);
      white.forEach((value, j) => expect(value - black[j]).toBeCloseTo(diff[j], 9));
    }
  });

  it('능력별 보정은 그 능력을 가진 진영의 평가에만 더해진다', () => {
    const deltas = { [ABILITY_IDS[0]]: { 'piece.n': 50 } };
    const model = modelVector(WEIGHTS, deltas);
    expect(modelObjects(model).deltas).toEqual(deltas);

    const own = sideWeights(model, 0);
    const other = sideWeights(model, 1);
    const key = WEIGHT_KEYS.indexOf('piece.n');
    expect(own[key] - other[key]).toBe(50);
    expect(sideWeights(model, -1)).toEqual(weightVector(WEIGHTS));
  });
});
