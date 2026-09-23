import {
  applyAction,
  concealAbilities,
  fogView,
  IllegalActionError,
  legalMoves,
  opposite,
  visibleSquares,
  type Action,
  type Color,
  type GameState,
  type Square,
} from '@hyperchess/engine';

/** 적 왕족 말 id → 마지막으로 본 칸 */
export type RoyalMemory = Map<string, Square>;

/**
 * AI가 탐색할 국면. 비밀 능력이면 드러나지 않은 상대 능력을 지운다.
 * 안개전이면 color 시점으로 가린 뒤, 안 보이는 적 왕족은 마지막으로 본 칸에 둔다.
 * 왕족이 사라지면 엔진이 곧바로 승패를 내 버리므로 탐색이 성립하지 않기 때문이다.
 * 한 번도 못 본 왕족은 실제 자리에 둔다 (시작 배치의 킹 자리 정도는 안다고 본다).
 */
export function aiSightState(state: GameState, color: Color, memory: RoyalMemory): GameState {
  return concealAbilities(fogSight(state, color, memory), color);
}

function fogSight(state: GameState, color: Color, memory: RoyalMemory): GameState {
  if (!state.mode.fog) return state;
  const view = fogView(state, color);
  const board = view.board.slice();
  const enemy = opposite(color);

  state.board.forEach((piece, square) => {
    if (!piece || piece.color !== enemy || !piece.royal) return;
    if (board[square]?.id === piece.id) {
      memory.set(piece.id, square);
      return;
    }
    const remembered = memory.get(piece.id);
    const spot = remembered !== undefined && !board[remembered] ? remembered : square;
    if (!board[spot]) board[spot] = piece;
  });

  // 시야 표식을 지워야 탐색 중 수를 둘 때마다 엔진이 시야를 새로 계산한다
  const { fogView: _marker, ...rest } = view;
  return { ...rest, board };
}

/** 실제 국면에서 둘 수 있는 행동인지 */
export function isPlayable(state: GameState, action: Action): boolean {
  try {
    applyAction(state, action, Date.now());
    return true;
  } catch (error) {
    if (error instanceof IllegalActionError) return false;
    throw error;
  }
}

/**
 * 가린 국면에서 고른 수가 실제로는 둘 수 없을 때(안 보이던 말에 막힌 폰 전진 등) 대신 둘 수.
 * 보이는 칸으로 가는 수 중 하나를 고른다.
 */
export function fallbackAction(state: GameState): Action | null {
  const visible = visibleSquares(state, state.turn);
  const moves = legalMoves(state).filter((move) => visible.has(move.to));
  if (moves.length === 0) return null;
  const move = moves[Math.floor(Math.random() * moves.length)];
  return { type: 'move', move: { from: move.from, to: move.to, ...(move.promotion ? { promotion: move.promotion } : {}) } };
}
