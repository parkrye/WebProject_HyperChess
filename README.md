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
npm run server   # 또는 루트의 server.bat 더블클릭
```

서버가 켜져 있는 동안 콘솔에 표시되는 주소로 접속한다.

- 같은 PC: `http://localhost:3000`
- 같은 Wi-Fi의 다른 기기: `http://<네트워크 주소>:3000` (Windows 방화벽에서 Node 허용 필요)
- 외부 인터넷: 공유기 포트포워딩 또는 `cloudflared tunnel --url http://localhost:3000` 같은 터널 사용

포트 변경: `PORT=4000 npm run server`

대국 기록(AI 내전·AI 대전·로컬 2인·온라인)은 `packages/server/data/results.jsonl`에 쌓이고 통계 탭에서 집계된다. 저장 위치 변경: `HYPERCHESS_DATA=경로`

처음 접속하면 **게스트** 또는 **계정(닉네임+비밀번호)**으로 시작한다. 계정은 `data/users.json`에 저장되고(비밀번호는 scrypt 해시), 계정으로 둔 온라인 대국만 레이팅(Elo, 시작 1000, 게스트 상대는 1000 고정)과 랭킹 탭에 반영된다. 비밀번호 재설정 기능은 없으므로 필요하면 서버를 끈 뒤 `users.json`에서 해당 유저를 지운다.

## 모바일 앱처럼 설치 (PWA)

빌드된 클라이언트는 설치형 웹 앱(PWA)이다. 설치하면 전체 화면으로 실행되고, 한 번 접속한 뒤에는 **로컬 2인·AI 대전을 오프라인에서도** 할 수 있다(온라인 대전은 서버 연결 필요).

- Android Chrome / 데스크톱 Chrome·Edge: 설정 화면의 **"앱으로 설치"** 버튼 또는 브라우저 메뉴의 "앱 설치"
- iOS Safari: 공유 버튼 → **"홈 화면에 추가"**

설치·오프라인 기능(서비스 워커)은 브라우저 정책상 **HTTPS 또는 localhost**에서만 동작한다.

- 같은 PC의 `http://localhost:3000`: 동작
- 휴대폰에서 `http://192.168.x.x:3000`: 게임은 되지만 설치·오프라인 기능은 비활성 (iOS "홈 화면에 추가"는 가능)
- 휴대폰에 설치하려면 HTTPS 주소가 필요하다. 예: `cloudflared tunnel --url http://localhost:3000` 이 출력하는 https 주소로 접속

업데이트: 서버에 새 빌드를 올리면 다음 접속 때 새 서비스 워커가 설치되고, 앱을 한 번 다시 열면 반영된다.

## 개발

```bash
npm run dev:server   # 게임 서버 (파일 변경 시 재시작)
npm run dev:client   # Vite 개발 서버 (5173, /socket.io·/api는 3000으로 프록시)
npm test             # 전체 테스트
npm run typecheck    # 전체 타입 검사
npm run bench -w @hyperchess/engine  # 엔진 속도 측정
```

## 밸런스 측정 (AI 자가 대국)

루트의 **`balance.bat`을 더블클릭**하면 대화형으로 설정을 묻는다.

1. 측정 방식
   - **지정 상대와 대결**: 각 능력이 한 상대(기본: 능력 없음)와 n판. 상대끼리 둔 "대조군" 행으로 선공 이점을 확인
   - **리그전**: 선택한 능력들이 서로 모든 조합으로 n판씩. 능력별 종합 점수율과 상대별 점수율 매트릭스 출력 ("능력 없음" 참가 선택 가능)
2. 측정할 능력 번호 (쉼표 구분, 엔터 = 전체). **시간 역행은 밸런스 예외 항목**이라 전체에서 빠진다(번호로 직접 지정하면 측정 가능)
3. 상대 능력(지정 상대 방식) 또는 "능력 없음" 참가 여부(리그전)
   - 리그전은 **새로 대국할 능력만 지정**할 수 있다. 지정한 능력이 낀 대진만 새로 두고, 나머지 대진은 가장 최근 리그전 결과를 가져와 합산한다 (수치를 몇 개만 바꿨을 때 시간 단축)
4. 조합(대진)당 대국 수 (기본 16 / 리그전 8, 백/흑 번갈아)
5. AI 탐색 깊이 (기본 2, 3 이상은 매우 느림)
6. CPU 사용량 % (기본 50) — 측정은 항상 낮은 우선순위로 실행되어 다른 작업을 방해하지 않는다

진행률과 남은 시간이 표시되고(측정 중 `reports/progress.txt`에도 진행률과 중간 순위가 계속 갱신됨), 끝나면 결과가 `reports/balance-방식-날짜-시각.md`(원본 데이터는 `.json`)로 저장된다.
소요 시간은 깊이 2 기준 판당 CPU 약 30초다. 예) 전체 11개 능력 리그전 · 대진당 8판 = 440판 → CPU 50%(16스레드 PC에서 워커 8개) 약 28분, 100% 약 14분.

명령줄로도 실행할 수 있다.

```bash
npm run balance -- --mode opponent --abilities paladin,heir --opponent none --games 24 --yes
npm run balance -- --mode league --games 8 --include-none --cpu 75 --yes
npm run balance -- --mode league --include-none --focus paladin,heavyInfantry --base latest --yes
```

측정 결과를 게임의 **통계** 탭에 반영하려면 `npm run import-reports`를 실행한 뒤 서버를 다시 켠다. `reports/*.json`을 `packages/server/data/simulation.jsonl`로 변환한다(매번 새로 만들어 중복 없음, 부분 재측정은 새로 둔 대진만 반영).

결과 해석 시 주의: 판 수가 적으면 오차가 크고(95% 신뢰구간 기준 24판 ≈ ±20%p, 96판 ≈ ±10%p), AI가 능력을 쓰는 실력이 결과에 섞여 있다.

AI 버전 비교(개발용): 이전 버전 `search.ts`, `evaluate.ts`를 `packages/ai/tools/baseline/`에 복사한 뒤
`npx tsx packages/ai/tools/versus.ts --games 40 --ms 500`

## 아트·BGM 에셋

AI로 생성한 원본(`.docs/art-prompts.md` 프롬프트)을 게임용으로 가공해 `packages/client/public/assets/`에 넣는다.

```bash
# 원본 폴더 구조: <src>/sprites/*.png, <src>/bgms/*.mp3 (파일명은 art-prompts.md의 시트 이름)
npm run import-assets -w @hyperchess/client -- --src "C:/Users/me/Downloads"
```

- 그리드 시트를 셀별로 잘라 같은 배율로 맞추고, 배경 제거 흔적(반투명 후광·노이즈 조각)을 정리한다.
- 보드 테두리는 안쪽 구멍 비율을 측정해 `board/frame.json`에 저장한다 (값이 바뀌면 `styles/art.css`의 테두리 위치도 맞춘다).
- BGM은 용량이 커서 PWA 미리 캐시에서 제외되고, 재생할 때 스트리밍된다.

## 새 능력 추가

1. `packages/engine/src/abilities/`에 `AbilityDefinition` 구현
2. `abilities/balance.ts`에 수치 추가, `abilities/registry.ts`에 등록
3. 클라이언트 `abilityUi/specs.ts`에 대상 선택 단계·색·아이콘, `effects/abilityEffects.ts`에 연출 추가
4. 강화처럼 말 가치가 바뀌는 능력이면 `packages/ai/src/evaluate.ts` 평가값 조정
