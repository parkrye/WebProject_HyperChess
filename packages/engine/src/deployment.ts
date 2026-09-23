import { rankOf, toSquare } from './square';
import type { Color, PieceType, Square } from './types';

/** 한 색의 배치: 칸 → 말 종류 */
export type Placement = ReadonlyArray<{ readonly square: Square; readonly type: PieceType }>;

/** 징병전 예산. 표준 배치의 전력(폰 8 · 나이트 2 · 비숍 2 · 룩 2 · 퀸 1)과 같다 */
export const DRAFT_BUDGET = 39;
/** 징병 가격. 킹은 사지 않고 처음부터 있다 */
export const DRAFT_COST: Readonly<Record<Exclude<PieceType, 'k'>, number>> = { p: 1, n: 3, b: 3, r: 5, q: 9 };
/** 배치할 수 있는 줄 수 (첫 줄은 모든 말, 나머지는 폰만) */
export const DRAFT_RANKS = 3;

const KING_FILE = 4;
const BACK_RANK: Readonly<Record<Color, number>> = { w: 0, b: 7 };
const STANDARD_BACK: readonly PieceType[] = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];

/** 색 기준 줄 번호 (0 = 자기 첫 줄) */
export const relativeRank = (square: Square, color: Color): number => (color === 'w' ? rankOf(square) : 7 - rankOf(square));

/** 색 기준 줄·파일 → 칸 */
export const deploySquare = (color: Color, file: number, rank: number): Square => toSquare(file, color === 'w' ? rank : 7 - rank);

export const standardPlacement = (color: Color): Placement => [
  ...STANDARD_BACK.map((type, file) => ({ square: deploySquare(color, file, 0), type })),
  ...Array.from({ length: 8 }, (_, file) => ({ square: deploySquare(color, file, 1), type: 'p' as const })),
];

/** 징병 시작 상태: 킹만 첫 줄 가운데에 있다 */
export const kingOnlyPlacement = (color: Color): Placement => [{ square: deploySquare(color, KING_FILE, 0), type: 'k' }];

export const placementCost = (placement: Placement): number =>
  placement.reduce((sum, { type }) => sum + (type === 'k' ? 0 : DRAFT_COST[type]), 0);

/** 징병 배치 규칙 위반 사유. 문제가 없으면 null */
export function draftError(color: Color, placement: Placement): string | null {
  const squares = new Set<Square>();
  let kings = 0;
  for (const { square, type } of placement) {
    if (!Number.isInteger(square) || square < 0 || square > 63) return '칸이 잘못되었습니다';
    if (squares.has(square)) return '한 칸에 말을 두 개 둘 수 없습니다';
    squares.add(square);
    const rank = relativeRank(square, color);
    if (rank >= DRAFT_RANKS) return `자기 진영 ${DRAFT_RANKS}줄 안에만 둘 수 있습니다`;
    if (type === 'k') {
      kings++;
      if (rank !== 0) return '킹은 첫 줄에 있어야 합니다';
      continue;
    }
    if (!(type in DRAFT_COST)) return '알 수 없는 말입니다';
    if (rank > 0 && type !== 'p') return '둘째·셋째 줄에는 폰만 둘 수 있습니다';
  }
  if (kings !== 1) return '킹은 하나여야 합니다';
  if (placementCost(placement) > DRAFT_BUDGET) return `예산(${DRAFT_BUDGET})을 넘었습니다`;
  return null;
}

/**
 * 혼돈 배치: 표준 배치와 같은 16칸에 킹(첫 줄 무작위 파일)을 빼고 모든 말을 무작위로 정한다.
 * random은 [0, 1) 난수. 기록에는 결과 FEN이 남으므로 재현용 시드는 필요 없다
 */
export function chaosPlacement(color: Color, random: () => number = Math.random): Placement {
  const pool: readonly Exclude<PieceType, 'k'>[] = ['p', 'n', 'b', 'r', 'q'];
  const kingFile = Math.floor(random() * 8);
  const result: { square: Square; type: PieceType }[] = [];
  for (let rank = 0; rank < 2; rank++) {
    for (let file = 0; file < 8; file++) {
      const type = rank === 0 && file === kingFile ? 'k' : pool[Math.floor(random() * pool.length)];
      result.push({ square: deploySquare(color, file, rank), type });
    }
  }
  return result;
}

/** 양쪽 배치로 시작 FEN을 만든다. 캐슬링은 킹·룩이 표준 자리에 있을 때만 된다 */
export function placementFen(white: Placement, black: Placement): string {
  const board: (string | null)[] = new Array(64).fill(null);
  const put = (color: Color, placement: Placement) => {
    for (const { square, type } of placement) board[square] = color === 'w' ? type.toUpperCase() : type;
  };
  put('w', white);
  put('b', black);

  const rows: string[] = [];
  for (let rank = 7; rank >= 0; rank--) {
    let row = '';
    let empty = 0;
    for (let file = 0; file < 8; file++) {
      const letter = board[toSquare(file, rank)];
      if (!letter) {
        empty++;
        continue;
      }
      if (empty) row += String(empty);
      empty = 0;
      row += letter;
    }
    if (empty) row += String(empty);
    rows.push(row);
  }

  const castling = (['w', 'b'] as const)
    .flatMap((color) => {
      const back = BACK_RANK[color];
      const at = (file: number) => board[toSquare(file, back)];
      const king = color === 'w' ? 'K' : 'k';
      const rook = color === 'w' ? 'R' : 'r';
      if (at(KING_FILE) !== king) return [];
      return [at(7) === rook ? king : '', at(0) === rook ? (color === 'w' ? 'Q' : 'q') : ''];
    })
    .join('');
  return `${rows.join('/')} w ${castling || '-'} - 0 1`;
}

