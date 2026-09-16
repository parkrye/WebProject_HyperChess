import {
  BRAINWASH_NEIGHBORS, COSTS, KING_DELTAS, fileOf, isBackRank, isExposed, isRoyal, isWall, offset, opposite, rankOf,
  type Board, type Color, type GameState, type PieceType, type Square, type Wall,
} from '@hyperchess/engine';

/**
 * 능력별 고유 항목. 자원 게이지만으로는 "지금 이 능력을 쓰면 무엇이 되는가"를 알 수 없어,
 * 능력마다 판을 읽어 그 답을 내는 항목을 따로 둔다.
 * 그 능력을 가진 진영에서만 0이 아니므로 능력별 보정(ABILITY_WEIGHTS) 없이 공통 가중치만 쓴다.
 */
export const ABILITY_FEATURE_KEYS = [
  'revive.best',
  'revive.pending',
  'brainwash.best',
  'brainwash.targets',
  'telekinesis.target',
  'teleport.swap',
] as const;

/** ABILITY_FEATURE_KEYS 안에서의 순번 */
const F = {
  reviveBest: 0,
  revivePending: 1,
  brainwashBest: 2,
  brainwashTargets: 3,
  telekinesisTarget: 4,
  teleportSwap: 5,
} as const;

/**
 * 능력 항목 전용 고정 기물 가치 (폰 = 1).
 * 학습되는 가중치를 쓰면 항목값이 가중치에 의존해 선형 모델이 깨지므로 고정값을 쓴다.
 */
const VALUE: Readonly<Record<PieceType, number>> = { p: 1, n: 3.2, b: 3.3, r: 5, q: 9, k: 0 };

const centrality = (sq: Square) => 3.5 - Math.max(Math.abs(fileOf(sq) - 3.5), Math.abs(rankOf(sq) - 3.5));

/*
 * 아래 세 함수는 엔진의 neighbors()·trappingSquares()와 같은 8방향을 보지만 배열을 만들지 않는다.
 * 평가는 탐색 노드마다 불리므로 한 번의 할당도 처리량에 그대로 드러난다.
 * 엔진 함수와 결과가 같다는 것은 test/abilityFeatures.test.ts가 확인한다.
 */

/** 8방향 인접 칸에 color의 말이 need개 이상인지 (= isTrapped). 채워지는 즉시 끝낸다 */
export function isSurrounded(board: Board, sq: Square, color: Color, need: number = BRAINWASH_NEIGHBORS): boolean {
  let count = 0;
  for (const [df, dr] of KING_DELTAS) {
    const next = offset(sq, df, dr);
    if (next !== null && board[next]?.color === color && ++count >= need) return true;
  }
  return false;
}

/** 8방향 인접 칸에 color의 말이 하나라도 있는지 */
export function touchesColor(board: Board, sq: Square, color: Color): boolean {
  for (const [df, dr] of KING_DELTAS) {
    const next = offset(sq, df, dr);
    if (next !== null && board[next]?.color === color) return true;
  }
  return false;
}

/** 8방향 인접 칸에 성벽이 아닌 빈칸이 하나라도 있는지 */
export function hasEmptyNeighbor(board: Board, walls: readonly Wall[], sq: Square): boolean {
  for (const [df, dr] of KING_DELTAS) {
    const next = offset(sq, df, dr);
    if (next !== null && !board[next] && !isWall(walls, next)) return true;
  }
  return false;
}

/** 부활: 되살린 말을 놓을 빈칸이 하나라도 있는지 (자기 말과 인접한 빈칸) */
function hasReviveSlot(state: GameState, color: Color): boolean {
  const { board } = state;
  for (let sq = 0; sq < board.length; sq++) {
    if (board[sq] || isWall(state.walls, sq)) continue;
    if (touchesColor(board, sq, color)) return true;
  }
  return false;
}

/** 부활: 지금 자원으로 되살릴 수 있는 최고 기물 가치와, 자원을 더 모으면 되살릴 수 있는 최고 가치 */
function addRevive(out: Float64Array, base: number, state: GameState, color: Color, sign: number, resource: number): void {
  let best = 0;
  let pending = 0;
  for (const piece of state.captured[color]) {
    const value = VALUE[piece.type];
    if (value > pending) pending = value;
    if (value > best && COSTS.revive[piece.type] <= resource) best = value;
  }
  // 놓을 자리가 없으면 자원이 차 있어도 지금은 쓸 수 없다
  if (best > 0 && !hasReviveSlot(state, color)) best = 0;
  out[base + F.reviveBest] += sign * best;
  out[base + F.revivePending] += sign * pending;
}

/** 세뇌: 갇힌 적 말 중 지금 자원으로 뺏을 수 있는 최고 가치와, 갇힌 적 말 수 */
function addBrainwash(out: Float64Array, base: number, state: GameState, color: Color, sign: number, resource: number): void {
  const enemyRules = state.players[opposite(color)].rules;
  const enemy = opposite(color);
  const { board } = state;
  let best = 0;
  let targets = 0;
  for (let sq = 0; sq < board.length; sq++) {
    const piece = board[sq];
    if (!piece || piece.color !== enemy || piece.type === 'k' || isRoyal(piece, enemyRules)) continue;
    if (!isSurrounded(board, sq, color)) continue;
    targets++;
    const value = VALUE[piece.type];
    if (value > best && COSTS.brainwash[piece.type] <= resource) best = value;
  }
  out[base + F.brainwashBest] += sign * best;
  out[base + F.brainwashTargets] += sign * targets;
}

/** 염동력: 밀어낼 수 있는 노출된 적 말 중 최고 가치 (인접 빈칸이 있어야 민다) */
function addTelekinesis(out: Float64Array, base: number, state: GameState, color: Color, sign: number): void {
  const enemy = opposite(color);
  const { board } = state;
  let best = 0;
  for (let sq = 0; sq < board.length; sq++) {
    const piece = board[sq];
    if (!piece || piece.color !== enemy) continue;
    const value = VALUE[piece.type];
    if (value <= best) continue;
    if (!isExposed(board, sq)) continue;
    if (!hasEmptyNeighbor(board, state.walls, sq)) continue;
    best = value;
  }
  out[base + F.telekinesisTarget] += sign * best;
}

/**
 * 순간 이동: 자기 말 두 개를 맞바꿔 얻는 최대 위치 이득.
 * 값이 큰 말을 중앙으로, 작은 말을 바깥으로 보내는 교환일수록 이득이 크다고 본다.
 */
function addTeleport(out: Float64Array, base: number, state: GameState, color: Color, sign: number): void {
  const { board } = state;
  const value: number[] = [];
  const center: number[] = [];
  const isPawn: boolean[] = [];
  const backRank: boolean[] = [];
  for (let sq = 0; sq < board.length; sq++) {
    const piece = board[sq];
    if (piece?.color !== color) continue;
    value.push(VALUE[piece.type]);
    center.push(centrality(sq));
    isPawn.push(piece.type === 'p');
    backRank.push(isBackRank(sq));
  }

  let best = 0;
  for (let i = 0; i < value.length; i++) {
    for (let j = i + 1; j < value.length; j++) {
      if (value[i] === value[j]) continue;
      if ((isPawn[i] && backRank[j]) || (isPawn[j] && backRank[i])) continue;
      const gain = (value[i] - value[j]) * (center[j] - center[i]);
      if (gain > best) best = gain;
    }
  }
  out[base + F.teleportSwap] += sign * best;
}

/** 진영의 능력 고유 항목값을 더한다. base는 ABILITY_FEATURE_KEYS 첫 항목의 번호 */
export function addAbilityFeatures(out: Float64Array, base: number, state: GameState, color: Color, sign: number): void {
  const { abilityId, meter } = state.players[color];
  switch (abilityId) {
    case 'revive':
      return addRevive(out, base, state, color, sign, meter.resource);
    case 'brainwash':
      return addBrainwash(out, base, state, color, sign, meter.resource);
    case 'telekinesis':
      return addTelekinesis(out, base, state, color, sign);
    case 'teleport':
      return addTeleport(out, base, state, color, sign);
    default:
      return;
  }
}
