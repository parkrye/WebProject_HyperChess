import { listAbilities, type Action, type Color, type DrawVote, type GameMode, type GameState, type Placement } from '@hyperchess/engine';

/** 능력 선택값: 능력 id 또는 무작위 (게임 시작 시 결정) */
export const RANDOM_ABILITY = 'random';

export const isAbilityChoice = (choice: string) => choice === RANDOM_ABILITY || listAbilities().some((a) => a.id === choice);

/** 무작위 선택이면 전체 능력 중 하나를 뽑는다 */
export function resolveAbilityChoice(choice: string, random: () => number = Math.random): string {
  if (choice !== RANDOM_ABILITY) return choice;
  const abilities = listAbilities();
  return abilities[Math.floor(random() * abilities.length)].id;
}

/** 현재 밸런스 버전 (.docs/balance.md). 대국 기록에 함께 저장한다 */
export const BALANCE_VERSION = 22;

/** 대국 기록 출처: 밸런스 시뮬레이션 · AI 내전 · AI 대전 · 로컬 2인 · 온라인 */
export type ResultSource = 'simulation' | 'arena' | 'ai' | 'local' | 'online';
/** 클라이언트가 직접 보고할 수 있는 출처 (온라인은 서버가 기록) */
export const CLIENT_RESULT_SOURCES: readonly ResultSource[] = ['arena', 'ai', 'local'];

export interface GameRecordInput {
  readonly source: ResultSource;
  readonly balanceVersion: number;
  readonly abilities: Readonly<Record<Color, string | null>>;
  /** 무승부면 null */
  readonly winner: Color | null;
  readonly reason: string;
  readonly plies: number;
  readonly difficulty?: Readonly<Partial<Record<Color, string>>>;
  /** 표준이 아닌 모드면 그 모드 (없으면 표준). 능력 통계·레이팅에는 표준만 들어간다 */
  readonly mode?: GameMode;
  /** 표준이 아닌 국면에서 시작했으면 그 FEN */
  readonly fen?: string;
  /** 시작 국면부터 둔 행동 순서 (학습 데이터용, 엔진이 결정적이라 모든 국면을 재현할 수 있다) */
  readonly actions?: readonly Action[];
}

export interface GameRecord extends GameRecordInput {
  readonly playedAt: number;
}

/** 끝난 게임 상태에서 대국 기록을 만든다 (진행 중이면 null) */
export interface GameRecordExtras {
  readonly difficulty?: Partial<Record<Color, string>>;
  readonly actions?: readonly Action[];
}

export function toGameRecord(state: GameState, source: ResultSource, { difficulty, actions }: GameRecordExtras = {}): GameRecordInput | null {
  const { result } = state;
  if (result.kind === 'ongoing') return null;
  return {
    source,
    balanceVersion: BALANCE_VERSION,
    abilities: { w: state.players.w.abilityId, b: state.players.b.abilityId },
    winner: result.kind === 'win' ? result.winner : null,
    reason: result.reason,
    plies: state.log.length,
    ...(isStandardMode(state.mode) ? {} : { mode: state.mode }),
    ...(state.startFen ? { fen: state.startFen } : {}),
    ...(difficulty ? { difficulty } : {}),
    ...(actions ? { actions } : {}),
  };
}

export const isStandardMode = (mode: GameMode | undefined): boolean => !mode || (mode.deployment === 'standard' && !mode.fog);

export interface AbilityStat {
  /** null은 능력 없음 */
  readonly abilityId: string | null;
  readonly games: number;
  readonly wins: number;
  readonly draws: number;
  readonly losses: number;
}

/** abilityId 입장에서 본 opponentId 상대 전적 (같은 능력끼리는 제외) */
export interface MatchupStat {
  readonly abilityId: string | null;
  readonly opponentId: string | null;
  readonly games: number;
  readonly wins: number;
  readonly draws: number;
}

/** 통계 화면 분류: 전체 · 대전(로컬·멀티) · AI 대전 · AI 내전(시뮬레이션 포함) */
export type StatsCategory = 'all' | 'versus' | 'ai' | 'arena';

export const STATS_CATEGORIES: readonly { readonly id: StatsCategory; readonly sources: readonly ResultSource[] }[] = [
  { id: 'all', sources: [] },
  { id: 'versus', sources: ['local', 'online'] },
  { id: 'ai', sources: ['ai'] },
  { id: 'arena', sources: ['arena', 'simulation'] },
];

export interface CategorySummary {
  readonly category: StatsCategory;
  readonly games: number;
  readonly whiteWins: number;
  readonly blackWins: number;
  readonly draws: number;
  /** 능력별 전적 (같은 능력끼리의 대국 제외) */
  readonly abilities: readonly AbilityStat[];
}

export interface StatsResponse {
  readonly total: number;
  readonly whiteWins: number;
  readonly blackWins: number;
  readonly draws: number;
  readonly bySource: Readonly<Partial<Record<ResultSource, number>>>;
  readonly versions: readonly number[];
  readonly abilities: readonly AbilityStat[];
  readonly matchups: readonly MatchupStat[];
}

/* ---------- 유저·랭킹 ---------- */

export const NICKNAME_MIN_LENGTH = 2;
export const NICKNAME_MAX_LENGTH = 16;
export const PASSWORD_MIN_LENGTH = 4;
/** 신규 유저와 게스트(고정)의 레이팅 */
export const INITIAL_RATING = 1000;

/** 온라인 대국 기준 공개 정보 */
export interface PublicUser {
  readonly id: string;
  readonly nickname: string;
  readonly rating: number;
  readonly games: number;
  readonly wins: number;
  readonly draws: number;
  readonly losses: number;
}

export interface AuthRequest {
  readonly nickname: string;
  readonly password: string;
}

export interface AuthResponse {
  readonly token: string;
  readonly user: PublicUser;
}

export interface RankingEntry extends PublicUser {
  readonly rank: number;
}

/** 대국 기록 한 판의 최대 행동 수 */
export const MAX_RECORD_ACTIONS = 2000;

export const ROOM_CODE_LENGTH = 5;
export const NAME_MAX_LENGTH = 16;

/** 색 선택값: 백·흑 또는 무작위. 둘이 같은 색을 고르면 무작위로 정해진다 */
export type ColorPreference = Color | 'random';

export interface SeatInfo {
  readonly name: string;
  /** 게임이 시작되면 결정된 능력, 시작 전 무작위 선택이면 'random' */
  readonly abilityId: string;
  /** 대기실에서 고른 색 (게임이 시작되면 실제 자리가 곧 색이다) */
  readonly colorChoice: ColorPreference;
  /** 무작위로 결정된 능력인지 */
  readonly randomized: boolean;
  readonly connected: boolean;
  /** 로그인 유저의 레이팅, 게스트는 null */
  readonly rating: number | null;
  /** 대기실에서 준비를 마쳤는지 (준비하면 능력을 바꿀 수 없다) */
  readonly ready: boolean;
  /** 징병전 편성을 냈는지 (편성 내용은 대국이 시작될 때까지 서로 모른다) */
  readonly drafted: boolean;
}

/** drafting: 징병전에서 양쪽이 편성을 내는 중 */
export type RoomStatus = 'waiting' | 'drafting' | 'playing' | 'finished';

export interface RoomSnapshot {
  readonly code: string;
  readonly status: RoomStatus;
  readonly seats: Readonly<Record<Color, SeatInfo | null>>;
  /** 대기실에서 정한 게임 모드. 누구나 바꿀 수 있고, 바뀌면 양쪽 준비가 풀린다 */
  readonly mode: GameMode;
  /** 안개전이 진행 중이면 받는 사람 시점으로 가린 상태다 */
  readonly game: GameState | null;
  /** 재대결에 동의한 색 */
  readonly rematchVotes: readonly Color[];
  /** 스냅샷을 만든 서버 시각 (클라이언트 시계 보정용, epoch ms) */
  readonly serverTime: number;
}

export interface JoinResult {
  readonly code: string;
  readonly color: Color;
  /** 재접속용 토큰 */
  readonly token: string;
}

export type Ack<T> = { readonly ok: true; readonly data: T } | { readonly ok: false; readonly error: string };

/* ---------- 방 채팅 ---------- */

export const CHAT_MAX_LENGTH = 200;
/** 같은 사람이 이 간격 안에 연달아 보내면 거부한다 */
export const CHAT_MIN_INTERVAL_MS = 700;

/** 방 안에서만 오가는 메시지. 서버에 보관하지 않아 접속이 끊기면 사라진다 */
export interface ChatMessage {
  /** 방 안에서만 쓰는 일련번호 */
  readonly id: number;
  readonly color: Color;
  readonly name: string;
  readonly text: string;
  /** 보낸 서버 시각 (epoch ms) */
  readonly at: number;
}

/** 색과 능력은 각자 대기실에서 고르고, 둘 다 준비하면 시작한다 */
export interface CreateRoomRequest {
  readonly name: string;
  /** 로그인 세션 토큰 (없으면 게스트: 랭킹 미반영) */
  readonly authToken?: string;
}

export interface JoinRoomRequest {
  readonly code: string;
  readonly name: string;
  readonly authToken?: string;
}

/** 빠른 매칭: 짝이 지어지면 서버가 방을 만들어 match:found로 알린다 */
export interface MatchRequest {
  readonly name: string;
  readonly authToken?: string;
}

export interface ResumeRequest {
  readonly code: string;
  readonly token: string;
}

export interface ClientToServerEvents {
  'room:create': (request: CreateRoomRequest, ack: (result: Ack<JoinResult>) => void) => void;
  'room:join': (request: JoinRoomRequest, ack: (result: Ack<JoinResult>) => void) => void;
  'room:resume': (request: ResumeRequest, ack: (result: Ack<JoinResult>) => void) => void;
  'room:leave': () => void;
  /** 대기실에서 내 능력 선택 (준비 전에만) */
  'room:ability': (abilityId: string, ack: (result: Ack<null>) => void) => void;
  /** 대기실에서 내 색 선택 (준비 전에만) */
  'room:color': (color: ColorPreference, ack: (result: Ack<null>) => void) => void;
  /** 대기실에서 게임 모드 변경 (양쪽 준비가 풀린다) */
  'room:mode': (mode: GameMode, ack: (result: Ack<null>) => void) => void;
  /** 징병전 편성 제출. 양쪽이 내면 대국이 시작된다 */
  'room:draft': (placement: Placement, ack: (result: Ack<null>) => void) => void;
  /** 대기실 준비 토글. 양쪽이 준비하면 대국이 시작된다 */
  'room:ready': (ready: boolean, ack: (result: Ack<null>) => void) => void;
  /** 방 채팅 (대기실·대국 중) */
  'chat:send': (text: string, ack: (result: Ack<null>) => void) => void;
  /** matched: 바로 짝이 지어졌는지 (false면 대기열에서 기다림) */
  'match:find': (request: MatchRequest, ack: (result: Ack<{ matched: boolean }>) => void) => void;
  'match:cancel': () => void;
  'game:action': (action: Action, ack: (result: Ack<null>) => void) => void;
  'game:resign': (ack: (result: Ack<null>) => void) => void;
  /** 무승부 제안에 답한다 (승낙·거절·가치 판정). 양쪽 답이 같아야 결정된다 */
  'game:draw': (vote: DrawVote, ack: (result: Ack<null>) => void) => void;
  'game:rematch': (ack: (result: Ack<null>) => void) => void;
}

export interface ServerToClientEvents {
  /** you: 이 소켓의 색 (재대결 시 색이 바뀔 수 있음) */
  'room:state': (snapshot: RoomSnapshot, you: Color) => void;
  'room:closed': (reason: string) => void;
  /** 빠른 매칭 성사: 참가한 방 정보 */
  'match:found': (result: JoinResult) => void;
  'chat:message': (message: ChatMessage) => void;
}
