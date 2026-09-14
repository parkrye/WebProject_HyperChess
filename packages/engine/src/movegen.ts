import {
  DIAGONAL_DELTAS,
  KING_DELTAS,
  KNIGHT_DELTAS,
  ORTHOGONAL_DELTAS,
  offset,
  pawnDirection,
  pawnStartRank,
  promotionRank,
  rankOf,
  toSquare,
  type Delta,
} from './square';
import type { Board, Color, EnPassant, GeneratedMove, Piece, PieceType, Square } from './types';

const PROMOTION_PIECES: readonly PieceType[] = ['q', 'r', 'b', 'n'];

export interface MoveGenContext {
  readonly board: Board;
  readonly enPassant: EnPassant | null;
  readonly noQueenPromotion: boolean;
  /** 캐슬링 경로 공격 검사 여부 (체크 규칙을 쓰는 플레이어만) */
  readonly castlingRequiresSafety: boolean;
}

/** 강화 폰(중보병)과 계승자는 킹의 움직임을 추가로 가진다 */
const hasKingSteps = (piece: Piece): boolean => piece.type === 'p' && (piece.enhanced || piece.royal);

/** 강화 룩/비숍은 자신의 말을 뛰어넘는다 */
const jumpsOwnPieces = (piece: Piece): boolean => piece.enhanced && (piece.type === 'r' || piece.type === 'b');

function slideTargets(board: Board, from: Square, piece: Piece, dirs: readonly Delta[], jumpOwn: boolean): Square[] {
  const result: Square[] = [];
  for (const [df, dr] of dirs) {
    let current = offset(from, df, dr);
    while (current !== null) {
      const occupant = board[current];
      if (!occupant) {
        result.push(current);
      } else if (occupant.color !== piece.color) {
        result.push(current);
        break;
      } else if (!jumpOwn) {
        break;
      }
      current = offset(current, df, dr);
    }
  }
  return result;
}

/** 팔라딘: 플레이어 기준 좌우(같은 랭크의 옆 파일) 빈칸으로 한 칸 옆걸음. 잡기는 불가 */
function sidestepTargets(board: Board, from: Square): Square[] {
  const result: Square[] = [];
  for (const df of [-1, 1]) {
    const step = offset(from, df, 0);
    if (step !== null && !board[step]) result.push(step);
  }
  return result;
}

function stepTargets(board: Board, from: Square, piece: Piece, deltas: readonly Delta[]): Square[] {
  const result: Square[] = [];
  for (const [df, dr] of deltas) {
    const target = offset(from, df, dr);
    if (target === null) continue;
    const occupant = board[target];
    if (!occupant || occupant.color !== piece.color) result.push(target);
  }
  return result;
}

function pushPawnMove(moves: GeneratedMove[], piece: Piece, from: Square, to: Square, kind: GeneratedMove['kind'], ctx: MoveGenContext) {
  const promotes = rankOf(to) === promotionRank(piece.color) && !piece.royal;
  if (!promotes) {
    moves.push({ from, to, kind });
    return;
  }
  for (const piece of PROMOTION_PIECES) {
    // 여제 규칙: 퀸 대신 승급 킹(royal 아님)으로 프로모션
    const promotion: PieceType = piece === 'q' && ctx.noQueenPromotion ? 'k' : piece;
    moves.push({ from, to, kind, promotion });
  }
}

function pawnMoves(ctx: MoveGenContext, from: Square, piece: Piece): GeneratedMove[] {
  const { board, enPassant } = ctx;
  const moves: GeneratedMove[] = [];
  const dir = pawnDirection(piece.color);
  const visited = new Set<Square>();
  const add = (to: Square, kind: GeneratedMove['kind']) => {
    if (visited.has(to)) return;
    visited.add(to);
    pushPawnMove(moves, piece, from, to, kind, ctx);
  };

  const oneStep = offset(from, 0, dir);
  if (oneStep !== null && !board[oneStep]) {
    add(oneStep, 'normal');
    const twoStep = offset(from, 0, dir * 2);
    const canDouble = !piece.moved && rankOf(from) === pawnStartRank(piece.color);
    if (canDouble && twoStep !== null && !board[twoStep]) add(twoStep, 'double');
  }

  for (const df of [-1, 1]) {
    const target = offset(from, df, dir);
    if (target === null) continue;
    const occupant = board[target];
    if (occupant && occupant.color !== piece.color) add(target, 'normal');
    else if (!occupant && enPassant && enPassant.target === target && enPassant.pawnColor !== piece.color) add(target, 'enPassant');
  }

  if (hasKingSteps(piece)) {
    for (const to of stepTargets(board, from, piece, KING_DELTAS)) add(to, 'normal');
  }
  return moves;
}

function castlingMoves(
  ctx: MoveGenContext,
  from: Square,
  king: Piece,
  isAttacked: (sq: Square, by: Color) => boolean,
): GeneratedMove[] {
  const backRank = king.color === 'w' ? 0 : 7;
  if (king.moved || from !== toSquare(4, backRank)) return [];

  const enemy = king.color === 'w' ? 'b' : 'w';
  if (ctx.castlingRequiresSafety && isAttacked(from, enemy)) return [];

  const moves: GeneratedMove[] = [];
  const sides = [
    { rookFile: 7, between: [5, 6], path: [5, 6], kingFile: 6 },
    { rookFile: 0, between: [1, 2, 3], path: [3, 2], kingFile: 2 },
  ];
  for (const side of sides) {
    const rook = ctx.board[toSquare(side.rookFile, backRank)];
    if (!rook || rook.type !== 'r' || rook.color !== king.color || rook.moved) continue;
    if (side.between.some((file) => ctx.board[toSquare(file, backRank)])) continue;
    if (ctx.castlingRequiresSafety && side.path.some((file) => isAttacked(toSquare(file, backRank), enemy))) continue;
    moves.push({ from, to: toSquare(side.kingFile, backRank), kind: 'castle' });
  }
  return moves;
}

/** 자기 체크 여부를 고려하지 않은 이동 목록 */
export function pseudoMovesFrom(
  ctx: MoveGenContext,
  from: Square,
  isAttacked: (sq: Square, by: Color) => boolean,
): GeneratedMove[] {
  const piece = ctx.board[from];
  if (!piece) return [];

  const toMoves = (targets: Square[]): GeneratedMove[] => [...new Set(targets)].map((to) => ({ from, to, kind: 'normal' }));
  const { board } = ctx;
  switch (piece.type) {
    case 'p':
      return pawnMoves(ctx, from, piece);
    case 'n': {
      const targets = stepTargets(board, from, piece, KNIGHT_DELTAS);
      if (piece.enhanced) targets.push(...slideTargets(board, from, piece, ORTHOGONAL_DELTAS, false));
      return toMoves(targets);
    }
    case 'b': {
      const targets = slideTargets(board, from, piece, DIAGONAL_DELTAS, jumpsOwnPieces(piece));
      if (piece.enhanced) targets.push(...sidestepTargets(board, from));
      return toMoves(targets);
    }
    case 'r':
      return toMoves(slideTargets(board, from, piece, ORTHOGONAL_DELTAS, jumpsOwnPieces(piece)));
    case 'q':
      return toMoves(slideTargets(board, from, piece, [...ORTHOGONAL_DELTAS, ...DIAGONAL_DELTAS], false));
    case 'k':
      return [...toMoves(stepTargets(board, from, piece, KING_DELTAS)), ...castlingMoves(ctx, from, piece, isAttacked)];
  }
}

function rayHits(board: Board, from: Square, target: Square, attacker: Piece, dirs: readonly Delta[], jumpOwn: boolean): boolean {
  for (const [df, dr] of dirs) {
    let current = offset(from, df, dr);
    while (current !== null) {
      if (current === target) return true;
      const occupant = board[current];
      if (occupant && !(jumpOwn && occupant.color === attacker.color)) break;
      current = offset(current, df, dr);
    }
  }
  return false;
}

function stepHits(from: Square, target: Square, deltas: readonly Delta[]): boolean {
  return deltas.some(([df, dr]) => offset(from, df, dr) === target);
}

/** from에 있는 말이 target 칸을 공격하는지 (target의 점유 여부와 무관) */
export function attacks(board: Board, from: Square, target: Square): boolean {
  const piece = board[from];
  if (!piece || from === target) return false;

  switch (piece.type) {
    case 'p': {
      const dir = pawnDirection(piece.color);
      if (offset(from, -1, dir) === target || offset(from, 1, dir) === target) return true;
      return hasKingSteps(piece) && stepHits(from, target, KING_DELTAS);
    }
    case 'n':
      return stepHits(from, target, KNIGHT_DELTAS) || (piece.enhanced && rayHits(board, from, target, piece, ORTHOGONAL_DELTAS, false));
    case 'b':
      return rayHits(board, from, target, piece, DIAGONAL_DELTAS, jumpsOwnPieces(piece));
    case 'r':
      return rayHits(board, from, target, piece, ORTHOGONAL_DELTAS, jumpsOwnPieces(piece));
    case 'q':
      return rayHits(board, from, target, piece, [...ORTHOGONAL_DELTAS, ...DIAGONAL_DELTAS], false);
    case 'k':
      return stepHits(from, target, KING_DELTAS);
  }
}

/**
 * target이 by 색에게 공격받는지. 대상 칸에서 거꾸로 훑어 판정한다.
 * 슬라이딩 경로에서 by 색의 말을 만나면 그 뒤로는 뛰어넘는 강화 룩/비숍만 공격할 수 있다.
 */
export function isSquareAttacked(board: Board, target: Square, by: Color): boolean {
  const enemyAt = (sq: Square | null) => (sq === null ? null : board[sq]?.color === by ? board[sq] : null);

  for (const [df, dr] of KNIGHT_DELTAS) {
    if (enemyAt(offset(target, df, dr))?.type === 'n') return true;
  }

  for (const [df, dr] of KING_DELTAS) {
    const piece = enemyAt(offset(target, df, dr));
    if (piece && (piece.type === 'k' || hasKingSteps(piece))) return true;
  }

  const pawnRank = -pawnDirection(by);
  for (const df of [-1, 1]) {
    if (enemyAt(offset(target, df, pawnRank))?.type === 'p') return true;
  }

  const rayAttacked = (dirs: readonly Delta[], slider: PieceType, alsoEnhancedKnight: boolean) => {
    for (const [df, dr] of dirs) {
      let onlyJumpers = false;
      let current = offset(target, df, dr);
      while (current !== null) {
        const piece = board[current];
        if (piece) {
          if (piece.color !== by) break;
          const isJumper = piece.type === slider && piece.enhanced;
          if (isJumper) return true;
          if (!onlyJumpers && (piece.type === slider || piece.type === 'q' || (alsoEnhancedKnight && piece.type === 'n' && piece.enhanced))) {
            return true;
          }
          onlyJumpers = true;
        }
        current = offset(current, df, dr);
      }
    }
    return false;
  };

  // 팔라딘의 옆걸음은 잡기가 불가능하므로 공격 판정에는 영향이 없다
  return rayAttacked(ORTHOGONAL_DELTAS, 'r', true) || rayAttacked(DIAGONAL_DELTAS, 'b', false);
}
