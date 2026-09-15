/**
 * Texel 튜닝 계산: 국면 항목값과 실제 결과(백 기준 1 · 0.5 · 0)로
 * "평가 점수 → 승리 확률" 예측 오차를 줄이는 선형 가중치를 찾는다.
 */

export interface Dataset {
  /** count × dims 행렬 (행 = 국면) */
  readonly features: Float32Array;
  /** 백 기준 결과 */
  readonly labels: Float32Array;
  readonly count: number;
  readonly dims: number;
}

/** 평가 점수(센티폰, 백 기준)를 백의 기대 점수로 바꾸는 시그모이드 */
export const winProbability = (score: number, k: number) => 1 / (1 + Math.pow(10, (-k * score) / 400));

function scoreOf(data: Dataset, row: number, weights: ArrayLike<number>): number {
  let sum = 0;
  const offset = row * data.dims;
  for (let j = 0; j < data.dims; j++) sum += weights[j] * data.features[offset + j];
  return sum;
}

export function meanSquaredError(data: Dataset, weights: ArrayLike<number>, k: number): number {
  if (data.count === 0) return 0;
  let total = 0;
  for (let i = 0; i < data.count; i++) {
    const error = winProbability(scoreOf(data, i, weights), k) - data.labels[i];
    total += error * error;
  }
  return total / data.count;
}

/** 현재 가중치에서 오차가 가장 작은 시그모이드 기울기 K (황금분할 탐색) */
export function fitK(data: Dataset, weights: ArrayLike<number>, low = 0.05, high = 3, iterations = 40): number {
  const ratio = (Math.sqrt(5) - 1) / 2;
  let a = low;
  let b = high;
  let c = b - ratio * (b - a);
  let d = a + ratio * (b - a);
  let fc = meanSquaredError(data, weights, c);
  let fd = meanSquaredError(data, weights, d);
  for (let i = 0; i < iterations; i++) {
    if (fc < fd) {
      b = d;
      d = c;
      fd = fc;
      c = b - ratio * (b - a);
      fc = meanSquaredError(data, weights, c);
    } else {
      a = c;
      c = d;
      fc = fd;
      d = a + ratio * (b - a);
      fd = meanSquaredError(data, weights, d);
    }
  }
  return (a + b) / 2;
}

export interface TrainOptions {
  readonly epochs: number;
  readonly learningRate: number;
  /** 시작 가중치에서 멀어지는 것에 대한 L2 벌점 (드문 항목이 튀지 않게) */
  readonly l2: number;
  /** true인 항목은 고정 */
  readonly fixed: readonly boolean[];
  /** 검증 오차가 이 횟수만큼 나아지지 않으면 멈춘다 */
  readonly patience: number;
  readonly onEpoch?: (epoch: number, trainError: number, validError: number) => void;
}

export interface TrainResult {
  readonly weights: Float64Array;
  readonly trainError: number;
  readonly validError: number;
  readonly bestEpoch: number;
}

/** 전체 배치 경사하강(Adam). 검증 오차가 가장 낮았던 가중치를 돌려준다 */
export function train(trainSet: Dataset, validSet: Dataset, initial: ArrayLike<number>, k: number, options: TrainOptions): TrainResult {
  const dims = trainSet.dims;
  const weights = Float64Array.from(initial);
  const start = Float64Array.from(initial);
  const m = new Float64Array(dims);
  const v = new Float64Array(dims);
  const gradient = new Float64Array(dims);
  const beta1 = 0.9;
  const beta2 = 0.999;
  const scale = (Math.LN10 * k) / 400;

  let best: TrainResult = {
    weights: Float64Array.from(weights),
    trainError: meanSquaredError(trainSet, weights, k),
    validError: meanSquaredError(validSet, weights, k),
    bestEpoch: 0,
  };
  let sinceBest = 0;

  for (let epoch = 1; epoch <= options.epochs; epoch++) {
    gradient.fill(0);
    let total = 0;
    for (let i = 0; i < trainSet.count; i++) {
      const p = winProbability(scoreOf(trainSet, i, weights), k);
      const error = p - trainSet.labels[i];
      total += error * error;
      // d(error²)/d(score) = 2·error·p(1−p)·ln10·K/400
      const factor = 2 * error * p * (1 - p) * scale;
      const offset = i * dims;
      for (let j = 0; j < dims; j++) gradient[j] += factor * trainSet.features[offset + j];
    }

    for (let j = 0; j < dims; j++) {
      if (options.fixed[j]) continue;
      const g = gradient[j] / trainSet.count + 2 * options.l2 * (weights[j] - start[j]);
      m[j] = beta1 * m[j] + (1 - beta1) * g;
      v[j] = beta2 * v[j] + (1 - beta2) * g * g;
      const mHat = m[j] / (1 - beta1 ** epoch);
      const vHat = v[j] / (1 - beta2 ** epoch);
      weights[j] -= (options.learningRate * mHat) / (Math.sqrt(vHat) + 1e-12);
    }

    const trainError = total / trainSet.count;
    const validError = meanSquaredError(validSet, weights, k);
    options.onEpoch?.(epoch, trainError, validError);
    if (validError < best.validError) {
      best = { weights: Float64Array.from(weights), trainError, validError, bestEpoch: epoch };
      sinceBest = 0;
    } else if (++sinceBest >= options.patience) {
      break;
    }
  }
  return best;
}
