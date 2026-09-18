import { randomUUID } from 'node:crypto';
import {
  applyAction,
  checkTimeout,
  createGame,
  drawOfferDue,
  openDrawOffer,
  opposite,
  resign,
  STANDARD_TIME_CONTROL,
  voteDraw,
  type Action,
  type Color,
  type DrawVote,
  type GameState,
} from '@hyperchess/engine';
import {
  CHAT_MAX_LENGTH,
  CHAT_MIN_INTERVAL_MS,
  NAME_MAX_LENGTH,
  ROOM_CODE_LENGTH,
  type ChatMessage,
  type ColorPreference,
  type CreateRoomRequest,
  type JoinResult,
  type JoinRoomRequest,
  type ResumeRequest,
  isAbilityChoice,
  RANDOM_ABILITY,
  resolveAbilityChoice,
  type RoomSnapshot,
} from '@hyperchess/protocol';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const COLORS: readonly Color[] = ['w', 'b'];

export class RoomError extends Error {}

interface Seat {
  readonly name: string;
  /** 대기실에서 고른 값: 능력 id 또는 'random' */
  choice: string;
  /** 대기실에서 고른 색: 백·흑 또는 무작위 */
  colorChoice: ColorPreference;
  /** 이번 게임에서 사용하는 능력 (무작위면 게임 시작 시 결정) */
  abilityId: string;
  /** 대기실 준비 완료 (준비하면 능력을 바꿀 수 없다) */
  ready: boolean;
  /** 마지막으로 채팅을 보낸 시각 (도배 차단) */
  lastChatAt: number;
  readonly token: string;
  socketId: string | null;
  /** 로그인 유저 id, 게스트는 null */
  readonly userId: string | null;
}

/** 로그인한 참가자 (핸들러가 세션 토큰으로 확인해 넘긴다) */
export interface SeatIdentity {
  readonly userId: string;
  readonly nickname: string;
}

interface Room {
  readonly code: string;
  /** 자리는 그냥 두 칸이다. 실제 색은 둘 다 준비했을 때 선택값으로 정해진다 */
  seats: Record<Color, Seat | null>;
  game: GameState | null;
  /** 이번 게임에서 둔 행동 순서 (기록용) */
  actions: Action[];
  rematchVotes: Set<Color>;
  /** 채팅 일련번호 (보관하지 않고 번호만 이어 붙인다) */
  chatSeq: number;
  /** 모든 좌석의 연결이 끊긴 시각 */
  abandonedAt: number | null;
}

export interface RoomManagerOptions {
  readonly random?: () => number;
  readonly now?: () => number;
  /** 대국이 끝났을 때 한 번 호출 (기록·레이팅 반영용) */
  readonly onGameEnd?: (game: GameState, players: Readonly<Record<Color, string | null>>, actions: readonly Action[]) => void;
  /** 스냅샷에 표시할 유저 레이팅 */
  readonly ratingOf?: (userId: string) => number | null;
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
  private readonly onGameEnd: NonNullable<RoomManagerOptions['onGameEnd']>;
  private readonly ratingOf: NonNullable<RoomManagerOptions['ratingOf']>;

  constructor(options: RoomManagerOptions = {}) {
    this.random = options.random ?? Math.random;
    this.now = options.now ?? Date.now;
    this.onGameEnd = options.onGameEnd ?? (() => {});
    this.ratingOf = options.ratingOf ?? (() => null);
  }

  /** 방을 만든다. 색과 능력은 각자 대기실에서 고른다 */
  create(socketId: string, request: CreateRoomRequest, identity: SeatIdentity | null = null): JoinResult {
    this.detach(socketId);
    const code = this.generateCode();
    const color: Color = 'w';

    const seat = this.createSeat(socketId, request.name, identity);
    const room: Room = {
      code,
      seats: { w: seat, b: null },
      game: null,
      actions: [],
      rematchVotes: new Set(),
      chatSeq: 0,
      abandonedAt: null,
    };
    this.rooms.set(code, room);
    this.socketSeats.set(socketId, { code, color });
    return { code, color, token: seat.token };
  }

  join(socketId: string, request: JoinRoomRequest, identity: SeatIdentity | null = null): JoinResult {
    const room = this.requireRoom(normalizeCode(request.code));
    const color = COLORS.find((c) => room.seats[c] === null);
    if (!color) throw new RoomError('방이 가득 찼습니다');
    if (identity && COLORS.some((c) => room.seats[c]?.userId === identity.userId)) throw new RoomError('같은 계정으로 양쪽에 앉을 수 없습니다');

    this.detach(socketId);
    const seat = this.createSeat(socketId, request.name, identity);
    room.seats[color] = seat;
    room.abandonedAt = null;
    this.socketSeats.set(socketId, { code: room.code, color });
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

    if (room.game && room.game.result.kind === 'ongoing') this.updateGame(room, resign(room.game, binding.color));
    this.disconnect(socketId);
    if (!room.game) room.seats[binding.color] = null;
    room.rematchVotes.delete(binding.color);

    // 상대가 떠나면 기다리던 사람의 준비는 풀린다
    const other = room.seats[opposite(binding.color)];
    if (!room.seats[binding.color] && other) other.ready = false;

    if (COLORS.every((c) => !room.seats[c]?.socketId)) {
      this.rooms.delete(room.code);
      return null;
    }
    return room.code;
  }

  /** 대기실에서 내 능력을 고른다 (준비 전에만) */
  setAbility(socketId: string, abilityId: string): string {
    const { room, seat } = this.requireWaitingSeat(socketId);
    if (seat.ready) throw new RoomError('준비를 취소한 뒤에 바꿀 수 있습니다');
    if (!isAbilityChoice(abilityId)) throw new RoomError('존재하지 않는 능력입니다');
    seat.choice = abilityId;
    seat.abilityId = abilityId;
    return room.code;
  }

  /** 대기실 준비 토글. 양쪽이 준비하면 색을 가른 뒤 바로 시작한다 */
  setReady(socketId: string, ready: boolean): string {
    const { room, seat } = this.requireWaitingSeat(socketId);
    seat.ready = ready;
    this.startIfAllReady(room);
    return room.code;
  }

  /** 대기실에서 내 색을 고른다 (준비 전에만). 둘이 같은 색을 골라도 막지 않고 시작할 때 무작위로 가른다 */
  setColor(socketId: string, color: ColorPreference): string {
    const { room, seat } = this.requireWaitingSeat(socketId);
    if (seat.ready) throw new RoomError('준비를 취소한 뒤에 바꿀 수 있습니다');
    if (color !== 'random' && !COLORS.includes(color)) throw new RoomError('잘못된 색 선택입니다');
    seat.colorChoice = color;
    return room.code;
  }

  /** 방 채팅 한 줄. 보관하지 않고 만들어서 돌려주기만 한다 */
  chat(socketId: string, rawText: string): { code: string; message: ChatMessage } {
    const { room, color } = this.requireSeat(socketId);
    const seat = room.seats[color];
    if (!seat) throw new RoomError('참가 중인 방이 없습니다');

    const text = String(rawText ?? '').replace(/\s+/g, ' ').trim().slice(0, CHAT_MAX_LENGTH);
    if (!text) throw new RoomError('보낼 내용이 없습니다');

    const at = this.now();
    if (at - seat.lastChatAt < CHAT_MIN_INTERVAL_MS) throw new RoomError('조금 천천히 보내 주세요');
    seat.lastChatAt = at;
    return { code: room.code, message: { id: room.chatSeq++, color, name: seat.name, text, at } };
  }

  act(socketId: string, action: Action): string {
    const { room, color } = this.requireSeat(socketId);
    if (!room.game) throw new RoomError('게임이 시작되지 않았습니다');
    if (room.game.turn !== color) throw new RoomError('상대 차례입니다');
    const next = applyAction(room.game, action, this.now());
    room.actions.push(action);
    // 말 변동 없이 오래 끌었으면 이 수를 끝으로 무승부 제안을 띄운다
    this.updateGame(room, drawOfferDue(next) ? openDrawOffer(next, this.now()) : next);
    return room.code;
  }

  /** 무승부 제안에 답한다. 양쪽 답이 같으면 그대로 결정된다 */
  voteDraw(socketId: string, vote: DrawVote): string {
    const { room, color } = this.requireSeat(socketId);
    if (!room.game?.draw.offer) throw new RoomError('무승부 제안이 없습니다');
    if (room.game.draw.offer.votes[color]) throw new RoomError('이미 답했습니다');
    this.updateGame(room, voteDraw(room.game, color, vote, this.now()));
    return room.code;
  }

  resign(socketId: string): string {
    const { room, color } = this.requireSeat(socketId);
    if (!room.game) throw new RoomError('게임이 시작되지 않았습니다');
    this.updateGame(room, resign(room.game, color));
    return room.code;
  }

  /** 양쪽이 동의하면 색을 바꿔 새 게임 시작 */
  voteRematch(socketId: string): string {
    const { room, color } = this.requireSeat(socketId);
    if (!room.game || room.game.result.kind === 'ongoing') throw new RoomError('게임이 끝난 뒤에만 재대결할 수 있습니다');

    room.rematchVotes.add(color);
    const opponent = room.seats[opposite(color)];
    if (room.rematchVotes.size < 2 || !opponent) return room.code;

    this.swapSeats(room);
    room.rematchVotes.clear();
    room.game = null;
    this.startGame(room);
    return room.code;
  }

  snapshot(code: string): RoomSnapshot {
    const room = this.requireRoom(code);
    const seatInfo = (color: Color) => {
      const seat = room.seats[color];
      return seat
        ? {
            name: seat.name,
            abilityId: seat.abilityId,
            colorChoice: seat.colorChoice,
            randomized: seat.choice === RANDOM_ABILITY,
            connected: seat.socketId !== null,
            rating: seat.userId ? this.ratingOf(seat.userId) : null,
            ready: seat.ready,
          }
        : null;
    };
    const status = !room.game ? 'waiting' : room.game.result.kind === 'ongoing' ? 'playing' : 'finished';
    return {
      code: room.code,
      status,
      seats: { w: seatInfo('w'), b: seatInfo('b') },
      game: room.game,
      rematchVotes: [...room.rematchVotes],
      serverTime: this.now(),
    };
  }

  /** 진행 중인 게임에서 현재 차례가 시간 초과되는 시각. 없으면 null */
  clockDeadline(code: string): number | null {
    const game = this.rooms.get(code)?.game;
    const clock = game?.clock;
    // 무승부 제안에 답하는 동안에는 시계가 멈춘다
    if (!game || !clock || game.result.kind !== 'ongoing' || game.draw.offer) return null;
    return clock.turnStartedAt + Math.min(clock.control.turnLimitMs, clock.remainingMs[game.turn]);
  }

  /** 시간 초과를 반영한다. 게임이 끝났으면 true */
  expireClock(code: string): boolean {
    const room = this.rooms.get(code);
    if (!room?.game) return false;
    const next = checkTimeout(room.game, this.now());
    if (next === room.game) return false;
    this.updateGame(room, next);
    return true;
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

  /** 게임 상태를 바꾸고, 이번에 끝났으면 onGameEnd를 알린다 */
  private updateGame(room: Room, next: GameState) {
    const wasOngoing = room.game?.result.kind === 'ongoing';
    room.game = next;
    if (wasOngoing && next.result.kind !== 'ongoing') {
      this.onGameEnd(next, { w: room.seats.w?.userId ?? null, b: room.seats.b?.userId ?? null }, room.actions);
    }
  }

  /** 양쪽이 준비하면 색을 가른 뒤 시작한다 */
  private startIfAllReady(room: Room) {
    const { w, b } = room.seats;
    if (!w || !b || !w.ready || !b.ready) return;
    this.assignColors(room);
    this.startGame(room);
  }

  /**
   * 색 선택을 실제 자리로 푼다. 한쪽만 특정 색을 원하면 그대로 주고,
   * 둘이 같은 색을 원하거나 둘 다 무작위면 무작위로 가른다.
   */
  private assignColors(room: Room) {
    const { w: first, b: second } = room.seats;
    if (!first || !second) return;

    const wantWhite = [first, second].filter((seat) => seat.colorChoice === 'w');
    const wantBlack = [first, second].filter((seat) => seat.colorChoice === 'b');

    let white: Seat;
    if (wantWhite.length === 1 && wantBlack.length <= 1) white = wantWhite[0];
    else if (wantWhite.length === 0 && wantBlack.length === 1) white = wantBlack[0] === first ? second : first;
    else white = this.random() < 0.5 ? first : second;

    if (white !== first) this.swapSeats(room);
  }

  private startGame(room: Room) {
    const { w, b } = room.seats;
    if (!w || !b || room.game) return;
    // 무작위 선택은 게임마다 새로 뽑는다 (재대결 포함)
    for (const seat of [w, b]) {
      seat.abilityId = resolveAbilityChoice(seat.choice, this.random);
      seat.ready = false;
    }
    room.actions = [];
    room.game = createGame({ abilities: { w: w.abilityId, b: b.abilityId }, timeControl: STANDARD_TIME_CONTROL, now: this.now() });
  }

  /** 좌석을 맞바꾸고 소켓 연결을 따라 옮긴다 */
  private swapSeats(room: Room) {
    room.seats = { w: room.seats.b, b: room.seats.w };
    for (const c of COLORS) {
      const socket = room.seats[c]?.socketId;
      if (socket) this.socketSeats.set(socket, { code: room.code, color: c });
    }
  }

  private detach(socketId: string) {
    if (this.socketSeats.has(socketId)) this.leave(socketId);
  }

  private createSeat(socketId: string, rawName: string, identity: SeatIdentity | null): Seat {
    // 로그인 유저는 닉네임을 그대로 쓴다
    const name = identity?.nickname ?? (String(rawName ?? '').trim().slice(0, NAME_MAX_LENGTH) || '게스트');
    const choice = RANDOM_ABILITY;
    return { name, choice, colorChoice: 'random', abilityId: choice, ready: false, lastChatAt: 0, token: randomUUID(), socketId, userId: identity?.userId ?? null };
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

  /** 아직 대국이 시작되지 않은 방의 내 자리 */
  private requireWaitingSeat(socketId: string): { room: Room; color: Color; seat: Seat } {
    const { room, color } = this.requireSeat(socketId);
    if (room.game) throw new RoomError('대기 중에만 바꿀 수 있습니다');
    const seat = room.seats[color];
    if (!seat) throw new RoomError('참가 중인 방이 없습니다');
    return { room, color, seat };
  }

  private requireSeat(socketId: string): { room: Room; color: Color } {
    const binding = this.socketSeats.get(socketId);
    const room = binding ? this.rooms.get(binding.code) : undefined;
    if (!binding || !room) throw new RoomError('참가 중인 방이 없습니다');
    return { room, color: binding.color };
  }
}

const normalizeCode = (code: string) => String(code ?? '').trim().toUpperCase();
