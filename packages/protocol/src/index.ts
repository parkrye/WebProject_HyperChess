import type { Action, Color, GameState } from '@hyperchess/engine';

export const ROOM_CODE_LENGTH = 5;
export const NAME_MAX_LENGTH = 16;

export type ColorPreference = Color | 'random';

export interface SeatInfo {
  readonly name: string;
  readonly abilityId: string;
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
