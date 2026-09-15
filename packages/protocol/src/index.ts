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
export const BALANCE_VERSION = 14;

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
}

export interface GameRecord extends GameRecordInput {
  readonly playedAt: number;
}

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
}

export interface JoinRoomRequest {
  readonly code: string;
  readonly name: string;
  readonly abilityId: string;
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
  'game:action': (action: Action, ack: (result: Ack<null>) => void) => void;
  'game:resign': (ack: (result: Ack<null>) => void) => void;
  'game:rematch': (ack: (result: Ack<null>) => void) => void;
}

export interface ServerToClientEvents {
  /** you: 이 소켓의 색 (재대결 시 색이 바뀔 수 있음) */
  'room:state': (snapshot: RoomSnapshot, you: Color) => void;
  'room:closed': (reason: string) => void;
}
