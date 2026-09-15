import type { IncomingMessage, ServerResponse } from 'node:http';
import { parseGameRecord, type ResultStore } from './results';

const MAX_BODY_BYTES = 8 * 1024;

export type HttpHandler = (req: IncomingMessage, res: ServerResponse) => void;

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new Error('too large');
    chunks.push(chunk as Buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function postResult(req: IncomingMessage, res: ServerResponse, results: ResultStore) {
  const body = await readJson(req).catch(() => undefined);
  const record = parseGameRecord(body);
  if (!record) return sendJson(res, 400, { ok: false, error: '잘못된 대국 기록입니다' });
  results.add(record);
  sendJson(res, 201, { ok: true });
}

/** /api/* 요청을 처리하고, 나머지는 fallback(정적 파일)으로 넘긴다 */
export function createApiHandler(results: ResultStore, fallback: HttpHandler): HttpHandler {
  return (req, res) => {
    const path = (req.url ?? '/').split('?')[0];
    if (!path.startsWith('/api/')) return fallback(req, res);

    if (path === '/api/results' && req.method === 'POST') {
      void postResult(req, res, results);
      return;
    }
    sendJson(res, 404, { ok: false, error: '없는 API입니다' });
  };
}
