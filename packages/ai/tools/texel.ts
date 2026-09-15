/**
 * Texel 튜닝 계산: 국면 항목값과 실제 결과(백 기준 1 · 0.5 · 0)로
 * "평가 점수 → 승리 확률" 예측 오차를 줄이는 선형 가중치를 찾는다.
 *
 * 모델 벡터 = [공통 가중치(dims) | 능력 0 보정(dims) | 능력 1 보정(dims) | …]
 *   점수 = (공통 + 보정[백 능력]) · 백 항목값 − (공통 + 보정[흑 능력]) · 흑 항목값
 */

export interface Dataset {
  /** count × dims 행렬 (행 = 국면), 진영별 항목값 */
  readonly white: Float32Array;
  readonly black: Float32Array;
  /** 국면별 진영의 능력 보정 블록 번호 (-1 = 보정 없음) */
  readonly whiteAbility: Int16Array;
  readonly blackAbility: Int16Array;
  /** 백 기준 결과 */
  readonly labels: Float32Array;
  readonly count: number;
  readonly dims: number;
  /** 능력 보정 블록 수 */
  readonly abilities: number;
}

export const modelSize = (data: Pick<Dataset, 'dims' | 'abilities'>) => data.dims * (1 + data.abilities);

/** 평가 점수(센티폰, 백 기준)를 백의 기대 점수로 바꾸는 시그모이드 */
export const winProbability = (score: number, k: number) => 1 / (1 + Math.pow(10, (-k * score) / 400));

function scoreOf(data: Dataset, row: number, model: ArrayLike<number>): number {
  const { dims } = data;
  const offset = row * dims;
  const whiteBlock = data.whiteAbility[row] >= 0 ? (1 + data.whiteAbility[row]) * dims : -1;
  const blackBlock = data.blackAbility[row] >= 0 ? (1 + data.blackAbility[row]) * dims : -1;
  let sum = 0;
  for (let j = 0; j < dims; j++) {
    const w = data.white[offset + j];
    const b = data.black[offset + j];
    if (w === 0 && b === 0) continue;
    const base = model[j];
    sum += (base + (whiteBlock >= 0 ? model[whiteBlock + j] : 0)) * w - (base + (blackBlock >= 0 ? model[blackBlock + j] : 0)) * b;
  }
  return sum;
}

export function meanSquaredError(data: Dataset, model: ArrayLike<number>, k: number): number {
  if (data.count === 0) return 0;
  let total = 0;
  for (let i = 0; i < data.count; i++) {
    const error = winProbability(scoreOf(data, i, model), k) - data.labels[i];
    total += error * error;
  }
  return total / data.count;
}

/** 현재 가중치에서 오차가 가장 작은 시그모이드 기울기 K (황금분할 탐색) */
export function fitK(data: Dataset, model: ArrayLike<number>, low = 0.05, high = 3, iterations = 40): number {
  const ratio = (Math.sqrt(5) - 1) / 2;
  let a = low;
  let b = high;
  let c = b - ratio * (b - a);
  let d = a + ratio * (b - a);
  let fc = meanSquaredError(data, model, c);
  let fd = meanSquaredError(data, model, d);
  for (let i = 0; i < iterations; i++) {
    if (fc < fd) {
      b = d;
      d = c;
      fd = fc;
      c = b - ratio * (b - a);
      fc = meanSquaredError(data, model, c);
    } else {
      a = c;
      c = d;
      fc = fd;
      d = a + ratio * (b - a);
      fd = meanSquaredError(data, model, d);
    }
  }
  return (a + b) / 2;
}

export interface TrainOptions {
  readonly epochs: number;
  readonly learningRate: number;
  /** 파라미터별 L2 벌점: anchor에서 멀어지는 것에 대한 벌점 (드문 항목·데이터가 적은 능력이 튀지 않게) */
  readonly l2: ArrayLike<number>;
  /** L2가 끌어당기는 기준값 (공통 = 기존 가중치, 보정 = 0) */
  readonly anchor: ArrayLike<number>;
  /** true인 파라미터는 고정 */
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
  const { dims } = trainSet;
  const size = modelSize(trainSet);
  const weights = Float64Array.from(initial);
  const m = new Float64Array(size);
  const v = new Float64Array(size);
  const gradient = new Float64Array(size);
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
      const whiteBlock = trainSet.whiteAbility[i] >= 0 ? (1 + trainSet.whiteAbility[i]) * dims : -1;
      const blackBlock = trainSet.blackAbility[i] >= 0 ? (1 + trainSet.blackAbility[i]) * dims : -1;
      for (let j = 0; j < dims; j++) {
        const w = trainSet.white[offset + j];
        const b = trainSet.black[offset + j];
        if (w === 0 && b === 0) continue;
        gradient[j] += factor * (w - b);
        if (whiteBlock >= 0) gradient[whiteBlock + j] += factor * w;
        if (blackBlock >= 0) gradient[blackBlock + j] -= factor * b;
      }
    }

    for (let j = 0; j < size; j++) {
      if (options.fixed[j]) continue;
      const g = gradient[j] / trainSet.count + 2 * options.l2[j] * (weights[j] - options.anchor[j]);
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
