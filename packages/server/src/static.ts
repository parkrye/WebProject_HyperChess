import { createReadStream, existsSync, statSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { basename, dirname, extname, join, normalize, resolve, sep } from 'node:path';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.mp3': 'audio/mpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

/** 서비스 워커·앱 셸은 항상 최신 버전을 확인해야 업데이트가 반영된다 */
const NO_CACHE_FILES = new Set(['sw.js', 'index.html', 'manifest.webmanifest']);

/** 빌드된 클라이언트(SPA)를 제공하는 정적 파일 핸들러 */
export function createStaticHandler(rootDir: string) {
  const root = resolve(rootDir);
  const indexPath = join(root, 'index.html');
  const assetsDir = join(root, 'assets');

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

    const headers: Record<string, string> = { 'Content-Type': MIME[extname(filePath)] ?? 'application/octet-stream', 'Accept-Ranges': 'bytes' };
    if (dirname(filePath) === assetsDir) {
      // vite 빌드 결과(파일명에 해시 포함)
      headers['Cache-Control'] = 'public, max-age=31536000, immutable';
    } else if (filePath.startsWith(assetsDir + sep)) {
      // 아트·BGM 에셋 (파일명에 해시 없음)
      headers['Cache-Control'] = 'public, max-age=86400';
    } else if (NO_CACHE_FILES.has(basename(filePath))) {
      headers['Cache-Control'] = 'no-cache';
    }

    // 오디오 반복·탐색을 위한 부분 요청 (Range: bytes=start-end)
    const size = statSync(filePath).size;
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
    if (range && (range[1] || range[2])) {
      const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
      const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
      if (start >= size || start > end) {
        res.writeHead(416, { 'Content-Range': `bytes */${size}` });
        res.end();
        return;
      }
      res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1) });
      createReadStream(filePath, { start, end }).pipe(res);
      return;
    }

    res.writeHead(200, { ...headers, 'Content-Length': String(size) });
    createReadStream(filePath).pipe(res);
  };
}
