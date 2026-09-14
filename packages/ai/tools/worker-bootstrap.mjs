// 워커 스레드에서 TypeScript 소스를 실행하기 위한 부트스트랩 (workerData.entry: 실행할 .ts 파일 URL)
import { register } from 'tsx/esm/api';
import { workerData } from 'node:worker_threads';

register();
await import(workerData.entry);
