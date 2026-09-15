import type { ClientToServerEvents, ServerToClientEvents } from '@hyperchess/protocol';
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { createApiHandler } from './api';
import { registerHandlers } from './handlers';
import { ResultStore } from './results';
import { RoomManager } from './rooms';
import { createStaticHandler } from './static';

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '0.0.0.0';
const ROOM_IDLE_MS = 10 * 60 * 1000;
const CLIENT_DIST = fileURLToPath(new URL('../../client/dist', import.meta.url));
const DATA_DIR = process.env.HYPERCHESS_DATA ?? fileURLToPath(new URL('../data', import.meta.url));

const rooms = new RoomManager();
const results = new ResultStore(join(DATA_DIR, 'results.jsonl'));
const httpServer = createServer(createApiHandler(results, createStaticHandler(CLIENT_DIST)));
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  // 개발 중 Vite(5173)에서 직접 붙는 경우 허용
  cors: { origin: true },
  maxHttpBufferSize: 64 * 1024,
});

io.on('connection', (socket) => registerHandlers(io, socket, rooms));

setInterval(() => {
  const removed = rooms.sweep(ROOM_IDLE_MS);
  if (removed.length) console.log(`[rooms] 비어있는 방 정리: ${removed.join(', ')}`);
}, 60 * 1000).unref();

function lanAddresses(): string[] {
  return Object.values(networkInterfaces())
    .flat()
    .filter((net) => net && net.family === 'IPv4' && !net.internal)
    .map((net) => net!.address);
}

httpServer.listen(PORT, HOST, () => {
  console.log('HyperChess 서버 실행 중');
  console.log(`  로컬:   http://localhost:${PORT}`);
  for (const address of lanAddresses()) console.log(`  네트워크: http://${address}:${PORT}`);
});
