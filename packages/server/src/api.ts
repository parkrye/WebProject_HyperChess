import type { ResultSource } from '@hyperchess/protocol';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { parseGameRecord, type ResultStore } from './results';
import { computeStats, summarizeCategories } from './stats';
import { UserError, type UserStore } from './users';

const MAX_BODY_BYTES = 8 * 1024;
/** 대국 기록은 수순을 담아 크다 */
const MAX_RECORD_BYTES = 512 * 1024;
const RANKING_LIMIT = 100;

export type HttpHandler = (req: IncomingMessage, res: ServerResponse) => void;

export interface ApiDeps {
  readonly results: ResultStore;
  readonly users: UserStore;
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage, maxBytes = MAX_BODY_BYTES): Promise<Record<string, unknown>> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > maxBytes) throw new HttpError(413, '요청이 너무 큽니다');
    chunks.push(chunk as Buffer);
  }
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
    if (typeof body !== 'object' || body === null) throw new Error('not object');
    return body as Record<string, unknown>;
  } catch {
    throw new HttpError(400, '잘못된 요청입니다');
  }
}

const bearerToken = (req: IncomingMessage) => /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1] ?? '';

type Route = (req: IncomingMessage, url: URL, deps: ApiDeps) => Promise<[status: number, body: unknown]>;

const ROUTES: Readonly<Record<string, Route>> = {
  'POST /api/results': async (req, _url, { results }) => {
    const record = parseGameRecord(await readJson(req, MAX_RECORD_BYTES));
    if (!record) throw new HttpError(400, '잘못된 대국 기록입니다');
    results.add(record);
    return [201, { ok: true }];
  },

  'GET /api/stats': async (_req, url, { results }) => {
    const sources = (url.searchParams.get('source') ?? '').split(',').filter(Boolean) as ResultSource[];
    const version = Number(url.searchParams.get('version'));
    return [200, computeStats(results.all(), { sources, version: Number.isInteger(version) && version > 0 ? version : undefined })];
  },

  'GET /api/stats/summary': async (_req, _url, { results }) => [200, summarizeCategories(results.all())],

  'POST /api/auth/register': async (req, _url, { users }) => {
    const body = await readJson(req);
    return [201, await users.register(body.nickname, body.password)];
  },

  'POST /api/auth/login': async (req, _url, { users }) => {
    const body = await readJson(req);
    return [200, await users.login(body.nickname, body.password)];
  },

  'POST /api/auth/logout': async (req, _url, { users }) => {
    users.logout(bearerToken(req));
    return [200, { ok: true }];
  },

  'GET /api/auth/me': async (req, _url, { users }) => {
    const user = users.authenticate(bearerToken(req));
    if (!user) throw new HttpError(401, '로그인이 필요합니다');
    return [200, user];
  },

  'GET /api/ranking': async (_req, _url, { users }) => [200, users.ranking(RANKING_LIMIT)],
};

/** /api/* 요청을 처리하고, 나머지는 fallback(정적 파일)으로 넘긴다 */
export function createApiHandler(deps: ApiDeps, fallback: HttpHandler): HttpHandler {
  return (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (!url.pathname.startsWith('/api/')) return fallback(req, res);

    const route = ROUTES[`${req.method} ${url.pathname}`];
    if (!route) return sendJson(res, 404, { ok: false, error: '없는 API입니다' });

    route(req, url, deps)
      .then(([status, body]) => sendJson(res, status, body))
      .catch((error: unknown) => {
        if (error instanceof HttpError || error instanceof UserError) {
          sendJson(res, error.status, { ok: false, error: error.message });
          return;
        }
        console.error('[api]', error);
        sendJson(res, 500, { ok: false, error: '서버 오류가 발생했습니다' });
      });
  };
}
