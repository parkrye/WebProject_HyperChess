import { IllegalActionError } from '@hyperchess/engine';
import type { Ack, ClientToServerEvents, ServerToClientEvents } from '@hyperchess/protocol';
import type { Server, Socket } from 'socket.io';
import { isAction } from './actions';
import { RoomError, type RoomManager, type SeatIdentity } from './rooms';
import type { Matchmaker } from './matchmaking';
import type { UserStore } from './users';

export interface HandlerDeps {
  readonly rooms: RoomManager;
  readonly users: UserStore;
  readonly matchmaker: Matchmaker;
}

type GameServer = Server<ClientToServerEvents, ServerToClientEvents>;
type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

/** 방마다 현재 차례의 시간 초과 시각에 맞춰 건 타이머 */
const clockTimers = new Map<string, NodeJS.Timeout>();

function scheduleClock(io: GameServer, rooms: RoomManager, code: string) {
  clearTimeout(clockTimers.get(code));
  clockTimers.delete(code);
  const deadline = rooms.clockDeadline(code);
  if (deadline === null) return;

  const timer = setTimeout(() => {
    clockTimers.delete(code);
    if (rooms.expireClock(code)) broadcastRoom(io, rooms, code);
    else scheduleClock(io, rooms, code);
  }, Math.max(0, deadline - Date.now()) + 50);
  clockTimers.set(code, timer);
}

export function broadcastRoom(io: GameServer, rooms: RoomManager, code: string | null) {
  if (!code) return;
  let snapshot;
  try {
    snapshot = rooms.snapshot(code);
  } catch {
    // 방이 사라졌으면 타이머만 정리
    clearTimeout(clockTimers.get(code));
    clockTimers.delete(code);
    return;
  }
  for (const { socketId, color } of rooms.connectedSeats(code)) io.to(socketId).emit('room:state', snapshot, color);
  scheduleClock(io, rooms, code);
}

export function registerHandlers(io: GameServer, socket: GameSocket, { rooms, users, matchmaker }: HandlerDeps) {
  /** 세션 토큰이 있으면 유저로, 없으면 게스트로 참가. 토큰이 잘못되었으면 거부한다 */
  const identify = (authToken: unknown): SeatIdentity | null => {
    if (authToken === undefined || authToken === null || authToken === '') return null;
    const user = users.authenticate(authToken);
    if (!user) throw new RoomError('로그인이 만료되었습니다. 다시 로그인해 주세요');
    return { userId: user.id, nickname: user.nickname };
  };

  const respond = <T>(ack: unknown, run: () => { code: string | null; data: T }) => {
    const reply = typeof ack === 'function' ? (ack as (result: Ack<T>) => void) : () => {};
    try {
      const { code, data } = run();
      reply({ ok: true, data });
      broadcastRoom(io, rooms, code);
    } catch (error) {
      if (error instanceof RoomError || error instanceof IllegalActionError) {
        reply({ ok: false, error: error.message });
        return;
      }
      console.error('[handler]', error);
      reply({ ok: false, error: '서버 오류가 발생했습니다' });
    }
  };

  socket.on('room:create', (request, ack) =>
    respond(ack, () => {
      matchmaker.cancel(socket.id);
      const result = rooms.create(socket.id, request, identify(request?.authToken));
      return { code: result.code, data: result };
    }),
  );

  socket.on('room:join', (request, ack) =>
    respond(ack, () => {
      matchmaker.cancel(socket.id);
      const result = rooms.join(socket.id, request, identify(request?.authToken));
      return { code: result.code, data: result };
    }),
  );

  socket.on('room:resume', (request, ack) =>
    respond(ack, () => {
      const result = rooms.resume(socket.id, request);
      return { code: result.code, data: result };
    }),
  );

  socket.on('match:find', (request, ack) =>
    respond(ack, () => {
      const identity = identify(request?.authToken);
      const partner = matchmaker.enqueue({ socketId: socket.id, request, identity });
      if (!partner) return { code: null, data: { matched: false } };

      // 먼저 기다린 쪽이 방을 만들고 새로 온 쪽이 참가한다. 방장이 없어 양쪽이 준비하면 시작한다
      const first = rooms.create(partner.socketId, partner.request, partner.identity, false);
      const second = rooms.join(socket.id, { ...request, code: first.code }, identity);
      io.to(partner.socketId).emit('match:found', first);
      socket.emit('match:found', second);
      return { code: first.code, data: { matched: true } };
    }),
  );
  socket.on('match:cancel', () => matchmaker.cancel(socket.id));

  socket.on('room:ability', (abilityId, ack) => respond(ack, () => ({ code: rooms.setAbility(socket.id, String(abilityId)), data: null })));
  socket.on('room:ready', (ready, ack) => respond(ack, () => ({ code: rooms.setReady(socket.id, ready === true), data: null })));
  socket.on('room:color', (color, ack) => respond(ack, () => ({ code: rooms.setColor(socket.id, color), data: null })));
  socket.on('room:start', (ack) => respond(ack, () => ({ code: rooms.start(socket.id), data: null })));

  socket.on('game:action', (action, ack) =>
    respond(ack, () => {
      if (!isAction(action)) throw new RoomError('잘못된 요청입니다');
      return { code: rooms.act(socket.id, action), data: null };
    }),
  );

  socket.on('game:resign', (ack) => respond(ack, () => ({ code: rooms.resign(socket.id), data: null })));
  socket.on('game:rematch', (ack) => respond(ack, () => ({ code: rooms.voteRematch(socket.id), data: null })));

  socket.on('room:leave', () => broadcastRoom(io, rooms, rooms.leave(socket.id)));
  socket.on('disconnect', () => {
    matchmaker.cancel(socket.id);
    broadcastRoom(io, rooms, rooms.disconnect(socket.id));
  });
}
