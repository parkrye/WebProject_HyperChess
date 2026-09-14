import { fileOf, fromAlgebraic, pawnStartRank, rankOf, toAlgebraic, toSquare } from './square';
import type { Board, Color, EnPassant, GameState, Piece, PieceType } from './types';

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export interface ParsedFen {
  readonly board: Board;
  readonly turn: Color;
  readonly enPassant: EnPassant | null;
  readonly halfmoveClock: number;
  readonly fullmove: number;
}

const CASTLING_ROOK_SQUARES: Record<string, number> = { K: 7, Q: 0, k: 63, q: 56 };

export function parseFen(fen: string): ParsedFen {
  const [placement, turn = 'w', castling = '-', ep = '-', half = '0', full = '1'] = fen.trim().split(/\s+/);
  const rows = placement.split('/');
  if (rows.length !== 8) throw new Error(`Invalid FEN: ${fen}`);

  const counters = new Map<string, number>();
  const nextId = (color: Color, type: PieceType) => {
    const key = color + type;
    const count = counters.get(key) ?? 0;
    counters.set(key, count + 1);
    return `${key}${count}`;
  };

  const board: (Piece | null)[] = new Array(64).fill(null);
  rows.forEach((row, rowIndex) => {
    const rank = 7 - rowIndex;
    let file = 0;
    for (const char of row) {
      if (/\d/.test(char)) {
        file += Number(char);
        continue;
      }
      const color: Color = char === char.toUpperCase() ? 'w' : 'b';
      const type = char.toLowerCase() as PieceType;
      const sq = toSquare(file, rank);
      board[sq] = {
        id: nextId(color, type),
        type,
        color,
        moved: !(type === 'p' && rank === pawnStartRank(color)),
        enhanced: false,
        royal: type === 'k',
      };
      file++;
    }
  });

  applyCastlingRights(board, castling);

  const sideToMove: Color = turn === 'b' ? 'b' : 'w';
  let enPassant: EnPassant | null = null;
  if (ep !== '-') {
    const target = fromAlgebraic(ep);
    const pawnColor: Color = sideToMove === 'w' ? 'b' : 'w';
    const captureSquare = toSquare(fileOf(target), rankOf(target) + (pawnColor === 'w' ? 1 : -1));
    enPassant = { target, captureSquare, pawnColor };
  }

  return { board, turn: sideToMove, enPassant, halfmoveClock: Number(half), fullmove: Number(full) };
}

function applyCastlingRights(board: (Piece | null)[], castling: string) {
  for (const right of castling === '-' ? '' : castling) {
    const rookSquare = CASTLING_ROOK_SQUARES[right];
    if (rookSquare === undefined) continue;
    const kingSquare = right === right.toUpperCase() ? 4 : 60;
    const rook = board[rookSquare];
    const king = board[kingSquare];
    if (rook?.type === 'r') board[rookSquare] = { ...rook, moved: false };
    if (king?.type === 'k') board[kingSquare] = { ...king, moved: false };
  }
}

export function toFen(state: Pick<GameState, 'board' | 'turn' | 'enPassant' | 'halfmoveClock' | 'fullmove'>): string {
  const rows: string[] = [];
  for (let rank = 7; rank >= 0; rank--) {
    let row = '';
    let empty = 0;
    for (let file = 0; file < 8; file++) {
      const piece = state.board[toSquare(file, rank)];
      if (!piece) {
        empty++;
        continue;
      }
      if (empty) row += String(empty);
      empty = 0;
      row += piece.color === 'w' ? piece.type.toUpperCase() : piece.type;
    }
    if (empty) row += String(empty);
    rows.push(row);
  }

  const canCastle = (kingSq: number, rookSq: number) => {
    const king = state.board[kingSq];
    const rook = state.board[rookSq];
    return !!king && king.type === 'k' && !king.moved && !!rook && rook.type === 'r' && !rook.moved && rook.color === king.color;
  };
  const castling = [
    canCastle(4, 7) ? 'K' : '',
    canCastle(4, 0) ? 'Q' : '',
    canCastle(60, 63) ? 'k' : '',
    canCastle(60, 56) ? 'q' : '',
  ].join('') || '-';

  const ep = state.enPassant ? toAlgebraic(state.enPassant.target) : '-';
  return [rows.join('/'), state.turn, castling, ep, state.halfmoveClock, state.fullmove].join(' ');
}
