import { randomUUID } from 'node:crypto';
import { applyAction, createGame, getAbility, opposite, resign, type Action, type Color, type GameState } from '@hyperchess/engine';
import {
  NAME_MAX_LENGTH,
  ROOM_CODE_LENGTH,
  type CreateRoomRequest,
  type JoinResult,
  type JoinRoomRequest,
  type ResumeRequest,
  type RoomSnapshot,
} from '@hyperchess/protocol';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const COLORS: readonly Color[] = ['w', 'b'];

export class RoomError extends Error {}

interface Seat {
  readonly name: string;
  readonly abilityId: string;
  readonly token: string;
  socketId: string | null;
}

interface Room {
  readonly code: string;
  seats: Record<Color, Seat | null>;
  game: GameState | null;
  rematchVotes: Set<Color>;
  /** 모든 좌석의 연결이 끊긴 시각 */
  abandonedAt: number | null;
}

export interface RoomManagerOptions {
  readonly random?: () => number;
  readonly now?: () => number;
}

export interface SeatBinding {
  readonly socketId: string;
  readonly color: Color;
}

export class RoomManager {
  private readonly rooms = new Map<string, Room>();
  private readonly socketSeats = new Map<string, { code: string; color: Color }>();
  private readonly random: () => number;
  private readonly now: () => number;

  constructor(options: RoomManagerOptions = {}) {
    this.random = options.random ?? Math.random;
    this.now = options.now ?? Date.now;
  }

  create(socketId: string, request: CreateRoomRequest): JoinResult {
    this.detach(socketId);
    const code = this.generateCode();
    const color = request.color === 'random' ? (this.random() < 0.5 ? 'w' : 'b') : request.color;
    if (!COLORS.includes(color)) throw new RoomError('잘못된 색 선택입니다');

    const seat = this.createSeat(socketId, request.name, request.abilityId);
    const room: Room = {
      code,
      seats: { w: null, b: null, [color]: seat } as Record<Color, Seat | null>,
      game: null,
      rematchVotes: new Set(),
      abandonedAt: null,
    };
    this.rooms.set(code, room);
    this.socketSeats.set(socketId, { code, color });
    return { code, color, token: seat.token };
  }

  join(socketId: string, request: JoinRoomRequest): JoinResult {
    const room = this.requireRoom(normalizeCode(request.code));
    const color = COLORS.find((c) => room.seats[c] === null);
    if (!color) throw new RoomError('방이 가득 찼습니다');

    this.detach(socketId);
    const seat = this.createSeat(socketId, request.name, request.abilityId);
    room.seats[color] = seat;
    room.abandonedAt = null;
    this.socketSeats.set(socketId, { code: room.code, color });
    this.startGameIfReady(room);
    return { code: room.code, color, token: seat.token };
  }

  resume(socketId: string, request: ResumeRequest): JoinResult {
    const room = this.requireRoom(normalizeCode(request.code));
    const color = COLORS.find((c) => room.seats[c]?.token === request.token);
    const seat = color ? room.seats[color] : null;
    if (!color || !seat) throw new RoomError('재접속 정보가 유효하지 않습니다');

    if (seat.socketId) this.socketSeats.delete(seat.socketId);
    this.detach(socketId);
    seat.socketId = socketId;
    room.abandonedAt = null;
    this.socketSeats.set(socketId, { code: room.code, color });
    return { code: room.code, color, token: seat.token };
  }

  /** 연결 끊김: 좌석은 유지하고 재접속을 기다린다 */
  disconnect(socketId: string): string | null {
    const binding = this.socketSeats.get(socketId);
    if (!binding) return null;
    this.socketSeats.delete(socketId);

    const room = this.rooms.get(binding.code);
    const seat = room?.seats[binding.color];
    if (!room || !seat || seat.socketId !== socketId) return null;
    seat.socketId = null;
    if (COLORS.every((c) => !room.seats[c]?.socketId)) room.abandonedAt = this.now();
    return room.code;
  }

  /** 명시적 퇴장: 대기 중이면 좌석을 비우고, 대국 중이면 기권 처리 */
  leave(socketId: string): string | null {
    const binding = this.socketSeats.get(socketId);
    if (!binding) return null;
    const room = this.rooms.get(binding.code);
    if (!room) return null;

    if (room.game && room.game.result.kind === 'ongoing') room.game = resign(room.game, binding.color);
    this.disconnect(socketId);
    if (!room.game) room.seats[binding.color] = null;
    room.rematchVotes.delete(binding.color);

    if (COLORS.every((c) => !room.seats[c]?.socketId)) {
      this.rooms.delete(room.code);
      return null;
    }
    return room.code;
  }

  act(socketId: string, action: Action): string {
    const { room, color } = this.requireSeat(socketId);
    if (!room.game) throw new RoomError('게임이 시작되지 않았습니다');
    if (room.game.turn !== color) throw new RoomError('상대 차례입니다');
    room.game = applyAction(room.game, action);
    return room.code;
  }

  resign(socketId: string): string {
    const { room, color } = this.requireSeat(socketId);
    if (!room.game) throw new RoomError('게임이 시작되지 않았습니다');
    room.game = resign(room.game, color);
    return room.code;
  }

  /** 양쪽이 동의하면 색을 바꿔 새 게임 시작 */
  voteRematch(socketId: string): string {
    const { room, color } = this.requireSeat(socketId);
    if (!room.game || room.game.result.kind === 'ongoing') throw new RoomError('게임이 끝난 뒤에만 재대결할 수 있습니다');

    room.rematchVotes.add(color);
    const opponent = room.seats[opposite(color)];
    if (room.rematchVotes.size < 2 || !opponent) return room.code;

    room.seats = { w: room.seats.b, b: room.seats.w };
    for (const c of COLORS) {
      const socket = room.seats[c]?.socketId;
      if (socket) this.socketSeats.set(socket, { code: room.code, color: c });
    }
    room.rematchVotes.clear();
    room.game = null;
    this.startGameIfReady(room);
    return room.code;
  }

  snapshot(code: string): RoomSnapshot {
    const room = this.requireRoom(code);
    const seatInfo = (color: Color) => {
      const seat = room.seats[color];
      return seat ? { name: seat.name, abilityId: seat.abilityId, connected: seat.socketId !== null } : null;
    };
    const status = !room.game ? 'waiting' : room.game.result.kind === 'ongoing' ? 'playing' : 'finished';
    return {
      code: room.code,
      status,
      seats: { w: seatInfo('w'), b: seatInfo('b') },
      game: room.game,
      rematchVotes: [...room.rematchVotes],
    };
  }

  connectedSeats(code: string): SeatBinding[] {
    const room = this.rooms.get(code);
    if (!room) return [];
    return COLORS.flatMap((color) => {
      const socketId = room.seats[color]?.socketId;
      return socketId ? [{ socketId, color }] : [];
    });
  }

  /** 모두 떠난 지 maxIdleMs가 지난 방 제거 */
  sweep(maxIdleMs: number): string[] {
    const removed: string[] = [];
    for (const room of this.rooms.values()) {
      if (room.abandonedAt !== null && this.now() - room.abandonedAt >= maxIdleMs) {
        this.rooms.delete(room.code);
        removed.push(room.code);
      }
    }
    return removed;
  }

  get roomCount(): number {
    return this.rooms.size;
  }

  private startGameIfReady(room: Room) {
    const { w, b } = room.seats;
    if (!w || !b || room.game) return;
    room.game = createGame({ abilities: { w: w.abilityId, b: b.abilityId } });
  }

  private detach(socketId: string) {
    if (this.socketSeats.has(socketId)) this.leave(socketId);
  }

  private createSeat(socketId: string, rawName: string, abilityId: string): Seat {
    try {
      getAbility(abilityId);
    } catch {
      throw new RoomError('존재하지 않는 능력입니다');
    }
    const name = String(rawName ?? '').trim().slice(0, NAME_MAX_LENGTH) || '플레이어';
    return { name, abilityId, token: randomUUID(), socketId };
  }

  private generateCode(): string {
    for (let attempt = 0; attempt < 100; attempt++) {
      let code = '';
      for (let i = 0; i < ROOM_CODE_LENGTH; i++) code += CODE_ALPHABET[Math.floor(this.random() * CODE_ALPHABET.length)];
      if (!this.rooms.has(code)) return code;
    }
    throw new RoomError('방 코드를 만들 수 없습니다');
  }

  private requireRoom(code: string): Room {
    const room = this.rooms.get(code);
    if (!room) throw new RoomError('방을 찾을 수 없습니다');
    return room;
  }

  private requireSeat(socketId: string): { room: Room; color: Color } {
    const binding = this.socketSeats.get(socketId);
    const room = binding ? this.rooms.get(binding.code) : undefined;
    if (!binding || !room) throw new RoomError('참가 중인 방이 없습니다');
    return { room, color: binding.color };
  }
}

const normalizeCode = (code: string) => String(code ?? '').trim().toUpperCase();
