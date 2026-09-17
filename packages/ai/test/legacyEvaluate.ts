import {
  fileOf,
  isInCheck,
  isRoyal,
  opposite,
  rankOf,
  type Color,
  type GameState,
  type PlayerRules,
  type Piece,
  type PieceType,
} from '@hyperchess/engine';

export const PIECE_VALUE: Readonly<Record<PieceType, number>> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };

/** 여제 규칙의 승급 킹(왕족 아님) 가치 */
const PROMOTED_KING_VALUE = 350;

/** 말 하나의 기물 가치 (왕족 킹은 0, 승급 킹은 별도 값) */
export const materialValue = (piece: Piece, rules: PlayerRules): number =>
  piece.type === 'k' && !isRoyal(piece, rules) ? PROMOTED_KING_VALUE : PIECE_VALUE[piece.type];

/** 강화된 말의 추가 가치 (창기병은 룩 이동이 더해져 퀸급, 팔라딘은 상하좌우 한 칸 이동·공격이 더해짐) */
const ENHANCED_BONUS: Readonly<Record<PieceType, number>> = { p: 140, n: 480, b: 220, r: 130, q: 0, k: 0 };

/** royal이 여럿일 때 하나를 잃는 손해 */
const EXTRA_ROYAL_VALUE = 1200;
const RESOURCE_VALUE = 35;
const COOLDOWN_PENALTY = 5;
const IN_CHECK_PENALTY = 40;
const BISHOP_PAIR_BONUS = 30;
const DOUBLED_PAWN_PENALTY = 12;
const PASSED_PAWN_BASE = 15;
const PASSED_PAWN_PER_RANK = 10;
const ROOK_OPEN_FILE_BONUS = 15;

const centrality = (sq: number) => 3.5 - Math.max(Math.abs(fileOf(sq) - 3.5), Math.abs(rankOf(sq) - 3.5));

/** 시작 랭크에서 몇 칸 전진했는지 */
const pawnAdvance = (color: Color, sq: number) => (color === 'w' ? rankOf(sq) - 1 : 6 - rankOf(sq));

function positional(piece: Piece, sq: number, rules: PlayerRules): number {
  const center = centrality(sq);
  switch (piece.type) {
    case 'p':
      return pawnAdvance(piece.color, sq) * 8 + (center >= 2 ? 10 : 0);
    case 'n':
      return center * 12;
    case 'b':
      return center * 6;
    case 'q':
      return center * 3;
    case 'k':
      return isRoyal(piece, rules) ? -center * 8 : 0;
    default:
      return 0;
  }
}

interface PawnMap {
  /** 파일별 폰 랭크 목록 */
  readonly files: Readonly<Record<Color, number[][]>>;
}

function pawnMap(state: GameState): PawnMap {
  const files: Record<Color, number[][]> = {
    w: Array.from({ length: 8 }, () => []),
    b: Array.from({ length: 8 }, () => []),
  };
  state.board.forEach((piece, sq) => {
    if (piece?.type === 'p' && !piece.royal) files[piece.color][fileOf(sq)].push(rankOf(sq));
  });
  return { files };
}

function isPassed(map: PawnMap, color: Color, sq: number): boolean {
  const file = fileOf(sq);
  const rank = rankOf(sq);
  const enemyFiles = map.files[opposite(color)];
  for (let f = Math.max(0, file - 1); f <= Math.min(7, file + 1); f++) {
    const blocked = enemyFiles[f].some((r) => (color === 'w' ? r > rank : r < rank));
    if (blocked) return false;
  }
  return true;
}

function sideScore(state: GameState, color: Color, map: PawnMap): number {
  const { rules, meter, abilityId } = state.players[color];
  let score = 0;
  let royals = 0;
  let bishops = 0;

  state.board.forEach((piece, sq) => {
    if (!piece || piece.color !== color) return;
    score += materialValue(piece, rules) + positional(piece, sq, rules);
    if (piece.enhanced) score += ENHANCED_BONUS[piece.type];
    if (isRoyal(piece, rules)) royals++;

    switch (piece.type) {
      case 'b':
        bishops++;
        break;
      case 'r':
        if (map.files[color][fileOf(sq)].length === 0) score += ROOK_OPEN_FILE_BONUS;
        break;
      case 'p':
        if (!piece.royal && isPassed(map, color, sq)) score += PASSED_PAWN_BASE + pawnAdvance(color, sq) * PASSED_PAWN_PER_RANK;
        break;
    }
  });

  for (const ranks of map.files[color]) {
    if (ranks.length > 1) score -= (ranks.length - 1) * DOUBLED_PAWN_PENALTY;
  }
  if (bishops >= 2) score += BISHOP_PAIR_BONUS;
  if (royals > 1) score += (royals - 1) * EXTRA_ROYAL_VALUE;
  if (abilityId) score += meter.resource * RESOURCE_VALUE - meter.cooldown * COOLDOWN_PENALTY;
  if (isInCheck(state, color)) score -= IN_CHECK_PENALTY;
  return score;
}

/** color 관점의 정적 평가 (센티폰 단위) */
export function evaluate(state: GameState, color: Color): number {
  const map = pawnMap(state);
  return sideScore(state, color, map) - sideScore(state, opposite(color), map);
}
