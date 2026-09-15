import { describe, expect, it } from 'vitest';
import { fitK, meanSquaredError, modelSize, train, winProbability, type Dataset } from '../tools/texel';

function seeded(seed: number) {
  let value = seed;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

/**
 * 합성 데이터 (항목 2개, 능력 보정 블록 1개).
 * 공통 정답 가중치 [100, 300]. abilityBonus가 있으면 능력 0을 가진 진영의 두 번째 항목 가중치가 그만큼 크다.
 */
function synthetic(count: number, seed: number, abilityBonus = 0): Dataset {
  const random = seeded(seed);
  const white = new Float32Array(count * 2);
  const black = new Float32Array(count * 2);
  const whiteAbility = new Int16Array(count);
  const blackAbility = new Int16Array(count);
  const labels = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    white[i * 2] = Math.round(random() * 3);
    white[i * 2 + 1] = Math.round(random() * 2);
    black[i * 2] = Math.round(random() * 3);
    black[i * 2 + 1] = Math.round(random() * 2);
    whiteAbility[i] = abilityBonus && random() < 0.5 ? 0 : -1;
    blackAbility[i] = abilityBonus && random() < 0.5 ? 0 : -1;
    const whiteSecond = 300 + (whiteAbility[i] === 0 ? abilityBonus : 0);
    const blackSecond = 300 + (blackAbility[i] === 0 ? abilityBonus : 0);
    const score = 100 * (white[i * 2] - black[i * 2]) + whiteSecond * white[i * 2 + 1] - blackSecond * black[i * 2 + 1];
    labels[i] = random() < winProbability(score, 1) ? 1 : 0;
  }
  return { white, black, whiteAbility, blackAbility, labels, count, dims: 2, abilities: 1 };
}

const options = (size: number, fixed: boolean[]) => ({
  epochs: 400,
  learningRate: 4,
  l2: new Float64Array(size),
  anchor: new Float64Array(size),
  fixed,
  patience: 50,
});

describe('Texel 튜닝', () => {
  it('점수 0이면 기대 점수 0.5', () => {
    expect(winProbability(0, 1)).toBe(0.5);
    expect(winProbability(400, 1)).toBeCloseTo(10 / 11, 6);
  });

  it('틀린 두 번째 가중치를 정답 쪽으로 학습하고 오차가 줄어든다', () => {
    const trainSet = synthetic(20_000, 1);
    const validSet = synthetic(4_000, 2);
    const initial = [100, 60, 0, 0];
    const k = fitK(trainSet, initial);
    const before = meanSquaredError(validSet, initial, k);
    const result = train(trainSet, validSet, initial, k, options(modelSize(trainSet), [true, false, true, true]));

    expect(result.weights[0]).toBe(100);
    expect(result.validError).toBeLessThan(before);
    // K와 함께 맞춘 결과라 정확히 300은 아니어도 크게 가까워진다
    expect(result.weights[1]).toBeGreaterThan(200);
  });

  it('능력을 가진 진영에만 적용되는 보정값을 학습한다', () => {
    const trainSet = synthetic(30_000, 3, 250);
    const validSet = synthetic(6_000, 4, 250);
    const initial = [100, 300, 0, 0];
    const result = train(trainSet, validSet, initial, 1, options(modelSize(trainSet), [true, true, true, false]));

    // 공통 가중치는 고정, 능력 0의 두 번째 항목 보정만 양수로 크게 자란다
    expect(result.weights[1]).toBe(300);
    expect(result.weights[3]).toBeGreaterThan(120);
    expect(result.validError).toBeLessThan(meanSquaredError(validSet, initial, 1));
  });
});
