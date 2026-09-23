import { isWall } from '../movegen';
import { isInCheck } from '../rules';
import { offset, pawnDirection, promotionRank, rankOf } from '../square';
import type { Color, GameState, Piece, PieceType, Square } from '../types';
import { BALANCE, COSTS } from './balance';
import type { AbilityDefinition } from './types';

/** 앞칸이 빈(성벽도 없는) 폰들. 사용 전 보드 기준이라 바로 앞 폰이 전진해도 뒤 폰은 따라가지 않는다 */
function advancingPawns(state: GameState, color: Color): { from: Square; to: Square; pawn: Piece }[] {
  const result: { from: Square; to: Square; pawn: Piece }[] = [];
  state.board.forEach((piece, from) => {
    if (!piece || piece.color !== color || piece.type !== 'p') return;
    const to = offset(from, 0, pawnDirection(color));
    if (to === null || state.board[to] || isWall(state.walls, to)) return;
    result.push({ from, to, pawn: piece });
  });
  return result;
}

export const march: AbilityDefinition = {
  id: 'march',
  name: '총진군',
  description: '수를 놓기 전에, 앞칸이 빈 자신의 폰이 모두 한 칸씩 전진한다(잡기 없음). 마지막 랭크에 도달한 폰은 퀸으로 프로모션한다. 전진 후 자신이 체크 상태가 되면 쓸 수 없다.',
  timing: 'beforeMove',
  balance: BALANCE.march,
  cost: () => COSTS.march,

  candidates(state, color) {
    if (advancingPawns(state, color).length === 0) return [];
    // 수 전 능력은 엔진이 자기 체크를 검사하지 않으므로 여기서 거른다
    // 안개전은 자기 체크를 막지 않는다 (막으면 가려진 공격이 드러난다)
    if (state.mode.fog) return [{}];
    return isInCheck(march.apply(state, color, {}), color) ? [] : [{}];
  },

  apply(state, color, _params) {
    const board = state.board.slice();
    const queen: PieceType = state.players[color].rules.noQueenPromotion ? 'k' : 'q';
    for (const { from, to, pawn } of advancingPawns(state, color)) {
      board[from] = null;
      // 계승자 폰(왕족)은 프로모션하지 않는다
      const promotes = rankOf(to) === promotionRank(color) && !pawn.royal;
      board[to] = promotes
        ? { ...pawn, type: queen, moved: true, enhanced: false, ...(queen === 'k' ? { title: 'promoted' as const } : {}) }
        : { ...pawn, moved: true };
    }
    return { ...state, board };
  },
};
