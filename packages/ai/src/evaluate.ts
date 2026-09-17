import { isRoyal, type Color, type GameState, type Piece, type PieceType, type PlayerRules } from '@hyperchess/engine';
import { activeWeights, dot, extractSideFeatures, WEIGHT_KEYS } from './features';

/** 수 정렬·델타 가지치기용 고정 기물 가치 (평가 가중치와 별개) */
export const PIECE_VALUE: Readonly<Record<PieceType, number>> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };

/** 여제 규칙의 승급 킹(왕족 아님) 가치 */
const PROMOTED_KING_VALUE = 350;

/**
 * 말 하나의 기물 가치 (왕족 킹은 0, 왕족에서 풀린 킹은 별도 값).
 *
 * 원시 필드 piece.royal 이 아니라 규칙을 아는 isRoyal 을 봐야 한다. 여제를 켜면 퀸만 왕족이 되고
 * 킹은 자유로운 전투 기물이 되는데, 원시 필드는 그대로 true 라 킹을 계속 0 으로 세게 된다.
 * 그러면 여제가 주는 이득 자체가 평가에서 지워진다.
 */
export const materialValue = (piece: Piece, rules: PlayerRules): number =>
  piece.type === 'k' && !isRoyal(piece, rules) ? PROMOTED_KING_VALUE : PIECE_VALUE[piece.type];

/** 탐색 중 매번 새로 만들지 않도록 재사용하는 항목값 버퍼 */
const whiteBuffer = new Float64Array(WEIGHT_KEYS.length);
const blackBuffer = new Float64Array(WEIGHT_KEYS.length);

/** color 관점의 정적 평가 (센티폰 단위). 진영마다 자기 능력의 가중치(공통 + 보정)를 쓴다 */
export function evaluate(state: GameState, color: Color): number {
  const { white, black } = extractSideFeatures(state, whiteBuffer, blackBuffer);
  const score = dot(activeWeights(state.players.w.abilityId), white) - dot(activeWeights(state.players.b.abilityId), black);
  return color === 'w' ? score : -score;
}
