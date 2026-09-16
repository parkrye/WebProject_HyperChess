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
| `packages/client` | React + Vite 클라이언트 (타이틀 → 메인 → 싱글·멀티·랭킹·통계) |

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

대국 기록(AI 내전·AI 대전·로컬 플레이·멀티)은 `packages/server/data/results.jsonl`에 쌓이고 통계에서 집계된다. 각 기록에는 시작 국면부터의 행동 수순(`actions`)이 함께 저장되어, 엔진으로 재생하면 모든 국면을 복원할 수 있다(AI 학습 데이터용, 서버가 재생 검증 후 저장). 저장 위치 변경: `HYPERCHESS_DATA=경로`

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
2. 측정할 능력 번호 (쉼표 구분, 엔터 = 시간 역행 포함 전체)
3. 상대 능력(지정 상대 방식) 또는 "능력 없음" 참가 여부(리그전)
   - 리그전은 **새로 대국할 능력만 지정**할 수 있다. 지정한 능력이 낀 대진만 새로 두고, 나머지 대진은 가장 최근 리그전 결과를 가져와 합산한다 (수치를 몇 개만 바꿨을 때 시간 단축)
4. 조합(대진)당 대국 수 (백/흑 번갈아). **엔터 = 끝없이 반복**: 대진마다 백/흑 한 판씩을 라운드로 계속 두고(라운드마다 시드가 달라 같은 대국 없음), 보고서 하나를 1분·라운드마다 덮어써 저장한다. Ctrl+C나 창 닫기로 끝내면 그때까지의 결과를 저장한다
5. AI 탐색 깊이 (기본 2, 3 이상은 매우 느림)
6. CPU 사용량 % (기본 50) — 측정은 항상 낮은 우선순위로 실행되어 다른 작업을 방해하지 않는다

진행률과 남은 시간이 표시되고(측정 중 `reports/progress.txt`에도 진행률과 중간 순위가 계속 갱신됨), 끝나면 결과가 `reports/balance-방식-날짜-시각.md`(원본 데이터는 `.json`)로 저장된다.
소요 시간은 깊이 2 기준 판당 CPU 약 30초다. 예) 전체 11개 능력 리그전 · 대진당 8판 = 440판 → CPU 50%(16스레드 PC에서 워커 8개) 약 28분, 100% 약 14분.

명령줄로도 실행할 수 있다.

```bash
npm run balance -- --mode opponent --abilities paladin,heir --opponent none --games 24 --yes
npm run balance -- --mode league --games 8 --include-none --cpu 75 --yes
npm run balance -- --mode league --include-none --focus paladin,heavyInfantry --base latest --yes
npm run balance -- --mode league --yes   # --games 생략 = 끝없이 반복
```

측정 결과를 게임의 **통계** 탭에 반영하려면 `npm run import-reports`를 실행한 뒤 서버를 다시 켠다. `reports/*.json`을 `packages/server/data/simulation.jsonl`로 변환한다(매번 새로 만들어 중복 없음, 부분 재측정은 새로 둔 대진만 반영).

결과 해석 시 주의: 판 수가 적으면 오차가 크고(95% 신뢰구간 기준 24판 ≈ ±20%p, 96판 ≈ ±10%p), AI가 능력을 쓰는 실력이 결과에 섞여 있다.

AI 버전 비교(개발용): 이전 버전 `search.ts`, `evaluate.ts`를 `packages/ai/tools/baseline/`에 복사한 뒤
`npx tsx packages/ai/tools/versus.ts --games 40 --ms 500`

**능력을 하나만 지정하면 양쪽이 같은 능력인 동족전이 되고, 이때가 AI 실력 차이를 재는 유일하게 정확한 방법이다.** 양쪽 능력이 다르면 능력 상성이 결과를 지배해, 색을 바꿔 두 판을 둬도 1승 1패로 끝나며 실력 차가 묻힌다(같은 변경분이 16종 무작위 대진 51%, 단일 능력 동족전 90%로 나온 적이 있다). 여러 능력을 주는 것은 **밸런스(상성) 측정용**이지 AI 실력 비교용이 아니다.

`--abilities telekinesis,revive`로 대진에 쓸 능력을 좁힐 수 있다. 일부 능력만 건드렸을 때 전체 16종으로 재면 그 능력이 걸리는 대국만 효과를 받아 신호가 희석되므로, 바뀐 능력으로만 재고 **나머지 능력을 대조군으로 함께 재는 것**이 좋다. 대조군이 50%여야 이득이 그 능력에서 나온 것이 확인된다. 평가 가중치만 비교하려면 `baseline/`에 `features.ts`·`weights.ts`까지 함께 복사해 코드를 같게 맞춘다.

## AI 평가 가중치 튜닝 (Texel)

AI 평가 함수는 `항목값 × 가중치`의 합이다(`packages/ai/src/features.ts`). 진영마다 항목값을 따로 뽑고, 각 진영은 **공통 가중치(`WEIGHTS`) + 자기 능력의 보정값(`ABILITY_WEIGHTS`)**을 곱한다(`src/weights.ts`). 수순이 저장된 대국 기록으로 둘을 함께 학습할 수 있다.

능력 가치를 다루는 항목은 다음과 같다.

- `resource.<능력>.<k>` — 자원 게이지를 **충전 칸마다 따로** 둔 항목. 칸값의 합이 곧 자원량이라 모든 칸에 같은 가중치를 주면 `자원 × 상수`와 같고, 칸마다 다른 값을 배우면 **충전 한 칸의 한계 가치**(= 지금 한 발 써도 되는지, 더 모아야 하는지)를 표현한다.
- `cooldownLeft`·`resourceFull`·`resourceUsable` — 쿨다운 잔여 비율, 자원 포화(더 안 쓰면 회복분이 버려진다), 지금 쓸 수 있는지. 능력 역학을 나타내는 항목이다.
- **능력 고유 항목**(`src/abilityFeatures.ts`) — 게이지만 봐서는 "지금 이 능력을 쓰면 무엇이 되는가"를 알 수 없어, 능력마다 판을 읽어 그 답을 내는 항목이다. 그 능력을 가진 진영에서만 0이 아니므로 공통 가중치만 쓴다.

| 항목 | 의미 |
|---|---|
| `revive.best` · `revive.pending` | 지금 자원으로 되살릴 수 있는 최고 기물 가치 · 자원을 더 모으면 되살릴 수 있는 최고 가치 |
| `brainwash.best` · `brainwash.targets` | 갇힌 적 말 중 지금 뺏을 수 있는 최고 가치 · 갇힌 적 말 수 |
| `telekinesis.target` | 밀어낼 수 있는(노출됐고 인접 빈칸이 있는) 적 말 중 최고 가치 |
| `teleport.swap` | 자기 말 두 개를 맞바꿔 얻는 최대 위치 이득 |

항목값은 **고정 기물 가치(폰 = 1)**로 매긴다. 학습되는 가중치를 쓰면 항목값이 가중치에 의존해 선형 모델이 깨진다. 평가는 탐색 노드마다 불리므로 인접 칸 판정은 배열을 만들지 않는 자체 구현을 쓰고, 엔진 함수와 결과가 같다는 것을 `test/abilityFeatures.test.ts`가 고정한다. 능력별 평가 처리량은 `npx tsx packages/ai/tools/bench-eval.ts`로 잰다.

능력별 보정(`ABILITY_WEIGHTS`)은 위 역학 항목 3개에만 학습한다(`ABILITY_DELTA_KEYS`). 기물 가치나 중앙성 같은 일반 체스 항목은 능력과 무관해 공통 가중치만 쓰며, 보정을 전 항목에 두면 파라미터가 데이터에 비해 너무 많아져 벌점에 눌려 아무것도 학습되지 않는다. 보정에는 0으로 끌어당기는 벌점(`--ability-l2`)이 있어 데이터가 적은 능력은 공통 가중치를 따른다.

### 능력별 학습 루프 (권장)

루트의 **`learn.bat`을 더블클릭**하면 아래 사이클을 멈출 때까지 반복한다.

1. 16종 리그전(대진 120개 × 2판 = 240판)을 새 시드로 둔다. 리그전이라 모든 능력이 같은 판 수만큼 쌓인다
2. 보고서를 대국 기록으로 가져온다
3. 현재 밸런스 버전 이상의 기록이 1500판 이상 모이면 학습하고, **검증 오차가 줄었을 때만** `weights.ts`에 적용한다 (그 전까지는 수집만). 적용된 가중치는 다음 사이클 대국에 바로 쓰인다
4. `reports/learn-log.md`에 사이클 결과(대국 수·검증 오차·적용 여부·튜닝 보고서)를 남긴다

```bash
npm run learn -w @hyperchess/ai -- --games 2 --cycles 10 --cpu 50   # 옵션: --depth, --min-version, --min-games, --epochs, --ability-l2
```

> **검증 오차 감소는 기력 향상을 뜻하지 않는다.** 텍셀 튜닝의 목적함수는 "기록된 대국의 승패를 맞히는 것"이지 "잘 두는 것"이 아니라, 둘은 갈라진다. 실제로 검증 오차가 0.12682 → 0.12659로 줄어 자동 적용된 가중치가 동족전에서 telekinesis 42%·heir 36%로 전반 회귀한 적이 있다(2026-09-16). 그 튜닝에서 항목이 바뀌지 않은 능력도 같이 회귀해, 공통 가중치가 나쁜 방향으로 옮겨진 것이 대조군으로 확인됐다.
>
> 따라서 **`learn` 루프가 자동 적용한 가중치도 검증 없이는 개선이라고 볼 수 없다.** 커밋하기 전에 반드시 아래 동족전 비교로 확인한다.

학습이 충분히 진행되면 동족전 비교로 기력을 확인한 뒤 `weights.ts`를 커밋하고 밸런스를 다시 측정한다.

### 수동 튜닝

1. 밸런스 측정(`balance.bat`)이나 AI 내전으로 기록을 모은다. 권장 2만~5만 판 (예: 리그전 대진당 400판)
2. 루트의 **`tune.bat`을 더블클릭**한다. 측정 보고서를 기록으로 가져온 뒤, 기록을 재생해 조용한 국면(체크·직전 잡기 제외)을 뽑고 결과 예측 오차가 줄도록 학습한다
3. `reports/tune-날짜-시각.md`에 기존/튜닝 가중치와 검증 오차가 저장되고, 검증 오차가 줄었을 때만 적용 여부를 묻는다

```bash
npm run tune -- --per-game 16 --epochs 800 --yes   # 보고서만
npm run tune -- --apply                             # 바로 적용
npm run tune -- --abilities wall,snipe --freeze-base # 공통 가중치는 고정하고 두 능력의 보정만 학습
npm run tune -- --min-version 18                    # 규칙이 바뀐 옛 기록 제외
```

적용하면 AI 강도가 바뀌므로 밸런스를 다시 측정한다. 되돌리려면 `git checkout packages/ai/src/weights.ts`.

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
