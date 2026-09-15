import { fileOf, isInCheck, isRoyal, listAbilities, rankOf, type Color, type GameState } from '@hyperchess/engine';
import { ABILITY_WEIGHTS, WEIGHTS } from './weights';

/**
 * 평가 항목 목록. 진영마다 항목값을 따로 뽑고, 각 진영은 (공통 가중치 + 자기 능력의 보정값)을 곱한다.
 *   평가 점수(백 기준) = (공통 + 보정[백 능력]) · 백 항목값 − (공통 + 보정[흑 능력]) · 흑 항목값
 * 가중치에 대해 선형이라 튜닝 도구가 같은 항목값으로 공통 가중치와 능력별 보정을 함께 학습한다.
 */
const BASE_KEYS = [
  'piece.p',
  'piece.n',
  'piece.b',
  'piece.r',
  'piece.q',
  'promotedKing',
  'enhanced.p',
  'enhanced.n',
  'enhanced.b',
  'enhanced.r',
  'pawnAdvance',
  'pawnCenter',
  'knightCenter',
  'bishopCenter',
  'queenCenter',
  'royalKingCenter',
  'rookOpenFile',
  'passedPawn',
  'passedPawnAdvance',
  'doubledPawn',
  'bishopPair',
  'extraRoyal',
  'empressActive',
  'inCheck',
  'cooldown',
] as const;

export const WEIGHT_KEYS: readonly string[] = [...BASE_KEYS, ...listAbilities().map((a) => `resource.${a.id}`)];

/** 능력별 보정 블록 순서 (가중치 벡터에서 공통 블록 뒤에 이 순서로 붙는다) */
export const ABILITY_IDS: readonly string[] = listAbilities().map((a) => a.id);
const ABILITY_INDEX: ReadonlyMap<string, number> = new Map(ABILITY_IDS.map((id, i) => [id, i]));

/** 능력 id → 보정 블록 번호 (능력 없음이나 모르는 능력은 -1) */
export const abilityIndex = (abilityId: string | null): number => (abilityId ? ABILITY_INDEX.get(abilityId) ?? -1 : -1);

/** 튜닝하지 않는 기준 항목 (점수 단위를 폰 = 100으로 고정) */
export const FIXED_KEYS: ReadonlySet<string> = new Set(['piece.p']);

/** 새 능력이 추가돼 가중치 파일에 없을 때 쓰는 자원 가치 */
const DEFAULT_RESOURCE_WEIGHT = 35;

const INDEX: Readonly<Record<string, number>> = Object.fromEntries(WEIGHT_KEYS.map((key, i) => [key, i]));
const idx = (key: (typeof BASE_KEYS)[number]) => INDEX[key];

const I = {
  piece: { p: idx('piece.p'), n: idx('piece.n'), b: idx('piece.b'), r: idx('piece.r'), q: idx('piece.q') } as Record<string, number>,
  promotedKing: idx('promotedKing'),
  enhanced: { p: idx('enhanced.p'), n: idx('enhanced.n'), b: idx('enhanced.b'), r: idx('enhanced.r') } as Record<string, number | undefined>,
  pawnAdvance: idx('pawnAdvance'),
  pawnCenter: idx('pawnCenter'),
  knightCenter: idx('knightCenter'),
  bishopCenter: idx('bishopCenter'),
  queenCenter: idx('queenCenter'),
  royalKingCenter: idx('royalKingCenter'),
  rookOpenFile: idx('rookOpenFile'),
  passedPawn: idx('passedPawn'),
  passedPawnAdvance: idx('passedPawnAdvance'),
  doubledPawn: idx('doubledPawn'),
  bishopPair: idx('bishopPair'),
  extraRoyal: idx('extraRoyal'),
  empressActive: idx('empressActive'),
  inCheck: idx('inCheck'),
  cooldown: idx('cooldown'),
};

/** 가중치 객체 → 항목 순서의 벡터 */
export function weightVector(weights: Readonly<Record<string, number>>): Float64Array {
  return Float64Array.from(WEIGHT_KEYS, (key) => weights[key] ?? (key.startsWith('resource.') ? DEFAULT_RESOURCE_WEIGHT : 0));
}

/** 벡터 → 가중치 객체 */
export function weightObject(vector: ArrayLike<number>): Record<string, number> {
  return Object.fromEntries(WEIGHT_KEYS.map((key, i) => [key, vector[i]]));
}

export type AbilityWeights = Readonly<Record<string, Readonly<Record<string, number>>>>;

/** 공통 가중치 + 능력별 보정 → [공통 | 능력 0 보정 | 능력 1 보정 | …] 벡터 */
export function modelVector(base: Readonly<Record<string, number>>, deltas: AbilityWeights): Float64Array {
  const dims = WEIGHT_KEYS.length;
  const vector = new Float64Array(dims * (1 + ABILITY_IDS.length));
  vector.set(weightVector(base));
  ABILITY_IDS.forEach((id, a) => {
    const delta = deltas[id] ?? {};
    WEIGHT_KEYS.forEach((key, j) => {
      vector[(1 + a) * dims + j] = delta[key] ?? 0;
    });
  });
  return vector;
}

/** 모델 벡터 → 공통 가중치 객체 + 능력별 보정 객체 (보정은 0이 아닌 항목만) */
export function modelObjects(vector: ArrayLike<number>, round: (value: number) => number = (v) => v) {
  const dims = WEIGHT_KEYS.length;
  const base = Object.fromEntries(WEIGHT_KEYS.map((key, j) => [key, round(vector[j])]));
  const deltas: Record<string, Record<string, number>> = {};
  ABILITY_IDS.forEach((id, a) => {
    const entries = WEIGHT_KEYS.map((key, j) => [key, round(vector[(1 + a) * dims + j])] as const).filter(([, value]) => value !== 0);
    if (entries.length > 0) deltas[id] = Object.fromEntries(entries);
  });
  return { base, deltas };
}

/** 한 능력이 실제로 쓰는 가중치 (공통 + 보정) */
export function sideWeights(model: ArrayLike<number>, index: number): Float64Array {
  const dims = WEIGHT_KEYS.length;
  const weights = Float64Array.from({ length: dims }, (_, j) => model[j]);
  if (index >= 0) for (let j = 0; j < dims; j++) weights[j] += model[(1 + index) * dims + j];
  return weights;
}

const centrality = (sq: number) => 3.5 - Math.max(Math.abs(fileOf(sq) - 3.5), Math.abs(rankOf(sq) - 3.5));

/** 시작 랭크에서 몇 칸 전진했는지 */
const pawnAdvance = (color: Color, sq: number) => (color === 'w' ? rankOf(sq) - 1 : 6 - rankOf(sq));

/** 색별·파일별 (왕족이 아닌) 폰 랭크 목록 */
function pawnFiles(state: GameState): Record<Color, number[][]> {
  const files: Record<Color, number[][]> = { w: Array.from({ length: 8 }, () => []), b: Array.from({ length: 8 }, () => []) };
  state.board.forEach((piece, sq) => {
    if (piece?.type === 'p' && !piece.royal) files[piece.color][fileOf(sq)].push(rankOf(sq));
  });
  return files;
}

function isPassed(files: Record<Color, number[][]>, color: Color, sq: number): boolean {
  const file = fileOf(sq);
  const rank = rankOf(sq);
  const enemy = files[color === 'w' ? 'b' : 'w'];
  for (let f = Math.max(0, file - 1); f <= Math.min(7, file + 1); f++) {
    if (enemy[f].some((r) => (color === 'w' ? r > rank : r < rank))) return false;
  }
  return true;
}

function addSide(out: Float64Array, state: GameState, color: Color, files: Record<Color, number[][]>, sign = 1) {
  const { rules, meter, abilityId } = state.players[color];
  let royals = 0;
  let bishops = 0;

  const { board } = state;
  for (let sq = 0; sq < board.length; sq++) {
    const piece = board[sq];
    if (!piece || piece.color !== color) continue;
    const center = centrality(sq);

    if (piece.type === 'k') {
      if (!piece.royal) out[I.promotedKing] += sign;
      else out[I.royalKingCenter] += sign * center;
    } else {
      out[I.piece[piece.type]] += sign;
    }
    if (piece.enhanced) {
      const enhanced = I.enhanced[piece.type];
      if (enhanced !== undefined) out[enhanced] += sign;
    }
    if (isRoyal(piece, rules)) royals++;

    switch (piece.type) {
      case 'p': {
        const advance = pawnAdvance(color, sq);
        out[I.pawnAdvance] += sign * advance;
        if (center >= 2) out[I.pawnCenter] += sign;
        if (!piece.royal && isPassed(files, color, sq)) {
          out[I.passedPawn] += sign;
          out[I.passedPawnAdvance] += sign * advance;
        }
        break;
      }
      case 'n':
        out[I.knightCenter] += sign * center;
        break;
      case 'b':
        out[I.bishopCenter] += sign * center;
        bishops++;
        break;
      case 'q':
        out[I.queenCenter] += sign * center;
        break;
      case 'r':
        if (files[color][fileOf(sq)].length === 0) out[I.rookOpenFile] += sign;
        break;
    }
  }

  for (const ranks of files[color]) {
    if (ranks.length > 1) out[I.doubledPawn] += sign * (ranks.length - 1);
  }
  if (bishops >= 2) out[I.bishopPair] += sign;
  if (royals > 1) out[I.extraRoyal] += sign * (royals - 1);
  // 여제: 킹이 왕족에서 풀려 자유롭게 싸울 수 있고 체크가 없다
  if (rules.queensRoyal) out[I.empressActive] += sign;
  if (abilityId) {
    out[INDEX[`resource.${abilityId}`]] += sign * meter.resource;
    out[I.cooldown] += sign * meter.cooldown;
  }
  if (isInCheck(state, color)) out[I.inCheck] += sign;
}

/** 국면의 항목값 (백 − 흑). 모든 진영이 같은 가중치를 쓸 때의 평가용. out을 넘기면 재사용한다 */
export function extractFeatures(state: GameState, out: Float64Array = new Float64Array(WEIGHT_KEYS.length)): Float64Array {
  out.fill(0);
  const files = pawnFiles(state);
  addSide(out, state, 'w', files, 1);
  addSide(out, state, 'b', files, -1);
  return out;
}

/** 진영별 항목값 (둘 다 양수 부호). 백 − 흑 = extractFeatures */
export function extractSideFeatures(
  state: GameState,
  white: Float64Array = new Float64Array(WEIGHT_KEYS.length),
  black: Float64Array = new Float64Array(WEIGHT_KEYS.length),
): { white: Float64Array; black: Float64Array } {
  white.fill(0);
  black.fill(0);
  const files = pawnFiles(state);
  addSide(white, state, 'w', files);
  addSide(black, state, 'b', files);
  return { white, black };
}

export const dot = (weights: ArrayLike<number>, features: ArrayLike<number>) => {
  let sum = 0;
  for (let i = 0; i < features.length; i++) sum += weights[i] * features[i];
  return sum;
};

/** 현재 적용된 모델 벡터 (공통 + 능력별 보정) */
export const ACTIVE_MODEL = modelVector(WEIGHTS, ABILITY_WEIGHTS);

/** 능력별로 미리 합쳐 둔 가중치 (-1 = 능력 없음) */
const ACTIVE_BY_ABILITY = new Map<number, Float64Array>([-1, ...ABILITY_IDS.map((_, i) => i)].map((index) => [index, sideWeights(ACTIVE_MODEL, index)]));

export const activeWeights = (abilityId: string | null): Float64Array => ACTIVE_BY_ABILITY.get(abilityIndex(abilityId))!;
