import { fileOf, isInCheck, isRoyal, opposite, rankOf, type Color, type GameState, type Piece, type PieceType } from '@hyperchess/engine';

export const PIECE_VALUE: Readonly<Record<PieceType, number>> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };

/** 강화된 말의 추가 가치 (창기병은 룩 이동이 더해져 퀸급) */
const ENHANCED_BONUS: Readonly<Record<PieceType, number>> = { p: 140, n: 480, b: 130, r: 130, q: 0, k: 0 };

/** royal이 여럿일 때 하나를 잃는 손해 */
const EXTRA_ROYAL_VALUE = 1200;
const RESOURCE_VALUE = 35;
const COOLDOWN_PENALTY = 5;
const IN_CHECK_PENALTY = 40;

const centrality = (sq: number) => 3.5 - Math.max(Math.abs(fileOf(sq) - 3.5), Math.abs(rankOf(sq) - 3.5));

function positional(piece: Piece, sq: number): number {
  const center = centrality(sq);
  switch (piece.type) {
    case 'p': {
      const advance = piece.color === 'w' ? rankOf(sq) - 1 : 6 - rankOf(sq);
      return advance * 8 + (center >= 2 ? 10 : 0);
    }
    case 'n':
      return center * 12;
    case 'b':
      return center * 6;
    case 'q':
      return center * 3;
    case 'k':
      return piece.royal ? -center * 8 : 0;
    default:
      return 0;
  }
}

function sideScore(state: GameState, color: Color): number {
  const { rules, meter, abilityId } = state.players[color];
  let score = 0;
  let royals = 0;

  state.board.forEach((piece, sq) => {
    if (!piece || piece.color !== color) return;
    score += PIECE_VALUE[piece.type] + positional(piece, sq);
    if (piece.enhanced) score += ENHANCED_BONUS[piece.type];
    if (isRoyal(piece, rules)) royals++;
  });

  if (royals > 1) score += (royals - 1) * EXTRA_ROYAL_VALUE;
  if (abilityId) score += meter.resource * RESOURCE_VALUE - meter.cooldown * COOLDOWN_PENALTY;
  if (isInCheck(state, color)) score -= IN_CHECK_PENALTY;
  return score;
}

/** color 관점의 정적 평가 (센티폰 단위) */
export function evaluate(state: GameState, color: Color): number {
  return sideScore(state, color) - sideScore(state, opposite(color));
}
