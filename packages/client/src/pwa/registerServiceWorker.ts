/** 프로덕션 빌드에서만 서비스 워커를 등록한다 (HTTPS 또는 localhost에서만 동작) */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error) => console.warn('[pwa] 서비스 워커 등록 실패', error));
  });
}
