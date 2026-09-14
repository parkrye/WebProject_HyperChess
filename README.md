# HyperChess

초능력을 하나 골라 사용하는 2D 체스 게임. 웹/모바일 브라우저에서 동작한다.

- 기획: [.docs/request.md](.docs/request.md)
- 상세 규칙·밸런싱: [.docs/rules.md](.docs/rules.md)

## 구조

| 패키지 | 내용 |
|---|---|
| `packages/engine` | 순수 TS 룰 엔진 (체스 규칙, 능력, 자원). UI/네트워크 의존 없음 |
| `packages/ai` | 알파-베타 탐색 AI (능력 사용 포함, 난이도 3단계). 클라이언트 Web Worker에서 실행 |
| `packages/protocol` | 클라이언트↔서버 Socket.IO 이벤트 타입 |
| `packages/server` | 방 관리와 수 검증을 하는 권위 서버. 빌드된 클라이언트도 함께 제공 |
| `packages/client` | React + Vite 클라이언트 (로컬 2인, AI 대전, 온라인) |

## 실행

Node 22 이상 필요.

```bash
npm install

# 서버 실행 (클라이언트 빌드 후 3000 포트로 게임 + 멀티플레이 제공)
npm run server
```

서버가 켜져 있는 동안 콘솔에 표시되는 주소로 접속한다.

- 같은 PC: `http://localhost:3000`
- 같은 Wi-Fi의 다른 기기: `http://<네트워크 주소>:3000` (Windows 방화벽에서 Node 허용 필요)
- 외부 인터넷: 공유기 포트포워딩 또는 `cloudflared tunnel --url http://localhost:3000` 같은 터널 사용

포트 변경: `PORT=4000 npm run server`

## 개발

```bash
npm run dev:server   # 게임 서버 (파일 변경 시 재시작)
npm run dev:client   # Vite 개발 서버 (5173, /socket.io는 3000으로 프록시)
npm test             # 전체 테스트
npm run typecheck    # 전체 타입 검사
npm run bench -w @hyperchess/engine  # 엔진 속도 측정
```

## 새 능력 추가

1. `packages/engine/src/abilities/`에 `AbilityDefinition` 구현
2. `abilities/balance.ts`에 수치 추가, `abilities/registry.ts`에 등록
3. 클라이언트 `abilityUi/specs.ts`에 대상 선택 단계·색·아이콘, `effects/abilityEffects.ts`에 연출 추가
4. 강화처럼 말 가치가 바뀌는 능력이면 `packages/ai/src/evaluate.ts` 평가값 조정
