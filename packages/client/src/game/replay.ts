import type { Board, Piece, PieceChange } from '@hyperchess/engine';

/**
 * 이벤트의 보드 변화를 거꾸로 적용 (시간 역행 역재생용).
 * 위치 교환처럼 서로의 칸을 차지하는 경우를 위해 먼저 모두 들어낸 뒤 배치한다.
 */
export function revertChanges(board: Board, changes: readonly PieceChange[]): Board {
  const next: (Piece | null)[] = board.slice();
  const squareOf = (id: string) => next.findIndex((piece) => piece?.id === id);
  const lifted: { piece: Piece; square: number }[] = [];

  for (const change of changes) {
    if (change.type === 'move') {
      const at = squareOf(change.pieceId);
      const piece = next[at];
      if (at < 0 || !piece) continue;
      next[at] = null;
      lifted.push({ piece, square: change.from });
    } else if (change.type === 'add') {
      next[change.square] = null;
    }
  }

  for (const { piece, square } of lifted) next[square] = piece;
  for (const change of changes) {
    if (change.type === 'remove') next[change.square] = change.piece;
  }
  for (const change of changes) {
    if (change.type !== 'transform') continue;
    const at = squareOf(change.after.id);
    if (at >= 0) next[at] = change.before;
  }
  return next;
}
