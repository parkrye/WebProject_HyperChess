import { isSquareAttacked, pseudoMovesFrom, type MoveGenContext } from './movegen';
import { fileOf, pawnDirection, rankOf, toSquare } from './square';
import {
  opposite,
  type Board,
  type Color,
  type EnPassant,
  type GameState,
  type GeneratedMove,
  type Move,
  type Piece,
  type PieceChange,
  type PlayerRules,
  type Square,
} from './types';

export function isRoyal(piece: Piece, rules: PlayerRules): boolean {
  // 여제 규칙: 킹은 왕족에서 빠지고 퀸만 왕족이 된다
  return rules.queensRoyal ? piece.type === 'q' : piece.royal;
}

export function royalSquares(state: Pick<GameState, 'board' | 'players'>, color: Color): Square[] {
  const rules = state.players[color].rules;
  const result: Square[] = [];
  state.board.forEach((piece, sq) => {
    if (piece && piece.color === color && isRoyal(piece, rules)) result.push(sq);
  });
  return result;
}

/**
 * 체크 규칙 적용 여부.
 * royal이 하나뿐일 때만 체크/체크메이트가 존재하고,
 * 여러 개(계승자)이거나 여제 규칙이면 모두 잡혀야 패배하는 소멸 규칙을 따른다.
 */
export function usesCheckRule(state: Pick<GameState, 'board' | 'players'>, color: Color): boolean {
  if (state.players[color].rules.queensRoyal) return false;
  return royalSquares(state, color).length === 1;
}

export function anyRoyalAttacked(state: Pick<GameState, 'board' | 'walls' | 'players'>, color: Color): boolean {
  const enemy = opposite(color);
  return royalSquares(state, color).some((sq) => isSquareAttacked(state.board, sq, enemy, state.walls));
}

export function isInCheck(state: Pick<GameState, 'board' | 'walls' | 'players'>, color: Color): boolean {
  if (state.players[color].rules.queensRoyal) return false;
  const royals = royalSquares(state, color);
  return royals.length === 1 && isSquareAttacked(state.board, royals[0], opposite(color), state.walls);
}

function moveGenContext(state: GameState, color: Color): MoveGenContext {
  return {
    board: state.board,
    walls: state.walls,
    enPassant: state.enPassant,
    noQueenPromotion: state.players[color].rules.noQueenPromotion,
    castlingRequiresSafety: usesCheckRule(state, color),
  };
}

function boardAttackQuery(state: GameState) {
  return (sq: Square, by: Color) => isSquareAttacked(state.board, sq, by, state.walls);
}

export function pseudoLegalMoves(state: GameState, color: Color): GeneratedMove[] {
  const ctx = moveGenContext(state, color);
  const isAttacked = boardAttackQuery(state);
  const moves: GeneratedMove[] = [];
  state.board.forEach((piece, sq) => {
    if (piece && piece.color === color) moves.push(...pseudoMovesFrom(ctx, sq, isAttacked));
  });
  return moves;
}

/**
 * 이동 후 자기 체크 여부 검사기. 수는 자기 royal의 수를 바꾸지 못하므로
 * royal 위치를 한 번만 계산하고, 체크 규칙이 없으면 검사를 생략한다.
 */
function legalityChecker(state: GameState, color: Color): (move: GeneratedMove) => boolean {
  if (state.players[color].rules.queensRoyal) return () => true;
  const royals = royalSquares(state, color);
  if (royals.length !== 1) return () => true;

  const royal = royals[0];
  const enemy = opposite(color);
  return (move) => {
    const { board } = executeMove(state.board, move);
    return !isSquareAttacked(board, move.from === royal ? move.to : royal, enemy, state.walls);
  };
}

function isLegal(state: GameState, color: Color, move: GeneratedMove): boolean {
  return legalityChecker(state, color)(move);
}

/** 합법 수가 하나라도 있는지 (전체 목록을 만들지 않고 조기 종료) */
export function hasLegalMove(state: GameState, color: Color = state.turn): boolean {
  const ctx = moveGenContext(state, color);
  const isAttacked = boardAttackQuery(state);
  const legal = legalityChecker(state, color);
  for (let sq = 0; sq < state.board.length; sq++) {
    const piece = state.board[sq];
    if (!piece || piece.color !== color) continue;
    if (pseudoMovesFrom(ctx, sq, isAttacked).some(legal)) return true;
  }
  return false;
}

export interface MoveOutcome {
  readonly board: Board;
  readonly enPassant: EnPassant | null;
  readonly captured: Piece | null;
  readonly irreversible: boolean;
}

export function executeMove(board: Board, move: GeneratedMove): MoveOutcome {
  const next = board.slice();
  const piece = next[move.from];
  if (!piece) throw new Error('No piece on source square');

  let captured = next[move.to];
  next[move.from] = null;

  if (move.kind === 'enPassant') {
    const captureSquare = toSquare(fileOf(move.to), rankOf(move.from));
    captured = next[captureSquare];
    next[captureSquare] = null;
  }

  if (move.kind === 'castle') {
    const backRank = rankOf(move.from);
    const kingSide = fileOf(move.to) === 6;
    const rookFrom = toSquare(kingSide ? 7 : 0, backRank);
    const rookTo = toSquare(kingSide ? 5 : 3, backRank);
    const rook = next[rookFrom];
    next[rookFrom] = null;
    next[rookTo] = rook ? { ...rook, moved: true } : null;
  }

  next[move.to] = move.promotion
    ? { ...piece, type: move.promotion, moved: true, enhanced: false, ...(move.promotion === 'k' ? { title: 'promoted' as const } : {}) }
    : { ...piece, moved: true };

  const enPassant: EnPassant | null =
    move.kind === 'double'
      ? { target: move.from + pawnDirection(piece.color) * 8, captureSquare: move.to, pawnColor: piece.color }
      : null;

  return { board: next, enPassant, captured: captured ?? null, irreversible: piece.type === 'p' || !!captured };
}

/** 이동 후 자신이 체크 상태가 되지 않는 이동만 반환 */
export function legalMoves(state: GameState, color: Color = state.turn): GeneratedMove[] {
  return pseudoLegalMoves(state, color).filter(legalityChecker(state, color));
}

export function findLegalMove(state: GameState, move: Move): GeneratedMove | undefined {
  const color = state.turn;
  if (state.board[move.from]?.color !== color) return undefined;
  const candidates = pseudoMovesFrom(moveGenContext(state, color), move.from, boardAttackQuery(state));
  return candidates.find(
    (candidate) =>
      candidate.to === move.to && candidate.promotion === move.promotion && isLegal(state, color, candidate),
  );
}

/** 두 보드의 차이를 말 id 기준으로 계산 (UI 연출용) */
export function diffBoards(before: Board, after: Board): PieceChange[] {
  const locate = (board: Board) => {
    const map = new Map<string, { piece: Piece; square: Square }>();
    board.forEach((piece, square) => {
      if (piece) map.set(piece.id, { piece, square });
    });
    return map;
  };
  const prev = locate(before);
  const next = locate(after);
  const changes: PieceChange[] = [];

  for (const [id, { piece, square }] of prev) {
    const target = next.get(id);
    if (!target) {
      changes.push({ type: 'remove', piece, square });
      continue;
    }
    if (target.square !== square) changes.push({ type: 'move', pieceId: id, from: square, to: target.square });
    if (!samePieceShape(piece, target.piece)) {
      changes.push({ type: 'transform', before: piece, after: target.piece, square: target.square });
    }
  }
  for (const [id, { piece, square }] of next) {
    if (!prev.has(id)) changes.push({ type: 'add', piece, square });
  }
  return changes;
}

function samePieceShape(a: Piece, b: Piece): boolean {
  return a.type === b.type && a.color === b.color && a.enhanced === b.enhanced && a.royal === b.royal && a.title === b.title;
}
