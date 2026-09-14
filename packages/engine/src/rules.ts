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
  return piece.royal || (rules.queensRoyal && piece.type === 'q');
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

export function anyRoyalAttacked(state: Pick<GameState, 'board' | 'players'>, color: Color): boolean {
  const enemy = opposite(color);
  return royalSquares(state, color).some((sq) => isSquareAttacked(state.board, sq, enemy));
}

export function isInCheck(state: Pick<GameState, 'board' | 'players'>, color: Color): boolean {
  return usesCheckRule(state, color) && anyRoyalAttacked(state, color);
}

function moveGenContext(state: GameState, color: Color): MoveGenContext {
  return {
    board: state.board,
    enPassant: state.enPassant,
    noQueenPromotion: state.players[color].rules.noQueenPromotion,
    castlingRequiresSafety: usesCheckRule(state, color),
  };
}

export function pseudoLegalMoves(state: GameState, color: Color): GeneratedMove[] {
  const ctx = moveGenContext(state, color);
  const isAttacked = (sq: Square, by: Color) => isSquareAttacked(state.board, sq, by);
  const moves: GeneratedMove[] = [];
  state.board.forEach((piece, sq) => {
    if (piece && piece.color === color) moves.push(...pseudoMovesFrom(ctx, sq, isAttacked));
  });
  return moves;
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
    ? { ...piece, type: move.promotion, moved: true, enhanced: false }
    : { ...piece, moved: true };

  const enPassant: EnPassant | null =
    move.kind === 'double'
      ? { target: move.from + pawnDirection(piece.color) * 8, captureSquare: move.to, pawnColor: piece.color }
      : null;

  return { board: next, enPassant, captured: captured ?? null, irreversible: piece.type === 'p' || !!captured };
}

/** 이동 후 자신이 체크 상태가 되지 않는 이동만 반환 */
export function legalMoves(state: GameState, color: Color = state.turn): GeneratedMove[] {
  return pseudoLegalMoves(state, color).filter((move) => {
    const outcome = executeMove(state.board, move);
    return !isInCheck({ board: outcome.board, players: state.players }, color);
  });
}

export function findLegalMove(state: GameState, move: Move): GeneratedMove | undefined {
  return legalMoves(state).find(
    (candidate) => candidate.from === move.from && candidate.to === move.to && candidate.promotion === move.promotion,
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
  return a.type === b.type && a.enhanced === b.enhanced && a.royal === b.royal && a.title === b.title;
}
