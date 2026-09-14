import type { Color, Square } from './types';

export const BOARD_SIZE = 8;

export const fileOf = (sq: Square): number => sq % BOARD_SIZE;
export const rankOf = (sq: Square): number => Math.floor(sq / BOARD_SIZE);
export const toSquare = (file: number, rank: number): Square => rank * BOARD_SIZE + file;

export function offset(sq: Square, df: number, dr: number): Square | null {
  const file = fileOf(sq) + df;
  const rank = rankOf(sq) + dr;
  if (file < 0 || file >= BOARD_SIZE || rank < 0 || rank >= BOARD_SIZE) return null;
  return toSquare(file, rank);
}

export function toAlgebraic(sq: Square): string {
  return String.fromCharCode(97 + fileOf(sq)) + String(rankOf(sq) + 1);
}

export function fromAlgebraic(name: string): Square {
  const file = name.charCodeAt(0) - 97;
  const rank = Number(name[1]) - 1;
  if (name.length !== 2 || file < 0 || file >= BOARD_SIZE || !(rank >= 0 && rank < BOARD_SIZE)) {
    throw new Error(`Invalid square: ${name}`);
  }
  return toSquare(file, rank);
}

export const pawnDirection = (color: Color): number => (color === 'w' ? 1 : -1);
export const pawnStartRank = (color: Color): number => (color === 'w' ? 1 : 6);
export const promotionRank = (color: Color): number => (color === 'w' ? 7 : 0);
export const isBackRank = (sq: Square): boolean => rankOf(sq) === 0 || rankOf(sq) === 7;

export type Delta = readonly [number, number];

export const KNIGHT_DELTAS: readonly Delta[] = [
  [1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2],
];
export const KING_DELTAS: readonly Delta[] = [
  [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1],
];
export const ORTHOGONAL_DELTAS: readonly Delta[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
export const DIAGONAL_DELTAS: readonly Delta[] = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

export function neighbors(sq: Square, deltas: readonly Delta[] = KING_DELTAS): Square[] {
  const result: Square[] = [];
  for (const [df, dr] of deltas) {
    const next = offset(sq, df, dr);
    if (next !== null) result.push(next);
  }
  return result;
}
