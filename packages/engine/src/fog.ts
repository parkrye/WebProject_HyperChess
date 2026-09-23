import { attacks } from './movegen';
import { pseudoLegalMoves, royalSquares } from './rules';
import { opposite, type AbilityParams, type Board, type Color, type GameEvent, type GameState, type PieceChange, type Square } from './types';

/** 능력 인자 중 칸을 가리키는 것 (가려진 칸이면 안개전에서 대상으로 삼을 수 없다) */
const SQUARE_PARAMS: readonly string[] = ['square', 'from', 'to', 'a', 'b'];
/** 가려진 칸 자리에 넣는 값 */
export const HIDDEN_SQUARE = -1;

/**
 * 안개전 시야: 내 말이 있는 칸, 내 말이 갈 수 있는 칸, 그리고 내 왕족을 공격하는 적 말의 칸.
 * 가린 상태(fogView)면 그 시야를 그대로 쓴다.
 */
export function visibleSquares(state: GameState, color: Color): ReadonlySet<Square> {
  if (state.fogView) return new Set(state.fogView.viewer === color ? state.fogView.visible : []);

  const visible = new Set<Square>();
  state.board.forEach((piece, square) => {
    if (piece?.color === color) visible.add(square);
  });
  for (const move of pseudoLegalMoves(state, color)) visible.add(move.to);
  for (const square of checkerSquares(state, color)) visible.add(square);
  return visible;
}

/** color의 왕족을 공격하고 있는 적 말의 칸 */
function checkerSquares(state: GameState, color: Color): Square[] {
  const royals = royalSquares(state, color);
  if (royals.length === 0) return [];
  const enemy = opposite(color);
  const result: Square[] = [];
  state.board.forEach((piece, square) => {
    if (piece?.color !== enemy) return;
    if (royals.some((royal) => attacks(state.board, square, royal, state.walls))) result.push(square);
  });
  return result;
}

/** 안개전에서 능력 대상이 모두 보이는 칸인지 */
export function paramsVisible(params: AbilityParams, visible: ReadonlySet<Square>): boolean {
  return SQUARE_PARAMS.every((key) => params[key] === undefined || visible.has(Number(params[key])));
}

/**
 * viewer 시점으로 가린 상태. 서버가 안개전 상대에게 보내거나 AI가 탐색할 때 쓴다.
 * 가려진 적 말, 반복 판정용 국면 키, 말 구성 지문, 스냅샷의 기록을 지우고, 상대 행동의 가려진 칸은 HIDDEN_SQUARE로 바꾼다.
 */
export function fogView(state: GameState, viewer: Color): GameState {
  if (!state.mode.fog || state.fogView) return state;
  const visible = visibleSquares(state, viewer);
  const hideBoard = (board: Board): Board => board.map((piece, square) => (piece && piece.color !== viewer && !visible.has(square) ? null : piece));

  return {
    ...withoutStartFen(state),
    board: hideBoard(state.board),
    positionKeys: [],
    draw: { ...state.draw, materialKey: '' },
    history: state.history.map((snapshot) => ({
      ...withoutStartFen(snapshot),
      board: hideBoard(snapshot.board),
      positionKeys: [],
      log: [],
      draw: { ...snapshot.draw, materialKey: '' },
    })),
    log: state.log.map((event) => redactEvent(event, viewer, visible)),
    fogView: { viewer, visible: [...visible].sort((a, b) => a - b) },
  };
}

/** 시작 FEN에는 상대가 처음 둔 배치가 그대로 있다 */
function withoutStartFen(state: GameState): GameState {
  if (state.startFen === undefined) return state;
  const copy = { ...state };
  delete (copy as { startFen?: string }).startFen;
  return copy;
}

function redactEvent(event: GameEvent, viewer: Color, visible: ReadonlySet<Square>): GameEvent {
  if (event.color === viewer) return event;
  const seen = (square: Square) => (visible.has(square) ? square : HIDDEN_SQUARE);
  const changes = event.changes.filter((change) => changeVisible(change, viewer, visible));

  if (event.kind === 'move') {
    return { ...event, move: { ...event.move, from: seen(event.move.from), to: seen(event.move.to) }, changes };
  }
  const params: Record<string, number | string> = { ...event.params };
  for (const key of SQUARE_PARAMS) {
    if (params[key] !== undefined) params[key] = seen(Number(params[key]));
  }
  const undone = event.undone?.map((inner) => redactEvent(inner, viewer, visible));
  return { ...event, params, changes, ...(undone ? { undone } : {}) };
}

/** 내 말에 일어난 일은 다 알고, 적 말의 일은 보이는 칸에서 일어난 것만 안다 */
function changeVisible(change: PieceChange, viewer: Color, visible: ReadonlySet<Square>): boolean {
  switch (change.type) {
    case 'move':
      return visible.has(change.from) && visible.has(change.to);
    case 'remove':
    case 'add':
      return change.piece.color === viewer || visible.has(change.square);
    case 'transform':
      return change.after.color === viewer || change.before.color === viewer || visible.has(change.square);
  }
}
