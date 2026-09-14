import { createReadStream, existsSync, statSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

/** 빌드된 클라이언트(SPA)를 제공하는 정적 파일 핸들러 */
export function createStaticHandler(rootDir: string) {
  const root = resolve(rootDir);
  const indexPath = join(root, 'index.html');

  return (req: IncomingMessage, res: ServerResponse) => {
    if (!existsSync(indexPath)) {
      res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('클라이언트 빌드가 없습니다. 루트에서 `npm run build`를 먼저 실행하세요.');
      return;
    }

    const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
    const candidate = normalize(join(root, pathname));
    const insideRoot = candidate === root || candidate.startsWith(root + sep);
    const isFile = insideRoot && existsSync(candidate) && statSync(candidate).isFile();
    const filePath = isFile ? candidate : indexPath;

    const headers: Record<string, string> = { 'Content-Type': MIME[extname(filePath)] ?? 'application/octet-stream' };
    if (filePath.includes(`${sep}assets${sep}`)) headers['Cache-Control'] = 'public, max-age=31536000, immutable';
    res.writeHead(200, headers);
    createReadStream(filePath).pipe(res);
  };
}
