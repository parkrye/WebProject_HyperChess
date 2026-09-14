/* HyperChess 서비스 워커 템플릿 — 빌드 시 vite 플러그인이 캐시 버전과 미리 캐시할 파일 목록을 채워 dist/sw.js 로 출력한다 */
const CACHE = 'hyperchess-__VERSION__';
const PRECACHE = __PRECACHE__;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('hyperchess-') && key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  // 멀티플레이 통신과 외부 요청은 캐시하지 않는다
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/socket.io')) return;

  // 페이지 이동: 네트워크 우선, 오프라인이면 캐시된 앱 셸
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put('/index.html', copy));
          return response;
        })
        .catch(() => caches.match('/index.html')),
    );
    return;
  }

  // 해시가 붙은 빌드 에셋과 아이콘: 캐시 우선
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ??
        fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        }),
    ),
  );
});
