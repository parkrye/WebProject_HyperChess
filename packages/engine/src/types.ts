export type Color = 'w' | 'b';
export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';

/** 0..63, index = rank * 8 + file. rank 0 = 백 진영(1랭크) */
export type Square = number;

export type PieceTitle = 'oldKing' | 'heir';

export interface Piece {
  readonly id: string;
  readonly type: PieceType;
  readonly color: Color;
  readonly moved: boolean;
  /** 강화 능력(중보병/창기병/전차/팔라딘)으로 강화된 말 */
  readonly enhanced: boolean;
  /** 잡히면 패배에 영향을 주는 말 (기본: 킹) */
  readonly royal: boolean;
  readonly title?: PieceTitle;
}

export type Board = ReadonlyArray<Piece | null>;

export interface Move {
  readonly from: Square;
  readonly to: Square;
  readonly promotion?: PieceType;
}

export type MoveKind = 'normal' | 'double' | 'enPassant' | 'castle';

export interface GeneratedMove extends Move {
  readonly kind: MoveKind;
}

export interface EnPassant {
  /** 잡는 폰이 도착할 칸 */
  readonly target: Square;
  /** 잡힐 폰이 있는 칸 */
  readonly captureSquare: Square;
  readonly pawnColor: Color;
}

/** 능력 자원 계측값. 시간 역행 시에도 되돌아가지 않는다 */
export interface AbilityMeter {
  readonly resource: number;
  readonly cooldown: number;
  readonly turnsTaken: number;
}

/** 능력으로 바뀌는 플레이어 규칙. 시간 역행 시 함께 되돌아간다 */
export interface PlayerRules {
  /** 여제: 퀸만 royal (킹 제외), 체크 규칙을 쓰지 않음 */
  readonly queensRoyal: boolean;
  readonly noQueenPromotion: boolean;
}

export interface PlayerState {
  readonly abilityId: string | null;
  readonly meter: AbilityMeter;
  readonly rules: PlayerRules;
}

export interface TurnState {
  readonly movesMade: number;
  readonly movesAllowed: number;
  readonly abilityUsed: boolean;
}

export type WinReason = 'checkmate' | 'royalsCaptured' | 'resign' | 'timeout';
export type DrawReason = 'stalemate' | 'fiftyMove' | 'threefold' | 'insufficientMaterial' | 'noActions';

export type GameResult =
  | { readonly kind: 'ongoing' }
  | { readonly kind: 'win'; readonly winner: Color; readonly reason: WinReason }
  | { readonly kind: 'draw'; readonly reason: DrawReason };

export type PieceChange =
  | { readonly type: 'move'; readonly pieceId: string; readonly from: Square; readonly to: Square }
  | { readonly type: 'remove'; readonly piece: Piece; readonly square: Square }
  | { readonly type: 'add'; readonly piece: Piece; readonly square: Square }
  | { readonly type: 'transform'; readonly before: Piece; readonly after: Piece; readonly square: Square };

export type GameEvent =
  | { readonly kind: 'move'; readonly color: Color; readonly move: Move; readonly changes: readonly PieceChange[] }
  | {
      readonly kind: 'ability';
      readonly color: Color;
      readonly abilityId: string;
      readonly params: AbilityParams;
      readonly changes: readonly PieceChange[];
      /** 시간 역행으로 취소된 이벤트들 (최신순) */
      readonly undone?: readonly GameEvent[];
    };

export type AbilityParams = Readonly<Record<string, number | string>>;

/** 시간 제한: 한 차례 최대 시간 + 게임 전체에서 한 플레이어가 쓸 수 있는 시간 */
export interface TimeControl {
  readonly turnLimitMs: number;
  readonly totalLimitMs: number;
}

export interface ClockState {
  readonly control: TimeControl;
  /** 이번 차례 시작 전까지 남은 전체 시간 */
  readonly remainingMs: Readonly<Record<Color, number>>;
  /** 현재 차례가 시작된 시각 (epoch ms) */
  readonly turnStartedAt: number;
}

export interface GameState {
  readonly board: Board;
  readonly turn: Color;
  readonly enPassant: EnPassant | null;
  readonly halfmoveClock: number;
  readonly fullmove: number;
  readonly players: Readonly<Record<Color, PlayerState>>;
  /** 색별로 잡힌 말 */
  readonly captured: Readonly<Record<Color, readonly Piece[]>>;
  readonly turnState: TurnState;
  /** 마지막 비가역 행동 이후 포지션 키 (3회 반복 판정) */
  readonly positionKeys: readonly string[];
  /** 턴 시작 시점 스냅샷 (시간 역행용, 스냅샷 자체의 history는 비어있음) */
  readonly history: readonly GameState[];
  readonly log: readonly GameEvent[];
  readonly result: GameResult;
  /** 시간 제한이 없으면 null */
  readonly clock: ClockState | null;
}

export type Action =
  | { readonly type: 'move'; readonly move: Move }
  | { readonly type: 'ability'; readonly params: AbilityParams };

export const opposite = (color: Color): Color => (color === 'w' ? 'b' : 'w');
