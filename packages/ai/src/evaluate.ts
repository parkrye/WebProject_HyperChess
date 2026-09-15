import { type Color, type GameState, type Piece, type PieceType } from '@hyperchess/engine';
import { ACTIVE_WEIGHTS, dot, extractFeatures, WEIGHT_KEYS } from './features';

/** 수 정렬·델타 가지치기용 고정 기물 가치 (평가 가중치와 별개) */
export const PIECE_VALUE: Readonly<Record<PieceType, number>> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };

/** 여제 규칙의 승급 킹(왕족 아님) 가치 */
const PROMOTED_KING_VALUE = 350;

/** 말 하나의 기물 가치 (왕족 킹은 0, 승급 킹은 별도 값) */
export const materialValue = (piece: Piece): number =>
  piece.type === 'k' && !piece.royal ? PROMOTED_KING_VALUE : PIECE_VALUE[piece.type];

/** 탐색 중 매번 새로 만들지 않도록 재사용하는 항목값 버퍼 */
const buffer = new Float64Array(WEIGHT_KEYS.length);

/** color 관점의 정적 평가 (센티폰 단위) = Σ 가중치 × 항목값 */
export function evaluate(state: GameState, color: Color): number {
  const white = dot(ACTIVE_WEIGHTS, extractFeatures(state, buffer));
  return color === 'w' ? white : -white;
}
