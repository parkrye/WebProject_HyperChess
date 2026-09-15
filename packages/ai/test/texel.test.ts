import { describe, expect, it } from 'vitest';
import { fitK, meanSquaredError, train, winProbability, type Dataset } from '../tools/texel';

/** 정답 가중치 [100, 300]로 결과를 만든 합성 데이터 */
function synthetic(count: number, seed: number): Dataset {
  let value = seed;
  const random = () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
  const features = new Float32Array(count * 2);
  const labels = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    features[i * 2] = Math.round(random() * 6 - 3);
    features[i * 2 + 1] = Math.round(random() * 4 - 2);
    const p = winProbability(100 * features[i * 2] + 300 * features[i * 2 + 1], 1);
    labels[i] = random() < p ? 1 : 0;
  }
  return { features, labels, count, dims: 2 };
}

describe('Texel 튜닝', () => {
  it('점수 0이면 기대 점수 0.5', () => {
    expect(winProbability(0, 1)).toBe(0.5);
    expect(winProbability(400, 1)).toBeCloseTo(10 / 11, 6);
  });

  it('틀린 두 번째 가중치를 정답 쪽으로 학습하고 오차가 줄어든다', () => {
    const trainSet = synthetic(20_000, 1);
    const validSet = synthetic(4_000, 2);
    const initial = [100, 60];
    const k = fitK(trainSet, initial);
    const before = meanSquaredError(validSet, initial, k);
    const result = train(trainSet, validSet, initial, k, { epochs: 400, learningRate: 4, l2: 0, fixed: [true, false], patience: 50 });

    expect(result.weights[0]).toBe(100);
    expect(result.validError).toBeLessThan(before);
    // K와 함께 맞춘 결과라 정확히 300은 아니어도 크게 가까워진다
    expect(result.weights[1]).toBeGreaterThan(200);
  });
});
