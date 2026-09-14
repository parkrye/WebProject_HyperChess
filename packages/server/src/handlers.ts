import { IllegalActionError, type Action } from '@hyperchess/engine';
import type { Ack, ClientToServerEvents, ServerToClientEvents } from '@hyperchess/protocol';
import type { Server, Socket } from 'socket.io';
import { RoomError, type RoomManager } from './rooms';

type GameServer = Server<ClientToServerEvents, ServerToClientEvents>;
type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

const isPrimitive = (value: unknown) => typeof value === 'number' || typeof value === 'string';

function isAction(value: unknown): value is Action {
  if (!value || typeof value !== 'object') return false;
  const action = value as Record<string, unknown>;
  if (action.type === 'move') {
    const move = action.move as Record<string, unknown> | null;
    return !!move && typeof move.from === 'number' && typeof move.to === 'number' && (move.promotion === undefined || typeof move.promotion === 'string');
  }
  if (action.type === 'ability') {
    const params = action.params;
    return !!params && typeof params === 'object' && Object.values(params).every(isPrimitive);
  }
  return false;
}

export function broadcastRoom(io: GameServer, rooms: RoomManager, code: string | null) {
  if (!code) return;
  const snapshot = rooms.snapshot(code);
  for (const { socketId, color } of rooms.connectedSeats(code)) io.to(socketId).emit('room:state', snapshot, color);
}

export function registerHandlers(io: GameServer, socket: GameSocket, rooms: RoomManager) {
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
      const result = rooms.create(socket.id, request);
      return { code: result.code, data: result };
    }),
  );

  socket.on('room:join', (request, ack) =>
    respond(ack, () => {
      const result = rooms.join(socket.id, request);
      return { code: result.code, data: result };
    }),
  );

  socket.on('room:resume', (request, ack) =>
    respond(ack, () => {
      const result = rooms.resume(socket.id, request);
      return { code: result.code, data: result };
    }),
  );

  socket.on('game:action', (action, ack) =>
    respond(ack, () => {
      if (!isAction(action)) throw new RoomError('잘못된 요청입니다');
      return { code: rooms.act(socket.id, action), data: null };
    }),
  );

  socket.on('game:resign', (ack) => respond(ack, () => ({ code: rooms.resign(socket.id), data: null })));
  socket.on('game:rematch', (ack) => respond(ack, () => ({ code: rooms.voteRematch(socket.id), data: null })));

  socket.on('room:leave', () => broadcastRoom(io, rooms, rooms.leave(socket.id)));
  socket.on('disconnect', () => broadcastRoom(io, rooms, rooms.disconnect(socket.id)));
}
