import { fileOf, isInCheck, isRoyal, listAbilities, rankOf, type Color, type GameState } from '@hyperchess/engine';
import { WEIGHTS } from './weights';

/**
 * 평가 항목 목록. 평가 점수 = Σ 가중치 × 항목값 (백 − 흑)이라 선형이며,
 * 튜닝 도구는 같은 항목값으로 가중치를 학습한다.
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

function addSide(out: Float64Array, state: GameState, color: Color, files: Record<Color, number[][]>, sign: number) {
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

/** 국면의 항목값 (백 − 흑). out을 넘기면 재사용한다 */
export function extractFeatures(state: GameState, out: Float64Array = new Float64Array(WEIGHT_KEYS.length)): Float64Array {
  out.fill(0);
  const files = pawnFiles(state);
  addSide(out, state, 'w', files, 1);
  addSide(out, state, 'b', files, -1);
  return out;
}

export const dot = (weights: ArrayLike<number>, features: ArrayLike<number>) => {
  let sum = 0;
  for (let i = 0; i < features.length; i++) sum += weights[i] * features[i];
  return sum;
};

/** 현재 적용된 가중치 벡터 */
export const ACTIVE_WEIGHTS = weightVector(WEIGHTS);
