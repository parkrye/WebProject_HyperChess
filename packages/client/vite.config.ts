import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

const SERVER_URL = process.env.HYPERCHESS_SERVER ?? 'http://localhost:3000';
const PUBLIC_DIR = 'public';

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? listFiles(path) : [path];
  });
}

/**
 * 빌드 결과물 전체를 미리 캐시하는 서비스 워커(dist/sw.js)를 생성한다.
 * 에셋 목록이 바뀌면 캐시 버전도 바뀌어 이전 캐시가 정리된다.
 */
function serviceWorker(): Plugin {
  return {
    name: 'hyperchess-service-worker',
    apply: 'build',
    generateBundle(_, bundle) {
      const built = Object.keys(bundle).filter((file) => !file.endsWith('.map'));
      // BGM은 용량이 커서(수십 MB) 미리 캐시하지 않고 재생할 때 네트워크로 받는다
      const publicFiles = listFiles(PUBLIC_DIR)
        .map((path) => relative(PUBLIC_DIR, path).split(sep).join('/'))
        .filter((file) => !file.endsWith('.mp3'));
      const precache = ['/', ...new Set([...built, ...publicFiles])].map((file) => (file === '/' ? file : `/${file}`));
      const version = createHash('sha256').update(precache.join('\n')).digest('hex').slice(0, 12);

      const source = readFileSync('src/pwa/sw-template.js', 'utf8')
        .replace('__VERSION__', version)
        .replace('__PRECACHE__', JSON.stringify(precache, null, 2));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

export default defineConfig({
  plugins: [react(), serviceWorker()],
  server: {
    port: 5173,
    // 개발 중에는 게임 서버(Socket.IO)로 프록시
    proxy: { '/socket.io': { target: SERVER_URL, ws: true } },
  },
});
