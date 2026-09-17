import { listAbilities, type Action, type Color, type GameState } from '@hyperchess/engine';

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
export const BALANCE_VERSION = 20;

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
    ...(difficulty ? { difficulty } : {}),
    ...(actions ? { actions } : {}),
  };
}

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

export type ColorPreference = Color | 'random';

export interface SeatInfo {
  readonly name: string;
  /** 게임이 시작되면 결정된 능력, 시작 전 무작위 선택이면 'random' */
  readonly abilityId: string;
  /** 무작위로 결정된 능력인지 */
  readonly randomized: boolean;
  readonly connected: boolean;
  /** 로그인 유저의 레이팅, 게스트는 null */
  readonly rating: number | null;
}

export type RoomStatus = 'waiting' | 'playing' | 'finished';

export interface RoomSnapshot {
  readonly code: string;
  readonly status: RoomStatus;
  readonly seats: Readonly<Record<Color, SeatInfo | null>>;
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

export interface CreateRoomRequest {
  readonly name: string;
  readonly abilityId: string;
  readonly color: ColorPreference;
  /** 로그인 세션 토큰 (없으면 게스트: 랭킹 미반영) */
  readonly authToken?: string;
}

export interface JoinRoomRequest {
  readonly code: string;
  readonly name: string;
  readonly abilityId: string;
  readonly authToken?: string;
}

/** 빠른 매칭: 짝이 지어지면 서버가 방을 만들어 match:found로 알린다 */
export interface MatchRequest {
  readonly name: string;
  readonly abilityId: string;
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
  /** matched: 바로 짝이 지어졌는지 (false면 대기열에서 기다림) */
  'match:find': (request: MatchRequest, ack: (result: Ack<{ matched: boolean }>) => void) => void;
  'match:cancel': () => void;
  'game:action': (action: Action, ack: (result: Ack<null>) => void) => void;
  'game:resign': (ack: (result: Ack<null>) => void) => void;
  'game:rematch': (ack: (result: Ack<null>) => void) => void;
}

export interface ServerToClientEvents {
  /** you: 이 소켓의 색 (재대결 시 색이 바뀔 수 있음) */
  'room:state': (snapshot: RoomSnapshot, you: Color) => void;
  'room:closed': (reason: string) => void;
  /** 빠른 매칭 성사: 참가한 방 정보 */
  'match:found': (result: JoinResult) => void;
}
